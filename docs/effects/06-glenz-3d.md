# Part 6 — GLENZ_3D: Translucent Polyhedra

**Time range:** 121.8s–150.7s (28.9s)  
**Sync points:** `GLENZ_START` → (transition to TUNNELI)  
**Original code:** GLENZ/MAIN.C by PSI  
**Frame rate:** 70 fps (VGA Mode 13h)

## Overview

Two translucent rotating Tetrakis hexahedra (a classic "Glenz vector" effect) rendered via software polygon rasterization. The effect is iconic for its stained-glass transparency, achieved through a clever trick: polygon pixels are written to the framebuffer using bitwise OR, and the VGA palette is carefully constructed so that any OR combination of a face's color index and a background color index maps to the correct mixed color.

## Shape: Tetrakis Hexahedron

Both objects use the same topology: a cube with a pyramid erected on each face. This produces:
- **14 vertices**: 8 cube corners + 6 face center protrusions at ±170 (Glenz1) or ±105 (Glenz2) on each axis
- **24 triangular faces**: 4 per cube face (one triangle from each face-center vertex to each edge of the cube face)

Glenz1 vertices are scaled by 50, Glenz2 by 99 (different source scale, actual display size controlled by runtime scale factors).

## Transparency Trick (OR-Indexed Blending)

The key innovation is palette-based transparency without alpha blending:

### Color index layout
- **Indices 0–7**: Background (checkerboard, then red Glenz2 mixing colors)
- **Indices 8–199**: Glenz1 front face shading. Each face gets 8 consecutive indices (faceIndex × 8 + 0..7) to cover all possible OR combinations with the 3-bit background

### How it works
1. Background pixels use color indices with only the low 3 bits set (0–7)
2. Glenz1 front faces write `faceIndex × 8` (bits 3+) using OR
3. The OR combination `(faceIndex × 8) | bgPixel` automatically indexes into a palette entry pre-computed to show the correct mix of the face's shading color and the background color
4. Glenz1 back faces either write color 4 (blue) or nothing (white = transparent)
5. Glenz2 uses the same technique in the 0–7 range, mixing with Glenz1's palette

This means no per-pixel blending math is needed — the VGA palette handles all the color mixing.

## Animation Timeline

| Frames | Duration | Phase |
|--------|----------|-------|
| 0–709 | 10.1s | Glenz1 bounces on checkerboard. Jelly deformation on impact. |
| 700–765 | 0.9s | Checkerboard palette fades to black |
| 710–799 | 1.3s | Glenz1 moves to center (y=-2800) |
| 790 | — | Palette reconfigured for Glenz2 mixing (red tones replace checkerboard) |
| 800–890 | 1.3s | Glenz2 scales in from 0 to 180 |
| 900–1800 | 12.9s | Both objects orbit with sinusoidal translation |
| 1800+ | 5.2s | Glenz1 exits upward, translations amplify |
| 2009+ | 2.2s | Both objects shrink (scale decreases by 1/frame) |
| 2069–2133 | 0.9s | Final fade to black (palette × fadeLevel/64) |

### Bounce physics
```
yposa += 31            (upward acceleration)
ypos += yposa / 40     (integrate)
if ypos > -300:        (floor)
  ypos -= yposa/40     (undo)
  yposa = -yposa * boingm/boingd  (bounce with increasing damping)
  boingm += 2; boingd++
```

### Jelly deformation
On each bounce impact: `jello = (ypos + 900) * 5/3`. The jello value oscillates (spring-damper) and modulates X/Y scale (stretch) vs Z scale (squeeze):
```
scaleX = scaleY = 120 + jello/30
scaleZ = 120 - jello/30
```

## 3D Pipeline

1. **Rotation**: Y×X×Z matrix from frame-derived angles: `rx = 32 × frame`, `ry = 7 × frame` (in 1/10-degree units). Glenz2 rotates at 1/3 speed in the opposite direction.
2. **Scale**: Diagonal matrix for jelly effect (Glenz1) or uniform scale (Glenz2)
3. **Translation**: Offset by ypos (bounce), plus sinusoidal orbits
4. **Vertical clip**: During bounce phase, Glenz1 vertices are clamped to y≤1500 to prevent clipping below the checkerboard surface
5. **Projection**: `screenX = worldX × 256 / worldZ + 160`, `screenY = worldY × 213 / worldZ + 130`
6. **Face culling + shading**: Cross-product Z of first 3 projected vertices → normal. Front faces get per-face shading; back faces are either transparent or solid color 4.
7. **Clipping**: Sutherland-Hodgman against screen top (Glenz1) and top+left (Glenz2)
8. **Rasterization**: Convex polygon scanline fill with OR write mode

## Data Dependencies

- **Checkerboard image** (from Part 5): Used as background in the first phase. Only the settled-state face is rendered (no front edge).
- **Tetrakis hexahedron geometry**: Hardcoded vertex/face tables (14 vertices, 24 faces per object)
- No external data files needed

## Scrubbing

Full scrubbing is supported by replaying the animation state from frame 0. The state machine involves ~20 operations per frame with a maximum of ~2200 frames, which completes in well under 1ms.

## Remastered Ideas

- **True alpha blending**: Replace the OR-indexed trick with proper per-pixel alpha blending for smoother transparency gradients
- **Higher polygon count**: Replace the Tetrakis hexahedron with a more detailed geodesic polyhedron or smooth sphere with Fresnel transparency
- **Reflections**: Add real-time environment mapping on the glass surfaces
- **Specular highlights**: Point light with Phong/Blinn specular for glassier appearance
- **Motion blur**: Temporal accumulation during fast rotation phases
- **Particle effects**: Glass shards or sparkles on each bounce impact
- **Post-processing**: Bloom/glow on the bright edges, chromatic aberration on the glass
- **Checkerboard**: AI-upscaled 4K background with depth-of-field blur
