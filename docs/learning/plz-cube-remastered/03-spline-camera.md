# Layer 3 — Spline Camera

**Source:** `src/effects/plzCube/effect.remastered.js`, lines 93–130 (spline data + getspl), lines 367–410 (matrix helpers)
**Concepts:** B-spline interpolation, control points, Euler rotation, model-view matrices, coordinate system conversion

---

## What This Layer Covers

- How **46 control points** define the cube's rotation, camera distance, and light position
- How **B-spline interpolation** smoothly blends between control points
- How **Euler angles** are converted into a rotation matrix
- How the classic's coordinate system (+Y down, +Z forward) is converted to OpenGL (+Y up, -Z forward)
- How the **model-view-projection matrix** transforms cube vertices to screen space

---

## The Control Point Table

The animation is choreographed as a table of 46 control points (`ANIM_SPLINE`),
each with 8 parameters:

```javascript
//            tx    ty   dis    kx     ky     kz   ls_kx  ls_ky
[             0,  2000,  500,  K*0,   K*4,   K*6,    0,     0   ],
[             0,  2000,  500,  K*1,   K*5,   K*7,    0,     0   ],
// ... 44 more rows
```

| Field | Meaning | Range |
|-------|---------|-------|
| `tx` | Camera X translation | pixels |
| `ty` | Camera Y translation | pixels |
| `dis` | Distance from camera to cube centre | pixels |
| `kx` | Rotation angle around X axis | 0–1023 (maps to 0–2π) |
| `ky` | Rotation angle around Y axis | 0–1023 |
| `kz` | Rotation angle around Z axis | 0–1023 |
| `ls_kx` | Light source orbit angle (polar) | 0–1023 |
| `ls_ky` | Light source orbit angle (azimuth) | 0–1023 |

The first 5 points have `ty = 2000` and `dis = 500`, placing the cube far away
and offset vertically — it slides into view as the spline interpolates toward
the next control points where `ty = 0` and `dis` decreases.

The 10 padding entries at the end hold all values at zero, creating a smooth
deceleration into stillness.

---

## B-Spline Interpolation

The `getspl()` function evaluates a **cubic B-spline** at an arbitrary position
along the animation timeline:

```javascript
function getspl(pos) {
  const i = pos >> 8;          // control point index (integer part)
  const f = pos & 0xFF;       // fractional position (0–255) within segment
  const r = new Float64Array(8);
  for (let p = 0; p < 8; p++) {
    r[p] = ((ANIM_SPLINE[ci][p]  * SPLINE_COEFF[f] +
             ANIM_SPLINE[ci1][p] * SPLINE_COEFF[f + 256] +
             ANIM_SPLINE[ci2][p] * SPLINE_COEFF[f + 512] +
             ANIM_SPLINE[ci3][p] * SPLINE_COEFF[f + 768]) * 2) >> 16;
  }
  return { tx, ty, dis, kx, ky, kz, ls_kx, ls_ky };
}
```

The position `pos` is a **fixed-point number**: the high bits select which 4
control points to blend, and the low 8 bits (0–255) represent how far between
them. The `SPLINE_COEFF` array holds 1024 pre-computed **basis function
weights** (4 sets of 256 values).

```
  SPLINE_COEFF layout (1024 entries):

  Index:     0–255      256–511     512–767     768–1023
  Weight:    w0(f)       w1(f)       w2(f)       w3(f)

  For fractional position f, the output is:
  result = P[i+3]×w0(f) + P[i+2]×w1(f) + P[i+1]×w2(f) + P[i]×w3(f)
```

The weights ensure **C² continuity** — the interpolated path has no sudden
jumps in position, velocity, or acceleration. This is why the cube's rotation
feels smooth rather than jerky.

```
  Control points:         P0        P1        P2        P3        P4
                           ●─────────●─────────●─────────●─────────●

  B-spline curve:         ●╌╌╌╌╌╌╌╌╌●╌╌╌╌╌╌╌╌╌●╌╌╌╌╌╌╌╌╌●╌╌╌╌╌╌╌╌●
                          smooth, doesn't pass through points exactly

  Linear interpolation:   ●─────────●─────────●─────────●─────────●
                          passes through points but has sharp corners
```

---

## Frame-to-Spline Mapping

Each render call converts wall-clock seconds to a spline position:

```javascript
const frame = Math.floor(t * FRAME_RATE);    // 70 fps
const sp = getspl(4 * 256 + frame * 4);
```

The `4 * 256` offset skips past the first 4 control points (the spline needs
a window of 4 points, so evaluation starts at index 4). Each frame advances
the spline position by 4 units. At 70 fps, the full 46-point animation plays
out over approximately 28 seconds — matching the classic's timing exactly.

---

## Euler Rotation Matrix

The spline outputs three rotation angles (`kx`, `ky`, `kz`) in a 0–1023
range. These become a **ZYX Euler rotation** matrix:

```javascript
const toRad = PI / 512;   // 1024 steps = 2π
const sx = Math.sin(sp.kx * toRad), cx = Math.cos(sp.kx * toRad);
const sy = Math.sin(sp.ky * toRad), cy = Math.cos(sp.ky * toRad);
const sz = Math.sin(sp.kz * toRad), cz = Math.cos(sp.kz * toRad);
```

The 3×3 rotation is built from the standard ZYX multiplication
`R = Rz × Ry × Rx`:

```
  ┌                                     ┐
  │  cy·cz          cy·sz         -sy   │
  │  sx·sy·cz-cx·sz sx·sy·sz+cx·cz sx·cy│
  │  cx·sy·cz+sx·sz cx·sy·sz-sx·cz cx·cy│
  └                                     ┘
```

This matrix rotates the cube's local axes into world space. The same matrix is
used in the classic — both variants rotate identically for a given frame.

---

## Coordinate System Conversion

The 1993 original used a coordinate system where **+Y points down** and **+Z
points forward** (toward the camera). OpenGL uses **+Y up** and **-Z forward**.
The `buildModelView()` function compensates by negating the Y and Z rows:

```javascript
return {
  mv: new Float32Array([
    r00,  -r10,  -r20, 0,     // X row: unchanged
    r01,  -r11,  -r21, 0,     // Y row: negated (flip up/down)
    r02,  -r12,  -r22, 0,     // Z row: negated (flip forward/back)
    sp.tx, -sp.ty, -sp.dis, 1, // translation: Y and Z negated
  ]),
  normalMat: new Float32Array([...]),  // 3×3 rotation for normals
};
```

```
  Classic (DOS VGA):           OpenGL:

       +Z (forward)               +Y (up)
        ↗                          ↑
       ╱                           │
      ╱                            │
     ●──────→ +X               ────●────→ +X
     │                            ╱
     │                           ╱
     ↓                          ↙
    +Y (down)               +Z (out of screen)
```

Without this conversion, the cube would appear upside-down and mirrored. The
negation is applied to the **model-view matrix** so the vertex shader can use
a standard `gl_Position = uMVP * vec4(aPosition, 1.0)` without special cases.

---

## Perspective Projection

The model-view matrix is multiplied by a perspective projection matrix:

```javascript
const proj = mat4Perspective(0.9, aspect, 10, 5000);
const mvp = mat4Multiply(proj, mv);
```

`mat4Perspective(fovY=0.9, aspect, near=10, far=5000)` creates a frustum:

```
  Side view of the frustum:

  near=10                      far=5000
    ├───┐                        ┌─────────────────────────────────┤
    │    ╲                      ╱                                  │
    │     ╲    fovY = 0.9 rad  ╱                                   │
  ──●      ╲    (~51.6°)      ╱                                    │
  eye│      ╲                ╱                                     │
    │       ╲              ╱                                       │
    ├────────╲────────────╱────────────────────────────────────────┤
              visible volume
```

The field of view (0.9 radians ≈ 51.6°) is moderately narrow, matching the
classic's `245 / zz` perspective division factor. The near/far planes (10–5000)
encompass the cube at its closest approach (~300 units) through its farthest
distance (~500 units at the start).

The combined **MVP matrix** is uploaded as a single uniform and transforms each
vertex in the vertex shader:

```glsl
gl_Position = uMVP * vec4(aPosition, 1.0);
```

---

## The Normal Matrix

Surface normals require special handling. If the model-view matrix includes
non-uniform scaling, using the same matrix for normals would distort them.
The correct transform is the **inverse transpose** of the 3×3 rotation:

```javascript
normalMat: new Float32Array([r00, r10, r20, r01, r11, r21, r02, r12, r22])
```

Since the model-view here is a pure rotation + translation (no scaling), the
inverse transpose is simply the **transpose** of the rotation — which is
computed by swapping row/column order. The vertex shader uses this to transform
normals into world space:

```glsl
vWorldNormal = normalize(uNormalMat * aNormal);
```

The normals are then used in [Layer 4](04-diffuse-lighting.md) for lighting.

---

## Classic vs Remastered

| Aspect | Classic | Remastered |
|--------|---------|------------|
| Spline evaluation | Identical `getspl()` function | Same |
| Control point data | Identical `ANIM_SPLINE` table | Same |
| Rotation | Integer fixed-point `sinTab`/`cosTab` | `Math.sin()`/`Math.cos()` (float) |
| Projection | `sx = (xx × 245) / zz + 160` | 4×4 perspective matrix |
| Coordinate system | Native +Y down, +Z forward | Converted to OpenGL in `buildModelView` |
| Matrix upload | Not needed (CPU transform) | `uniformMatrix4fv` for GPU |

---

**Next:** [Layer 4 — Diffuse Lighting](04-diffuse-lighting.md)
