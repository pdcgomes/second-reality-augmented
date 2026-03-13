# Layer 1 — The Rotozoom Formula

**Source:** `src/effects/rotozoom/effect.js`, lines 131–158 (classic CPU loop); `src/effects/rotozoom/effect.remastered.js`, lines 140–143 (GPU shader)
**Concepts:** 2D rotation matrix, uniform scaling, affine texture mapping, displacement vectors

---

## What This Layer Covers

The rotozoom is one of the most fundamental demoscene techniques. It takes a
flat image and simultaneously **rotates** and **zooms** it, creating hypnotic
motion from a single static picture. This layer explains:

- How a 2D rotation matrix works
- How scaling is folded into the same multiplication
- Why the whole effect needs only **4 multiplies per pixel**
- How the classic CPU loop and the GPU shader express the same maths differently
- How the texture coordinate grid itself rotates

---

## The 2D Rotation Matrix

To rotate a point `(x, y)` by angle `θ` around the origin, you multiply by a
2×2 rotation matrix:

```
┌ x' ┐   ┌ cos θ   -sin θ ┐ ┌ x ┐
│    │ = │                 │ │   │
└ y' ┘   └ sin θ    cos θ ┘ └ y ┘
```

Expanding:

```
x' = x·cos(θ) - y·sin(θ)
y' = x·sin(θ) + y·cos(θ)
```

That is **4 multiplies and 2 adds** per point. Every pixel on screen becomes
a point to transform.

---

## Adding Scale

To zoom at the same time as rotating, multiply the rotation matrix by a scalar
`s`. The combined rotozoom matrix becomes:

```
┌ x' ┐   ┌ s·cos θ   -s·sin θ ┐ ┌ x ┐
│    │ = │                     │ │   │
└ y' ┘   └ s·sin θ    s·cos θ ┘ └ y ┘
```

Still 4 multiplies per point. The scale factor is absorbed into the
pre-computed `cos` and `sin` values, costing nothing extra at runtime.

---

## The Displacement Vector Trick

The classic 1993 code does not use a matrix multiply per pixel. Instead, it
pre-computes two **displacement vectors** that advance through texture space:

```
pixel step (per column):  npU =  cos(d2) × scale
                          npV =  sin(d2) × scale

line step (per row):      nlU = -npV × aspectRatio
                          nlV =  npU × aspectRatio
```

The **pixel step** is the direction you move in texture space when stepping one
pixel to the right on screen. The **line step** is the direction you move when
stepping one row down. Because rotation makes "right" and "down" point in
arbitrary directions in texture space, these vectors encode both the rotation
angle and the zoom level.

```
                       Texture space (256×256)
                    ┌─────────────────────────┐
                    │                         │
                    │    ╲  line step (nlU,nlV)│
                    │     ╲                   │
                    │      ● start            │
                    │     ╱                   │
                    │    ╱  pixel step         │
                    │       (npU, npV)         │
                    │                         │
                    └─────────────────────────┘

  The two vectors define a rotated/scaled grid laid over the texture.
  Walking along "pixel step" traces one row of the output.
  Walking along "line step" moves to the next row.
```

---

## The Classic CPU Loop

Here is the inner loop from `effect.js`. For each of the 160×100 output pixels,
it adds the displacement vectors to walk through texture space:

```javascript
let u1 = startX, v1 = startY;
let ofs = 0;
for (let y = 0; y < H; y++) {       // H = 100 rows
  let u = u1 + nlU;                 // step to next line
  let v = v1 + nlV;
  u1 = u; v1 = v;
  for (let x = 0; x < W; x++) {     // W = 160 columns
    u += npU;                        // step to next pixel
    v += npV;
    fb[ofs++] = rotpic[((v & 0xFF) << 8) | (u & 0xFF)];
  }
}
```

Key observations:

- **No multiplies inside the loop** — only additions. The expensive `sin`/`cos`
  are computed once per frame, not per pixel.
- **`& 0xFF`** wraps coordinates to 0–255, making the 256×256 texture tile
  seamlessly with a single bitmask. No modulo, no branch.
- **`<< 8`** is equivalent to `× 256` — turning a 2D `(u, v)` coordinate into
  a 1D array index using a bit shift.
- The `startX`/`startY` values determine where the upper-left corner of the
  output lands in texture space. They orbit over time (see Layer 3).

---

## The GPU Equivalent

The remastered variant computes the same transform but lets the GPU apply it in
parallel. The CPU passes three **uniforms** per frame:

```javascript
// effect.remastered.js, render()
gl.uniform2f(su.base,  baseU, baseV);           // upper-left corner in tex space
gl.uniform2f(su.spanX, W * npU, W * npV);       // total X span across 160 cols
gl.uniform2f(su.spanY, H * nlU, H * nlV);       // total Y span across 100 rows
```

The fragment shader uses these to compute the texture coordinate for every
pixel simultaneously:

```glsl
// SCENE_FRAG, line 142
float fy = 1.0 - vUV.y;
vec2 texCoord = uBase + vUV.x * uSpanX + fy * uSpanY;
vec2 texUV = texCoord / 256.0;
```

`vUV` ranges from (0,0) at bottom-left to (1,1) at top-right. By multiplying
`vUV.x` by the total X span and `fy` by the total Y span, the shader
reconstructs the same affine mapping the CPU loop walks through additively.

```
Classic CPU:                     GPU shader:
─────────────                    ───────────
u += npU (per pixel)             texCoord = uBase + vUV.x * uSpanX
v += npV (per pixel)                              + fy   * uSpanY

160×100 = 16,000 additions       1 formula per fragment (millions in parallel)
```

---

## Why "Affine"?

The transform is called **affine** because it is a linear mapping plus a
translation. An affine transform preserves:

- **Parallel lines** — straight lines in the texture remain straight on screen
- **Ratios of distances** — evenly spaced points in the texture remain evenly spaced

It does NOT preserve:
- **Angles** (lines get rotated)
- **Distances** (lines get scaled)

This is exactly what a rotozoom does — the grid of texture samples is a
uniformly rotated and scaled version of the original pixel grid. No per-pixel
perspective correction is needed, which is why the effect is so cheap.

---

## Visualising the Rotating Grid

As the rotation angle `d2` increases over time, the displacement vectors rotate.
Here is what the texture sampling grid looks like at different angles:

```
θ = 0° (no rotation):       θ = 30°:                 θ = 60°:
┌─┬─┬─┬─┬─┐               ╱╱╱╱╱╱                   ╱  ╱  ╱  ╱
├─┼─┼─┼─┼─┤              ╱╱╱╱╱╱                   ╱  ╱  ╱  ╱
├─┼─┼─┼─┼─┤             ╱╱╱╱╱╱                   ╱  ╱  ╱  ╱
├─┼─┼─┼─┼─┤            ╱╱╱╱╱╱                   ╱  ╱  ╱  ╱
└─┴─┴─┴─┴─┘           ╱╱╱╱╱╱                   ╱  ╱  ╱  ╱

Grid lines are perfectly       The grid tilts.         Grid is heavily tilted.
aligned with the texture.      The image appears        The image appears
                               rotated on screen.       rotated further.
```

As scale decreases, the grid lines get **closer together** — more of the
texture is visible, making it look zoomed out. As scale increases, the grid
lines get **further apart** — less texture is visible, appearing zoomed in.

---

## The Aspect Ratio Correction

The original demo ran at 320×200 on a 4:3 monitor. Pixels were not square —
they were taller than wide. The constant `ASPECT_RATIO = 307 / 256 ≈ 1.199`
corrects for this:

```javascript
const nlU = -npV * ASPECT_RATIO;
const nlV =  npU * ASPECT_RATIO;
```

Without this correction, circles in the texture would appear as ovals on
screen. The line step is scaled by the aspect ratio so that stepping "down"
in screen space covers proportionally more texture space than stepping "right".

---

## Key Takeaways

| Concept | What to remember |
|---------|-----------------|
| **Rotation matrix** | `cos θ` and `sin θ` define how the texture grid tilts |
| **Uniform scale** | Multiplied into the cos/sin values — zero extra cost |
| **Displacement vectors** | Pre-computed once per frame, then added per-pixel |
| **Classic trick** | No multiplies in the inner loop — only integer additions |
| **GPU version** | One linear equation per fragment replaces the entire loop |
| **Affine mapping** | Straight lines stay straight; the grid stays uniform |
| **Aspect ratio** | 307/256 corrects for non-square VGA pixels |

---

**Next:** [Layer 2 — Texture and Sampling](02-texture-sampling.md)
**Back to:** [Overview](00-overview.md)
