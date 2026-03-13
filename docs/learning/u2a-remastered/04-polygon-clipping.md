# Layer 4 — Polygon Clipping

**Source:** `src/effects/u2a/engine.js`, lines 306–395 (clipping functions)
**Concepts:** Sutherland-Hodgman algorithm, frustum planes, edge-intersection, clip flags

---

## What This Layer Covers

- Why polygons must be **clipped** before rasterisation
- How the **Sutherland-Hodgman algorithm** clips a polygon against one edge at a time
- How the engine clips first in Z (near plane), then in 2D (up, down, left, right)
- The edge-intersection maths that computes new vertices where edges cross clip boundaries
- How **clip flags** are used as an early rejection optimisation

---

## Why Clip?

When a polygon extends outside the screen or behind the camera, bad things
happen. Vertices behind the camera produce inverted or infinite screen
coordinates. Polygons partially off-screen write to memory outside the
framebuffer. Clipping trims polygons to fit within the visible region.

```
Before clipping:                After clipping:
   ╱╲                             │╲
  ╱  ╲                            │ ╲
 ╱    ╲    ← extends              │  ╲
╱──────╲     off-screen           │───╲  ← trimmed to viewport
         ╲                        │
```

The **view frustum** is the 3D volume visible to the camera — a truncated
pyramid bounded by six planes: near, far, top, bottom, left, right.

---

## Sutherland-Hodgman: Clip One Edge at a Time

The Sutherland-Hodgman algorithm (1974) is elegantly simple: clip the polygon
against each boundary plane sequentially. After clipping against one plane,
the output becomes the input for the next plane.

```
Original polygon
      │
      v
[Clip against Z-near plane]  →  intermediate polygon
      │
      v
[Clip against top edge]      →  intermediate polygon
      │
      v
[Clip against bottom edge]   →  intermediate polygon
      │
      v
[Clip against left edge]     →  intermediate polygon
      │
      v
[Clip against right edge]    →  final clipped polygon
```

The engine applies this pipeline in two stages:

1. **Z clipping** — in 3D, against the near plane (`clipZ[0] = 512`)
2. **2D clipping** — in screen space, against the viewport rectangle

```javascript
if (cfOR & VF_NEAR) {
  // ... build 3D vertex list ...
  poly = clipPolyZ(poly);                              // engine.js line 553
}
let f2 = clip2DFlags(poly);
if (f2 & VF_DOWN)  poly = clipEdge(poly, 'y', clipY[1], false);
if (f2 & VF_UP)    poly = clipEdge(poly, 'y', clipY[0], true);
f2 = clip2DFlags(poly);
if (f2 & VF_LEFT)  poly = clipEdge(poly, 'x', clipX[0], true);
if (f2 & VF_RIGHT) poly = clipEdge(poly, 'x', clipX[1], false);
```

---

## Clip Flags: Early Rejection

Before clipping, the engine computes per-vertex **clip flags** — a bitmask
indicating which boundaries each vertex violates:

| Flag       | Bit  | Meaning |
|------------|------|---------|
| `VF_UP`    | 1    | Above viewport top (Y < 25) |
| `VF_DOWN`  | 2    | Below viewport bottom (Y > 174) |
| `VF_LEFT`  | 4    | Left of viewport (X < 0) |
| `VF_RIGHT` | 8    | Right of viewport (X > 319) |
| `VF_NEAR`  | 16   | Behind near plane (Z < 512) |
| `VF_FAR`   | 32   | Beyond far plane (Z > 9999999) |

Two compound flags give fast accept/reject:

```javascript
let cfAND = 0xff, cfOR = 0;
for (let i = 0; i < sides; i++) {
  cfAND &= pv[point[i]].clipping_flags;
  cfOR  |= pv[point[i]].clipping_flags;
}
```

- **`cfAND != 0`** — ALL vertices are on the same wrong side of some boundary.
  The entire polygon is outside the frustum. Skip it entirely (trivial reject).
- **`cfOR == 0`** — NO vertex violates any boundary. The polygon is fully
  inside. No clipping needed (trivial accept).
- **Otherwise** — the polygon straddles a boundary. Clip it.

```
Trivial accept:          Trivial reject:          Needs clipping:
┌──────────┐             ┌──────────┐             ┌──────────┐
│  ◇◇◇◇   │             │          │             │     ◇◇◇──┼──◇
│  ◇◇◇◇   │             │          │  ◇◇◇       │     ◇◇◇  │
│          │             │          │  ◇◇◇       │     ◇◇◇──┼──◇
└──────────┘             └──────────┘             └──────────┘
  All inside               All outside              Partially outside
```

---

## Z-Near Clipping: The Critical Case

Clipping against the near plane is the most important case. Vertices behind
the camera would produce nonsensical screen coordinates (division by negative
Z). The near plane is at `Z = 512`.

The `clipPolyZ` function walks each edge of the polygon. For each edge, it
classifies the start and end points as inside (`Z >= 512`) or outside
(`Z < 512`), then handles four cases:

```
Case 1: Both inside       → Keep endpoint
Case 2: Inside → Outside  → Emit intersection point
Case 3: Outside → Inside  → Emit intersection point + endpoint
Case 4: Both outside      → Emit nothing
```

### Edge-Intersection Maths

When an edge crosses the near plane, the new vertex is found by **linear
interpolation** along the edge:

```javascript
const nx = pu1.x + (zl - z1) * (pu2.x - pu1.x) / (z2 - z1);
const ny = pu1.y + (zl - z1) * (pu2.y - pu1.y) / (z2 - z1);
```

This computes the fraction `t = (zl - z1) / (z2 - z1)` — how far along the
edge the near plane sits — and interpolates X and Y at that fraction.

```
         Z-near plane (Z = 512)
              │
    P1 ●──────┼──────● P2
    (inside)  │   (outside)
              │
              ● intersection
              │
    t = (512 - z1) / (z2 - z1)
    newX = x1 + t × (x2 - x1)
    newY = y1 + t × (y2 - y1)
```

The new vertex is then projected to screen coordinates:

```javascript
nv = {
  x: Math.round(nx * projXF / zl + projXO),
  y: Math.round(ny * projYF / zl + projYO)
};
```

For Gouraud-shaded polygons, the colour is also interpolated at the same
fraction `t`:

```javascript
if (pin.flags & F_GOURAUD)
  nv.color = Math.round(col1 + (zl - z1) * (col2 - col1) / (z2 - z1));
```

---

## 2D Screen Clipping

After Z clipping and projection, the polygon is in 2D screen coordinates. The
`clipEdge` function clips against a single screen boundary (top, bottom, left,
or right). It uses the same inside/outside logic as Z clipping, but operates
on X or Y coordinates instead of Z:

```javascript
function clipEdge(pin, axis, limit, lessOp) {
  // ...
  const inside1 = lessOp ? a1 >= limit : a1 <= limit;
  const inside2 = lessOp ? a2 >= limit : a2 <= limit;
  // ... same 4-case logic as Z clipping ...
}
```

The `axis` parameter ('x' or 'y') and `lessOp` flag generalise the function
to work for any of the four screen boundaries:

| Boundary | axis | limit | lessOp | "Inside" means |
|----------|------|-------|--------|----------------|
| Top      | 'y'  | 25    | true   | y >= 25 |
| Bottom   | 'y'  | 174   | false  | y <= 174 |
| Left     | 'x'  | 0     | true   | x >= 0 |
| Right    | 'x'  | 319   | false  | x <= 319 |

---

## Example: Clipping a Triangle

Consider a triangle with one vertex outside the top of the screen:

```
     A (x=100, y=10)  ← outside (y < 25)
    ╱ ╲
   ╱   ╲
  ╱     ╲          ─── y = 25 (clip boundary)
 ╱       ╲
B         C        ← both inside
(x=50,    (x=150,
 y=100)    y=80)
```

Clipping against the top edge (y = 25):

1. **Edge B→A**: B is inside (y=100 ≥ 25), A is outside (y=10 < 25).
   Emit intersection at y=25: `x = 50 + (25-100)/(10-100) × (100-50) = 92`
   New vertex P1 = (92, 25)

2. **Edge A→C**: A is outside, C is inside.
   Emit intersection at y=25: `x = 100 + (25-10)/(80-10) × (150-100) = 111`
   New vertex P2 = (111, 25). Also emit C.

3. **Edge C→B**: Both inside. Emit B.

Result: quadrilateral P1, P2, C, B — the triangle with its top sliced off.

```
  P1────────P2     ← new edge along y = 25
  │          │
  │          │
  B──────────C
```

---

## The Remastered Variant: No Software Clipping

The remastered variant does not need any of this software clipping. The GPU
hardware performs **guard-band clipping** automatically during rasterisation.
The vertex shader outputs clip-space coordinates, and the GPU clips polygons
against the view frustum at the hardware level — faster and with subpixel
precision.

The entire `clipPolyZ` and `clipEdge` functions exist only to serve the classic
software rasteriser.

---

**Next:** [Layer 5 — Projection](05-projection.md)
