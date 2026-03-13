# Layer 4 — GPU VoxelSpace

**Source:** `src/effects/coman/effect.remastered.js` lines 39–168 (`SCENE_FRAG`)
**Concepts:** Fragment shader raymarching, bilinear height interpolation, per-pixel ray stepping, analytical band test

---

## What This Layer Covers

The classic COMAN renders 160 columns on the CPU, one at a time. The
remastered variant moves the entire VoxelSpace march into a **GLSL fragment
shader**, running one ray per screen pixel at native display resolution.

This layer explains:

- How the CPU column loop maps to a per-fragment shader
- How the shader performs manual bilinear height interpolation
- How the "band test" replaces the classic's inner pixel-filling loop
- How the bail-and-double optimisation works in shader form
- Why this approach scales to any resolution with no code changes

---

## From CPU Columns to GPU Fragments

The classic algorithm has two nested loops:

```
  Outer: for each of 160 columns       → parallel in GPU
    Inner: for j = 0..191 (ray steps)  → sequential per fragment
      Innermost: fill pixels upward    → replaced by analytical test
```

On the GPU, the outer loop disappears — each fragment (pixel) runs the
shader independently. But the inner march loop **must remain sequential**
because each step depends on the previous step's accumulated ray height.

```
  Classic (CPU):                   Remastered (GPU):
  ┌──────────────────────┐        ┌──────────────────────┐
  │ for col = 0..159:    │        │ Each pixel runs the  │
  │   march 192 steps    │        │ full 128-step march  │
  │   fill pixel column  │        │ independently.       │
  │                      │        │                      │
  │ 160 sequential cols  │        │ Millions of parallel │
  │ ~30K steps total     │        │ fragments, each 128  │
  └──────────────────────┘        │ steps                │
                                  └──────────────────────┘
```

More total work, but the GPU's massive parallelism makes it faster.

---

## The Fragment Shader Structure

The `SCENE_FRAG` shader does all terrain rendering. Each fragment determines
which screen column and row it represents, then marches a ray to find terrain:

```glsl
void main() {
  // Map fragment to classic 320×200 coordinate space
  float col = (gl_FragCoord.x / res.x - 0.5) * 160.0;
  float pixelRow = (1.0 - gl_FragCoord.y / res.y) * 200.0;

  // Compute ray direction from camera rotation
  float dx = (col * uRCos + 160.0 * uRSin) / 256.0;
  float dy = (160.0 * uRCos2 - col * uRSin2) / 256.0;

  // March the ray (128 iterations)
  for (int iter = 0; iter < 128; iter++) {
    // ... sample terrain, test band, break on hit ...
  }

  fragColor = vec4(color, 1.0);
}
```

### Resolution mapping

The shader maps its pixel position to the classic 160-column coordinate
space: `(gl_FragCoord.x / res.x - 0.5) * 160.0`. This means a 1920-pixel-
wide display still uses the same terrain coordinates as the 160-column
original — but with 1920 distinct ray directions instead of 160.

```
  Classic:    ▓▓ ▓▓ ▓▓ ▓▓ ▓▓   (160 columns, pixel-doubled)
  Remastered: ▓▓▓▓▓▓▓▓▓▓▓▓▓▓   (1920 columns, smooth)
```

---

## Bilinear Height Interpolation

The classic reads height maps with integer indexing — each terrain sample
snaps to the nearest grid point. The remastered variant performs **manual 1D
bilinear interpolation** for smooth terrain between grid points:

```glsl
float sampleWave(sampler2D tex, float pos) {
  float idx = mod(pos * 0.5, 32768.0);       // wrap to array range
  float i0f = floor(idx);
  float frac = idx - i0f;                     // fractional part
  int i0 = int(i0f);
  int i1 = i0 + 1;
  if (i1 >= 32768) i1 = 0;                   // wrap boundary

  // Read two adjacent height values
  float v0 = texelFetch(tex, ivec2(i0 & 255, (i0 >> 8) & 127), 0).r;
  float v1 = texelFetch(tex, ivec2(i1 & 255, (i1 >> 8) & 127), 0).r;

  return mix(v0, v1, frac);   // linear blend between neighbours
}
```

### Why manual interpolation?

The height map is stored as a 2D texture (256×128), but accessed as a **1D
wrapping array**. Standard GPU bilinear filtering (`gl.LINEAR`) would
interpolate in 2D — blending across row boundaries incorrectly. Manual 1D
interpolation ensures correct wrapping:

```
  2D texture memory:
  ┌──────────────────────┐
  │ row 0: [0] [1] ... [255] │
  │ row 1: [256] [257] ...   │  ← 2D bilinear would blend row 0 ↔ row 1
  └──────────────────────┘       at column 255, which is WRONG

  Correct 1D wrapping:
  [...253] [254] [255] → [256] [257] [258]...
                       ↑ wraps to next row (correct neighbour)
```

The `texelFetch()` function bypasses all GPU filtering and reads exact texel
values. The shader then performs `mix(v0, v1, frac)` — a linear blend — to
get smooth interpolation between the two nearest 1D neighbours.

### The visual difference

```
  Integer sampling (classic):    Bilinear sampling (remastered):
  ┌──┐  ┌──┐  ┌──┐              ╱‾‾╲  ╱‾‾╲  ╱‾‾╲
  │  │  │  │  │  │              ╱    ╲╱    ╲╱    ╲
  │  └──┘  └──┘  │             ╱                  ╲
  staircase heights             smooth rolling terrain
```

---

## The Analytical Band Test

The classic inner loop fills pixels one by one with a `while` loop. On the
GPU, each fragment needs to know: "does **my** specific pixel row fall inside
the terrain band at this ray step?" This is an **analytical test** — no
inner loop needed:

```glsl
float n;
if (l < 0.0001) {
  n = destRow - colTopRow;
} else {
  n = (h - rayHeight) / l;          // how many rows this terrain covers
  n = min(n, destRow - colTopRow);   // clamp to available space
}

float bandTop = destRow - n;

if (pixelRow <= destRow && pixelRow > bandTop) {
  // THIS fragment's row is inside the terrain band — colour it
  color = ...;
  found = true;
  break;
}
```

The variable `n` computes how many screen rows the terrain band occupies at
this depth. `destRow - n` gives the top edge of the band. If the fragment's
row falls between `bandTop` and `destRow`, we have a hit.

```
  Ray step j produces a terrain band:

  destRow ──→ ┃████████┃  ← bottom of band
              ┃████████┃
  bandTop ──→ ┃████████┃  ← top of band
              ┃        ┃  ← above: filled by later (farther) steps
```

If the fragment hits, it `break`s out of the march loop immediately — this
is the front-to-back occlusion. Once a closer terrain band claims this pixel,
no farther terrain can overwrite it.

---

## Bail-and-Double in the Shader

The classic doubles step size at iteration 64. The shader version uses a
**remapped index** to achieve the same effect in 128 iterations:

```glsl
for (int iter = 0; iter < 128; iter++) {
  if (destRow < colTopRow) break;

  int j = (iter < 64) ? iter : (64 + (iter - 64) * 2);

  if (iter == 64) {
    localDx *= 2.0;
    localDy *= 2.0;
  }
  // ...
}
```

For iterations 0–63, `j = iter` (fine steps). For iterations 64–127,
`j = 64 + (iter - 64) * 2` (coarse steps, advancing by 2). The step
direction `(localDx, localDy)` doubles at iteration 64.

This produces the same depth coverage as the classic's 192-step loop but
in only 128 shader iterations — important because GPUs prefer shorter loops
with predictable length.

```
  iter:  0  1  2 ... 63  64  65  66  67 ...
  j:     0  1  2 ... 63  64  66  68  70 ...
                          ↑ step doubles
```

---

## The Perspective Constant

Both variants use the same perspective factor:

```glsl
const float PERSP = 2560.0 / 65536.0;   // ≈ 0.039
```

This converts ray step index `j` to a projection scale factor. At step `j`,
each unit of terrain height maps to `j × PERSP` screen rows. Near terrain
(small `j`) maps to many rows; distant terrain (large `j`) maps to few rows.

```
  j=0:     l = 0.000  → terrain fills entire remaining column
  j=10:    l = 0.391  → 1 unit of height ≈ 0.4 rows
  j=64:    l = 2.500  → 1 unit of height ≈ 2.5 rows
  j=128:   l = 5.000  → 1 unit of height ≈ 5 rows (diminished detail)
```

---

## Ray State Maintenance

Even though the GPU runs fragments in parallel, each fragment maintains its
own sequential ray state through the march loop:

```glsl
float rayHeight = 0.0;
float rayInc = -(200.0 - horizonRow) * PERSP;
float destRow = 199.0;

for (int iter = 0; iter < 128; iter++) {
  // ... terrain sampling and band test ...

  // Advance the ray's projected height
  if (l >= 0.0001) {
    rayHeight += n * l;
  }
  rayInc += n * PERSP;
  destRow -= n;

  rayHeight += rayInc;
  if (iter == 64) rayHeight += rayInc;
}
```

- **`rayHeight`** — the ray's accumulated projected height (increases as the
  ray descends through perspective)
- **`rayInc`** — per-step height increment (grows as closer terrain consumes
  more screen rows)
- **`destRow`** — the next available row for terrain drawing (decreases as
  bands are placed)

These three variables track the same state as the classic CPU version, just
computed per fragment instead of per column.

---

## Why This Scales to Any Resolution

The shader reads `gl.drawingBufferWidth` and `gl.drawingBufferHeight` from
the `uResolution` uniform. The column coordinate `col` is derived from the
normalised pixel position:

```glsl
float col = (gl_FragCoord.x / res.x - 0.5) * 160.0;
```

At 320 pixels wide, this gives 320 distinct columns (matching classic). At
3840 pixels wide (4K), it gives 3840 columns — no code changes needed. The
terrain is sampled with bilinear interpolation, so higher resolutions
produce smoother results, not just more aliased copies.

---

## Key Takeaways

- The VoxelSpace column loop maps naturally to a **per-fragment shader** —
  each pixel independently marches its own ray
- **Manual 1D bilinear interpolation** is necessary because the height maps
  wrap as 1D arrays stored in 2D textures
- The **analytical band test** replaces the classic's inner pixel loop with
  a single conditional — GPU-friendly, no inner loops
- **Bail-and-double** is remapped to 128 iterations with a doubled index
  for the far field
- The shader is **resolution-independent** by design — it adapts to any
  canvas size via normalised coordinates

---

**Previous:** [Layer 3 — Camera Path](03-camera-path.md)
**Next:** [Layer 5 — Atmosphere](05-atmosphere.md)
