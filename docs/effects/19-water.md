# Part 19 — WATER: Mirror Ball Scroller

**Time range:** 409.9s–438.8s (28.9s)  
**Original code:** WATER/DEMO.PAS + ROUTINES.ASM by TRUG  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

"Peilipalloscroll" (Mirror Ball Scroller) — a chrome/mirror sword image scrolls across a background sphere scene using the same pre-computed position lookup table technique as FOREST. The sword pixels directly overwrite the background (unlike FOREST's additive blending).

## Data Files

| File | Size | Content |
|------|------|---------|
| MIEKKA.SCI | 15 KB | Sword image: 400×34 indexed pixels + palette |
| BKG.CLX | 65 KB | Background: 320×200 pixels + palette |
| WAT1/WAT2/WAT3 | ~24 KB each | Position lookup tables for 3 interlaced passes |

## Rendering

Same architecture as FOREST (Part 12): three POS tables map each of the 158×34 font window pixels to screen positions.

Key difference from FOREST: non-zero sword pixels directly overwrite the background; zero pixels show the background underneath.

### Animation mechanism

The original uses a cumulative shift on a flat 158×34 buffer (`fbuf`):

1. Every 3 frames, `AnimateOneFrame()` shifts the entire 5372-element flat array left by 1
2. A new column from the sword font (at position `scp`) is inserted into the buffer at row-start offsets (`fbuf[158 + x*158]` for x=0..32)
3. `scp` advances from 0 to 390 (stopping at 390)
4. After `scp` reaches 390, the shift continues — remaining content scrolls off the left edge while column 390 repeats on the right

This means the animation doesn't "freeze" when the font data is exhausted; the existing content keeps scrolling out of view.

## Scrubbing

Stateful — the buffer state depends on the cumulative history of shifts. The implementation uses checkpoint-based replay: state is cached every 50 animation steps, and scrubbing replays from the nearest checkpoint. Sequential playback uses the last cached state for O(1) incremental updates.

## Remastered Ideas

- **High-res sword**: Upscale the chrome sword with AI/procedural detail
- **Dynamic reflections**: Environment-mapped chrome surface
- **Particle trails**: Chrome particles shed as the sword scrolls
- **Depth of field**: Blur the background behind the sword
