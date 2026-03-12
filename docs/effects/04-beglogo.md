# Part 4 — BEGLOGO: Second Reality Title Card

## Overview

| Property | Value |
|---|---|
| Timeline | 108.9s – 129.7s (~20.8 seconds) |
| Original authors | Uncredited in source; BEGLOGO/ folder |
| Source folder | `BEGLOGO/` in SecondReality repo |
| Display mode | VGA 320×400 (Mode 13h with line-doubling disabled) |
| Frame rate | 70 fps |
| Image format | FC custom "readp" RLE-compressed indexed bitmap |

## What It Does

BEGLOGO displays the iconic "Second Reality" title card — a pre-rendered
320×400 bitmap showing the demo's name in a large stylised font. This is the
first thing the viewer sees after the opening landscape/ships/explosion
sequence. The music also transitions from MUSIC0 to MUSIC1 during this part.

The animation is minimal:

1. **Frames 0–31** (0.46s): Black screen (wait period)
2. **Frames 32–159** (1.83s): Fade from full white to the normal picture palette
3. **Frames 160+**: Picture holds at normal palette until the clip ends

The white start connects visually with the PAM explosion's fade-to-white ending,
creating a seamless white→picture→(eventual fade to black) transition.

## Original Implementation

### The "readp" Image Format (`beg/readp.c`)

The title picture is stored in Future Crew's custom compressed image format.
The binary layout:

```
Offset  Size  Field
──────  ────  ─────
0       2     magic (u16)
2       2     width (u16) = 320
4       2     height (u16) = 400
6       2     cols (u16) = number of colors
8       2     add (u16) — row data starts at add × 16
10-15   6     padding
16      768   palette (256 × 3 bytes, 6-bit VGA values 0–63)
784+    var   (unused until row data offset)
```

Row data starts at byte offset `add × 16`. Each row is preceded by a u16
giving the compressed byte count for that row, followed by the RLE payload:

| Byte value | Meaning |
|---|---|
| `b ≤ 127` | Single literal pixel with color index `b` |
| `b > 127` | Run of `(b & 0x7F)` pixels, next byte gives the color index |

This is simpler than PAM's delta-RLE — there's no inter-frame encoding because
it's a single static image. Each row is independently decompressible.

### Palette Fading

The fade uses `SetVGAPaletteFadeToWhite(palette, whiteLevel)` where
`whiteLevel = 1.0 - (frame - 32) / 128.0`:

```
For each color index i:
  r = whiteLevel × 63 + (1 - whiteLevel) × palette[i*3]
  g = whiteLevel × 63 + (1 - whiteLevel) × palette[i*3+1]
  b = whiteLevel × 63 + (1 - whiteLevel) × palette[i*3+2]
```

At `whiteLevel = 1.0` all colors become (63, 63, 63) = pure white.
At `whiteLevel = 0.0` all colors are their normal palette values.

### Data Sharing

The title picture data (`srtitle_palette`, `srtitle_pixels`) is shared with
Part 5 (GLENZ_TRANSITION), which uses the same image as its background before
the checkerboard tiles fall in. In the JS port, these variables are in global
scope. In our implementation, both effects import from their own `data.js` or
share via the ALKU/BEGLOGO data modules.

## WebGL2 Implementation

### Architecture

1. **`decodeReadp()`**: Decodes the binary "readp" format — extracts the
   768-byte VGA palette and decompresses all 400 rows of RLE pixel data into
   a flat `Uint8Array(320×400)`.

2. **`renderWithFade()`**: For each frame, computes a 256-entry RGBA palette
   LUT with the current white fade level applied, then maps indexed pixels
   to RGBA via the LUT.

3. **`render()`**: Computes the animation frame from `t`, determines the
   white level, calls `renderWithFade()`, uploads to a texture, and draws.

### Per-Frame Pipeline

```
t → frame = floor(t × 70)
  → whiteLevel = clamp(1.0 - (frame-32)/128, 0, 1)
  → renderWithFade(pixels, pal, whiteLevel)  → RGBA 320×400
  → texSubImage2D                             → GPU upload
  → fullscreen quad draw
```

### Scrubbing

The effect is stateless — any frame is a pure function of `t`. No animation
state accumulates between frames, so scrubbing works perfectly in any direction.

## Remastered Ideas

- **4K title image**: AI-upscale the 320×400 title to 3840×4800, clean up
  compression artifacts, enhance the metallic/chrome lettering detail
- **Parallax depth**: Split the title into foreground text and background
  layers with subtle parallax movement
- **Specular highlights**: Add real-time reflective highlights that track
  with the music beat
- **Particle reveal**: Instead of a flat fade from white, have particles or
  light rays coalesce into the title
- **Chromatic aberration**: Subtle RGB split on the edges during the fade-in
- **Camera motion**: Very slow dolly-in or orbit during the hold period to
  add visual interest to the long static hold
- **Environment reflection**: Reflect a subtle environment map on the metallic
  surfaces of the lettering

## References

- Original source: https://github.com/mtuomi/SecondReality/tree/master/BEGLOGO
- JS port: https://github.com/covalichou/second-reality-js (Part 04)
- readp format decoder: `beg/readp.c` in the original repo
