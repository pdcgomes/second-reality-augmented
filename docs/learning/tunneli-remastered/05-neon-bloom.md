# Layer 5 — Neon Bloom

**Source:** `src/effects/tunneli/effect.remastered.js`, lines 89–143 (DOT_FRAG colour), lines 24–38 (palette presets), lines 439–511 (bloom pipeline)
**Concepts:** HSL colour model, depth-based gradients, HDR framebuffers, dual-tier bloom

---

## What This Layer Covers

The classic tunnel is monochrome white — dots fade from bright to dark with
depth but have no colour. The remastered transforms this into a neon
spectacle with colour gradients and glow:

- HSL colour model with depth-based hue interpolation
- 13 palette themes via near/far hue pairs
- HDR framebuffers for additive accumulation without clipping
- The dual-tier bloom pipeline and beat reactivity

---

## HSL Colour Model

The remastered uses **HSL** (Hue, Saturation, Lightness) instead of direct
RGB. This makes colour control intuitive:

- **Hue** (0–360°): the colour on the wheel — 0° = red, 120° = green, 240° = blue
- **Saturation** (0–1): how vivid the colour is — 0 = grey, 1 = pure colour
- **Lightness** (0–1): how bright — 0 = black, 0.5 = full colour, 1 = white

The conversion from HSL to RGB is done in the fragment shader:

```glsl
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = mod(h / 60.0, 6.0);
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 rgb;
  if      (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  // ... 4 more hue sectors ...
  float m = l - c * 0.5;
  return rgb + m;
}
```

The hue wheel is divided into 6 sectors of 60° each. Within each sector,
two of the three RGB channels vary linearly while the third is zero. The
`m` offset adjusts for lightness.

---

## Depth-Based Hue Gradient

Each palette theme defines two hues — one for near dots, one for far dots:

```javascript
const PALETTES = [
  { name: 'Classic',     hueNear: 190, hueFar: 190 },  // uniform cyan
  { name: 'Synthwave',   hueNear: 170, hueFar: 310 },  // cyan→pink
  { name: 'Kanagawa',    hueNear: 220, hueFar: 30  },   // blue→orange
  // ...
];
```

The fragment shader interpolates between them using the depth value:

```glsl
float hueDiff = uHueFar - uHueNear;
if (hueDiff > 180.0) hueDiff -= 360.0;   // shortest path around wheel
if (hueDiff < -180.0) hueDiff += 360.0;
float hue = mod(uHueNear + hueDiff * vDepth, 360.0);
```

The shortest-path logic is essential. If near = 350° (red) and far = 30°
(orange), the naive interpolation would go the long way (350→180→30 = 320°
arc). The shortest path goes 350→360→30 (40° arc through red/orange).

Other colour properties also vary with depth:

| Property | Near (depth=0) | Far (depth=1) |
|----------|---------------|---------------|
| Hue | `hueNear` | `hueFar` |
| Saturation | 0.85 (vivid) | 0.60 (muted) |
| Alpha | 1.0 (opaque) | 0.3 (faint) |

Far dots are not just smaller — they are also more transparent and less
saturated. This triple attenuation (size + alpha + saturation) creates a
convincing sense of depth.

---

## HDR Framebuffers

The scene FBO uses RGBA16F (16-bit floating point per channel) when the GPU
supports it:

```javascript
const hasHDR = !!gl.getExtension('EXT_color_buffer_float');
fboInternalFmt = hasHDR ? gl.RGBA16F : gl.RGBA8;
fboType = hasHDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
```

Why HDR? With additive blending, bright regions where many dots overlap can
exceed the 0–1 range. In an 8-bit framebuffer, these values would clip to
1.0 (pure white), losing colour information. In a 16-bit float framebuffer,
values can exceed 1.0 and are only tone-mapped during the final composite.
The bloom extraction shader can then distinguish between "moderately bright"
(1.0) and "extremely bright" (3.0), producing more nuanced glow.

---

## The Bloom Pipeline

The bloom pipeline follows the same dual-tier architecture used across the
project (see the Plasma guide for a detailed explanation of the mechanics).
The tunnel's bloom is tuned more aggressively because the sparse dot field
needs stronger glow to fill the gaps:

| Setting | Tunnel default | Typical default | Why |
|---------|---------------|----------------|-----|
| Bloom threshold | 0.24 | 0.25–0.3 | Lower threshold catches dimmer dots |
| Bloom strength | 0.69 | 0.45 | Stronger glow fills gaps between dots |
| Wide bloom factor | 0.6× | 0.5× | More diffuse glow for the neon look |

### Pipeline

```
Scene FBO (full res)
    │
    ▼
Bloom Extract (half res, threshold 0.24)
    │
    ▼
3× H+V Gaussian blur ──────────────────► Tight bloom texture
    │
    ▼
Bloom Extract (quarter res, threshold 0)
    │
    ▼
3× H+V Gaussian blur ──────────────────► Wide bloom texture
```

The tight bloom creates focused glow halos around individual bright dots.
The wide bloom creates a broad ambient neon wash that fills the gaps between
rings. Together they produce the signature neon tunnel look.

---

## Beat Reactivity

Beat pulses affect three aspects of the tunnel simultaneously:

```
beatPulse = pow(1.0 - beat, 4.0) × beatReactivity
```

| Target | Effect | Intensity |
|--------|--------|-----------|
| `gl_PointSize` | Dots swell | +30% at peak |
| Lightness | Dots brighten | +0.15 at peak |
| Bloom strength | Glow flares | +0.3 tight, +0.2 wide |

On each musical downbeat, the dots briefly grow larger, flash brighter, and
the neon glow intensifies. The combined effect makes the tunnel feel like it
is pulsing with the music.

---

## Composite and Scanlines

The final composite adds all three layers:

```glsl
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.3)
  + wide  * (uBloomStr * 0.6 + beatPulse * 0.2);
```

Optional CRT scanlines add retro texture:

```glsl
if (uScanlineStr > 0.001) {
  float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * PI);
  color *= scanline;
}
```

The conditional skip (`> 0.001`) avoids the overhead of computing the
scanline pattern when it is disabled. At the default strength of 0.07,
the effect is subtle but visible — slightly darker every other pixel row.

---

## Resource Summary

| Resource | Count | Notes |
|----------|-------|-------|
| Shader programs | 4 | Dot, bloom extract, blur, composite |
| VAOs | 2 | Dot points (dynamic) + fullscreen quad (static) |
| VBOs | 2 | Dynamic dot buffer + static quad |
| FBOs | 5 | Scene + 2 tight bloom + 2 wide bloom |
| Format | RGBA16F | HDR for additive accumulation |

---

**Next:** [Layer 6 — Learning Path](06-learning-path.md)
