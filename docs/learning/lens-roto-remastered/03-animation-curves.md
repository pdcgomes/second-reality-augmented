# Layer 3 — Animation Curves

**Source:** `src/effects/rotozoom/effect.remastered.js`, lines 323–365 (animation pre-computation); `src/effects/rotozoom/effect.js`, lines 47–88 (identical in classic)
**Concepts:** per-frame physics, pre-computed arrays, scripted acceleration, sinusoidal offset, frame interpolation, 70fps timing

---

## What This Layer Covers

The rotozoom would be boring if it just rotated at a constant speed. The magic
of the original lies in a carefully scripted **physics model** that controls
rotation acceleration, zoom breathing, and camera offset over 2000 frames. This
layer explains:

- The four animation parameters: `d1`, `d2`, `scale`, `fade`
- How rotation accelerates from near-zero to fast spinning
- How the zoom "breathes" through multiple phases
- How the start position orbits in a circle
- Why pre-computed arrays enable instant scrubbing
- How the 70fps frame clock maps to wall-clock seconds

---

## The Four Parameters

Every frame is fully described by four numbers:

| Parameter | Role | Initial value |
|-----------|------|---------------|
| **d1** | Offset angle — orbits the camera start position | 0 |
| **d2** | Rotation angle — controls how tilted the texture grid is | 0.00007654321 |
| **scale** | Zoom level — how much texture is visible | 2.0 |
| **fade** | White fade — 0 = normal, 1 = fully white | 1.0 (fades in) |

These are pre-computed for all 2000 frames at init time and stored in
`Float64Array`s:

```javascript
animD1    = new Float64Array(maxFrames);
animD2    = new Float64Array(maxFrames);
animScale = new Float64Array(maxFrames);
animFade  = new Float64Array(maxFrames);
```

---

## The Frame Loop

The animation physics run in a simple imperative loop, identical in both
the classic and remastered variants:

```javascript
function computeAnimParams() {
  let d1 = 0, d2 = 0.00007654321, d3 = 0;
  let scale = 2, scalea = -0.01;

  for (let f = 0; f <= 2000; f++) {
    d1 -= 0.005;                           // constant angular velocity
    d2 += d3;                              // rotation accumulates d3
    scale += scalea;                       // zoom accumulates scalea

    // d3 (rotation acceleration) ramps up after frame 25
    if (f > 25) { if (d3 < 0.02) d3 += 0.00005; }

    // scalea (zoom velocity) has multiple phases
    if (f < 270)      { if (scale < 0.9) { if (scalea < 1) scalea += 0.0001; } }
    else if (f < 400) { if (scalea > 0.001) scalea -= 0.0001; }
    else if (f > 1600){ if (scalea > -0.1) scalea -= 0.001; }
    else if (f > 1100){
      let a = f - 900; if (a > 100) a = 100;
      if (scalea < 256) scalea += 0.000001 * a;
    }

    // ...store in arrays...
  }
}
```

This is a direct translation of the original C code in `LENS/MAIN.C`. The
physics is stateful — each frame depends on the previous one. That is why the
entire sequence must be pre-computed rather than computed on demand.

---

## Parameter 1: Rotation Angle (d2)

`d2` is the main rotation angle. It does not increase at a constant rate.
Instead, a **rotation velocity** `d3` itself accelerates:

```
d3 starts at 0
After frame 25: d3 += 0.00005 per frame (until d3 reaches 0.02)
d2 += d3 each frame
```

This creates an **ease-in** effect: the image starts almost still, then
gradually spins faster and faster until `d3` saturates at 0.02.

```
Frame:   0    25     200      500      1000     1500     2000
         │     │       │        │         │        │        │
d3:      0   0.000  0.009    0.020     0.020    0.020    0.020
d2:      0   0.000  0.89     ~5.5      ~15.5    ~25.5    ~35.5
         ▲                     ▲
         barely moving         spinning at full speed
```

The rotation is in **radians**, so by frame 2000, `d2 ≈ 35.5` — the image
has completed about 5.6 full turns.

---

## Parameter 2: Zoom Scale

The `scale` parameter has the most complex evolution, with four distinct phases:

```
Phase 1 (f < 270):   "Zoom in"
  scale starts at 2.0, scalea = -0.01
  Scale decreases toward 0.9 (zooming in on the face)
  Once scale < 0.9, scalea gently accelerates positive

Phase 2 (270 ≤ f < 400):   "Settle"
  scalea decelerates toward 0.001
  Scale drifts slowly, almost hovering

Phase 3 (1100 < f ≤ 1600):   "Breathe"
  scalea increases very slowly: += 0.000001 × min(f-900, 100)
  A subtle zoom-out drift begins

Phase 4 (f > 1600):   "Zoom out"
  scalea -= 0.001 (strong deceleration, scalea goes very negative)
  Scale drops rapidly — the image shrinks away
```

Visualised as a rough timeline:

```
scale
  2.0 ┤╲
      │  ╲
  0.9 ┤   ╲_________──────────╱
      │                        ╲
  0.0 ┤                         ╲___
      └──┬──┬───┬───────┬───┬───────→ frame
         0  270 400    1100 1600 2000
         zoom  settle  breathe  zoom
         in                     out
```

The overall arc: the face starts zoomed out (you see many repeating tiles),
zooms in to fill the screen, holds roughly steady for the middle section, then
rapidly zooms out at the end before the white fade.

---

## Parameter 3: Offset Angle (d1)

`d1` controls where in the texture the camera "looks". It decreases by a
constant 0.005 per frame, producing a smooth circular orbit:

```javascript
startX = 70.0 * Math.sin(d1) - 30;
startY = 70.0 * Math.cos(d1) + 60;
```

This traces a circle of radius 70 in texture space, offset to
centre `(-30, 60)`. Combined with the rotation, it creates the
impression that the camera simultaneously rotates and orbits.

```
           Texture space
        ┌───────────────────┐
        │       . . .       │
        │    .         .    │
        │   .    (60)   .   │   ← d1 orbit, radius 70
        │    .    ↑    .    │
        │       . . .       │
        │         │(-30)    │
        └─────────┼─────────┘
                  origin
```

---

## Parameter 4: Fade

The fade creates smooth white transitions at the start and end:

```javascript
if (f > 2000 - 128) fade = clamp((f - (2000 - 128)) / 128, 0, 1);   // fade out
else if (f < 16)    fade = 1 - clamp(f / 15, 0, 1);                  // fade in
```

```
fade
 1.0 ┤█                                                          ╱██
     │█                                                        ╱
 0.5 ┤█                                                      ╱
     │█                                                    ╱
 0.0 ┤  ▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
     └──┬──────────────────────────────────────────────┬──→ frame
        0  16                                   1872  2000
        fade in                                 fade out
        (15 frames)                             (128 frames)
```

The fade-in is fast (15 frames ≈ 0.21 seconds) and the fade-out is gradual
(128 frames ≈ 1.83 seconds), matching the musical transition.

---

## Frame Timing: 70fps

The original demo ran at 70 frames per second (VGA Mode 13h with a tweaked
refresh rate). Both variants preserve this by converting wall-clock seconds to
a frame number:

```javascript
const frame = t * FRAME_RATE;   // FRAME_RATE = 70
```

At runtime, `t` comes from `AudioContext.currentTime` (the project's single
timing source). A time of `t = 10.0` seconds maps to frame 700.

---

## Frame Interpolation

Because display refresh rates rarely match 70fps exactly, frames can land
between integer indices. The `interpolate()` function performs linear
interpolation:

```javascript
function interpolate(arr, frame) {
  const f = clamp(frame, 0, arr.length - 2);
  const lo = Math.floor(f);
  const hi = Math.min(lo + 1, arr.length - 1);
  const t = f - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}
```

For example, at `frame = 100.4`:

```
arr[100] = 0.500
arr[101] = 0.520

result = 0.500 × 0.6 + 0.520 × 0.4 = 0.508
```

This smooths out animation at any display refresh rate without changing the
original choreography. It also enables smooth scrubbing in the editor — drag
the playhead to any fraction of a second and get a correct, interpolated frame.

---

## Pre-Computation: Why Not Compute On-The-Fly?

The animation physics is **stateful** — each frame depends on the accumulated
`d3`, `scalea`, `scale`, etc. from all previous frames. You cannot compute
frame 1500 without first computing frames 0–1499.

Pre-computing all 2001 frames at init time:
- **O(1) lookup** for any frame during render (just index the array)
- **Instant scrubbing** — jump to any point without replaying history
- **Deterministic** — same arrays every time, no floating-point drift

The tradeoff is ~64 KB of memory (4 arrays × 2001 entries × 8 bytes), which is
negligible.

---

## Key Takeaways

| Concept | What to remember |
|---------|-----------------|
| **4 parameters** | d1 (offset orbit), d2 (rotation), scale (zoom), fade (white) |
| **Rotation accelerates** | d3 ramps from 0 to 0.02 — the image starts still, then spins |
| **Zoom has 4 phases** | Zoom in → settle → breathe → zoom out |
| **Offset orbits** | sin/cos of d1 traces a circle in texture space |
| **70fps clock** | `frame = t × 70` — seconds to original frame number |
| **Interpolation** | Linear blend between adjacent frames for smooth sub-frame timing |
| **Pre-computed arrays** | All 2001 frames stored at init — O(1) lookup, instant scrub |

---

**Next:** [Layer 4 — Palette and Post-Processing](04-palette-and-postfx.md)
**Previous:** [Layer 2 — Texture and Sampling](02-texture-sampling.md)
**Back to:** [Overview](00-overview.md)
