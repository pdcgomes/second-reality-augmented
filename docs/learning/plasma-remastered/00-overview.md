# Plasma Remastered — Overview

**Effect:** Part 16 of the Second Reality demo (1993, Future Crew)
**What you see:** Swirling organic colour patterns filling the screen, cycling through red, rainbow, and grey-white palettes with smooth "drop" transitions
**Duration:** 37.7 seconds (306.2 s – 343.9 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered PLZ_PLASMA effect layer by layer. By the end
you will understand:

- How three layered sine harmonics create complex organic patterns from nothing but `sin()`
- How two independent plasma layers blend together to produce visual richness
- How indexed 256-colour palettes become smooth continuous colour via procedural GLSL functions
- How a 3×3 colour remapping matrix can transform a single palette into 21 different themes
- How bloom post-processing adds a soft glow to bright regions of the plasma

This is the purest fragment-shader effect in the project — no geometry, no
vertex pipeline, no external textures. Every pixel is computed from scratch
using only sine functions and arithmetic. If you are new to shaders, this is
an ideal place to start.

---

## File Map

The effect lives in two source files plus shared WebGL helpers:

```
src/effects/plasma/
  effect.js               — Classic variant (259 lines)
                            CPU software renderer, 320×200 VGA palette.
                            Faithful 1:1 recreation of the 1993 original.

  effect.remastered.js    — Remastered variant (573 lines)
                            GPU-computed plasma at native resolution,
                            procedural palettes, bloom, beat reactivity.

src/core/
  webgl.js                — Shared WebGL2 helpers (91 lines)
                            createProgram(), createFullscreenQuad(), etc.
```

There is no `data.js` — the plasma is entirely procedural. No external
images, lookup tables, or binary data are needed. Everything is generated
mathematically at runtime.

---

## Architecture

```
        Classic (CPU)                    Remastered (GPU)
   ───────────────────              ─────────────────────────
   320×200 pixel buffer             Native-resolution FBO
   Integer sine tables              GLSL sin() per pixel
   256-entry indexed palette        Procedural float palette
   Checkerboard interleave          Smooth spatial blend
   No post-processing              Dual-tier bloom + scanlines
   No audio reactivity             Beat-driven palette + glow
```

Both variants compute the exact same plasma formula — three multi-harmonic
sine functions combined per pixel. The classic does this with integer lookup
tables on the CPU; the remastered does it with GLSL `sin()` on the GPU at
whatever resolution the display happens to be.

The key architectural insight: because there is no external data and no
persistent state, the plasma is a pure function of time. Give it any frame
number and it produces the exact right image. This makes scrubbing in the
editor trivial.

---

## The Effect Interface

Every effect in this project exports three methods:

```javascript
export default {
  init(gl) { },             // called once — set up shaders, buffers, textures
  render(gl, t, beat, params) { },  // called every frame
  destroy(gl) { },          // called when the effect is unloaded
}
```

Where:
- `gl` — a WebGL2 rendering context
- `t` — seconds elapsed since this clip started (not global time)
- `beat` — 0.0 to 1.0 position within the current musical bar
- `params` — key-value object of tunable parameters from the editor

The remastered plasma exports a `params` array describing 8 tunable knobs
(palette theme, hue shift, bloom strength, etc.) that the editor
auto-generates UI controls for.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-sine-harmonics.md](01-sine-harmonics.md) | How layered sine waves create complex organic patterns |
| 2 | [02-dual-layer-interleave.md](02-dual-layer-interleave.md) | Two plasma layers blended with parameter-driven animation |
| 3 | [03-palette-sequences.md](03-palette-sequences.md) | Procedural colour palettes, drop transitions, and theme matrices |
| 4 | [04-bloom-and-beat.md](04-bloom-and-beat.md) | Bloom post-processing and beat-reactive visuals |
| 5 | [05-learning-path.md](05-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: Sine Harmonics](01-sine-harmonics.md).
