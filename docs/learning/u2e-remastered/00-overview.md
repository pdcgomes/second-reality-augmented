# U2E Remastered — Overview

**Effect:** Part 22 of the Second Reality demo (1993, Future Crew)
**What you see:** A 3D city flyover — 42 polygon objects (buildings, trees, tunnels, roads, spaceship) rendered with GPU lighting, atmospheric fog, and bloom
**Duration:** ~53 seconds (510.4 s – 563.7 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered U2E effect ("Vector Part II") layer by layer.
By the end you will understand:

- How 42 binary 3D objects are loaded and organised in a scene graph
- How the U2 polygon engine transforms, clips, and shades polygons
- How pre-baked animation bytecode drives camera and object motion
- How depth sorting, backface culling, and per-face shading decisions work at scale
- How the remastered variant moves all rendering to the GPU while reusing the original animation engine
- How bloom, fog, and exhaust glow create the enhanced visual treatment

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in four source files plus shared WebGL helpers:

```
src/effects/u2e/
  u2engine.js             — U2 3D engine (821 lines)
                            Scene loading, animation decoder, 3D transform
                            pipeline, polygon clipping, flat + Gouraud
                            scanline filling. Shared by both variants.

  effect.js               — Classic variant (206 lines)
                            CPU software rasterizer, 320×200 indexed
                            framebuffer. Faithful 1:1 recreation of the
                            1993 original.

  effect.remastered.js    — Remastered variant (957 lines)
                            GPU-rendered polygons at native resolution,
                            palette-ramp lighting via texture lookup,
                            atmospheric fog, exhaust glow, dual-tier bloom.

  data.js                 — Binary asset data (base64-encoded)
                            Scene file (00M), 42 object files (001–042),
                            animation bytecode (0AB).

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(), etc.
```

---

## Architecture

Both variants share the same U2 engine for animation. The classic renders the
full 3D pipeline on the CPU into a 320×200 indexed framebuffer. The remastered
uses the engine only for animation state — transforms, visibility, camera, FOV —
and renders geometry entirely on the GPU.

```
                   u2engine.js
        (animation decoding, object transforms)
                 /               \
                v                 v
         effect.js         effect.remastered.js
      (CPU rasteriser)     (GPU vertex pipeline)
       320×200 VGA          native resolution
       palette indexed      palette texture lookup
       painter's algo       hardware depth buffer
       no post-fx           fog + bloom + sky
```

The key architectural insight: the remastered variant treats the U2 engine as a
**read-only animation data source**. It calls `seekFrame(n)` or
`stepOneAnimationFrame()` to advance state, then reads `camera`, `fov`, and
per-object transforms via `getObject(i)`. All rendering — vertex transformation,
lighting, rasterisation — happens in WebGL shaders.

---

## The Dual Frame Rate

The original demo runs on a 70 Hz VGA display. The U2E city scene renders
every other vsync, producing an effective **35 fps animation rate**. The
remastered preserves this cadence:

```
70 Hz display clock
  │
  ├─ frame70 = floor(t × 70)          ← display ticks
  │
  └─ animFrame = floor((frame70 - 81) / 2)  ← animation ticks (35 fps)
       │
       └─ engine.seekFrame(animFrame)
```

The first 81 display frames (frames 0–80 at 70 Hz) are spent on the intro
transition: white fade, border setup, colour reveal. Animation begins at
frame 81. Dividing by 2 gives the 35 fps animation rate.

---

## The Effect Interface

Every effect in this project exports three methods:

```javascript
export default {
  init(gl) { },             // set up shaders, buffers, extract geometry
  render(gl, t, beat, params) { },  // called every display frame
  destroy(gl) { },          // release all GPU resources
}
```

The remastered variant also exports a `params` array of 21 tunable knobs
(fog, bloom, sky, exhaust glow) that the editor auto-generates UI controls for.

---

## Relationship to U2A

U2E shares the same U2 engine as the earlier **U2A** effect (Part 2 — the
spaceship fly-in). Both load scenes, objects, and animation bytecode through
`createU2Engine()`. The key differences:

| Aspect | U2A (Part 2) | U2E (Part 22) |
|--------|-------------|---------------|
| Scene | 1 spaceship object | 42 city objects |
| Animation | Short fly-in sequence | Full city flyover (~1000+ frames) |
| Complexity | Single-object focus | Large scene management |
| Remastered exhaust | Introduced here | Reused with same parameters |

The spaceship exhaust glow system (`uExhaustGlow`, `uExhaustPulse`,
`uExhaustHueShift`) was designed in U2A and reused identically in U2E for
visual consistency across the demo.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-scene-graph.md](01-scene-graph.md) | 42 polygon objects: loading, spatial organisation, object culling |
| 2 | [02-polygon-engine.md](02-polygon-engine.md) | The U2 engine's 3D transform pipeline, clipping, and shading |
| 3 | [03-animation-bake.md](03-animation-bake.md) | Pre-baked animation bytecode: decoding, playback, scrubbing |
| 4 | [04-large-scene-rendering.md](04-large-scene-rendering.md) | Depth sorting, backface culling, flat vs Gouraud per-face decisions |
| 5 | [05-gpu-rendering.md](05-gpu-rendering.md) | Modern GPU approach: VAOs, palette textures, fog, bloom |
| 6 | [06-learning-path.md](06-learning-path.md) | Exercises: change buildings, add fog, experiment with camera speed |

Start with [Layer 1: The Scene Graph](01-scene-graph.md).
