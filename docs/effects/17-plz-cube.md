# Part 17 — PLZ_CUBE: Plasma-Textured Cube

**Time range:** 343.9s–372.5s (28.6s)  
**Original code:** PLZ/VECT.C + PLZFILL.C + PLZA.ASM by WILDFIRE  
**Frame rate:** 70 fps (VGA 320×134, scanlines tripled to 400)

## Overview

A 3D rotating cube textured with animated plasma patterns. Each face uses one of three color themes (blue-white, red-yellow, purple-green), lit by a per-face diffuse light source on an orbiting path. Camera motion follows spline-interpolated control points for smooth animation. The effect renders at 320×134 (VGA tripled scanline mode).

## 3D Pipeline

1. **Spline interpolation**: Camera path (tx, ty, dis, kx, ky, kz, ls_kx, ls_ky) from 46 control points using B-spline coefficients
2. **Rotation matrix**: Standard Euler rotation from angles (kx, ky, kz)
3. **Vertex transform**: Rotation + translation, then perspective projection to screen (center 160, 66)
4. **Backface culling**: Faces with nz < 0 (normal Z facing away) are skipped
5. **Per-face lighting**: `s = (lx·nx + ly·ny + lz·nz) / 250000 + 32`, clamped to 0–64

## Procedural Textures

Three 256×64 textures generated from nested sine waves:
```
kuva[c][y][x] = floor(sini[(y×4 + sini[x×2]) & 511] / 4 + 32 + c×64)
```
Where `sini[a] = sin(a/1024 × 4π) × 127`. This creates organic plasma patterns.

### Texture Distortion

Per-scanline horizontal sine displacement adds animated wobble:
```
dist1[y] = floor(sini[y×8] / 3)
distorted_u = (u + dist1[dd + v]) & 255
```
The `dd` parameter (frame & 63) advances the distortion each frame.

## Palette Structure

```
Indices   0– 63: Color theme 0 — blue (0→63) then blue-white (63→63)
Indices  64–127: Color theme 1 — red (0→63) then red-yellow (63→63)
Indices 128–191: Color theme 2 — purple-green gradient
```

Each theme is shaded per-face: `fpal[i] = basePal[i] × light / 64`.

## Polygon Filling

Textured quads filled with linear UV interpolation (not perspective-corrected). Scanline-based: two edges tracked from the top vertex, advancing their positions and texture coordinates with pre-computed slopes. Horizontal segments skip texture for zero-height edges.

## Remastered Ideas

- **Perspective-correct texturing**: Fix the slight UV warping visible on large faces
- **Higher resolution**: Render at display resolution instead of 320×134
- **Environment mapping**: Add reflection mapping for a metallic look
- **Specular highlights**: Per-pixel Phong shading
- **Animated textures**: Plasma texture evolves over time independently
- **Particle explosion**: Cube shatters into textured particles
