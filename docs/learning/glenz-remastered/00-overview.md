# Glenz Remastered — Overview

**Effect:** Part 6 of the Second Reality demo (1993, Future Crew)
**What you see:** Two translucent Tetrakis hexahedra bouncing and orbiting with jelly deformation, Fresnel glass transparency, specular highlights, and bloom
**Duration:** 28.9 seconds (121.8 s – 150.7 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered GLENZ_3D effect layer by layer. By the end
you will understand:

- How a Tetrakis hexahedron is built from a cube plus pyramids (14 vertices, 24 faces)
- How a shared animation state machine drives bounce physics and jelly deformation
- How a custom vertex shader transforms real 3D geometry (the first effect that is not a fullscreen quad)
- How the classic's OR-indexed palette trick achieved transparency without per-pixel math
- How the remastered replaces that with GPU alpha blending and Fresnel glass
- How Blinn-Phong specular lighting creates the glossy stained-glass look
- How a multi-pass FBO pipeline adds dual-tier bloom and beat-reactive glow

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in four source files plus shared WebGL helpers:

```
src/effects/glenzVectors/
  animation.js            — Shared animation state machine (148 lines)
                            Bounce physics, jelly deformation, orbit paths,
                            scale-in/out. Both classic and remastered import
                            from here.

  data.js                 — Tetrakis hexahedron geometry (47 lines)
                            14 vertices, 24 faces × 2 objects.

  effect.js               — Classic variant (368 lines)
                            CPU software rasterizer, 320×200 indexed
                            framebuffer, OR-blend transparency trick.

  effect.remastered.js    — Remastered variant (885 lines)
                            GPU vertex pipeline, Phong/Fresnel shading,
                            true alpha blending, dual-tier bloom.

src/effects/glenzTransition/
  data.js                 — Checkerboard background texture (base64)
                            Shared with the Glenz Transition effect (Part 5).

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(),
                            FULLSCREEN_VERT passthrough shader.
```

---

## Architecture

Both variants share the same animation state machine. The classic renders with
a CPU software rasterizer into a 320×200 indexed framebuffer. The remastered
sends the same state into GPU model-view matrices for real-time lit mesh
rendering with post-processing.

```
                 animation.js
          (bounce, jelly, orbits, scales)
                 /            \
                v              v
         effect.js       effect.remastered.js
      (CPU rasterise)    (GPU mesh pipeline)
       320×200 VGA        native resolution
       OR-indexed blend   true alpha blending
       flat face shading  Phong + Fresnel glass
       no post-fx         dual-tier bloom
```

The key architectural insight: because both variants replay the exact same
`stepFrame()` function from frame 0, their choreography is guaranteed to match
perfectly. You can toggle between classic and remastered in the editor and the
polyhedra move identically.

**This is the project's first effect with a custom vertex shader.** All other
effects use only `FULLSCREEN_VERT` (a passthrough that maps a quad to the
screen). The Glenz remastered introduces `MESH_VERT`, which transforms actual
3D vertex positions and normals through model-view-projection matrices.

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

The remastered variant exports a `params` array describing 13 tunable knobs
(palette theme, brightness, Fresnel, bloom strength, etc.) that the editor
auto-generates UI controls for.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-tetrakis-geometry.md](01-tetrakis-geometry.md) | How a cube + pyramids creates a 14-vertex, 24-face Tetrakis hexahedron |
| 2 | [02-animation-state-machine.md](02-animation-state-machine.md) | Bounce physics, jelly deformation (spring-damper), dual-object orbits |
| 3 | [03-vertex-pipeline.md](03-vertex-pipeline.md) | Model-view-projection matrices and the custom MESH_VERT shader |
| 4 | [04-transparency.md](04-transparency.md) | Classic OR-indexed palette trick vs modern GPU alpha blending with Fresnel |
| 5 | [05-phong-lighting.md](05-phong-lighting.md) | Blinn-Phong specular, diffuse, ambient — the glass material model |
| 6 | [06-bloom-composite.md](06-bloom-composite.md) | Multi-pass FBO pipeline: scene → bloom → composite with beat reactivity |
| 7 | [07-learning-path.md](07-learning-path.md) | Hands-on exercises: swap polyhedra, add reflections, tweak Fresnel and jelly |

Start with [Layer 1: Tetrakis Hexahedron Geometry](01-tetrakis-geometry.md).
