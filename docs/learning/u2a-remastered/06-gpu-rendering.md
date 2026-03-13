# Layer 6 — GPU Rendering Pipeline

**Source:** `src/effects/u2a/effect.remastered.js`, lines 396–456 (geometry extraction), lines 689–941 (render passes)
**Concepts:** Vertex buffers, VAOs, palette-texture shading, FBO ping-pong, depth of field, dual-tier bloom

---

## What This Layer Covers

- How ship geometry is extracted into GPU **vertex buffers** at init time
- How the 5-pass rendering pipeline produces the final frame
- How the **palette-texture lookup** replicates the original's shading on the GPU
- How **depth of field** dynamically focuses on the nearest ship
- How **dual-tier bloom** adds tight and wide glow
- How **terrain shadows** darken the landscape beneath flying ships

---

## Geometry Extraction: Mesh to VAO

At init time, the remastered variant walks each ship's polygon list and
converts it to GPU-ready triangle data. Since GPUs draw triangles (not
arbitrary polygons), each N-sided polygon is fan-triangulated:

```javascript
for (const poly of obj.pd) {
  const verts = poly.vertex;
  for (let i = 1; i < verts.length - 1; i++) {
    const triVerts = [verts[0], verts[i], verts[i + 1]];
    for (const vi of triVerts) {
      positions.push(v.x, v.y, v.z);
      normals.push(n.x, n.y, n.z);
      palIdxs.push(poly.color);
      shadeDivs.push(sd);
    }
  }
}
```

Each triangle vertex carries four attributes:

| Attribute      | Type     | Size | Purpose |
|----------------|----------|------|---------|
| `aPosition`    | vec3     | 12B  | World-space vertex position |
| `aNormal`      | vec3     | 12B  | Vertex or face normal (depends on Gouraud flag) |
| `aBasePalIdx`  | float    | 4B   | Base palette index for the material |
| `aShadeDiv`    | float    | 4B   | Shade division (8, 16, or 32) |

These are packed into four separate GPU buffers and bound to a **Vertex Array
Object** (VAO) — a single object that records the buffer layout for fast
binding at draw time:

```javascript
const vao = gl.createVertexArray();
gl.bindVertexArray(vao);
// ... bind 4 buffers with gl.vertexAttribPointer ...
gl.bindVertexArray(null);
return { vao, vertCount, bufs: [posBuf, normBuf, palBuf, sdBuf] };
```

Three VAOs are created — one per ship (is01, Sippi, moottori).

---

## The 5-Pass Pipeline

Each frame flows through five render passes:

```
Pass 1: Background + terrain shadows  →  sceneFBO (full res)
            │
Pass 2: 3D ship meshes (depth test)   →  sceneFBO (full res)
            │
Pass 3: Depth-of-field blur           →  dofFBO (half res → full res)
            │
Pass 4: Dual-tier bloom               →  bloom FBOs (half + quarter res)
            │
Pass 5: Final composite               →  screen
```

### Pass 1: Background

The background shader renders the ALKU landscape at native resolution with
three additions:

- **Horizon glow** — a purple band with sinusoidal pulsing
- **Terrain shadows** — soft circular darkening beneath each visible ship
- **Beat brightness** — overall intensity pulse synced to the music

```glsl
color = texture(uLandscape, vec2(landscapeUVx, landscapeUVy)).rgb;
color += horizonGlow(uv, uTime);
color *= 1.0 - terrainShadow(uv);
```

The terrain shadow is computed per-ship by projecting each ship's screen
position down to the landscape:

```javascript
shadowData[mi * 4]     = sp.u;           // screen X of ship
shadowData[mi * 4 + 1] = terrainY;       // fixed Y = 0.76 (ground level)
shadowData[mi * 4 + 2] = shadowSize * sizeScale;  // radius scales with distance
shadowData[mi * 4 + 3] = shadowOpacity;
```

### Pass 2: Ship Meshes

Ships are rendered with hardware depth testing enabled. For each visible ship:

1. Build the **model-view matrix** from the engine's current transforms
2. Extract the **normal matrix** (upper-left 3×3 of the model-view)
3. Bind the ship's VAO
4. Issue a single `gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount)` call

```javascript
gl.enable(gl.DEPTH_TEST);
gl.useProgram(shipProg);
gl.uniformMatrix4fv(shu.projection, false, proj);

for (let mi = 0; mi < shipMeshes.length; mi++) {
  const co = engine.getObject(shipMeshes[mi].objIndex);
  if (!co.on) continue;
  gl.uniformMatrix4fv(shu.modelView, false, curMVs[mi]);
  gl.uniformMatrix3fv(shu.normalMat, false, nm);
  gl.bindVertexArray(mesh.vao);
  gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
}
```

---

## Palette-Texture Shading

The fragment shader replicates the original's palette-ramp lighting using a
256×1 RGBA texture containing the full VGA palette:

```glsl
// Compute light intensity (same formula as classic engine)
float d = dot(n, uLightDir) / 16384.0 * 128.0;
float light = clamp(d + 128.0, 0.0, 255.0);

// Divide by shade division to get palette ramp index
float shade = light / div;
shade = clamp(shade, 2.0, maxShade);
shade = floor(shade);

// Look up the final colour from the palette texture
float palIdx = vBasePalIdx + shade;
float palU = (palIdx + 0.5) / 256.0;
vec3 color = texture(uPalette, vec2(palU, 0.5)).rgb;
```

The `+ 0.5` offset ensures the texture sample falls on the centre of a palette
entry rather than the boundary between two entries.

### Exhaust Glow

The fragment shader detects reddish palette entries (engine exhaust areas) and
applies an emissive glow with HSV hue shifting:

```glsl
float redness = color.r - max(color.g, color.b);
float isExhaust = smoothstep(0.15, 0.35, redness) * smoothstep(0.2, 0.4, color.r);

vec3 hsv = rgb2hsv(color);
hsv.x = fract(hsv.x + uExhaustHueShift);   // shift hue
hsv.z *= (1.0 + glow);                      // boost brightness
vec3 emissive = hsv2rgb(hsv);
color = mix(color, emissive, isExhaust);
```

---

## Pass 3: Depth of Field

The DoF pass creates a focus effect that tracks the nearest ship. The focus
depth is smoothed over time to avoid jarring jumps:

```javascript
if (anyShipVisible) {
  focusDepth += (nearestShipDepth - focusDepth) * 0.08;   // smooth toward ship
} else {
  focusDepth += (1.0 - focusDepth) * 0.02;                // relax to infinity
}
```

The blur is computed at half resolution using 3 iterations of the separable
Gaussian. The DoF composite shader blends sharp and blurry based on depth
distance from the focus point:

```glsl
float dist = abs(depth - uFocusDepth);
float coc = smoothstep(0.0, uDofRange, dist) * uDofStrength;
fragColor = vec4(mix(sharp, blurry, coc), 1.0);
```

**Circle of confusion** (`coc`) is the optical term for how defocused a point
becomes. Points at the focus distance have `coc = 0` (sharp); points far from
focus have `coc → dofStrength` (maximum blur).

---

## Pass 4: Dual-Tier Bloom

The bloom pipeline extracts bright pixels and blurs them at two scales:

```
Scene → [Extract bright pixels at half-res]
              │
              v
         [3× Gaussian H+V]  →  Tight bloom (half-res)
              │
              v
         [Downsample to quarter-res]
              │
              v
         [3× Gaussian H+V]  →  Wide bloom (quarter-res)
```

The extraction shader uses luminance-weighted brightness:

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

Each Gaussian iteration uses **ping-pong rendering** between two FBOs —
horizontal pass writes to FBO-A, vertical pass reads from FBO-A and writes
to FBO-B, then the next iteration reverses. Three iterations (6 passes)
produce a wide, smooth blur.

---

## Pass 5: Final Composite

The composite shader combines the scene with both bloom layers and adds
beat-reactive intensity:

```glsl
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.15)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.1);
```

Bloom is additive — it adds light, never subtracts. The beat pulse formula
`pow(1.0 - beat, 4.0)` creates a sharp spike at each bar start that
decays rapidly.

---

## GPU Resource Summary

| Resource | Count | Details |
|----------|-------|---------|
| Shader programs | 6 | BG, Ship, DoF, Bloom extract, Blur, Composite |
| VAOs | 3 | One per ship object |
| Textures | 2 (persistent) | Landscape (NEAREST), palette (256×1, NEAREST) |
| FBOs | 8 | Scene+depth, DoF, 2× DoF blur, 2× tight bloom, 2× wide bloom |

All GPU resources are properly cleaned up in `destroy()`:

```javascript
destroy(gl) {
  for (const prog of [bgProg, shipProg, dofProg, ...])
    if (prog) gl.deleteProgram(prog);
  for (const m of shipMeshes) {
    gl.deleteVertexArray(m.vao);
    for (const b of m.bufs) gl.deleteBuffer(b);
  }
  for (const fbo of [sceneFBO, dofFBO, ...])
    deleteFBO(gl, fbo);
}
```

---

## FBO Resize Strategy

FBOs must match the canvas size. The renderer checks each frame and rebuilds
when the dimensions change:

```javascript
if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, sceneFBO);       // destroy old
  sceneFBO = createSceneFBO(gl, sw, sh);       // full res + depth
  dofBlurFBO1 = createFBO(gl, sw >> 1, sh >> 1);  // half res
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2); // quarter res
  fboW = sw; fboH = sh;
}
```

The bit-shift operators (`>> 1`, `>> 2`) compute half and quarter dimensions
efficiently. This pattern ensures the effect works at any resolution — from a
small editor preview to fullscreen 4K.

---

**Next:** [Layer 7 — Learning Path](07-learning-path.md)
