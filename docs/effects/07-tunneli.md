# Part 7 — TUNNELI (Dottitunneli): Dot Tunnel

**Time range:** 150.7s–168.1s (17.4s)  
**Original code:** TUNNELI/ folder (Turbo Pascal by TRUG)  
**Frame rate:** 70 fps (VGA Mode 13h)

## Overview

A tunnel effect built entirely from concentric ellipses of discrete dots. Each ring consists of 64 pixels placed on an ellipse (1.7× wider than tall to approximate the 4:3 aspect ratio). Rings are layered back-to-front with decreasing radius to create the illusion of a receding tunnel. The tunnel path follows sinusoidal curves whose amplitude grows with time, producing an accelerating spiral motion.

## Data Structures

### Circle Templates (`pcalc`)
138 pre-computed rings of 64 dots each, covering radii from 10 (farthest) to 147 (nearest). Each dot is stored as an absolute screen coordinate:
```
x = 160 + trunc(sin(a × π/32) × 1.7 × radius)
y = 100 + trunc(cos(a × π/32) × radius)
```

### Position Tables (`sinit`, `cosit`)
Sinusoidal lookup tables with growing amplitude:
- `sinit[x]` = sin(πx/128) × (3x/128) — 4096 entries
- `cosit[x]` = cos(πx/128) × (4x/64) — 2048 entries

The key trick: amplitude scales linearly with the index. Since each frame advances the index, later frames have larger position offsets, creating the accelerating spiral.

### Circle List (`putki`)
100 active circles. Each frame, a new circle is added at the back and the oldest is discarded (shift buffer). Each circle stores:
- `x, y`: position offset (from sinit/cosit at birth frame)
- `c`: base color (64=bright, 128=dark, 0=invisible)

### Depth Radius (`sade`)
```
sade[z] = trunc(16384 / (z×7 + 95))
```
Maps circle index (0=near, 80=far) to a pcalc template index. Far circles get small radii, near circles get large radii — perspective foreshortening.

## Rendering Pipeline

1. **Clear** framebuffer to black
2. **Compute reference point**: Circle at index 5 acts as the viewport anchor — all positions are relative to it, creating smooth camera tracking
3. **For each circle** (back-to-front, index 80→4):
   - Compute birth frame and position from sinit/cosit
   - Determine color: bright (64) or dark (128), alternating every 8 frames
   - Look up radius template from `sade[x]` → `pcalc[radius]`
   - Plot 64 dots at (template + circle offset - reference offset)
   - Bounds-check each dot (clip to 320×200)
4. **Convert** indexed framebuffer to RGBA via palette
5. **Upload** to WebGL texture, draw fullscreen quad

## Palette

| Index Range | Description |
|------------|-------------|
| 0 | Black (background) |
| 64–128 | Bright: linear white→black gradient |
| 128–192 | Dark: 3/4-bright white→black gradient |
| 68, 132 | Black (holes in gradient for flicker effect) |
| 255 | Green (unused in practice) |

Each circle's actual color is `baseColor + trunc(circleIndex / 1.3)`. Far circles (high index) get a higher offset → darker. Near circles (low index) → brighter. This produces natural depth-based fade.

The black holes at indices 68 and 132 cause specific depth-positions to momentarily vanish, creating a subtle strobing effect.

## Animation Timeline

| Frames | Duration | Phase |
|--------|----------|-------|
| 0–957 | 13.7s | Normal tunnel with alternating bright/dark circles |
| 958–1052 | 1.3s | New circles are invisible (c=0), visible ones scroll out |
| 1053–1060 | 0.1s | All circles gone, screen black |

## Scrubbing

All state is derivable from the frame number (no cumulative state). Circle at index `x` was born at frame `F - 99 + x`, and its position is computed directly from the sinit/cosit tables at birth time. This enables O(1) random access — no state replay needed.

## Remastered Ideas

- **Higher dot density**: Use 256 or 512 dots per ring for smoother circles
- **Sub-pixel rendering**: Anti-aliased dots or small Gaussian splats instead of single pixels
- **Color gradient**: Rainbow or plasma palette cycling instead of monochrome white
- **Glow/bloom**: Post-process bloom on the bright dots for a neon tunnel look
- **Depth fog**: Smooth alpha fade for distant circles instead of palette-based
- **Beat sync**: Pulse ring radius or brightness with the music beat
- **Particle trails**: Motion blur on dots as they move between frames
- **Higher resolution**: Native 1080p/4K with proportionally scaled dot placement
