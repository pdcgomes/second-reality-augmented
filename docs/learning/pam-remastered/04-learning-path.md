# Layer 4 — Learning Path

**Suggested experiments and exercises for deepening your understanding.**

---

## How to Use This Guide

You have read the theory. Now it is time to experiment. The best way to learn
graphics programming is to change things and see what happens. The editor in
this project lets you scrub through time and tweak parameters in real time,
making it an ideal sandbox.

Each exercise below targets a specific concept from Layers 1–3. They are
ordered by difficulty.

---

## Exercise 1: Change the Playback Speed

**Concept:** Frame timing, FRAME_RATE constant
**Difficulty:** Beginner
**File:** `src/effects/pam/effect.remastered.js`

Find the frame rate constant:

```javascript
const FRAME_RATE = 70 / 4;  // 17.5 fps
```

Try changing the divisor:
- `70 / 2` (35 fps) — the explosion plays at double speed, finishing in ~1.2 seconds
- `70 / 8` (8.75 fps) — slow-motion explosion, the white flash lingers longer
- `70 / 1` (70 fps) — the entire 41-frame sequence blazes past in under a second

Scrub through the timeline and observe how the **PALETTE_FADE** curve
stretches or compresses. The same fade values are visited, but at different
real-world times.

**Goal:** Understand the relationship between `FRAME_RATE`, `t`, and the
animation frame index.

---

## Exercise 2: Reshape the White Flash Curve

**Concept:** PALETTE_FADE, emotional timing
**Difficulty:** Beginner
**File:** `src/effects/pam/effect.remastered.js`

The PALETTE_FADE array controls the white flash envelope. Try replacing it
with a different curve:

**Symmetric fade** (equal in and out):
```javascript
const PALETTE_FADE = [
  63, 48, 32, 16, 8, 4, 2, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 2, 4, 8, 16, 32, 48, 63, 63, 63, 63,
];
```

**No flash at all** (just the explosion):
```javascript
const PALETTE_FADE = new Array(60).fill(0);
```

**Pulsing flash** (two peaks):
```javascript
const PALETTE_FADE = [
  63, 32, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 32, 63, 32, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 2, 4, 6, 9, 14, 20, 28, 37, 46, 56, 63,
];
```

**Goal:** Feel how the flash curve shapes the emotional impact. The original
exponential decay (63, 32, 16, 8...) feels like a real explosion flash. A
linear ramp feels artificial by comparison.

---

## Exercise 3: Tint the Explosion

**Concept:** Hue shifting, colour manipulation in shaders
**Difficulty:** Beginner
**No code changes needed — use the editor**

Select the PAM clip in the editor and adjust these parameters:

- **Smoke Hue** to `0.0` — warm brown smoke (neutral)
- **Smoke Hue** to `1.5` — green toxic cloud
- **Smoke Hue** to `-3.0` — reddish hellfire
- **Ember Hue** to `1.0` — blue-green embers (alien fire)
- **Smoke Warmth** to `0.0` — cold, ashy smoke
- **Smoke Warmth** to `1.0` — fiery orange-tinted smoke

The hue shift uses **Rodrigues' rotation** around the (1,1,1) axis in RGB
space — the mathematical equivalent of spinning a colour wheel:

```glsl
vec3 hueShift(vec3 col, float angle) {
  vec3 k = vec3(0.57735);  // normalised (1,1,1)
  return col * cos(angle)
       + cross(k, col) * sin(angle)
       + k * dot(k, col) * (1.0 - cos(angle));
}
```

**Goal:** Understand that a single angle parameter can completely transform
the colour palette of a complex effect.

---

## Exercise 4: Add Motion Blur Between Frames

**Concept:** Temporal accumulation, FBO chaining
**Difficulty:** Intermediate
**File:** `src/effects/pam/effect.remastered.js`

Create a trail effect by blending the current scene with the previous frame:

1. Add a new FBO pair in the init/resize logic:

```javascript
let trailFBO1, trailFBO2;
// In the resize block:
trailFBO1 = createFBO(gl, sw, sh);
trailFBO2 = createFBO(gl, sw, sh);
```

2. After the scene pass (before bloom), add a trail blend:
   - Render `trailFBO1` (previous frame) onto `trailFBO2` at alpha 0.85
   - Render `sceneFBO` on top with alpha 1.0
   - Swap `trailFBO1` and `trailFBO2`
   - Use `trailFBO1` as the input to the bloom pipeline

3. The 0.85 factor means 85% of the previous frame persists. Try different
   values:
   - 0.95 — heavy ghosting, the explosion leaves long smoky trails
   - 0.70 — subtle motion blur
   - 0.50 — barely visible trails

**Goal:** Learn temporal accumulation — the same principle behind motion blur,
light trails, and ghosting effects in games and demos.

---

## Exercise 5: Visualise the Volumetric Density Field

**Concept:** Raymarching, density functions
**Difficulty:** Intermediate
**File:** `src/effects/pam/effect.remastered.js`

Replace the volumetric blast's colour accumulation with a density
visualisation. In the `blastWave` function, change the final output to:

```glsl
// Instead of returning accumulated colour:
return vec3(1.0 - transmittance);  // white = dense smoke, black = clear
```

This shows the raw **opacity** of the smoke field without lighting or colour.
You will see the expanding disc shape clearly — radial falloff creating a
wide flat cloud, vertical compression keeping it pancake-thin.

Then try visualising just the density at a single depth slice:

```glsl
vec3 pos = vec3(screenPos, 0.0);
float d = smokeDensity(pos, explosionT);
return vec3(d);
```

**Goal:** Understand the 3D density field that the raymarcher integrates
through. Seeing it in isolation demystifies the volumetric rendering.

---

## Exercise 6: Modify the Lava Core Colour Ramp

**Concept:** Procedural colour, heat-to-colour mapping
**Difficulty:** Intermediate
**File:** `src/effects/pam/effect.remastered.js`

Find the five colour stops in the `lavaCore` function:

```glsl
vec3 c1 = vec3(0.08, 0.02, 0.0);    // dark ember
vec3 c2 = vec3(0.55, 0.08, 0.0);    // deep red
vec3 c3 = vec3(1.0, 0.4, 0.0);      // orange
vec3 c4 = vec3(1.0, 0.75, 0.1);     // yellow
vec3 c5 = vec3(1.0, 0.97, 0.8);     // white-hot
```

Try alternative ramps:

**Blue plasma** (sci-fi energy core):
```glsl
vec3 c1 = vec3(0.0, 0.0, 0.08);
vec3 c2 = vec3(0.0, 0.08, 0.55);
vec3 c3 = vec3(0.0, 0.4, 1.0);
vec3 c4 = vec3(0.3, 0.75, 1.0);
vec3 c5 = vec3(0.8, 0.97, 1.0);
```

**Green toxic** (radioactive explosion):
```glsl
vec3 c1 = vec3(0.02, 0.08, 0.0);
vec3 c2 = vec3(0.08, 0.55, 0.0);
vec3 c3 = vec3(0.4, 1.0, 0.0);
vec3 c4 = vec3(0.75, 1.0, 0.2);
vec3 c5 = vec3(0.97, 1.0, 0.85);
```

**Goal:** Understand how a 5-stop colour gradient creates the illusion of
temperature variation in a procedural fire effect.

---

## Exercise 7: Increase Raymarching Quality

**Concept:** Raymarching step count vs performance
**Difficulty:** Advanced
**File:** `src/effects/pam/effect.remastered.js`

Find the raymarching constants:

```glsl
const int VOL_STEPS = 12;
const int LIGHT_STEPS = 4;
const float ABSORPTION = 9.0;
```

Try increasing them:
- `VOL_STEPS = 32` — smoother smoke density integration, but slower
- `LIGHT_STEPS = 12` — more accurate self-shadowing, subtle quality gain
- `ABSORPTION = 3.0` — thinner, more transparent smoke
- `ABSORPTION = 20.0` — thick, opaque smoke that barely lets light through

Watch the frame rate in the editor as you increase step counts. On a
mid-range GPU, going from 12 to 64 volume steps will noticeably drop the
frame rate. This is the fundamental **quality vs performance tradeoff** of
raymarching.

**Goal:** Build intuition for how raymarching step count affects both visual
quality and GPU cost.

---

## Exercise 8: Disable Individual Visual Layers

**Concept:** Multi-layer compositing, visual contribution
**Difficulty:** Advanced
**File:** `src/effects/pam/effect.remastered.js`

In the `main()` function of `SCENE_FRAG`, comment out layers one at a time to
see their individual contribution:

1. Comment out `bg += horizonGlow(...)` — the purple horizon disappears
2. Comment out `bg += starLight` — no twinkling stars
3. Replace `lavaCore(...)` with `vec4(0.0)` — no molten core, just smoke
4. Replace `blastWave(...)` with `vec3(0.0)` — no volumetric smoke, just core
5. Comment out `color = mix(color, vec3(1.0), uWhiteFlash)` — no white flash

Each layer contributes a specific emotional quality:
- **Lava core** = violence, heat, danger
- **Volumetric blast** = scale, atmosphere, physicality
- **Horizon glow** = otherworldly ambiance
- **Stars** = cosmic scale (default density is 0, but try 0.5)
- **White flash** = shock, transition, narrative punctuation

**Goal:** Understand how layered compositing builds visual complexity from
individually simple elements.

---

## Where to Go From Here

Once you are comfortable with all the above, you have a solid understanding
of procedural explosion rendering. Here are topics to explore next:

- **Particle systems** — replace the shader-computed embers with GPU-simulated particles (transform feedback or compute shaders)
- **Screen-space distortion** — add a shockwave ripple that displaces UV coordinates radially from the explosion center
- **Camera shake** — apply a noise-driven offset to the UV coordinates to simulate the concussive impact
- **Volumetric lighting** — add god rays emanating from the core using radial blur in screen space

Each of these builds on the concepts from this guide: FBOs, multi-pass
rendering, noise functions, and the coordinate systems that map screen
space to world space.

---

**Back to:** [Overview](00-overview.md)
