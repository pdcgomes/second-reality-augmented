# Part 23 — ENDLOGO (End Logo Display)

## Overview

Displays the "Future Crew" end logo picture (320×400 VGA double-scan)
with a smooth fade-in from white, a hold period showing the full image,
and a fade-out to black.

**Duration:** 563.7 s – 572.0 s  
**Frame rate:** 70 fps  
**Author:** Unknown (END folder)

## Data

- **ENDLOGO_PAL_B64** — 256-entry VGA palette (768 bytes, 6-bit per
  channel), extracted from PIC.UH via `readp`.
- **ENDLOGO_PIX_B64** — 320 × 400 indexed pixel data, RLE-decoded.

## Algorithm

1. **Fade-in from white** (frames 0–127): For each palette entry,
   linearly interpolate from white (63,63,63) toward the true colour.
   `level = 1 - frame/128`.
2. **Hold** (frames 128–499): Display full image with unmodified palette.
3. **Fade-out to black** (frames 500–531): Scale all palette entries
   toward 0. `level = (frame - 500) / 32`.

The 320×400 image is displayed at 320×200 by sampling every other line
(standard VGA double-scan).

## Scrubbing

Fully stateless — each frame computes the fade level independently.

## Remastered Ideas

- 4K resolution with bilinear upscaling of the logo.
- Smooth per-pixel fade with variable timing per region (center first).
- Subtle CRT phosphor glow and scanline overlay.
- Bloom on bright areas during fade transitions.
