# Layer 2 — Displacement Map

**Source:** `src/effects/lens/effect.js` (lines 54–250), `src/effects/lens/data.js`
**Concepts:** displacement mapping, pre-computed lookup tables, palette-based transparency, indexed colour

---

## What This Layer Covers

The classic effect cannot afford per-pixel Snell's law on a 1993 CPU. Instead,
it uses **pre-computed displacement maps** — tables of offsets that tell each
pixel inside the lens where to read the background from. This layer explains:

- How the displacement lookup tables (EX1–EX4) encode the lens distortion
- How the data format stores per-row offset pairs
- How `dorow`, `dorow2`, and `dorow3` apply the displacement
- How **palette-based transparency** fakes glass tinting without alpha blending

Understanding the classic approach makes the GPU remastered version much easier
to appreciate — it solves the same problem with fundamentally different tools.

---

## The Five Data Tables

The lens distortion is defined by five binary blobs embedded in `data.js`:

```
EX0 (215 bytes)    Header: lens dimensions (152×116) + 3 tint colours
EX1 (19 KB)        Central body — consecutive pixel segments with distortion
EX2 (6.8 KB)       Reflections — sparse individual pixels with offsets
EX3 (1.5 KB)       Secondary reflections — same format as EX2
EX4 (6.2 KB)       Edge cleanup — restores background pixels at the perimeter
```

These were pre-computed offline by the original `CALC.C` program. They encode
the optical distortion of a 152×116 pixel sphere — the result of tracing rays
through a glass ball and recording where each lens pixel maps to in the
background.

---

## How a Displacement Map Works

The core idea is simple. For each pixel inside the lens, instead of displaying
the background pixel directly underneath, you display a **different** background
pixel — one that has been "displaced" according to the refraction pattern.

```
  Background image (320×200)
  ┌─────────────────────────────────────┐
  │                                     │
  │         ╭───────╮                   │
  │        ╱ LENS    ╲                  │
  │       │  pixel P  │                 │
  │       │   ↓       │                 │
  │       │  reads ──────→ source pixel │
  │        ╲  from   ╱      (displaced) │
  │         ╰───────╯                   │
  │                                     │
  └─────────────────────────────────────┘

  Pixel P inside the lens does NOT show the background directly
  behind it. Instead, it shows a pixel from a different position —
  offset by the displacement stored in the lookup table.
```

Near the center of the lens, the displacement is small (almost zero — the pixel
shows nearly what is directly behind). Near the edges, the displacement is
large, showing a pixel from far away. This matches the Snell's law physics from
Layer 1.

---

## Data Format: EX1 (dorow — Consecutive Segments)

EX1 encodes the main body of the lens. Each scanline row has:

```
Per row (4 bytes):
  Bytes 0–1: offset into the segment data (uint16)
  Bytes 2–3: pixel count for this row (uint16)

Segment data (at the offset):
  Bytes 0–1: base address offset (signed int16, relative to lens position)
  Then for each pixel:
    Bytes 0–1: source offset (signed int16, relative to base address)
```

The **destination** pixels are consecutive — they form a contiguous horizontal
span. The **source** pixels can come from anywhere in the background, which is
what creates the distortion.

Here is the classic code that reads this format:

```javascript
function dorow(buf, lensPos, curY, mask, fb) {
  const segIdx = u16(buf, curY * 4);
  const nPix   = u16(buf, curY * 4 + 2);
  if (nPix === 0) return;
  const baseAddr = lensPos + s16(buf, segIdx);
  let si = segIdx + 2;
  let dest = baseAddr;
  for (let i = 0; i < nPix; i++) {
    const src = baseAddr + s16(buf, si);
    si += 2;
    if (dest >= 0 && dest < PIXELS && src >= 0 && src < PIXELS) {
      fb[dest] = back[src] | mask;
    }
    dest++;
  }
}
```

For each pixel in the row, `src` and `dest` differ by the displacement offset.
The `| mask` operation is the palette transparency trick (explained below).

---

## Data Format: EX2/EX3 (dorow2 — Sparse Pixels)

EX2 and EX3 encode reflection highlights — individual non-consecutive pixels:

```
Per row (4 bytes):
  Bytes 0–1: offset into the pixel data (uint16)
  Bytes 2–3: pixel count (uint16)

Per pixel (4 bytes):
  Bytes 0–1: destination offset (signed int16, relative to base)
  Bytes 2–3: source offset (signed int16, relative to base)
```

Unlike EX1 where destination pixels are consecutive, here each pixel has an
explicit destination. This is used for sparse reflection highlights that do not
form continuous spans.

---

## Data Format: EX4 (dorow3 — Edge Cleanup)

EX4 restores the original background pixels around the lens perimeter:

```javascript
function dorow3(buf, lensPos, curY, fb) {
  // ...
  for (let i = 0; i < nPix; i++) {
    const src = baseAddr + s16(buf, si);
    si += 2;
    if (src >= 0 && src < PIXELS) {
      fb[src] = back[src];  // restore original background pixel
    }
  }
}
```

This cleans up any stray pixels at the lens boundary where the displacement
might have overwritten background pixels that should remain unchanged.

---

## Vertical Symmetry

The lens is drawn from the center outward, mirroring top and bottom halves:

```
   Row 0 (top) ─────────── mirrored to ─── Row 115 (bottom)
   Row 1       ─────────── mirrored to ─── Row 114
   ...
   Row 57      ─────────── mirrored to ─── Row 58

   Only the top 58 rows are stored in EX1–EX4.
   The bottom half is drawn by reading the same data at mirrored Y positions.
```

```javascript
function drawLens(fb, x0, y0) {
  const ys = Math.floor(LENS_H / 2);     // 58 rows
  const ye = LENS_H - 1;                 // 115
  let u1 = (x0 - lensXS) + (y0 - lensYS) * W;  // top-half screen offset
  let u2 = (x0 - lensXS) + (y0 + lensYS - 1) * W;  // bottom-half

  for (let y = 0; y < ys; y++) {
    // Draw row y for the top half at u1
    dorow(lensEx1, u1, y, 0x40, fb);
    // ... and the mirrored row for the bottom half at u2
    dorow(lensEx1, u2, ye - y, 0x40, fb);
    u1 += W;
    u2 -= W;
  }
}
```

This halves the data size and guarantees perfect vertical symmetry.

---

## Palette-Based Transparency

The classic has no alpha blending — the VGA only supports 256 indexed colours.
Instead, transparency is faked through **palette tricks**:

```
Index   0– 63: Background image colours (original)
Index  64–127: Background + lens tint colour 1 (central body)
Index 128–191: Background + lens tint colour 2 (reflection)
Index 192–255: Background + lens tint colour 3 (bright highlight)
```

The lens layers use the OR masking trick:

```javascript
fb[dest] = back[src] | 0x40;   // maps colour 0–63 → 64–127
fb[dest] = back[src] | 0x80;   // maps colour 0–63 → 128–191
fb[dest] = back[src] | 0xC0;   // maps colour 0–63 → 192–255
```

Each upper block is pre-computed so that index `64 + c` contains the original
colour `c` mixed with the lens tint. The OR operation is a single CPU
instruction — far cheaper than any per-pixel blending calculation.

```javascript
for (let a = 0; a < 64; a++) {
  fullPal[(i * 64 + a) * 3]     = Math.min(lr + basePal[a * 3],     63);
  fullPal[(i * 64 + a) * 3 + 1] = Math.min(lg + basePal[a * 3 + 1], 63);
  fullPal[(i * 64 + a) * 3 + 2] = Math.min(lb + basePal[a * 3 + 2], 63);
}
```

The three tint colours (from EX0) are **additive** — they brighten the
background colour, creating the illusion of light passing through tinted glass.

---

## Fade-In with the fade2 Table

The lens fades in over frames 32–96 using 32 discrete opacity levels:

```javascript
fade2 = new Float64Array(32 * 192 * 3);
for (let x = 0; x < 32; x++) {
  for (let y = 64 * 3; y < 256 * 3; y++) {
    const a = y % (64 * 3);
    fade2[idx++] = fullPal[y] - fullPal[a] * (31 - x) / 31;
  }
}
```

At `x = 0` (fully transparent), the lens palette entries match the background.
At `x = 31` (fully opaque), they show the full tinted colour. The active
palette is updated each frame based on the current fade level:

```javascript
const fadeLevel = Math.max(Math.floor((frame - 32) / 2), 0);
```

This gives roughly 32 steps over 64 frames (about 0.9 seconds at 70 fps).

---

## Key Takeaways

- A **displacement map** redirects each pixel's source lookup, creating
  distortion without per-pixel ray tracing
- The classic stores displacement as **signed 16-bit offset pairs** in a
  compact binary format (EX1–EX4)
- **Palette-based transparency** uses OR masking to index into pre-mixed colour
  blocks — a zero-cost transparency trick on indexed-colour hardware
- The displacement data encodes the **same sphere refraction physics** that the
  remastered computes analytically — just frozen into lookup tables

---

**Previous:** [Layer 1 — Refraction Optics](01-refraction-optics.md) · **Next:** [Layer 3 — Bounce Physics](03-bounce-physics.md)
