# Lens Lens Remastered — Overview

**Effect:** Part 14 of the Second Reality demo (1993, Future Crew)
**What you see:** A transparent crystal ball bouncing over a background image, refracting and distorting what's behind it
**Duration:** 11.3 seconds (265.6 s – 276.9 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered LENS_LENS effect layer by layer. By the end
you will understand:

- How a glass sphere bends light and why **Snell's law** is the key formula
- How the classic used **pre-computed displacement maps** to fake refraction cheaply on a 1993 CPU
- How the bouncing ball's **gravity simulation** works with dampened rebounds
- How the remastered replaces lookup tables with a **GPU refraction shader**
- How **bloom**, **palette themes**, and **beat reactivity** add the finishing polish
- How to experiment with the code: change lens curvature, add chromatic aberration, or spawn multiple lenses

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in three source files plus shared WebGL helpers:

```
src/effects/lens/
  data.js                 — Shared image data (2 files)
                            320×200 KOE background image (palette + pixels),
                            lens dimensions (152×116), and five displacement
                            lookup tables (EX0–EX4) used by the classic.

  effect.js               — Classic variant (251 lines)
                            CPU software renderer, 320×200 VGA palette.
                            Pre-computed lookup tables for lens distortion.
                            Palette-based transparency via OR masking.

  effect.remastered.js    — Remastered variant (657 lines)
                            GPU-rendered crystal ball with analytical Snell's
                            law refraction, Blinn-Phong specular, Fresnel rim,
                            environment reflection, chromatic aberration,
                            and dual-tier bloom post-processing.

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(), etc.
```

---

## Architecture

Both variants share the same bouncing physics and the same KOE background
image from `data.js`. The classic reads the background through pre-computed
displacement tables on the CPU. The remastered computes refraction analytically
in a GPU fragment shader.

```
                  data.js
         (KOE image + lens dimensions)
              /              \
             v                v
      effect.js         effect.remastered.js
   (CPU displacement)   (GPU refraction shader)
    320×200 VGA          native resolution
    lookup tables        analytical Snell's law
    palette mixing       Fresnel + specular + bloom
    no post-fx           dual-tier bloom + scanlines
```

The key architectural insight: the remastered does **not** use the EX0–EX4
lookup tables at all. It only imports `LENS_W`, `LENS_H` (to size the sphere
on screen), `LENS_PAL_B64`, and `LENS_PIX_B64` (to build the background
texture). The entire lens distortion is computed per-pixel in the fragment
shader.

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

The remastered variant also exports a `params` array describing 20 tunable
knobs across 5 groups (Palette, Eyes, Background, Ball, Post-Processing) that
the editor auto-generates UI controls for.

---

## Layer Table

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-refraction-optics.md](01-refraction-optics.md) | How a glass sphere bends light, Snell's law intuition |
| 2 | [02-displacement-map.md](02-displacement-map.md) | The classic's pre-computed displacement lookup tables |
| 3 | [03-bounce-physics.md](03-bounce-physics.md) | Position, velocity, gravity simulation for the bouncing lens |
| 4 | [04-gpu-displacement.md](04-gpu-displacement.md) | Porting the displacement lookup to a GPU refraction shader |
| 5 | [05-bloom-and-palette.md](05-bloom-and-palette.md) | Bloom pipeline, palette themes, beat reactivity |
| 6 | [06-learning-path.md](06-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: Refraction Optics](01-refraction-optics.md).
