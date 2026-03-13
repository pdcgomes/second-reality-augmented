# Tunneli Remastered — Overview

**Effect:** Part 7 of the Second Reality demo (1993, Future Crew)
**What you see:** A swirling tunnel of glowing dots receding into the distance, with neon colour gradients and bloom
**Duration:** 17.4 seconds (150.7 s – 168.1 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered TUNNELI effect layer by layer. By the end
you will understand:

- How precomputed elliptical ring templates create the tunnel shape
- How perspective foreshortening makes far circles appear smaller
- How sinusoidal position tables with growing amplitude create the spiralling path
- How Gaussian-splat point sprites replace single-pixel dots with soft glowing spheres
- How additive blending makes overlapping dots create natural hotspots
- How a dual-tier bloom pipeline wraps the tunnel in neon glow

The effect is an excellent study in O(1) random-access design — every frame's
state is computed directly from the frame number with no accumulated history.
Scrubbing to any point in the timeline is instant.

---

## File Map

The effect lives in two source files plus shared WebGL helpers:

```
src/effects/tunneli/
  effect.js               — Classic variant (165 lines)
                            CPU rasteriser, 320×200, indexed palette.
                            Faithful 1:1 recreation of the 1993 original.

  effect.remastered.js    — Remastered variant (536 lines)
                            GPU point sprites, Gaussian splats,
                            neon HSL gradients, bloom, beat reactivity.

src/core/
  webgl.js                — Shared WebGL2 helpers (91 lines)
                            createProgram(), createFullscreenQuad(), etc.
```

No `data.js` or `animation.js` — unlike DOTS, the tunnel does not separate
its animation into a shared module. Both variants embed the same lookup tables
(sinit, cosit, sade) directly. The animation is simple enough that this
duplication is preferable to an extra import.

---

## Architecture

```
        Classic (CPU)                    Remastered (GPU)
   ───────────────────              ─────────────────────────
   320×200 pixel buffer             Native-resolution FBO
   Single-pixel dot writes          GL_POINTS with Gaussian splats
   64 dots per ring                 64–512 configurable dots per ring
   Monochrome white palette         HSL neon gradient (depth-based)
   Palette-index depth fade         Alpha + size attenuation
   No post-processing              Dual-tier bloom + scanlines
   No audio reactivity             Beat-reactive dot size + bloom
```

Both variants share the same mathematical model: precomputed sinusoidal
position tables with linearly growing amplitude, a 100-circle shift buffer,
and `sade[]` perspective foreshortening. The key architectural insight is
that **all state derives from the frame number** — no cumulative variables,
no history. Jump to any frame, compute the tables, render.

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

The remastered variant exports 8 tunable parameters (theme, dots per ring,
dot size, bloom, beat reactivity, etc.).

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-circle-templates.md](01-circle-templates.md) | How elliptical ring templates build the tunnel shape |
| 2 | [02-depth-and-perspective.md](02-depth-and-perspective.md) | Foreshortening, the shift buffer, and O(1) scrub design |
| 3 | [03-sinusoidal-path.md](03-sinusoidal-path.md) | Position tables with growing amplitude for the spiralling path |
| 4 | [04-gaussian-splats.md](04-gaussian-splats.md) | Anti-aliased dot rendering with point sprites and additive blending |
| 5 | [05-neon-bloom.md](05-neon-bloom.md) | HSL colour gradients and the dual-tier bloom pipeline |
| 6 | [06-learning-path.md](06-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: Circle Templates](01-circle-templates.md).
