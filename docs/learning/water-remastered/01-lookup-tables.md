# Layer 1 — Position Lookup Tables

**Source:** `src/effects/water/effect.js` lines 202–224, `src/effects/water/data.js`
**Concepts:** pre-computed displacement maps, indexed-colour framebuffers, offline 3D rendering

---

## What This Layer Covers

- How **position lookup tables** (POS tables) remap source pixels to screen
  positions, creating the illusion of chrome sphere reflections
- The **binary format** of the WAT1/WAT2/WAT3 data and how the `scr()` function
  decodes it at runtime
- Why this baked-displacement approach was the **only feasible technique** for
  real-time chrome reflections on a 1993 CPU

---

## The Core Idea

The WATER effect shows what appears to be three chrome spheres reflecting a
scrolling sword image against a mountain background. In reality, there are no
spheres at runtime — the "3D" appearance is entirely faked using **pre-computed
position lookup tables**.

An offline tool (run once, before the demo shipped) raytraced three chrome
spheres and recorded, for every visible pixel, which source pixel it should
display. These mappings were saved as binary files: `WAT1`, `WAT2`, `WAT3`.

```
   Source pixel grid              Screen (320×200)
   (158×34 flat buffer)           after POS table remap

   ┌─────────────────┐            ┌─────────────────────┐
   │ A B C D E F G H │            │                     │
   │ I J K L M N O P │  ──WAT──> │    C   A            │
   │ Q R S T U V W X │            │  F   B   L   H     │
   │ ...              │            │    E   K   G       │
   └─────────────────┘            │  J   D   M   P     │
                                  │    Q   S   R       │
   Each source pixel              │                     │
   may map to multiple            └─────────────────────┘
   screen positions               Pixels land on curved
                                  sphere-shaped regions
```

The result looks like a chrome sphere because the pixel redistribution follows
the same pattern a raytracer would produce — the offline tool *was* a raytracer.

---

## The Data Format

Each POS table (WAT1, WAT2, WAT3) is a flat byte stream decoded from base64.
The format is a sequence of **per-source-pixel records**:

```
For each source pixel (0 to VIEW_W × VIEW_H - 1):
  ┌────────────────────────────────────────┐
  │  count: uint16_le                      │  How many screen positions
  │                                        │  this source pixel maps to
  ├────────────────────────────────────────┤
  │  dest[0]: uint16_le                    │  First screen offset (0–63999)
  │  dest[1]: uint16_le                    │  Second screen offset
  │  ...                                   │
  │  dest[count-1]: uint16_le              │  Last screen offset
  └────────────────────────────────────────┘
```

A count of 0 means the source pixel is not visible in this pass (it falls
outside the sphere or is occluded). A count greater than 1 means the source
pixel maps to multiple screen locations — this happens at the sphere's edges
where adjacent screen pixels sample from the same reflected source region.

---

## The `scr()` Function

The `scr()` function applies one POS table pass to the framebuffer:

```javascript
function scr(pass, fbuf, fb) {
  const pos = posData[pass];       // WAT1, WAT2, or WAT3
  let posIdx = 0, fontIdx = 0;
  const totalPixels = VIEW_W * VIEW_H;

  for (let dx = 0; dx < totalPixels; dx++) {
    // Read how many screen positions this source pixel maps to
    const count = pos[posIdx] | (pos[posIdx + 1] << 8);
    posIdx += 2;

    if (count !== 0) {
      for (let i = 0; i < count; i++) {
        // Read the destination screen offset
        const dest = pos[posIdx] | (pos[posIdx + 1] << 8);
        posIdx += 2;

        if (dest < PIXELS && fontIdx < fbuf.length) {
          let pv = fbuf[fontIdx];
          if (pv === 0) pv = tausta[dest];  // transparent: use background
          fb[dest] = pv;
        }
      }
    }
    fontIdx++;   // advance to next source pixel regardless
  }
}
```

Walking through the logic:

1. **Iterate** over every source pixel in the 158×34 buffer (`fontIdx`)
2. **Read** the 16-bit `count` — how many screen pixels this source maps to
3. For each mapping, **read** the 16-bit destination offset into the 320×200
   screen buffer
4. **Write** the source pixel's palette index to that screen location
5. If the source pixel is zero (transparent), **fall through** to the background

The key insight: `fontIdx` advances by 1 for every source pixel, while `posIdx`
advances by `2 + count × 2` — the pointer jumps through the variable-length
records.

---

## Why Three Tables?

The original demo uses three POS tables (WAT1, WAT2, WAT3) rather than one.
Each table maps the source to a *different subset* of screen pixels. Together,
the three passes cover the full screen. This is the **interlaced rendering**
technique covered in [Layer 2](02-interlaced-rendering.md).

```
  WAT1 covers pixels at offsets ≡ 0 (mod 3) roughly
  WAT2 covers pixels at offsets ≡ 1 (mod 3) roughly
  WAT3 covers pixels at offsets ≡ 2 (mod 3) roughly
  ─────────────────────────────────────────────────
  All three together = complete sphere image
```

In the original Pascal/ASM code, only one pass was applied per frame (cycling
WAT1 → WAT2 → WAT3 → WAT1 → …). This meant each screen pixel was only updated
every third frame, creating the characteristic **shimmer** effect. Our classic
implementation applies all three passes each render call for correctness when
scrubbing, but the visual character remains.

---

## Transparency via Palette Index Zero

The WATER effect uses a simple transparency convention: **palette index 0 is
transparent**. When the source buffer (`fbuf`) contains a zero at some position,
the `scr()` function substitutes the background pixel (`tausta[dest]`) instead:

```
  fbuf[fontIdx] == 0?
       │
       ├── YES → fb[dest] = tausta[dest]   (show background)
       │
       └── NO  → fb[dest] = fbuf[fontIdx]  (show sword pixel)
```

This is how the chrome sword floats over the mountain background — zero pixels
in the sword font are "holes" that reveal the scene behind.

---

## Why Lookup Tables?

In 1993, real-time raytracing was impossible on consumer hardware. A 386/486 CPU
at 33–66 MHz could push pixels, but computing ray-sphere intersections,
reflection vectors, and texture lookups for 64,000 pixels at 70 fps was out of
reach.

The **lookup table** approach is a classic demoscene trick:

1. **Offline**: Run an expensive raytracer once. For each source texel, record
   which screen pixels it maps to. Save to a file.
2. **Runtime**: For each source texel, read its pre-baked screen positions and
   copy the pixel value there. This is just memory copies — blazingly fast.

The tradeoff is **memory for computation**. Each POS table is ~24 KB (tiny by
modern standards, significant in 1993 when total RAM was 4–8 MB). Three tables
for three interlaced passes cost ~72 KB total.

```
  Technique comparison (1993 perspective):

  Real-time raytracing          POS lookup tables
  ─────────────────────         ──────────────────
  ~100 cycles per pixel         ~4 cycles per pixel
  320×200 = 64K pixels          64K memory reads
  = 6.4M cycles/frame           = 256K cycles/frame
  At 33 MHz → 5 fps             At 33 MHz → ~130 fps ✓
  Not feasible                  Feasible at 70 fps
```

This is why the original `ROUTINES.ASM` was written in hand-optimised x86
assembly — even with lookup tables, every cycle counted.

---

## The Source Buffer

The POS tables map from a flat 158×34 buffer. But the sword image is 400×34
pixels. How does the scrolling work?

The 158×34 buffer is a **sliding window** over the sword font. Each animation
step shifts the window left by one column and inserts a new column from the
sword. The POS tables always read from this fixed-size window — they don't know
the sword is scrolling. The scrolling happens *before* the POS remap, not
during it.

```
  Sword font: 400 columns
  ┌──────────────────────────────────────────────────────┐
  │  col 0   col 1   ...   col 390   ...   col 399      │
  └──────────────────────────────────────────────────────┘
                        ▲
                 ┌──────┴──────┐
                 │ 158-col     │  ← sliding window (fbuf)
                 │ view buffer │
                 └─────────────┘
                        │
                        ▼
                   POS table remap
                        │
                        ▼
                  320×200 screen
```

This sliding-window mechanism is covered in detail in
[Layer 3: Image Compositing](03-image-compositing.md).

---

**Next:** [Layer 2 — Interlaced Rendering](02-interlaced-rendering.md)
