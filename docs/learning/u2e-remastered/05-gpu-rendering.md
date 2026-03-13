# Layer 5 — GPU Rendering

**Source:** `src/effects/u2e/effect.remastered.js` (lines 47–957)
**Concepts:** VAO geometry extraction, palette texture lighting, modelview/projection matrices, atmospheric fog, dual-tier bloom, FBO management

---

## What This Layer Covers

The remastered variant replaces the entire classic CPU pipeline with WebGL2
rendering — vertex transformation, lighting, rasterisation, and post-processing
all happen on the GPU. But it does not throw away the original engine's design;
instead, it translates the same lighting model into GLSL.

This layer explains:

- How polygon geometry is extracted into GPU vertex buffers at init time
- How the palette-ramp lighting model is replicated with a texture lookup
- How modelview and projection matrices are built from the engine's 12-element arrays
- How atmospheric fog adds depth to the city
- How the dual-tier bloom pipeline creates glow
- How the sky background and exhaust glow enhance the scene

---

## Geometry Extraction

At `init()`, every object's polygons are converted from the engine's internal
format into GPU-friendly triangle lists:

```javascript
function extractObjectGeometry(gl, obj) {
  const positions = [], normals = [], palIdxs = [], shadeDivs = [];

  for (const poly of obj.pd) {
    const isGouraud = (poly.flags << 8) & F_GOURAUD;
    const sd = shadeDiv(poly.flags);
    const faceNormal = obj.n0[poly.NormalIndex];

    // Fan triangulation: vertex 0 shared by all triangles
    for (let i = 1; i < verts.length - 1; i++) {
      for (const vi of [verts[0], verts[i], verts[i + 1]]) {
        positions.push(v.x, v.y, v.z);
        normals.push(/* vertex or face normal */);
        palIdxs.push(poly.color);       // base palette index
        shadeDivs.push(sd);             // shade division (8, 16, 32)
      }
    }
  }
  // Upload to VAO with 4 vertex attributes
}
```

### Fan Triangulation

The original data allows polygons with 3, 4, 5+ vertices. The GPU only draws
triangles. **Fan triangulation** converts any convex polygon into triangles by
connecting vertex 0 to every other consecutive pair:

```
Quad (v0, v1, v2, v3)    →    Triangle (v0, v1, v2)
                               Triangle (v0, v2, v3)

Pentagon (v0..v4)         →    (v0,v1,v2), (v0,v2,v3), (v0,v3,v4)
```

### Per-Vertex Attributes

Each vertex carries four attributes, matching the original engine's per-polygon
properties:

| Attribute | Type | Source |
|-----------|------|--------|
| `aPosition` | vec3 | Object-space vertex position |
| `aNormal` | vec3 | Vertex normal (Gouraud) or face normal (flat) |
| `aBasePalIdx` | float | Polygon's base colour in the 256-entry palette |
| `aShadeDiv` | float | Shade division (8, 16, or 32) |

The **normal selection** at extraction time is key: Gouraud polygons get the
per-vertex normal (from `v.NormalIndex`), while flat polygons get the face
normal replicated to all three triangle vertices. This means the fragment
shader does not need to know the shading mode — the interpolated normal
naturally produces smooth or flat shading.

---

## The Palette Texture

The original 256-colour VGA palette is uploaded as a **256×1 RGBA texture**:

```javascript
function buildPaletteRGBA(scene) {
  const rgba = new Uint8Array(256 * 4);
  const k = 255 / 63;  // VGA 6-bit → 8-bit
  for (let i = 0; i < 256; i++) {
    rgba[i * 4 + 0] = Math.round(scene[i * 3 + 0] * k);
    rgba[i * 4 + 1] = Math.round(scene[i * 3 + 1] * k);
    rgba[i * 4 + 2] = Math.round(scene[i * 3 + 2] * k);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}
```

The fragment shader indexes into this texture to look up the final colour:

```glsl
float palIdx = vBasePalIdx + shade;
float palU   = (palIdx + 0.5) / 256.0;
vec3 color   = texture(uPalette, vec2(palU, 0.5)).rgb;
```

This replicates the classic engine's `basePaletteIndex + lightOffset` in GLSL,
using the GPU's texture sampling hardware instead of array indexing. The `NEAREST`
filter ensures no blending between palette entries.

---

## Lighting in the Fragment Shader

The `OBJ_FRAG` shader implements the same directional lighting as the classic
engine:

```glsl
vec3 n = normalize(vNormal);
float d = dot(n, uLightDir) / 16384.0 * 128.0;
float light = clamp(d + 128.0, 0.0, 255.0);

float shade = light / vShadeDiv;
float maxShade = 256.0 / vShadeDiv - 1.0;
shade = clamp(shade, 2.0, maxShade);
shade = floor(shade);
```

Step by step:

1. **Dot product** with the light direction — same formula as `normallight()`
2. **Bias to 0..255** — adds 128 to shift from signed to unsigned range
3. **Divide by shade divisor** — maps to the palette ramp width
4. **Clamp and floor** — produces an integer shade index
5. **Add to base palette index** — the final texture coordinate

The `floor()` call is crucial: it produces the same stepping as the classic
integer division, preserving the retro palette-banding look.

---

## Modelview and Projection Matrices

The engine stores transforms as 12-element arrays. The remastered variant
converts these to standard 4×4 matrices for the GPU:

### Modelview Matrix

```javascript
function buildModelViewMat4(objR0, camR0) {
  // Combine object rotation with camera rotation
  // Same maths as calc_applyrmatrix but output as column-major 4×4
  return new Float32Array([
    r[0], r[3], r[6], 0,   // column 0
    r[1], r[4], r[7], 0,   // column 1
    r[2], r[5], r[8], 0,   // column 2
    r[9], r[10], r[11], 1, // column 3 (translation)
  ]);
}
```

WebGL expects **column-major** layout, so the 3×3 rotation block is transposed
compared to the engine's row-major storage.

### Projection Matrix

```javascript
function buildProjectionMat4(fovDeg) {
  const projXF = (319 - 159) / Math.tan(halfFOV * π / 180);
  const projYF = projXF * (172 / 200);
  // Build asymmetric perspective matrix matching the classic viewport
  return new Float32Array([
    sx,  0,    0,                    0,
    0,  -sy,   0,                    0,
    ox,  oy,   (FAR+NEAR)/(FAR-NEAR), 1,
    0,   0,   -2*FAR*NEAR/(FAR-NEAR), 0,
  ]);
}
```

The projection matrix encodes the same field-of-view and aspect ratio
correction as the classic `calc_projection`, but in a form the GPU's
vertex shader can use as a single matrix multiply.

The **negative sy** flips the Y axis because the classic engine has Y
increasing downward (VGA convention) while OpenGL/WebGL has Y increasing upward.

---

## Atmospheric Fog

Depth-based fog is computed per-fragment using the view-space Z:

```glsl
float fogFactor = smoothstep(uFogNear, uFogFar, vViewZ) * uFogDensity;
color = mix(color, uFogColor, fogFactor);
```

```
fogFactor
  1.0 ─────────────────────────────────╱───
                                     ╱
  0.5 ─────────────────────────────╱──────
                                 ╱
  0.0 ─────────────╱──────────────────────
                fogNear      fogFar     depth →
```

Objects closer than `fogNear` are unaffected. Objects beyond `fogFar` are
fully tinted to the fog colour. The `smoothstep` creates a gradual
transition rather than a hard cutoff.

Default fog colour is `(0.76, 0.25, 0.22)` — a warm reddish tone that
creates an atmospheric haze effect for distant buildings.

---

## Sky Background

The sky is rendered as the first pass into the scene FBO with **depth writes
disabled** (`gl.depthMask(false)`). This means 3D geometry drawn afterwards
writes over the sky wherever buildings exist, but the sky remains visible
through gaps.

The sky shader has two components:

### Stars

A jittered-cell approach generates a field of twinkling stars:

```glsl
vec2 cell = floor(pixCoord / cellSize);
float presence = hash21(cell);
// Three brightness tiers:
//   dim (50%), medium (30%), bright (20%)
float twinkle = 1.0 + uStarTwinkle * sin(uTime * speed + phase) * 0.3;
```

### Volumetric Nebula

A raymarched 3D noise field produces soft purple cloud structures:

```glsl
for (int i = 0; i < NEB_STEPS; i++) {
  float density = nebulaDensity(pos, t);
  if (density > 0.005) {
    float stepTrans = exp(-density * stepSize * NEB_ABSORPTION);
    float lightAmount = nebulaLightMarch(pos, t);
    accumulated += stepColor * (1.0 - stepTrans) * transmittance;
    transmittance *= stepTrans;
  }
}
```

The nebula uses **Beer-Lambert attenuation** — the same physics that governs
how light passes through fog, smoke, and clouds. Dense regions absorb more
light and appear opaque; thin regions are translucent.

---

## Exhaust Glow

The spaceship exhaust uses the same system as U2A remastered. The fragment
shader detects exhaust pixels by their colour:

```glsl
float redness = color.r - max(color.g, color.b);
float isExhaust = smoothstep(0.15, 0.35, redness)
                * smoothstep(0.2, 0.4, color.r);
```

Then applies hue-shifted, pulsing brightness:

```glsl
vec3 hsv = rgb2hsv(color);
hsv.x = fract(hsv.x + uExhaustHueShift);
hsv.z *= (1.0 + glow);
color = mix(color, hsv2rgb(hsv), isExhaust);
```

The `uIsShip` uniform gates this entire calculation — 0.0 for non-ship
objects, 1.0 for the spaceship. This avoids the cost of RGB-to-HSV conversion
on every fragment of every building.

---

## Dual-Tier Bloom Pipeline

The bloom pipeline has three stages, using 5 FBOs:

```
sceneFBO (full res)
    │
    ▼
bloomFBO1 (half res) ← extract bright pixels
    │
    ▼
bloomFBO1 ↔ bloomFBO2 (half res) ← 3× Gaussian blur (tight bloom)
    │
    ▼
bloomWideFBO1 (quarter res) ← downsample from tight
    │
    ▼
bloomWideFBO1 ↔ bloomWideFBO2 (quarter res) ← 3× Gaussian blur (wide bloom)
    │
    ▼
screen ← composite: scene + tight + wide + scanlines
```

### Brightness Extraction

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(threshold, threshold + 0.3, brightness), 1.0);
```

The `smoothstep` creates a gradual transition at the threshold rather than a
hard cutoff, preventing bloom from flickering as objects cross the threshold.

### Separable Gaussian Blur

Each blur pass is **separable** — horizontal then vertical — using a 9-tap
kernel with pre-computed weights:

```glsl
result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
// ... (9 taps total, weights sum to 1.0)
```

Three iterations of H+V produce a wide, smooth blur. The tight bloom (half-res)
catches nearby glow; the wide bloom (quarter-res) produces the large soft halo.

### Beat-Reactive Composite

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.15)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.1);
```

The `pow(1.0 - beat, 4)` curve creates a sharp spike at beat = 0 that decays
quickly — the bloom flares on each musical beat and fades between them.

---

## FBO Resize Handling

The canvas may resize at any time (browser window, fullscreen toggle). Every
frame, the render function checks for size changes:

```javascript
if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, sceneFBO);
  // ... delete all FBOs
  sceneFBO      = createSceneFBO(gl, sw, sh);         // full res + depth
  bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);    // half res
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);    // quarter res
  fboW = sw; fboH = sh;
}
```

The scene FBO includes a **depth renderbuffer** (DEPTH_COMPONENT24) for the
hardware depth test that replaces the classic painter's algorithm. Bloom FBOs
use colour-only attachments since they only process 2D image data.

---

## Per-Frame Render Loop

The complete render pass sequence for one frame:

| Pass | Target | State | Operation |
|------|--------|-------|-----------|
| 1a | sceneFBO | Depth writes OFF | Draw sky background (stars + nebula) |
| 1b | sceneFBO | Depth test ON | Draw 42 city objects with palette lighting + fog |
| 2a | bloomFBO1 | — | Extract bright pixels (half-res) |
| 2b | bloomFBO1↔2 | — | 3× separable Gaussian blur (tight) |
| 2c | bloomWideFBO1 | — | Downsample + extract |
| 2d | wideFBO1↔2 | — | 3× separable Gaussian blur (wide) |
| 3 | screen | — | Composite: scene + tight + wide + scanlines |

For the city objects (pass 1b), the loop iterates all meshes and skips
invisible ones:

```javascript
for (let mi = 0; mi < meshes.length; mi++) {
  const mesh = meshes[mi];
  const co = engine.getObject(mesh.objIndex);
  if (!co || !co.on) continue;        // visibility culling
  const mv = buildModelViewMat4(co.o.r0, cam);
  const nm = buildNormalMat3(mv);
  gl.uniformMatrix4fv(ou.modelView, false, mv);
  gl.uniformMatrix3fv(ou.normalMat, false, nm);
  gl.uniform1f(ou.isShip, mesh.isShip ? 1.0 : 0.0);
  gl.bindVertexArray(mesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
}
```

No sorting needed — the depth buffer handles overlap automatically.

---

**Previous:** [Layer 4 — Large Scene Rendering](04-large-scene-rendering.md) · **Next:** [Layer 6 — Learning Path](06-learning-path.md)
