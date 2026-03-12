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

Same architecture as FOREST (Part 12): three POS tables map each of the 158×34 font window pixels to screen positions. The font window slides through the 400×34 sword source image, one column per scroll step (every 3 frames).

Key difference from FOREST: non-zero sword pixels directly overwrite the background; zero pixels show the background underneath.

## Scrubbing

O(1) — scroll position derived from frame number, all rendering is stateless.

## Remastered Ideas

- **High-res sword**: Upscale the chrome sword with AI/procedural detail
- **Dynamic reflections**: Environment-mapped chrome surface
- **Particle trails**: Chrome particles shed as the sword scrolls
- **Depth of field**: Blur the background behind the sword
