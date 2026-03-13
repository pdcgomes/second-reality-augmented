# Layer 1 — The Scene Graph

**Source:** `src/effects/u2e/u2engine.js` (lines 86–171), `src/effects/u2e/data.js`
**Concepts:** Binary chunk parsing, indexed object tables, scene hierarchy, object culling

---

## What This Layer Covers

Before any 3D maths or GPU rendering, we need to understand what the scene
contains and how it is structured. The U2E city is built from **42 polygon
objects** — buildings, trees, tunnels, roads, and a spaceship — loaded from
binary data files in the original Future Crew format.

This layer explains:

- How the binary object format stores vertices, normals, and polygons
- How a scene file ties 42 objects together with palette data
- How objects are indexed, toggled on/off, and positioned in the world

---

## The Data Files

Three base64-encoded data blobs provide everything the engine needs:

```
┌─────────────────────────────────────────────────────────┐
│ U2E_00M_base64          "Scene file"                    │
│   bytes 16..783  → 768-byte VGA palette (256 × RGB)     │
│   byte  4..5     → offset to object table               │
│   object table   → list of object indices (1..42)       │
├─────────────────────────────────────────────────────────┤
│ U2E_DataFiles[0..41]    "Object files" (42 entries)     │
│   each entry     → binary 3D object with VERT, NORM,   │
│                    POLY, ORD0/ORDE chunks               │
├─────────────────────────────────────────────────────────┤
│ U2E_0AB_base64          "Animation bytecode"            │
│   sequential     → frame-by-frame animation commands    │
│                    (visibility, translation, rotation)   │
└─────────────────────────────────────────────────────────┘
```

The scene file acts as a manifest: it declares which objects exist in the scene
and provides the colour palette. Each object is a self-contained 3D model. The
animation bytecode orchestrates them over time.

---

## Binary Object Format

Each object file uses a **chunk-based format** — sequential blocks of data
identified by a 4-character tag and a 32-bit length. This is the same design
pattern as IFF, RIFF (WAV), and PNG files.

```
┌─────────┬────────────┐
│ "NAME"  │ length     │  → ASCII object name (e.g., "bs01", "_f01")
├─────────┼────────────┤
│ "VERT"  │ length     │  → Vertex positions + normal indices
├─────────┼────────────┤
│ "NORM"  │ length     │  → Normal vectors
├─────────┼────────────┤
│ "POLY"  │ length     │  → Polygon definitions
├─────────┼────────────┤
│ "ORD0"  │ length     │  → Polygon draw order list (orientation 0)
├─────────┼────────────┤
│ "ORDE"  │ length     │  → Additional draw order lists
└─────────┴────────────┘
```

### Vertices (VERT chunk)

Each vertex is 16 bytes:

```javascript
{
  x: s32(raw, d)     / 16384,   // 32-bit signed, fixed-point → float
  y: s32(raw, d + 4) / 16384,
  z: s32(raw, d + 8) / 16384,
  NormalIndex: s16(raw, d + 12), // index into the NORM array
}
```

The **fixed-point division by 16384** (2^14) converts the original 16.14 format
to floating point. This is a common pattern in 1990s 3D engines — integer
arithmetic was much faster than floating point on 386/486 CPUs.

### Normals (NORM chunk)

Each normal is 8 bytes (3 × 16-bit signed + 2 bytes padding):

```javascript
{
  x: s16(raw, d)     / 16384,
  y: s16(raw, d + 2) / 16384,
  z: s16(raw, d + 4) / 16384,
}
```

Two counts are stored: `nnum` (total normals, including per-vertex) and
`nnum1` (face normals only). Gouraud-shaded polygons use per-vertex normals
for smooth lighting; flat-shaded polygons use only the face normal.

### Polygons (POLY chunk)

Each polygon entry contains:

```
┌───────────────────────────────────────────────────┐
│ sides (1 byte)     — vertex count (3, 4, 5, ...)  │
│ flags (1 byte)     — shading mode bits             │
│ color (1 byte)     — base palette index            │
│ padding (1 byte)                                   │
│ NormalIndex (2 bytes) — face normal reference       │
│ vertex[0..sides-1] (2 bytes each) — vertex indices │
└───────────────────────────────────────────────────┘
```

The **flags** byte encodes material properties through bit fields:

| Bit pattern | Constant | Meaning |
|-------------|----------|---------|
| `0x1000` | `F_GOURAUD` | Smooth (Gouraud) shading vs flat |
| `0x0C00` | `F_SHADE32` | Shade division: controls palette ramp width |
| `0x0200` | `F_2SIDE` | Double-sided polygon (no backface culling) |
| `0x0001` | `F_VISIBLE` | Object is renderable |

---

## Polygon Draw Order Lists (ORD0/ORDE)

A critical optimisation: each object stores **multiple pre-computed polygon
draw order lists**. Each list is optimal for a specific camera orientation.

```
Object "building_01":
  pl[0] = [ orientVertex, poly3, poly7, poly1, ... ]  ← front-facing
  pl[1] = [ orientVertex, poly7, poly3, poly5, ... ]  ← rear-facing
  pl[2] = [ orientVertex, poly1, poly5, poly3, ... ]  ← side view
```

At render time, the engine checks which **orientation vertex** has the smallest
Z (nearest to camera) and selects that list. This avoids sorting polygons
within each object every frame — the correct order was pre-computed by the
original artists/tools.

```javascript
let orderIdxMin = 1;
let minZ = obj.v[obj.pl[1][0]].z;
for (let oi = 2; oi < obj.pl.length; oi++) {
  const z = obj.v[obj.pl[oi][0]].z;
  if (z < minZ) { minZ = z; orderIdxMin = oi; }
}
draw_polylist(obj.pl[orderIdxMin], ...);
```

---

## Scene Assembly

The `loadData()` function ties everything together:

```javascript
function loadData(sceneB64, objectB64Array, animB64) {
  const scene0 = b64ToUint8(sceneB64);        // scene manifest
  const objectRawData = objectB64Array.map(    // 42 object files
    b => b64ToUint8(b)
  );
  SceneAnimData = b64ToUint8(animB64);         // animation bytecode

  // Read object table from scene manifest
  let ip = u16(scene0, 4);
  const conum = u16(scene0, ip);               // total object count
  for (let c = 1; c < conum; c++) {
    const e = u16(scene0, ip);                 // index into objectRawData
    co[c] = {};
    co[c].o = vis_loadobject(objectRawData[e - 1]);
    co[c].on = 0;                              // initially invisible
  }

  // Object 0 is the camera (special case)
  co[0] = { o: { r0: new Array(12).fill(0) } };
  camera = co[0].o;
  cam = co[0].o.r0;
}
```

Key points:

- **Object 0** is always the camera — it has a position/rotation matrix but
  no geometry. The animation bytecode moves object 0 to move the viewpoint.
- **Objects 1..N** are the city geometry. Each starts with `on = 0`
  (invisible); the animation bytecode toggles visibility as the camera flies
  through the scene.
- Object names encode their type: `_f` = floor, `s01` = spaceship,
  `b` = building, `t` = tree, etc.

---

## Object Naming Conventions

The original artists used a naming scheme that the engine leverages for
special-case behaviour:

| Name pattern | Type | Special handling |
|-------------|------|-----------------|
| `_f*` | Floor/ground | Always drawn first (dist = 1 billion) |
| `*s01*` | Spaceship | Forced last in frames 900–1100; exhaust glow in remastered |
| `b*` | Building | Standard depth-sorted rendering |
| `t*` | Tree | Standard rendering |
| `r*` | Road | Standard rendering |

```javascript
if (o.name && o.name[1] === '_') co[a].dist = 1000000000;
```

Floor objects are pushed to infinite distance so the painter's algorithm
draws them first (farthest = earliest in back-to-front order). This ensures
geometry sitting on the floor renders correctly on top of it.

---

## Object Culling

Not all 42 objects are visible at any given time. The animation bytecode
controls visibility with on/off commands:

```javascript
// Animation command byte:
//   0x80 | objectNum → turn object ON
//   0x40 | objectNum → turn object OFF

switch (a & 0xc0) {
  case 0x80: co[onum].on = 1; break;
  case 0x40: co[onum].on = 0; break;
}
```

During rendering, only visible objects are processed:

```javascript
for (let a = 1; a < co.length; a++) {
  if (co[a].on) {
    order.push(a);
    // ... compute distance, add to sort list
  }
}
```

This is the simplest form of **frustum culling** — rather than testing each
object against the camera frustum, the animation data pre-determines which
objects should be visible at each moment. As the camera flies through the
city, distant buildings are turned off and nearby ones are turned on.

---

## The Remastered Difference

In the remastered variant, the scene graph serves a different purpose. Instead
of being consumed by the CPU rasteriser, it is converted to **GPU geometry**
at init time:

```javascript
meshes = [];
for (let c = 1; c < engine.objectCount; c++) {
  const co = engine.getObject(c);
  if (!co || !co.o || !co.o.pd) continue;
  const mesh = extractObjectGeometry(gl, co.o);
  mesh.objIndex = c;
  mesh.isShip = isShipName(co.o.name);
  meshes.push(mesh);
}
```

Each object becomes a WebGL **Vertex Array Object (VAO)** containing:
- Positions (vec3)
- Normals (vec3) — face or vertex, depending on Gouraud flag
- Base palette index (float) — per-face colour
- Shade divisor (float) — per-face material property

The scene graph's visibility (`co.on`) and transform data (`co.o.r0`) are
still read from the engine every frame, but geometry never changes — it was
baked into GPU buffers once during `init()`.

---

**Next:** [Layer 2 — The Polygon Engine](02-polygon-engine.md)
