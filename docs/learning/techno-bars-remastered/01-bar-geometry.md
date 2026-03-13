# Layer 1 — Bar Geometry and Rotation

**Source:** `src/effects/technoBars/effect.remastered.js`, lines 68–187 (BARS_FRAG shader), lines 98–123 (evalBars function)
**Concepts:** 2D rotation via sinusoidal vectors, modular distance for parallel bars, anti-aliasing with fwidth()

---

## What This Layer Covers

Before colour, before motion, before post-processing, we need to answer one
question for every pixel on screen: **is this pixel inside a bar?** This layer
explains:

- How a single rotation angle defines the orientation of all 11 bars
- How two direction vectors (extent and spacing) form a coordinate system
- How modular distance tests all 11 bars with a single computation
- How `fwidth()` produces resolution-independent anti-aliased edges
- How 4 planes are evaluated independently and their coverage summed

---

## The Sin1024 Function

The techno bars use a custom sine function that maps a 1024-step period to
integer-scaled output, matching the original 1993 lookup table:

```glsl
float sin1024(float idx) {
  return sin(idx * TAU / 1024.0) * 255.0;
}
```

Where `TAU = 2π`. Input `idx` is a rotation index (0–1023 for one full
revolution). Output ranges from −255 to +255. The original used a
pre-computed 1024-entry integer table; the remastered computes it directly
with GLSL `sin()`.

---

## Direction Vectors: Extent and Spacing

A set of 11 parallel bars is fully described by a rotation angle `rot` and a
spacing parameter `vm`. From these, two direction vectors are derived:

```glsl
float hx = sin1024(rotVal) * 16.0 * 1.2;
float hy = sin1024(rotVal + 256.0) * 16.0;
float vx = sin1024(rotVal + 256.0) * 1.2 * vmVal / 100.0;
float vy = sin1024(rotVal + 512.0) * vmVal / 100.0;
```

The **h-vector** `(hx, hy)` defines the long axis of each bar — the direction
the bar extends along. The **v-vector** `(vx, vy)` defines the perpendicular
spacing between bars. Together they form a 2D coordinate system:

```
         v-vector (spacing)
           ↗
          ╱
    ─────╱────  bar +2
    ────╱─────  bar +1
   ───╱──────   bar  0    ─────→ h-vector (extent)
    ─╱───────   bar −1
   ─╱────────   bar −2
```

The `+ 256` and `+ 512` offsets in the sine indices create 90° phase shifts.
Since `sin1024(x + 256) = cos1024(x)` (a quarter-period shift), the h and v
vectors are perpendicular. The `1.2` factor stretches the horizontal component
to account for the 320×200 aspect ratio (pixels were not square on VGA).

The `vm` (spacing magnitude) parameter controls how far apart the bars are.
When `vm` is large, bars are widely spaced with visible gaps. When `vm`
collapses toward zero, bars overlap and the pattern becomes dense.

---

## The Inverse-2×2 System

To test whether a pixel at position `pos` lies inside any bar, we need to
express `pos` in bar-local coordinates. The `evalBars` function transforms
pixel coordinates into the `(s, t)` coordinate system defined by `h` and `v`:

```glsl
float evalBars(vec2 pos, float rotVal, float vmVal, vec2 center) {
  // ... compute hx, hy, vx, vy ...

  vec2 d = (pos - center) * 16.0;
  vec2 u = vec2(hx, hy);
  vec2 v = vec2(vx, vy);

  float cross_uv = u.x * v.y - u.y * v.x;
  if (abs(cross_uv) < 0.01) return 0.0;

  float s = (d.x * v.y - d.y * v.x) / cross_uv;
  float t = (u.x * d.y - u.y * d.x) / cross_uv;
```

This solves the linear system `d = s·u + t·v` using **Cramer's rule**. The
`cross_uv` term is the determinant of the 2×2 matrix `[u | v]`. If it is
near zero, the two vectors are parallel and no valid coordinate system exists
(the bars have collapsed to zero width).

After solving:
- **s** measures distance along the bar's long axis (the h-direction)
- **t** measures distance perpendicular to the bars (the v-direction)

```
    t
    ↑
    │     ╔═══╗
    │     ║   ║  bar +1
    │     ╚═══╝
    │     ╔═══╗
    0 ────║───║──────→ s
    │     ╚═══╝  bar  0
    │     ╔═══╗
    │     ║   ║  bar −1
    │     ╚═══╝
```

---

## Modular Distance: Testing All 11 Bars at Once

The clever part: instead of testing each bar individually, the shader uses
**modular arithmetic** to find the nearest bar:

```glsl
float nearest = round(t / 4.0) * 4.0;
```

The bars are spaced 4 units apart in `t`-space (at `t = -20, -16, -12, ...,
0, ..., 12, 16, 20`). Dividing by 4 and rounding finds the nearest multiple
of 4 — the `t`-coordinate of the closest bar centre. The distance from the
pixel to that bar centre is then `|t - nearest|`.

This single operation replaces what would otherwise be an 11-iteration loop.
No matter how many bars there are, the cost is the same.

```
t-axis:  -20  -16  -12   -8   -4    0    4    8   12   16   20
          │    │    │    │    │    │    │    │    │    │    │
bars:     ═    ═    ═    ═    ═    ═    ═    ═    ═    ═    ═

For a pixel at t = 5.7:
  round(5.7 / 4) * 4 = round(1.425) * 4 = 1 * 4 = 4
  distance = |5.7 - 4| = 1.7
  → pixel is 1.7 units from bar centre at t=4
```

---

## Anti-Aliasing with fwidth()

Hard edges look jagged, especially at high resolutions. The shader uses
`fwidth()` for resolution-independent **anti-aliasing**:

```glsl
float fw_s = fwidth(s);
float fw_t = fwidth(t);
float aa_s = 1.0 - smoothstep(1.0 - fw_s * 1.5, 1.0 + fw_s * 1.5, abs(s));
float aa_t = 1.0 - smoothstep(1.0 - fw_t * 1.5, 1.0 + fw_t * 1.5, abs(t - nearest));
float in_range = step(abs(nearest), 20.5);

return aa_s * aa_t * in_range;
```

**`fwidth(x)`** returns the sum of the absolute partial derivatives of `x`
with respect to screen coordinates — in plain terms, it measures how fast `x`
changes per pixel. Where `x` changes slowly (zoomed-in regions), `fwidth` is
small and the edge is sharp. Where `x` changes rapidly (zoomed-out regions),
`fwidth` is larger and the edge softens proportionally.

The `smoothstep` creates a gradual transition from 1.0 (fully inside the bar)
to 0.0 (fully outside) across a narrow band proportional to `fwidth`. The
`1.5` multiplier widens the band slightly for smoother edges.

```
Without anti-aliasing:        With fwidth() anti-aliasing:

 ██████████████████            ▓█████████████████▓
 ██████████████████            ████████████████████
 ██████████████████            ████████████████████
                               ▓█████████████████▓
 (jagged stair-step            (smooth gradient at
  edges at diagonals)           edges, any resolution)
```

The final `in_range` term ensures only the 11 bars nearest to the centre
contribute — bars beyond `|nearest| = 20` are culled.

---

## Evaluating 4 Planes

The main function evaluates `evalBars` four times — once for each of the
4 bit planes inherited from the classic architecture:

```glsl
float cov0 = evalBars(pos, uBarRot[0], uBarVm[0], vec2(uBarWx[0], uBarWy[0])) * uPlaneActive[0];
float cov1 = evalBars(pos, uBarRot[1], uBarVm[1], vec2(uBarWx[1], uBarWy[1])) * uPlaneActive[1];
float cov2 = evalBars(pos, uBarRot[2], uBarVm[2], vec2(uBarWx[2], uBarWy[2])) * uPlaneActive[2];
float cov3 = evalBars(pos, uBarRot[3], uBarVm[3], vec2(uBarWx[3], uBarWy[3])) * uPlaneActive[3];
```

Each plane has its own rotation, spacing, and centre position — taken from
different frames of the animation state machine (Layer 3). The `uPlaneActive`
uniform is 0 or 1, masking out planes that have not yet been filled (during
the first 32 frames when the circular buffer is still populating).

Each `evalBars` call returns a coverage value between 0.0 and 1.0. These are
summed to produce an **overlap count** between 0 and 4, which drives the
colour ramp (Layer 4).

```
Plane 0:  ═══╗     Plane 1:   ╔═══     Plane 2:  ─────     Plane 3:   ╱╱╱
          ═══╝                 ╚═══               ─────                ╱╱╱

Overlap = 0 (black) ... 1 (dim) ... 2 (medium) ... 3 (bright) ... 4 (brightest)
```

Where multiple planes cross, the overlap count is higher, and the pixel is
brighter. This is the essence of the interference pattern.

---

**Next:** [Layer 2 — EGA Bit-Plane History](02-ega-history.md)
