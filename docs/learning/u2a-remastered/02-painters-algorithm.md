# Layer 2 — Painter's Algorithm

**Source:** `src/effects/u2a/engine.js`, lines 584–605 (sort and draw), lines 568–581 (draw object)
**Concepts:** Back-to-front depth sorting, convex hull assumption, draw order tables, Z-buffer alternative

---

## What This Layer Covers

- How **painter's algorithm** ensures distant objects are drawn behind near ones
- Why it works for this scene (convex ship hulls with pre-authored draw orders)
- How objects are sorted by center-point Z depth
- How each object selects the best polygon draw order for its viewing angle
- The limitations of painter's algorithm and why the remaster uses a depth buffer

---

## The Problem: Hidden Surface Removal

When you draw 3D objects on a 2D screen, you must decide which surfaces are
visible and which are hidden behind others. This is the **hidden surface
removal** problem — one of the fundamental challenges in computer graphics.

Consider two ships: one far away, one nearby. If you draw the near ship first
and the far ship second, the far ship will overwrite the near one — clearly
wrong.

---

## Painter's Algorithm: Draw Back-to-Front

The simplest solution is named after how oil painters work: paint the
background first, then progressively closer objects on top. Each new layer
covers whatever was behind it.

```
Step 1: Draw far ship         Step 2: Draw near ship on top
┌──────────────────┐          ┌──────────────────┐
│                  │          │                  │
│    ◇  (far)     │          │    ◇  (far,      │
│                  │   ──>    │   ◆◆◆  partially │
│                  │          │   ◆◆◆  covered)  │
│                  │          │                  │
└──────────────────┘          └──────────────────┘
```

---

## Object-Level Sorting

The engine sorts visible objects by their distance from the camera. The sort
key is the Z depth (distance along the viewing axis) of a reference vertex
after the camera transform:

```javascript
function calcMatrices() {
  order = [];
  for (let a = 1; a < co.length; a++) {
    if (!co[a].on) continue;
    order.push(a);
    const o = co[a].o;
    applyMatrix(o.r, o.r0, cam);                        // engine.js line 591
    co[a].dist = singleZ(o.pl[0][0], o.v0, o.r);        // engine.js line 592
  }
}
```

The `singleZ` function computes the Z coordinate of a single vertex after
applying the combined object+camera rotation:

```javascript
function singleZ(vi, vl, r) {
  return vl[vi].x * r[6] + vl[vi].y * r[7] + vl[vi].z * r[8] + r[11];
}
```

This is a dot product — the Z row of the transformation matrix applied to the
vertex position plus the Z translation. It gives the distance of that vertex
from the camera along the viewing direction.

---

## The Sort

With distances computed, the sort itself is trivial:

```javascript
function sortAndDraw() {
  order.sort((a, b) => co[b].dist - co[a].dist);     // engine.js line 598
  for (const idx of order) drawObject(co[idx].o);     // engine.js line 599
}
```

`co[b].dist - co[a].dist` sorts **descending** — farthest objects first. Then
each object is drawn in order, with nearer objects painting over farther ones.

```
Sorted draw order:
  1. Ship at Z = 50000  (far away)    ← drawn first
  2. Ship at Z = 12000  (mid range)   ← drawn second, covers far ship
  3. Ship at Z = 3000   (close)       ← drawn last, covers everything
```

---

## Polygon-Level Ordering Within an Object

Sorting objects is not enough — within each ship, the polygons themselves must
be drawn in the right order. A wing panel behind the fuselage should not paint
over the fuselage.

Rather than sorting polygons at runtime (expensive for complex models), the
original engine uses **pre-computed polygon draw orders** stored in the
`ORD0`/`ORDE` chunks. Each order list is correct for a specific range of
viewing angles.

The engine picks the best order based on the closest orientation point:

```javascript
let bestOrd = 1, bestZ = obj.v[obj.pl[1][0]].z;
for (let oi = 2; oi < obj.pl.length; oi++) {
  const z = obj.v[obj.pl[oi][0]].z;
  if (z < bestZ) { bestZ = z; bestOrd = oi; }
}
drawPolylist(obj.pl[bestOrd], ...);
```

Each order list begins with a reference vertex index. After transformation,
the list whose reference vertex is closest to the camera (smallest Z) is
selected — its polygon sequence was authored for that viewpoint.

---

## Why It Works for This Scene

Painter's algorithm has known failure cases — overlapping, interpenetrating, or
cyclic geometry can produce incorrect results. But for U2A, it works well:

1. **Convex ship hulls** — the ships are convex or nearly convex polyhedra.
   For convex objects, there exists a draw order that is correct from any
   viewing angle. The ORD0/ORDE tables encode these orders.

2. **Non-intersecting objects** — the three ships fly on separate paths and
   never overlap in 3D space. Object-level sorting by Z is always correct.

3. **Single viewer** — there is only one camera. Painter's algorithm is
   view-dependent, but since there is only one viewpoint, this is fine.

```
        Convex hull:                Concave/intersecting:
        ┌────────┐                  ┌───┐
       /          \                 │   │──┐
      /   correct  \                │ A │B │  ← A and B
      \   from any /                │   │──┘    overlap —
       \  angle   /                 └───┘       painter's
        └────────┘                              can fail
```

---

## Backface Culling

Before drawing each polygon, the engine checks whether it faces the camera.
For single-sided polygons, if the face normal points away from the viewer,
the polygon is skipped:

```javascript
if (!(flags & F_2SIDE)) {
  if (np.x * vp.x + np.y * vp.y + np.z * vp.z >= 0) continue;
}
```

This is a dot product between the face normal (`np`) and the vector from the
polygon to the camera (`vp`). If the dot product is >= 0, the normal points
away from the viewer — the polygon faces backward and is culled.

**Backface culling** typically eliminates about half the polygons in a convex
object, halving the rendering work. For double-sided polygons (flagged with
`F_2SIDE`), this test is skipped.

---

## Limitations of Painter's Algorithm

The painter's algorithm has fundamental limitations:

1. **Cyclic overlap** — three polygons A, B, C where A is behind B, B is
   behind C, and C is behind A. No draw order is correct.

2. **Piercing geometry** — a polygon that passes through another polygon
   must be split to render correctly.

3. **Per-pixel cost** — polygons that are mostly hidden still get fully
   rasterised, wasting fill rate.

These are why modern GPUs use **depth buffers** (Z-buffers) instead. A
depth buffer stores the Z depth of each pixel; new fragments are only written
if they are closer than the existing depth. This solves all three problems.

The remastered variant uses the GPU's hardware depth buffer, eliminating the
need for painter's sorting entirely.

---

## Classic vs Remastered Comparison

| Aspect | Classic (engine.js) | Remastered (effect.remastered.js) |
|--------|--------------------|------------------------------------|
| Object sorting | Back-to-front sort by Z | Not needed (depth buffer) |
| Polygon ordering | Pre-computed ORD0/ORDE tables | Not needed (depth buffer) |
| Backface culling | Manual dot product test | GPU hardware culling |
| Overdraw | Full — hidden pixels still rasterised | Minimal — depth test rejects early |
| Failure cases | Cyclic/intersecting geometry | None (per-pixel correct) |

---

**Next:** [Layer 3 — Gouraud Shading](03-gouraud-shading.md)
