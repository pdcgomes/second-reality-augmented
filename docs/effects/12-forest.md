# Part 12 — FOREST: Mountain Text Scroller

**Time range:** 231.3s–260.2s (28.9s)  
**Original code:** FOREST/MAIN2.PAS + ROUTINES.ASM by TRUG  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

"Vuori-Scrolli" (Mountain Scroller) — the text "ANOTHER WAY TO SCROLL" is mapped onto a mountain/hill landscape background using pre-computed position lookup tables. As the text scrolls, each character pixel is placed at screen coordinates that follow the contours of the hills, creating the illusion of text painted onto the terrain.

## Data Files

| File | Size | Content |
|------|------|---------|
| O2SCI | 21 KB | Text picture: 640×30 indexed pixels (RLE compressed) |
| HILLBACK | 65 KB | Background: 320×200 pixels + 256-entry palette |
| POS1/POS2/POS3 | ~25 KB each | Position lookup tables for 3 interlaced passes |

## Rendering

### Position Mapping

Three POS tables (one per interlaced pass) store the mapping from font pixels to screen positions. For each of the 237×31 font pixels:

1. Read `count` (16-bit): number of screen destinations for this font pixel
2. If count > 0, read `count` destination addresses (16-bit each)
3. At each destination: `screenPixel = background[dest] + font[fontIdx]`

The additive blending with palette values 128+ for text creates a two-layer effect: the mountain background shows through with the text overlaid in brighter colors.

### Three-Pass Interlacing

Each frame updates only 1/3 of the rows via one POS table (sss cycles 0→1→2). The scroll advances one column after all 3 passes complete. This means the scroller progresses once every 3 frames at 70fps (~23.3 columns/second).

### Font Sliding Window

A 237×30 window slides through the 640×30 source text image. Starting at column 133 (partially pre-filled), the window advances one column per scroll step. The visible portion of the font determines which text characters appear on the mountains.

## Palette Animation

Three phases:
1. **Green leaves fade-in** (~63 frames): Only the green leaf palette entries (32–127, 160–255) fade from black
2. **Full crossfade** (~128 frames): Remaining palette entries (0–31, 128–159) fade in, revealing the full mountain background
3. **Fade-out** (~63 frames): Entire palette fades to black at the end

## Scrubbing

Scroll position = floor(frame / 3) columns from initial position. Font window and framebuffer are reconstructed each call — O(1) for position, O(n) for rendering where n = font pixel count.

## Remastered Ideas

- **Parallax layers**: Multiple mountain layers at different scroll speeds
- **High-res text**: AI-upscaled or vector-rendered text at 4K
- **Dynamic lighting**: Day/night cycle, shadows following sun position
- **Particle leaves**: Animated falling leaves over the landscape
- **Smooth scrolling**: Sub-pixel text movement for smoother animation
- **Fog/atmosphere**: Distance fog between mountain layers
