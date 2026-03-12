# Part 5 — GLENZ_TRANSITION: Checkerboard Tile Fall

**Time range:** 115.5s–121.8s (6.3s)  
**Sync points:** `CHECKERBOARD_FALL` → `GLENZ_START`  
**Original code:** GLENZ/MAIN.C by PSI  
**Frame rate:** 70 fps (VGA Mode 13h vertical refresh)

## Overview

A two-phase transition connecting the BEGLOGO title card to the GLENZ 3D vectors scene. The first phase wipes the title picture away from the center outwards while fading it to gray. The second phase drops a pre-rendered 3D checkerboard pattern from the top of the screen, where it bounces and settles into its resting position — forming the backdrop for the GLENZ vectors.

## Phase 1 — Title Wipe ("Zoomer1")

**Duration:** 48 frames (~0.69s)  
**Resolution:** 320×400 (inherited from BEGLOGO)

The title picture pixels are progressively cleared from both the top and bottom edges toward the center:

- **Top wipe (zy):** Accumulates `floor(frame / 4)` pixels each frame, capped at 260. The clearing accelerates as frames progress (quadratic curve).
- **Bottom wipe (zy2):** Proportional to the top: `floor(125 * zy / 260)` rows cleared from the bottom edge (row 399 upward).
- **Palette fade:** The first 128 palette entries are linearly interpolated toward gray (VGA value 30,30,30) over 32 frames. Palette index 255 (cleared pixels) is always black.

The effect modifies the title picture's indexed pixels in-place, so the wipe reveals black behind the image while the remaining visible portions desaturate to gray.

## Phase 2 — Checkerboard Bounce

**Duration:** ~187 frames (~2.7s), then holds at rest  
**Resolution:** 320×200 (Mode 13h)

### Image format

The checkerboard is stored as a raw FC image file:
- **Header:** 16 bytes (magic, dimensions, offsets)
- **Palette:** 768 bytes (256 × 3 RGB, 6-bit VGA values) — only the first 16 colors are used
- **Pixels:** 320 × 200 = 64,000 bytes (indexed)

The image depicts a 3D checkerboard surface in perspective. Rows 0–99 contain the face (top surface), and rows 100–107 contain the front edge (vertical side).

### Physics simulation

Simple gravity + bounce with energy loss:

```
velocity = 0, position = 0

Each frame:
  velocity += 1                    (gravity)
  position += velocity             (integrate)
  
  if position > 48*16 (768):       (hit bottom)
    position -= velocity           (undo overshoot)
    velocity = -velocity * 2/3     (bounce with 1/3 energy loss)
    
    if |velocity| < 4:             (settled — animation done)
      end
```

The checkerboard starts at the top (position 0) and falls under gravity. Each time it hits the bottom boundary (768 units), it bounces with 2/3 of its velocity reversed. The bouncing height diminishes each time until the velocity drops below the threshold.

### Rendering

The checkerboard position is converted to screen coordinates:

```
y = floor(position / 16)           (0..48)
y1 = floor(130 + y/2)              (top of checkerboard on screen)
y2 = floor(130 + y*3/2)            (bottom of face on screen)

Scale factor: b = 100 / (y2 - y1)  (source rows per dest row)
```

- **Face (rows 0–99):** Vertically scaled to fit y1..y2 using nearest-neighbor sampling
- **Front edge (rows 100–107):** Always drawn at 1:1 scale directly below the face
- **Clearing:** Top lines are cleared when falling (velocity > 0), bottom lines when rising (velocity < 0)

## Data Dependencies

- **srtitle (from BEGLOGO):** The 320×400 readp-compressed title picture and its 256-color palette, reused for Phase 1
- **CHECKERBOARD:** A separate 320×200 raw image with 16-color palette, used for Phase 2

## WebGL2 Architecture

Two textures are maintained:
- `titleTex` (320×400) for Phase 1 — the title picture with progressive wipe and palette fade
- `checkerTex` (320×200) for Phase 2 — the checkerboard bounce

Both are rendered to CPU-side RGBA buffers using indexed palette lookup, then uploaded via `texSubImage2D`. A single fullscreen quad shader displays the active texture. The phase transition switches between textures based on the frame count.

Scrubbing is fully supported: Phase 1 recomputes the wipe state from the frame number, and Phase 2 replays the bounce simulation (max ~200 iterations) from scratch.

## Remastered Ideas

- **Title wipe:** Add a subtle blur or dissolve effect instead of hard line clearing. Could use a radial wipe from center or a particle disintegration effect.
- **Palette fade:** Transition through a more interesting color palette (sepia, desaturated blue) before going to gray.
- **Checkerboard bounce:** Add subtle motion blur during fast falls, camera shake on impact, and dust particles on each bounce.
- **3D checkerboard:** Re-render the checkerboard at higher resolution with proper perspective, maybe with reflections on the tiles or parallax depth on the tile pattern.
- **Sound sync:** Add impact sounds synced to each bounce frame.
- **Resolution:** The checkerboard image could be AI-upscaled from 320×200 to 4K while maintaining the pixel art character.
