# Part 21 — JPLOGO ("Jellypic")

## Overview

The Future Crew logo scrolls in from below with decelerating speed,
then undergoes a bouncing "jelly" distortion: the logo is stretched/compressed
vertically with a sine-wave horizontal zoom applied per scanline.
Resolution is 320×400 (VGA double-scan), downsampled to 320×200.

**Duration:** 510.4 s – 517.8 s  
**Frame rate:** 70 fps (VGA Mode 13h timing)  
**Author:** PSI

## Data

- **LOGO_PAL_B64** — 256-entry VGA palette (768 bytes, 6-bit per channel).
- **LOGO_PIX_B64** — 186 × 400 indexed pixel data, pre-extracted from
  RLE-compressed ICEKNGDM.UP format, with pixel value tweaks
  (0 → 64, col 184 set to 65).

Both exported from `data.js`.

## Algorithm

### Phase 1: Vertical Scroll-In

Pre-computed deceleration curve:
- `scrollyspd` starts at 64, increments by 6 per frame.
- `scrolly` starts at 400, decreases by `scrollyspd/64` per frame until 0.
- Each source image row `y` is drawn at screen row `y - scrolly`.

Each row is `linezoom`'d at a fixed width of 184 pixels (slightly narrower than
the 186-pixel source), centred at x = 160.

### Phase 2: Jelly Bounce

200 frames of bounce parameters (`framey1`, `framey2`) are pre-computed,
then interpolated to 800 sub-frames (`framey1t`, `framey2t`) for smoother
animation (4× interpolation).

For each screen row `y`:
- If outside `[y1, y2)`, the row is cleared.
- Otherwise, the source row is `b = (y - y1) * 400 / (y2 - y1)`.
- A sine-based horizontal zoom is applied:
  `a = 184 + (sin1024[b*32/25] * xsc + 32) / 64`, where
  `xsc = (400 - (y2 - y1)) / 8` is the distortion amplitude.
- `linezoom` renders the source row at the computed width.

The bounce damps over time, eventually settling with `y1 = 0, y2 = 400*16`
(full image, no distortion).

### linezoom

Nearest-neighbour horizontal scaling of a 186-pixel source row to a given
target width, centred at x = 160. Increment = 186 / (lastx - firstx).

## Display

The 320×400 framebuffer is downsampled to 320×200 by taking every other line,
then palette-mapped to RGBA and uploaded as a GPU texture.

## Scrubbing

Both scroll positions and jelly parameters are pre-computed at init,
so any frame can be rendered in O(1).

## Remastered Ideas

- Full 4K resolution with smooth bilinear/bicubic row scaling.
- Shader-based jelly distortion using a UV warp with per-pixel sine.
- Add subtle CRT scanline overlay and phosphor glow.
- Bloom on the bright palette entries during the bounce.
- Anti-aliased row edges instead of nearest-neighbour zoom.
