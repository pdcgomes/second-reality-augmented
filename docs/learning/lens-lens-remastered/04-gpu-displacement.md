# Layer 4 — GPU Displacement

**Source:** `src/effects/lens/effect.remastered.js` (lines 39–265, SCENE_FRAG)
**Concepts:** GPU refraction, sphere normals from UV, chromatic aberration, Blinn-Phong specular, Fresnel rim, environment reflection

---

## What This Layer Covers

This is the heart of the remastered effect. The pre-computed lookup tables are
gone — replaced by a fragment shader that computes everything per-pixel:

- How the shader reconstructs a **sphere normal** from the UV coordinates
- How GLSL's `refract()` bends the UV lookup to create the distortion
- How **chromatic aberration** splits R, G, B channels for a prismatic look
- How **Blinn-Phong specular** and **Fresnel rim glow** make the ball look glassy
- How **environment reflection** adds depth to the material

---

## The Big Picture

The entire crystal ball is rendered in a single fragment shader pass. For each
pixel on screen, the shader asks: "Am I inside the lens circle?" If yes, it
computes refraction, lighting, and composites the ball over the background.

```
  For each fragment:
  ┌─────────────────────────────────────────────┐
  │  1. Compute d = (fragUV - lensCenter) / R   │
  │  2. Is dot(d,d) < 1.0?  (inside circle?)    │
  │     NO  → draw background + nebula           │
  │     YES → compute sphere normal              │
  │           → refract() to get UV offset       │
  │           → sample background at offset UV   │
  │           → add chromatic aberration          │
  │           → add specular highlight            │
  │           → add Fresnel rim glow              │
  │           → add environment reflection        │
  │           → soft-edge blend with background   │
  └─────────────────────────────────────────────┘
```

---

## Step 1: Sphere Normal From UV

The shader receives the lens center and radius as uniforms. For each fragment,
it computes local coordinates on a unit disc:

```glsl
vec2 d = (vUV - uLensCenter) / uLensRadius;
float r2 = dot(d, d);
```

If `r2 >= 1.0`, this pixel is outside the lens. Otherwise, we reconstruct the
sphere's surface normal:

```glsl
float r  = sqrt(r2);
float nz = sqrt(1.0 - r2);           // z component from sphere equation
vec3  N  = normalize(vec3(d, nz));    // unit normal pointing outward
vec3  V  = vec3(0.0, 0.0, 1.0);      // view direction (looking into screen)
```

This is the same maths from Layer 1, now expressed as shader code. The ASCII
diagram shows the relationship:

```
              N = (0, 0, 1)
              ↑  center pixel: normal faces viewer
              │
         ╭────●────╮
        ╱     │     ╲
      N↗      │      ↖N
     ╱        │        ╲
    ●─────────┼─────────●
  N→          │          ←N
              │  edge: normal perpendicular to view
```

---

## Step 2: Refraction (UV Displacement)

GLSL's built-in `refract()` computes the refracted ray direction:

```glsl
vec3 I = vec3(0.0, 0.0, -1.0);                    // incoming ray
vec3 refracted = refract(I, N, 1.0 / uLensIOR);   // Snell's law
```

The `.xy` components of the refracted vector tell us how much to shift the
background UV lookup:

```glsl
vec2 offset = refracted.xy * (1.0 - nz) * 0.5;
vec2 refUV  = bgUV + offset * vec2(uLensRadius.x, -uLensRadius.y) * 2.0;
```

The `(1.0 - nz)` factor is crucial: at the center, `nz ≈ 1` so the offset
is near zero. At the edge, `nz → 0` so the offset is at maximum. This creates
the increasing distortion toward the edges.

The background is then sampled at the displaced UV with colour grading applied:

```glsl
vec3 refImg = sampleBg(refUV);
```

---

## Step 3: Chromatic Aberration

Real glass disperses different wavelengths of light slightly differently — red,
green, and blue each refract at slightly different angles. The remastered
simulates this by sampling each colour channel at a slightly different UV:

```glsl
float ca = uLensChromaticAberration * (1.0 - nz);
vec2 caOff = N.xy * ca * 0.02;

refImg.r = sampleBg(refUV + caOff).r;   // red shifts one way
refImg.g = sampleBg(refUV).g;           // green stays centered
refImg.b = sampleBg(refUV - caOff).b;   // blue shifts the other way
```

The shift is proportional to `(1.0 - nz)` — stronger at the edges where
refraction is strongest. This produces the characteristic **rainbow fringing**
visible at the rim of the crystal ball.

```
  Without chromatic aberration:     With chromatic aberration:
  ┌─────────────┐                   ┌─────────────┐
  │  ╭───────╮  │                   │  ╭───────╮  │
  │  │ sharp │  │                   │  │ sharp │  │
  │  │ image │  │                   │  │ image │  │
  │  ╰───────╯  │                   │  ╰─R─G─B─╯  │
  │  clean edge │                   │  rainbow rim │
  └─────────────┘                   └─────────────┘
```

---

## Step 4: Specular Highlight (Blinn-Phong)

A glass ball catches the light with a bright, sharp highlight. The shader uses
**Blinn-Phong** shading — a widely used approximation of specular reflection:

```glsl
vec3 L     = normalize(vec3(0.3, 0.5, 1.0));     // light direction
vec3 halfV = normalize(L + V);                    // halfway vector
float NdH  = max(dot(N, halfV), 0.0);            // alignment with normal
float spec = pow(NdH, uLensSpecularPower) * uLensSpecularIntensity;
lensColor += vec3(1.0, 0.98, 0.95) * spec;
```

The **halfway vector** is the vector halfway between the light and the viewer.
When the surface normal aligns with this halfway vector, you see the specular
highlight.

The `pow(NdH, power)` raises the alignment to a high power, making the
highlight sharp and concentrated. Higher `uLensSpecularPower` values create a
smaller, sharper glint:

```
  Power = 5:   soft, wide highlight   ●●●●●●●●●●
  Power = 15:  moderate (default)      ●●●●●●
  Power = 64:  sharp, tiny glint         ●●
  Power = 128: razor-sharp pinpoint       ●
```

---

## Step 5: Fresnel Rim Glow

The **Fresnel effect** describes how surfaces become more reflective at grazing
angles. Look at a glass ball from straight on — you see through it. Look at the
edges — they appear brighter and more reflective.

```glsl
float NdV    = max(dot(N, V), 0.0);
float fresnel = pow(1.0 - NdV, uLensFresnelExponent) * uLensFresnelIntensity;
lensColor   += vec3(0.4, 0.5, 0.7) * fresnel;
```

`N · V` is 1.0 at the center (normal faces viewer) and 0.0 at the edge.
`1 - N·V` inverts this, and `pow()` controls the falloff curve:

```
  Exponent = 1.0:  linear rim glow (gentle gradient)
  Exponent = 2.0:  tighter rim (more concentrated at edges)
  Exponent = 5.0:  very thin bright ring at the edge

  ╭───────────╮
  │ ░░░░░░░░░ │  exponent 1.0: whole edge region glows
  │ ░░░    ░░░│
  │ ░░      ░░│
  │ ░░░    ░░░│
  │ ░░░░░░░░░ │
  ╰───────────╯

  ╭───────────╮
  │ ▒         │  exponent 5.0: only the very rim glows
  │          ▒│
  │           │
  │          ▒│
  │ ▒         │
  ╰───────────╯
```

The rim glow is tinted blue-ish (`vec3(0.4, 0.5, 0.7)`) to give the ball a
cool, glassy feel.

---

## Step 6: Environment Reflection

Glass reflects its surroundings, not just the background directly behind it.
The shader simulates this with a procedural noise-based environment map:

```glsl
vec3 R = reflect(-V, N);
float envNoise = fbm(R.xy * 2.0 + uTime * 0.1);
vec3 envColor = mix(vec3(0.1, 0.15, 0.3), vec3(0.3, 0.2, 0.4), envNoise);
lensColor = mix(lensColor, envColor, uLensReflectivity * (1.0 - NdV));
```

The reflection direction `R` is computed from the view and normal. Instead of
sampling a cubemap (which would require additional texture data), the shader
uses **fractal Brownian motion** (FBM) noise evaluated at the reflection
direction. This creates slowly-shifting abstract reflections that suggest a
surrounding environment without requiring one.

The `(1.0 - NdV)` factor means reflections are stronger at the edges (where
you would naturally see more reflection on real glass) — the same Fresnel
principle as the rim glow.

---

## Step 7: Soft Edge Blend

The final step blends the lens over the background with a soft edge:

```glsl
float edge = smoothstep(1.0, 0.92, r);
color = mix(color, lensColor, edge * uLensOpacity);
```

`smoothstep(1.0, 0.92, r)` creates a smooth transition from 0 (at `r = 1.0`,
the very edge) to 1 (at `r = 0.92` and inward). This prevents a hard circular
boundary and gives the ball a natural, antialiased outline.

`uLensOpacity` handles the fade-in over frames 32–96 (as discussed in Layer 3).

---

## Eye Glow Through the Lens

The KOE background has glowing eyes that should be visible through the lens.
The shader computes the eye glow at the **refracted** UV — not the fragment's
own UV — so the glow appears to shift as you look through the ball:

```glsl
float dLE = distance(refUV, eyeL);
float dRE = distance(refUV, eyeR);
float glowLE = exp(-dLE * dLE / (uEyeGlowRadius * uEyeGlowRadius));
float glowRE = exp(-dRE * dRE / (uEyeGlowRadius * uEyeGlowRadius));
lensColor += glowColor * (glowLE + glowRE) * uEyeGlowIntensity;
```

This is a small but important detail that maintains visual continuity with the
LENS_ROTO effect that precedes this one in the demo.

---

## Summary: What Happens Inside the Lens Circle

```
  Fragment UV
      │
      ▼
  Compute sphere normal N from unit disc
      │
      ▼
  refract(I, N, 1/IOR) → UV offset
      │
      ├── Sample R channel at refUV + caOffset
      ├── Sample G channel at refUV
      ├── Sample B channel at refUV - caOffset
      │
      ▼
  Refracted image (with chromatic aberration)
      │
      ├── + Blinn-Phong specular highlight
      ├── + Fresnel rim glow
      ├── + environment reflection
      ├── + eye glow at refracted UV
      │
      ▼
  smoothstep edge blend with background
      │
      ▼
  Final pixel colour
```

---

## Key Takeaways

- The GPU computes refraction **per-pixel** using `refract()`, replacing 34 KB
  of pre-computed tables with a few lines of GLSL
- **Chromatic aberration** samples R, G, B at slightly different UVs, creating
  prismatic edge fringing
- **Blinn-Phong specular** creates a sharp light glint; `pow(NdH, power)`
  controls its size
- **Fresnel rim glow** makes edges brighter, mimicking real glass behaviour
- **Environment reflection** uses procedural noise instead of a cubemap — a
  lightweight trick for abstract reflections
- The soft `smoothstep` edge and opacity fade-in ensure the ball blends
  naturally into the scene

---

**Previous:** [Layer 3 — Bounce Physics](03-bounce-physics.md) · **Next:** [Layer 5 — Bloom and Palette](05-bloom-and-palette.md)
