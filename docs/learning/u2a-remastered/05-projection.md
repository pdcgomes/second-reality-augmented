# Layer 5 — Perspective Projection

**Source:** `src/effects/u2a/engine.js`, lines 267–283 (classic projection); `src/effects/u2a/effect.remastered.js`, lines 493–511 (GPU projection matrix)
**Concepts:** Perspective division, field of view, viewport transform, fixed-point scaling, VGA pixel aspect

---

## What This Layer Covers

- How 3D world coordinates become 2D screen coordinates
- The **perspective divide** — why distant objects appear smaller
- How the engine computes projection factors from the field of view
- How VGA Mode 13h's non-square pixels require an aspect correction
- How the remastered variant builds a 4×4 projection matrix for the GPU
- How the original fixed-point arithmetic maps to modern floating-point

---

## The Core Idea: Perspective Division

The fundamental operation of 3D-to-2D projection is **dividing by depth**.
Objects farther from the camera (larger Z) get divided by a larger number,
making them appear smaller:

```
         Camera
           │
           │  Z = 1    Z = 2    Z = 4
           │    │         │        │
           │    ●         ●        ●  ← same-size object
           │   (big)   (medium)  (small)
           │
```

The projection formula:

```
x_screen = x_3d × projectionFactor / z_3d + screenCenter
y_screen = y_3d × projectionFactor / z_3d + screenCenter
```

---

## The Classic Projection

The engine computes screen coordinates in the `project` function:

```javascript
function project(pv, v) {
  for (let i = 0; i < v.length; i++) {
    const { x, y, z } = v[i];
    const yp = (y * projYF / z) + projYO;     // engine.js line 273
    const xp = (x * projXF / z) + projXO;     // engine.js line 276
    pv[i].x = Math.round(xp);
    pv[i].y = Math.round(yp);
    // ... clip flag computation ...
  }
}
```

The projection factors are derived from the **field of view**:

```javascript
function setFov(f) {
  let half = f / 2;
  if (half < 3) half = 3;
  if (half > 90) half = 90;
  projXF = (clipX[1] - projXO) / Math.tan(half * Math.PI / 180);
  projYF = projXF * aspect;         // aspect = 172 / 200
}
```

Where:
- `projXO = 159` — screen center X (half of 320 - 1)
- `projYO = 99` — screen center Y (half of 200 - 1)
- `clipX[1] = 319` — right edge of the screen

The projection factor `projXF` is chosen so that an object at the right edge
of the field of view projects exactly to the right edge of the screen:

```
projXF = (319 - 159) / tan(fov/2) = 160 / tan(fov/2)
```

For the default FOV of 40°:

```
projXF = 160 / tan(20°) = 160 / 0.364 ≈ 440
```

---

## VGA Pixel Aspect Correction

VGA Mode 13h (320×200) displayed on a 4:3 CRT monitor produces **non-square
pixels** — each pixel is taller than it is wide. The pixel aspect ratio is
approximately 200/240 = 0.833, but the engine uses `172/200 = 0.86` as its
aspect correction factor:

```javascript
const aspect = 172 / 200;
projYF = projXF * aspect;
```

Without this correction, circles would appear as tall ellipses and the ships
would look vertically stretched. The Y projection factor is reduced by the
aspect ratio to compensate.

```
Without aspect correction:     With aspect correction:
┌────────────────┐              ┌────────────────┐
│                │              │                │
│    ╱  ╲        │              │    ╱──╲        │
│   │    │       │              │   │    │       │
│   │    │       │              │    ╲──╱        │
│    ╲  ╱        │              │                │
│                │              └────────────────┘
└────────────────┘              Circle looks round
  Oval — too tall                 on CRT display
```

---

## Fixed-Point Arithmetic in the Original

The original x86 assembly used integer arithmetic throughout. The projection
formula `x * projXF / z` was computed using 32-bit integer multiplication
followed by integer division — the "fixed-point" approach.

Key scale factors in the original:
- Vertices: 32-bit signed integers ÷ 16384 (14-bit fractional)
- Normals: 16-bit signed integers ÷ 16384 (14-bit fractional)
- Light: `[12118, 10603, 3030]` are pre-scaled by 16384
- Rotations: Stored as ÷ 128 fixed-point

The JavaScript port converts to floating-point at load time (dividing by
16384 or 128), but preserves the original integer ranges in the lighting
calculation to maintain pixel-for-pixel compatibility.

---

## The Remastered Projection Matrix

The remastered variant builds a standard 4×4 perspective projection matrix
for the GPU, but constructs it from the same parameters as the classic
projection — not from a generic `perspective()` function:

```javascript
function buildProjectionMat4(fovDeg, _aspect, near, far) {
  let half = fovDeg / 2;
  if (half < 3) half = 3;
  if (half > 90) half = 90;
  const projXF = (CLIP_X1 - PROJ_XO) / Math.tan(half * Math.PI / 180);
  const projYF = projXF * ASPECT;
  const vpW = 320, vpH = 200;
  const sx = 2 * projXF / vpW;
  const sy = 2 * projYF / vpH;
  const ox = 2 * PROJ_XO / vpW - 1;
  const oy = 1 - 2 * PROJ_YO / vpH;
  const nf = far - near;
  return new Float32Array([
    sx,  0,   0,                    0,
    0,  -sy,  0,                    0,
    ox,  oy,  (far + near) / nf,    1,
    0,   0,  -2 * far * near / nf,  0,
  ]);
}
```

This matrix encodes three transformations in one:

1. **Scale** by `sx` and `sy` — maps the field of view to the -1..+1 NDC range
2. **Offset** by `ox` and `oy` — shifts the projection center (159, 99 is not
   exactly centered in 320×200)
3. **Depth mapping** — maps the Z range [near, far] = [512, 10000000] to [0, 1]
   for the depth buffer

The Y scale is negated (`-sy`) because the classic projection has Y increasing
downward (screen coordinates), while OpenGL/WebGL has Y increasing upward
(NDC). The negation flips the image right-side up.

---

## From Classic to GPU: A Side-by-Side

```
Classic (per vertex, CPU):
  screen_x = x × projXF / z + 159
  screen_y = y × projYF / z + 99

Remastered (matrix × vertex, GPU):
  clip_x = x × sx + z × ox
  clip_y = y × (-sy) + z × oy
  clip_z = z × (f+n)/(f-n) + (-2fn)/(f-n)
  clip_w = z

  ndc_x = clip_x / clip_w    →  maps to [-1, +1]
  ndc_y = clip_y / clip_w    →  maps to [-1, +1]

  screen_x = (ndc_x + 1) / 2 × viewport_width
  screen_y = (ndc_y + 1) / 2 × viewport_height
```

Both produce the same screen-space result. The matrix form is what GPUs
are optimised for — a single matrix-vector multiply per vertex in hardware.

---

## ModelView Matrix Construction

The remastered variant also builds a model-view matrix from the engine's
rotation arrays. Each object has a `r0` array — a 3×3 rotation matrix plus
a 3D translation:

```
r0[0..8]  = 3×3 rotation matrix (row-major)
r0[9..11] = translation vector (tx, ty, tz)
```

The `buildModelViewMat4` function multiplies the object's rotation by the
camera's rotation and composes their translations:

```javascript
function buildModelViewMat4(objR0, camR0) {
  // Combined rotation: camera × object (3×3 multiply)
  r[0] = camR0[0]*objR0[0] + camR0[1]*objR0[3] + camR0[2]*objR0[6];
  // ... (9 entries) ...

  // Combined translation: object position in camera space
  const tx = objR0[9]*camR0[0] + objR0[10]*camR0[1] + objR0[11]*camR0[2];
  r[9]  = tx + camR0[9];
  // ... (3 entries) ...

  // Pack into column-major 4×4 for WebGL:
  return new Float32Array([
    r[0], r[3], r[6], 0,
    r[1], r[4], r[7], 0,
    r[2], r[5], r[8], 0,
    r[9], r[10], r[11], 1,
  ]);
}
```

The column-major layout is required by WebGL's `uniformMatrix4fv`. The 3×3
rotation occupies the upper-left, the translation occupies the fourth column,
and the bottom row is `[0, 0, 0, 1]` (no perspective in the model-view — that
comes from the projection matrix).

---

## Dynamic Field of View

The animation stream can change the FOV mid-scene. When the decoder
encounters `0xFF` followed by a byte <= `0x7F`, it sets a new FOV:

```javascript
if (a <= 0x7f) { setFov(a / 256 * 360); return; }
```

The remastered variant rebuilds the projection matrix each frame from the
engine's current FOV:

```javascript
const proj = buildProjectionMat4(engine.fov, sw / sh, 512, 10000000);
```

FOV changes create dramatic zoom effects — the camera appears to rush toward
or pull away from the ships.

---

**Next:** [Layer 6 — GPU Rendering](06-gpu-rendering.md)
