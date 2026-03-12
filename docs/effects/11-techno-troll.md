# Part 11 — TECHNO_TROLL (Troll Picture + CRT Shutdown)

## Overview

The "troll" (monster face) picture scrolls in from the right, bounces
horizontally with palette flash, then undergoes a classic CRT TV shutdown
animation. This is the final sequence of the TECHNO section.

## Original Source

- **Code**: `TECHNO/KOE.C` (doit3 scroll-in) + `PANIC/SHUTDOWN.C` (CRT effect)
- **Author**: PSI / WILDFIRE
- **Image**: `TECHNO/TROLL.UP` — 320x400 readp-compressed indexed image

## Technical Details

### Image Format

The troll image uses FC's "readp" RLE-compressed format:
- 320x400 pixels (VGA double-scan height)
- 256-colour VGA palette (6-bit per channel)
- Displayed at 320x200 by sampling every other row

### Three Phases

**Phase 1 — Scroll-in (~60 frames)**
- Picture slides in from the right edge
- Scroll speed accelerates: `xpos += xposa/4; xposa++`
- Normal palette throughout

**Phase 2 — Bounce + Flash (~50 frames)**
- Horizontal bounce with exponential dampening: `ripplep *= 5/4`
- Position oscillates via sin1024 lookup table
- 16 pre-computed faded palettes (brightness offset 45 to 0 in steps of 3)
- Flash starts bright and decays over ~16 frames

**Phase 3 — CRT Shutdown (~700 frames)**

Emulates an old CRT television being switched off:

1. **Frame 0**: Full picture at 320x200 (every other line of 320x400 source)
2. **Frame 1**: Shrink to half height + white flash
3. **Frame 2**: Flash ends
4. **Frames 3+**: Progressive vertical shrink (height * 5/6 per frame)
   with increasing white-fade palette until height <= 2
5. **Horizontal shrink**: Remaining center line narrows by 3px/frame
6. **Pixel fade**: Single pixel at (160,100) pulses via cosine over 60 frames

## Remastered Ideas

- AI-upscale the troll image to 4K
- CRT shader with phosphor glow, scanlines, bloom on white flash
- Smooth spring-dampened bounce physics
- Barrel distortion during shrink to simulate curved CRT glass
