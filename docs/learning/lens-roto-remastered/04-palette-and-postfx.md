# Layer 4 — Palette and Post-Processing

**Source:** `src/effects/rotozoom/effect.remastered.js`, lines 32–292 (shaders); lines 537–645 (render passes)
**Concepts:** white fade, colour grading, Blinn-Phong specular, Fresnel rim, procedural background, eye glow, dual-tier bloom, beat reactivity, scanlines

---

## What This Layer Covers

The remastered variant adds multiple visual layers on top of the basic rotozoom.
This layer explains the full rendering pipeline — every pass from the initial
scene shader through to the final composite. You will learn:

- How the classic white-fade palette effect is reproduced in the shader
- How colour grading (hue shift, saturation, brightness) works
- How a virtual hemisphere creates the "lens" specular and Fresnel material
- How the procedural nebula background fills dark areas
- How the demon's eyes glow with beat-reactive intensity
- How the dual-tier bloom pipeline creates the final cinematic look

---

## The White Fade

The classic variant fades from white at the start and to white at the end by
interpolating every palette entry toward `(63, 63, 63)`:

```javascript
// Classic: CPU palette fade
const r = Math.round(clamp(baseR + (63 - baseR) * fadeLevel, 0, 63) * k);
```

The remastered does this in a single GLSL `mix`:

```glsl
// SCENE_FRAG, line 227
color = mix(color, vec3(1.0), uFade);
```

When `uFade = 0`, the colour is unchanged. When `uFade = 1`, the output is
pure white. The `uFade` uniform comes from the pre-computed `animFade` array
(see Layer 3).

---

## Colour Grading

The remastered adds three colour controls that the classic lacked:

### Hue Rotation

```glsl
if (uHueShift != 0.0) {
  img = hueRotate(img, uHueShift * TAU / 360.0);
}
```

The `hueRotate()` function applies a 3×3 matrix that rotates colours around
the luminance axis. This preserves perceived brightness while shifting the
entire colour palette. Setting `hueShift = 180` inverts warm/cool tones.

### Saturation Boost

```glsl
if (uSaturationBoost != 0.0) {
  img = boostSaturation(img, uSaturationBoost);
}
```

This blends each pixel between its greyscale luminance and its original colour:

```glsl
float luma = dot(color, vec3(0.299, 0.587, 0.114));
return mix(vec3(luma), color, 1.0 + amount);
```

Positive values increase colour intensity. Negative values desaturate toward
greyscale. The `0.299, 0.587, 0.114` weights are the standard ITU-R BT.601
luminance coefficients.

### Brightness

```glsl
img *= uBrightness;
```

A simple linear multiplier. The default is 0.77, slightly dimming the image
to leave headroom for the lens material highlights to stand out.

---

## The Lens Material

The most visually distinctive remastered addition is the **lens material** —
the rotozoom image appears projected onto a curved glass surface. This is
achieved by treating the screen as a virtual hemisphere.

### Surface Normal Derivation

```glsl
vec2 sc = vUV * 2.0 - 1.0;        // map 0..1 to -1..+1
float r2 = dot(sc, sc);            // squared distance from centre
float sphereMask = smoothstep(1.0, 0.85, sqrt(r2));

if (r2 < 1.0) {
  float nz = sqrt(1.0 - r2);      // z-component of unit sphere surface
  vec3 N = normalize(vec3(sc, nz));
```

This constructs a normal vector at each pixel as if a half-sphere were sitting
on the screen. The `sphereMask` provides a smooth edge falloff.

```
    Screen space           Virtual hemisphere
   ┌──────────────┐
   │    ╭────╮    │        Side view:
   │  ╱        ╲  │            ╭───╮
   │ │    N↑    │ │           ╱  ↑N ╲
   │  ╲   │   ╱  │          ╱   │   ╲
   │    ╰──┼──╯  │         ───────────── screen
   └───────┼──────┘
           centre
```

At the centre, `N = (0, 0, 1)` — pointing straight at the viewer. At the
edges, `N` tilts outward — creating rim effects.

### Blinn-Phong Specular

```glsl
vec3 V = vec3(0.0, 0.0, 1.0);                // viewer direction
vec3 L = normalize(vec3(0.3, 0.5, 1.0));     // light from upper-right
vec3 halfV = normalize(L + V);               // halfway vector

float NdH = max(dot(N, halfV), 0.0);
float spec = pow(NdH, uSpecularPower) * uSpecularIntensity;
color += vec3(1.0, 0.98, 0.95) * spec * sphereMask;
```

The **Blinn-Phong** model computes the halfway vector between the light and
viewer, then measures how closely the surface normal aligns with it. The
`pow()` controls sharpness — higher power means a tighter, more focused
highlight. The default power of 57 produces a small, bright glint.

### Fresnel Rim Glow

```glsl
float NdV = max(dot(N, V), 0.0);
float fresnel = pow(1.0 - NdV, uFresnelExponent) * uFresnelIntensity;
color += vec3(0.4, 0.5, 0.7) * fresnel * sphereMask;
```

The **Fresnel effect** makes surfaces brighter at glancing angles. Where the
normal points toward the camera (`NdV ≈ 1`), Fresnel is near zero. At the
edges (`NdV ≈ 0`), Fresnel peaks — creating a blue-tinted rim glow:

```
  Fresnel intensity across the sphere:

     low   low   low
       ╲   │   ╱
  HIGH ──╲ │ ╱── HIGH       ← bright rim at edges
          ╲│╱
     ──────●──────           ← dark centre (NdV ≈ 1)
          ╱│╲
  HIGH ──╱ │ ╲── HIGH
       ╱   │   ╲
     low   low   low
```

### Environment Reflection

```glsl
vec3 R = reflect(-V, N);
float envNoise = fbm(R.xy * 2.0 + uTime * 0.1);
vec3 envColor = mix(vec3(0.1, 0.15, 0.3), vec3(0.3, 0.2, 0.4), envNoise);
color = mix(color, envColor, uReflectivity * sphereMask * (1.0 - NdV));
```

The reflection vector is used to sample a procedural noise "environment map".
This adds subtle shifting reflections that vary with the surface curvature,
strongest at the edges (where `1 - NdV` is large).

---

## Procedural Nebula Background

The classic effect has a black background. The remastered fills dark areas with
a slowly drifting procedural nebula:

```glsl
vec2 bgP = vUV * 3.0 + vec2(t * 0.15, t * 0.1);
float n1 = fbm(bgP);
float n2 = fbm(bgP + vec2(5.2, 1.3) + t * 0.08);
float n3 = fbm(bgP * 1.5 + vec2(t * 0.05));

vec3 bg = bgCol1 * n1 + bgCol2 * n2 + bgCol3 * n3;
```

Three FBM (fractal Brownian motion) noise evaluations are combined, each
tinted with a different dark colour (deep purple, dark teal, crimson). The
different time offsets make each layer drift at a different speed, creating
organic depth.

The background blends through dark areas of the rotozoom image using a **luma
key**:

```glsl
float imgLuma = dot(img, vec3(0.299, 0.587, 0.114));
vec3 color = mix(bg, img, clamp(imgLuma * 4.0 + 0.15, 0, 1));
```

Where the KOE image is dark (black border, dark skin tones), the nebula shows
through. Bright areas (eyes, highlights) remain fully opaque. The `* 4.0` makes
the transition steep — only truly dark pixels reveal the nebula.

---

## Eye Glow

The KOE demon face has golden eyes at known positions. The shader computes the
**toroidal distance** from each fragment's rotozoom UV to each eye centre:

```glsl
vec2 eyeL = vec2(0.383594, 0.542578);    // left eye UV
vec2 eyeR = vec2(0.661328, 0.542578);    // right eye UV

float dL = toroidalDist(wrappedUV, eyeL);
float dR = toroidalDist(wrappedUV, eyeR);

float glowL = exp(-dL * dL / (uEyeGlowRadius * uEyeGlowRadius));
float glowR = exp(-dR * dR / (uEyeGlowRadius * uEyeGlowRadius));
```

The `exp(-d²/r²)` is a **Gaussian falloff** — intensity drops smoothly from
the eye centre. The **toroidal distance** handles texture wrapping correctly:

```glsl
float toroidalDist(vec2 a, vec2 b) {
  vec2 d = abs(a - b);
  d = min(d, 1.0 - d);           // take the shorter path (wrapping)
  return length(d);
}
```

Without toroidal distance, the glow would break at texture repeat boundaries.

The glow colour is derived from a configurable hue angle (default: 6° ≈ warm
red-amber), and beats amplify it:

```glsl
glow *= 1.0 + beatPulse * 1.5;
```

---

## The Bloom Pipeline

After the scene shader writes to `sceneFBO`, a multi-pass bloom pipeline adds
cinematic glow to bright areas.

### Pipeline Diagram

```
sceneFBO (full res)
    │
    ▼
┌──────────────────┐
│ Bloom Extract    │  → bloomFBO1 (half res)
│ threshold cutoff │
└──────────────────┘
    │
    ▼ ×3 passes
┌──────────────────┐
│ H blur → V blur  │  → bloomFBO1 (tight bloom)
│ 9-tap Gaussian   │
└──────────────────┘
    │
    ▼
┌──────────────────┐
│ Downsample       │  → bloomWideFBO1 (quarter res)
│ (threshold = 0)  │
└──────────────────┘
    │
    ▼ ×3 passes
┌──────────────────┐
│ H blur → V blur  │  → bloomWideFBO1 (wide bloom)
│ 9-tap Gaussian   │
└──────────────────┘
    │
    ▼
┌──────────────────┐
│ Composite        │  → screen (full res)
│ scene + blooms   │
│ + scanlines      │
└──────────────────┘
```

### Bloom Extract

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

Pixels dimmer than the threshold are blacked out. The `smoothstep` creates a
soft transition rather than a hard cutoff, preventing flickering.

### Separable Gaussian Blur

The 9-tap Gaussian kernel is applied in two passes — horizontal then vertical.
Separable blur costs `O(2N)` per pixel instead of `O(N²)` for a 2D kernel:

```glsl
// 9 taps with pre-computed weights summing to 1.0
result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
result += texture(uTex, vUV - 2.0 * texel).rgb * 0.1216;
result += texture(uTex, vUV - 1.0 * texel).rgb * 0.1945;
result += texture(uTex, vUV).rgb              * 0.2270;
// ... symmetric positive offsets ...
```

Three iterations of H+V blur at half resolution produce a soft, wide glow.
The wide bloom repeats this at quarter resolution for an even softer halo.

### Composite

```glsl
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.25)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
```

Both bloom layers are added to the scene. Beat reactivity amplifies both,
with the tight bloom reacting more strongly (0.25) than the wide (0.15).

### Scanlines

```glsl
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * PI);
color *= scanline;
```

A subtle CRT scanline overlay alternates slightly brighter and dimmer rows.
The default strength of 0.08 is barely visible — just enough to evoke
the retro aesthetic without obscuring detail.

---

## Beat Reactivity Summary

| Effect | Formula | Visual result |
|--------|---------|---------------|
| **Eye glow pulse** | `glow *= 1 + pow(1-beat, 4) × beatReactivity × 1.5` | Eyes flare brighter on the downbeat |
| **Background pulse** | `bg *= 1 + pow(1-beat, 4) × beatReactivity × 0.3` | Nebula subtly brightens |
| **Tight bloom boost** | `tight × (bloomStr + pow(1-beat, 4) × beatReactivity × 0.25)` | Glow halo flares |
| **Wide bloom boost** | `wide × (bloomStr×0.5 + pow(1-beat, 4) × beatReactivity × 0.15)` | Soft halo pulses |

All beat effects use `pow(1 - beat, 4)` as the reactivity curve. This peaks
sharply at `beat = 0` (the downbeat) and decays rapidly:

```
pow(1-beat, 4):

1.0 ┤█
    │█
    │ █
    │  ╲
0.5 ┤    ╲
    │      ╲
    │         ╲___
0.0 ┤              ▀▀▀▀▀▀▀▀▀▀▀▀
    └──┬──────────────────────→ beat
       0                     1.0
       downbeat              next bar
```

---

## The Full Render Pass Table

| Pass | Program | FBO target | Resolution | What it does |
|------|---------|-----------|------------|--------------|
| 1 | Scene | sceneFBO | Full | Rotozoom + colour grading + lens + eyes + nebula + fade |
| 2 | Bloom extract | bloomFBO1 | Half | Brightness threshold extraction |
| 3 | Tight blur ×3 | bloomFBO1↔2 | Half | 6 Gaussian passes (3× H+V) |
| 4 | Wide downsample | bloomWideFBO1 | Quarter | Pass-through copy at lower res |
| 5 | Wide blur ×3 | bloomWideFBO1↔2 | Quarter | 6 Gaussian passes (3× H+V) |
| 6 | Composite | Screen (null) | Full | Combine scene + both blooms + scanlines |

Total draw calls per frame: **14** (1 scene + 1 extract + 6 tight blur + 1
downsample + 6 wide blur + 1 composite = 16; but blur passes are paired, so
14 actual `quad.draw()` calls counting extract + downsample).

---

## Key Takeaways

| Concept | What to remember |
|---------|-----------------|
| **White fade** | `mix(color, white, uFade)` — same as classic palette interpolation |
| **Colour grading** | Hue rotation matrix + saturation mix + brightness multiply |
| **Virtual hemisphere** | Screen-space normals from `sqrt(1 - r²)` enable lens effects |
| **Blinn-Phong** | Halfway vector + power = focused specular highlight |
| **Fresnel rim** | `pow(1 - NdV, exp)` = bright edges, dark centre |
| **Luma key** | Background shows through dark image areas |
| **Toroidal distance** | Eye glow handles texture wrapping correctly |
| **Dual-tier bloom** | Half-res tight + quarter-res wide = focused + diffuse glow |
| **Beat curve** | `pow(1-beat, 4)` = sharp attack, fast decay |

---

**Next:** [Layer 5 — Learning Path](05-learning-path.md)
**Previous:** [Layer 3 — Animation Curves](03-animation-curves.md)
**Back to:** [Overview](00-overview.md)
