# Layer 2 — The Polygon Engine

**Source:** `src/effects/u2e/u2engine.js` (lines 267–696)
**Concepts:** Affine transforms, rotation matrices, perspective projection, Sutherland-Hodgman clipping, directional lighting, scanline rasterisation

---

## What This Layer Covers

The U2 engine is a complete software 3D pipeline — the kind every 1990s demo
coded from scratch. It takes 3D objects in world space and produces coloured
pixels in a 320×200 framebuffer. Understanding this pipeline is essential
even for the remastered GPU variant, because the same maths drives the vertex
and fragment shaders.

This layer explains:

- How the 3×3+3 rotation-translation matrix works
- How vertices are transformed from object space to camera space
- How perspective projection maps 3D to 2D screen coordinates
- How Sutherland-Hodgman polygon clipping prevents off-screen drawing
- How flat and Gouraud shading produce different lighting effects

---

## The Transform Pipeline

Every visible object passes through this pipeline each frame:

```
Object Space        Camera Space        Screen Space
  (v0, n0)     →     (v, n)       →      (pv)
              ┌──────────────┐     ┌──────────────────┐
              │ Rotate +     │     │ Perspective       │
              │ Translate    │     │ Projection        │
              │ (3×3 + vec3) │     │ (divide by Z)     │
              └──────────────┘     └──────────────────┘
```

### The 12-Element Matrix

Each object (including the camera) carries a **12-element array** `r0`
representing a combined rotation and translation:

```
r0[0..8]  — 3×3 rotation matrix (row-major)
r0[9..11] — translation vector (tx, ty, tz)

┌                     ┐   ┌    ┐   ┌        ┐
│ r[0]  r[1]  r[2]    │   │ x  │   │ tx     │
│ r[3]  r[4]  r[5]  × │ × │ y  │ + │ ty     │
│ r[6]  r[7]  r[8]    │   │ z  │   │ tz     │
└                     ┘   └    ┘   └        ┘
```

This is not a 4×4 homogeneous matrix. 1990s engines avoided the extra row/column
because every multiply and add cost precious CPU cycles. The 3×3 portion handles
rotation (and possibly scale); the 3-element tail handles translation.

### Applying the Camera

To transform an object into camera space, the engine combines the object's
matrix with the camera's matrix:

```javascript
function calc_applyrmatrix(dest, src, apply) {
  // Rotation: dest_rot = apply_rot × src_rot
  dest[0] = apply[0]*src[0] + apply[1]*src[3] + apply[2]*src[6];
  // ... (9 dot products for the 3×3 block)

  // Translation: dest_t = src_t × apply_rot + apply_t
  const tx = src[9]*apply[0] + src[10]*apply[1] + src[11]*apply[2];
  dest[9]  = tx + apply[9];
  // ... (3 components)
}
```

The translation undergoes the same rotation as the vertices — this is
equivalent to multiplying two 4×4 affine matrices but without the bottom
row `[0 0 0 1]`.

---

## Perspective Projection

After camera transformation, vertices exist in **camera space** where Z
points into the screen. Projection maps them to 2D:

```javascript
function calc_projection(pvdst, vsrc) {
  for (let i = 0; i < vsrc.length; i++) {
    const { x, y, z } = vsrc[i];

    const xp = (x * Projection2DXFactor / z) + Projection2DXOffset;
    const yp = (y * Projection2DYFactor / z) + Projection2DYOffset;

    pvdst[i].x = Math.round(xp);
    pvdst[i].y = Math.round(yp);
  }
}
```

This is the classic **pinhole camera** model:

```
screenX = focalLength × (worldX / worldZ) + centerX
screenY = focalLength × (worldY / worldZ) + centerY
```

The **divide by Z** is what creates perspective: nearby objects (small Z) appear
large, distant objects (large Z) appear small. The focal length
(`Projection2DXFactor`) is derived from the field of view:

```javascript
Projection2DXFactor = (319 - 159) / Math.tan(halfFOV × π / 180);
Projection2DYFactor = Projection2DXFactor × (172 / 200);
```

The aspect ratio correction (`172 / 200`) compensates for VGA Mode 13h's
non-square pixels (320×200 in a 4:3 display).

### Clipping Flags

During projection, each vertex is tested against the view frustum and tagged
with **clipping flags**:

```
VF_NEAR  = 16   ← behind the near plane (z < 512)
VF_FAR   = 32   ← beyond the far plane
VF_UP    =  1   ← above the viewport
VF_DOWN  =  2   ← below the viewport
VF_LEFT  =  4   ← left of the viewport
VF_RIGHT =  8   ← right of the viewport
```

These flags are used later to skip or clip polygons efficiently.

---

## Polygon Clipping

When a polygon straddles the edge of the screen, it must be **clipped** to
prevent writing pixels outside the framebuffer. The U2 engine uses
**Sutherland-Hodgman clipping** — the same algorithm taught in every computer
graphics course.

The idea: clip against one edge at a time. Each edge produces a new polygon
(possibly with fewer or more vertices) that lies entirely within that edge.

```
Original polygon         After clip-left      After clip-top
    ╱╲                      │╲                   │╲
   ╱  ╲                     │ ╲                  │ ╲
  ╱    ╲  ←screen edge      │  ╲                 ├──╲
 ╱──────╲                   │───╲                │   │
╱        ╲                  │    │               │   │
```

The engine clips in a specific order:

```javascript
if (cfOR & VF_NEAR)  mypoly = clipPolyZ(mypoly);   // Z near plane first
cfOR = getPolyFlags2D(mypoly);
if (cfOR & VF_DOWN)  mypoly = clipDown(mypoly);
if (cfOR & VF_UP)    mypoly = clipUp(mypoly);
if (cfOR & VF_LEFT)  mypoly = clipLeft(mypoly);
if (cfOR & VF_RIGHT) mypoly = clipRight(mypoly);
```

**Z-clipping is special**: it operates in 3D (before projection) because
vertices behind the camera would produce inverted/infinite screen coordinates.
The other four clips operate in 2D screen space.

Each clip function walks the polygon edges and for each pair of consecutive
vertices computes:

```javascript
// Linear interpolation along the edge to find the intersection
const t = (edgeLimit - v1.coord) / (v2.coord - v1.coord);
newVertex.x = Math.round(v1.x + t * (v2.x - v1.x));
newVertex.y = Math.round(v1.y + t * (v2.y - v1.y));
```

For Gouraud-shaded polygons, the colour is also interpolated at the clip point:

```javascript
if (flags & F_GOURAUD)
  newVertex.color = Math.round(c1 + t * (c2 - c1));
```

---

## Lighting Model

The U2 engine uses **directional lighting** with a fixed light vector:

```javascript
const SCENE_LIGHT = [12118 / 16384, 10603 / 16384, 3030 / 16834];
```

This is roughly `(0.74, 0.65, 0.18)` — light coming from the upper-right-front.

### Flat Shading

For flat-shaded polygons, the light is computed once per face using the
**face normal**:

```javascript
function normallight(n) {
  let dotp = (n.x * LIGHT[0] + n.y * LIGHT[1] + n.z * LIGHT[2])
             / 16384 * 128;
  dotp += 128;                 // bias to 0..255 range
  return clamp(dotp, 0, 255);
}
```

The dot product measures how directly the face points toward the light. A face
perpendicular to the light gets maximum illumination; a face parallel gets
the ambient minimum.

The light value is then divided by a **shade divisor** (8, 16, or 32) to
produce a palette offset:

```javascript
function calclight(flags, np) {
  let light = normallight(np);
  let divider = 16;                    // default
  const f = (flags & F_SHADE32) >> 10;
  if (f === 1) divider = 32;          // fine ramp (32 shades)
  if (f === 3) divider = 8;           // coarse ramp (8 shades)

  light = clamp(light / divider, 2, 256 / divider - 1);
  return Math.floor(light);
}
```

The final pixel colour is `baseColour + shadeOffset` — an index into the
256-colour VGA palette, where consecutive indices form a light-to-dark ramp.

### Gouraud Shading

For Gouraud-shaded polygons, the light is computed **per vertex** using
each vertex's individual normal. These per-vertex colours are then
interpolated across the polygon during scanline filling:

```
  vertex A (light=200)
       ╱╲
      ╱  ╲     scanline at y: interpolate between
     ╱    ╲    left edge colour and right edge colour
    ╱ ↓↓↓↓ ╲
   ╱────────╲
vertex B      vertex C
(light=150)   (light=180)
```

The result is smooth shading that hides polygon edges — the same technique
Henri Gouraud published in 1971.

---

## Scanline Filling

The engine fills polygons one horizontal scanline at a time. Two variants
exist:

### Flat Fill

```javascript
function fillFlat(poly) {
  // Find top and bottom vertices
  // Walk left edge and right edge simultaneously
  for (let y = 0; y < h; y++) {
    const xl = Math.round(Math.min(x1, x2));
    const xr = Math.round(Math.max(x1, x2));
    for (let x = xl; x <= xr; x++)
      fb[x + ymul] = color;           // single colour for entire face
    x1 += segL.invSlope;
    x2 += segR.invSlope;
    ymul += W;
  }
}
```

### Gouraud Fill

```javascript
function fillGouraud(poly) {
  // Same edge walking, but also interpolate colour
  for (let y = 0; y < h; y++) {
    let cSlope = (c2 - c1) / (x2 - x1);  // colour gradient per pixel
    let c = c1;
    for (let x = xl; x < xr; x++) {
      fb[x + ymul] = Math.round(c);       // interpolated colour per pixel
      c += cSlope;
    }
    // Advance edge positions and colours
  }
}
```

The Gouraud filler does one extra multiply-add per pixel compared to the flat
filler. In 1993 this was a meaningful cost — hence the per-polygon flag letting
artists choose flat shading for objects where smooth lighting was not needed
(saving CPU time for more complex objects).

---

## Shared Patterns with U2A

The U2A effect (Part 2 — spaceship fly-in) uses the exact same engine. All the
code described in this layer — `vis_loadobject`, `calc_applyrmatrix`,
`calc_projection`, the clipping functions, and both scanline fillers — is
shared between U2A and U2E. The only difference is scale: U2A renders a single
spaceship, while U2E renders 42 objects with sorting and culling.

---

**Previous:** [Layer 0 — Overview](00-overview.md) · **Next:** [Layer 3 — Animation Bake](03-animation-bake.md)
