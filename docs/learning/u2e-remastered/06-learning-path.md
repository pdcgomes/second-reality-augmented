# Layer 6 — Learning Path

**Suggested experiments and exercises for deepening your understanding.**

---

## How to Use This Guide

You have read the theory. Now it is time to experiment. The best way to learn
3D engine architecture is to change things and see what happens. The editor
lets you scrub through time and tweak 21 parameters in real time, making it an
ideal sandbox for the exercises below.

Each exercise targets a specific concept. They are ordered by difficulty.

---

## Exercise 1: Explore the Parameter Panel

**Concept:** Post-processing, fog, bloom
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

Select the U2E clip in the editor and scrub to a moment when the city is
fully visible (around t=5s into the clip). Then try:

- **Fog Density** to 1.0 — the city fades into coloured haze
- **Fog Density** to 0.0 — buildings are crisp to infinity
- **Fog Near** to 0, **Fog Far** to 5000 — very close fog, only nearby buildings visible
- **Bloom Threshold** to 0.0 — everything glows (dreamy look)
- **Bloom Strength** to 2.0 — extreme glow halos
- **Scanlines** to 0.5 — heavy CRT effect over the 3D scene

**Goal:** Build intuition for how fog, bloom, and scanlines shape the mood.

---

## Exercise 2: Change the Fog Colour

**Concept:** Atmospheric depth cues
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

The default fog colour is warm reddish `(0.76, 0.25, 0.22)`. Try:

- **Fog Red=0.0, Green=0.2, Blue=0.5** — cold blue fog (underwater feel)
- **Fog Red=1.0, Green=0.9, Blue=0.7** — warm sunset fog
- **Fog Red=0.0, Green=0.0, Blue=0.0** — black fog (buildings fade to void)
- **Fog Red=1.0, Green=1.0, Blue=1.0** — white fog (snowy atmosphere)

Notice how the fog colour drastically changes the mood even though the geometry
and lighting are identical.

**Goal:** Understand that atmosphere is a colour-space operation, not a
geometry operation.

---

## Exercise 3: Change Building Heights

**Concept:** Vertex data, geometry extraction
**Difficulty:** Intermediate
**File:** `src/effects/u2e/effect.remastered.js`

Find the `extractObjectGeometry` function. After extracting positions, add a
Y-scale modifier:

```javascript
for (let i = 1; i < positions.length; i += 3) {
  positions[i] *= 2.0;  // double all Y coordinates
}
```

Reload the effect. Buildings will be twice as tall. Try values like 0.5
(squat buildings), 3.0 (skyscrapers), or even -1.0 (inverted city).

**Goal:** Understand that geometry is just numbers — changing them changes the
world. The lighting, fog, and bloom all adapt automatically because they operate
on the transformed geometry.

---

## Exercise 4: Visualise Normals as Colours

**Concept:** Surface normals, lighting input
**Difficulty:** Intermediate
**File:** `src/effects/u2e/effect.remastered.js`

In the `OBJ_FRAG` shader, replace the final `fragColor` line with:

```glsl
vec3 n = normalize(vNormal);
fragColor = vec4(n * 0.5 + 0.5, 1.0);
```

This maps normals to colours:
- **Red** = faces pointing right (+X)
- **Green** = faces pointing up (+Y)
- **Blue** = faces pointing toward camera (+Z)

You will see a rainbow city where each face's colour reveals its orientation.
This is the standard **normal map visualisation** used in graphics debugging.

**Goal:** See the surface normals that drive the lighting model.

---

## Exercise 5: Disable the Depth Buffer

**Concept:** Painter's algorithm vs depth buffer
**Difficulty:** Intermediate
**File:** `src/effects/u2e/effect.remastered.js`

In the `render()` function, comment out the depth test lines:

```javascript
// gl.enable(gl.DEPTH_TEST);
// gl.depthFunc(gl.LESS);
// gl.depthMask(true);
```

Reload and observe: objects draw in the order they appear in the mesh array,
which is the engine's object index order — not sorted by distance. Nearby
buildings are overwritten by distant ones. This is exactly the problem the
classic variant's painter's algorithm + special-case sorting solves, and
exactly the problem the hardware depth buffer eliminates.

**Goal:** Understand why depth testing matters for correct 3D rendering.

---

## Exercise 6: Experiment with Camera Speed

**Concept:** Animation playback, frame rate relationship
**Difficulty:** Intermediate
**File:** `src/effects/u2e/effect.remastered.js`

Find the line that computes the animation frame:

```javascript
const animFrame = Math.floor((frame70 - ANIM_START_FRAME70) / 2);
```

Change the divisor:
- `/1` — double speed (every 70 Hz tick advances the animation)
- `/4` — half speed (smooth slow-motion flyover)
- `/8` — very slow, lets you study the city geometry in detail

**Goal:** Understand the relationship between display frame rate, VGA 70 Hz
clock, and animation playback rate. The geometry and lighting stay the same;
only the rate of camera movement changes.

---

## Exercise 7: Add a Second Light Source

**Concept:** Multi-directional lighting
**Difficulty:** Intermediate
**File:** `src/effects/u2e/effect.remastered.js`

In the `OBJ_FRAG` shader, add a second directional light:

```glsl
// After the existing light calculation:
vec3 lightDir2 = normalize(vec3(-0.5, -0.8, 0.3));
float d2 = dot(n, lightDir2) / 16384.0 * 128.0;
float light2 = clamp(d2 + 128.0, 0.0, 255.0);
float shade2 = clamp(light2 / div, 2.0, maxShade);

// Blend the two light contributions:
shade = mix(shade, shade2, 0.3);
```

The city will have fill lighting from a second direction, reducing harsh
shadows on faces that point away from the primary light.

**Goal:** Understand how multiple light sources combine. The original used a
single directional light because each extra light doubled the CPU cost. On
the GPU, adding lights is nearly free.

---

## Exercise 8: Add Distance-Based Object Fading

**Concept:** Per-object uniforms, depth perception
**Difficulty:** Intermediate
**File:** `src/effects/u2e/effect.remastered.js`

Add a uniform to the object shader for per-object opacity. In the render loop,
compute opacity from distance:

```javascript
const dist = Math.sqrt(
  mv[12]*mv[12] + mv[13]*mv[13] + mv[14]*mv[14]
);
const opacity = 1.0 - Math.min(dist / 100000, 0.8);
gl.uniform1f(ou.opacity, opacity);
```

In the fragment shader, multiply the output alpha:

```glsl
fragColor = vec4(color, uOpacity);
```

Enable blending and sort objects back-to-front (like the classic variant).

**Goal:** Understand the tradeoff between depth buffer rendering (no sorting,
opaque only) and blended rendering (requires sorting, supports transparency).

---

## Exercise 9: Trace a Single Object Through the Pipeline

**Concept:** End-to-end understanding
**Difficulty:** Advanced

Pick object index 5. Add `console.log` statements to trace its journey:

1. What is `co[5].o.name`? What type of object is it?
2. At frame 100, is `co[5].on` true or false?
3. What are the 12 values of `co[5].o.r0`?
4. What modelview matrix does `buildModelViewMat4` produce?
5. How many triangles does `meshes[?].vertCount / 3` contain?
6. In the fragment shader, what palette index does a typical face produce?

**Goal:** Full end-to-end understanding, from binary data to pixel colour.

---

## Exercise 10: Implement Simple Shadow Mapping

**Concept:** Multi-pass rendering, shadow mapping
**Difficulty:** Advanced
**File:** `src/effects/u2e/effect.remastered.js`

This is a substantial exercise. The idea:

1. Create a new FBO with a depth-only attachment (the **shadow map**)
2. Add a new render pass that draws all objects from the **light's perspective**
   into the shadow map (only depth, no colour)
3. In the main `OBJ_FRAG` shader, sample the shadow map to determine whether
   each fragment is in shadow:

```glsl
vec4 lightSpacePos = uLightMVP * vec4(worldPos, 1.0);
vec3 projCoords = lightSpacePos.xyz / lightSpacePos.w * 0.5 + 0.5;
float closestDepth = texture(uShadowMap, projCoords.xy).r;
float shadow = projCoords.z > closestDepth + 0.005 ? 0.3 : 1.0;
color *= shadow;
```

Buildings will cast shadows on each other and on the ground. This is listed
as an unimplemented idea in the remastered docs.

**Goal:** Learn shadow mapping — the standard technique for real-time shadows.
It builds directly on the FBO and multi-pass rendering concepts from Layer 5.

---

## Where to Go From Here

Once you are comfortable with the exercises above, you have a solid
understanding of scene-graph 3D rendering — from binary data loading through
GPU post-processing. Here are topics to explore next:

- **Normal mapping** — adding surface detail to flat polygon faces via tangent-space normal textures
- **Screen-space ambient occlusion (SSAO)** — darkening corners and creases for depth
- **Frustum culling** — testing object bounding boxes against the camera frustum to skip invisible objects entirely
- **Level of detail (LOD)** — switching to simpler meshes for distant objects
- **Deferred rendering** — writing geometry data to a G-buffer for efficient multi-light shading

Each of these builds on the concepts in this guide: scene graphs, transform
pipelines, FBO management, and shader-based lighting.

---

**Back to:** [Overview](00-overview.md)
