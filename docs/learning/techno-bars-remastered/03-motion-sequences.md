# Layer 3 — Three Motion Phases

**Source:** `src/effects/technoBars/effect.remastered.js`, lines 312–383 (stepOneFrame)
**Concepts:** state machine, phase transitions, acceleration, damped oscillation, orbiting centres

---

## What This Layer Covers

The techno bars effect is not a single animation — it is a three-act story
told through changing motion parameters. Each phase has a distinct visual
character. This layer explains:

- How the state machine advances one frame at a time
- Phase 1: gentle rotation with bouncing bar spacing
- Phase 2: accelerating rotation with collapsing spacing
- Phase 3: orbiting centre point with scroll-out exit
- The `curpal` brightness flash: beat-reactive palette pulsing
- Frame timing and the 70 fps clock

---

## The State Machine

The `stepOneFrame` function is called once per simulation frame (70 fps).
It reads the current frame number and executes the appropriate phase logic:

```javascript
const FRAME_RATE = 70;
const SEQ1_END = 70 * 6;       // 420  (~6 seconds)
const SEQ2_END = 70 * (6 + 12); // 1260 (~18 seconds)
const SEQ3_END = 70 * (6 + 12 + 14); // 2240 (~32 seconds)
```

| Phase | Frames | Duration | Visual Character |
|-------|--------|----------|-----------------|
| 1 | 0–419 | ~6 s | Calm — slow rotation, bouncing spacing |
| 2 | 420–1259 | ~12 s | Building — accelerating rotation |
| 3 | 1260–2239 | ~14 s | Climax — orbiting centre, scroll exit |

The renderer drives the state machine from wall-clock time:

```javascript
const targetFrame = Math.min(Math.floor(t * FRAME_RATE), SEQ3_END - 1);
while (lastFrame < targetFrame) {
  lastFrame++;
  stepOneFrame(lastFrame);
}
```

If the user scrubs backward in the editor, the state is reset and replayed
from frame 0. This guarantees deterministic output for any time value.

---

## Phase 1: Slow Rotation (Frames 0–419)

Phase 1 introduces the effect gently. The bars rotate at a constant speed
while the spacing bounces like a ball under gravity:

```javascript
if (!seq1Init) {
  seq1Init = true;
  rot = 45; vm = 50; vma = 0;
}
barRot = rot; barVm = vm;
rot += 2;          // constant rotation speed
vm += vma;         // spacing changes by velocity
if (vm < 25) {     // bounce at minimum spacing
  vm -= vma;       // undo the move
  vma = -vma;      // reverse velocity
}
vma -= 1;          // gravity pulls spacing down
```

The **rotation** advances by 2 units per frame — a gentle, steady spin.

The **spacing** (`vm`) oscillates via a gravity simulation:

1. `vm` starts at 50 (medium spacing)
2. `vma` (spacing velocity) starts at 0 and decreases by 1 each frame
3. When `vm` drops below 25, the velocity reverses (bounce)
4. Each bounce is lower because `vma` continues to decrease

```
vm (spacing)
 50 ┤╲
    │  ╲
 40 ┤   ╲          ╱╲
    │    ╲        ╱  ╲
 30 ┤     ╲      ╱    ╲     ╱╲
    │      ╲    ╱      ╲   ╱  ╲
 25 ┤-------╲--╱--------╲-╱----╲--- (bounce floor)
    │        ╲╱          ╲╱
    └──────────────────────────────── frame
     0        100       200       300
```

Visually, the bars start with moderate gaps, collapse together, spring
apart, collapse again — each oscillation smaller than the last, like a
bouncing ball losing energy.

---

## Phase 2: Accelerating Rotation (Frames 420–1259)

Phase 2 ramps up the energy. Rotation accelerates and the spacing starts
from a large value before collapsing:

```javascript
if (!seq2Init) {
  seq2Init = true;
  rot = 50; rota = 10; vm = 100 * 64; vma = 0;
}
barRot = rot; barVm = vm / 64;
rot += rota / 10;   // rotation speed increases over time
rota += 1;          // acceleration increases every frame
vm += vma;
if (vm < 0) { vm -= vma; vma = -vma; }
vma -= 1;
```

The key difference from Phase 1: **`rota` increases every frame**, so the
rotation speed is not constant — it accelerates:

```
Rotation speed (rota / 10):
Frame 420:  rota = 10  → speed = 1.0
Frame 520:  rota = 110 → speed = 11.0
Frame 620:  rota = 210 → speed = 21.0
Frame 1259: rota = 849 → speed = 84.9
```

```
rot (angle)
     ┤                              ╱
     │                            ╱
     │                          ╱
     │                       ╱╱
     │                    ╱╱
     │                ╱╱╱
     │           ╱╱╱╱
     │     ╱╱╱╱╱
     ├╱╱╱╱
     └──────────────────────────── frame
      420                    1259
        (quadratic growth — parabolic curve)
```

The spacing starts large (`vm = 6400`, displayed as `vm / 64 = 100`) and
follows the same gravity+bounce pattern as Phase 1, but from a higher
starting value. As the bars spin faster, the spacing collapses, creating
increasingly dense and frantic interference patterns.

---

## Phase 3: Orbiting Centre (Frames 1260–2239)

Phase 3 is the climax. Everything from Phase 2 continues (accelerating
rotation, collapsing spacing), but now the **centre point** of the bar
pattern orbits in a spiral:

```javascript
if (!seq3Init) {
  seq3Init = true;
  rot = 45; rota = 10; rot2 = 0;
  xposa = 0; xpos = 0;
  vm = 100 * 64; vma = 0;
}
const rot2f = Math.floor(rot2);
if (rot2 < 32) {
  barWx = sin1024[(rot2f) & 1023] * rot2 / 8 + 160;
  barWy = sin1024[(rot2f + 256) & 1023] * rot2 / 8 + 100;
} else {
  barWx = sin1024[(rot2f) & 1023] / 4 + 160;
  barWy = sin1024[(rot2f + 256) & 1023] / 4 + 100;
}
rot2 += 17;
```

The `rot2` parameter controls the orbit. It advances by 17 units per frame
(a fast orbit), and the centre position traces a circle using `sin1024` and
`cos1024` (the `+ 256` offset):

- **First 32 values of rot2**: the orbit radius grows from 0 to `32/8 = 4`
  units. The spiral starts tight and expands.
- **After rot2 ≥ 32**: the radius stabilises at `255/4 ≈ 64` pixels.
  The centre orbits in a fixed circle around `(160, 100)` — the screen centre.

```
Centre position (barWx, barWy):

     (160,100) ← screen centre
         ╭─╮
        ╱   ╲
       │  ·  │    ← orbit path (radius ~64 pixels)
        ╲   ╱
         ╰─╯
```

The `+ 160` and `+ 100` offsets ensure the orbit is centred on the screen
(320/2 = 160, 200/2 = 100 in the classic 320×200 coordinate space).

---

## The Scroll-Out Exit

In the final 333 frames of Phase 3, the bars scroll off-screen to the right:

```javascript
if (frame - doit3Start > 70 * 14 - 333) {
  xpos += Math.floor(xposa / 4);
  if (xpos > 320) xpos = 320;
  else xposa += 1;
  scrollX = xpos;
}
```

`xposa` increases by 1 each frame, so `xpos` grows quadratically:

```
frame:   ...  1907  1908  1909  1910  ...  2100  ...  2239
xposa:          1     2     3     4         194        333
xpos:           0     0     0     1          ~4700      320 (clamped)
```

The `scrollX` value is passed to the shader as `uScrollX`. Any pixel with
`pos.x < uScrollX` is rendered as black:

```glsl
if (pos.x < uScrollX) {
  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
  return;
}
```

This creates a black curtain that sweeps from left to right, wiping the
bars off-screen as the effect ends.

```
Early exit:              Mid exit:                Late exit:
 ███████████████████     ██████████████           ███
 ███████████████████     ██████████████           ███
 ███████████████████     ██████████████           ███
 ███████████████████     ██████████████           ███
 (bars fill screen)      (bars half-hidden)       (almost gone)
```

---

## The curpal Flash

Throughout all three phases, the palette brightness pulses on a regular
cycle and on musical beats:

```javascript
if (frame % 35 === 0) curpal = 15;
if (curpal > 0) curpal--;
```

Every 35 frames (twice per second at 70 fps), `curpal` jumps to 15 and
then decays by 1 per frame, reaching 0 after 15 frames. This creates a
brief brightness flash:

```
curpal:  15 14 13 12 11 10  9  8  7  6  5  4  3  2  1  0  0  0 ... 15 14 13 ...
         ██ █▓ █░ ▓▓ ▓░ ░░                                        ██ █▓ █░ ...
frame:    0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 ... 35 36 37 ...
```

In the render function, musical beats also trigger the flash:

```javascript
if (beat < 0.1) curpal = 15;
```

The `curpal` value is passed to the shader as `uPalBrightness`, where it
modulates the overall colour intensity:

```glsl
float palFlash = uPalBrightness / 15.0;
color *= 1.0 + palFlash * 0.6;
```

At `curpal = 15`, the colour is boosted by 60%. The flash decays over 15
frames (~0.2 seconds), creating a rhythmic pulse synchronised to both the
internal timer and the music.

---

## Frame-by-Frame Summary

```
Frame 0────────────────── Phase 1 starts
  rot = 45, vm = 50
  Slow spin, bouncing spacing
  Flash every 35 frames

Frame 420──────────────── Phase 2 starts
  rot = 50, rota = 10
  Rotation accelerates
  Spacing starts wide, collapses

Frame 1260─────────────── Phase 3 starts
  rot = 45, rota = 10, rot2 = 0
  Orbiting centre (spiral outward)
  Rotation still accelerating

Frame 1907─────────────── Scroll-out begins
  Black curtain sweeps left→right

Frame 2239─────────────── Effect ends
```

---

**Next:** [Layer 4 — GPU Rendering](04-gpu-rendering.md)
