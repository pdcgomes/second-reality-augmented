# Part 10 — TECHNO_BARS: Rotating Layered Bars

**Time range:** 186.5s–217.0s (30.5s)  
**Original code:** TECHNO/KOE.C + KOEA.ASM by PSI  
**Frame rate:** 70 fps (VGA planar mode, 320×200, 16-color)

## Overview

Rotating bar patterns drawn using EGA/VGA bit-plane layering across 8 video pages. Each frame renders monochrome bar polygons, then merges them into one bit plane of one page. The page cycles every frame (0–7) and the active bit plane every 8 frames (0–3). When bars from different planes overlap, the resulting 4-bit index has more bits set, mapping to a brighter color through a popcount-based palette. This creates rich interference patterns as bars rotate.

## Architecture: Pages + Bit Planes

```
Frame  1: Draw bars → Page 0, Plane 0
Frame  2: Draw bars → Page 1, Plane 0
...
Frame  8: Draw bars → Page 7, Plane 0
Frame  9: Draw bars → Page 0, Plane 1  (Page 0 now has planes 0+1)
Frame 10: Draw bars → Page 1, Plane 1
...
Frame 32: Draw bars → Page 7, Plane 3  (all pages have all 4 planes filled)
Frame 33: Draw bars → Page 0, Plane 0  (overwrites frame 1's plane 0 content)
```

Each page accumulates content across 4 planes over 32 frames. The displayed page is the one just written to, showing the composite of all 4 planes.

## Bar Rendering

Each frame draws 11 rotated rectangular bars (`c = -10, -8, ..., 8, 10`) as filled quadrilaterals:

```
hx = sin1024[rot] × 16 × 6/5     (horizontal extent)
hy = sin1024[rot+256] × 16        (vertical extent)
vx = sin1024[rot+256] × 6/5 × vm  (perpendicular spacing)
vy = sin1024[rot+512] × vm

For each bar c:
  center offset: (vx×c×2, vy×c×2)
  corners: (±hx ± vx + cx, ±hy ± vy + cy) / 16 + screen center
```

The bars are rendered with value 1 into a monochrome buffer, then merged into the target page's bit plane using bitwise OR (set) / AND NOT (clear).

## Three Phases

### Phase 1: doit1 (frames 0–419, ~6s)
- Fixed rotation speed: `rot += 2` per frame
- Bar spacing (`vm`) starts at 50, oscillates via `vma` with rebound at `vm < 25`
- `vma` decreases by 1 each frame (gravity-like deceleration)

### Phase 2: doit2 (frames 420–1259, ~12s)
- Accelerating rotation: `rot += rota/10`, `rota` increases each frame
- Bar spacing starts large (`vm = 6400`) and collapses
- Pages cleared at phase transition

### Phase 3: doit3 (frames 1260–2239, ~14s)
- Same accelerating rotation as doit2
- Center point wobbles in a spiral: small at first (`rot2 < 32`), then fixed amplitude
- `rot2` advances by 17 per frame (fast orbit)
- Last 333 frames: bars scroll off-screen to the right (`xpos` accelerates from 0 to 320)

## Palette

16 entries based on popcount of the 4-bit index:

| Popcount | R (6-bit) | G (6-bit) | B (6-bit) | Meaning |
|----------|-----------|-----------|-----------|---------|
| 0 | 0 | 0 | 0 | No bars |
| 1 | 21 | 19 | 25 | Single bar |
| 2 | 29 | 25 | 33 | Two bars overlap |
| 3 | 38 | 35 | 42 | Three bars overlap |
| 4 | 47 | 44 | 51 | Four bars overlap |

These base values are modulated by a "brightness" factor (0–15) for beat pulsing. On each music beat (every 8th row), `curpal` jumps to 15 and decays by 1 per frame, cycling through 16 pre-computed palette variations from bright to dim.

## Scrubbing

State requires replay of the last 32 frames (one full page cycle) to reconstruct all bit planes. Phase state variables (rot, vm, vma, rota, rot2, xpos, xposa) are replayed from the phase start.

## Remastered Ideas

- **Higher resolution**: Render at native display resolution instead of 320×200
- **Smooth blending**: Replace 4-bit popcount palette with actual alpha-blended layers
- **Glow/bloom**: Add post-process glow on bright overlapping regions
- **3D depth**: Give each plane layer a slight Z offset for parallax
- **Color themes**: Cycle through different color palettes (warm, cool, neon)
- **Particle trails**: Bars leave particle trails as they rotate
- **Beat reactivity**: Rotation speed and bar width respond to music amplitude
