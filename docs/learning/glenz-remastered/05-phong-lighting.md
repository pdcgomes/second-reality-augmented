# Layer 5 — Phong Lighting

**Source:** `src/effects/glenzVectors/effect.remastered.js`, lines 46–87 (MESH_FRAG)
**Concepts:** Blinn-Phong shading, ambient/diffuse/specular components, half-vector, back-face handling, glass material

---

## What This Layer Covers

The classic Glenz used flat per-face colours — each triangle was one solid
shade. The remastered replaces this with a full **Blinn-Phong lighting model**
that gives every pixel its own shade based on surface orientation, light
direction, and camera angle. Combined with the Fresnel transparency from
[Layer 4](04-transparency.md), this creates a convincing glass material.

This is the standard lighting model used across decades of real-time graphics.
Understanding it unlocks the ability to read and write shaders for any 3D
application.

---

## The Three Components of Light

Real surfaces combine three types of light reflection. Phong's model (1975)
captures all three:

```
  Ambient           Diffuse             Specular
  ┌──────┐         ┌──────┐           ┌──────┐
  │██████│         │▓▓▒░  │           │  ·   │
  │██████│    +    │▓▒░   │     +     │      │
  │██████│         │▒░    │           │      │
  └──────┘         └──────┘           └──────┘
  Flat base         Shading from       Bright hot spot
  everywhere        light direction    (shiny reflection)
```

### Ambient

```glsl
vec3 ambient = uBaseColor * 0.15;
```

A flat 15% of the base colour everywhere. This simulates indirect light
bouncing around the scene — without it, surfaces facing away from the light
would be pure black. Glass always has some ambient glow from light passing
through it.

### Diffuse (Lambertian)

```glsl
float diff = max(dot(N, L), 0.0);
vec3 diffuse = uBaseColor * diff * 0.7;
```

**Lambert's cosine law**: the brightness of a surface is proportional to the
cosine of the angle between the surface normal and the light direction. When
the surface faces the light directly (`N·L = 1`), it is fully lit. When the
surface is perpendicular to the light (`N·L = 0`), it receives no direct
light.

```
  Light direction L
        ↘
         \    θ = angle between N and L
          \
  ─────────●──────── surface
           ↑
           N (surface normal)

  Brightness = cos(θ) = dot(N, L)
  At θ = 0°:  dot = 1.0 (fully lit)
  At θ = 90°: dot = 0.0 (edge-on, no light)
  At θ > 90°: dot < 0  (clamped to 0, in shadow)
```

The `max(..., 0.0)` prevents negative values — surfaces facing away from the
light should be dark, not negatively lit.

### Specular (Blinn half-vector)

```glsl
vec3 H = normalize(L + V);
float spec = pow(max(dot(N, H), 0.0), specPow);
vec3 specular = vec3(1.0) * spec * (0.6 + beatPulse * 0.4);
```

The original Phong model computed the reflection of L off the surface and
compared it with the view direction V. **Blinn's modification** (1977)
replaces this with the **half-vector** `H = normalize(L + V)` — the direction
halfway between the light and the camera.

When the surface normal aligns with H, you see a bright specular highlight.
The `pow(..., specPow)` controls the tightness:

```
  specPow = 8:   ████▓▓▒▒░░        (broad, matte highlight)
  specPow = 32:    ██▓▒░            (medium)
  specPow = 128:     █░             (tiny, mirror-like)
```

The default `specPow = 75` creates a moderately tight highlight appropriate
for glass. The specular colour is pure white (`vec3(1.0)`) because glass
reflects white light regardless of its tint.

---

## Beat-Reactive Specular

```glsl
float beatPulse = pow(1.0 - uBeat, 6.0);
float specPow = uSpecularPower + beatPulse * 32.0;
```

On each musical beat, `uBeat` resets to 0 and rises to 1 over the bar. The
curve `pow(1 - beat, 6)` creates a sharp spike at beat onset that decays
quickly:

```
  beatPulse
  1.0 ┃█
      ┃▓
      ┃ ▒
      ┃  ░
  0.0 ┃───────────────── → time within bar
      beat               next beat
```

This temporarily increases the specular power by up to 32, making highlights
tighter and brighter on each beat. The specular intensity also gets a 40% boost
via `0.6 + beatPulse * 0.4`. The combined effect makes the glass flash on
musical accents — a subtle but visceral connection between sound and image.

---

## Back-Face Handling

Because the polyhedra are translucent, you can see through them to the back
faces. The fragment shader handles this with a uniform flag:

```glsl
uniform bool uIsBackFace;

void main() {
  vec3 N = normalize(vNormal);
  if (uIsBackFace) N = -N;   // flip normal for inner surface
  // ... lighting calculations use the flipped N ...

  if (uIsBackFace) alpha *= 0.35;   // back faces are more transparent
}
```

**Normal flipping** ensures back faces are lit from the inside rather than
appearing as dark silhouettes. **Reduced alpha** (35% of front) makes back
faces subtler, creating the impression of looking through two layers of glass
— front wall and back wall.

```
  Cross-section of a translucent face:

  Camera →     Front face          Back face
               α = 0.55            α = 0.55 × 0.35 ≈ 0.19
               N points out        N flipped inward
               Full lighting       Dimmer, more transparent
               ▓▓▓▓▓▓▓▓▓▓▓         ░░░░░░░░░░░░
```

In the classic, back faces were simply drawn as solid colour 4 (blue) or
skipped entirely. The remastered's approach creates a more physically
plausible glass appearance.

---

## The Glass Material Model

All components combine in the fragment shader output:

```glsl
vec3 color = (ambient + diffuse + specular) * uBrightness;
fragColor = vec4(color * uFade, alpha * uFade);
```

The **brightness** multiplier (default 2.9) is unusually high — much brighter
than a typical PBR material. This is intentional: the glass faces are
translucent (alpha 0.2–0.55), so they blend subtly with the background. Higher
brightness compensates, making the glass visible and luminous rather than
ghostly.

The **fade** multiplier ramps from 0→1 at the start and 1→0 at the end,
gracefully fading the entire effect in and out.

---

## The Light Source

The directional light is hardcoded:

```glsl
vec3 L = normalize(vec3(0.5, 0.8, 0.6));
```

This places the light above and slightly to the right of the camera — a
classic 3-point lighting setup's key light position. Being a directional light
(not a point light), it illuminates all faces equally regardless of distance,
which suits the stylised look of the effect.

---

## Colour Palettes

The remastered offers 21 colour palettes, each defining RGBA values for five
face types:

```javascript
const PALETTES = [
  { name: 'Classic',
    g1Front:    [0.2, 0.5, 1.0, 0.55],     // blue, semi-transparent
    g1FrontAlt: [0.85, 0.9, 1.0, 0.45],    // white-blue, lighter
    g1Back:     [0.15, 0.25, 0.9, 0.25],   // dark blue, very transparent
    g2Front:    [1.0, 0.25, 0.15, 0.45],   // red
    g2Back:     [0.7, 0.1, 0.08, 0.3],     // dark red
  },
  // ... 20 more palettes (Emerald, Amethyst, Ice, etc.)
];
```

The `g1Front` / `g1FrontAlt` alternation reproduces the classic's blue/white
checkerboard pattern. Each palette is carefully tuned so the colours look good
when blended together at various alpha levels — a non-trivial task when
multiple translucent surfaces overlap.

---

## Classic vs Remastered Shading

| Aspect | Classic | Remastered |
|--------|---------|------------|
| Shading model | Flat per-face (one palette index) | Per-pixel Blinn-Phong |
| Light response | Cross-product Z ÷ 128 → brightness | N·L diffuse + N·H specular |
| Specular | None | `pow(N·H, 75)` + beat boost |
| Back faces | Solid colour 4 or skip | Flipped normal + 35% alpha |
| Colour depth | 6-bit VGA palette entries | Full-range float RGBA |
| Audio sync | None | Beat-reactive specular power and intensity |

---

**Next:** [Layer 6 — Bloom and Composite](06-bloom-composite.md)
