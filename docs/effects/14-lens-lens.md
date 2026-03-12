# Part 14 — LENS_LENS: Bouncing Crystal Ball

**Time range:** 265.6s–276.9s (11.3s)  
**Original code:** LENS/MAIN.C part2() + CALC.C by PSI  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

A see-through crystal ball (lens) bounces over the KOE background image. The lens refracts/distorts the background using pre-computed pixel lookup maps, creating a magnification effect. Transparency is managed through palette-based color mixing: background uses palette indices 0–63, while the lens uses indices 64–255 organized in three 64-entry blocks for different lens regions (body, reflection, bright highlight).

## Lens Data Structure

Five pre-computed data files define the lens:

| File | Size | Purpose |
|------|------|---------|
| EX0 | 215 B | Header: lens dimensions (152×116), 3 lens palette colors |
| EX1 | 19 KB | Central lens body — consecutive pixel segments with distortion offsets |
| EX2 | 6.8 KB | Reflections — individual pixel positions with source offsets |
| EX3 | 1.5 KB | Secondary reflections — same format as EX2 |
| EX4 | 6.2 KB | Edge cleanup — copies background pixels around the lens perimeter |

### Pixel Format (EX1 — dorow)

Per scanline row (top half, mirrored to bottom):
- Header: 4 bytes (segment data offset + pixel count)
- Segment data: base address (signed 16-bit relative to lens position) + per-pixel source offsets
- All destination pixels are consecutive; source pixels can be anywhere (distortion)

### Pixel Format (EX2/EX3 — dorow2)

Per scanline row:
- Header: 4 bytes (pixel data offset + pixel count)
- Per pixel: destination offset + source offset (both signed 16-bit relative to base)
- Individual non-consecutive pixels (sparse reflection highlights)

## Palette-Based Transparency

```
Index   0– 63: Background image colors
Index  64–127: Background + lens color 1 (central body tint)
Index 128–191: Background + lens color 2 (reflection tint)
Index 192–255: Background + lens color 3 (bright highlight tint)
```

Lens pixels: `fb[dest] = back[src] | mask` where mask is 0x40, 0x80, or 0xC0. The OR operation shifts the background color into the appropriate lens palette block.

### Fade-In

32 opacity levels (fade2 table) transition the lens from opaque to translucent over frames 32–96.

## Bouncing Physics

Fixed-point (×64) position with gravity:
```
x += xa;  y += ya
if (x out of bounds) xa = -xa
if (y > 150×64 && frame < 600):
  first bounce: ya = -ya × 2/3
  subsequent:   ya = -ya × 9/10
ya += 2  (gravity)
```

Initial position: (65, -50), velocity: (1, 1) per frame. The lens enters from the top, bounces off the floor with dampening, and drifts horizontally.

## Scrubbing

Lens position requires replaying physics from frame 0. O(frame) per render call. Framebuffer itself is O(1) — just background + lens overlay at computed position.

## Remastered Ideas

- **Real-time refraction shader**: Compute distortion analytically in fragment shader
- **Specular highlights**: Dynamic specular based on light direction
- **Chromatic aberration**: RGB channel separation at lens edges
- **Caustics**: Light patterns cast by the lens onto the background
- **Physics improvements**: More realistic bounce with rotation
- **Multiple lenses**: Several bouncing lenses with interaction
