# Coman Remastered — Overview

**Effect:** Part 20 of the Second Reality demo (1993, Future Crew)
**What you see:** A flyover of rolling VoxelSpace terrain with atmospheric fog and bloom
**Duration:** 71.6 seconds (438.8 s – 510.4 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered COMAN effect layer by layer. By the end you
will understand:

- How two summed height maps create a terrain surface (the VoxelSpace approach)
- How a column-by-column raymarch renders terrain without triangles
- How the camera path accumulates position from rotation — and why scrubbing
  requires replaying every frame from zero
- How the CPU column march was ported to a GLSL fragment shader for native
  resolution rendering
- How atmospheric fog, a procedural palette, and dual-tier bloom create the
  final mood
- How beat reactivity pulses terrain brightness and bloom on the music

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## Historical Context: VoxelSpace and Comanche

The VoxelSpace algorithm was created by **Kyle Freeman at NovaLogic** for the
1992 helicopter game *Comanche: Maximum Overkill*. At a time when 3D hardware
did not exist for consumers, VoxelSpace rendered continuous terrain on a 386 CPU
by casting one ray per screen column through a height map — no polygons needed.

```
Comanche (1992)           Second Reality COMAN (1993)
┌──────────────┐          ┌──────────────┐
│ 320 columns  │          │ 160 columns  │
│ 1 height map │          │ 2 height maps│
│ colour map   │          │ procedural   │
│ real terrain │          │  palette     │
│ flight sim   │          │ abstract     │
└──────────────┘          │  landscape   │
                          └──────────────┘
```

PSI's COMAN part in Second Reality borrowed the same core idea: march rays
through a height field, column by column, bottom to top. Instead of realistic
terrain, the two summed sine-based height maps produce an abstract rolling
landscape — a "3D sinusfield."

The remastered variant keeps the algorithm but moves the march into a GLSL
fragment shader, running one ray **per pixel** instead of per column.

---

## File Map

The effect lives in two source files plus shared data and WebGL helpers:

```
src/effects/coman/
  effect.js               — Classic variant (243 lines)
                            CPU software rasteriser, 160 columns pixel-
                            doubled to 320×200 VGA. 1:1 faithful to the
                            1993 original.

  effect.remastered.js    — Remastered variant (621 lines)
                            GPU fragment shader raymarch at native
                            display resolution. Bilinear height
                            interpolation, atmospheric fog, dual-tier
                            bloom, 13 colour themes.

  data.js                 — Base64-encoded height map data
                            W1DTA_B64 and W2DTA_B64: two 256×128
                            signed 16-bit height fields.

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(),
                            FULLSCREEN_VERT.
```

---

## Architecture

Both variants share the same height map data and camera-path logic. The classic
renders on the CPU into a 320×200 framebuffer. The remastered runs the
VoxelSpace march entirely in a fragment shader at native resolution, with
post-processing added on top.

```
              data.js
        (W1DTA_B64, W2DTA_B64)
              /           \
             v             v
      effect.js      effect.remastered.js
   (CPU column march)  (GPU fragment shader march)
    160 cols → 320×200   native resolution
    integer height       bilinear interpolation
    no post-fx           fog + bloom + scanlines
    single palette       13 colour themes
```

The camera path is deterministic but **cumulative** — each frame's position
depends on all previous frames. Both variants replay from frame 0 every render
call, making arbitrary time scrubbing possible at the cost of re-running the
accumulation loop.

---

## The Effect Interface

Every effect in this project exports three methods plus an optional `params`
array:

```javascript
export default {
  label: 'coman (remastered)',
  params: [ ... ],               // 13 tunable parameters for the editor
  init(gl) { },                  // set up shaders, textures, FBOs
  render(gl, t, beat, params) { }, // called every frame
  destroy(gl) { },               // clean up all GL resources
}
```

Where:
- **`gl`** — a WebGL2 rendering context
- **`t`** — seconds elapsed since this clip started (local time)
- **`beat`** — 0.0 to 1.0 position within the current musical bar
- **`params`** — key-value object of tunable parameters from the editor

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-height-maps.md](01-height-maps.md) | Dual signed height maps, summation, z-wave undulation, R32F textures |
| 2 | [02-column-raymarching.md](02-column-raymarching.md) | Per-column front-to-back terrain march, occlusion, bail-and-double |
| 3 | [03-camera-path.md](03-camera-path.md) | Cumulative position from rotation, sinusoidal velocity, frame-0 replay |
| 4 | [04-gpu-voxelspace.md](04-gpu-voxelspace.md) | Porting the CPU march to a fragment shader, bilinear interpolation |
| 5 | [05-atmosphere.md](05-atmosphere.md) | Distance fog, procedural palette, bloom pipeline, beat reactivity |
| 6 | [06-learning-path.md](06-learning-path.md) | Exercises: water plane, depth colouring, ray step experiments |

Start with [Layer 1: Height Maps](01-height-maps.md).
