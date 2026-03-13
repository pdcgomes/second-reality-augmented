# Layer 5 — Atmosphere

**Source:** `src/effects/coman/effect.remastered.js` lines 140–167 (fog/colour), 170–230 (bloom shaders), 264–301 (palette build)
**Concepts:** Distance fog, procedural palette, bloom post-processing, beat reactivity, colour remapping

---

## What This Layer Covers

Raw terrain data is just numbers — this layer turns those numbers into the
moody, atmospheric landscape you actually see on screen. The atmosphere
pipeline handles everything that is not geometry:

- How the **procedural palette** maps height+distance to blue-green terrain
  colours
- How **distance fog** blends terrain into a dark background
- How **dual-tier bloom** adds the characteristic glow
- How **beat reactivity** pulses brightness and bloom on the music
- How **colour themes** remap the palette via a 3×3 matrix

---

## The Procedural Palette

The classic palette is a 256-entry colour table generated procedurally. The
remastered variant bakes it into a 128×1 RGBA8 texture with `gl.LINEAR`
filtering for smooth gradients:

```javascript
function buildPaletteTexture() {
  const pal = new Uint8Array(768);  // 256 entries × 3 channels (RGB)

  for (let a = 0; a < 256; a++) {
    // Green channel: smooth ramp with sinusoidal modulation
    let b1 = Math.floor((230 - a) / 4)
           + Math.floor(256 * Math.sin(a * 4 / 1024 * 2 * Math.PI) / 32);

    // Blue channel: linear ramp from high to low
    let b2 = Math.floor((255 - a) / 3);

    // Red channel: narrow peak centred at index 220
    let b3 = a - 220; if (b3 < 0) b3 = -b3;
    if (b3 > 40) b3 = 40; b3 = 40 - b3;
    pal[uc] = Math.floor(b3 / 3);
  }
  // ... boost pass, red highlight band at top ...
}
```

The palette produces a characteristic look:

```
  Index:  0  ────────────────────────────────────── 127
  Blue:   ████████████████████▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░
  Green:  ░░░░▒▒▒▒▓▓▓▓████████▓▓▓▓▒▒▒▒░░░░░░░░░░░
  Red:    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▓▓████░░░░
          valleys        mid-heights        peaks

  Visual: dark blue-green → bright green → red peaks
```

Low indices (valleys, distant terrain) are dark blue. Mid indices (hills) are
blue-green. High indices (peaks, near terrain) are green-tinted with red
highlights. This creates natural-looking terrain colouring without any texture
mapping.

### Why a texture instead of a uniform array?

Using a 128×1 texture with `gl.LINEAR` filtering means the GPU automatically
interpolates between adjacent palette entries when the colour index is
fractional. The classic version uses integer indices, producing hard colour
bands. The texture approach produces smooth gradients for free.

---

## Colour Index Computation

In the fragment shader, the colour index is computed from terrain height and
ray distance:

```glsl
float ci = mod(rawH + 140.0 - floor(fj / 8.0), 256.0) * 0.5;
ci = clamp(ci, 0.0, 127.0);
vec3 palColor = texture(uPalette, vec2((ci + 0.5) / 128.0, 0.5)).rgb;
```

- `rawH + 140.0` — shift into positive range
- `- floor(fj / 8.0)` — **distance darkening**: farther terrain gets a
  lower index (darker colour)
- `mod(..., 256.0) * 0.5` — wrap and map to 128-entry palette
- `(ci + 0.5) / 128.0` — centre on texel for correct LINEAR filtering

The `fj / 8` term means every 8 ray steps, the colour index decreases by 1.
Over the full march depth, this creates a gradual shift from bright near
terrain to dark distant terrain — a primitive but effective fog effect baked
into the colour lookup.

---

## Distance Fog

On top of the palette-based distance darkening, the remastered variant adds
explicit **atmospheric fog** that blends terrain colour toward a dark fog
colour:

```glsl
const vec3 FOG_COLOR = vec3(0.01, 0.015, 0.04);  // dark blue-black

float fogT = smoothstep(0.0, 1.0, fj / float(BAIL)) * uFogIntensity;
color = mix(palColor, FOG_COLOR, fogT);
```

`smoothstep(0, 1, fj / BAIL)` maps ray step to a 0→1 fog factor with an
S-curve (gentle near, steep mid, gentle far). The `uFogIntensity` parameter
(default 0.3) scales the total fog effect.

```
  Without fog:              With fog (intensity 0.3):
  ┃████████████████████┃    ┃████████████▓▓▓▒▒░░░░┃
  ┃ uniform brightness ┃    ┃ bright near │ fades  ┃
                             ↑ smooth blend to dark
```

The combination of palette-based darkening and explicit fog produces rich
depth perception — close terrain is vivid, distant terrain dissolves into
atmospheric haze.

---

## Beat Reactivity

Two beat-reactive effects make the terrain pulse with the music:

### Terrain brightness pulse

In the scene shader, after computing the terrain colour:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
color *= 1.0 + beatPulse;
```

`uBeat` goes from 0.0 (beat start) to 1.0 (next beat). `pow(1 - beat, 4)`
produces a sharp spike at beat onset that decays quickly:

```
  beat:         0.0     0.25    0.5     0.75    1.0
  1.0 - beat:   1.0     0.75    0.5     0.25    0.0
  pow(..., 4):  1.000   0.316   0.063   0.004   0.000
                ↑ bright flash      fades rapidly →
```

The `uBeatReactivity` parameter (default 0.2) scales the effect. At 0.2,
the terrain brightens by 20% on each beat.

### Bloom pulse

In the composite shader, bloom intensity also increases on beats:

```glsl
float beatPulse = pow(1.0 - uBeat, 6.0);
vec3 color = scene
  + tight * (uBloomTightStr + beatPulse * uBeatBloom)
  + wide  * (uBloomWideStr  + beatPulse * uBeatBloom * 0.6);
```

The `pow(..., 6)` exponent produces an even sharper spike than the terrain
brightness. `uBeatBloom` (default 0.3) controls how much extra bloom is
added on each beat. The wide bloom receives 60% of the pulse — this creates
a brief atmospheric flare on each beat that decays more slowly than the
tight bloom.

---

## The Bloom Pipeline

The bloom pipeline is identical in structure to other remastered effects in
this project (see the Dots Remastered bloom guide for a deep dive). Here is
the terrain-specific flow:

```
  Scene FBO (full res)
       │
       ▼
  ┌─────────────┐
  │ Bloom       │  Extract pixels above brightness threshold
  │ Extract     │  (half resolution)
  └──────┬──────┘
         │
         ▼
  ┌─────────────┐
  │ 3× Gaussian │  Ping-pong H+V blur (9-tap kernel)
  │ Blur (tight)│  (half resolution)
  └──────┬──────┘
         │
    ┌────┴────┐
    │         ▼
    │  ┌─────────────┐
    │  │ Downsample + │  Re-extract at zero threshold
    │  │ 3× Blur     │  (quarter resolution)
    │  │ (wide)      │
    │  └──────┬──────┘
    │         │
    ▼         ▼
  ┌─────────────────────┐
  │ Composite           │  scene + tight bloom + wide bloom
  │ + scanlines → screen│  + beat reactivity
  └─────────────────────┘
```

### The bloom extract shader

```glsl
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
}
```

**Perceived brightness** uses ITU-R BT.709 luminance weights. The
`smoothstep` creates a soft threshold — no hard cutoff. The default
threshold of 0.35 means only the brighter terrain and highlights contribute
to bloom.

### The Gaussian blur shader

The 9-tap separable Gaussian kernel blurs horizontally then vertically,
repeated 3 times per tier. The weights form a bell curve summing to ~1.0:

```
  Weights: 0.016  0.054  0.122  0.195  0.227  0.195  0.122  0.054  0.016
           -4     -3     -2     -1      0     +1     +2     +3     +4
```

Three iterations expand the effective blur radius well beyond 9 pixels
because each pass blurs an already-blurred image.

### Scanlines

A subtle CRT scanline effect darkens alternating rows:

```glsl
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
color *= scanline;
```

At the default strength of 0.03, this is barely perceptible — just enough to
add a hint of retro character.

---

## Colour Themes via Matrix Remapping

The classic uses a fixed blue-green palette. The remastered adds 13 colour
themes by remapping the palette through a **3×3 colour matrix**:

```glsl
color = mat3(uColorR, uColorG, uColorB) * color;
```

Each theme defines three column vectors `(uColorR, uColorG, uColorB)` that
form a 3×3 matrix. Multiplying the original RGB colour by this matrix rotates
and scales the colour space:

```javascript
const PALETTES = [
  { name: 'Classic',   colorMap: [[1,0,0], [0,1,0], [0,0,1]] },      // identity
  { name: 'Gruvbox',   colorMap: [[0.8,0.37,0.05], [0.6,0.59,0.1], [0.27,0.53,0.35]] },
  { name: 'Synthwave', colorMap: [[1,0.49,0.86], [0.45,0.98,0.72], [0.21,0.98,0.96]] },
  // ... 10 more themes
];
```

The `Classic` theme uses the identity matrix — no change. Other themes mix
channels: Synthwave, for example, maps red to pink, green to cyan-green, and
blue to electric cyan, producing a neon aesthetic.

---

## Key Takeaways

- The **procedural palette** creates terrain colours from height+distance
  without any texture mapping
- **Distance fog** via `smoothstep` blends far terrain into dark haze,
  adding atmospheric depth
- **Beat reactivity** uses `pow(1 - beat, N)` curves for sharp-onset,
  fast-decay brightness/bloom pulses
- **Dual-tier bloom** (half-res tight + quarter-res wide) adds atmospheric
  glow at low GPU cost
- **Colour themes** remap the fixed palette via a 3×3 matrix multiply,
  enabling 13 visual styles from one palette

---

**Previous:** [Layer 4 — GPU VoxelSpace](04-gpu-voxelspace.md)
**Next:** [Layer 6 — Learning Path](06-learning-path.md)
