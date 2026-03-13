# Layer 1 — Sine Harmonics

**Source:** `src/effects/plasma/effect.remastered.js`, lines 87–100 (GLSL), lines 51–66 (classic CPU tables)
**Concepts:** multi-harmonic synthesis, Fourier intuition, higher-order overtones, GLSL sin()

---

## What This Layer Covers

Before any colour, before any animation, we need a number for each pixel. The
plasma effect generates a single **colour index** (0–255) at every screen
position using nothing but sine functions. This layer explains:

- How a single `sin()` produces a boring stripe pattern
- How adding higher harmonics (overtones) creates organic complexity
- The three sine table functions and what each one contributes
- Why the original used integer lookup tables and why the remastered uses GLSL

---

## A Single Sine is Boring

If you compute `sin(x)` across a row of pixels you get a smooth, perfectly
regular wave — gentle bumps repeating forever. Visually it looks like soft
vertical stripes. Smooth, but lifeless.

```
sin(x) alone:

  ╭──╮      ╭──╮      ╭──╮      ╭──╮
 ╱    ╲    ╱    ╲    ╱    ╲    ╱    ╲
╱      ╲  ╱      ╲  ╱      ╲  ╱      ╲
        ╲╱        ╲╱        ╲╱        ╲╱
```

Every bump is the same width, the same height, the same shape. The pattern
repeats with perfect regularity. Not very interesting.

---

## Adding Harmonics

The trick that makes plasma visually rich is **multi-harmonic synthesis** —
adding sine waves at different frequencies together. A slow sine sets the
broad shape; faster sines add fine detail:

```
sin(x)×55              (fundamental — broad shape)
+ sin(5x)×8            (5th harmonic — medium ripples)
+ sin(15x)×2           (15th harmonic — fine detail)
───────────
= complex organic curve
```

Each additional harmonic adds texture at a finer scale. The amplitude
decreases with each harmonic (55, then 8, then 2) so that the broad shape
dominates but the fine detail is still visible. This is the same principle
behind **Fourier synthesis** — any complex shape can be built from a sum of
sines at different frequencies.

```
Fundamental only:       With 5th harmonic:      With 5th + 15th:

  ╭──╮      ╭──╮        ╭~─╮      ╭~─╮        ╭≈─╮      ╭≈─╮
 ╱    ╲    ╱    ╲       ╱~   ╲    ╱~   ╲       ╱≈   ╲    ╱≈   ╲
╱      ╲  ╱      ╲     ╱  ~  ╲  ╱  ~  ╲      ╱  ≈  ╲  ╱  ≈  ╲
        ╲╱        ╲           ╲╱                     ╲╱
                        (bumpy edges)           (finer texture)
```

The human eye reads these multi-scale features as "organic" rather than
"mathematical."

---

## The Three Sine Functions

The plasma uses three different multi-harmonic sine functions, each with a
different combination of harmonics. In the remastered GLSL shader, they are
computed per-pixel with native `sin()`:

### lsini4 — coarse spatial modulation

```glsl
float lsini4(float a) {
  float t = a * TAU / 4096.0;
  return (sin(t) * 55.0 + sin(t * 5.0) * 8.0 + sin(t * 15.0) * 2.0 + 64.0) * 8.0;
}
```

| Component | Frequency | Amplitude | Role |
|-----------|-----------|-----------|------|
| `sin(t)` | 1× | 55 | Broad shape |
| `sin(t * 5)` | 5× | 8 | Medium ripple |
| `sin(t * 15)` | 15× | 2 | Fine texture |

The sum is offset by +64 to centre it in positive territory, then multiplied
by 8. Output range: roughly 0–1024. This function is used for the Y-axis
modulation in one of the two plasma computation chains. The `× 8` final scale
gives it a wide range to push through the second sine lookup.

### lsini16 — fine spatial modulation

```glsl
float lsini16(float a) {
  float t = a * TAU / 4096.0;
  return (sin(t) * 55.0 + sin(t * 4.0) * 5.0 + sin(t * 17.0) * 3.0 + 64.0) * 16.0;
}
```

| Component | Frequency | Amplitude | Role |
|-----------|-----------|-----------|------|
| `sin(t)` | 1× | 55 | Broad shape |
| `sin(t * 4)` | 4× | 5 | Medium ripple |
| `sin(t * 17)` | 17× | 3 | High-frequency detail |

Multiplied by 16 (instead of 8), giving an output range of roughly 0–2048.
The 17th harmonic is a prime number — this means it never aligns neatly with
the fundamental, avoiding visible periodicity. The higher final scale makes
this function contribute stronger positional offsets.

### psini — the colour generator

```glsl
float psini(float a) {
  float t = a * TAU / 4096.0;
  return sin(t) * 55.0 + sin(t * 6.0) * 5.0 + sin(t * 21.0) * 4.0 + 64.0;
}
```

| Component | Frequency | Amplitude | Role |
|-----------|-----------|-----------|------|
| `sin(t)` | 1× | 55 | Broad gradients |
| `sin(t * 6)` | 6× | 5 | Medium structure |
| `sin(t * 21)` | 21× | 4 | Fine grain |

No final multiplier — the output (roughly 0–128) maps directly to a colour
index. This is the function that actually determines what colour each pixel
gets. The 21st harmonic adds high-frequency visual grain that prevents the
plasma from looking too smooth.

---

## How the Functions Chain Together

The three functions do not work independently. Each pixel's colour is computed
by chaining them:

```
Step 1: bx1 = lsini16(y + k2 + rx×4)     ← Y position → offset
Step 2: val1 = psini(x×8 + k1 + bx1)      ← X position + offset → colour
Step 3: bx2 = lsini4(y + k4 + x×16)       ← Y + X position → offset
Step 4: val2 = psini(bx2 + y×2 + k3 + rx×4) ← offset + position → colour
Step 5: ci = (val1 + val2) mod 256          ← sum the two contributions
```

The key insight is that `lsini16` and `lsini4` produce **intermediate
offsets** that feed into `psini`. This means the colour at position (x, y)
depends not just on x and y directly, but on a sine-warped version of y
feeding into a sine of x. The result is curved, organic shapes instead of
straight lines.

Think of it like looking at a grid through wavy glass. The grid itself is
regular (the `psini` function), but the glass warps your view of it (the
`lsini16` / `lsini4` offsets), creating curves where there were straight
lines.

---

## Why the Original Used Lookup Tables

In 1993, computing `sin()` was expensive — each call took dozens of CPU
cycles on a 486. WILDFIRE pre-computed all three sine functions into integer
arrays and used array lookups instead:

```javascript
// Classic: integer lookup tables (CPU)
lsini4  = new Int32Array(8192);   // 32 KB
lsini16 = new Int32Array(8192);   // 32 KB
psini   = new Int32Array(16384);  // 64 KB

for (let a = 0; a < 8192; a++)
  lsini4[a] = Math.floor(
    (Math.sin(a * DPII / 4096) * 55
   + Math.sin(a * DPII / 4096 * 5) * 8
   + Math.sin(a * DPII / 4096 * 15) * 2
   + 64) * 8
  );
```

The lookup tables use 12-bit indices (masked with `& 0xFFF` for 4096 entries
or `& 0x3FFF` for 16384 entries). The bitmask automatically wraps the index
around, giving free periodic repetition — `lsini16[4097]` is the same as
`lsini16[1]`.

The remastered variant computes `sin()` natively in GLSL on the GPU, where
it is essentially free — modern GPUs have dedicated silicon for
trigonometric functions. This eliminates the lookup tables entirely and
produces mathematically exact results at every pixel, at any resolution.

---

## The 4096 Period

All three functions share the same base period: 4096. The input `a` is
divided by 4096 and multiplied by 2π before being passed to `sin()`:

```glsl
float t = a * TAU / 4096.0;
```

Why 4096? Because 4096 is 2¹², and the parameter values are masked to 12
bits (`& 0xFFF = & 4095`). This means parameters wrap naturally at powers of
two, which is both fast (a single bitwise AND) and creates seamless
repetition. The plasma never has visible seams or discontinuities because the
sine functions and the parameter space share the same period.

---

**Next:** [Layer 2 — Dual-Layer Interleave](02-dual-layer-interleave.md)
