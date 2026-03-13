# Layer 2 — Interlaced Rendering

**Source:** `src/effects/water/effect.js` lines 138–190, `src/effects/water/data.js`
**Concepts:** temporal interlacing, screen-space interleaving, shimmer effects, amortised rendering

---

## What This Layer Covers

- Why the classic WATER effect renders in **3 offset passes** instead of one
- How interlacing creates the characteristic **shimmering / watery** metallic look
- The **visual quality vs performance** tradeoff that drove this design decision
- How our recreation handles interlacing differently for **scrubbing support**

---

## The Problem: Too Many Pixels, Too Little Time

The POS lookup tables from [Layer 1](01-lookup-tables.md) map 5,372 source
pixels (158×34) to screen positions. Each source pixel can map to multiple
destinations, so the total number of writes per complete pass is significantly
larger — roughly 20,000–25,000 pixel writes per table.

At 70 fps on a 386/486, doing all three tables every frame would mean
60,000–75,000 pixel writes per frame *just for the sphere reflections*, plus the
background copy. That was tight even in optimised assembly.

The solution: **spread the work across three frames**.

---

## How Interlacing Works

The original demo cycles through the three POS tables one per frame:

```
  Frame 0:  apply WAT1  (updates ~1/3 of sphere pixels)
  Frame 1:  apply WAT2  (updates another ~1/3)
  Frame 2:  apply WAT3  (updates the final ~1/3)
  Frame 3:  apply WAT1  (cycle repeats)
  Frame 4:  apply WAT2
  Frame 5:  apply WAT3
  ...
```

Each table covers a different subset of screen pixels. After three consecutive
frames, every pixel in the sphere region has been updated exactly once.

```
  Screen pixel grid (simplified 6×4):

  Frame N (WAT1)        Frame N+1 (WAT2)      Frame N+2 (WAT3)
  ┌─┬─┬─┬─┬─┬─┐        ┌─┬─┬─┬─┬─┬─┐        ┌─┬─┬─┬─┬─┬─┐
  │█│ │ │█│ │ │        │ │█│ │ │█│ │        │ │ │█│ │ │█│
  ├─┼─┼─┼─┼─┼─┤        ├─┼─┼─┼─┼─┼─┤        ├─┼─┼─┼─┼─┼─┤
  │ │ │█│ │ │█│        │█│ │ │█│ │ │        │ │█│ │ │█│ │
  ├─┼─┼─┼─┼─┼─┤        ├─┼─┼─┼─┼─┼─┤        ├─┼─┼─┼─┼─┼─┤
  │ │█│ │ │█│ │        │ │ │█│ │ │█│        │█│ │ │█│ │ │
  ├─┼─┼─┼─┼─┼─┤        ├─┼─┼─┼─┼─┼─┤        ├─┼─┼─┼─┼─┼─┤
  │█│ │ │█│ │ │        │ │█│ │ │█│ │        │ │ │█│ │ │█│
  └─┴─┴─┴─┴─┴─┘        └─┴─┴─┴─┴─┴─┘        └─┴─┴─┴─┴─┴─┘
  █ = pixels updated     █ = pixels updated     █ = pixels updated
      this frame              this frame              this frame
```

---

## The Shimmer Effect

Interlacing was a performance optimisation, but it had a beautiful side effect:
**temporal shimmer**.

Because each pixel is only refreshed every third frame, and the sword image is
scrolling underneath, adjacent pixels on screen can briefly show content from
different moments in the scroll animation. The source image has shifted by one
column between WAT1 and WAT2, and another column between WAT2 and WAT3.

```
  Timeline of a single screen pixel:

  Frame 0:  WAT1 writes sword column 42 here
  Frame 1:  (not updated — still shows column 42)
  Frame 2:  (not updated — still shows column 42)
  Frame 3:  WAT1 writes sword column 43 here    ← 1-step lag
  Frame 4:  (not updated)
  Frame 5:  (not updated)
  Frame 6:  WAT1 writes sword column 44 here

  Meanwhile, a neighbour pixel updated by WAT2:

  Frame 0:  (not updated — shows stale data)
  Frame 1:  WAT2 writes sword column 42 here
  Frame 2:  (not updated)
  Frame 3:  (not updated — still shows column 42)
  Frame 4:  WAT2 writes sword column 43 here    ← different phase
  ...
```

The result: pixels across the sphere surface are slightly out of phase with each
other. This creates a **rippling, watery shimmer** — as if the chrome surface
were liquid. It is an *accidental* aesthetic that became a defining visual
characteristic of the effect.

---

## The Performance Budget

Here is the per-frame cost breakdown on a ~33 MHz 486:

```
  Operation                    Cycles     Notes
  ─────────────────────────    ──────     ─────────────────────
  Background copy (64K)        ~256K      memcpy of 64,000 bytes
  One POS table pass           ~100K      ~25K pixel writes × 4 cycles
  Scroll buffer shift          ~22K       shift 5,372 bytes left
  Column insert (33 pixels)    ~200       trivial
  Palette conversion           ~320K      64K pixels × 5 cycles
  VGA VRAM write               ~256K      64K × 4 cycles (slow bus)
  ─────────────────────────    ──────
  Total per frame              ~954K      ~29 cycles per pixel

  At 33 MHz: 33M / 954K ≈ 34 fps per core-equivalent
```

With only one POS table per frame instead of three, the rendering budget drops
by ~200K cycles — enough headroom to hit 70 fps with the remaining computation.
Applying all three tables would push it to ~1.15M cycles/frame, leaving almost
no margin.

---

## Our Classic Implementation: All Three Passes

The original demo could get away with one-pass-per-frame because it ran
sequentially — frame N's pixels persisted in VRAM until overwritten. Our
recreation renders from scratch each call (the framebuffer does not persist
between `render()` calls), so we must apply all three POS tables every frame:

```javascript
// Apply all 3 POS passes (original applies one per frame, but since we
// rebuild from scratch each render, applying all 3 gives the correct image)
for (let pass = 0; pass < 3; pass++) {
  scr(pass, fbuf, fb);
}
```

This gives a correct, complete image at any scrub position. The slight shimmer
of the original is lost in the classic variant, but the remastered variant
recreates the watery feel through actual animated water ripples.

---

## Interlacing as a General Technique

The WATER/FOREST approach is a specific instance of a broader technique called
**temporal amortisation** — splitting expensive work across multiple frames:

| Technique | Era | How it works |
|-----------|-----|-------------|
| POS table interlacing | 1993 | 3 pixel-scatter tables, 1 per frame |
| Checkerboard rendering | 2016+ | Render half the pixels, reconstruct the rest |
| Variable rate shading | 2018+ | GPU shades edge regions at full rate, flat areas at 1/4 |
| Temporal super-resolution | 2020+ | DLSS/FSR render at low res, reconstruct with AI |

The core principle is the same: **the human eye tolerates slight temporal
inconsistency if the overall impression is smooth**. The demoscene discovered
this trick decades before it became an industry-standard optimisation.

---

## Why Three Passes (Not Two or Four)?

Three is the sweet spot for this effect:

- **Two passes** would leave each pixel stale for only one frame — less shimmer,
  but also less performance savings. The pixel update pattern would be too
  regular (every-other-pixel), creating visible banding.

- **Four passes** would save more CPU time, but pixels would go 3 frames without
  an update at 70 fps. At 23 fps effective refresh, the human eye would notice
  flicker — especially on CRT monitors where phosphor decay made stale pixels
  visibly dimmer.

- **Three passes** at 70 fps gives an effective per-pixel refresh of ~23 fps —
  fast enough to avoid flicker on a CRT, slow enough to create visible shimmer.
  The triangular interleave pattern avoids horizontal or vertical banding
  artifacts.

---

## Connection to the Remastered Variant

The remastered variant does not use interlacing at all. It renders the full
scene every frame using GPU raymarching. However, it recreates the *feel* of the
classic's shimmer through:

- **Animated water ripples** emanating from each sphere (replacing temporal pixel lag)
- **Fresnel reflections** that vary with viewing angle (replacing the spatial
  inconsistency of interleaved updates)
- **Specular highlights** that pulse with the beat (adding temporal variation)

The classic's accidental beauty is the remastered's intentional design target.

---

**Previous:** [Layer 1 — Position Lookup Tables](01-lookup-tables.md)
**Next:** [Layer 3 — Image Compositing](03-image-compositing.md)
