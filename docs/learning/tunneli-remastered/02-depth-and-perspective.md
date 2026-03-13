# Layer 2 — Depth and Perspective

**Source:** `src/effects/tunneli/effect.remastered.js`, lines 54–55 (sade table), lines 349–399 (dot buffer build)
**Concepts:** perspective foreshortening, depth ordering, shift buffer, O(1) scrubbing

---

## What This Layer Covers

The tunnel illusion comes from circles at different "depths" being drawn at
different sizes — far circles are small, near circles are large. This layer
explains:

- The `sade[]` perspective lookup table
- The 100-circle shift buffer and back-to-front ordering
- Bright/dark alternation for depth cueing
- Why the effect achieves O(1) scrubbing (no state replay)

---

## The sade[] Perspective Table

```javascript
const sade = new Int32Array(101);
for (let z = 0; z <= 100; z++) sade[z] = Math.trunc(16384 / (z * 7 + 95));
```

This maps a depth index (0 = nearest, 100 = farthest) to a ring template
radius index. The formula `16384 / (z × 7 + 95)` is a hyperbolic function
— it mimics perspective projection where apparent size is inversely
proportional to distance:

```
z (depth)   sade[z] (radius index)   Visual
─────────   ─────────────────────   ──────────
  0          172  (clamped to 137)   ████████ very large
  4          137                     ███████  large (nearest visible)
 20          63                      ████     medium
 40          31                      ██       small
 60          18                      █        smaller
 80          11                      ▪        tiny
```

The rendering loop uses circles from index 4 (nearest) to 80 (farthest).
The `sade` value selects which `pcalc` template (Layer 1) to use — larger
values give bigger rings.

---

## The Shift Buffer

The tunnel contains **100 active circles**. Each frame, a new circle is born
at the farthest depth and the nearest circle leaves the screen. Think of it
as a conveyor belt:

```
Frame N:
  [  4  ] [  5  ] [  6  ] [  7  ] ... [  79 ] [  80 ]
   near                                          far

Frame N+1:
          [  4  ] [  5  ] [  6  ] ... [  78 ] [  79 ] [  80 ]
           near                                         far
```

Each circle at depth index `x` was born at frame `birthFrame = frame - 99 + x`.
This means:
- Circle at x=80 (farthest): born at `frame - 19` (19 frames ago)
- Circle at x=4 (nearest): born at `frame - 95` (95 frames ago)

A circle's position on the sinusoidal path depends only on its birth frame.
Since `birthFrame` is a simple function of the current frame and the depth
index, no history needs to be stored.

---

## Back-to-Front Drawing

Circles are drawn from the farthest (x=80) to the nearest (x=4):

```javascript
for (let x = 80; x >= 4; x--) {
  const birthFrame = frame - 99 + x;
  // ...compute position, place dots...
}
```

This is the **painter's algorithm** — far circles are drawn first and
partially obscured by near circles drawn later. In the classic, this means
near dots overwrite far dots in the framebuffer. In the remastered, additive
blending means overlapping dots accumulate brightness instead of overwriting.

---

## Bright/Dark Alternation

Circles alternate between bright and dark every 8 frames:

```javascript
let baseColor;
if (birthFrame >= VEKE - 102) baseColor = 0;
else if ((birthFrame & 15) > 7) baseColor = 128;
else baseColor = 64;
```

- `baseColor = 64`: bright ring (palette 64–128 in classic = white gradient)
- `baseColor = 128`: dark ring (palette 128–192 = dimmer white gradient)
- `baseColor = 0`: invisible (used near the end of the effect)

The `(birthFrame & 15) > 7` check divides frames into groups of 16 and picks
the first 8 as bright, the second 8 as dark. This creates a visual rhythm —
alternating bright and dark rings provide depth cues beyond just size.

---

## Depth Fade

Each circle's colour is further darkened by its depth:

```javascript
const depthFade = x / 1.3;
const bbc = baseColor + Math.trunc(depthFade);
if (bbc < 64) continue;  // fully faded out — skip
```

The deeper a circle (higher `x`), the more `depthFade` is added to its base
colour. In the classic palette, higher indices within each range (64–128 or
128–192) are darker. So `baseColor + depthFade` pushes circles toward black.
When the combined index drops below 64, the circle has faded to invisible and
is skipped entirely.

In the remastered, this becomes a floating-point brightness:

```javascript
let brightness;
if (baseColor === 64) {
  brightness = Math.max(0, 1.0 - depthFade / 64);
} else {
  brightness = Math.max(0, 0.75 * (1.0 - depthFade / 64));
}
```

Bright rings start at 1.0 and dark rings at 0.75, both fading linearly
toward 0 with depth.

---

## O(1) Scrubbing

The tunnel achieves **O(1) random access** to any frame — no state replay
from frame 0 is needed. Every visible quantity is computed directly from the
current frame number:

| Quantity | How it is computed |
|----------|-------------------|
| Birth frame of circle x | `frame - 99 + x` |
| Position of circle x | `sinit[birthFrame * 3]`, `cosit[birthFrame]`, etc. |
| Colour of circle x | `baseColor + trunc(x / 1.3)` |
| Radius of circle x | `sade[x]` (constant table) |
| Reference camera position | Same formula applied to circle at x=5 |

Nothing depends on any previous frame's state. Jump to frame 500 and the
image is computed as quickly as jumping to frame 1. This is by design — TRUG
made all the position tables functions of the frame index alone, with no
cumulative velocity or acceleration.

Compare this with DOTS, where the physics simulation must be replayed from
frame 0 because each dot's velocity accumulates over time. The tunnel trades
that physical realism for instant random access.

---

**Next:** [Layer 3 — The Sinusoidal Path](03-sinusoidal-path.md)
