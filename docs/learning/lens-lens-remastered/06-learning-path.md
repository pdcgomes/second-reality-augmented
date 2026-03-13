# Layer 6 — Learning Path

**Suggested experiments and exercises for deepening your understanding.**

---

## How to Use This Guide

You have read the theory. Now it is time to experiment. The best way to learn
graphics programming is to change things and see what happens. The editor in
this project lets you scrub through time and tweak parameters in real time,
making it an ideal sandbox.

Each exercise below targets a specific concept. They are ordered by difficulty.

---

## Exercise 1: Change the Lens Curvature

**Concept:** Snell's law, index of refraction
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

Select the LENS_LENS clip and adjust the **Refraction (IOR)** slider:

- **IOR = 1.0** — no refraction at all; background shows through undistorted
- **IOR = 1.33** — water-like; mild distortion
- **IOR = 1.45** — default; clear crystal ball
- **IOR = 2.0** — diamond-like; heavy fisheye warping
- **IOR = 2.5** — extreme; almost total internal reflection at edges

Watch how the edge distortion increases with IOR while the center stays
relatively stable.

**Goal:** Build intuition for how IOR maps to visual distortion.

---

## Exercise 2: Crank Up Chromatic Aberration

**Concept:** Wavelength dispersion, per-channel UV offset
**Difficulty:** Beginner
**No code changes needed**

Set the **Chromatic Aberration** slider to its maximum (3.0). Notice the
rainbow fringing at the lens edges. Then set it to 0 — the fringing
disappears and the ball looks cleaner.

Try combining high chromatic aberration with different IOR values. At high IOR
the edge distortion is already strong, and chromatic aberration exaggerates it
further.

**Goal:** See how per-channel UV offsets create colour separation.

---

## Exercise 3: Isolate the Specular Highlight

**Concept:** Blinn-Phong shading
**Difficulty:** Beginner
**No code changes needed**

Set these parameters:
- **Specular Intensity** to 1.5 (maximum)
- **Specular Power** to 128 (sharpest)
- **Fresnel Intensity** to 0 (disable rim glow)
- **Reflectivity** to 0 (disable environment reflection)
- **Brightness** to 0.5 (darken background to see the highlight clearly)

You should see a single bright pinpoint on the ball. Now gradually lower the
**Specular Power** from 128 toward 2 and watch the highlight spread out.

**Goal:** Understand how `pow(NdH, power)` controls highlight sharpness.

---

## Exercise 4: Visualise the Sphere Normal

**Concept:** Sphere normals, SDF
**Difficulty:** Beginner
**File:** `src/effects/lens/effect.remastered.js`

In the `SCENE_FRAG` shader, find the line:

```glsl
color = mix(color, lensColor, edge * uLensOpacity);
```

Replace it with:

```glsl
color = mix(color, N * 0.5 + 0.5, edge * uLensOpacity);
```

This maps the normal vector to RGB: red = X, green = Y, blue = Z. You will
see a rainbow sphere — the same "normal ball" visualisation used in 3D graphics
debugging.

**Goal:** See the sphere normal field that drives all the lighting calculations.

---

## Exercise 5: Change the Light Direction

**Concept:** Blinn-Phong specular, light vectors
**Difficulty:** Beginner
**File:** `src/effects/lens/effect.remastered.js`

Find this line in `SCENE_FRAG`:

```glsl
vec3 L = normalize(vec3(0.3, 0.5, 1.0));
```

Try different directions:
- `vec3(0.0, 1.0, 0.0)` — light from directly above
- `vec3(-1.0, 0.0, 0.0)` — light from the left
- `vec3(0.0, 0.0, 1.0)` — light from behind camera (flat)
- `vec3(0.0, -1.0, 0.0)` — light from below (eerie)

Watch how the specular highlight moves with the light.

**Goal:** Understand the relationship between light direction and highlight
position on a curved surface.

---

## Exercise 6: Add a Second Bouncing Lens

**Concept:** Physics simulation, shader compositing
**Difficulty:** Intermediate
**File:** `src/effects/lens/effect.remastered.js`

Create a second lens with different initial conditions:

1. Add a `computeLensPosition2` function with different starting values:
   ```javascript
   function computeLensPosition2(frame) {
     let lx = 200 * 64, ly = -80 * 64, lxa = -48, lya = 48;
     // ... same physics loop ...
   }
   ```

2. In `render()`, compute a second position and pass it as additional uniforms
   (`uLensCenter2`, `uLensRadius2`)

3. In the shader, duplicate the lens rendering block for the second ball

**Goal:** Learn how to extend a single-object effect to multiple objects,
and see how two bouncing lenses interact visually when they overlap.

---

## Exercise 7: Modify Gravity

**Concept:** Euler integration, gravity constant
**Difficulty:** Intermediate
**File:** `src/effects/lens/effect.remastered.js`

In `computeLensPosition`, change the gravity constant:

```javascript
lya += 2;   // try: lya += 1 (moon), lya += 4 (heavy), lya += 0 (zero-g)
```

- **`lya += 1`** — the ball floats longer before landing, moon-gravity feel
- **`lya += 4`** — the ball falls much faster, more aggressive bouncing
- **`lya += 0`** — no gravity; the ball drifts in a straight line forever

Also try changing the dampening:

```javascript
lya = Math.floor(-lya * 9 / 10);   // try: 1/2, 3/4, or 1/1 (no damping)
```

With `1/1` (no damping), the ball never settles — it bounces forever at the
same height.

**Goal:** Feel how gravity strength and damping ratio affect the motion
character.

---

## Exercise 8: Add Chromatic Aberration to the Background

**Concept:** Per-channel sampling, post-processing
**Difficulty:** Intermediate
**File:** `src/effects/lens/effect.remastered.js`

The chromatic aberration currently only applies inside the lens. Try applying
it to the entire background in the composite shader:

```glsl
vec2 caDir = (vUV - 0.5) * 0.003;
vec3 scene;
scene.r = texture(uScene, vUV + caDir).r;
scene.g = texture(uScene, vUV).g;
scene.b = texture(uScene, vUV - caDir).b;
```

This creates a radial chromatic aberration that increases toward the screen
edges — a common cinematic camera lens effect.

**Goal:** Understand that chromatic aberration is just per-channel UV offsets,
applicable to any texture sampling.

---

## Exercise 9: Create a Lens-Shaped Ripple

**Concept:** Time-varying displacement, animation
**Difficulty:** Advanced
**File:** `src/effects/lens/effect.remastered.js`

Replace the static refraction with a time-varying displacement that creates
a ripple effect:

```glsl
float ripple = sin(r * 20.0 - uTime * 5.0) * 0.5 + 0.5;
vec2 offset = N.xy * ripple * 0.03;
vec2 refUV = bgUV + offset * vec2(uLensRadius.x, -uLensRadius.y) * 2.0;
```

This creates concentric rings of distortion that radiate outward from the
center of the lens, like a water droplet.

**Goal:** See how time-varying displacement creates animation effects.

---

## Exercise 10: Trace the Full Rendering Pipeline

**Concept:** Multi-pass rendering, FBO flow
**Difficulty:** Advanced
**No code changes needed**

Add `console.log` statements at the start of each render pass to trace the
data flow:

1. What is the lens position at `t = 3.0`? (`computeLensPosition(210)`)
2. What UV coordinates does the lens center map to?
3. For a pixel at the lens edge, what is `r`, `nz`, and the refracted UV?
4. After bloom extraction, what fraction of pixels pass the threshold?
5. After three blur iterations, how far has the glow spread?

**Goal:** Full end-to-end understanding, from physics to post-processing.

---

## Where to Go From Here

Once you are comfortable with all the above, you have a solid understanding of
real-time refraction, compositing, and post-processing. Here are topics to
explore next:

- **Caustics**: Light patterns cast by the lens onto the background (currently
  listed as a remaining idea for this effect)
- **Cubemap reflections**: Replace the procedural noise environment with a real
  cubemap for more realistic reflections
- **Physically based rendering (PBR)**: More accurate glass material models
  with energy conservation
- **Ray marching**: Render the sphere as a signed distance field with
  volumetric interior effects
- **Compute shaders**: Move the physics simulation to the GPU for thousands of
  bouncing lenses

Each of these builds on concepts you have learned here: sphere normals,
refraction, Fresnel effects, FBOs, and multi-pass rendering.

---

**Back to:** [Overview](00-overview.md)
