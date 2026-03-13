# Layer 2 — The Bitmap Font

**Source:** `src/effects/alku/effect.remastered.js` lines 271–377 (font parsing + text rendering)
**Concepts:** Variable-width bitmap fonts, glyph boundary detection, anti-aliased alpha, area downsampling

---

## What This Layer Covers

Every credit in the opening sequence — "Future Crew", "Purple Motion",
"Wildfire" — is rendered using a **variable-width anti-aliased bitmap font**
extracted from the original 1993 demo. This layer explains how the font data
is parsed, how individual glyphs are located, how text screens are composited
into RGBA textures, and how area downsampling preserves anti-aliasing quality.

---

## The Font Data

The font lives in `data.js` as a 1500×30 pixel bitmap:

```javascript
export const FONT_W = 1500;
export const FONT_H = 30;
export const FONT_B64 = "...";  // base64-encoded pixel values
```

Each pixel has one of **4 values** representing anti-aliasing levels:

```
 Value   Meaning          Alpha Equivalent
 ─────   ───────────────  ────────────────
  0      Transparent       0   (0%)
  1      Light edge        85  (33%)
  2      Medium edge       170 (67%)
  3      Full text body    255 (100%)
```

The characters are laid out contiguously in the bitmap, separated by blank
(all-zero) columns:

```
 ┌──┐ ┌──┐ ┌──┐ ┌──┐ ┌──┐
 │A │ │B │ │C │ │D │ │E │ ...
 └──┘ └──┘ └──┘ └──┘ └──┘
  ↑         ↑
  variable width — 'A' might be 22 px wide, 'I' might be 8 px
```

The character ordering is given by the `FONT_ORDER` constant:

```javascript
export const FONT_ORDER =
  "ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:$#()+-*='[]";
```

Note: the `[` and `]` characters are special — they form the two halves of a
**Dolby Surround logo** in the original demo.

---

## Glyph Boundary Detection

The `parseFont()` function scans the bitmap to find where each character starts
and ends. The algorithm is elegant in its simplicity: **walk left to right,
find runs of non-blank columns**.

```javascript
function parseFont() {
  const raw = b64ToUint8(FONT_B64);
  const chars = {};

  function isColumnBlank(x) {
    for (let y = 0; y < FONT_H; y++) {
      if (raw[x + y * FONT_W] !== 0) return false;
    }
    return true;
  }

  let charIdx = 0;
  let x = 0;
  while (x < FONT_W && charIdx < FONT_ORDER.length) {
    while (x < FONT_W && isColumnBlank(x)) x++;   // skip blanks
    if (x >= FONT_W) break;
    const startX = x;
    while (x < FONT_W && !isColumnBlank(x)) x++;  // span character
    const charCode = FONT_ORDER.charCodeAt(charIdx);
    chars[charCode] = { x: startX, w: x - startX };
    charIdx++;
  }

  chars[32] = { x: FONT_W - 20, w: 16 };  // space character
  return { chars, raw };
}
```

The result is a lookup table mapping ASCII codes to `{ x, w }` — the
horizontal start position and pixel width of each glyph in the bitmap.

```
 'F' → { x: 110, w: 18 }    'u' → { x: 672, w: 16 }
 't' → { x: 654, w: 14 }    'r' → { x: 624, w: 14 }
```

---

## Rendering a Text Screen

Each credit screen is defined as an array of lines with Y positions:

```javascript
const TEXT_SCREENS = [
  { lines: [
    { y: 120, text: 'A' },
    { y: 160, text: 'Future Crew' },
    { y: 200, text: 'Production' },
  ]},
  // ... 6 more screens
];
```

The `renderTextScreen()` function blits glyphs into a **320×400 intermediate
buffer**, then downsamples to 320×256. The two-step process preserves
anti-aliasing:

```
 Step 1: Blit at native 400-line positions
 ┌──────────────────────┐  320 × 400
 │                      │
 │   Future Crew        │  ← y=160 in 400-line space
 │   Production         │  ← y=200
 │                      │
 └──────────────────────┘

 Step 2: Area-downsample to 320 × 256
 ┌──────────────────────┐  320 × 256
 │                      │
 │   Future Crew        │  ← y≈102 in 256-line space
 │   Production         │  ← y≈128
 │                      │
 └──────────────────────┘
```

---

## The Blitting Loop

For each character, the code copies pixels from the font bitmap into the
intermediate buffer, converting font values to alpha:

```javascript
for (let fy = 0; fy < charHeight; fy++) {
  for (let fx = 0; fx < ch.w; fx++) {
    const fontVal = font.raw[ch.x + fx + fy * FONT_W];
    if (fontVal === 0) continue;

    const px = cx + fx;
    const py = cy + fy;
    const alpha = fontVal === 1 ? 85 : fontVal === 2 ? 170 : 255;
    const oi = (py * DISPLAY_W + px) * 4;
    const existing = src[oi + 3];
    if (alpha > existing) {
      src[oi]     = 255;   // R
      src[oi + 1] = 255;   // G
      src[oi + 2] = 255;   // B
      src[oi + 3] = alpha; // A
    }
  }
}
```

Key details:
- All text is **white** (RGB 255, 255, 255) — colour comes from the fade
- The `if (alpha > existing)` check handles overlapping glyphs by keeping
  the highest opacity pixel (max compositing)
- **Horizontal centring**: `cx = Math.floor(160 - totalW / 2)` centres each
  line in the 320 px display width

---

## Area Downsampling (400 → 256)

The intermediate buffer is 320×400 but the final texture is 320×256. A naive
skip-every-other-row approach would lose font detail. Instead, the code uses
**area downsampling with fractional coverage weights**:

```javascript
const ratio = SRC_H / DISPLAY_H;  // 400 / 256 ≈ 1.5625

for (let dy = 0; dy < DISPLAY_H; dy++) {
  const srcY0 = dy * ratio;
  const srcY1 = (dy + 1) * ratio;
  // ...
  for (let sy = y0; sy < y1; sy++) {
    let w = 1;
    if (sy < srcY0) w -= srcY0 - sy;       // fractional top edge
    if (sy + 1 > srcY1) w -= (sy + 1 - srcY1); // fractional bottom edge
    a += src[si + 3] * w;
    weight += w;
  }
  rgba[di + 3] = Math.round(a / weight);
}
```

Each output pixel covers ~1.56 source rows. Rows that are partially covered
contribute proportionally to the final alpha. This preserves the smooth
anti-aliased edges of the font.

```
 Source rows (400-line):   ... | row 102 | row 103 | row 104 | ...
 Output pixel 65 covers:        ████████   ████████   ███░░░░░
                                 (full)     (full)     (partial: 0.56)
 Weighted average produces smooth alpha transitions
```

---

## Pre-Rendering at Init Time

All 7 text screens are rendered to GPU textures during `init()`:

```javascript
const font = parseFont();
textTextures = TEXT_SCREENS.map((screen) => {
  const tex = gl.createTexture();
  const rgba = renderTextScreen(screen, font);
  uploadTexture(gl, tex, DISPLAY_W, DISPLAY_H, rgba);
  return tex;
});
```

This means **zero text rendering happens per frame** — the render loop just
selects which pre-built texture to display. The tradeoff is 7 × 320 × 256 × 4
= ~2.3 MB of VRAM for text textures, which is negligible on modern GPUs.

---

## Key Takeaways

- **Variable-width bitmap fonts** are parsed by scanning for blank-column
  boundaries — no metadata file needed
- **4-level anti-aliasing** (0/85/170/255 alpha) gives text smooth edges even
  at the low 320 px resolution
- **Area downsampling** with fractional weights preserves font quality when
  scaling between non-integer ratios
- **Pre-rendering** text to textures at init time eliminates per-frame cost
  and simplifies the render loop to a texture bind

---

**Next:** [Layer 3 — Palette Fading](03-palette-fading.md) · **Back to:** [Overview](00-overview.md)
