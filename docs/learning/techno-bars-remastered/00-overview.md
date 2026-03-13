# Techno Bars Remastered — Overview

**Effect:** Part 10 of the Second Reality demo (1993, Future Crew)
**What you see:** Rotating parallel bars that overlap to create layered interference patterns, with accelerating rotation and orbiting centres
**Duration:** 30.5 seconds (186.5 s – 217.0 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered TECHNO_BARS effect layer by layer. By the end
you will understand:

- How 11 parallel bars are defined by a single rotation angle and two direction vectors
- How modular-distance arithmetic tests whether a pixel falls inside any bar
- How the 1993 original used EGA/VGA bit-plane compositing across 8 video pages
- How three motion phases create the visual arc: bouncing, accelerating, orbiting
- How the GPU replaces page-flipping with per-pixel analytical evaluation in GLSL
- How overlap counting, tint interpolation, bloom, and scanlines produce the final image

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in a single source file plus shared WebGL helpers:

```
src/effects/technoBars/
  effect.js               — Classic variant
                            CPU rasteriser with 8-page × 4-plane
                            EGA compositing, 320×200 at 70 fps.

  effect.remastered.js    — Remastered variant (631 lines)
                            GPU-rendered analytical bar geometry
                            at native resolution, with anti-aliased
                            edges, overlap-based colouring, bloom,
                            and beat reactivity.

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(), etc.
```

There is no `data.js` — the techno bars are entirely algorithmic. No external
images, lookup tables, or binary data are needed. Everything is generated
mathematically at runtime.

---

## Architecture

```
        Classic (CPU)                    Remastered (GPU)
   ───────────────────              ─────────────────────────
   8 video pages × 4 planes        32-frame circular buffer
   Draw bars into one plane/page    Store bar params per frame
   Display page = composite         GLSL evaluates 4 planes/pixel
   Popcount palette (4-bit)         Analytical overlap counting
   320×200 at 70 fps                Native resolution
   No post-processing               Bloom + scanlines + beat
```

Both variants run the same state machine frame-by-frame. The classic draws
bar polygons into bit planes and relies on hardware compositing. The
remastered stores bar parameters in a circular buffer and evaluates all 11
bars analytically per pixel in a fragment shader.

The key architectural insight: the remastered effect does not render bitmaps
at all. Each pixel asks "am I inside any bar?" for all 4 planes independently,
sums the answers, and derives colour from the overlap count. This replaces
320×200 polygon rasterisation with resolution-independent analytical geometry.

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

The remastered variant also exports a `params` array describing 9 tunable
knobs (palette theme, colour smoothing, bloom strength, etc.) that the editor
auto-generates UI controls for.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-bar-geometry.md](01-bar-geometry.md) | Rotation vectors, modular distance, anti-aliased bar edges |
| 2 | [02-ega-history.md](02-ega-history.md) | EGA bit-plane architecture, 8-page animation, popcount palette |
| 3 | [03-motion-sequences.md](03-motion-sequences.md) | Three motion phases: bouncing, accelerating, orbiting |
| 4 | [04-gpu-rendering.md](04-gpu-rendering.md) | Analytical overlap counting, tint interpolation, bloom pipeline |
| 5 | [05-learning-path.md](05-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: Bar Geometry and Rotation](01-bar-geometry.md).
