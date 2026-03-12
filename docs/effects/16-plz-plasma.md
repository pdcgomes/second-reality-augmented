# Part 16 — PLZ_PLASMA: Classic Plasma

**Time range:** 306.2s–343.9s (37.7s)  
**Original code:** PLZ/PLZ.C + ASMYT.ASM + COPPER.ASM by WILDFIRE  
**Frame rate:** 70 fps (VGA 320×400 tweaked mode, displayed at 320×200)

## Overview

Two layered sine-wave plasmas rendered in interleaved mode (even/odd rows and columns swap layers). Rich organic patterns emerge from multi-harmonic sine lookup tables. Three palette sequences (red, rainbow, gray-white) cycle via "drop" transitions. The plasma renders at 320×280 visible lines within a 320×400 buffer.

## Sine Tables

Three pre-computed tables provide the complex wave patterns:

| Table | Size | Formula |
|-------|------|---------|
| `lsini4` | 8192 | `(sin(a/4096) × 55 + sin(5a/4096) × 8 + sin(15a/4096) × 2 + 64) × 8` |
| `lsini16` | 8192 | `(sin(a/4096) × 55 + sin(4a/4096) × 5 + sin(17a/4096) × 3 + 64) × 16` |
| `psini` | 16384 | `sin(a/4096) × 55 + sin(6a/4096) × 5 + sin(21a/4096) × 4 + 64` |

Each combines a fundamental sine with higher harmonics for visual richness.

## Plasma Rendering

Two parameter sets (K and L) drive the two plasma layers. Per pixel:

```
bx1 = lsini16[(y + params[1] + rx×4) & 0xFFF]
val1 = psini[(x×8 + params[0] + bx1) & 0x3FFF]
bx2 = lsini4[(y + params[3] + x×16) & 0xFFF]
val2 = psini[(bx2 + y×2 + params[2] + rx×4) & 0x3FFF]
colorIndex = (val1 + val2) & 0xFF
```

The `rx = 80 - x` term creates a horizontal mirror effect. Pixels are doubled (each computed pixel fills 2 horizontal pixels).

## Interleaving

The 4-pass render alternates which layer fills which pixels:
1. Even rows, even columns → K params
2. Odd rows, even columns → L params
3. Odd rows, odd columns → K params
4. Even rows, odd columns → L params

This creates a fine-grained checkerboard interleave between the two layers.

## Parameter Animation

Each frame, parameters shift:
```
K: k1 -= 3, k2 -= 2, k3 += 1, k4 += 2
L: l1 -= 1, l2 -= 2, l3 += 2, l4 += 3
```
All values masked to 12 bits (0–4095).

## Palette Sequences

Three palettes used in the demo, generated via `ptau` (cosine curve 0–63):

| Seq | Description |
|-----|-------------|
| 0 | Red: red → black → blue → red-blue |
| 1 | Rainbow: red → purple → green → yellow |
| 2 | Gray: dark → gray → dark → dark |

### Drop Transitions

Between sequences, the plasma "drops" off-screen: `lc` (y-offset) accelerates quadratically over 64 frames, then resets. New parameters and palette initialize from the `inittable`.

## Remastered Ideas

- **Full resolution**: Render at display resolution instead of 320×200
- **Smooth palette blending**: Continuous HSL interpolation instead of indexed 256 colors
- **3D depth**: Map plasma onto a curved surface with parallax
- **Beat-reactive parameters**: Tie animation speed to bass/treble energy
- **Multi-octave noise**: Add Perlin noise layers for more organic patterns
- **Color themes**: Dynamic palette generation based on music mood
