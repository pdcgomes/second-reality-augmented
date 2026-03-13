# Layer 2 — Circle Interference

**Source:** `src/effects/technoCircles/effect.remastered.js` lines 236–302 (GLSL main), lines 507–519 (JS frame state)
**Concepts:** orbital motion, bitwise OR patterns, moiré interference, O(1) scrubbing

---

## What This Layer Covers

The visual richness of this effect comes from overlapping two circle patterns
that move on independent orbits. This layer explains:

- How Phase 1 introduces a single circle with a fading palette sweep
- How Phase 2 places two circles on independent sinusoidal orbits
- How the OR combination of overlapping rings creates moiré patterns
- Why all animation state is O(1) derivable from the frame number

---

## The Frame Clock

The effect runs at a fixed **70 fps** — matching the original VGA demo's
refresh rate. Wall-clock seconds are converted to simulation frames:

```javascript
const FRAME_RATE = 70;
const frame = Math.floor(t * FRAME_RATE);
```

Everything that follows is derived from this integer frame number. There is
no accumulator, no persistent state, no history to maintain.

---

## Phase 1: Single Circle, Palette Sweep (Frames 0–255)

Phase 1 is the introduction. A single circle is displayed centred on screen
while the palette fades in:

```glsl
if (uPhase < 0.5) {
  float palfader = clamp(uFrame * 2.0, 0.0, 512.0);
  float shift = mod(uFrame, 8.0);

  vec2 circleCoord = vec2(pos.x + 160.0, pos.y + 100.0);
  float ci = sampleCircle1(circleCoord);

  color = phase1Pal(ci, shift, palfader);
}
```

The circle is centred by offsetting the sample coordinates by (160, 100) —
half of the 320×200 classic resolution. The palette uses two parameters:

| Parameter | Formula | Purpose |
|-----------|---------|---------|
| **palfader** | `frame × 2`, clamped to 0–512 | Controls brightness fade-in, then wash-out |
| **shift** | `frame mod 8` | Rotates which ring gets the bright colour |

The **palfader** has two stages:
- 0–256: brightness scales linearly from 0% to 100% (fade in)
- 256–512: base brightness stays at 100% but an additive term grows,
  washing the palette toward white

The **shift** cycles every 8 frames, rotating which of the 8 ring colours
is the "bright" one. At 70 fps, one full rotation takes 8/70 ≈ 0.11 seconds,
creating a spinning strobe effect on the concentric rings.

---

## Phase 2: Two-Circle Interference (Frames 256+)

Phase 2 is the main visual. Both circles are placed on the screen at
independently-computed positions and their patterns are combined:

```glsl
float overx = 160.0 + sin1024(uOverrot) / 4.0;
float overy = 100.0 + sin1024(mod(uOverrot + 256.0, 1024.0)) / 4.0;
float scrnx = 160.0 + sin1024(uScrnrot) / 4.0;
float scrny = 100.0 + sin1024(mod(uScrnrot + 256.0, 1024.0)) / 4.0;
```

Each circle's position is defined by a sine/cosine pair (sine for x, cosine
for y — implemented as a 256-step phase offset in a 1024-entry sine table).
The `/ 4.0` scales the motion to ±64 pixels around the centre.

### Orbital Parameters

The two circles rotate at different speeds:

```javascript
const n = frame - 256;                     // frames since Phase 2 start
const overrot  = (211 + 7 * n) % 1024;    // circle2: +7 per frame
const scrnrot  = (5 * n) % 1024;          // circle1: +5 per frame
```

| Circle | Speed | Full orbit | Character |
|--------|-------|-----------|-----------|
| circle1 (scrnrot) | +5/frame | 1024/5 = 205 frames ≈ 2.9 s | Slower, steady |
| circle2 (overrot) | +7/frame | 1024/7 = 146 frames ≈ 2.1 s | Faster, starts offset |

Because 5 and 7 are coprime, the two orbits never synchronise — they create
a continuously evolving relationship. The starting offset of 211 for overrot
ensures the two circles begin at different positions rather than both starting
at centre.

### The sin1024 Function

```glsl
float sin1024(float idx) {
  return sin(idx * TAU / 1024.0) * 255.0;
}
```

This replicates the original assembly code's 1024-entry sine lookup table
with values scaled to ±255. Dividing by 4 gives ±64 pixels of orbital range.

---

## The OR Combination

With both circles positioned, the shader samples each one and combines them:

```glsl
vec2 c1coord = vec2(pos.x + scrnx, pos.y + scrny);
vec2 c2coord = vec2(pos.x + overx + powr, pos.y + overy);

float ring1 = sampleCircle1(c1coord);
float ring2 = sampleCircle2(c2coord);

float r1 = floor(ring1 + 0.5);
float r2 = floor(ring2 + 0.5);
float ci_int = r1 + r2;
```

Because circle1 values are 0–7 and circle2 values are 0 or 8, addition is
equivalent to bitwise OR (their bits never overlap — see Layer 1). The
resulting `ci_int` ranges from 0 to 15.

The `floor(... + 0.5)` rounding recovers clean integer values from the
texture sampling. Even with NEAREST filtering, UV coordinate precision can
produce fractional values at ring boundaries.

---

## Moiré Interference

When two repetitive patterns overlap with slight offset, they create **moiré
interference** — large-scale visual structures that exist in neither pattern
alone:

```
Circle 1 rings alone:      Circle 2 mask alone:

    ╭─2─╮                      ╭───╮
   ╱ 3 4 ╲                    ╱  8  ╲
  │ 5 6 7 │                  │  8 8  │
   ╲ 3 4 ╱                    ╲  8  ╱
    ╰─2─╯                      ╰───╯


OR combination (overlapping):

    ╭─ 2 ─╮
   ╱ 3  12 ╲        ← 4|8=12, 3 stays 3 (outside mask)
  │ 5  14  7│        ← 6|8=14, regions shift by +8
   ╲ 3  12 ╱
    ╰─ 2 ─╯
```

Where circle2's mask (value 8) overlaps circle1's rings, the colour index
jumps by 8 — entering the upper bank of the 16-colour palette. Because the
two circles orbit independently, the boundary between the lower bank (0–7)
and upper bank (8–15) shifts continuously, creating swirling interference
bands.

The visual result is a pattern that appears to have far more structure and
complexity than either circle alone. This is the same optical principle that
creates shimmering patterns when you overlap two window screens or stack two
chain-link fences.

---

## O(1) Scrubbing

All Phase 2 state is derived from the frame number with simple arithmetic:

```javascript
const n = frame - 256;
const overrot    = (211 + 7 * n) % 1024;
const scrnrot    = (5 * n) % 1024;
const sinurot    = (7 * (n + 1)) % 1024;
const sinuspower = n > 350 ? Math.min(Math.max(Math.floor((n - 350) / 16), 1), 15) : 0;
const palanimc   = (7 + n) % 8;
```

No loops, no history, no accumulation. Jump to any frame and compute the
exact orbital positions, distortion strength, and palette shift in constant
time. This is why the editor can scrub through the effect instantly — it does
not need to replay hundreds of frames of simulation.

The tradeoff: you cannot have path-dependent behaviour (e.g., "if the circles
were close together last frame, speed up"). Every frame must be a pure
function of its index. For this effect, that constraint is a perfect fit.

---

## Palette Shift

The palette animates by cycling which colour index maps to which colour.
In Phase 2, this is controlled by a simple counter:

```javascript
const palanimc = (7 + n) % 8;
```

This shifts the palette by one entry every frame, cycling every 8 frames.
Combined with the dual-bank palette (0–7 and 8–15), the rotation creates
continuous colour movement in the rings even when the circles are not moving
much.

---

**Next:** [Layer 3 — Per-Scanline Distortion](03-scanline-distortion.md)
