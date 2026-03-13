# Layer 5 — Learning Path

**Suggested experiments and exercises for deepening your understanding.**

---

## How to Use This Guide

You have read the theory. Now it is time to experiment. The best way to learn
graphics programming is to change things and see what happens. The editor in
this project lets you scrub through time and tweak parameters in real time,
making it an ideal sandbox.

Each exercise below targets a specific concept. They are ordered by difficulty.

---

## Exercise 1: Change the Rotation Speed

**Concept:** Animation curves, displacement vectors
**Difficulty:** Beginner
**File:** `src/effects/rotozoom/effect.remastered.js`

Find the rotation acceleration in `computeAnimParams()`:

```javascript
if (f > 25) { if (d3 < 0.02) d3 += 0.00005; }
```

Try these changes:
- **Double the acceleration:** `d3 += 0.0001` — the image spins up much faster
- **Increase the cap:** `d3 < 0.04` — the maximum rotation speed doubles
- **Remove the cap:** Delete the `d3 < 0.02` check — rotation accelerates without limit
- **Reverse rotation:** Change `d3 += 0.00005` to `d3 -= 0.00005`

Scrub through the timeline in the editor to see how each change affects the
rotation arc. Notice how the acceleration feels organic compared to a constant
rotation speed.

**Goal:** Understand how rotation velocity `d3` accumulates into angle `d2`.

---

## Exercise 2: Change the Source Image

**Concept:** Texture preparation, indexed colour
**Difficulty:** Beginner
**File:** `src/effects/rotozoom/effect.remastered.js`

Replace the KOE texture with a simple procedural pattern. In `init()`, after
the `rgba` array is built, overwrite it:

```javascript
for (let y = 0; y < 256; y++) {
  for (let x = 0; x < 256; x++) {
    const i = (y * 256 + x) * 4;
    rgba[i]     = x;                         // R = horizontal gradient
    rgba[i + 1] = y;                         // G = vertical gradient
    rgba[i + 2] = (x ^ y);                   // B = XOR pattern
    rgba[i + 3] = 255;
  }
}
```

The XOR pattern (`x ^ y`) creates a classic demoscene fractal texture. Watch
how the rotozoom transforms it — the repetition and symmetry of XOR art
produces mesmerising interference patterns when rotated.

**Goal:** See how different source images change the visual character of the
rotozoom. Any 256×256 image can be used.

---

## Exercise 3: Stack Two Rotozooms

**Concept:** Multi-layer blending, UV transforms
**Difficulty:** Intermediate
**File:** `src/effects/rotozoom/effect.remastered.js`

In the SCENE_FRAG shader, sample the texture twice with different transforms:

```glsl
// First rotozoom (original)
vec2 texCoord1 = uBase + vUV.x * uSpanX + fy * uSpanY;
vec3 img1 = texture(uTex, texCoord1 / 256.0).rgb;

// Second rotozoom (offset rotation)
vec2 texCoord2 = uBase * 0.5 + vUV.x * uSpanX * -0.7 + fy * uSpanY * -0.7;
vec3 img2 = texture(uTex, texCoord2 / 256.0).rgb;

// Blend based on luminance
float luma1 = dot(img1, vec3(0.299, 0.587, 0.114));
vec3 img = mix(img2, img1, luma1);
```

The second rotozoom rotates in the opposite direction (negative scale) at a
different speed. Blending by luminance makes bright areas of the first layer
dominate while dark areas reveal the second layer — creating a layered,
translucent effect.

**Goal:** Understand how multiple UV transforms can combine in a single shader.

---

## Exercise 4: Add Sinusoidal Distortion

**Concept:** UV distortion, wave functions
**Difficulty:** Intermediate
**File:** `src/effects/rotozoom/effect.remastered.js`

Before the texture lookup in SCENE_FRAG, add a wavy distortion:

```glsl
float fy = 1.0 - vUV.y;
vec2 texCoord = uBase + vUV.x * uSpanX + fy * uSpanY;

// Add sine wave distortion
texCoord.x += sin(texCoord.y * 0.1 + uTime * 3.0) * 5.0;
texCoord.y += cos(texCoord.x * 0.08 + uTime * 2.0) * 4.0;

vec2 texUV = texCoord / 256.0;
```

This applies a ripple effect to the rotozoom. Experiment with:
- **Frequency** (`0.1`, `0.08`): Higher values = tighter waves
- **Amplitude** (`5.0`, `4.0`): Larger values = more distortion
- **Speed** (`3.0`, `2.0`): How fast the waves move
- **Using `uBeat`**: `sin(texCoord.y * 0.1 + pow(1.0-uBeat, 2.0) * 20.0)` for
  beat-synced ripples

**Goal:** Learn how simple math applied to UV coordinates before sampling can
produce complex visual distortion.

---

## Exercise 5: Experiment with Lens Material

**Concept:** Blinn-Phong specular, Fresnel rim
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

In the editor, select the LENS_ROTO clip and adjust:

- **Specular Power** to 2 — huge, soft highlight covering most of the sphere
- **Specular Power** to 128 — tiny, laser-sharp glint
- **Specular Intensity** to 0 — no highlight at all (compare with the Fresnel rim)
- **Fresnel Intensity** to 1 — heavy rim glow (the edges dominate)
- **Fresnel Exponent** to 0.5 — broad rim (covers more of the surface)
- **Fresnel Exponent** to 5 — razor-thin rim
- **Reflectivity** to 0.5 — heavy environment reflection (the noise pattern dominates)
- **All lens params** to 0 — flat rotozoom with no material (like classic)

**Goal:** Build intuition for how specular, Fresnel, and reflection components
interact to create a convincing glass surface.

---

## Exercise 6: Modify the Eye Glow

**Concept:** Gaussian falloff, toroidal distance
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

Adjust eye glow parameters in the editor:

- **Eye Glow** to 3.0 — eyes blaze with intense light
- **Eye Glow** to 0 — eyes are just bright pixels (like classic)
- **Glow Radius** to 0.15 — the glow covers most of the face
- **Glow Radius** to 0.01 — pinpoint glow, barely visible
- **Glow Color** to 200 — blue eyes (cold, alien)
- **Glow Color** to 120 — green eyes (eerie)
- **Glow Color** to 0 — red eyes (demonic)
- **Beat Reactivity** to 1.0 — eyes throb dramatically with the music

**Goal:** See how Gaussian falloff radius and colour transform the mood.

---

## Exercise 7: Visualise the Bloom Layers

**Concept:** Post-processing pipeline, FBO chain
**Difficulty:** Intermediate
**File:** `src/effects/rotozoom/effect.remastered.js`

To see what each bloom layer contributes, modify the composite shader
(`COMPOSITE_FRAG`) to show only one component:

```glsl
// Show only the tight bloom (replace the composite body):
vec3 color = texture(uBloomTight, vUV).rgb;

// Or show only the wide bloom:
vec3 color = texture(uBloomWide, vUV).rgb;

// Or show the raw scene without any bloom:
vec3 color = texture(uScene, vUV).rgb;
```

Switch between these to see:
- The **scene** has sharp detail but no glow
- The **tight bloom** has a focused halo around bright spots
- The **wide bloom** has a soft, diffuse glow covering larger areas
- The **composite** combines all three for depth

**Goal:** Understand what each render pass contributes to the final image.

---

## Exercise 8: Create a Palette Theme System

**Concept:** Colour grading, uniform-driven variation
**Difficulty:** Intermediate
**File:** `src/effects/rotozoom/effect.remastered.js`

Add a "theme" selector by combining the existing colour parameters:

| Theme | Hue Shift | Saturation | Brightness | Eye Hue |
|-------|-----------|------------|------------|---------|
| Classic | 0 | 0 | 0.77 | 6 |
| Ice | 180 | 0.3 | 0.9 | 200 |
| Inferno | 30 | 0.5 | 1.0 | 15 |
| Void | 270 | -0.3 | 0.5 | 280 |

Try each combination in the editor's parameter panel. Then consider: how would
you add a single "theme" parameter that selects between these presets?

**Goal:** See how a few colour controls create dramatically different moods from
the same source image.

---

## Exercise 9: Add a Vignette

**Concept:** Screen-space effects, radial falloff
**Difficulty:** Intermediate
**File:** `src/effects/rotozoom/effect.remastered.js`

In the SCENE_FRAG shader, after the lens material and before the fade, add:

```glsl
// Vignette: darken edges
vec2 vigUV = vUV * 2.0 - 1.0;
float vignette = 1.0 - dot(vigUV, vigUV) * 0.4;
color *= clamp(vignette, 0.0, 1.0);
```

This darkens the corners and edges, drawing the eye toward the centre. Adjust
the `0.4` multiplier to control how aggressive the vignette is.

**Goal:** Learn how screen-space distance functions create post-processing effects.

---

## Exercise 10: Build a Rotozoom From Scratch

**Concept:** End-to-end understanding
**Difficulty:** Advanced

Create a minimal rotozoom in a new HTML file:

1. Set up a WebGL2 canvas
2. Create a 256×256 checkerboard texture
3. Write a fragment shader that takes `uAngle` and `uScale` uniforms
4. Compute `texCoord = rotationMatrix(uAngle) * uScale * screenCoord`
5. Sample with `texture(uTex, texCoord)` using `REPEAT` wrapping
6. Animate `uAngle` with `requestAnimationFrame`

Start with constant scale and linear rotation. Then add:
- Oscillating scale: `scale = 1.0 + 0.5 * sin(time)`
- Orbital offset: `base = vec2(sin(time), cos(time)) * 0.3`
- A real image instead of the checkerboard

**Goal:** Full end-to-end understanding — from matrix maths to animated pixels.

---

## Where to Go From Here

Once you are comfortable with all the above, you have a solid foundation in
texture mapping and real-time effects. Here are topics to explore next:

- **Perspective-correct texture mapping** — how 3D engines handle non-affine transforms
- **Mipmapping** — pre-filtered texture levels that prevent aliasing when zoomed out
- **Procedural textures** — generating images entirely in the shader (no source data)
- **Displacement mapping** — using texture data to deform geometry, not just colour
- **Compute shaders** — running the rotozoom as a compute kernel instead of a fragment shader

Each of these builds on the concepts you have learned here: UV transforms,
texture sampling, shader-based post-processing, and animation curves.

---

**Back to:** [Overview](00-overview.md)
