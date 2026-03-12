# Part 18 — DOTS: Mini Vector Balls

**Time range:** 372.5s–409.9s (37.4s)  
**Original code:** DOTS folder by PSI  
**Frame rate:** 70 fps (VGA Mode 13h, 320×200, 256-color)

## Overview

512 small colored dots with gravity simulation, bouncing, depth-based coloring, and floor shadows. Dots are spawned in various animated patterns across multiple phases: spiral rise, fountain, expanding ring, and random scatter. The scene rotates around the Y-axis, with rotation speed increasing dramatically near the end.

## Dot Sprite

Each dot is a 4×3 pixel shape:
```
.##.     (dt1: depth color 2)
####     (dt2: depth colors 2,3,3,2)
.##.     (dt1: depth color 2)
```

Color intensity depends on depth (Z-distance): 16 depth levels × 4 color shades. Base colors: black → dark cyan → medium cyan → bright cyan-white. Nearer dots are brighter.

## Spawn Phases

| Frames | Pattern | Description |
|--------|---------|-------------|
| 0–499 | Spiral rise | Dots spiral upward from below in a Lissajous pattern |
| 500–899 | Fountain | Dots shoot up from below in a ring pattern |
| 900–1699 | Expanding ring | Ring diameter oscillates with sin(frame/1024), dots launch upward |
| 1700–2359 | Random scatter | Random positions, gravity weakens over time |
| 2360–2399 | Flash in | Palette shifts toward blue-white |
| 2400–2440 | Fade out | Palette fades to uniform white |

## Physics

Each dot has position (x, y, z) and vertical velocity (yadd):
```
yadd += gravity
y += yadd
if (y >= gravitybottom): yadd = -yadd × gravityd / 16  (damped bounce)
```

The dropper value (initial Y-offset) decreases from 22000 to 4000 over time, bringing the spawn point closer to the floor.

## Rotation

Single Y-axis rotation:
```
bp = (z×rotcos - x×rotsin) / 0x10000 + 9000     (depth)
screen_x = (projected_a + projected_a/8) / bp + 160
screen_y = (y×64) / bp + 100
shadow_y = 0x80000 / bp + 100                     (fixed floor level)
```

Rotation angle: smooth sine wave (frames 0–1900), then accelerating spin with `rota` decreasing by 1 per frame.

## Palette

- Indices 0–63: Dot colors (16 depth levels × 4 shades each)
- Indices 64–163: Background gradient (gray ramp for the floor)
- Index 87: Shadow color (dark gray)
- Index 255: Special color (unused in visible output)

## Scrubbing

Full state replay from frame 0 required (accumulated physics). Uses seeded PRNG for deterministic random positions.

## Remastered Ideas

- **Sphere sprites**: Replace pixel rectangles with smooth anti-aliased spheres
- **Particle trails**: Fading trails behind each dot
- **Real-time shadows**: Proper shadow mapping instead of fixed-floor projection
- **Bloom**: Glow on bright dots
- **Beat-reactive**: Dot spawn rate and bounce energy tied to music
- **Higher dot count**: 4096+ dots with GPU instancing
