# Water Remastered — Overview

**Effect:** Part 19 of the Second Reality demo (1993, Future Crew)
**What you see:** Chrome spheres bobbing over animated water with a scrolling sword texture
**Duration:** 28.9 seconds (409.9 s – 438.8 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered WATER effect layer by layer. By the end you
will understand:

- How pre-computed **position lookup tables** distort a source image to wrap it
  around invisible chrome spheres on a 1993 CPU
- How **3-pass interlaced rendering** distributes work across frames and creates
  the characteristic shimmering metallic look
- How the classic **image compositing** pipeline layers a scrolling sword over a
  mountain background with depth ordering
- How the remastered variant replaces all of this with a single
  **GPU raymarching** shader that traces rays through a procedural 3D scene
- How a **dual-tier bloom pipeline** adds glow and beat reactivity

Each layer builds on the last. Layers 1–3 explain the classic technique (the
*why* behind the original's visual character). Layer 4 explains how the
remastered version achieves the same look with modern GPU techniques. Layer 5
gives you hands-on exercises.

---

## File Map

The effect lives in two source files plus a shared data module and WebGL helpers:

```
src/effects/water/
  data.js                 — Base64-embedded binary assets (203 KB)
                            Palette, sword font, background, 3 POS tables.
                            Shared by both classic and remastered.

  effect.js               — Classic variant (225 lines)
                            CPU software renderer, 320×200 VGA palette.
                            POS-table-driven image distortion with
                            checkpoint-based scrubbing.

  effect.remastered.js    — Remastered variant (831 lines)
                            GPU raymarched chrome spheres over animated
                            water, bloom, beat-reactive lighting, 13
                            palette themes.

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(), etc.
```

---

## Architecture

The classic and remastered variants share only the sword texture data. Unlike
DOTS (which shares a physics simulation), WATER's classic approach is so
fundamentally different that no shared animation module exists. The only common
choreography is the scroll offset — trivially computed from wall-clock time.

```
                   data.js
          (palette, sword font, BG,
           WAT1/WAT2/WAT3 POS tables)
                 /           \
                v             v
         effect.js      effect.remastered.js
      (CPU rasterise)   (GPU raymarching)
       320×200 VGA       native resolution
       POS table warp    SDF spheres + water
       static BG         procedural ripples
       no post-fx        bloom + reflections
       no beat sync      beat-reactive
```

The key architectural insight: the classic variant's visual character comes
entirely from the **POS lookup tables** — pre-baked displacement maps that
were generated offline in 1993 from a 3D sphere model. The remastered variant
recreates the *intent* of those tables (chrome spheres reflecting a scrolling
image) using real-time raymarching.

---

## The Effect Interface

Every effect in this project exports three methods:

```javascript
export default {
  init(gl) { },                       // set up shaders, buffers, textures
  render(gl, t, beat, params) { },    // called every frame
  destroy(gl) { },                    // clean up GPU resources
}
```

Where:
- `gl` — a WebGL2 rendering context
- `t` — seconds elapsed since this clip started (not global time)
- `beat` — 0.0 to 1.0 position within the current musical bar
- `params` — key-value object of tunable parameters from the editor

The remastered variant also exports a `params` array describing 40+ tunable
knobs (sphere positions, ripple settings, camera, bloom, palette theme) that the
editor auto-generates UI controls for. Parameters are grouped into categories:

| Group | What it controls |
|-------|-----------------|
| Palette | 13 colour themes (Classic, Gruvbox, Monokai, Dracula, …) |
| Animation | Sphere bob amplitude, speed, beat scale |
| Scene | Ripple frequency/speed/amplitude, water darkness, specular, Fresnel |
| Camera | Height, pitch angle |
| Sword | Position (X/Y/Z), orientation (pitch/yaw/roll/tilt), size, brightness |
| Spheres 1–3 | Per-sphere X/Y/Z position and radius |
| Post-Processing | Bloom threshold, tight/wide intensity, scanlines, beat bloom |

---

## Classic vs Remastered — At a Glance

| Aspect | Classic | Remastered |
|--------|---------|------------|
| Resolution | 320×200 fixed | Native display (4K capable) |
| Rendering | CPU indexed-colour framebuffer | GPU fragment shader raymarching |
| Spheres | Baked into static background image | Procedural SDF with animated bobbing |
| Reflections | Pre-computed POS lookup tables | Real-time ray-traced reflections |
| Water surface | Static (no animation) | Animated ripples emanating from spheres |
| Sword compositing | Shift buffer + POS table overlay | Billboard plane with UV scrolling |
| Palette | 256-colour VGA indexed | Full HDR + 13 colour remap themes |
| Audio sync | None | Beat-reactive bob, specular, bloom |
| Post-processing | None | Dual-tier bloom + CRT scanlines |

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-lookup-tables.md](01-lookup-tables.md) | How POS tables distort pixels to create chrome sphere reflections |
| 2 | [02-interlaced-rendering.md](02-interlaced-rendering.md) | Why 3 interlaced passes and how they create the shimmering look |
| 3 | [03-image-compositing.md](03-image-compositing.md) | Sword scrolling, background layering, depth ordering |
| 4 | [04-gpu-rendering.md](04-gpu-rendering.md) | GPU raymarching, SDF spheres, water ripples, reflections |
| 5 | [05-learning-path.md](05-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: Position Lookup Tables](01-lookup-tables.md).
