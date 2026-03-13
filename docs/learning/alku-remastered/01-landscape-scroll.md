# Layer 1 — The Landscape Scroll

**Source:** `src/effects/alku/data.js` (exports), `src/effects/alku/effect.remastered.js` lines 253–269
**Concepts:** Indexed-colour images, VGA palette decoding, texture upload, UV-based scrolling

---

## What This Layer Covers

The centrepiece of the ALKU effect is a scrolling landscape that fades in
midway through the intro. It looks like 3D terrain, but it is not — it is a
**pre-rendered 640×200 pixel image** that slides horizontally behind the
credits.

This layer explains how the original indexed pixel data is decoded into RGBA,
uploaded to the GPU as a texture, and scrolled smoothly using nothing more than
a UV offset in the fragment shader.

---

## The Landscape Image

The original image was stored as two files (`HOI.IN0` + `HOI.IN1`) in the 1993
demo. In this project, it lives as a base64-encoded blob in `data.js`:

```javascript
export const LANDSCAPE_W = 640;
export const LANDSCAPE_H = 200;
export const LANDSCAPE_B64 = "...";  // ~170 KB base64 string
```

The image is **indexed colour** — each pixel is a single byte (0–63) that
references a slot in the **VGA palette**:

```javascript
export const LANDSCAPE_PAL = [0,0,0, 10,10,10, 30,30,30, ...];
// 256 entries × 3 channels (R, G, B) in VGA 6-bit range (0–63)
```

---

## Decoding: Index → RGB → RGBA

The `decodeLandscape()` function converts indexed pixels to GPU-ready RGBA:

```javascript
function decodeLandscape() {
  const indexed = b64ToUint8(LANDSCAPE_B64);
  const rgba = new Uint8Array(LANDSCAPE_W * LANDSCAPE_H * 4);
  for (let i = 0; i < LANDSCAPE_W * LANDSCAPE_H; i++) {
    const idx = indexed[i];
    const pi = (idx & 63) * 3;
    if (idx === 0) {
      rgba[i * 4 + 3] = 0;            // index 0 = transparent
    } else {
      rgba[i * 4 + 0] = Math.min(255, LANDSCAPE_PAL[pi + 0] * 4);
      rgba[i * 4 + 1] = Math.min(255, LANDSCAPE_PAL[pi + 1] * 4);
      rgba[i * 4 + 2] = Math.min(255, LANDSCAPE_PAL[pi + 2] * 4);
      rgba[i * 4 + 3] = 255;
    }
  }
  return rgba;
}
```

Three things to notice:

1. **`idx & 63`** — only the low 6 bits select the palette entry. The original
   used the upper 2 bits as a text-opacity bank selector (see Layer 2).
2. **`× 4`** — VGA palettes use 6-bit colour (0–63). Multiplying by 4 scales
   to 8-bit range (0–252). A more precise conversion would use `(v << 2) | (v >> 4)`
   but `× 4` matches the original behaviour.
3. **Index 0 = transparent** — the sky area above the hills uses index 0,
   which decodes to alpha 0. The shader renders black there.

```
 Indexed pixel: 0x1A  (decimal 26)
 Low 6 bits:    26
 Palette offset: 26 × 3 = 78
 PAL[78..80]:   [13, 16, 23]   ← VGA 6-bit values
 × 4:           [52, 64, 92]   ← 8-bit RGBA (R=52, G=64, B=92, A=255)
```

---

## GPU Texture Upload

After decoding, the RGBA buffer is uploaded as a WebGL texture:

```javascript
landscapeTex = gl.createTexture();
const landscapeRGBA = decodeLandscape();
uploadTexture(gl, landscapeTex, LANDSCAPE_W, LANDSCAPE_H, landscapeRGBA);
```

The `uploadTexture` helper sets **NEAREST-neighbor filtering** — this is
critical for preserving the pixel-art aesthetic:

```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
```

If you changed `gl.NEAREST` to `gl.LINEAR`, the landscape would look blurry
when scaled to modern resolutions. NEAREST gives the crisp, blocky pixels that
match the 1993 original.

---

## Scrolling via UV Offset

The landscape is 640 px wide but the viewport shows only 320 px at a time. The
scroll works by shifting the **texture U coordinate**:

```
 640px landscape texture
 ┌────────────────────────────────────────┐
 │           ┌──────────────────┐         │
 │           │  320px viewport  │ ──►     │
 │           └──────────────────┘         │
 └────────────────────────────────────────┘
              uScrollOffset
              0.0 ──────────► 0.5
```

In the fragment shader:

```glsl
float landscapeUVx = uv.x * 0.5 + uScrollOffset;
color = texture(uLandscape, vec2(landscapeUVx, landscapeUVy)).rgb;
```

- `uv.x * 0.5` — the viewport covers half the texture width (320/640 = 0.5)
- `+ uScrollOffset` — slides the window rightward as time progresses

The offset is computed from the original 70 Hz frame rate:

```javascript
const BG_SCROLL_SPEED = 7.8 / FRAME_RATE;  // px/frame at 70 Hz
const scrollPixels = Math.min(scrollFrames * BG_SCROLL_SPEED, 320);
scrollOffset = scrollPixels / 640;           // normalise to 0..0.5
```

Maximum scroll is 320 pixels (half the image width), so `scrollOffset` ranges
from 0.0 to 0.5 — the viewport slides from the left half to the right half.

---

## Vertical Mapping

The landscape does not fill the entire screen. The top ~12.5% is sky (black):

```glsl
float skyFraction = 50.0 / 400.0;  // original: lines 50–449 of 400
if (uv.y >= skyFraction) {
  float landscapeUVy = (uv.y - skyFraction) / (1.0 - skyFraction);
  // sample landscape ...
}
```

This maps screen coordinates to landscape coordinates:

```
 Screen Y    What's Displayed
 ─────────   ──────────────────
 0.000       Sky (black)
 0.125       Top of landscape
   ↓         Landscape image
 1.000       Bottom of landscape
```

The original 1993 display was 320×400 with the landscape occupying lines 50–449
(200 source lines, each drawn twice for the VGA tweaked mode). The shader
replicates this vertical layout at any resolution.

---

## Key Takeaways

- **Pre-rendered scrolling** is the oldest trick in the demo scene — move a
  camera window across a wide image to create the illusion of motion
- **Indexed colour** saves memory (1 byte/pixel vs 4) but requires a palette
  lookup step before GPU upload
- **NEAREST filtering** preserves pixel-art crispness at high resolutions
- **UV offset** is the simplest and cheapest form of scrolling — no geometry
  changes, no vertex buffer updates, just one uniform per frame

---

**Next:** [Layer 2 — The Bitmap Font](02-bitmap-font.md) · **Back to:** [Overview](00-overview.md)
