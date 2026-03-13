# Layer 6 — Learning Path

**Concepts:** hands-on experimentation, 3D geometry modification, shader programming, material tuning

---

## What This Layer Covers

Now that you understand the full PLZ_CUBE pipeline — procedural plasma textures,
cube geometry, spline-driven camera, Blinn-Phong lighting, and bloom
post-processing — this layer provides hands-on exercises to deepen your
understanding.

---

## Exercise 1: Replace the Cube with a Dodecahedron

**Difficulty:** Hard
**File:** `src/effects/plzCube/effect.remastered.js`, lines 132–163 (CUBE_DATA)

Replace the cube's face and vertex data with a **regular dodecahedron** — 12
pentagonal faces, 20 vertices, 36 triangles (each pentagon splits into 3
triangles via a central fan).

Steps:

1. Define 20 vertex positions. A regular dodecahedron can be constructed from
   the golden ratio φ = (1 + √5) / 2:

```javascript
const S = 125;
const phi = (1 + Math.sqrt(5)) / 2;
// 8 cube vertices: (±1, ±1, ±1)
// 4 vertices at (0, ±1/φ, ±φ)
// 4 vertices at (±1/φ, ±φ, 0)
// 4 vertices at (±φ, 0, ±1/φ)
// Scale all by S to match the cube's size
```

2. Define 12 pentagonal faces, each split into 3 triangles. Assign theme
   indices 0, 1, or 2 to pairs of opposite faces (the dodecahedron has 6 pairs
   of opposite faces — a natural fit for 3 themes × 2 faces each).

3. Each vertex still needs position (3), UV (2), normal (3), and theme (1).
   For the UV, project each pentagon's vertices onto a 2D plane using the face
   normal as the projection axis.

4. Update the index count in `drawElements` from 36 to 108 (36 triangles × 3).

```
  Regular dodecahedron (12 pentagons):

       ╱╲    ╱╲
      ╱  ╲  ╱  ╲
     ╱    ╲╱    ╲
    ╱   ╱    ╲   ╲
   ╱  ╱        ╲  ╲
  ╱ ╱            ╲ ╲
  ╲ ╲            ╱ ╱
   ╲  ╲        ╱  ╱
    ╲   ╲    ╱   ╱
     ╲    ╲╱    ╱
      ╲  ╱  ╲  ╱
       ╲╱    ╲╱

  20 vertices, 12 pentagonal faces → 36 triangles
```

**Validation:** the plasma texture and lighting should work unchanged because
they depend only on UV coordinates and normals — both of which you provide
per-vertex.

---

## Exercise 2: Animate Plasma Speed with Beat

**Difficulty:** Easy
**File:** `src/effects/plzCube/effect.remastered.js`, line 568

Currently the distortion offset advances at a fixed rate (`frame & 63`). Make
it accelerate on each beat:

```javascript
// Before: constant-speed distortion
gl.uniform1f(cu_.distOff, dd * 63);

// After: beat-modulated speed
const beatBoost = Math.pow(1.0 - beat, 4.0) * 3.0;
gl.uniform1f(cu_.distOff, (dd + beatBoost) * 63);
```

This makes the plasma wobble surge on each beat and settle between beats. The
effect is subtle but creates a visceral connection between the music and the
texture animation.

Try different multipliers:
- `1.0` — barely noticeable
- `3.0` — pleasantly rhythmic
- `10.0` — dramatic lurching

---

## Exercise 3: Add Specular Highlights (Enhance the Existing Model)

**Difficulty:** Medium
**File:** `src/effects/plzCube/effect.remastered.js`, CUBE_FRAG (lines 232–261)

The current specular model uses a fixed view direction `V = (0, 0, 1)`. Make
it track the actual camera position for more accurate highlights:

1. Compute the camera position in world space from the model-view matrix
   (extract the translation column, negate it through the rotation):

```javascript
// In the render function, after buildModelView:
const camX = -(mv[0]*mv[12] + mv[1]*mv[13] + mv[2]*mv[14]);
const camY = -(mv[4]*mv[12] + mv[5]*mv[13] + mv[6]*mv[14]);
const camZ = -(mv[8]*mv[12] + mv[9]*mv[13] + mv[10]*mv[14]);
```

2. Add a `uCameraPos` uniform to the fragment shader:

```glsl
uniform vec3 uCameraPos;
```

3. Pass the world-space vertex position to the fragment shader as a varying:

```glsl
// Vertex shader:
out vec3 vWorldPos;
vWorldPos = aPosition;   // model space ≈ world space (no model matrix)

// Fragment shader:
vec3 V = normalize(uCameraPos - vWorldPos);
```

The highlights will now shift as the camera orbits, appearing at physically
correct positions rather than always facing forward.

---

## Exercise 4: Add a Second Light Source

**Difficulty:** Medium
**File:** `src/effects/plzCube/effect.remastered.js`, CUBE_FRAG + render function

Add a stationary fill light opposite to the orbiting key light:

1. Add a `uLightDir2` uniform to the fragment shader
2. Compute a second diffuse + specular contribution
3. Use a different colour (warm amber `vec3(1.0, 0.8, 0.5)`) for the fill
   to create a **two-tone lighting** setup:

```glsl
// Key light (existing, white)
float diff1 = max(dot(N, L1), 0.0);
vec3 H1 = normalize(L1 + V);
float spec1 = pow(max(dot(N, H1), 0.0), specPow);

// Fill light (new, warm)
float diff2 = max(dot(N, L2), 0.0);
vec3 H2 = normalize(L2 + V);
float spec2 = pow(max(dot(N, H2), 0.0), specPow * 0.5);

vec3 lit = baseColor * (ambient
    + diff1 * (1.0 - ambient)
    + diff2 * (1.0 - ambient) * 0.3);
lit += vec3(1.0) * spec1 * specIntensity;
lit += vec3(1.0, 0.8, 0.5) * spec2 * specIntensity * 0.2;
```

The fill light at 30% intensity prevents hard shadows without flattening the
image.

---

## Exercise 5: Create a Custom Palette Theme

**Difficulty:** Easy
**File:** `src/effects/plzCube/effect.remastered.js`, lines 25–91 (PALETTES)

Add a new entry to the `PALETTES` array. Each theme defines three 3-stop
colour ramps — one for each face pair:

```javascript
{ name: 'Ocean',  faces: [
  [[0.02, 0.05, 0.15], [0.1, 0.4, 0.7],  [0.6, 0.9, 1.0]],   // deep → ocean → sky
  [[0.02, 0.05, 0.15], [0.0, 0.6, 0.4],  [0.3, 1.0, 0.7]],   // deep → teal → mint
  [[0.02, 0.05, 0.15], [0.3, 0.2, 0.6],  [0.7, 0.5, 1.0]],   // deep → indigo → lavender
]},
```

Design tips:
- The **lo** colour should be very dark (it represents the plasma's background)
- The **mid** colour carries the face's identity — make it vivid
- The **hi** colour should be bright (it becomes the specular region)
- Test with both high and low `bloomThreshold` — bloom bleeds the hi colour

After adding the palette, increment the `options` array in the `palette`
parameter descriptor so the editor shows the new entry.

---

## Exercise 6: Implement Rim Lighting (Fresnel Glow)

**Difficulty:** Medium
**File:** `src/effects/plzCube/effect.remastered.js`, CUBE_FRAG

Add a **Fresnel rim effect** that brightens face edges where the surface
curves away from the camera — creating a neon-outline look:

```glsl
float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);
vec3 rimColor = uPalHi[vTheme] * 0.5;   // use the bright end of the ramp
lit += rimColor * fresnel * (1.0 + beatPulse);
```

```
  Fresnel rim effect (cross-section):

  Camera →     ░░░░░▓▓██▓▓░░░░░
               edge    center    edge
               bright  normal    bright

  fresnel = pow(1 - dot(N, V), 3)
  = 0.0 at center (N faces camera)
  = 1.0 at edges (N perpendicular to camera)
```

The `pow(..., 3.0)` exponent controls how narrow the rim is:
- Exponent 1: wide, subtle glow
- Exponent 3: medium rim (recommended)
- Exponent 8: razor-thin neon edge

Combining rim lighting with beat reactivity creates a pulsing neon outline
that matches the music.

---

## Further Reading

- The classic effect spec: `docs/effects/17-plz-cube.md`
- The remastered spec: `docs/effects/17-plz-cube-remastered.md`
- LearnOpenGL Blinn-Phong: [learnopengl.com/Advanced-Lighting/Advanced-Lighting](https://learnopengl.com/Advanced-Lighting/Advanced-Lighting)
- Procedural textures: [thebookofshaders.com/11](https://thebookofshaders.com/11/)
- B-spline curves: [en.wikipedia.org/wiki/B-spline](https://en.wikipedia.org/wiki/B-spline)
- Separable Gaussian blur: [rastergrid.com/blog/2010/09/efficient-gaussian-blur-with-linear-sampling](https://rastergrid.com/blog/2010/09/efficient-gaussian-blur-with-linear-sampling/)
