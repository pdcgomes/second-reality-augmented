# Part 25 — ENDSCRL: Sine-Wave Greetings

**Time range:** 626.0s–710.0s (84.0s)  
**Original code:** ENDSCRL/ folder  
**Frame rate:** 35 fps (640×400)

## Overview

Final greetings text scroller at 640×400 resolution. Text scrolls vertically upward at one pixel per frame. Lines are centered horizontally. The font is a variable-width bitmap (25px tall, ~80 characters including lowercase).

## Data

| File | Content |
|------|---------|
| endscrl_font | 1550×25 bitmap font atlas |
| text | ~6 KB greetings text (newline-delimited) |

## Special Markers

- `[XX]` at start of line: sets custom line height to XX pixels
- `%` at start of line: signals end of scroller

## Palette

16 colors: black (0–1), dark gray (2), light gray to white (3–15).

## Rendering

Each frame:
1. Scroll the entire 640×400 framebuffer up by 1 pixel
2. Render the current scan line of the current text line into the bottom row
3. Advance line counter; when line height reached, move to next text line

## Scrubbing

Cumulative — requires replay from frame 0. Each frame advances the scroll by 1 pixel.

## Remastered Ideas

- **Smooth scrolling**: Sub-pixel scrolling with interpolation
- **Typography**: Higher-resolution anti-aliased font
- **Sine wave**: Add horizontal sine distortion per line
- **Particle effects**: Letters dissolve or assemble from particles
- **Beat sync**: Scroll speed modulated by music
