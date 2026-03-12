# Dots Remastered — Overview

**Effect:** Part 18 of the Second Reality demo (1993, Future Crew)
**What you see:** 512 bouncing spheres on a glossy floor with reflections and bloom
**Duration:** 37.4 seconds (372.5 s – 409.9 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered DOTS effect layer by layer. By the end you
will understand:

- How a simple physics simulation creates complex-looking particle choreography
- How the GPU draws 512 spheres in a single draw call (instancing)
- How flat quads fake perfect 3D spheres (the "impostor" trick)
- How 1993-era projection maths maps 3D to 2D without matrices
- How reflections work by mirroring geometry below a floor plane
- How bloom makes bright things glow using blurred copies of the scene
- How 5 render passes combine into the final frame

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in three source files plus shared WebGL helpers:

```
src/effects/dots/
  animation.js            — Shared physics simulation (119 lines)
                            Both classic and remastered import from here.

  effect.js               — Classic variant (172 lines)
                            CPU software renderer, 320x200 VGA palette.
                            Faithful 1:1 recreation of the 1993 original.

  effect.remastered.js    — Remastered variant (605 lines)
                            GPU-rendered sphere impostors, reflections,
                            bloom, beat-reactive lighting.

src/core/
  webgl.js                — Shared WebGL2 helpers (91 lines)
                            createProgram(), createFullscreenQuad(), etc.
```

---

## Architecture

Both variants share the same physics simulation. The classic renders on the CPU
into a 320x200 framebuffer. The remastered feeds the same positions into GPU
instance buffers for real-time lit sphere rendering with post-processing.

```
                animation.js
           (512 dots, 70 fps physics)
                /           \
               v             v
        effect.js      effect.remastered.js
     (CPU rasterise)   (GPU instanced spheres)
      320x200 VGA       native resolution
      palette colors    HSL + Phong lighting
      no post-fx        bloom + reflections
```

The key architectural insight: because both variants run the exact same
`simulateDots()` function frame-by-frame, their choreography is guaranteed to
match perfectly. You can toggle between classic and remastered in the editor
and the dots move identically.

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

The remastered variant also exports a `params` array describing 11 tunable
knobs (hue, saturation, bloom strength, etc.) that the editor auto-generates
UI controls for.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-simulation.md](01-simulation.md) | Particle physics: spawning, gravity, bouncing, deterministic replay |
| 2 | [02-instancing.md](02-instancing.md) | How one quad becomes 512 spheres in a single GPU draw call |
| 3 | [03-sphere-impostor.md](03-sphere-impostor.md) | Faking 3D spheres with a flat quad and a fragment shader |
| 4 | [04-projection.md](04-projection.md) | Converting 3D positions to screen coordinates without matrices |
| 5 | [05-reflections.md](05-reflections.md) | Mirroring geometry for a glossy floor with Fresnel blending |
| 6 | [06-bloom.md](06-bloom.md) | Making bright things glow with a dual-tier blur pipeline |
| 7 | [07-render-loop.md](07-render-loop.md) | How 5 render passes combine into the final frame |
| 8 | [08-learning-path.md](08-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: The Simulation](01-simulation.md).
