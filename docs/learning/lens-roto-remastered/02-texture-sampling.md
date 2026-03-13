# Layer 2 — Texture and Sampling

**Source:** `src/effects/rotozoom/effect.remastered.js`, lines 459–489 (texture build + upload); `src/effects/lens/data.js` (base64 image data)
**Concepts:** indexed colour, VGA palette, base64 asset embedding, texture wrapping, bilinear interpolation, GPU sampler2D

---

## What This Layer Covers

The rotozoom needs an image to rotate. But the original 1993 demo stored its
pictures as **indexed pixels** with a separate **VGA palette** — not RGB. This
layer explains:

- How the KOE demon face is embedded as base64 data in the source code
- How indexed pixels + a 256-colour palette become an RGBA texture
- How 320×200 pixels are remapped to a 256×256 wrapping tile
- How `REPEAT` wrapping makes the texture seamless
- Why the GPU's bilinear filtering produces smoother results than the classic
  integer bitmask

---

## The KOE Picture

The source image is the KOE demon face — a 320×200 pixel painting by Pixel
(Mikko Parviainen) of Future Crew. In 1993 this was stored in a custom binary
format. For this project, the raw bytes are base64-encoded in `data.js`:

```javascript
// src/effects/lens/data.js
export const LENS_PAL_B64 = 'AAAA...';   // 768 bytes → 256 palette entries × 3 (RGB)
export const LENS_PIX_B64 = 'AAAA...';   // 64,000 bytes → 320 × 200 indexed pixels
```

Each pixel in `LENS_PIX_B64` is a single byte (0–255) — an **index** into the
palette, not a colour. The palette `LENS_PAL_B64` maps each index to an RGB
triplet, but in the VGA 6-bit-per-channel format where values range 0–63
instead of 0–255.

---

## Decoding: From Index to RGBA

At init time, both the classic and remastered variants decode the base64 data
and build a usable texture. Here is the remastered path:

```javascript
// effect.remastered.js, init()
const pal  = b64ToUint8(LENS_PAL_B64);     // 768-byte palette
const back = b64ToUint8(LENS_PIX_B64);     // 64,000-byte pixel data
const k = 255 / 63;                        // scale 6-bit (0–63) to 8-bit (0–255)
```

The scaling factor `k = 255/63 ≈ 4.048` converts VGA's 6-bit colour depth to
modern 8-bit. A palette entry of 63 (maximum VGA brightness) becomes 255
(maximum 8-bit brightness).

---

## The 256×256 Remapping

The original 320×200 image does not tile naturally. The code remaps it to a
256×256 texture with aspect correction:

```javascript
const rotpic = new Uint8Array(256 * 256);
for (let x = 0; x < 256; x++) {
  for (let y = 0; y < 256; y++) {
    let a = Math.floor(y * 10 / 11 - 36 / 2);      // aspect correction
    if (a < 0 || a > 199) a = 0;                    // clamp to source bounds
    const srcIdx = (x + 32) + a * 320;              // offset 32px into source
    rotpic[x + y * 256] = srcIdx < back.length ? back[srcIdx] : 0;
  }
}
```

What this does:

| Operation | Purpose |
|-----------|---------|
| `y * 10 / 11` | Compress 256 rows into ~233, matching the 200-row source aspect |
| `- 36 / 2` | Centre vertically (shift up by 18 pixels) |
| `x + 32` | Crop 32 pixels from the left edge, centring the 256-wide window in 320 |
| `a * 320` | Row stride of the source image |

The result is a 256×256 **indexed** tile. Areas outside the source image map to
index 0 (black).

---

## Palette Application

The indexed tile is then converted to RGBA:

```javascript
const rgba = new Uint8Array(256 * 256 * 4);
for (let i = 0; i < 256 * 256; i++) {
  const ci = rotpic[i];                    // palette index (0–255)
  rgba[i * 4]     = Math.round(pal[ci * 3]     * k);   // R
  rgba[i * 4 + 1] = Math.round(pal[ci * 3 + 1] * k);   // G
  rgba[i * 4 + 2] = Math.round(pal[ci * 3 + 2] * k);   // B
  rgba[i * 4 + 3] = 255;                                // A (fully opaque)
}
```

Each pixel looks up its palette entry, scales from 6-bit to 8-bit, and writes
four bytes (RGBA). The alpha channel is always 255 since the KOE picture has
no transparency.

---

## Texture Upload and Wrapping

The RGBA data is uploaded to the GPU as a 2D texture:

```javascript
koeTexture = gl.createTexture();
gl.bindTexture(gl.TEXTURE_2D, koeTexture);
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0,
              gl.RGBA, gl.UNSIGNED_BYTE, rgba);

gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
```

The **`REPEAT`** wrap mode is critical. When the rotozoom computes a texture
coordinate outside the 0–1 range, the GPU automatically wraps it back:

```
Coordinate:  -0.3  →  wraps to 0.7
Coordinate:   1.5  →  wraps to 0.5
Coordinate:   3.2  →  wraps to 0.2
```

This creates seamless tiling — as the camera zooms out, the demon face
repeats across the screen without any special application logic.

---

## Classic vs GPU: Wrapping Compared

The classic CPU loop wraps coordinates with a bitmask:

```javascript
// Classic: integer bitmask wrapping
rotpic[((v & 0xFF) << 8) | (u & 0xFF)]
```

`& 0xFF` keeps only the lowest 8 bits, which is equivalent to modulo 256 but
faster on 1993-era CPUs. This only works because the texture is exactly 256
pixels wide/tall — a power of two.

The GPU achieves the same result with `gl.REPEAT`:

```glsl
// Remastered: hardware wrapping
vec2 texUV = texCoord / 256.0;          // scale to 0..1 range
vec3 img = texture(uTex, texUV).rgb;    // REPEAT handles wrapping
```

Both approaches produce identical coordinates for integer-aligned samples. But
the GPU version works at **any** resolution and handles non-integer coordinates
gracefully via filtering.

---

## Bilinear Interpolation

The classic uses **nearest-neighbour** sampling. Each pixel snaps to the
closest texel, producing hard, blocky edges when zoomed in:

```
Nearest-neighbour (classic):     Bilinear (remastered):

██░░██░░██░░                     ▓▒░░▒▓▒░░▒▓
██░░██░░██░░                     ▓▒░░▒▓▒░░▒▓
░░██░░██░░██                     ░▒▓▓▒░▒▓▓▒░
░░██░░██░░██                     ░▒▓▓▒░▒▓▓▒░

Sharp pixel boundaries           Smooth gradient between pixels
```

The remastered sets `gl.LINEAR` for both min and mag filters:

```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
```

**Bilinear interpolation** blends the four nearest texels based on how close
the sample point is to each one:

```
Given a sample at position (3.7, 2.3):

  Texel (3,2)───────Texel (4,2)
       │    ·(3.7,2.3)    │
       │                   │
  Texel (3,3)───────Texel (4,3)

  Weight for (3,2) = 0.3 × 0.7 = 0.21
  Weight for (4,2) = 0.7 × 0.7 = 0.49  ← closest, highest weight
  Weight for (3,3) = 0.3 × 0.3 = 0.09
  Weight for (4,3) = 0.7 × 0.3 = 0.21

  Final colour = weighted average of all four texels
```

This happens in hardware on the GPU at zero extra cost — the texture unit
performs bilinear filtering regardless of what the shader computes. The result
is smooth gradients where the classic would show pixelated steps.

---

## Why 256×256?

The choice of 256×256 is not arbitrary:

| Reason | Detail |
|--------|--------|
| **Bitmask wrapping** | `& 0xFF` (classic) wraps to 0–255 in a single instruction |
| **Bit-shift indexing** | `<< 8` multiplies by 256 for row addressing |
| **Power of two** | GPU texture hardware optimises for power-of-two dimensions |
| **Source fit** | 256 pixels fits inside the 320-pixel source with room to centre |

Even though modern GPUs handle non-power-of-two textures fine, the 256×256
size persists from the original design and remains efficient.

---

## Key Takeaways

| Concept | What to remember |
|---------|-----------------|
| **Indexed colour** | One byte per pixel + a palette table → full colour |
| **6-bit VGA palette** | Values 0–63, multiply by 255/63 for 8-bit |
| **256×256 tile** | Cropped and aspect-corrected from the 320×200 source |
| **REPEAT wrapping** | Coordinates outside 0–1 wrap automatically (GPU) or via `& 0xFF` (CPU) |
| **Bilinear filtering** | GPU blends 4 nearest texels for smooth magnification |
| **Base64 embedding** | Image data lives in JavaScript source — no external files to load |

---

**Next:** [Layer 3 — Animation Curves](03-animation-curves.md)
**Previous:** [Layer 1 — The Rotozoom Formula](01-affine-transform.md)
**Back to:** [Overview](00-overview.md)
