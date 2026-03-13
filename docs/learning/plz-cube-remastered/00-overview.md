# PLZ Cube Remastered — Overview

**Effect:** Part 17 of the Second Reality demo (1993, Future Crew)
**What you see:** A rotating 3D cube with animated procedural plasma textures on each face, per-pixel Blinn-Phong lighting, and dual-tier bloom
**Duration:** 28.6 seconds (343.9 s – 372.5 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered PLZ_CUBE effect layer by layer. By the end
you will understand:

- How nested sine waves create a **procedural plasma texture** evaluated per-pixel in a fragment shader
- How a cube mesh is constructed with interleaved **vertex attributes** (position, UV, normal, theme index)
- How **B-spline interpolation** generates a smooth camera path from a table of control points
- How **Blinn-Phong lighting** with an orbiting light source creates per-pixel diffuse and specular shading
- How a **dual-tier bloom pipeline** adds glow that reacts to the musical beat
- How all of this renders at native resolution with **4× MSAA** anti-aliasing

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in a single source file plus shared WebGL helpers:

```
src/effects/plzCube/
  effect.js               — Classic variant (302 lines)
                            CPU software rasterizer, 320×134 VGA palette,
                            affine texture mapping, flat per-face lighting.

  effect.remastered.js    — Remastered variant (683 lines)
                            GPU vertex pipeline, procedural plasma in GLSL,
                            Blinn-Phong lighting, dual-tier bloom, 12 palette
                            themes, 11 editor-tunable parameters.

src/core/
  webgl.js                — Shared WebGL2 helpers
                            createProgram(), createFullscreenQuad(),
                            FULLSCREEN_VERT passthrough shader.
```

---

## Architecture

Unlike effects that share an `animation.js` module, PLZ_CUBE is fully
self-contained. Both variants embed the same spline coefficients and control
points, so their camera choreography matches, but there is no shared runtime
code beyond `core/webgl.js`.

```
                 SPLINE_COEFF + ANIM_SPLINE
            (identical tables in both files)
                   /              \
                  v                v
           effect.js        effect.remastered.js
        (CPU rasterise)     (GPU vertex pipeline)
         320×134 VGA         native resolution
         affine UV           perspective-correct UV
         flat per-face       per-pixel Blinn-Phong
         3 fixed palettes    12 selectable themes
         no post-fx          dual-tier bloom + MSAA
```

The classic builds three 256×64 lookup textures on the CPU and rasterises
textured quads with a scanline filler. The remastered evaluates the identical
sine formula per-pixel in the **fragment shader** — no lookup tables needed.

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

The remastered variant exports a `params` array describing 11 tunable knobs
(palette, hue shifts, distortion, specular power, bloom, beat reactivity, and
scanlines) that the editor auto-generates UI controls for.

---

## Classic vs Remastered Comparison

| Aspect | Classic | Remastered |
|--------|---------|------------|
| Resolution | 320×134, scanlines tripled to 400 | Native display resolution |
| Rendering | CPU scanline polygon filler | GPU vertex pipeline + indexed draw |
| Texturing | Affine UV interpolation (warps on large faces) | Perspective-correct GPU interpolation |
| Plasma | Pre-computed 256×64 lookup tables per theme | Per-pixel GLSL evaluation of same formula |
| Lighting | Flat per-face diffuse (light/64) | Per-pixel Blinn-Phong diffuse + specular |
| Anti-aliasing | None (aliased polygon edges) | 4× MSAA via renderbuffer |
| Colour themes | 3 hardcoded VGA palette ramps | 12 selectable themes + per-face hue rotation |
| Post-processing | None | Dual-tier bloom + optional CRT scanlines |
| Audio sync | None | Beat-reactive specular, colour boost, and bloom |
| Parameters | None | 11 editor-tunable values |

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-plasma-as-texture.md](01-plasma-as-texture.md) | Nested sine waves as a procedural 3D texture, per-face UV mapping |
| 2 | [02-cube-geometry.md](02-cube-geometry.md) | Interleaved vertex buffer, 3 colour themes per face pair, index buffer |
| 3 | [03-spline-camera.md](03-spline-camera.md) | B-spline evaluation, smooth camera path, coordinate system conversion |
| 4 | [04-diffuse-lighting.md](04-diffuse-lighting.md) | Blinn-Phong shading, orbiting light source, surface normals |
| 5 | [05-bloom-and-postfx.md](05-bloom-and-postfx.md) | Dual-tier bloom, beat reactivity, palette themes, MSAA resolve |
| 6 | [06-learning-path.md](06-learning-path.md) | Exercises: replace geometry, animate plasma, add specular effects |

Start with [Layer 1: Plasma as Texture](01-plasma-as-texture.md).
