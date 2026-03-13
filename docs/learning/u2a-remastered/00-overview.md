# U2A Remastered — Overview

**Effect:** Part 2 of the Second Reality demo (1993, Future Crew)
**What you see:** Three polygon spaceships flying over the ALKU landscape
**Duration:** 13 seconds (65.0 s – 78.0 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered U2A effect layer by layer. By the end you
will understand:

- How binary animation streams encode 3D object choreography at 70 fps
- How PSI's polygon engine loads vertices, normals, and faces from FC's format
- How painter's algorithm sorts objects back-to-front for correct overlap
- How Gouraud shading interpolates colour across polygon scanlines
- How Sutherland-Hodgman clipping trims polygons to the view frustum
- How 1993-era perspective projection maps 3D to 2D with fixed-point maths
- How the remastered variant moves all of this onto the GPU with bloom and DoF

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in four source files plus shared WebGL helpers:

```
src/effects/u2a/
  data.js                  — Base64-encoded binary assets (~generated)
                             SCENE_B64, ANIM_B64, OBJ_B64S (3 ship models)

  engine.js                — Self-contained U2 3D engine port (677 lines)
                             Object loader, animation decoder, matrix maths,
                             projection, Sutherland-Hodgman clipping,
                             flat/Gouraud polygon rasteriser, painter's sort.

  effect.js                — Classic variant (177 lines)
                             CPU software renderer at 320×200, palette lookup,
                             faithful 1:1 recreation of the 1993 original.

  effect.remastered.js     — Remastered variant (971 lines)
                             GPU polygon rendering at native resolution,
                             palette-ramp texture lighting, horizon glow,
                             terrain shadows, depth of field, dual-tier bloom.

src/core/
  webgl.js                 — Shared WebGL2 helpers
                             createProgram(), createFullscreenQuad(), etc.

src/effects/alku/
  data.js                  — ALKU landscape image and palette
                             LANDSCAPE_B64, LANDSCAPE_PAL, dimensions.
```

---

## Architecture

Both variants share the same U2 engine for animation. The classic renders
entirely on the CPU into a 320×200 indexed framebuffer. The remastered extracts
ship geometry into GPU vertex buffers at init time and uses the engine only to
advance transforms.

```
               engine.js
      (animation, transforms, FOV)
              /            \
             v              v
      effect.js        effect.remastered.js
   (CPU rasteriser)    (GPU polygon pipeline)
    320×200 VGA         native resolution
    palette colours     palette texture lookup
    painter's sort      hardware depth buffer
    no post-fx          bloom + DoF + shadows
```

The key architectural insight: because both variants call the same
`stepAnimation()` and `seekFrame()` functions, their choreography is
guaranteed to match perfectly. You can toggle between classic and remastered
in the editor and the ships follow identical paths.

---

## The 70 fps Binary Animation Stream

The entire camera path and all object transforms are stored in a packed binary
stream (originally the `.0AB` file), decoded one frame at a time at **70 fps**
— the VGA Mode 13h vertical refresh rate.

Each frame, the decoder reads a sequence of variable-length opcodes:

```
0xFF + byte ≤ 0x7F  →  Change field of view
0xFF + 0xFF         →  Animation end
0xC0 mask           →  Select object by number
0x80 / 0x40         →  Show / hide selected object
Translation deltas  →  1, 2, or 4 byte signed values
Rotation deltas     →  Delta-compressed 3×3 matrix entries
```

Camera is object 0; other objects divide coordinates by 128 for fixed-point
normalisation. The stream uses **delta compression** — each frame stores
changes from the previous frame, not absolute values. This is why seeking
backward requires replaying from frame 0 (or restoring a snapshot).

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

The remastered variant exports a `params` array describing 15 tunable knobs
across 5 groups (Atmosphere, Exhaust Glow, Shadows, Depth of Field,
Post-Processing) that the editor auto-generates UI controls for.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-mesh-data.md](01-mesh-data.md) | Binary data format: vertices, faces, normals, colours, animation stream |
| 2 | [02-painters-algorithm.md](02-painters-algorithm.md) | Depth sorting for correct render order, convex-hull scenes |
| 3 | [03-gouraud-shading.md](03-gouraud-shading.md) | Per-vertex colour interpolation across scanlines, flat vs Gouraud |
| 4 | [04-polygon-clipping.md](04-polygon-clipping.md) | Sutherland-Hodgman: clip polygons against frustum planes |
| 5 | [05-projection.md](05-projection.md) | 3D→2D perspective projection, viewport transform, fixed-point maths |
| 6 | [06-gpu-rendering.md](06-gpu-rendering.md) | Vertex buffers, GPU rasterisation, palette shading, bloom, DoF |
| 7 | [07-learning-path.md](07-learning-path.md) | Exercises: camera paths, wireframe overlays, lighting experiments |

Start with [Layer 1: Mesh Data](01-mesh-data.md).
