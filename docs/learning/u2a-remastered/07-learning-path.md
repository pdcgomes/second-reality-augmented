# Layer 7 — Learning Path

**Suggested experiments and exercises for deepening your understanding.**

---

## How to Use This Guide

You have read the theory. Now it is time to experiment. The best way to learn
graphics programming is to change things and see what happens. The editor in
this project lets you scrub through time and tweak parameters in real time,
making it an ideal sandbox.

Each exercise below targets a specific concept. They are ordered by difficulty.

---

## Exercise 1: Decode an Animation Frame by Hand

**Concept:** Binary animation stream, delta compression
**Difficulty:** Beginner
**No code changes needed**

Open `src/effects/u2a/engine.js` and trace `stepAnimation()` by hand. Start
with the first byte of the animation data:

1. Is it `0xFF`? If so, read the next byte — is it an FOV change or end marker?
2. Check the `0xC0` mask — which object is selected?
3. Check the `0x80`/`0x40` bits — is the object being shown or hidden?
4. Read the position format bits (`0x30`) — how many bytes are the translation
   deltas?
5. For the camera (object 0, `factor = 1`), what position delta is applied?

**Goal:** Build intuition for how a few bytes encode an entire 3D scene change.

---

## Exercise 2: Experiment with Editor Parameters

**Concept:** Post-processing, atmosphere
**Difficulty:** Beginner
**No code changes needed — use the editor's parameter panel**

Select the U2A remastered clip and adjust:

- **Horizon Glow** to 0.0 — notice the landscape loses its atmospheric feel
- **Horizon Glow** to 1.0 — an intense purple band dominates the scene
- **Bloom Threshold** to 0.0 — everything glows (dreamy fog effect)
- **Bloom Threshold** to 0.9 — only the brightest exhaust areas bloom
- **DoF Amount** to 1.0 — strong focus effect, background heavily blurred
- **DoF Amount** to 0.0 — everything is uniformly sharp
- **Shadow Opacity** to 1.0 — heavy dark patches on the terrain
- **Exhaust Hue Shift** to -0.5 and then +0.5 — watch the engine glow change colour

**Goal:** Build intuition for how each parameter group affects the final image.

---

## Exercise 3: Change the Light Direction

**Concept:** Directional lighting, dot product shading
**Difficulty:** Beginner
**File:** `src/effects/u2a/effect.remastered.js`

Find the light direction constant:

```javascript
const LIGHT = [12118 / 16384, 10603 / 16384, 3030 / 16834];
```

Try different directions:
- `[0, 16384, 0].map(v => v / 16384)` — light from directly above
- `[16384, 0, 0].map(v => v / 16384)` — light from the right
- `[0, 0, 16384].map(v => v / 16384)` — light from behind the camera
- `[0, -16384, 0].map(v => v / 16384)` — light from below (spooky)

Also update the same constant in `engine.js` to keep classic and remastered
visually consistent.

**Goal:** Understand how the light direction vector controls which faces are
lit and which are in shadow.

---

## Exercise 4: Add a Wireframe Overlay

**Concept:** GL draw modes, polygon edges
**Difficulty:** Intermediate
**File:** `src/effects/u2a/effect.remastered.js`

After the solid ship rendering pass (Pass 2), add a wireframe pass:

```javascript
gl.useProgram(shipProg);
gl.polygonOffset(-1.0, -1.0);
gl.enable(gl.POLYGON_OFFSET_FILL);
// For each ship:
//   gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
// Then disable offset
```

WebGL2 does not directly support `GL_LINE` mode on triangle data, but you can
create a line-mode index buffer at init time. An alternative is to use a
geometry-shader-like approach in the fragment shader: discard fragments that
are not near a triangle edge, using `gl_FragCoord` derivatives.

A simpler approach: add a uniform `uWireframe` to the fragment shader that,
when enabled, checks if the fragment is near a triangle edge using barycentric
coordinates passed as a varying.

**Goal:** Visualise the polygon structure of the ships.

---

## Exercise 5: Modify the Camera Path

**Concept:** Animation stream, transforms
**Difficulty:** Intermediate
**File:** `src/effects/u2a/engine.js`

After `stepAnimation()` applies the camera transform, add a post-processing
step that modifies the camera:

```javascript
// In the render loop, after engine.stepAnimation():
const cam = engine.camera;
cam[10] += Math.sin(t * 2.0) * 50;  // vertical bob
```

Try different modifications:
- Sinusoidal bob on the Y translation (`cam[10]`)
- Gradual rotation by adding to `cam[0..8]` (but be careful — the rotation
  matrix must stay orthonormal)
- Increasing the Z translation (`cam[11]`) to push the camera further back

**Goal:** Understand the relationship between the camera transform array and
what you see on screen.

---

## Exercise 6: Visualise the Depth Buffer

**Concept:** Depth testing, Z-buffer
**Difficulty:** Intermediate
**File:** `src/effects/u2a/effect.remastered.js`

Replace the composite pass with a depth visualisation. Create a simple shader:

```glsl
void main() {
  float depth = texture(uDepth, vUV).r;
  depth = pow(depth, 100.0);  // compress the range for visibility
  fragColor = vec4(vec3(depth), 1.0);
}
```

The depth buffer stores values in [0, 1] with a non-linear distribution —
most precision is near the camera. The `pow(depth, 100.0)` helps spread
the values across visible greyscale.

**Goal:** See the depth buffer that replaced painter's algorithm.

---

## Exercise 7: Disable Individual Render Passes

**Concept:** Multi-pass rendering pipeline
**Difficulty:** Intermediate
**File:** `src/effects/u2a/effect.remastered.js`

Comment out individual passes to see their contribution:

1. **Skip the background pass** — ships float in black space
2. **Skip the DoF pass** — set `dofStr = 0` to bypass depth of field
3. **Skip the bloom pipeline** — go straight from scene to screen
4. **Skip terrain shadows** — set all `shadowData` to zero

Notice how each pass contributes to the final image quality. The scene is
recognisable with just passes 1 and 2, but the post-processing passes add
the "remastered" feel.

**Goal:** Understand the visual contribution of each render pass.

---

## Exercise 8: Add Beat-Reactive Camera Shake

**Concept:** Audio-visual sync, camera manipulation
**Difficulty:** Intermediate
**File:** `src/effects/u2a/effect.remastered.js`

Add camera shake by modifying the model-view matrix before rendering ships:

```javascript
const shake = Math.pow(1.0 - beat, 8.0) * 0.5;
const shakeX = Math.sin(t * 37.0) * shake;
const shakeY = Math.cos(t * 41.0) * shake;

// Apply to each ship's model-view matrix:
curMVs[mi][12] += shakeX;
curMVs[mi][13] += shakeY;
```

The high-frequency sin/cos (37, 41 — prime numbers to avoid repeating patterns)
create a rapid jitter. The `pow(1 - beat, 8)` envelope makes the shake spike
on each beat and decay quickly.

**Goal:** Learn how to add beat-reactive camera effects.

---

## Exercise 9: Implement Ship Exhaust Particles

**Concept:** Particle systems, additive blending
**Difficulty:** Advanced
**File:** `src/effects/u2a/effect.remastered.js`

Add a particle trail behind each ship's engine:

1. Track each ship's screen position across frames
2. Emit particles at the ship's position with random velocity offsets
3. Render particles as additive-blended point sprites
4. Age particles and fade their alpha over time

You will need:
- A new VAO with per-particle position and age attributes
- A particle update step (Euler integration, like the dots simulation)
- A point-sprite vertex shader that sets `gl_PointSize`
- A fragment shader that draws a soft circle with additive blending

**Goal:** Learn particle system basics in a real rendering context.

---

## Exercise 10: Replace Palette Shading with Phong

**Concept:** Per-pixel lighting, specular highlights
**Difficulty:** Advanced
**File:** `src/effects/u2a/effect.remastered.js`

Replace the palette-ramp lookup in `SHIP_FRAG` with full Blinn-Phong lighting:

```glsl
vec3 N = normalize(vNormal);
vec3 L = normalize(uLightDir);
vec3 V = normalize(-viewPos);
vec3 H = normalize(L + V);

float diff = max(dot(N, L), 0.0);
float spec = pow(max(dot(N, H), 0.0), 64.0);

vec3 baseColor = texture(uPalette, vec2(palU, 0.5)).rgb;
vec3 color = baseColor * (0.1 + 0.8 * diff) + vec3(1.0) * spec * 0.3;
```

This replaces the stepped palette-ramp lookup with smooth per-pixel diffuse
and specular lighting. You will need to pass the view-space position from the
vertex shader to compute the view direction `V`.

**Goal:** Understand the difference between palette-ramp shading (1993) and
modern per-pixel Phong shading.

---

## Where to Go From Here

Once you are comfortable with all the above, you have a solid foundation in
real-time 3D polygon rendering. Here are topics to explore next:

- **Shadow mapping** — render depth from the light's viewpoint for cast shadows
- **Screen-space reflections (SSR)** — reflect nearby geometry using the depth buffer
- **Normal mapping** — add surface detail without extra geometry
- **Physically based rendering (PBR)** — more accurate material models
- **Tessellation** — subdivide the low-poly ships into smooth surfaces on the GPU

Each of these builds on the concepts you have learned here: vertex buffers,
matrix transforms, fragment shaders, multi-pass rendering, and FBO management.

---

**Back to:** [Overview](00-overview.md)
