# Layer 8 — Learning Path

**Suggested experiments and exercises for deepening your understanding.**

---

## How to Use This Guide

You have read the theory. Now it is time to experiment. The best way to learn
graphics programming is to change things and see what happens. The editor in
this project lets you scrub through time and tweak parameters in real time,
making it an ideal sandbox.

Each exercise below targets a specific concept. They are ordered by difficulty.

---

## Exercise 1: Trace the Simulation by Hand

**Concept:** Physics simulation, Euler integration
**Difficulty:** Beginner
**No code changes needed**

Pick frame 50. Work through `simulateDots(50)` on paper:

1. What spawn phase are we in? (Frame 50 < 500, so it is the spiral rise.)
2. For dot `j = 50`, compute the x, y, z coordinates using the `isin`/`icos`
   formulas. (Hint: `f = 50`, so `isin(50 * 11) = sin(π * 550 / 512) * 255`)
3. How much has `dropper` decreased? (It starts at 22000, decreasing by 100
   per frame when > 4000.)
4. What is `gravity` at this point? (It starts at 3.)
5. After 50 frames of `yadd += gravity` and bouncing, where would a dot that
   started at the top end up?

**Goal:** Build intuition for how the numbers become motion.

---

## Exercise 2: Change the Light Direction

**Concept:** Phong lighting
**Difficulty:** Beginner
**File:** `src/effects/dots/effect.remastered.js`

Find this line in `SPHERE_FRAG`:

```glsl
vec3 L = normalize(vec3(0.4, 0.8, 0.5));
```

Try changing it:
- `vec3(0.0, 1.0, 0.0)` — light directly from above
- `vec3(-1.0, 0.0, 0.0)` — light from the left
- `vec3(0.0, 0.0, 1.0)` — light from behind the camera (everything flat-lit)
- `vec3(0.0, -1.0, 0.0)` — light from below (spooky underlighting)

**Goal:** Understand how the light direction vector affects shading.

---

## Exercise 3: Remove the Specular Highlight

**Concept:** Ambient/diffuse/specular components
**Difficulty:** Beginner
**File:** `src/effects/dots/effect.remastered.js`

In `SPHERE_FRAG`, change:

```glsl
vec3 color = ambient + diffuse + specular;
```

To:

```glsl
vec3 color = ambient + diffuse;
```

Notice how the spheres look flat and matte without the specular highlight.
Then try removing diffuse and keeping only specular — now you see just the
shiny hot spot.

**Goal:** See how the three lighting components contribute to the final look.

---

## Exercise 4: Visualise the Surface Normal

**Concept:** Sphere impostor SDF, normals
**Difficulty:** Beginner
**File:** `src/effects/dots/effect.remastered.js`

Replace the final output of `SPHERE_FRAG` with:

```glsl
fragColor = vec4(N * 0.5 + 0.5, 1.0);
```

This maps the normal vector (-1..+1) to colours (0..+1):
- Red = X component (left/right)
- Green = Y component (up/down)
- Blue = Z component (toward camera)

You will see spheres coloured like a rainbow ball — this is a standard
**normal map visualisation** used extensively in graphics debugging.

**Goal:** See the sphere normals that the impostor trick produces.

---

## Exercise 5: Experiment with Bloom Parameters

**Concept:** Post-processing, bloom pipeline
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

In the editor, select the DOTS clip and adjust:

- **Bloom Threshold** to 0.0 — everything blooms (the scene looks dreamy/foggy)
- **Bloom Threshold** to 0.9 — only the very brightest spots bloom
- **Bloom Strength** to 2.0 — extreme glow
- **Bloom Strength** to 0.0 — no bloom at all (notice how the scene feels flatter)
- **Scanlines** to 0.5 — heavy CRT effect

**Goal:** Build intuition for how post-processing parameters affect mood.

---

## Exercise 6: Disable the Reflection Pass

**Concept:** Multi-pass rendering, reflections
**Difficulty:** Intermediate
**File:** `src/effects/dots/effect.remastered.js`

Comment out the reflection pass (lines 460-473) and set `reflectionFBO` to
clear black. The floor will show the grid lines and base colour but no
reflected dots. This shows how much the reflections contribute to the
"premium" feel.

**Goal:** Understand the visual impact of each render pass.

---

## Exercise 7: Change the Sphere to a Different Shape

**Concept:** Signed distance fields
**Difficulty:** Intermediate
**File:** `src/effects/dots/effect.remastered.js`

Replace the sphere SDF in `SPHERE_FRAG`:

For a **diamond/rhombus**:
```glsl
float dist = abs(vLocalUV.x) + abs(vLocalUV.y);
if (dist > 1.0) discard;
vec3 N = normalize(vec3(sign(vLocalUV.x), sign(vLocalUV.y), 1.0));
```

For a **rounded square**:
```glsl
vec2 d = abs(vLocalUV) - vec2(0.7);
float dist = length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - 0.2;
if (dist > 0.0) discard;
vec3 N = vec3(vLocalUV * 0.5, sqrt(1.0 - dot(vLocalUV * 0.5, vLocalUV * 0.5)));
```

**Goal:** Understand that the impostor technique works with any shape that can
be expressed as a distance function.

---

## Exercise 8: Add a Second Light Source

**Concept:** Multi-light shading
**Difficulty:** Intermediate
**File:** `src/effects/dots/effect.remastered.js`

In `SPHERE_FRAG`, add a second light:

```glsl
vec3 L2 = normalize(vec3(-0.6, 0.3, 0.4));
float diff2 = max(dot(N, L2), 0.0);
vec3 H2 = normalize(L2 + V);
float spec2 = pow(max(dot(N, H2), 0.0), specPow);

vec3 diffuse = baseColor * (diff * 0.5 + diff2 * 0.3);
vec3 specular = vec3(1.0) * (spec * 0.4 + spec2 * 0.2);
```

Experiment with different colours for each light (e.g., warm key light +
cool fill light).

**Goal:** Learn how multiple light sources combine.

---

## Exercise 9: Trace Data Through the Full Pipeline

**Concept:** End-to-end understanding
**Difficulty:** Advanced

Pick a single dot (say dot index 100). Add `console.log` statements to trace
its journey through every stage:

1. What are its `x, y, z` after simulation?
2. What are `bp`, `screenX`, `screenY` after projection?
3. What are `ndcX`, `ndcY` sent to the GPU?
4. In the vertex shader, what `gl_Position` does it produce?
5. In the fragment shader, what colour does the center pixel get?

**Goal:** Full end-to-end understanding, from physics to pixel.

---

## Exercise 10: Create a Trail Effect

**Concept:** Temporal accumulation, FBO chaining
**Difficulty:** Advanced
**File:** `src/effects/dots/effect.remastered.js`

Add a trail by blending the previous frame with the current one:

1. Create a new FBO pair (`trailFBO1`, `trailFBO2`)
2. Before the composite pass, blend the current scene with the previous trail:
   - Draw `trailFBO1` with alpha 0.92 (keep 92% of previous frame)
   - Draw the current scene on top with alpha 1.0
   - Swap trail FBOs
3. Use the trail texture instead of the scene texture in the composite

**Goal:** Learn temporal accumulation — the basis for motion blur, trails,
and many screen-space effects.

---

## Where to Go From Here

Once you are comfortable with all the above, you have a solid foundation in
real-time graphics. Here are topics to explore next:

- **Shadow mapping** — rendering depth from the light's perspective for shadows
- **Screen-space ambient occlusion (SSAO)** — darkening creases and corners
- **Deferred rendering** — storing geometry data in multiple textures (G-buffer)
- **Physically based rendering (PBR)** — more accurate material models
- **Compute shaders** — using the GPU for physics/simulation directly

Each of these builds on the concepts you have learned here: FBOs, multi-pass
rendering, shaders reading from previous passes, and mathematical models
translated into GPU code.

---

**Back to:** [Overview](00-overview.md)
