# Part 11 — TECHNO_TROLL: Monster Face + CRT Shutdown

**Time range:** 217.0s–231.3s (14.3s)  
**Original code:** TECHNO/KOE.C (doit3 scroll) + PANIC/SHUTDOWN.C by PSI  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

The "troll" or "monster" face picture scrolls in from the right with accelerating speed, bounces into position with dampening oscillation and a bright flash, then undergoes a classic CRT TV shutdown effect: the image shrinks vertically into a horizontal line, the line shrinks to a single pixel at center, and that pixel pulses and fades away.

## Image Data

- **Source:** TECHNO/TROLL.UP (320×400, 256-color, RLE-compressed)
- **Display:** Downsampled to 320×200 by taking every other scanline (`y*2`)
- **Palette:** 256 entries in 6-bit VGA (0–63 per channel)

## Sequence

### Phase 1: Scroll-In (frames 0–59, ~0.86s)

Picture slides in from the right with accelerating speed:
- `xpos += xposa / 4` per frame, `xposa++` each frame
- When `xpos >= 320`, the picture is fully visible
- Black fill for pixels to the left of the picture edge

### Phase 2: Bounce + Flash (frames 60–109, ~0.71s)

Picture bounces horizontally with dampening and a bright palette flash:
- `ripplep` (dampening) grows exponentially: `ripplep *= 5/4`
- `ripple` advances: `ripple += ripplep + 100`
- Horizontal offset: `sin1024[ripple % 1024] / ripplep` (shrinking oscillation)
- Palette flash: 16 pre-computed faded palettes, each adding a decreasing white offset:
  - `fade[y][a] = min(basePal[a] + (45 - y*3), 63)` for y = 0–15
  - Palette index advances from 0 (brightest flash) to 15 (normal) over 16 frames

### Phase 3: CRT Shutdown (frames 110+, ~8.6s)

Classic TV shutdown effect in 6 sub-sequences:

| Step | Duration | Description |
|------|----------|-------------|
| 0 | 1 frame | Full 320×200 picture displayed |
| 1 | 1 frame | Shrunk to half height (100 lines), white flash |
| 2 | 1 frame | Flash ends, still half height |
| 3 | ~60 frames | Vertical shrink: height × (5/6) per frame until ≤ 2px |
| 4 | ~93 frames | Horizontal line shrink: width -= 3 per frame from 280 to 1 |
| 5 | 60 frames | Single pixel at center pulses via cos(extinct/120 × 3 × 2π) |

The vertical shrink resamples the 320×400 source image to the shrinking height, maintaining image content. During steps 4–5, palette fades toward white.

## Palette Flash Details

The 16 faded palettes are pre-computed at init:
```
offset = 45 - y × 3    (y = 0..15)
color[a] = min(basePal[a] + offset, 63)
```

This creates a smooth flash-to-normal transition over 16 frames.

## Scrubbing

- Scroll position requires replaying `xpos` accumulation from frame 0
- Bounce requires replaying `ripple`/`ripplep` from bounce start
- CRT shutdown is purely frame-indexed (O(1))

## Remastered Ideas

- **High-res image**: Upscale the troll to 4K with AI upscaling
- **Smooth CRT shutdown**: Anti-aliased vertical shrink with phosphor glow
- **Bloom on flash**: Gaussian bloom during the white flash
- **Scanline effect**: Visible scanlines during the CRT shrink
- **Particle dissolve**: Pixel dissolve instead of hard black fill
- **Audio reactive**: Bounce amplitude tied to bass hits
