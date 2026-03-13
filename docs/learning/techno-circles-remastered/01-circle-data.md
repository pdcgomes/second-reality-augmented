# Layer 1 — Circle Data and EGA Bit Planes

**Source:** `src/effects/technoCircles/effect.remastered.js` lines 59–103, `src/effects/technoCircles/data.js`
**Concepts:** EGA bit planes, quarter-circle mirroring, bitmap textures, R8 GPU upload

---

## What This Layer Covers

The circle patterns in this effect are not computed procedurally — they are
pre-authored bitmaps extracted from the original 1993 demo. Understanding how
they are stored, decoded, and uploaded to the GPU requires knowing how EGA
graphics packed colour data into **bit planes**. This layer explains:

- What bit planes are and why the EGA used them
- How circle1 stores 3 planes (8 colours) and circle2 stores 1 plane (binary)
- How a quarter-circle is mirrored to fill the full 640×400 bitmap
- Why the OR combination of the two circles produces exactly 16 palette indices
- How the remastered uploads decoded bitmaps as R8 GPU textures

---

## What Are Bit Planes?

The **EGA** (Enhanced Graphics Adapter, 1984) stored colour not as one byte
per pixel, but as separate binary layers called **bit planes**. Each plane is
a 1-bit-per-pixel bitmap — every pixel is either 0 or 1 in that plane. The
planes stack together to form a multi-bit colour index:

```
Plane 2:  0 1 1 0 0 1 ...    (bit 2 of colour)
Plane 1:  1 0 1 1 0 0 ...    (bit 1 of colour)
Plane 0:  1 1 0 0 1 0 ...    (bit 0 of colour)
          ─────────────
Colour:   3 5 6 2 1 4 ...    (combine: plane2×4 + plane1×2 + plane0)
```

With 3 planes, each pixel can be one of 2³ = **8 colours** (0–7).
With 4 planes, each pixel can be one of 2⁴ = **16 colours** (0–15).

The data is packed 8 pixels per byte, with the most significant bit
representing the leftmost pixel.

---

## Circle 1: Three Planes, Eight Colours

Circle 1 contains the main concentric ring pattern stored in 3 EGA bit
planes. Each plane covers a 320×200 quarter-circle (top-left quadrant) at
40 bytes per row (320 pixels ÷ 8 bits/byte = 40 bytes).

```javascript
function decodeCircle1(raw) {
  const out = new Uint8Array(640 * 400);
  for (let y = 0; y < 200; y++) {
    for (let xd = 0; xd < 320; xd++) {
      const lineStart = 40 * y * 3;       // 3 planes × 40 bytes/row
      const byteIdx = xd >> 3;            // which byte (xd / 8)
      const bitIdx = 7 - (xd & 7);        // which bit (MSB first)
      let color = 0;
      for (let plane = 0; plane < 3; plane++) {
        color |= ((raw[lineStart + plane * 40 + byteIdx] >> bitIdx) & 1) << plane;
      }
      // ... mirror to all four quadrants ...
    }
  }
  return out;
}
```

The inner loop extracts one bit from each of the 3 planes and combines them
into a 3-bit colour (0–7). The layout in the raw data is interleaved by row:
for each y-row, plane 0 comes first (40 bytes), then plane 1 (40 bytes),
then plane 2 (40 bytes). Total per row: 120 bytes.

The result is a concentric ring pattern where each ring has a different
colour index:

```
          Quarter circle (320×200)
   ┌────────────────────────────────┐
   │  0 0 0 0 0 0 0 0 0 0 0 0 0 0 │  ring 0 (background)
   │  0 0 0 1 1 1 1 1 1 1 0 0 0 0 │  ring 1
   │  0 0 2 2 2 2 2 2 2 2 2 0 0 0 │  ring 2
   │  0 3 3 3 3 3 3 3 3 3 3 3 0 0 │  ring 3
   │  0 3 4 4 4 4 4 4 4 4 3 3 0 0 │  ring 4
   │  0 3 4 5 5 5 5 5 5 4 4 3 0 0 │  ring 5
   │  : : : : : : : : : : : : : : │  ...up to ring 7
   └────────────────────────────────┘
```

---

## Circle 2: One Plane, Binary Mask

Circle 2 uses only 1 bit plane — it is a simple binary mask. Each pixel is
either 0 or 1, and the decoded value is shifted left by 3 to produce either
0 or 8:

```javascript
function decodeCircle2(raw) {
  const out = new Uint8Array(640 * 400);
  for (let y = 0; y < 200; y++) {
    for (let xd = 0; xd < 320; xd++) {
      const lineStart = 40 * y;           // 1 plane × 40 bytes/row
      const byteIdx = xd >> 3;
      const bitIdx = 7 - (xd & 7);
      const color = ((raw[lineStart + byteIdx] >> bitIdx) & 1) << 3;
      // color is 0 or 8
      // ... mirror to all four quadrants ...
    }
  }
  return out;
}
```

The `<< 3` shift is critical: it places the single bit in position 3 of the
colour index. This means circle 2 only ever contributes 0 or 8 — the high
bit of a 4-bit palette index.

---

## Quarter-Circle Mirroring

Both circles store only the **top-left quadrant** (320×200 pixels). The full
640×400 circle is reconstructed by mirroring horizontally and vertically:

```javascript
out[y * 640 + xd] = color;                       // top-left (original)
out[(399 - y) * 640 + xd] = color;               // bottom-left (vertical flip)
out[y * 640 + 320 + (319 - xd)] = color;         // top-right (horizontal flip)
out[(399 - y) * 640 + 320 + (319 - xd)] = color; // bottom-right (both flips)
```

Visually:

```
   ┌──────────┬──────────┐
   │  Q1      │  Q1      │
   │  (orig)  │  (H-flip)│
   │          │          │
   ├──────────┼──────────┤
   │  Q1      │  Q1      │
   │  (V-flip)│ (HV-flip)│
   │          │          │
   └──────────┴──────────┘
         640 × 400
```

This is a classic demo-scene compression trick: storing one quarter of a
symmetric shape and reconstructing the rest. It cuts the data size to 25%
of the full bitmap.

---

## Why OR Produces 16 Palette Indices

The two circles are designed so their bit patterns never overlap:

| Circle | Planes | Bits used | Value range |
|--------|--------|-----------|-------------|
| circle1 | 3 planes | bits 0, 1, 2 | 0–7 |
| circle2 | 1 plane | bit 3 | 0 or 8 |

When combined with bitwise OR:

```
circle1 value:   0 0 0 c₂ c₁ c₀     (bits 0–2, range 0–7)
circle2 value:   0 0 c₃  0  0  0     (bit 3 only, value 0 or 8)
                 ──────────────────
OR result:       0 0 c₃ c₂ c₁ c₀    (bits 0–3, range 0–15)
```

Because circle1 only uses bits 0–2 and circle2 only uses bit 3, their OR is
equivalent to simple addition. The result is a 4-bit colour index (0–15)
that indexes into a 16-entry VGA palette. The lower 8 entries (0–7) come
from circle1 alone; the upper 8 entries (8–15) are where circle2's mask
overlaps circle1's rings.

---

## GPU Upload: R8 Textures

The classic variant works with the decoded arrays directly on the CPU. The
remastered uploads them as **R8 textures** — single-channel 8-bit textures:

```javascript
function uploadCircleTexture(gl, data, w, h) {
  const tex = gl.createTexture();
  const luminance = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) luminance[i] = data[i];
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, luminance);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
```

Key choices:

- **R8 format** — stores a single 8-bit value per texel. The decoded colour
  index (0–15) fits in one byte. In the shader, `texture(uCircle1, uv).r`
  reads this value as a float (0.0–1.0), which is then multiplied by 255 to
  recover the integer index.

- **NEAREST filtering** — preserves the exact pixel-level ring boundaries.
  Bilinear filtering would blur the edges between rings, which would destroy
  the discrete colour index values the OR combination depends on.

- **CLAMP_TO_EDGE** — prevents sampling beyond the bitmap edge from wrapping
  to the opposite side.

---

## Summary

```
data.js (base64)
      │
      ▼
  b64ToUint8()  ──► raw bytes (packed EGA bit planes)
      │
      ├── decodeCircle1() ──► 640×400 Uint8Array (values 0–7)
      │                            │
      │                            ▼
      │                    uploadCircleTexture() ──► R8 GPU texture
      │
      └── decodeCircle2() ──► 640×400 Uint8Array (values 0 or 8)
                                   │
                                   ▼
                           uploadCircleTexture() ──► R8 GPU texture
```

Both textures are created once in `init()` and sampled every frame by the
fragment shader. The shader reads the textures, combines them (OR), and maps
the result through a palette function — all on the GPU.

---

**Next:** [Layer 2 — Circle Interference](02-interference.md)
