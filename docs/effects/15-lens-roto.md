# Part 15 — LENS_ROTO: Rotozoom

**Time range:** 276.9s–306.2s (29.3s)  
**Original code:** LENS/MAIN.C part3() + ASM.ASM _rotate by PSI  
**Frame rate:** 70 fps (tweaked 160×100 VGA mode, pixel-doubled to 320×200)

## Overview

A rotozoom effect applied to the KOE picture. The 320×200 background is resampled to a 256×256 wrapping texture. Each frame samples a rotated, scaled rectangle from the texture using two displacement vectors. The output is 160×100, pixel-doubled to fill 320×200. Animation parameters (angle, scale, offset) follow a scripted physics model with accelerating rotation and oscillating zoom.

## Texture Preparation

The 320×200 KOE image is mapped to 256×256 with aspect correction:
```
for x in 0..255:
  for y in 0..255:
    srcY = floor(y × 10/11 - 18)     // aspect-corrected, centered
    rotpic[x + y×256] = back[x+32 + srcY×320]
```

The 256×256 size allows efficient wrapping via `& 0xFF` bitmask.

## Rotation/Zoom Algorithm

Per frame, two vectors are computed from rotation angle `d2` and `scale`:
```
xa = floor(-1024 × sin(d2) × scale)
ya = floor( 1024 × cos(d2) × scale)

pixel step:  (npU, npV) = ( ya/1024, -xa/1024)
line step:   (nlU, nlV) = (-npV × aspect, npU × aspect)
```

For each of the 160×100 pixels:
```
u += npU;  v += npV
output = rotpic[(v & 0xFF) << 8 | (u & 0xFF)]
```

## Animation Parameters

Pre-computed per frame (0–2000) at 70fps:

- **d1** (offset angle): decreases by 0.005/frame — controls the start position orbit
- **d2** (rotation angle): accumulates `d3`, which itself accelerates from 0 toward 0.02
- **scale**: starts at 2 (zoomed out), approaches 0.9 (close up), then zooms out at the end
- **scalea** (scale velocity): complex multi-phase control with different acceleration rates

### Fade
- Frames 0–15: fade from white to normal
- Frames 1872–2000: fade to white

## Scrubbing

Animation parameters are pre-computed in arrays — O(1) lookup with interpolation for any frame. No state replay needed.

## Remastered Ideas

- **Full-resolution rotozoom**: Render at native display resolution instead of 160×100
- **Bilinear filtering**: Smooth texture sampling instead of nearest-neighbor
- **Continuous zoom**: Smooth scale curves instead of the stiff parameter changes
- **Color cycling**: Dynamic palette shifts during rotation
- **Multi-texture**: Blend between different source images during the effect
- **Beat sync**: Rotation speed or scale pulses tied to the music beat
