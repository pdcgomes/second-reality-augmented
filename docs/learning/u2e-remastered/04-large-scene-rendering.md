# Layer 4 — Large Scene Rendering

**Source:** `src/effects/u2e/u2engine.js` (lines 350–716), `src/effects/u2e/effect.js` (lines 88–103)
**Concepts:** Painter's algorithm, depth sorting, backface culling, per-face shading decisions, draw order optimisation

---

## What This Layer Covers

Rendering a single 3D object is straightforward. Rendering 42 objects that
overlap, occlude, and wrap around the camera is a different challenge entirely.
The U2 engine uses a set of techniques that were standard in 1993 but are
educational to understand even today — they reveal the problems that modern
hardware depth buffers were designed to solve.

This layer explains:

- Why object ordering matters when you have no depth buffer
- How the painter's algorithm sorts objects back-to-front
- How special-case objects (floors, the spaceship) are forced into specific positions
- How backface culling avoids drawing faces that point away from the camera
- How each polygon's shading mode is chosen and what it costs

---

## The Ordering Problem

Without a hardware depth buffer, the only way to get correct overlap is to
**draw far objects first and near objects last** — the painter's algorithm.
Like a painter working from background to foreground, later strokes cover
earlier ones.

For U2E this means sorting all 42 visible objects by distance before rendering:

```
Camera → ┃                    ┃
         ┃ building A (near)  ┃  ← draw LAST
         ┃                    ┃
         ┃    tree B (mid)    ┃  ← draw second
         ┃                    ┃
         ┃  building C (far)  ┃  ← draw FIRST
         ┃                    ┃
```

---

## Distance Calculation

Each visible object's distance is computed from a single representative
vertex (the orientation point from its first polygon list):

```javascript
function calc_matrix(currentFrame) {
  order = [];
  for (let a = 1; a < co.length; a++) {
    if (co[a].on) {
      order.push(a);
      const o = co[a].o;
      calc_applyrmatrix(o.r, o.r0, cam);       // object → camera space
      const b = o.pl[0][0];                     // orientation vertex index
      co[a].dist = calc_singlez(b, o.v0, o.r);  // Z in camera space
    }
  }
}
```

The `calc_singlez` function computes only the Z component of the transform —
the distance from the camera along the view direction. This is cheaper than
a full 3D transform and sufficient for sorting.

```javascript
function calc_singlez(vertex, vlist, r) {
  return vlist[vertex].x * r[6]
       + vlist[vertex].y * r[7]
       + vlist[vertex].z * r[8]
       + r[11];
}
```

---

## Bubble Sort

The engine sorts the `order` array using **insertion sort** (which behaves
like bubble sort for nearly-sorted data):

```javascript
for (let a = 0; a < order.length; a++) {
  let dis = co[order[a]].dist;
  let c = order[a];
  let b;
  for (b = a - 1; b >= 0 && dis > co[order[b]].dist; b--)
    order[b + 1] = order[b];
  order[b + 1] = c;
}
```

This sorts **largest distance first** (back-to-front). Why insertion sort
instead of quicksort? Because:

1. Only ~20–30 objects are visible at any time (small N)
2. Frame-to-frame order changes minimally (nearly sorted already)
3. Insertion sort is O(N) on nearly-sorted input — optimal for this case

---

## Special-Case Objects

Two categories of objects receive special distance treatment:

### Floor Objects

```javascript
if (o.name && o.name[1] === '_')
  co[a].dist = 1000000000;   // push to back of sort order
```

Objects named `_f*` (floors, ground planes) are forced to the maximum distance.
Since the sort is back-to-front, these are drawn **first**, forming the
background that all other geometry paints over. This is correct because floors
extend beneath everything.

### The Spaceship

```javascript
if (currentFrame > 900 && currentFrame < 1100) {
  if (o.name && o.name[1] === 's' && o.name[2] === '0' && o.name[3] === '1')
    co[a].dist = 1;   // force to front (drawn last)
}
```

During frames 900–1100, the spaceship is forced to the minimum distance — drawn
**last**, so it always appears on top. This is a manual override by the demo
author to ensure the dramatic spaceship reveal is not occluded by buildings.

### Why Special Cases Exist

These special cases reveal the **fundamental limitation of the painter's
algorithm**: it works on a per-object basis, not per-pixel. If two objects
interpenetrate (like a spaceship flying through a building gap), the sort
produces incorrect results. The original demo artist handled this by:

1. Designing the scene so objects rarely intersect
2. Adding manual overrides for the few cases where they do
3. Accepting minor visual glitches that flash by at 35 fps

---

## Backface Culling

Before drawing any polygon, the engine checks whether it faces **toward** or
**away from** the camera:

```javascript
function checkculling(n, v) {
  return (n.x * v.x + n.y * v.y + n.z * v.z) >= 0;
}
```

This computes the dot product of the face normal (`n`) and the vector from
the face to the camera origin (`v`, which is just the vertex position in
camera space since the camera is at origin).

```
              normal ↗
             ╱
  ┌─────────┐
  │  face   │ ← if normal points TOWARD camera: visible (draw it)
  └─────────┘   if normal points AWAY from camera: hidden (skip it)
               ╲
                ↘ camera direction
```

- **Dot product ≥ 0**: Normal points away from camera → face is visible from
  behind → **skip it** (it is a back face)
- **Dot product < 0**: Normal points toward camera → face is visible → **draw it**

The `F_2SIDE` flag disables culling for double-sided polygons (tree leaves,
flags, etc.) that must be visible from both sides.

Backface culling eliminates roughly half of all polygons — a critical
optimisation when every polygon requires expensive scanline filling.

---

## Per-Face Shading Decisions

Each polygon carries a **flags byte** that determines its rendering treatment.
The engine evaluates these flags for every visible, non-culled polygon:

```
┌──────────────────────────────────────────────────────┐
│ Polygon flags evaluation                              │
│                                                       │
│ F_GOURAUD (0x1000)?                                   │
│   YES → per-vertex normals → interpolated shading     │
│   NO  → face normal → single colour per face          │
│                                                       │
│ F_SHADE32 (0x0C00)?                                   │
│   bits = 01 → divider = 32 → 32-shade ramp (fine)     │
│   bits = 10 → divider = 16 → 16-shade ramp (default)  │
│   bits = 11 → divider = 8  → 8-shade ramp (coarse)    │
│                                                       │
│ F_2SIDE (0x0200)?                                     │
│   YES → skip backface culling                         │
│   NO  → cull if facing away                           │
└──────────────────────────────────────────────────────┘
```

### The Shade Division Choice

The shade divisor controls how many distinct brightness levels a surface has:

| Divisor | Levels | Use case |
|---------|--------|----------|
| 32 | 8 (256/32) | Fine gradation for large smooth surfaces |
| 16 | 16 (256/16) | Default — balanced quality/range |
| 8 | 32 (256/8) | Dramatic lighting with wide palette range |

A smaller divisor produces more levels but uses more of the 256-colour palette
space per material. The original artists balanced these tradeoffs across all
42 objects to stay within the palette budget.

---

## The Full Classic Render Frame

Putting it all together, here is the complete per-frame rendering flow for the
classic variant:

```
┌─────────────────────────────────────────────────────┐
│ 1. Clear viewport (rows 25–175)                     │
│                                                     │
│ 2. Advance animation (stepOneAnimationFrame)        │
│                                                     │
│ 3. For each visible object:                         │
│    a. Compute combined rotation matrix (obj × cam)  │
│    b. Compute distance for sorting                  │
│                                                     │
│ 4. Sort objects back-to-front (insertion sort)       │
│    - Floors forced to back                          │
│    - Spaceship forced to front (frames 900–1100)    │
│                                                     │
│ 5. For each object (back-to-front):                 │
│    a. Transform all vertices to camera space        │
│    b. Rotate normals                                │
│    c. Project vertices to 2D with clipping flags    │
│    d. Select best polygon order list                │
│    e. For each polygon in the list:                 │
│       i.   Backface cull (skip if facing away)      │
│       ii.  Check clipping flags (skip if all off)   │
│       iii. Compute lighting (flat or per-vertex)    │
│       iv.  Clip polygon edges if needed             │
│       v.   Fill scanlines (flat or Gouraud)         │
│                                                     │
│ 6. Convert indexed framebuffer to RGBA              │
│ 7. Upload texture and display                       │
└─────────────────────────────────────────────────────┘
```

Steps 5a–5e happen inside `vis_drawobject()` and `draw_polylist()`, processing
potentially hundreds of polygons across 42 objects. The total polygon count
varies frame to frame as objects toggle on and off, but at peak the scene
renders several hundred polygons per frame.

---

## How the Remastered Variant Eliminates This

The remastered variant **replaces steps 3–6 entirely** with GPU rendering:

| Classic step | Remastered equivalent |
|-------------|----------------------|
| Compute distance + sort | Hardware depth buffer |
| Transform vertices (CPU) | `OBJ_VERT` shader (GPU) |
| Rotate normals (CPU) | `uNormalMat` uniform (GPU) |
| Perspective projection (CPU) | `uProjection` matrix (GPU) |
| Polygon clipping (CPU) | GPU clip space + viewport |
| Backface culling (CPU) | `gl.enable(gl.CULL_FACE)` or depth buffer |
| Compute lighting (CPU) | `OBJ_FRAG` shader (GPU) |
| Scanline fill (CPU) | GPU rasteriser |
| Indexed → RGBA conversion | Palette texture lookup |

The engine is still used for animation (step 2), but everything from sorting
through rasterisation is handled by the GPU in a single `gl.drawArrays()` call
per object.

---

**Previous:** [Layer 3 — Animation Bake](03-animation-bake.md) · **Next:** [Layer 5 — GPU Rendering](05-gpu-rendering.md)
