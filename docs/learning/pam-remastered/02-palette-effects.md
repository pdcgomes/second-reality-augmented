# Layer 2 — Palette Effects

**Source:** `src/effects/pam/effect.remastered.js` lines 29–35 (PALETTE_FADE), 840–854 (render timing); `src/effects/pam/effect.js` lines 21–27 (classic), 114–125 (buildFadedPalette)
**Concepts:** Palette fading, white flash curves, VGA colour manipulation, timed transitions

---

## What This Layer Covers

- How the **PALETTE_FADE** array creates a dramatic white-flash envelope around the explosion
- How the classic builds **faded palettes** by interpolating every colour toward white
- How the remastered converts the same fade curve into a **shader uniform** (one float instead of 256 colours)
- Why the fade curve is **asymmetric** — fast fade-in, long hold, slow fade-out
- How the fade timing maps to the **emotional arc** of the explosion

---

## The PALETTE_FADE Curve

Both the classic and remastered variants share the same hand-authored fade
curve. It maps each animation frame to a **white-fade level** (0 = normal
colours, 63 = full white):

```javascript
// effect.remastered.js, lines 29–35
const PALETTE_FADE = [
  63, 32, 16, 8, 4, 2, 1, 0, 0, 0,     // frames 0-9
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // frames 10-19
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,         // frames 20-29
  1, 2, 4, 6, 9, 14, 20, 28, 37, 46,    // frames 30-39
  56, 63, 63, 63, ...                     // frames 40+
];
```

### Visualising the curve

```
Fade
Level
  63 |*                                              *  *  *
     |                                           *
  46 |                                        *
     |                                     *
  28 |                                  *
     |                               *
  14 |  *                         *
   8 |     *                   *
   4 |        *             *
   2 |           *       *
   0 |              * * * * * * * * * * * * * * * * * *
     +--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+--+-→
      0     5    10    15    20    25    30    35    40
                         Animation Frame
```

### Three phases

| Phase | Frames | Duration | Fade direction | What you see |
|-------|--------|----------|----------------|--------------|
| **Flash-in** | 0–6 | 0.40 s | 63 → 0 (white → normal) | Blinding white flash rapidly clears to reveal the explosion |
| **Hold** | 7–29 | 1.31 s | 0 (normal) | Full-colour explosion plays at peak intensity |
| **Fade-out** | 30–40+ | 0.63 s | 0 → 63 (normal → white) | Colours wash out to white for the transition to BEGLOGO |

The **asymmetry** is deliberate: the flash-in is exponentially fast (63 → 32
→ 16 → 8 → 4 → 2 → 1 → 0 — halving each frame), giving a sharp retinal
shock. The fade-out is more gradual (roughly quadratic), letting the eye
gently transition to the next scene.

---

## Classic: Per-Pixel Palette Interpolation

In the classic variant, the fade level directly manipulates the **256-entry
colour palette** before any pixels are drawn. Every palette colour is
interpolated toward white:

```javascript
// effect.js, lines 114–125
function buildFadedPalette(fadeLevel) {
  const pal = new Uint32Array(256);
  const k = 255 / 63;
  const fl = fadeLevel / 63;       // normalise to 0.0–1.0
  for (let i = 0; i < 256; i++) {
    const r = Math.round(clamp(fl * 63 + (1 - fl) * PALETTE[i*3],   0, 63) * k);
    const g = Math.round(clamp(fl * 63 + (1 - fl) * PALETTE[i*3+1], 0, 63) * k);
    const b = Math.round(clamp(fl * 63 + (1 - fl) * PALETTE[i*3+2], 0, 63) * k);
    pal[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return pal;
}
```

### The interpolation formula

For each colour channel:

```
result = fadeLevel/63 × 63 + (1 - fadeLevel/63) × original
       = lerp(original, 63, fadeLevel/63)
```

When `fadeLevel = 0`: result = original (normal colours).
When `fadeLevel = 63`: result = 63 (full white in VGA 6-bit space).
In between: a proportional blend toward white.

### Why manipulate the palette instead of the pixels?

This is a VGA trick from 1993. Changing 256 palette entries is **far cheaper**
than modifying 64,000 pixels (320 × 200). The hardware applies the new palette
instantly on the next refresh. This is how most DOS-era fades worked — palette
manipulation, not per-pixel blending.

```
                 Classic pipeline
     ┌──────────────────────────────────┐
     │  animFrame → PALETTE_FADE[idx]   │
     │         → fadeLevel              │
     │         → buildFadedPalette()    │  256 entries
     │         → palette32[]            │
     │                                  │
     │  bakedFrames[videoIdx]           │  64,000 indices
     │         + palette32[]            │
     │         → 64,000 RGBA pixels     │
     │         → texSubImage2D()        │
     └──────────────────────────────────┘
```

---

## Remastered: A Single Shader Uniform

The remastered variant does not build faded palettes. Instead, it reads the
fade curve and sends a single **normalised float** to the GPU:

```javascript
// effect.remastered.js, lines 841–843
const animFrame = Math.floor(t * FRAME_RATE);
const fadeIdx = clamp(animFrame, 0, PALETTE_FADE.length - 1);
const whiteFlash = PALETTE_FADE[fadeIdx] / 63;   // 0.0 – 1.0
```

The scene shader applies the flash as the very last operation — a simple
**linear interpolation** between the computed colour and pure white:

```glsl
// SCENE_FRAG, line 542
color = mix(color, vec3(1.0), uWhiteFlash);
```

`mix(a, b, t)` in GLSL is `a × (1-t) + b × t`. When `uWhiteFlash = 0.0`,
the pixel is unchanged. When `uWhiteFlash = 1.0`, the pixel is pure white.

### Why is this better?

The classic computes the fade **per palette entry** (256 iterations), then
applies it **per pixel** via lookup (64,000 lookups). The remastered computes
the fade **once** as a uniform, then applies it **per pixel** with a single
multiply-add in the shader. On a GPU running millions of pixels in parallel,
this is both simpler and faster.

```
              Remastered pipeline
     ┌──────────────────────────────────┐
     │  animFrame → PALETTE_FADE[idx]   │
     │         → whiteFlash (float)     │  1 value
     │         → gl.uniform1f()         │
     │                                  │
     │  SCENE_FRAG:                     │
     │    color = mix(color, white,     │  per pixel
     │                uWhiteFlash);     │  (GPU parallel)
     └──────────────────────────────────┘
```

---

## Core Frame Alpha Ramp

Beyond the white flash, the remastered also fades in the **core frame overlay**
(the original explosion shape used as ambient glow) over the first few frames:

```javascript
// effect.remastered.js, line 854
const coreAlpha = animFrame < 1 ? 0.0 : Math.min((animFrame - 1) / 3, 1.0);
```

| Frame | coreAlpha | Visual |
|-------|-----------|--------|
| 0 | 0.0 | Core frame invisible (white flash dominates) |
| 1 | 0.0 | Just starting to appear |
| 2 | 0.33 | Faint glow emerging |
| 3 | 0.67 | Becoming visible |
| 4+ | 1.0 | Full ambient glow contribution |

This prevents the original frame data from fighting with the white flash
during the initial blinding burst. The core texture fades in only after the
white has cleared enough for it to be visible.

---

## Emotional Arc

The PALETTE_FADE curve is not just a technical detail — it shapes the
**emotional experience** of the explosion:

```
Time:    0.0s        0.4s                    1.7s           2.3s
         |           |                       |              |
Phase:   FLASH       REVEAL                  FADE           WHITE
         Shock.      The explosion erupts    Colours drain. Transition
         Blinding    at full intensity.      The energy     to next
         white       Peak drama.             dissipates.    scene.
         light.
```

The exponential decay of the flash-in (halving each frame: 63, 32, 16, 8...)
mimics how a real explosion flash works — the initial burst is overwhelmingly
bright and fades rapidly. The slower fade-out suggests the lingering afterglow
of cooling debris.

This curve was hand-authored by the original demo coders, not computed from
any formula. It is a piece of **creative timing**, tuned by eye to feel right
with the music.

---

**Next:** [Layer 3 — GPU Rendering](03-gpu-rendering.md)
