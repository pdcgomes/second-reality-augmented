# Layer 2 — Dual-Layer Interleave

**Source:** `src/effects/plasma/effect.remastered.js`, lines 166–217 (GLSL main), lines 401–435 (JS parameter replay)
**Concepts:** parameter-driven animation, spatial blending, checkerboard interleave, deterministic replay

---

## What This Layer Covers

A single plasma layer already looks interesting, but the classic effect runs
**two layers simultaneously** with different parameter sets to double the
visual complexity. This layer explains:

- The K and L parameter sets that drive the two layers
- How parameters animate over time (constant per-frame drift)
- How the classic's binary checkerboard interleave becomes a smooth spatial blend
- The horizontal mirror trick (`rx = 80 - x`)
- How deterministic replay enables scrubbing

---

## Two Layers, Eight Parameters

The plasma runs two independent copies of the same formula, each driven by
its own set of four parameters:

```
K-layer: k1, k2, k3, k4    (controls one plasma)
L-layer: l1, l2, l3, l4    (controls another plasma)
```

Both layers compute the same `lsini16 → psini → lsini4 → psini` chain from
Layer 1, but because their parameters differ, they produce different patterns.
Layering two independent patterns creates visual complexity that neither alone
could achieve.

---

## Parameter Animation

Each frame, all eight parameters shift by fixed amounts:

```javascript
k1 = (k1 - 3) & MASK;   k2 = (k2 - 2) & MASK;
k3 = (k3 + 1) & MASK;   k4 = (k4 + 2) & MASK;
l1 = (l1 - 1) & MASK;   l2 = (l2 - 2) & MASK;
l3 = (l3 + 2) & MASK;   l4 = (l4 + 3) & MASK;
```

Where `MASK = 4095` (12-bit wrap). Each parameter drifts at a different speed
and direction:

| Param | Change/frame | Direction | Speed |
|-------|-------------|-----------|-------|
| k1 | −3 | decreasing | fast |
| k2 | −2 | decreasing | medium |
| k3 | +1 | increasing | slow |
| k4 | +2 | increasing | medium |
| l1 | −1 | decreasing | slow |
| l2 | −2 | decreasing | medium |
| l3 | +2 | increasing | medium |
| l4 | +3 | increasing | fast |

Because the K and L parameters drift at different rates and in different
directions, the two plasma layers move independently. One might scroll left
while the other scrolls diagonally, creating interference patterns that shift
and evolve continuously.

The 12-bit mask ensures parameters wrap smoothly at 4096, which matches the
sine function period. The plasma loops seamlessly after 4096 / gcd(speeds)
frames, but with eight parameters drifting at different speeds the effective
visual repeat period is enormous — you never notice the repetition.

---

## The Per-Pixel Formula

In the GLSL fragment shader, both layers are computed for every pixel:

```glsl
// K-layer
float kBx1 = lsini16(yCoord + uK2 + rx * 4.0);
float kVal1 = psini(x * 8.0 + uK1 + kBx1);
float kBx2 = lsini4(yCoord + uK4 + x * 16.0);
float kVal2 = psini(kBx2 + yCoord * 2.0 + uK3 + rx * 4.0);
float kCi = mod(kVal1 + kVal2, 256.0);

// L-layer (same formula, different parameters)
float lBx1 = lsini16(yCoord + uL2 + rx * 4.0);
float lVal1 = psini(x * 8.0 + uL1 + lBx1);
float lBx2 = lsini4(yCoord + uL4 + x * 16.0);
float lVal2 = psini(lBx2 + yCoord * 2.0 + uL3 + rx * 4.0);
float lCi = mod(lVal1 + lVal2, 256.0);
```

Each layer produces a colour index (0–255). The question is: how do you
combine them?

---

## Classic: Binary Checkerboard Interleave

The original 1993 code ran on VGA's tweaked 320×400 mode, where even and odd
scanlines could be addressed separately. WILDFIRE exploited this by rendering
the two layers in alternating pixels:

```
Column:    0    1    2    3    4    5    6    7
Row 0:     K    L    K    L    K    L    K    L
Row 1:     L    K    L    K    L    K    L    K
Row 2:     K    L    K    L    K    L    K    L
Row 3:     L    K    L    K    L    K    L    K
```

Each pixel shows either the K-layer or the L-layer — never both. The CRT
display's phosphor bleed smeared adjacent pixels together, making the
checkerboard invisible. On a modern display without phosphor bleed, this would
look like a visible grid. The classic variant simulates the bleed with a
horizontal box filter:

```javascript
for (let x = 0; x < 319; x++) {
  fb400[row + x] = (fb400[row + x] + fb400[row + x + 1] + 1) >> 1;
}
```

---

## Remastered: Smooth Spatial Blend

The remastered variant replaces the binary checkerboard with a continuous
**spatial blend** function:

```glsl
float blend = 0.5 + 0.2 * sin(yCoord * PI / 140.0) + 0.2 * sin(vUV.x * PI * 3.0);
float ci = mix(kCi, lCi, blend);
```

The blend factor varies smoothly across the screen:

| Term | What it does |
|------|-------------|
| `0.5` | Base: equal mix of K and L |
| `+ 0.2 * sin(y * π/140)` | Slow vertical wave (K dominates at some heights, L at others) |
| `+ 0.2 * sin(x * π * 3)` | Faster horizontal wave (3 cycles across the width) |

The result is a smooth sinusoidal cross-fade that varies both horizontally and
vertically. Some screen regions show more of the K-layer, others more of the
L-layer, with soft transitions between them. This produces the same visual
richness as the checkerboard interleave but without any grid artefacts.

---

## The Mirror Trick

Both layers use `rx = 80 - x` in their formula:

```glsl
float x = vUV.x * 80.0;
float rx = 80.0 - x;
```

The `rx × 4` term in the formula means the plasma pattern is horizontally
symmetric about the centre of the screen. The left half mirrors the right
half. This doubles the apparent visual complexity for free — a half-screen
pattern looks like a full-screen symmetric design.

Why 80? The classic rendered at 160 doubled pixels (320 / 2 = 160 actual
computed columns), with `QUAD_MAXX = 80` (each computed pixel covered 4
screen pixels). The remastered preserves the same coordinate system for
visual compatibility.

---

## Deterministic Replay

The parameter animation is replayed from the start of each palette sequence
every frame:

```javascript
const advFrames = Math.max(0, seqFrame);
for (let f = 0; f < advFrames; f++) {
  k1 = (k1 - 3) & MASK; k2 = (k2 - 2) & MASK;
  k3 = (k3 + 1) & MASK; k4 = (k4 + 2) & MASK;
  l1 = (l1 - 1) & MASK; l2 = (l2 - 2) & MASK;
  l3 = (l3 + 2) & MASK; l4 = (l4 + 3) & MASK;
}
```

This replays all parameter changes from the sequence start to the current
frame. Because parameter drift is a simple linear accumulation, this could
be optimised to a direct computation (`k1 = (init - 3 * frames) & MASK`),
but the replay loop matches the classic's structure and is fast enough — at
70 fps, the longest sequence is ~880 frames, and 880 iterations of 8 integer
operations takes microseconds.

The `INITTABLE` array holds the starting values for each palette sequence:

```javascript
const INITTABLE = [
  [1000,2000,3000,4000,3500,2300,3900,3670],  // seq 0 (red)
  [1000,2000,4000,4000,1500,2300,3900,1670],  // seq 1 (rainbow)
  [3500,1000,3000,1000,3500,3300,2900,2670],  // seq 2 (gray)
  ...
];
```

Entries 0–3 are the L-layer starting values, entries 4–7 are the K-layer
starting values. Each palette sequence begins with a different starting
configuration, so the plasma pattern looks distinct in each phase.

---

## Vertical Scrolling (the lc Offset)

The `lc` (line counter) offset controls the vertical position of the visible
plasma within its 400-line buffer:

```glsl
float yNorm = 1.0 - vUV.y;
float y = yNorm * 280.0;
float lcOffset = uLc / 400.0;
float yShifted = yNorm + lcOffset - 60.0 / 400.0;

if (yShifted < 0.0 || yShifted > 1.0) {
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  return;
}
```

During normal rendering, `lc = 60` (a fixed offset that positions the 280
visible lines within the 400-line logical space). During drop transitions,
`lc` accelerates quadratically, sliding the plasma downward off the screen.
Pixels outside the valid range render as black.

---

**Next:** [Layer 3 — Palette Sequences](03-palette-sequences.md)
