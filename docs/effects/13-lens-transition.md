# Part 13 — LENS_TRANSITION: Thunderbolt Picture Reveal

**Time range:** 260.2s–265.6s (5.4s)  
**Original code:** LENS/MAIN.C part1() by PSI  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

The KOE picture (green leaves/face) is revealed by a "thunderbolt curtain" effect. Two reveal cursors sweep outward from the center of each scanline at varying speeds, creating a zigzag lightning pattern. Each frame runs 6 iterations, revealing one pixel per cursor per scanline per iteration.

## Algorithm

### Initialization

For each scanline y (0–199):

```
firfade1a[y] = floor(19 + y/5 + 4) & ~7     (positive, moves right)
firfade2a[y] = floor(-(19 + (199-y)/5 + 4)) & ~7  (negative, moves left)
firfade1[y]  = 170×64 + (100-y)×50           (start position, fixed-point)
firfade2[y]  = 170×64 + (100-y)×50           (same start)
```

The start position is near the center (x ≈ 170), offset vertically by `(100-y)×50` to create a diagonal starting line. The `& ~7` alignment on speeds creates the blocky zigzag pattern.

### Per Frame (6 iterations)

```
for each iteration (c = 0..5):
  for each scanline (y = 0..199):
    reveal pixel at x = firfade1[y] >> 6    (fixed-point to pixel)
    reveal pixel at x = firfade2[y] >> 6
    firfade1[y] += firfade1a[y]             (advance right)
    firfade2[y] += firfade2a[y]             (advance left)
```

### Completion

After ~80 frames (~1.14s), the entire picture is revealed. The remaining clip time shows the static picture.

## Scrubbing

Requires replaying all frames from 0 to reconstruct the reveal state. O(frame × 6 × 200) per render call. Could be optimized by computing the final x-extent per scanline analytically.

## Remastered Ideas

- **Animated lightning**: Real-time procedural lightning bolts instead of linear cursors
- **Glow/bloom**: Bright edge glow where the reveal front is
- **Particle sparks**: Sparks fly from the reveal edge
- **Smooth reveal**: Anti-aliased reveal edge with feathering
- **Sound-reactive**: Reveal speed tied to beat intensity
