# Part 24 — CREDITS (Scrolling Credits)

## Overview

21-screen credits sequence where each screen shows a small 160×100
picture (doubled to 200 lines) sliding in from the right, and text
lines sliding up from below, then all sliding out.

**Duration:** 572.0 s – 679.9 s  
**Frame rate:** 70 fps  
**Author:** WILDFIRE

## Data

- **PIC01..PIC18 + PIC05B/PIC10B/PIC14B** — 21 picture files, each
  containing a 768-byte palette and 160×100 indexed pixels at offset
  16+768. Palette entries are shifted up by 16 to make room for font
  colour gradient (indices 0–9).
- **fona_credits_base64** — 1500×32 font bitmap containing all
  characters in the order
  `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/?!:,."()+-`.

## Algorithm

### Position Pre-computation

Three phases per screen, all pre-computed into a `positions[]` array:

1. **Slide-in** — `textY` decelerates from 200 toward 0; `picX`
   from ~322 toward ~80, using exponential decay
   (`y = floor(y * 12/13)` each step).
2. **Hold** — 200 frames at final position.
3. **Slide-out** — `textY` accelerates upward; `picX` moves left
   via quadratic ramp (`v += 15` each step).

### Per-Screen Rendering

1. Clear 320×400 framebuffer.
2. Blit 160×100 picture at `picX` with Y-doubling (row n → rows 2n, 2n+1).
   Pixel indices offset by +16 to avoid font palette.
3. Print each credit text line centred at x=160, starting at
   `y = 160 + 60 + textY`, with 42-pixel vertical spacing.
4. Set the per-screen palette (shifted with font gradient).

### Font Rendering

Variable-width font: character boundaries detected by scanning for
non-zero columns in the 1500-wide font bitmap. Characters drawn
column-by-column with Y-clipping into the 320×400 framebuffer.

## Display

320×400 downsampled to 320×200 (every other line), palette-mapped to
RGBA, uploaded as a GPU texture.

## Scrubbing

Fully stateless: screen index = `frame / posLen`, position looked up
from pre-computed array.

## Remastered Ideas

- High-res font with anti-aliasing and subtle drop shadows.
- Smooth bilinear picture upscaling.
- Parallax scrolling between picture and text layers.
- Per-character letter animation (typewriter effect).
- Particle effects around the text.
