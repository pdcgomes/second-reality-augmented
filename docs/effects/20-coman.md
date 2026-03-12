# Part 20 — COMAN: Voxel Landscape

**Time range:** 438.8s–510.4s (71.6s)  
**Original code:** COMAN folder by PSI  
**Frame rate:** 35 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

"3D-Sinusfield" — VoxelSpace-style raymarched terrain using two 256×128 height maps. The camera flies over a procedural sine-wave landscape with smooth rotation. Each of the 160 screen columns (pixel-doubled to 320) is raymarched from bottom to top. Terrain rises from below at the start and scrolls down at the end.

## Height Maps

Two 256×128 signed 16-bit arrays (W1DTA, W2DTA) are summed to produce the terrain height at each point. A z-wave offset (`16 × sin(j × 2π × 3 / 192)`) adds undulation along the ray depth. Final height: `wave1[xw] + wave2[yw] + zwave[j] - 240`.

## Raymarching

Per column, rays march forward through terrain:
1. Start at screen bottom, march upward
2. At each step, compare ray height with terrain height
3. If terrain is higher: draw pixels upward until ray catches up
4. Color index: `((terrainH + 140 - j/8) & 0xFF) >> 1`
5. After 64 iterations (bailhalve), step size doubles for distant terrain

## Camera Path

Pre-computed for 4444 frames:
```
rot2 += 4
rot += trunc(256 × sin(rot2/1024 × 2π) / 15)
r = rot >> 3
rsin = 256 × sin(r/1024 × 2π)
rcos = 256 × sin((r+256)/1024 × 2π)
```

Camera position advances each frame based on the center column's displacement vector.

## Palette

- Indices 0–239: Procedural blue-green terrain gradient with sine-modulated variation
- Indices 232–255: Red tones for highlights
- Black background (index 0)

## Scrubbing

Camera position (xwav, ywav) requires replay from frame 0 due to cumulative advancement. Terrain rendering is O(1) given camera state.

## Remastered Ideas

- **Higher resolution**: Render at display resolution instead of 160-column doubled
- **Smooth terrain**: Bilinear height interpolation for smoother landscapes
- **Atmospheric fog**: Distance-based fog blending
- **Texture mapping**: Apply textures to the voxel terrain surface
- **Dynamic lighting**: Sun direction with shadows
- **Water plane**: Reflective water at low elevations
