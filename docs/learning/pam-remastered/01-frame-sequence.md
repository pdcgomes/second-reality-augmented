# Layer 1 — The Frame Sequence

**Source:** `src/effects/pam/data.js`, `src/effects/pam/effect.remastered.js` lines 630–684
**Concepts:** Base64 encoding, RLE decompression, indexed colour, fixed-rate playback

---

## What This Layer Covers

- How a 41-frame explosion animation is **embedded as a Base64 string** inside a JavaScript module
- How the custom **RLE (Run-Length Encoding)** codec packs and unpacks frames
- How frames are decoded into **indexed pixel buffers** (palette indices, not colours)
- How those indices are converted to **RGBA pixels** using a 256-entry colour palette
- How the **17.5 fps playback clock** maps wall-clock seconds to frame numbers
- How the remastered variant uses only **frames 0–6** as a backdrop reference

---

## The Data Pipeline

The original explosion was a FLI file rendered in Autodesk 3D Studio by TRUG.
The SecondReality toolchain converted it through several stages before it
reached the screen:

```
3D Studio → FLI file → VFLI.C → raw frames → ANIM.C → RLE-compressed ANI
```

For this project, the ANI binary was extracted and Base64-encoded into
`data.js`:

```
ANI binary → Base64 string (ANI_B64) → data.js
```

At runtime, the decode pipeline reverses this:

```
ANI_B64 (string)
    |
    v
b64ToUint8()          ← decode Base64 → raw bytes
    |
    v
decodeFrames()        ← RLE decompress → indexed framebuffers
    |
    v
frameToRGBA()         ← palette lookup → RGBA pixels
    |
    v
gl.texImage2D()       ← upload to GPU texture
```

---

## Base64 Decoding

**Base64** is a way to represent arbitrary binary data using only printable
ASCII characters (A–Z, a–z, 0–9, +, /). Every 3 bytes of binary become 4
characters of text. This lets binary data live safely inside a `.js` file.

```javascript
// effect.remastered.js, line 631
function b64ToUint8(b64) {
  const bin = atob(b64);                           // built-in Base64 → binary string
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++)
    a[i] = bin.charCodeAt(i);                      // string → byte array
  return a;
}
```

`atob()` is a browser built-in that decodes Base64 to a binary string. The
loop converts that string to a `Uint8Array` — a typed array where every
element is one byte (0–255). This is the format the RLE decoder expects.

---

## RLE Decompression

The animation uses a **delta-RLE** codec. Each frame is stored as a sequence
of commands that modify a shared framebuffer. Unchanged pixels are skipped
(delta encoding), changed runs are stored as repeat commands.

### The command byte

| Byte value `b` | Meaning |
|-----------------|---------|
| `b > 0`        | **Run**: write `b` pixels of the next byte's colour index |
| `b < 0`        | **Skip**: advance the write pointer by `|b|` pixels (keep previous content) |
| `b == 0`       | **End of frame** |

```javascript
// effect.remastered.js, lines 647–671
function decodeFrames(data, count) {
  const fb = new Uint8Array(W * H);     // persistent framebuffer (320×200)
  const frames = [];
  let ptr = 0;                          // read pointer into data stream

  for (let f = 0; f < count; f++) {
    while ((ptr & 0x0f) !== 0) ptr++;   // align to 16-byte boundary
    if (ptr >= data.length - 1) break;

    let p = 0;                          // write pointer into framebuffer
    while (true) {
      const b = signed8(data, ptr++);   // read command byte (signed)
      if (b > 0) {
        const c = data[ptr++];          // colour index
        for (let i = 0; i < b; i++)
          fb[p++] = c;                  // fill run
      } else if (b < 0) {
        p -= b;                         // skip pixels (b is negative)
      } else {
        break;                          // end of frame
      }
    }
    frames.push(Uint8Array.from(fb));   // snapshot the framebuffer
  }
  return frames;
}
```

### Why `signed8`?

The byte stream is unsigned (0–255), but the codec uses negative values for
skips. `signed8` reinterprets values 128–255 as -128 to -1:

```javascript
// effect.remastered.js, lines 638–641
function signed8(buf, i) {
  const v = buf[i];
  return v < 128 ? v : v - 256;
}
```

### Visualising a frame decode

```
Data stream:   [05] [2A] [FE] [03] [10] [00]
                 |    |    |    |    |    |
                 v    v    v    v    v    v
Command:       b=5  c=42  b=-2 b=3  c=16 b=0
Action:        write 5×   skip 2  write 3× end
               index 42   pixels  index 16

Framebuffer:   [42][42][42][42][42][--][--][16][16][16]
                                    ^   ^
                          kept from previous frame
```

### 16-byte alignment

Each frame starts at a 16-byte-aligned offset in the data stream. The
`while ((ptr & 0x0f) !== 0) ptr++` loop skips padding bytes. This alignment
was a performance optimisation on the original 486 hardware — aligned memory
reads were faster.

---

## Palette Lookup

Each frame is an array of 64,000 bytes (320 × 200), where each byte is a
**palette index** (0–255). The actual colours live in the `PALETTE` array
exported from `data.js`.

The palette stores colours in VGA 6-bit format (0–63 per channel). The
conversion scales to 8-bit (0–255):

```javascript
// effect.remastered.js, lines 673–684
function frameToRGBA(indexedFrame) {
  const k = 255 / 63;                              // scale factor: 6-bit → 8-bit
  const rgba = new Uint8Array(W * H * 4);           // 4 bytes per pixel (RGBA)
  for (let i = 0; i < W * H; i++) {
    const ci = indexedFrame[i];                      // palette index
    rgba[i * 4]     = Math.round(PALETTE[ci * 3] * k);     // R
    rgba[i * 4 + 1] = Math.round(PALETTE[ci * 3 + 1] * k); // G
    rgba[i * 4 + 2] = Math.round(PALETTE[ci * 3 + 2] * k); // B
    rgba[i * 4 + 3] = 255;                                  // A (fully opaque)
  }
  return rgba;
}
```

### The colour flow

```
indexedFrame[i] = 42
                   |
                   v
PALETTE[42*3 + 0] = 14   →  R = round(14 × 4.048) = 57
PALETTE[42*3 + 1] = 6    →  G = round(6  × 4.048) = 24
PALETTE[42*3 + 2] = 3    →  B = round(3  × 4.048) = 12
                               →  A = 255

Pixel = rgba(57, 24, 12, 255)   ← a dark burnt orange
```

---

## 17.5 fps Playback Timing

The original demo ran on a VGA display refreshing at 70 Hz. The explosion
updated every 4th VBlank, giving a frame rate of 70 / 4 = **17.5 fps**:

```javascript
// effect.remastered.js, line 26
const FRAME_RATE = 70 / 4;  // 17.5 fps
```

The renderer converts wall-clock seconds to a frame index:

```javascript
// effect.remastered.js, line 841
const animFrame = Math.floor(t * FRAME_RATE);
```

At 17.5 fps, each frame lasts **57.14 ms** (~4 VBlanks at 70 Hz):

```
t = 0.000s → frame 0     (white flash peak)
t = 0.057s → frame 1     (fading from white)
t = 0.400s → frame 7     (normal colours — explosion visible)
t = 1.714s → frame 30    (fade-out begins)
t = 2.286s → frame 40    (near-white again)
```

### Classic vs Remastered frame usage

The classic plays all 41 frames as a continuous video. The remastered only
uses **frames 0–6** as a reference texture for subtle ambient glow behind the
procedural effects:

```javascript
// effect.remastered.js, line 27
const CORE_FRAMES = 7;  // frames 0-6 used as core shape
```

Frames 0–6 capture the initial explosion flash shape before the smoke fully
develops. The remastered uses them as a soft backdrop that the procedural
lava core and volumetric blast paint over.

---

## Init-Time Baking

At `init()`, all 7 core frames are decoded and converted to RGBA in one pass:

```javascript
// effect.remastered.js, lines 741–743
const aniData = b64ToUint8(ANI_B64);
const indexedFrames = decodeFrames(aniData, CORE_FRAMES);
coreFramesRGBA = indexedFrames.map(frameToRGBA);
```

This means frame decode happens **once** at startup, not every render call.
The raw Base64 and intermediate indexed buffers are garbage-collected. Only
the final RGBA arrays survive in memory for texture uploads.

---

## Frame Upload During Render

Each frame, the renderer picks the current core frame and uploads it to the
GPU only if it changed since the last frame:

```javascript
// effect.remastered.js, lines 846–851
const coreIdx = clamp(animFrame, 0, CORE_FRAMES - 1);
if (coreIdx !== prevCoreIdx) {
  gl.bindTexture(gl.TEXTURE_2D, coreTex);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H,
                   gl.RGBA, gl.UNSIGNED_BYTE, coreFramesRGBA[coreIdx]);
  prevCoreIdx = coreIdx;
}
```

`texSubImage2D` replaces the texture contents without reallocating GPU memory.
The `prevCoreIdx` guard avoids redundant uploads when scrubbing within the
same frame — an important optimisation since texture uploads are expensive.

---

**Next:** [Layer 2 — Palette Effects](02-palette-effects.md)
