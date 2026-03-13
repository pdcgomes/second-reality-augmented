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

## Exercise 1: Explore the Editor Parameters

**Concept:** Atmospheric tuning, post-processing
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

Select the COMAN clip in the editor and experiment with these combinations:

- Set **Fog Intensity** to 0.0 — notice how flat and uniform the terrain looks
  without atmospheric depth
- Set **Fog Intensity** to 1.0 — the terrain vanishes into haze almost
  immediately
- Set **Z-Wave Amplitude** to 0 — the rolling undulation disappears, leaving
  just the height map terrain
- Set **Z-Wave Amplitude** to 48 — extreme undulation, the terrain becomes a
  wild sine-wave ocean
- Set **Height Scale** to 0.3 — nearly flat terrain, like a calm sea
- Set **Height Scale** to 3.0 — exaggerated peaks and valleys
- Try the **Synthwave** or **Dracula** colour theme — see how the mat3 remap
  completely changes the mood

**Goal:** Build intuition for how each parameter affects the visual output.

---

## Exercise 2: Add a Water Plane

**Concept:** Height thresholding, conditional colouring
**Difficulty:** Beginner
**File:** `src/effects/coman/effect.remastered.js`

In the `SCENE_FRAG` shader, after the ray march finds a terrain hit, add a
water plane at a fixed height. Find the line where `found` is set to `true`
and add a water colour for low terrain:

```glsl
if (found) {
  // Add water plane: if terrain is below threshold, colour it blue
  float waterLevel = -200.0;
  if (rawH < waterLevel) {
    color = vec3(0.02, 0.06, 0.15);  // dark water
    // Optional: add specular highlight based on distance
    float specular = pow(max(0.0, 1.0 - abs(fj - 40.0) / 40.0), 4.0);
    color += vec3(0.1, 0.15, 0.2) * specular;
  }
  color = mat3(uColorR, uColorG, uColorB) * color;
  color = max(color, vec3(0.0));
}
```

You will need to store the `rawH` value that produced the hit. Try different
`waterLevel` thresholds to find a value that creates a pleasing ocean-and-land
mix.

**Goal:** Understand how height thresholds can create distinct terrain features
from a single height field.

---

## Exercise 3: Change Terrain Colours with Depth

**Concept:** Distance-based colour variation
**Difficulty:** Beginner
**File:** `src/effects/coman/effect.remastered.js`

Instead of using the palette for all terrain, blend between two colours based
on ray depth. In `SCENE_FRAG`, replace the palette lookup with:

```glsl
float depthT = float(j) / float(BAIL);   // 0.0 near, 1.0 far

vec3 nearColor = vec3(0.1, 0.8, 0.3);    // bright green (near)
vec3 farColor  = vec3(0.05, 0.15, 0.4);  // dark blue (far)
vec3 palColor  = mix(nearColor, farColor, depthT);
```

Try using the terrain height to modulate the colour too:

```glsl
float heightT = clamp((rawH + 240.0) / 200.0, 0.0, 1.0);
vec3 lowColor  = vec3(0.1, 0.2, 0.05);   // dark green (valleys)
vec3 highColor = vec3(0.9, 0.85, 0.7);   // sandy beige (peaks)
vec3 palColor  = mix(lowColor, highColor, heightT);
palColor = mix(palColor, farColor, depthT * 0.5); // fade at distance
```

**Goal:** Learn how to build procedural terrain colouring from height and
distance — the same principles used in open-world game terrain shaders.

---

## Exercise 4: Experiment with Ray Step Count vs Quality

**Concept:** Performance vs visual quality tradeoff
**Difficulty:** Intermediate
**File:** `src/effects/coman/effect.remastered.js`

Change the maximum iterations in the fragment shader from 128 to lower values:

```glsl
// Try each of these:
for (int iter = 0; iter < 32; iter++) {    // very coarse — visible gaps
for (int iter = 0; iter < 64; iter++) {    // moderate — some holes in far terrain
for (int iter = 0; iter < 128; iter++) {   // default — full coverage
for (int iter = 0; iter < 256; iter++) {   // overkill — visually identical to 128
```

For each setting, observe:

1. How far does terrain extend before disappearing?
2. Are there visible "holes" where rays missed the terrain?
3. Does the frame rate change noticeably? (Use the browser's performance
   tools or `requestAnimationFrame` timing)

Also try changing the bail-and-double threshold:

```glsl
int j = (iter < 32) ? iter : (32 + (iter - 32) * 2);  // double earlier
if (iter == 32) { localDx *= 2.0; localDy *= 2.0; }
```

Doubling earlier saves iterations but creates more visible stepping in
mid-distance terrain.

**Goal:** Understand the fundamental tradeoff between ray step count,
rendering distance, and performance in raymarching algorithms.

---

## Exercise 5: Visualise the Ray Distance

**Concept:** Debug visualisation, depth buffers
**Difficulty:** Intermediate
**File:** `src/effects/coman/effect.remastered.js`

Replace the terrain colour output with a depth visualisation. After the march
loop finds a hit:

```glsl
if (found) {
  float depth = float(j) / float(BAIL);
  color = vec3(depth);  // white = far, black = near
}
```

You will see a greyscale depth map of the terrain. Try these variations:

- `vec3(1.0 - depth)` — invert: white = near, black = far
- `vec3(depth, 1.0 - depth, 0.0)` — green near, red far
- `vec3(fract(depth * 10.0))` — repeating bands showing depth contours

This is a standard graphics debugging technique. Depth visualisation helps you
understand how rays traverse the terrain and where the march reaches its limit.

**Goal:** Learn to use debug visualisations for understanding shader behaviour.

---

## Exercise 6: Add a Second Z-Wave Harmonic

**Concept:** Additive wave synthesis, terrain complexity
**Difficulty:** Intermediate
**File:** `src/effects/coman/effect.remastered.js`

The current z-wave is a single sine cycle. Add a second harmonic for richer
undulation. In the `SCENE_FRAG` shader, find:

```glsl
rawH += uZWaveAmp * sin(float(j) * PI * 2.0 * uZWaveFreq / float(BAIL));
```

Add a second harmonic:

```glsl
rawH += uZWaveAmp * sin(float(j) * PI * 2.0 * uZWaveFreq / float(BAIL));
rawH += uZWaveAmp * 0.5 * sin(float(j) * PI * 2.0 * uZWaveFreq * 2.3 / float(BAIL));
```

The second wave has half the amplitude and 2.3× the frequency, creating a
more complex undulation pattern. Experiment with different frequency ratios
and amplitude scales. Using non-integer frequency ratios (2.3, 3.7) produces
more organic, less repetitive terrain than integer ratios (2.0, 3.0).

**Goal:** Understand additive synthesis — the same principle used in Perlin
noise, ocean simulations, and procedural terrain generation.

---

## Exercise 7: Disable the Bloom Pipeline

**Concept:** Multi-pass rendering, visual impact
**Difficulty:** Intermediate
**File:** `src/effects/coman/effect.remastered.js`

In the `render()` function, skip the bloom passes and render the scene
directly to screen. Replace the composite pass with:

```javascript
gl.bindFramebuffer(gl.FRAMEBUFFER, null);
gl.viewport(0, 0, sw, sh);
// Just blit the scene texture directly
gl.useProgram(bloomExtractProg);
gl.activeTexture(gl.TEXTURE0);
gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
gl.uniform1i(beu.scene, 0);
gl.uniform1f(beu.threshold, -1.0);  // pass everything through
quad.draw();
```

Compare the result with the full bloom pipeline. Notice how much the bloom
contributes to the "atmospheric" feel — without it, the terrain looks sharp
but clinical.

**Goal:** Understand the visual impact of post-processing in modern rendering.

---

## Exercise 8: Create a Terrain Normal Map

**Concept:** Numerical derivatives, surface normals, lighting
**Difficulty:** Advanced
**File:** `src/effects/coman/effect.remastered.js`

The terrain currently has no lighting — colour comes only from the palette.
Add simple directional lighting by computing approximate surface normals from
the height map. In the fragment shader, after sampling `rawH`, also sample
the height at two neighbouring points:

```glsl
float hCenter = sampleWave(uWave1, xw) + sampleWave(uWave2, yw);
float hRight  = sampleWave(uWave1, xw + 2.0) + sampleWave(uWave2, yw);
float hUp     = sampleWave(uWave1, xw) + sampleWave(uWave2, yw + 2.0);

vec3 normal = normalize(vec3(hCenter - hRight, 2.0, hCenter - hUp));
vec3 lightDir = normalize(vec3(0.4, 0.8, 0.3));
float diffuse = max(dot(normal, lightDir), 0.0) * 0.6 + 0.4;

color *= diffuse;
```

This computes a **finite-difference surface normal** — the same technique used
in terrain rendering for flight simulators and games. The cross product of the
two tangent vectors (right and up) gives the surface normal.

**Goal:** Learn how to add lighting to height-field terrain using numerical
derivatives — a foundation for more advanced terrain shading.

---

## Where to Go From Here

Once you are comfortable with all the above, you have a solid foundation in
VoxelSpace rendering and height-field terrain. Here are topics to explore next:

- **Texture splatting** — blend multiple terrain textures based on height and
  slope (grass on flat areas, rock on steep slopes)
- **Shadow mapping** — render the terrain from the light's point of view to
  cast shadows from peaks onto valleys
- **LOD terrain** — clipmap or quadtree-based terrain for rendering large
  worlds at varying detail levels
- **Hydraulic erosion** — simulate water flow to carve realistic valleys into
  procedural height maps
- **Atmosphere scattering** — physically based sky rendering with Rayleigh and
  Mie scattering

Each of these builds on the concepts you have learned here: height fields,
raymarching, distance-based fog, and shader-based terrain rendering.

---

**Back to:** [Overview](00-overview.md)
