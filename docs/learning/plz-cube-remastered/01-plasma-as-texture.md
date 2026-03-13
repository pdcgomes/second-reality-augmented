# Layer 1 — Plasma as Texture

**Source:** `src/effects/plzCube/effect.remastered.js`, lines 190–261 (CUBE_FRAG)
**Concepts:** procedural texturing, nested sine synthesis, UV mapping, colour ramps, hue rotation

---

## What This Layer Covers

- How the classic's CPU lookup-table plasma is reproduced as a **per-pixel GLSL function**
- How **nested sine waves** create organic, swirling patterns
- How **UV coordinates** map the procedural pattern onto each cube face
- How a **three-stop colour ramp** converts a scalar plasma value into RGB
- How **per-face hue rotation** lets each face pair have independent tinting

---

## The Classic Approach: Lookup Tables

The 1993 original pre-computed three 256×64 textures on the CPU:

```javascript
kuva[c][y][x] = floor(sini[(y×4 + sini[x×2]) & 511] / 4 + 32 + c×64)
```

Each pixel stored a **palette index** (0–191). Three colour themes (blue, red,
purple) occupied adjacent 64-entry bands in the VGA palette. The CPU polygon
filler sampled from these tables per pixel during rasterisation.

---

## The Remastered Approach: Per-Pixel GLSL

The remastered computes the identical formula in the fragment shader. No textures
are uploaded — the plasma is entirely **procedural**.

### The sini helper

The classic's `sini` lookup table is replaced by a direct call to `sin()`:

```glsl
float sini(float a) {
  return sin(a / 1024.0 * PI * 4.0) * 127.0;
}
```

This maps the integer-domain lookup `sini[a]` to a continuous function. The
`/ 1024 × 4π` scaling means the function completes two full cycles over the
range 0–1024, matching the original table's period.

```
  sini(a)
  +127 ┃    ╱╲        ╱╲
       ┃   ╱  ╲      ╱  ╲
     0 ┃──╱────╲────╱────╲──
       ┃ ╱      ╲  ╱      ╲
  -127 ┃╱        ╲╱        ╲
       ┗━━━━━━━━━━━━━━━━━━━━ a
       0    256    512   768   1024
```

---

## UV Mapping

Each cube face has UV coordinates from (0,0) to (1,1). The fragment shader
maps these into the classic's texture coordinate range:

```glsl
float u = mix(64.0, 190.0, vUV.x);   // 0→64, 1→190
float v = mix(4.0, 60.0, vUV.y);     // 0→4,  1→60
```

These ranges match the original `TXT` corners `{x:64, y:4}` to `{x:190, y:60}`
— the classic used only a **subregion** of its 256×64 texture per face.
The remastered preserves this framing so the visual pattern matches.

```
  Classic 256×64 texture
  ┌────────────────────────────────────────────┐
  │        ┌──────────────────┐                │
  │        │  Active region   │  y: 4 → 60     │
  │        │  (per face)      │                │
  │        └──────────────────┘                │
  │        x: 64            190                │
  └────────────────────────────────────────────┘
  0                                          255
```

---

## The Plasma Formula

The core of the effect is a two-stage sine composition:

### Stage 1: Horizontal Distortion

```glsl
float dist = sini((uDistortionOffset + v) * 8.0) / 3.0 * uDistortion;
float du = mod(u + dist, 256.0);
```

The vertical coordinate `v` generates a sinusoidal horizontal offset.
`uDistortionOffset` advances each frame (`frame & 63`), animating the wobble.
The `uDistortion` parameter (default 1.0) controls amplitude. Setting it to 0
produces a static, undistorted pattern.

```
  Without distortion (uDistortion = 0):
  ┌──────────────┐
  │║║║║║║║║║║║║║║│   Straight vertical stripes
  │║║║║║║║║║║║║║║│
  │║║║║║║║║║║║║║║│
  └──────────────┘

  With distortion (uDistortion = 1):
  ┌──────────────┐
  │ ║║║║║║║║║║║║ │   Wavy — each row shifted by sin(v)
  │║║║║║║║║║║║║║ │
  │ ║║║║║║║║║║║║║│
  └──────────────┘
```

### Stage 2: Nested Sine Evaluation

```glsl
float plasmaRaw = sini(v * 4.0 + sini(du * 2.0)) / 4.0 + 32.0;
float plasmaVal = clamp(plasmaRaw / 64.0, 0.0, 1.0);
```

The inner `sini(du * 2.0)` creates a horizontal wave. Its output offsets the
argument to the outer `sini(v * 4.0 + ...)`, producing a **frequency-modulated**
pattern. The result is organic and plasma-like — neither purely horizontal nor
purely vertical, with turbulent whorls where the two waves interact.

```
  Step-by-step for one pixel at (u=128, v=30):

  1. Inner:  sini(128 × 2) = sini(256) = sin(256/1024 × 4π) × 127
                            = sin(π) × 127 ≈ 0

  2. Outer:  sini(30 × 4 + 0) = sini(120) = sin(120/1024 × 4π) × 127
                               ≈ sin(1.47) × 127 ≈ 126.5

  3. Scale:  126.5 / 4 + 32 = 63.6

  4. Normalise: 63.6 / 64 ≈ 0.99 → nearly white in the colour ramp
```

---

## The Colour Ramp

The scalar `plasmaVal` (0.0–1.0) is converted to RGB through a **three-stop
ramp**: lo → mid → hi. Each of the three face themes has its own ramp:

```glsl
vec3 themeColor(int theme, float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.5) return mix(uPalLo[theme], uPalMid[theme], t * 2.0);
  return mix(uPalMid[theme], uPalHi[theme], (t - 0.5) * 2.0);
}
```

For the Classic palette (theme 0 = blue):

```
  plasmaVal:  0.0          0.5          1.0
              │─────────────│─────────────│
  Color:   [0,0,0]     [0,0,1]      [1,1,1]
             black    → pure blue  → white

  Ramp visualised:
  ░░░░▒▒▒▒▓▓▓▓████████████▓▓▓▒▒▒░
  dark ──── blue ──────── white
```

The `mix()` function performs linear interpolation. The two-segment approach
gives more control than a single gradient — the designer can place the midpoint
colour at exactly 50%.

---

## Per-Face Hue Rotation

After looking up the ramp colour, the shader applies an optional **hue
rotation** using the Rodrigues rotation formula in RGB space:

```glsl
vec3 hueRotate(vec3 c, float angleDeg) {
  if (abs(angleDeg) < 0.5) return c;
  float a = angleDeg * PI / 180.0;
  float cosA = cos(a), sinA = sin(a);
  vec3 k = vec3(0.57735);   // (1,1,1) normalised — the grey axis
  return c * cosA + cross(k, c) * sinA + k * dot(k, c) * (1.0 - cosA);
}
```

This rotates the colour vector around the `(1,1,1)` axis (the grey line in
RGB space). A 120° rotation maps red → green → blue → red. The editor
exposes three hue-shift sliders (`hueA`, `hueB`, `hueC`), one per face pair,
allowing independent tinting of each axis of the cube.

```
  RGB colour space (viewed down the grey axis):

           Green
            ╱
           ╱  120°
     Red ─●──────── Blue
           ╲
            ╲ hueRotate(c, 120°) maps Red → Green
```

---

## Beat-Reactive Colour Boost

The base colour receives a subtle brightness kick on each musical beat:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
baseColor *= 1.0 + beatPulse * 0.15;
```

At beat onset (`uBeat = 0`), `beatPulse` is at maximum (up to 0.4 at default
reactivity). The `pow(..., 4)` curve decays quickly, so the boost is a brief
flash — just enough to feel the music.

---

**Next:** [Layer 2 — Cube Geometry](02-cube-geometry.md)
