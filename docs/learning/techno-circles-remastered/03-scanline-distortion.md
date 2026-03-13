# Layer 3 — Per-Scanline Distortion

**Source:** `src/effects/technoCircles/effect.remastered.js` lines 265–269 (GLSL distortion), lines 140–147 (GLSL helper functions), lines 519 (JS sinuspower computation)
**Concepts:** per-scanline horizontal offset, sinusoidal distortion, power scaling, gradual intensification

---

## What This Layer Covers

The moiré interference from Layer 2 is compelling, but it is geometrically
rigid — circles move but remain perfectly circular. The per-scanline
distortion breaks that rigidity by shifting each horizontal row of pixels
by a different amount, creating wave-like warping. This layer explains:

- How each scanline gets its own horizontal offset from a sine function
- How the `power0` function scales the distortion amplitude over time
- How the distortion starts at zero and gradually intensifies after frame 606
- How the warping creates organic, fluid visual movement

---

## The Core Distortion Code

Four lines in the fragment shader produce all the warping:

```glsl
float sinroty = mod(uSinurot + 9.0 * pos.y, 1024.0);
float siny = mod(floor(sin1024(sinroty) / 8.0), 256.0);
if (siny < 0.0) siny += 256.0;
float powr = power0(uSinuspower, siny) * uDistortionScale;
```

The result `powr` is a horizontal pixel offset applied to circle2's x
coordinate for this particular row:

```glsl
vec2 c2coord = vec2(pos.x + overx + powr, pos.y + overy);
//                                  ^^^^
//                        per-scanline distortion
```

Only circle2 is distorted. Circle1 remains undistorted, so the interference
boundary warps — producing organic shapes where one circle's edge was
straight.

---

## Step 1: Per-Row Sine Lookup

```glsl
float sinroty = mod(uSinurot + 9.0 * pos.y, 1024.0);
```

This computes a unique sine table index for each row (`pos.y`). The
`9.0 * pos.y` term means adjacent rows are 9 indices apart in the sine
table — close enough for smooth visual continuity, but spaced enough to
create visible undulation.

The `uSinurot` uniform advances over time:

```javascript
const sinurot = (7 * (n + 1)) % 1024;
```

At +7 per frame, the distortion pattern scrolls vertically. Combined with
the `9 * y` spatial term, each row's sine argument shifts by 7 every frame,
making the waves appear to ripple downward (or upward, depending on sign).

```
Frame N:    sinroty for row 0 = sinurot
            sinroty for row 1 = sinurot + 9
            sinroty for row 2 = sinurot + 18
            ...

Frame N+1:  sinroty for row 0 = sinurot + 7
            sinroty for row 1 = sinurot + 16
            sinroty for row 2 = sinurot + 25
            ...
```

Each frame, every row's index increases by 7, creating the illusion of
downward-moving waves.

---

## Step 2: Sine to Offset

```glsl
float siny = mod(floor(sin1024(sinroty) / 8.0), 256.0);
if (siny < 0.0) siny += 256.0;
```

`sin1024` returns a value in the range ±255. Dividing by 8 and flooring
gives an integer in roughly ±31. The `mod 256` with the sign correction
wraps this into the 0–255 range, matching the original assembly code's
unsigned byte arithmetic.

This produces a wave pattern across the scanlines:

```
Row:     0    5   10   15   20   25   30   ...
siny:   12   28   31   22    8  243  230   ...
         ╭──╮                 ╰──╯
         peak                 trough (wraps around 256)
```

---

## Step 3: The power0 Function

```glsl
float power0(float sinuspower, float siny) {
  float c = siny < 128.0 ? siny : siny - 256.0;
  return floor(c * sinuspower / 15.0);
}
```

This is where the distortion amplitude is controlled. The function:

1. **Converts unsigned to signed:** values 0–127 stay positive; values
   128–255 become negative (128→−128, 255→−1). This recovers the signed
   sine wave from the unsigned byte representation.

2. **Scales by `sinuspower / 15`:** when sinuspower is 0, the result is 0
   (no distortion). When sinuspower is 15, the full sine amplitude passes
   through.

The name "power" is slightly misleading — it is a linear scale factor, not
an exponent. Think of it as a volume knob from 0 (silent) to 15 (full).

---

## Step 4: Gradual Intensification

The `sinuspower` value is computed in JavaScript and does not become non-zero
until well into Phase 2:

```javascript
const sinuspower = n > 350
  ? Math.min(Math.max(Math.floor((n - 350) / 16), 1), 15)
  : 0;
```

| Frames (n) | sinuspower | Distortion |
|------------|------------|------------|
| 0–350 | 0 | None — circles are perfectly round |
| 351–366 | 1 | Barely perceptible wobble |
| 367–382 | 2 | Slight wave visible |
| 383–398 | 3 | Clearly wavy edges |
| ... | ... | ... |
| 574–589 | 15 | Maximum distortion amplitude |

The distortion starts at absolute zero and ramps linearly over ~224 frames
(~3.2 seconds). This gradual introduction is a classic demo-scene technique:
let the viewer appreciate the clean interference pattern first, then slowly
reveal the distortion as a visual escalation.

In the full demo timeline, n=350 corresponds to frame 606 overall (256 + 350),
about 8.7 seconds into the effect.

---

## Visualising the Distortion

Without distortion (sinuspower = 0), circle2's boundary is a perfect arc:

```
Row 0:   ─────────────────|──────  (circle2 edge at x=200)
Row 1:   ─────────────────|──────  (circle2 edge at x=200)
Row 2:   ─────────────────|──────  (circle2 edge at x=200)
Row 3:   ─────────────────|──────  (circle2 edge at x=200)
```

With moderate distortion (sinuspower = 8):

```
Row 0:   ─────────────|─────────  (shifted left by 12)
Row 1:   ──────────────────|────  (shifted right by 6)
Row 2:   ────────────────────|──  (shifted right by 15)
Row 3:   ──────────────────|────  (shifted right by 6)
Row 4:   ─────────────|─────────  (shifted left by 12)
```

The interference boundary, which was a smooth arc, becomes a sinusoidal
wave. Combined with the two circles' orbital motion, this creates fluid,
organic shapes that are constantly evolving.

---

## The Editor Parameter

The remastered effect exposes `uDistortionScale` as a tunable parameter
(default 1.0, range 0–3). This multiplies the final distortion value:

```glsl
float powr = power0(uSinuspower, siny) * uDistortionScale;
```

Setting it to 0 disables distortion entirely. Setting it to 3 triples the
wave amplitude for dramatic warping. The parameter is applied after
`power0`, so it does not affect the gradual ramp-in — it scales the
entire distortion curve uniformly.

---

## Why Only Circle 2?

Only circle2's horizontal position is distorted. Circle1 stays rigidly on
its orbital path. This asymmetry is important:

- If both circles were distorted the same way, the interference pattern
  would not change (both would warp together)
- If both were distorted differently, the visual would be chaotic
- Distorting only one creates a "sliding boundary" effect where the moiré
  bands warp and flow while maintaining visual coherence

The original 1993 assembly code made the same choice, likely for
performance — distorting one circle halves the per-scanline computation.

---

**Next:** [Layer 4 — Rendering Pipeline](04-pipeline-and-bloom.md)
