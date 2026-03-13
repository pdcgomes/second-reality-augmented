# Layer 4 — Rendering Pipeline

**Source:** `src/effects/technoCircles/effect.remastered.js` lines 160–209 (palette GLSL), lines 305–364 (bloom/composite shaders), lines 487–631 (render passes)
**Concepts:** palette functions, colour smoothing, bloom, beat reactivity, palette themes

---

## What This Layer Covers

Previous layers explained the circle data, interference, and distortion. But
a colour index (0–15) is not a colour — it needs to be mapped through a
palette. This layer explains:

- How Phase 1 and Phase 2 use different palette functions
- How 21 palette themes remap colours via tint vectors
- How colour smoothing provides anti-aliasing at ring edges
- The standard dual-tier bloom pipeline
- How beat reactivity makes the effect pulse with the music

---

## Two Palette Systems

The effect uses fundamentally different palette logic for each phase.

### Phase 1: phase1Pal — 8-Entry Rotating Palette

```glsl
vec3 phase1Pal(float ci, float shift, float palfader) {
  float idx = mod(floor(ci) + 7.0 - floor(shift) + 800.0, 8.0);
  float bright = idx < 0.5 ? 1.0 : 0.0;
  vec3 base = uPhase1Color * 63.0 * bright;
  if (palfader <= 256.0) {
    base *= palfader / 256.0;
  } else {
    base = clamp(base + (palfader - 256.0), 0.0, 63.0);
  }
  return base / 63.0;
}
```

This is a stark palette: only one ring at a time is lit (where `idx == 0`),
and all others are black. The `shift` parameter rotates which ring is lit,
cycling every 8 frames. The `palfader` controls brightness — fading in
during the first 128 frames, then washing toward white as it rises past 256.

The result is a flashing strobe effect: each ring briefly lights up as the
shift cycles around.

### Phase 2: phase2Pal — 16-Entry Dual-Bank Palette

```glsl
const float PAL1_V[8] = float[8](30.0, 60.0, 50.0, 40.0, 30.0, 20.0, 10.0, 0.0);
const float PAL2_V[8] = float[8](0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 30.0);

vec3 phase2Pal(float ci, float shift, float smooth_amount) {
  // ... index into PAL1 (0-7) or PAL2 (8-15), apply tint and shift ...
}
```

The 16 palette entries are split into two banks:

| Indices | Array | Tint vector | Character |
|---------|-------|-------------|-----------|
| 0–7 | PAL1_V | `uPal1Tint` | Bright → dark gradient (60→0) |
| 8–15 | PAL2_V | `uPal2Tint` | Dark → bright gradient (0→60) |

Each bank is a simple brightness ramp stored as VGA 6-bit values (0–63),
multiplied by a per-bank RGB tint vector. The `shift` parameter rotates
within each bank independently, animating the colours along the rings.

The opposing gradients (bank 1 goes bright→dark, bank 2 goes dark→bright)
create contrast at the interference boundary — where circle2's mask kicks
the index from the 0–7 bank into the 8–15 bank, the brightness relationship
inverts.

---

## 21 Palette Themes

Each palette theme defines three RGB tint vectors:

```javascript
const PALETTES = [
  { name: 'Classic',    phase1: [0, 0.476, 0.635], pal1: [1.0, 0.889, 1.0],  pal2: [1.0, 0.778, 1.0]  },
  { name: 'Ember',      phase1: [1.0, 0.5, 0.05],  pal1: [1.0, 0.6, 0.2],    pal2: [1.0, 0.3, 0.1]    },
  // ... 19 more themes ...
];
```

| Vector | Used by | Controls |
|--------|---------|----------|
| `phase1` | Phase 1 palette | Colour of the lit ring during the intro |
| `pal1` | Phase 2, indices 0–7 | Tint for the circle1-only regions |
| `pal2` | Phase 2, indices 8–15 | Tint for the overlap regions |

Changing the theme completely transforms the visual character without
touching any geometry or animation logic. The Classic theme uses cool
purple-grays; Ember uses warm oranges; Toxic uses acidic greens. The shader
applies the tint by component-wise multiplication:

```glsl
c0 = vec3(PAL1_V[si]) * uPal1Tint;  // e.g., 40.0 * vec3(1.0, 0.6, 0.2)
```

---

## Colour Smoothing

At native resolution, the hard ring boundaries can produce aliased edges.
The `uColorSmooth` parameter blends between the discrete (integer-rounded)
and fractional colour indices:

```glsl
float r1 = floor(ring1 + 0.5);
float r2 = floor(ring2 + 0.5);
float ci_int = r1 + r2;

float ci_smooth = ring1 + ring2;

float ci = mix(ci_int, ci_smooth, uColorSmooth);
```

When `uColorSmooth` is 0, the index is strictly integer — hard ring edges,
true to the original. When it is 1, the fractional texture values flow
through, and the palette function interpolates between adjacent entries:

```glsl
vec3 phase2Pal(float ci, float shift, float smooth_amount) {
  float intCi = floor(ci);
  float frac_ci = ci - intCi;
  float blend = frac_ci * smooth_amount;
  // ... compute c0 at intCi and c1 at intCi+1 ...
  return mix(c0, c1, blend) / 63.0;
}
```

The default of 0.3 provides subtle anti-aliasing at ring edges without
losing the crisp retro character.

---

## Colour Grading

After palette lookup, optional hue rotation and saturation boost are applied:

```glsl
if (uHueShift != 0.0) {
  color = hueRotate(color, uHueShift * TAU / 360.0);
}
if (uSaturationBoost != 0.0) {
  color = boostSaturation(color, uSaturationBoost);
}
color *= uBrightness + beatPulse * 0.12;
color *= uFade;
```

The hue rotation uses a 3×3 matrix that preserves perceptual luminance while
rotating the colour wheel. The saturation boost mixes between the luminance
(grayscale) and the original colour. These are applied after the palette
lookup so they work uniformly across all themes.

---

## The Render Pipeline

The remastered renders in three passes:

```
Pass 1: Circle interference → sceneFBO         (full resolution)
Pass 2: Bloom extraction + blur                (half + quarter resolution)
Pass 3: Composite to screen                    (full resolution)

┌────────────────┐
│ CIRCLES_FRAG   │─────► sceneFBO (full res)
└────────────────┘            │
                              ▼
                    ┌──────────────────┐
                    │ BLOOM_EXTRACT    │──► bloomFBO1 (½ res)
                    └──────────────────┘        │
                                                ▼
                                      ┌─────────────────┐
                                      │ BLUR (×3 H+V)   │──► bloomFBO1 (tight bloom)
                                      └─────────────────┘        │
                                                │                ▼
                                                │   ┌──────────────────┐
                                                │   │ BLOOM_EXTRACT    │──► wideFBO1 (¼ res)
                                                │   └──────────────────┘        │
                                                │                               ▼
                                                │                   ┌─────────────────┐
                                                │                   │ BLUR (×3 H+V)   │
                                                │                   └─────────────────┘
                                                │                          │
                                                ▼                          ▼
                                      ┌──────────────────────────────────────┐
                                      │ COMPOSITE (scene + tight + wide)     │──► screen
                                      └──────────────────────────────────────┘
```

### Bloom Extraction

The bloom extract shader isolates bright pixels using perceptual luminance
and a smooth threshold:

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

Pixels below the threshold produce black; pixels above pass through fully.
The 0.3 transition range prevents harsh cutoff artefacts.

### Dual-Tier Bloom

Two bloom layers at different resolutions create both sharp and diffuse glow:

| Tier | Resolution | Blur passes | Character |
|------|-----------|-------------|-----------|
| Tight | Half (sw/2 × sh/2) | 3× H+V | Sharp halo around bright rings |
| Wide | Quarter (sw/4 × sh/4) | 3× H+V | Soft ambient glow |

Each blur pass uses a 9-tap separable Gaussian kernel, ping-ponging between
two FBOs. Three iterations compound the effective radius far beyond 9 pixels.

### Final Composite

```glsl
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.25)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * PI);
color *= scanline;
```

Bloom is additive — it brightens without replacing the original image. The
wide bloom is mixed at half strength to provide ambient warmth without
washing out detail. A subtle scanline overlay (default 2%) adds retro CRT
texture.

---

## Beat Reactivity

The beat value (0.0–1.0) represents position within the current musical bar:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
```

`pow(1 - beat, 4)` creates a sharp spike at beat = 0 (the downbeat) that
decays rapidly:

```
beat:       0.0    0.25    0.5    0.75    1.0
pulse:      1.0    0.32    0.06   0.004   0.0
            ████
            █
```

This pulse is applied in three places:

| Where | Formula | Effect |
|-------|---------|--------|
| Circle shader | `color += beatPulse * 0.04–0.06` | Flash brighter on downbeat |
| Circle shader | `color *= brightness + beatPulse * 0.12` | Overall brightness pulse |
| Composite | `tight * (bloomStr + beatPulse * 0.25)` | Bloom glow flares on beat |

---

## Resource Summary

| Resource | Count | Purpose |
|----------|-------|---------|
| Shader programs | 4 | Circles, bloom extract, blur, composite |
| FBOs | 5 | Scene + 2 tight bloom (ping-pong) + 2 wide bloom (ping-pong) |
| Textures | 7 | 5 FBO textures + 2 circle bitmaps |
| Input textures | 2 | circle1 (R8, 640×400), circle2 (R8, 640×400) |

All resources are created in `init()` (programs, circle textures) and lazily
in `render()` (FBOs, on first frame or resize), and cleaned up in `destroy()`.

---

**Next:** [Layer 5 — Learning Path](05-learning-path.md)
