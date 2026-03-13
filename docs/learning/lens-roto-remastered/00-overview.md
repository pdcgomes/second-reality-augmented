# Lens Roto Remastered — Overview

**Effect:** Part 15 of the Second Reality demo (1993, Future Crew)
**What you see:** An image of the KOE demon face rotating and zooming simultaneously — the classic "rotozoom" demoscene effect, enhanced with lens material, eye glow, and bloom
**Duration:** 29.3 seconds (276.9 s – 306.2 s in the full demo timeline)

---

## What This Guide Covers

This guide unpacks the remastered LENS_ROTO effect layer by layer. By the end you
will understand:

- How a 2D rotation matrix and a scale factor combine into a **rotozoom** — one of the most iconic demoscene techniques
- Why only 4 multiplies per pixel produce simultaneous rotation and zoom
- How the GPU replaces a CPU per-pixel loop with a single texture lookup
- How a 256×256 indexed image becomes a seamless wrapping texture
- How pre-computed animation arrays drive the rotation, zoom, and offset curves
- How a virtual hemisphere creates specular highlights and Fresnel rim glow
- How dual-tier bloom and beat reactivity produce the final cinematic frame

Each layer builds on the last. You can stop at any point and still have learned
something valuable.

---

## File Map

The effect lives in two source files, a shared data module, and WebGL helpers:

```
src/effects/rotozoom/
  effect.js               — Classic variant (198 lines)
                            CPU per-pixel rotozoom at 160×100,
                            pixel-doubled to 320×200, VGA palette.
                            Faithful 1:1 recreation of the 1993 original.

  effect.remastered.js    — Remastered variant (666 lines)
                            GPU rotozoom at native resolution,
                            lens material, eye glow, nebula background,
                            bloom, beat reactivity, 17 parameters.

src/effects/lens/
  data.js                 — Shared image data (base64-encoded)
                            LENS_PAL_B64: 256-entry VGA palette (768 bytes)
                            LENS_PIX_B64: 320×200 indexed pixels (64 KB)

src/core/
  webgl.js                — Shared WebGL2 helpers (91 lines)
                            createProgram(), createFullscreenQuad(),
                            FULLSCREEN_VERT shader.
```

---

## Architecture

Both variants share the same image data and the same animation physics. The
classic renders on the CPU at 160×100. The remastered computes the same UV
transform on the GPU and adds material and post-processing layers.

```
             lens/data.js
        (KOE picture + VGA palette)
              /           \
             v             v
      effect.js      effect.remastered.js
   (CPU per-pixel)   (GPU fragment shader)
    160×100 → 320×200   native resolution
    nearest-neighbor     bilinear filtering
    palette + fade       lens + glow + bloom
```

The key architectural insight: both variants pre-compute animation arrays
(`animD1`, `animD2`, `animScale`, `animFade`) with identical physics. The
rotozoom choreography matches frame-for-frame. You can toggle between classic
and remastered in the editor and the rotation/zoom path is identical.

---

## Architecture Comparison: Classic vs Remastered

### Classic: CPU Affine Transform

For each of the 160×100 output pixels, the CPU walks through texture space
using two **displacement vectors** (pixel-step and line-step). Each pixel
requires integer addition and a bitmask wrap:

```
for each scanline y:
    u += lineStepU; v += lineStepV
    for each pixel x:
        u += pixelStepU; v += pixelStepV
        output[y][x] = texture[ (v & 0xFF) << 8 | (u & 0xFF) ]
```

Total work: 160 × 100 = 16,000 integer adds + lookups per frame.

### Remastered: GPU Texture Sampling

The CPU computes a single **affine UV transform** per frame (one base point +
two span vectors). The GPU applies this transform to every fragment in parallel:

```glsl
vec2 texCoord = uBase + vUV.x * uSpanX + fy * uSpanY;
vec3 img = texture(uTex, texCoord / 256.0).rgb;
```

Total CPU work: ~10 multiplies per frame (constant regardless of resolution).
The GPU handles millions of pixels in parallel with hardware bilinear filtering.

---

## The Effect Interface

Every effect in this project exports three methods:

```javascript
export default {
  init(gl) { },             // called once — set up shaders, textures
  render(gl, t, beat, params) { },  // called every frame
  destroy(gl) { },          // called when the effect is unloaded
}
```

Where:
- `gl` — a WebGL2 rendering context
- `t` — seconds elapsed since this clip started (not global time)
- `beat` — 0.0 to 1.0 position within the current musical bar
- `params` — key-value object of tunable parameters from the editor

The remastered variant also exports a `params` array describing 17 tunable
knobs (hue, specular, bloom, eye glow, etc.) that the editor auto-generates
UI controls for.

---

## Layers

| # | File | What You Will Learn |
|---|------|---------------------|
| 1 | [01-affine-transform.md](01-affine-transform.md) | The rotozoom formula: rotation matrix, scale, affine UV mapping |
| 2 | [02-texture-sampling.md](02-texture-sampling.md) | Texture wrapping, bilinear filtering, indexed-to-RGBA conversion |
| 3 | [03-animation-curves.md](03-animation-curves.md) | How rotation, zoom, and offset evolve over time via scripted physics |
| 4 | [04-palette-and-postfx.md](04-palette-and-postfx.md) | White fade, lens material, eye glow, bloom pipeline, beat reactivity |
| 5 | [05-learning-path.md](05-learning-path.md) | Hands-on exercises to experiment with the code |

Start with [Layer 1: The Rotozoom Formula](01-affine-transform.md).
