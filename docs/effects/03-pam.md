# Part 3 — PAM: Pre-rendered Explosion Animation

## Overview

| Property | Value |
|---|---|
| Timeline | 78.0s – 82.0s (4 seconds) |
| Original authors | TRUG (animation), WILDFIRE (code) |
| Source folder | `PAM/` in SecondReality repo |
| Display mode | VGA Mode 13h (320×200, 256 colors) |
| Frame rate | 70/4 = 17.5 fps |
| Total frames | ~40 video frames + palette fade sequence |

## What It Does

PAM is a brief transition effect that plays immediately after the U2A ships
flyover. It shows the landscape exploding — a pre-rendered 3D Studio animation
compressed into a custom video format.

The effect opens with a **white flash** that rapidly fades to normal colors,
plays the explosion animation for about 2 seconds, then **fades back to white**
before the BEGLOGO title card appears.

## Original Implementation

### Video Pipeline

The animation originated as a FLI file (Autodesk Animator / 3D Studio format):

1. **FLI → RAW**: `VFLI.C` decompressed the FLI into a raw frame sequence
2. **RAW → ANI**: `ANIM.C` re-compressed the raw frames using a custom RLE codec
3. **ANI → Screen**: `OUTTAA.C` + `ASMYT.ASM` decoded and displayed at runtime

### RLE Codec (`ulosta_frame` in ASMYT.ASM)

Each frame is stored as a sequence of RLE commands starting on a 16-byte-aligned
boundary:

| Byte value | Meaning |
|---|---|
| `b > 0` | Write `b` pixels of the next byte's color index |
| `b < 0` | Skip `|b|` pixels (keep previous frame's content — delta encoding) |
| `b == 0` | End of frame |

This is a simple but effective delta-RLE scheme: unchanged regions between
frames are encoded as skips, and only changed pixels are stored.

### Palette Fading

The `PAMPaletteFade` array maps animation frame index to a white fade level
(0–63). The fade curve:

```
Frame:  0  1  2  3  4  5  6  7  8  ...  29  30  31  ...  40  41+
Level: 63 32 16  8  4  2  1  0  0  ...   0   1   2  ...  56  63
```

- **Frames 0–6**: Rapid fade-in from white (63 → 0)
- **Frames 7–29**: Normal colors (0) — explosion plays
- **Frames 30–40**: Gradual fade-out to white (0 → 63)

Each palette color is interpolated: `result = fadeLevel/63 × white + (1 - fadeLevel/63) × original`

## WebGL2 Implementation

### Architecture

Since PAM is a short, finite animation (~40 frames), all frames are **pre-baked
at init time**:

1. **`bakeAllFrames()`**: Decodes the entire RLE stream into an array of
   independent indexed framebuffer snapshots (each 320×200 bytes). This makes
   any frame instantly accessible by index — no delta replay needed.

2. **`render()`**: For the current time `t`:
   - Compute `animFrame = floor(t × 17.5)`
   - Look up the video frame from the pre-baked array
   - Look up the palette fade level from `PALETTE_FADE`
   - Build a faded RGBA palette and convert indexed → RGBA
   - Upload to a texture and draw on a fullscreen quad

### Per-Frame Pipeline

```
t → animFrame → bakedFrames[videoIdx]  (indexed 320×200)
             → PALETTE_FADE[fadeIdx]   (white fade level)
             → buildFadedPalette()     (256-entry RGBA LUT)
             → palette lookup          (RGBA 320×200)
             → texSubImage2D           (GPU upload)
             → fullscreen quad draw
```

### Scrubbing

Because all frames are pre-baked, scrubbing to any point is O(1) — no
sequential decoding needed. The only per-frame cost is the palette fade
computation and pixel conversion.

## Remastered Ideas

- **Higher-resolution explosion**: Re-render the 3D Studio explosion at
  1080p/4K using modern ray-traced volumetrics
- **Particle system**: Replace the pre-rendered frames with a real-time particle
  explosion driven by the same timing curve
- **Camera shake**: Add screen shake synced to the explosion impact
- **Bloom/glow**: Apply HDR bloom to the white flash and explosion highlights
- **Debris trails**: Add persistent particle trails from explosion fragments
- **Sound design**: Layer in a bass-heavy explosion sound effect synced to the
  flash peak
- **Shockwave distortion**: Radial displacement/ripple emanating from the
  explosion center

## References

- Original source: https://github.com/mtuomi/SecondReality/tree/master/PAM
- JS port: https://github.com/covalichou/second-reality-js (Part 03)
- FLI format: Autodesk Animator / 3D Studio frame animation format
