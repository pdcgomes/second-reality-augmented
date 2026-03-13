# Layer 4 — Diffuse Lighting

**Source:** `src/effects/plzCube/effect.remastered.js`, lines 232–261 (CUBE_FRAG main), lines 534–539 (light direction)
**Concepts:** Blinn-Phong shading, Lambertian diffuse, specular highlights, half-vector, orbiting light, beat-reactive specular

---

## What This Layer Covers

- How the classic's flat per-face lighting becomes **per-pixel Blinn-Phong** shading
- How an **orbiting light source** creates dynamic shadows as the cube rotates
- How the **diffuse term** (Lambert's cosine law) models rough surfaces
- How the **specular term** (Blinn half-vector) creates shiny highlights
- How the **beat pulse** modulates specular power and intensity on each musical accent

---

## Classic Lighting: One Shade Per Face

The 1993 original computed a single brightness for each entire face:

```javascript
// Cross product to get face normal, then dot with light direction
let s = Math.floor((lsX * nx + lsY * ny + lsZ * nz) / 250000 + 32);
if (s < 0) s = 0; if (s > 64) s = 64;

// Every pixel on this face: colour = basePal[index] × s / 64
fpal[i] = (basePal[i] * s) >> 6;
```

Each face was a single solid shade. The `s` value was a 6-bit brightness
multiplier applied uniformly to the palette. This is **flat shading** — the
simplest possible lighting model.

---

## Remastered Lighting: Per-Pixel Blinn-Phong

The remastered evaluates lighting for every pixel individually, producing
smooth gradients and specular highlights. The lighting model has three
components:

```
  Ambient            Diffuse              Specular
  ┌──────┐          ┌──────┐            ┌──────┐
  │██████│          │▓▓▒░  │            │  ·   │
  │██████│    +     │▓▒░   │      +     │      │
  │██████│          │▒░    │            │      │
  └──────┘          └──────┘            └──────┘
  Constant base      Varies with         Bright hot spot
  everywhere         surface angle        at reflection angle
```

---

## The Orbiting Light Source

The light direction is not fixed — it orbits according to spline-interpolated
angles `ls_kx` (polar) and `ls_ky` (azimuth):

```javascript
const lsToRad = PI / 512;
const lx = Math.sin(sp.ls_kx * lsToRad) * Math.sin(sp.ls_ky * lsToRad);
const ly = Math.cos(sp.ls_kx * lsToRad);
const lz = Math.sin(sp.ls_kx * lsToRad) * Math.cos(sp.ls_ky * lsToRad);
const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
```

This converts two spherical angles into a Cartesian direction vector,
normalised to unit length. The angles come from the same `ANIM_SPLINE` control
points as the camera rotation (fields 6 and 7), so the light follows a
choreographed path that the demo artist hand-tuned.

```
  Spherical → Cartesian conversion:

          +Y (up)
           │  ls_kx = polar angle from +Y
           │ ╱
           │╱ ╲
           ●────→ light direction (lx, ly, lz)
          ╱
         ╱ ls_ky = azimuth around +Y
        +Z

  lx = sin(ls_kx) × sin(ls_ky)
  ly = cos(ls_kx)
  lz = sin(ls_kx) × cos(ls_ky)
```

During the first 8 control points, `ls_kx = 0` and `ls_ky = 0`, so the light
points straight down (+Y). As the animation progresses, the light orbits
around the cube, creating shifting highlights and shadows.

---

## Diffuse: Lambert's Cosine Law

The diffuse component models how much direct light a surface receives. The
brightness depends on the angle between the surface normal **N** and the light
direction **L**:

```glsl
vec3 N = normalize(vWorldNormal);
vec3 L = normalize(uLightDir);
float diff = max(dot(N, L), 0.0);
```

When N faces the light directly (`N·L = 1.0`), the surface is fully lit. When
perpendicular (`N·L = 0.0`), it receives no direct light. Negative values (the
surface faces away) are clamped to zero.

```
  Light L
     ↘
      \   θ
       \  │
  ──────●────── surface
        ↑
        N

  diff = cos(θ) = dot(N, L)
  θ = 0°  → diff = 1.0  (directly facing light)
  θ = 45° → diff = 0.71 (angled)
  θ = 90° → diff = 0.0  (edge-on)
  θ > 90° → diff = 0.0  (facing away, clamped)
```

The diffuse term is combined with ambient to produce the base illumination:

```glsl
vec3 lit = baseColor * (uAmbient + diff * (1.0 - uAmbient));
```

When `uAmbient = 0.49` (the default), even unlit faces receive 49% of their
colour — preventing black faces that would look flat and lifeless.

---

## Specular: Blinn Half-Vector

The specular term creates bright **highlights** where the surface reflects light
toward the camera. Blinn's modification (1977) of Phong's model uses the
**half-vector** H — the direction halfway between L and V:

```glsl
vec3 V = vec3(0.0, 0.0, 1.0);    // fixed view direction (along Z)
vec3 H = normalize(L + V);
float spec = pow(max(dot(N, H), 0.0), uSpecularPower + beatPulse * 16.0);
```

When the surface normal aligns with H, you see a bright spot. The `pow(...,
specPow)` sharpens the highlight:

```
  specPow = 4:    ████████▓▓▓▓▒▒▒▒░░░░        broad, waxy
  specPow = 32:       ████▓▒░                  medium (default)
  specPow = 128:        █░                     tiny, mirror-like
```

The specular colour is pure white (`vec3(1.0)`), which is physically correct
for non-metallic materials — they reflect the light's colour, not their own.

```glsl
lit += vec3(1.0) * spec * (0.4 + beatPulse * 0.2);
```

The `0.4` base intensity means specular highlights are always visible. On
beats, the `beatPulse * 0.2` adds up to 20% extra intensity.

---

## Why Half-Vector Instead of Reflection?

The original Phong model reflects L off the surface and measures the angle
to V:

```
  Phong:   R = reflect(-L, N)    →  spec = pow(dot(R, V), n)
  Blinn:   H = normalize(L + V)  →  spec = pow(dot(N, H), n)
```

Blinn's version is cheaper (no reflection computation) and behaves better at
grazing angles. For this effect the difference is minimal, but Blinn-Phong is
the industry standard and what this codebase uses throughout.

```
  Phong reflection model:          Blinn half-vector model:

       L    R                           L    V
        ╲  ╱                             ╲  ╱
         ╲╱                               ╲╱
  ────────●────── surface           ───────●────── surface
          ↑                               ↑
          N                               N
                                          ↑
      Compare R and V              Compare N and H=(L+V)/2
```

---

## Beat-Reactive Specular

The musical beat drives two specular modifications:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;

// 1. Sharper highlight (higher power)
float effectiveSpecPow = uSpecularPower + beatPulse * 16.0;

// 2. Brighter highlight (higher intensity)
float specIntensity = 0.4 + beatPulse * 0.2;
```

At beat onset (`uBeat = 0`), `pow(1.0, 4) = 1.0` — full effect. The quartic
decay means the flash is brief:

```
  beatPulse over time within one bar:
  1.0 ┃█
      ┃▓
      ┃ ▒
      ┃  ░
  0.0 ┃────────────────── → uBeat (0 → 1)
      beat                 next beat
```

At default `beatReactivity = 0.4`, the specular power peaks at `32 + 0.4×16
= 38.4` (6.4 units above default), and intensity peaks at `0.4 + 0.4×0.2 =
0.48`. The combined effect is a sharp flash on each beat that decays within
about 20% of the bar.

---

## The Complete Lighting Equation

All components combine in one expression:

```glsl
vec3 lit = baseColor * (uAmbient + diff * (1.0 - uAmbient));
lit += vec3(1.0) * spec * (0.4 + beatPulse * 0.2);
lit *= uFade;
```

Expanded with default values:

```
  lit = plasma_color × (0.49 + diffuse × 0.51)    // ambient + diffuse
      + white × specular × 0.4                      // specular highlight
      × fade                                        // entrance fade
```

The `uFade` multiplier ramps from 0 → 1 over the first 70 frames (~1 second),
creating a smooth fade-in. After that it stays at 1.0 for the duration.

---

## Classic vs Remastered Lighting

| Aspect | Classic | Remastered |
|--------|---------|------------|
| Granularity | One shade per entire face | Per-pixel evaluation |
| Diffuse | `(lx·nx + ly·ny + lz·nz) / 250000 + 32` | `max(dot(N, L), 0.0)` |
| Specular | None | `pow(dot(N, H), specPow)` |
| Light path | Same spline-driven orbit | Same spline-driven orbit |
| Ambient | Hardcoded offset (+32 in formula) | Tunable parameter (default 0.49) |
| Beat sync | None | Specular power + intensity pulse on beat |

---

**Next:** [Layer 5 — Bloom and Post-Processing](05-bloom-and-postfx.md)
