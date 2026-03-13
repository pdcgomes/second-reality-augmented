# Layer 6 — Bloom and Composite

**Source:** `src/effects/glenzVectors/effect.remastered.js`, lines 89–204 (ground + bloom + composite shaders), lines 606–780 (render passes)
**Concepts:** MSAA framebuffers, checkerboard background, multi-pass compositing, dual-tier bloom, beat reactivity

---

## What This Layer Covers

The 3D meshes and lighting from previous layers produce a scene rendered into
an off-screen buffer. This layer explains the final stages that bring
everything together on screen:

- MSAA (multi-sample anti-aliasing) for smooth polygon edges
- The checkerboard ground plane from `glenzTransition/data.js`
- The multi-pass FBO pipeline: scene → bloom extract → blur → composite
- Dual-tier bloom tuned for translucent geometry
- Beat-reactive bloom pulsing

---

## MSAA Framebuffer

The GLENZ effect is the only effect in the project that uses **MSAA** (Multi-
Sample Anti-Aliasing). While other effects are fullscreen-quad fragment shaders
where per-pixel computation naturally produces smooth edges, this effect
renders actual 3D triangle meshes. Triangle edges would show visible staircase
aliasing without MSAA.

```javascript
msaaSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
```

The MSAA FBO uses a renderbuffer (not a texture) with 4× multi-sampling.
After the scene is rendered, it is resolved (blitted) to a regular texture
FBO for the bloom pipeline:

```javascript
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFBO.fb);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO.fb);
gl.blitFramebuffer(0, 0, sw, sh, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.LINEAR);
```

The `blitFramebuffer` call resolves the multi-sampled data into a single
sample per pixel, averaging the sub-samples to produce smooth edges.

---

## The Checkerboard Ground

The ground plane below the polyhedra uses a checkerboard texture loaded from
`glenzTransition/data.js`. It is rendered as a fullscreen quad with a custom
fragment shader that maps a vertical strip of the screen (rows 153–199 in
classic 200-pixel space) to the texture:

```glsl
float groundTop = 0.765;
if (uv.y < groundTop) { discard; }

float t = (uv.y - groundTop) / (1.0 - groundTop);
vec2 checkerUV = vec2(uv.x, t * 0.49);
vec3 color = texture(uCheckerTex, checkerUV).rgb;
```

The `discard` above the ground line keeps the upper portion transparent.
The texture UV mapping compresses the bottom 23.5% of the screen into the
top 49% of the checker texture, creating a crude perspective foreshortening —
the checkerboard squares appear to recede into the distance.

The ground shader also supports HSV colour adjustment:

```glsl
vec3 hsv = rgb2hsv(color);
hsv.x = fract(hsv.x + uCheckerHue / 360.0);
hsv.y = clamp(hsv.y * uCheckerSaturation, 0.0, 1.0);
hsv.z *= uCheckerBrightness;
color = hsv2rgb(hsv);
```

This allows the editor to shift the checkerboard's hue, saturation, and
brightness independently, matching it to any palette theme.

---

## Render Order

The complete render pass order:

```
1. Clear MSAA FBO to black
2. Draw checkerboard ground (alpha blend)
3. Draw Glenz2 (back object, sorted faces, alpha blend)
4. Draw Glenz1 (front object, sorted faces, alpha blend)
5. Blit MSAA → scene FBO (resolve)
6. Bloom extract → half-res FBO
7. 3× H+V Gaussian blur (tight bloom)
8. Bloom extract → quarter-res FBO
9. 3× H+V Gaussian blur (wide bloom)
10. Composite: scene + tight + wide → screen
```

Steps 2–4 all render into the same MSAA framebuffer with alpha blending
enabled. The painter's algorithm (drawing far objects first) ensures correct
transparency ordering for the translucent faces.

---

## Bloom Pipeline

The GLENZ bloom uses separate tight and wide bloom strength controls:

```glsl
vec3 color = scene
  + tight * (uBloomTightStr + beatPulse * uBeatBloom)
  + wide  * (uBloomWideStr  + beatPulse * uBeatBloom * 0.6);
```

| Parameter | Default | Purpose |
|-----------|---------|---------|
| `bloomTightStr` | 0.75 | Focused glow around bright specular highlights |
| `bloomWideStr` | 0.4 | Soft ambient glow across the glass surfaces |
| `beatBloom` | 0.25 | Additional bloom on each beat pulse |

The beat pulse uses `pow(1 - beat, 6)` — a steeper exponent than most effects
(which use `pow(4)`). This creates a sharper, more percussive bloom flash
that suits the hard-edged geometry.

---

## Fade Control

The effect fades out during the last 64 frames:

```javascript
let fade = 1.0;
if (intFrame > 2069) fade = clamp((2069 + 64 - intFrame) / 64, 0, 1);
```

Both the mesh shader and the ground shader multiply their output by `uFade`,
producing a smooth transition to black.

---

## Resource Summary

| Resource | Count | Notes |
|----------|-------|-------|
| Shader programs | 5 | Mesh, ground, bloom extract, blur, composite |
| VAOs | 3 | Glenz1 mesh, Glenz2 mesh, fullscreen quad |
| FBOs | 6 | MSAA + scene + 2 tight bloom + 2 wide bloom |
| Textures | 6 | Scene + checkerboard + 2 tight + 2 wide |
| Renderbuffers | 1 | MSAA colour buffer |

---

**Next:** [Layer 7 — Learning Path](07-learning-path.md)
