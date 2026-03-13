# Part 9 — TECHNO_BARS_TRANSITION: Synced Bars Wipe

**Time range:** 185.8s–188.3s (~2.5s)  
**Original code:** TECHNO/KOE*.C by PSI  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 16-color indexed)

## Overview

A brief transition that bridges the circle interference effect (Part 8) into the techno bars section (Part 10). The screen flashes white, hiding a palette swap to 16 shades of blue. Four 80-pixel-wide vertical bars then clear from top to bottom with accelerating speed, each triggered by a beat-synced flash pulse. A final flash ends the transition.

## Palette

16 shades of blue in 6-bit VGA (0–63):

| Index | R | G | B |
|-------|---|---|---|
| 0 | 0 | 0 | 0 |
| 1 | 3 | 3.5 | 4 |
| ... | ... | ... | ... |
| 15 | 45 | 52.5 | 60 |

Formula: `r = i×3`, `g = i×3.5`, `b = i×4`

Index 0 = black, index 15 = brightest blue (≈ RGB 182, 212, 243 in 8-bit).

## Flash Function

The flash mixes the current "saved palette" with pure white:

```
j = 256 - flashLevel
color[i] = (savedPal[i] × j + 63 × flashLevel) >> 8
```

- `flashLevel = 0` → saved palette (no flash)
- `flashLevel = 256` → pure white (63,63,63 in VGA)

## Sequence

### Phase 1: Initial Flash (frames 0–3)

Flash level ramps 0 → 256 over 4 frames (~57ms). The screen goes from whatever the previous effect showed to full white. When the flash peaks, the framebuffer is secretly filled with index 15 (brightest blue) and the palette is swapped to the blue shades.

### Phase 2: Bar Clearing (TECHNO_BAR1–4 sync points)

Each bar starts at a music-synced moment (TECHNO_BAR1 through TECHNO_BAR4), spaced 8 S3M rows apart (~461ms at 130 BPM, speed 3). When a bar's sync point fires:

1. Flash resets to 256 (white) and fades over 8 frames
2. The bar begins clearing from top to bottom using the `BarClear[]` table

The 4 bars are each 80 pixels wide (bars 0–3 cover x=0–79, 80–159, 160–239, 240–319).

### Bar Clearing Acceleration

The `BarClear[]` table gives the number of lines cleared per frame, using cumulative acceleration:

```
frame 0: 1 line     frame 5:  21 lines    frame 10: 66 lines
frame 1: 3 lines    frame 6:  28 lines    frame 15: 136 lines
frame 2: 6 lines    frame 7:  36 lines    frame 19: 199 lines (clamped)
frame 3: 10 lines   frame 8:  45 lines
frame 4: 15 lines   frame 9:  55 lines
```

Formula: `zy += ++zya` each frame (triangular numbers), clamped to 199.

Each bar takes 20 frames (~286ms) to fully clear. Bars overlap in time — bar 1 starts before bar 0 finishes.

### Phase 3: Final Flash (TECHNO_BAR_FINAL_FLASH sync point)

Flash ramps up over 4 frames at the TECHNO_BAR_FINAL_FLASH sync point (~2.5s into the transition), ending in white before Part 10 (TECHNO_BARS) takes over.

## Scrubbing

All state is derivable from the frame number:
- Framebuffer: fill with 15, then for each active bar compute `min(barFrame, 19)` to index `BarClear[]`
- Flash level: determined by frame's position relative to sync point thresholds

O(1) random access — no state replay needed.

## Remastered Ideas

- **Resolution-independent bars**: Render at any resolution with proportional 4-column layout
- **Smooth flash**: Anti-aliased white flash with bloom/glow instead of hard palette mixing
- **Particle dissolve**: Bars dissolve into particles instead of simple top-down wipe
- **Beat reactivity**: Tie bar clearing speed to actual beat intensity
- **Color variation**: Gradient bars or per-bar color instead of uniform blue
- **Transition blur**: Motion blur on the clearing edge for a more cinematic feel
