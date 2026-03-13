# Layer 4 — GPU Rendering and Post-Processing

**Source:** `src/effects/technoBars/effect.remastered.js`, lines 147–187 (GLSL main), lines 482–611 (render)
**Concepts:** analytical geometry vs bitmaps, overlap counting, colour smoothing, palette interpolation, dual-tier bloom, beat reactivity

---

## What This Layer Covers

The previous layers described what the bars look like, why they are layered
into 4 planes, and how they move. This layer explains how it all comes
together on the GPU to produce the final image:

- How analytical per-pixel evaluation replaces bitmap page-flipping
- Hard vs smooth overlap counting and the `colorSmooth` parameter
- How the overlap count maps to colour via tint interpolation
- The 21 palette themes (lo/hi tint vectors)
- The dual-tier bloom pipeline
- Beat reactivity and CRT scanlines

---

## Replacing Bitmaps with Analytical Geometry

The classic effect draws polygons into bitmaps. The remastered never creates
a bitmap of the bars at all. Instead, for every pixel on screen, the fragment
shader asks: "is this pixel inside a bar?" — and does so for all 4 planes
independently.

The `main()` function in BARS_FRAG maps the UV coordinate to the classic
320×200 coordinate space, then evaluates all 4 planes:

```glsl
void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  vec2 pos = vec2(uv.x * 320.0, uv.y * 200.0);

  if (pos.x < uScrollX) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }
  // ... evaluate 4 planes and compute colour ...
}
```

The `1.0 - vUV.y` flip matches the classic's top-down coordinate system
(Y=0 at top). The `uScrollX` test implements the Phase 3 scroll-out (Layer 3).

This approach is **resolution-independent**: whether the canvas is 640×400
or 3840×2160, the same formula runs at every pixel. The bars are always
mathematically crisp because they are defined analytically, not rasterised
into a fixed grid.

---

## Hard vs Smooth Overlap Counting

Each of the 4 `evalBars` calls returns a **coverage** value from 0.0 to 1.0
(thanks to the `fwidth()` anti-aliasing from Layer 1). The shader offers two
ways to count overlaps:

```glsl
float overlap_smooth = cov0 + cov1 + cov2 + cov3;
float overlap_hard = step(0.5, cov0) + step(0.5, cov1)
                   + step(0.5, cov2) + step(0.5, cov3);
float overlap = mix(overlap_hard, overlap_smooth, uColorSmooth);
```

**Hard counting** (`step(0.5, cov)`) snaps each plane's coverage to 0 or 1,
then sums them. The result is an integer 0–4, exactly matching the classic's
bit-plane popcount. Edges are anti-aliased in geometry but the colour jumps
discretely between levels.

**Smooth counting** sums the raw coverage values. A pixel half-covered by
one bar gets 0.5 instead of 1, producing continuous colour gradients at bar
edges.

The `uColorSmooth` parameter (0–1) blends between the two modes:

```
colorSmooth = 0.0 (hard):          colorSmooth = 1.0 (smooth):

  ██████████ 4                       ▓█████████▓
  ▓▓▓▓▓▓▓▓▓▓ 3                      ▒▓████████▓▒
  ░░░░░░░░░░ 2                      ░▒▓███████▓▒░
  ··········· 1                      ·░▒▓██████▓▒░·
              0                       ·░▒▓█████▓▒░·

  (sharp colour steps)               (gradual colour ramp)
```

At the default value of 0.5, you get a blend: the classic's sharp popcount
character with softened transitions at bar edges.

---

## Colour from Overlap: Tint Interpolation

The overlap count (0–4) maps to colour through two tint vectors:

```glsl
float t_pal = overlap / 4.0;
vec3 color = mix(uTintLo, uTintHi, t_pal) * t_pal;
```

This single line does two things:

1. **`mix(uTintLo, uTintHi, t_pal)`** — interpolates between a dim tint
   colour (`uTintLo`) and a bright tint colour (`uTintHi`) based on how
   many bars overlap. Zero overlap selects `tintLo`; full overlap selects
   `tintHi`.

2. **`× t_pal`** — multiplies by the normalised overlap. At zero overlap
   this produces black (0 × anything = 0). At full overlap this produces
   `tintHi` at full brightness. At partial overlap the colour is both
   shifted toward `tintHi` and dimmed.

```
Overlap:    0        1        2        3        4
t_pal:      0.0      0.25     0.5      0.75     1.0

Colour:     black    dim lo   mid      bright   full hi
            ·        ░░░░     ▒▒▒▒     ▓▓▓▓     ████
```

---

## 21 Palette Themes

The `PALETTES` array defines 21 lo/hi tint pairs:

```javascript
const PALETTES = [
  { name: 'Classic',     lo: [0.33, 0.30, 0.40], hi: [0.75, 0.70, 0.81] },
  { name: 'Ember',       lo: [0.45, 0.15, 0.02], hi: [1.00, 0.55, 0.10] },
  { name: 'Ocean',       lo: [0.05, 0.20, 0.45], hi: [0.15, 0.65, 1.00] },
  { name: 'Toxic',       lo: [0.10, 0.40, 0.08], hi: [0.30, 1.00, 0.25] },
  // ... 17 more themes ...
];
```

Each theme gives the bars a completely different mood:

| Theme | Lo tint | Hi tint | Character |
|-------|---------|---------|-----------|
| Classic | Purple-grey | Light lavender | Matches 1993 original |
| Ember | Dark brown | Bright orange | Warm firelight |
| Ocean | Deep navy | Cyan-white | Cold underwater |
| Toxic | Dark green | Neon green | Radioactive |
| Monochrome | Grey | White | Clean, neutral |

The editor exposes the theme as a dropdown. Switching themes changes the two
uniform vec3 values `uTintLo` and `uTintHi` — the shader code is unchanged.

---

## The Palette Flash

The `curpal` flash from Layer 3 modulates overall brightness:

```glsl
float palFlash = uPalBrightness / 15.0;
color *= 1.0 + palFlash * 0.6;
```

When `curpal = 15` (immediately after a beat or 35-frame tick), the colour
is boosted by 60%. As `curpal` decays to 0 over 15 frames, the boost fades.
This creates the rhythmic pulsing that synchronises the visual to the music.

---

## Hue Shift and Saturation

Two additional colour adjustments are applied after the base tint:

```glsl
if (uHueShift != 0.0) {
  color = hueRotate(color, uHueShift * TAU / 360.0);
}
if (uSaturationBoost != 0.0) {
  color = boostSaturation(color, uSaturationBoost);
}
color *= uBrightness + beatPulse * 0.12;
```

The **hue rotation** uses a 3×3 matrix derived from the luminance-preserving
rotation formula. It rotates the colour around the grey axis in RGB space,
shifting all colours uniformly (e.g., +120° turns purple into green).

The **saturation boost** interpolates between the greyscale luminance and the
original colour. Values above 0 increase saturation; values below 0 desaturate
toward grey.

The final **brightness** multiplier scales the entire output. The beat pulse
adds a subtle flash (+12% at peak) synchronised to the music.

---

## The Bloom Pipeline

After the bars are rendered to `sceneFBO`, a dual-tier bloom pipeline adds a
soft glow to bright regions:

```
┌──────────────┐
│  BARS_FRAG   │─────► sceneFBO (full resolution)
└──────────────┘           │
                           ▼
                 ┌──────────────────┐
                 │  BLOOM_EXTRACT   │──► bloomFBO1 (half res)
                 └──────────────────┘       │
                                            ▼
                                  ┌─────────────────┐
                                  │ BLUR (×3 H+V)   │──► bloomFBO1 (tight)
                                  └─────────────────┘       │
                                            │               ▼
                                            │   ┌──────────────────┐
                                            │   │  BLOOM_EXTRACT   │──► wideFBO1 (¼ res)
                                            │   └──────────────────┘       │
                                            │                              ▼
                                            │                   ┌─────────────────┐
                                            │                   │ BLUR (×3 H+V)   │
                                            │                   └─────────────────┘
                                            │                          │
                                            ▼                          ▼
                                  ┌───────────────────────────────────────┐
                                  │  COMPOSITE (scene + tight + wide)    │──► screen
                                  └───────────────────────────────────────┘
```

The bloom extraction shader isolates bright pixels using perceptual luminance
and a `smoothstep` threshold:

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

The 9-tap separable Gaussian blur runs 3 iterations of horizontal + vertical
passes using ping-pong FBOs (read from one, write to the other, swap). Each
iteration doubles the effective blur radius.

The **tight bloom** (half resolution) creates a sharp glow around bright bar
intersections. The **wide bloom** (quarter resolution) creates a soft ambient
halo that fills the screen.

---

## Beat Reactivity in the Composite

The composite shader combines the scene with both bloom tiers and applies
beat-reactive modulation:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.25)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
```

On each musical downbeat (`beat ≈ 0`), `beatPulse` spikes to 1.0 and decays
with a steep 4th-power curve. This momentarily increases bloom strength:

| beat | pow(1-beat, 4) | Tight boost | Wide boost |
|------|----------------|-------------|------------|
| 0.00 | 1.000 | +0.25 | +0.15 |
| 0.10 | 0.656 | +0.16 | +0.10 |
| 0.25 | 0.316 | +0.08 | +0.05 |
| 0.50 | 0.063 | +0.02 | +0.01 |
| 1.00 | 0.000 | +0.00 | +0.00 |

The combined effect: bar intersections glow brighter on each beat, creating
a rhythmic visual pulse.

---

## CRT Scanlines

The final processing step adds optional scanline darkening:

```glsl
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
color *= scanline;
```

`sin(gl_FragCoord.y * π)` oscillates between 0 and 1 per pixel row — bright
on even rows, dark on odd rows. The `uScanlineStr` parameter controls the
depth of the effect. At the default of 0.26 (heavier than most effects in
this project), every other row is darkened by 26%, evoking the look of a CRT
monitor.

```
Without scanlines:        With scanlines (0.26):

 ████████████████████     ████████████████████  (even row: full)
 ████████████████████     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (odd row: 74%)
 ████████████████████     ████████████████████  (even row: full)
 ████████████████████     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (odd row: 74%)
```

---

## Resource Summary

| Resource | Count | Purpose |
|----------|-------|---------|
| Shader programs | 4 | Bars, bloom extract, blur, composite |
| FBOs | 5 | Scene + 2 tight bloom (ping-pong) + 2 wide bloom (ping-pong) |
| Textures | 5 | One per FBO |
| Input textures | 0 | Everything is procedural |
| Uniforms (bars) | 15 | 4×vec4 bar params + active + palette + smoothing + beat |
| Uniforms (composite) | 6 | Scene/bloom textures + strength + beat + scanlines |

All resources are created in `init()` (programs) and lazily in `render()`
(FBOs, on first frame or resize), and cleaned up in `destroy()`.

---

**Next:** [Layer 5 — Learning Path](05-learning-path.md)
