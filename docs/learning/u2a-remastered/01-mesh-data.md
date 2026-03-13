# Layer 1 — Mesh Data and the Animation Stream

**Source:** `src/effects/u2a/engine.js`, lines 48–130 (object loader), lines 174–221 (animation decoder)
**Concepts:** Chunked binary format, fixed-point arithmetic, delta-compressed animation, 70 fps replay

---

## What This Layer Covers

- How Future Crew's chunked binary format stores 3D ship models
- How **vertices** are encoded as 32-bit fixed-point numbers divided by 16384
- How **normals**, **polygons**, and **draw orders** are packed into named chunks
- How the animation stream encodes camera and object transforms frame-by-frame
- How delta compression keeps the animation data tiny

By the end of this layer you will be able to trace a vertex from its raw bytes
all the way to a floating-point coordinate in JavaScript.

---

## The FC Object Format

Each ship model is stored in FC's proprietary chunked binary format. The loader
walks through the byte array, reading 4-byte chunk names followed by a 4-byte
length:

```
Offset  Bytes  Content
──────  ─────  ───────────────────────────
0       4      Chunk name (ASCII): "VERT", "NORM", "POLY", etc.
4       4      Chunk length (uint32, little-endian)
8       N      Chunk payload (N = length)
```

The engine recognises five chunk types:

| Chunk  | Purpose |
|--------|---------|
| `NAME` | Object name (ASCII string, e.g. "is01", "Sippi", "moottori") |
| `VERT` | Vertex positions + per-vertex normal indices |
| `NORM` | Normal vectors |
| `POLY` | Polygon definitions (faces, materials, flags) |
| `ORD0`/`ORDE` | Pre-computed polygon draw orders |

---

## Vertices: Fixed-Point to Float

Each vertex is 16 bytes:

```
Byte offset   Size   Field
───────────   ────   ────────────────────
0             4      x  (signed 32-bit, fixed-point ÷ 16384)
4             4      y  (signed 32-bit, fixed-point ÷ 16384)
8             4      z  (signed 32-bit, fixed-point ÷ 16384)
12            2      NormalIndex (signed 16-bit)
14            2      (padding)
```

The original x86 code used 32-bit integers with an implicit scale of 16384
(i.e. 14 bits of fractional precision). The JS loader divides by 16384 to
recover the floating-point value:

```javascript
o.v0[i] = {
  x: s32(raw, d)     / 16384,    // engine.js line 77
  y: s32(raw, d + 4) / 16384,    // engine.js line 78
  z: s32(raw, d + 8) / 16384,    // engine.js line 79
  NormalIndex: s16(raw, d + 12),  // engine.js line 80
};
```

**Why fixed-point?** In 1993, floating-point hardware was slow or absent.
Fixed-point arithmetic uses integer instructions (fast on 386/486) to simulate
fractional numbers. The divisor 16384 = 2^14 means multiplication by 16384
is a bit shift — free on any CPU.

---

## Normals: 16-Bit Precision

Normal vectors use 16-bit fixed-point, also divided by 16384:

```
Byte offset   Size   Field
───────────   ────   ─────────────────────
0             2      x  (signed 16-bit ÷ 16384)
2             2      y  (signed 16-bit ÷ 16384)
4             2      z  (signed 16-bit ÷ 16384)
6             2      (padding)
```

```javascript
o.n0[i] = {
  x: s16(raw, d)     / 16384,    // engine.js line 92
  y: s16(raw, d + 2) / 16384,    // engine.js line 93
  z: s16(raw, d + 4) / 16384,    // engine.js line 94
};
```

Normals are unit-length direction vectors used for lighting. 16-bit precision
is sufficient because the dot product with the light direction only needs to
distinguish ~256 shade levels for the palette ramp.

---

## Polygons: Faces and Materials

Each polygon definition begins with a vertex count, followed by flags, a
colour (palette base index), a normal reference, and vertex indices:

```
Byte  Size  Field
────  ────  ───────────────────────────
0     1     sides (vertex count; 0 = end of list)
1     1     flags (shading mode, visibility)
2     1     color (base palette index)
3     1     (padding)
4     2     NormalIndex (face normal)
6     2×N   vertex indices (one per side)
```

```javascript
const sides = raw[d]; d++;           // engine.js line 106
const flags = raw[d]; d++;           // engine.js line 108
const color = raw[d]; d += 2;        // engine.js line 109
const ni = u16(raw, d); d += 2;      // engine.js line 110
```

The **flags** byte controls rendering behaviour:

| Flag        | Hex      | Meaning |
|-------------|----------|---------|
| `F_VISIBLE` | `0x0001` | Polygon is visible |
| `F_2SIDE`   | `0x0200` | Render both front and back faces |
| `F_GOURAUD` | `0x1000` | Use per-vertex Gouraud shading (vs flat) |
| `F_SHADE32` | `0x0C00` | Shade division (8, 16, or 32 palette levels) |

---

## The Three Ship Objects

| Index | Name       | Description              |
|-------|------------|--------------------------|
| 1     | "is01"     | Main spaceship           |
| 2     | "Sippi"    | Second ship              |
| 3     | "moottori" | Engine/motor attachment   |

The scene file (`SCENE_B64`) maps these indices to their binary data. Object 0
is reserved for the camera (no geometry, just a transform matrix).

---

## Pre-Computed Draw Orders (ORD0/ORDE)

Each object stores multiple pre-computed polygon draw orders. These are lists of
polygon indices sorted for correct painter's-algorithm rendering from specific
viewing angles.

At render time, the engine picks the best order by finding the orientation
point closest to the camera:

```javascript
let bestOrd = 1, bestZ = obj.v[obj.pl[1][0]].z;   // engine.js line 575
for (let oi = 2; oi < obj.pl.length; oi++) {
  const z = obj.v[obj.pl[oi][0]].z;
  if (z < bestZ) { bestZ = z; bestOrd = oi; }      // engine.js line 578
}
drawPolylist(obj.pl[bestOrd], ...);                  // engine.js line 580
```

The first element of each order list is a **reference vertex** — its Z depth
after transformation tells the engine which viewpoint this order was designed
for. The order with the smallest Z (closest to camera) wins.

---

## The Animation Stream

The animation is a compact binary stream decoded frame-by-frame. The decoder
reads opcodes in a loop until it encounters a frame boundary:

```
┌─────────────────────────────────────────────────────────┐
│  0xFF + byte ≤ 0x7F  →  Set FOV = byte/256 × 360°      │
│  0xFF + 0xFF         →  Animation end marker             │
│  0xC0 mask           →  Select object by extended number │
│  0x80                →  Show object                      │
│  0x40                →  Hide object                      │
│  0x10/0x20/0x30      →  Translation format (1/2/3 bytes) │
│  0x40 in pf          →  Rotation uses 16-bit deltas      │
│  0x80+ in pf         →  Rotation matrix entry present    │
└─────────────────────────────────────────────────────────┘
```

### Delta Compression

Each frame stores **changes** from the previous frame, not absolute values.
The translation deltas come in variable sizes (1, 2, or 4 bytes) depending on
the magnitude of change:

```javascript
function lsget(f) {
  switch (f & 3) {
    case 0: return 0;                              // no change
    case 1: { const v = s8(animData, animPtr); animPtr++; return v; }     // 1 byte
    case 2: { const v = s16(animData, animPtr); animPtr += 2; return v; } // 2 bytes
    case 3: { const v = s32(animData, animPtr); animPtr += 4; return v; } // 4 bytes
  }
}
```

The **rotation matrix** is stored as 9 entries in a 3×3 grid. A bitmask
indicates which entries have changed; unchanged entries keep their previous
value. Camera (object 0) uses raw coordinates; other objects divide by 128.

```javascript
const factor = onum === 0 ? 1 : 128;    // engine.js line 211
r[9]  += lsget(pf) / factor;            // X translation delta
r[10] += lsget(pf >> 2) / factor;       // Y translation delta
r[11] += lsget(pf >> 4) / factor;       // Z translation delta
```

### Why Delta Compression?

The animation is ~13 seconds × 70 fps = ~910 frames. Storing absolute 3×3
matrices plus translations for 4 objects per frame would be enormous. Delta
compression exploits temporal coherence — transforms change slowly between
adjacent frames, so most deltas are small (1-byte) or zero (0 bytes).

---

## Lazy-Bake Snapshots

Because the stream is delta-compressed, you cannot jump to an arbitrary frame
without decoding all preceding frames. The engine handles this with a
**lazy-bake** strategy:

```javascript
function seekFrame(n) {
  if (!snapshots) bakeAnimation();         // engine.js line 652
  const idx = Math.max(0, Math.min(n, snapshots.length - 1));
  restoreSnapshot(snapshots[idx]);         // engine.js line 654
}
```

On the first backward seek (e.g. editor scrubbing), the engine replays the
entire animation once, saving a snapshot at every frame. After that, any frame
is O(1) random access. This trades memory for seek performance — essential for
interactive editing.

---

**Next:** [Layer 2 — Painter's Algorithm](02-painters-algorithm.md)
