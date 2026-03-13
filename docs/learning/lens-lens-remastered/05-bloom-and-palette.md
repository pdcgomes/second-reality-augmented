# Layer 5 — Bloom and Palette

**Source:** `src/effects/lens/effect.remastered.js` (lines 267–326, bloom/composite shaders; lines 390–414, params; lines 569–637, render passes 2–3)
**Concepts:** bloom extraction, Gaussian blur, colour grading, beat reactivity, procedural nebula, palette themes

---

## What This Layer Covers

The crystal ball is rendered, but the image still looks flat. This layer adds
the finishing polish:

- How the classic's **palette-based transparency** compares to GPU compositing
- How the **procedural nebula** background works (fractal Brownian motion)
- How **colour grading** (hue shift, saturation, brightness) transforms the
  KOE image
- How the **dual-tier bloom pipeline** makes bright areas glow
- How **beat reactivity** pulses the scene in sync with the music

---

## Classic: Palette-Based Compositing

The classic has no post-processing. The 256-colour VGA palette does all the
visual work:

```
Index   0– 63:  Base background colours
Index  64–127:  Background + lens body tint (additive)
Index 128–191:  Background + lens reflection tint
Index 192–255:  Background + lens highlight tint
```

The three tint colours are stored in the EX0 header. Mixing is done by OR-
masking the palette index — a single CPU instruction per pixel. There is no
bloom, no colour grading, no beat reactivity. The look is entirely determined
by the three tint RGB values baked into EX0.

---

## Remastered: The Rendering Pipeline

The remastered uses a multi-pass rendering pipeline with framebuffer objects
(FBOs):

```
  Pass 1: Scene rendering
  ┌─────────────────────────────────┐
  │  Background: KOE + nebula       │  → sceneFBO (full resolution)
  │  Lens: refraction + lighting    │
  │  Eye glow                       │
  └─────────────────────────────────┘
            │
            ▼
  Pass 2: Bloom pipeline
  ┌─────────────────────────────────┐
  │  Extract bright pixels          │  → bloomFBO1 (half-res)
  │  3× Gaussian blur (H+V)        │  → tight bloom
  │  Downsample to quarter-res      │  → bloomWideFBO1
  │  3× Gaussian blur (H+V)        │  → wide bloom
  └─────────────────────────────────┘
            │
            ▼
  Pass 3: Composite
  ┌─────────────────────────────────┐
  │  scene + tight bloom + wide     │  → screen
  │  + beat pulse + scanlines       │
  └─────────────────────────────────┘
```

---

## Procedural Nebula Background

Behind the KOE image, a slowly-moving nebula fills the dark areas. It is built
from **fractal Brownian motion** (FBM) — layered noise at decreasing scales:

```glsl
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;     // zoom in and rotate
    a *= 0.5;              // halve the contribution
  }
  return v;
}
```

Three FBM samples at different offsets produce purple, teal, and pink tones:

```glsl
vec3 bgCol1 = vec3(0.05, 0.02, 0.15);   // deep purple
vec3 bgCol2 = vec3(0.02, 0.08, 0.18);   // dark teal
vec3 bgCol3 = vec3(0.12, 0.03, 0.08);   // dark magenta
vec3 bg = bgCol1 * n1 + bgCol2 * n2 + bgCol3 * n3;
```

The nebula is blended with the KOE image using a **luma key** — the brighter
the KOE image, the more it shows through; dark areas show the nebula:

```glsl
float imgLuma = dot(img, vec3(0.299, 0.587, 0.114));
vec3 color = mix(bg, img, clamp(imgLuma * 4.0 + 0.15, 0.0, 1.0));
```

---

## Colour Grading

The KOE background image receives three adjustments, all controlled by editor
parameters:

### Hue Shift

Rotates all colours around the colour wheel. Implemented as a 3×3 matrix
rotation in YIQ-like colour space:

```glsl
vec3 hueRotate(vec3 color, float angle) {
  // ... Yuma-preserving rotation matrix ...
  return clamp(rot * color, 0.0, 1.0);
}
```

### Saturation Boost

Mixes between the greyscale (luma) version and the original colour:

```glsl
vec3 boostSaturation(vec3 color, float amount) {
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(luma), color, 1.0 + amount), 0.0, 1.0);
}
```

At `amount = 0`, colours are unchanged. Positive values increase saturation.
Negative values desaturate toward greyscale.

### Brightness

A simple multiplier applied after hue and saturation:

```glsl
return img * uBrightness;
```

These three controls let the editor user dial in the mood — warm tones, cool
tones, high contrast, muted pastels — all from the same source image.

---

## Bloom: Making Bright Things Glow

Bloom simulates how bright light sources bleed in a camera lens. The pipeline
has two tiers:

### Tier 1: Tight Bloom (half resolution)

**Extract** — only keep pixels above a brightness threshold:

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

The `smoothstep` transition avoids a hard cutoff — pixels near the threshold
partially contribute, preventing a visible edge.

**Blur** — 3 iterations of a separable 9-tap Gaussian, alternating horizontal
and vertical:

```glsl
// 9-tap kernel weights (sum ≈ 1.0):
//   0.0162  0.0540  0.1216  0.1945  [0.2270]  0.1945  0.1216  0.0540  0.0162
result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
// ... center tap ...
result += texture(uTex, vUV + 4.0 * texel).rgb * 0.0162;
```

Three iterations of H+V blur produce a smooth, wide glow equivalent to a much
larger kernel.

### Tier 2: Wide Bloom (quarter resolution)

The tight bloom result is downsampled to quarter resolution and blurred again.
This produces a softer, wider halo that extends further from bright sources.

```
  Tight bloom: sharp glow close to bright pixels
  Wide bloom:  soft atmospheric haze spreading further out
  Combined:    convincing light bleed at two scales
```

---

## Composite Pass

The final pass combines everything:

```glsl
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.25)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
```

The bloom is **additive** — it brightens the scene. Two separate intensity
controls (tight vs wide) let you balance the glow character.

### Scanlines

A subtle CRT scanline effect is applied:

```glsl
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * PI);
color *= scanline;
```

This creates alternating bright/dark horizontal lines, mimicking the look of a
CRT monitor. At the default `0.08` strength, it is barely perceptible but adds
a retro texture to the image.

---

## Beat Reactivity

Three elements pulse in sync with the music:

| Element | Formula | Visual result |
|---------|---------|---------------|
| Eye glow | `glow *= 1 + beatPulse * 1.5` | Eyes flare brighter on beat |
| Nebula background | `bg *= 1 + beatPulse * 0.3` | Background brightens subtly |
| Bloom intensity | `tight * (bloomStr + beatPulse * 0.25)` | Glow halo flares on beat |

The beat pulse curve is:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
```

When `uBeat` is near 0 (start of beat), `1 - uBeat ≈ 1`, so `beatPulse` is
at maximum. As `uBeat` approaches 1.0 (end of beat), `beatPulse → 0`. The
`pow(..., 4.0)` exponent creates a sharp attack that decays quickly:

```
  beatPulse
  1.0 │●
      │ ╲
      │  ╲
      │   ╲
  0.5 │    ╲
      │      ╲
      │        ╲────────────
  0.0 └────────────────────── uBeat
      0.0                 1.0
```

---

## Visual Consistency with LENS_ROTO

The KOE background, nebula, eye glow, colour grading, and bloom pipeline are
shared with the LENS_ROTO remastered effect. All parameter keys and defaults
match exactly, so transitioning from LENS_ROTO to LENS_LENS in the demo is
visually seamless — the background does not change, only the crystal ball
appears.

---

## FBO Allocation

The render pipeline allocates 5 framebuffer objects:

| FBO | Resolution | Purpose |
|-----|-----------|---------|
| `sceneFBO` | Full | Scene rendering target |
| `bloomFBO1` | Half | Bloom extract + blur ping |
| `bloomFBO2` | Half | Blur pong |
| `bloomWideFBO1` | Quarter | Wide bloom ping |
| `bloomWideFBO2` | Quarter | Wide bloom pong |

All FBOs are recreated when the canvas resizes:

```javascript
if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, sceneFBO);
  // ... delete all, recreate at new size ...
  fboW = sw; fboH = sh;
}
```

---

## Key Takeaways

- The classic used **palette-based transparency** (OR masking into pre-mixed
  colour blocks) — the remastered uses **per-pixel GPU compositing**
- The **procedural nebula** fills dark areas of the KOE image with animated
  noise, using FBM at three colour offsets
- **Colour grading** (hue rotation, saturation boost, brightness) transforms
  the mood of the source image via editor-tunable parameters
- **Dual-tier bloom** at half and quarter resolution creates both tight glow
  and soft atmospheric haze
- **Beat reactivity** uses `pow(1 - beat, 4)` for a sharp-attack, quick-decay
  pulse that drives eye glow, nebula brightness, and bloom intensity

---

**Previous:** [Layer 4 — GPU Displacement](04-gpu-displacement.md) · **Next:** [Layer 6 — Learning Path](06-learning-path.md)
