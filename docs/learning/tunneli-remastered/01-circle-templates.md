# Layer 1 — Circle Templates

**Source:** `src/effects/tunneli/effect.js`, lines 47–58 (classic pcalc), `src/effects/tunneli/effect.remastered.js`, lines 382–387 (remastered ring generation)
**Concepts:** elliptical dot placement, aspect ratio correction, precomputed geometry templates

---

## What This Layer Covers

The tunnel is built from concentric rings of dots. Each ring is an ellipse of
discrete points, placed at regular angles around the circumference. This layer
explains:

- How dots are placed on an ellipse using `sin` and `cos`
- Why the ellipse is 1.7× wider than tall (aspect ratio correction)
- How the classic precomputes 138 ring templates at different radii
- How the remastered computes ring positions on-the-fly

---

## A Ring of Dots

To place N dots evenly around a circle of radius R, you use:

```
for a = 0 to N-1:
  x = centre_x + sin(a × 2π / N) × R
  y = centre_y + cos(a × 2π / N) × R
```

Each dot sits at a different angle around the circle. With 64 dots (the
classic's count), the angular step is `2π / 64 = π/32` radians — about 5.6°
between dots. At small radii the dots merge into a solid ring; at large
radii gaps become visible.

---

## The Aspect Ratio Trick

The classic ran on a VGA 320×200 display, but VGA pixels were not square.
The physical screen had a 4:3 aspect ratio, which means horizontal pixels
were narrower than vertical ones. A circle drawn with equal x and y radii
would appear as a tall oval on the actual monitor.

To compensate, TRUG multiplied the x-radius by **1.7**:

```javascript
// Classic: precomputed ring templates
for (let z = 10; z < 148; z++) {
  const ring = new Array(64);
  for (let a = 0; a < 64; a++) {
    ring[a] = {
      x: 160 + Math.trunc(Math.sin(a * Math.PI / 32) * (1.7 * z)),
      y: 100 + Math.trunc(Math.cos(a * Math.PI / 32) * z),
    };
  }
  pcalc[z - 10] = ring;
}
```

The factor 1.7 is close to 320/200 = 1.6, accounting for the pixel aspect
ratio. Circles with `x_radius = 1.7 × y_radius` appear as perfect circles on
a 4:3 CRT monitor. The remastered preserves this factor to maintain visual
compatibility.

---

## 138 Precomputed Templates

The classic creates **138 ring templates** covering radii from 10 (the
smallest, farthest ring) to 147 (the largest, nearest ring). Each template
is an array of 64 `{x, y}` pairs — the absolute screen coordinates where
each dot goes:

```
pcalc[0]   → radius 10  (tiny ring, used for the farthest circles)
pcalc[50]  → radius 60  (medium ring)
pcalc[137] → radius 147 (largest ring, nearest circles)
```

Why precompute? In 1993, computing 64 `sin` and `cos` values per ring per
frame was expensive. By storing the coordinates once at startup, the
rendering loop becomes a simple array copy — just look up `pcalc[radius]`
and plot the dots.

The `sade[]` perspective table (covered in Layer 2) maps each circle's depth
index to a `pcalc` template index. Far circles use small-radius templates;
near circles use large-radius templates.

---

## Remastered: On-the-Fly Computation

The remastered variant does not precompute ring templates. Instead, it
computes dot positions each frame using floating-point trigonometry:

```javascript
const angleStep = PI * 2 / dotsPerRing;
for (let a = 0; a < dotsPerRing; a++) {
  const angle = a * angleStep;
  const dx = 160 + Math.sin(angle) * 1.7 * radius + bx;
  const dy = 100 + Math.cos(angle) * radius + by;
  // ...
}
```

This has two advantages:

1. **Variable dot count**: The number of dots per ring is configurable (64 to
   512) via the editor. With precomputed templates, you would need separate
   arrays for each possible dot count.

2. **Floating-point precision**: No `Math.trunc` rounding. The sub-pixel
   positions are passed to the GPU's vertex shader, which maps them smoothly
   to screen coordinates. Combined with the Gaussian-splat fragment shader,
   this produces smooth, anti-aliased dots.

The computational cost is negligible on modern hardware — 77 rings × 144 dots
= ~11,000 `sin`/`cos` evaluations per frame, which takes under a millisecond.

---

## The 320×200 Coordinate System

Both variants compute dot positions in the classic's 320×200 coordinate
space. The screen centre is at (160, 100). The remastered's vertex shader
maps these to WebGL's normalised device coordinates (NDC):

```glsl
vec2 ndc = (aPosition / vec2(160.0, 100.0)) - 1.0;
ndc.y = -ndc.y;
gl_Position = vec4(ndc, 0.0, 1.0);
```

This division by (160, 100) maps the range [0, 320] → [-1, 1] and
[0, 200] → [-1, 1]. The y-flip (`-ndc.y`) accounts for the difference
between screen coordinates (y=0 at top) and NDC (y=-1 at bottom).

---

**Next:** [Layer 2 — Depth and Perspective](02-depth-and-perspective.md)
