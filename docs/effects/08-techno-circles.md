# Part 8 — TECHNO_CIRCLES: Circle Interference Moiré

**Time range:** 168.1s–185.8s (17.7s)  
**Original code:** TECHNO/KOE*.ASM by PSI  
**Frame rate:** 70 fps (VGA Mode 13h, 16-color EGA planes)

## Overview

A two-phase circle interference effect that exploits EGA/VGA bit-plane OR combinations to create moiré patterns. Two pre-computed concentric circle images (stored as quarter-circles, mirrored at runtime) are overlaid using bitwise OR, with per-scanline sinusoidal distortion that intensifies over time.

## Data

### Circle 1 (24,000 bytes)
- 320×200 quarter-circle, 3 EGA bit planes (8 colors per pixel)
- Each row: 3 planes × 40 bytes = 120 bytes per line
- Represents concentric rings with varying widths/colors (values 0–7)
- Mirrored to 640×400 full circle at init time

### Circle 2 (8,000 bytes)
- 320×200 quarter-circle, 1 EGA bit plane (plane 3)
- Each row: 1 plane × 40 bytes = 40 bytes per line
- Binary circle mask — pixel values are 0 or 8
- Mirrored to 640×400 full circle at init time

When OR'd: `circle1 | circle2` produces values 0–15, mapping to a 16-color palette.

## Phase 1: KOEB (Frames 0–255)

A single circle (circle1) centered on screen. The visual interest comes from palette animation:

1. **Fade in**: `palfader` goes from 0→512 over 256 frames (first half: fade from black; second half: overbright)
2. **Palette rotation**: The 8-entry `pal0` palette (only entry 0 = cyan-blue, rest black) is cycled via `shft = frame % 8`. Each frame, a different color index becomes the bright one, making different concentric rings flash sequentially.

This creates a pulsing, breathing concentric circle pattern that fades in from black.

## Phase 2: KOEA (Frames 256+)

Two circles overlaid with interference:

### Circle Positions
Both circles follow independent sinusoidal orbits:
- **Circle 1**: `scrnrot` advances +5/frame (mod 1024), position = 160 + sin1024[scrnrot]/4
- **Circle 2**: `overrot` advances +7/frame from 211 (mod 1024), position = 160 + sin1024[overrot]/4
- Y positions use cos (quarter-phase offset)

### Per-Scanline Distortion
Circle 2 gets an additional per-scanline horizontal offset:
```
sinroty = (sinurot + 9 × y) % 1024
siny = floor(sin1024[sinroty] / 8) as unsigned byte
powr = power0[sinuspower × 256 + siny]
```
- `sinurot` advances +7/frame, creating a rotating wave pattern
- `sinuspower` starts at 0 and increases after frame 606 (256+350), reaching max 15, controlling distortion amplitude via the `power0` lookup table

### Palette
- Entries 0–7: `pal1` (warm gray-white gradient, shifted by `palanimc`)
- Entries 8–15: `pal2` (similar but 7/9 green ratio, shifted by `palanimc`)
- `palanimc` cycles 0–7 each frame for smooth color rotation

### Rendering
```
framebuffer[y×320+x] = circle1[(y+scrny)×640 + x+scrnx]
                      | circle2[(y+overy)×640 + x+overx+powr]
```
The OR combination of the two moving, distorted circle images creates rich moiré interference patterns.

## Lookup Tables

| Table | Size | Purpose |
|-------|------|---------|
| `sin1024` | 1024 × int32 | sin(2πx/1024) × 255, for circle position modulation |
| `power0` | 16 × 256 × int32 | floor(c × b/15), scaling signed byte c by factor b (0–15) |

## Scrubbing

All state is derivable from the frame number:
- `shft` = frame % 8
- `overrot` = (211 + 7 × N) % 1024
- `scrnrot` = (5 × N) % 1024
- `sinurot` = (7 × (N+1)) % 1024
- `sinuspower` = clamp((N-350)/16, 1, 15) for N > 350
- `palanimc` = (7 + N) % 8

O(1) random access — no state replay needed.

## Remastered Ideas

- **Higher resolution circles**: AI-upscale the quarter-circle images to 4K, or re-generate procedurally at high resolution
- **Smooth color gradients**: Replace the 16-color palette with continuous RGB interpolation
- **Real-time interference**: Compute the moiré analytically in a fragment shader for infinite resolution
- **3D depth**: Add subtle parallax or depth-of-field to the interference layers
- **Beat sync**: Pulse distortion amplitude with the music beat
- **Color themes**: Shift palette hues dynamically through warmer/cooler tones
