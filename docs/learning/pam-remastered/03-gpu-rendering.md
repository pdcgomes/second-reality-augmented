# Layer 3 — GPU Rendering

**Source:** `src/effects/pam/effect.remastered.js` lines 39–604 (shaders), 608–621 (FBO helpers), 732–969 (init/render/destroy)
**Concepts:** Texture upload, fullscreen shader compositing, raymarching, noise primitives, dual-tier bloom

---

## What This Layer Covers

- How **two textures** (background + core frame) are uploaded and sampled in the scene shader
- How the **scene fragment shader** composites six visual layers in a single pass
- How the **lava core** is built from plasma FBM noise + voronoi crack patterns
- How the **volumetric blast** is raymarched with Beer-Lambert self-shadowing
- How **atmosphere** layers (horizon glow, stars) add depth to the scene
- How the **dual-tier bloom** pipeline extracts, blurs, and composites the glow

---

## Render Architecture

The remastered PAM renders in three major passes per frame:

```
┌─────────────────────────────────────────────────────┐
│ Pass 1: SCENE (full resolution → sceneFBO)          │
│                                                     │
│   Background texture (frame 0)                      │
│       + core frame overlay (frames 0-6, faint glow) │
│       + horizon glow (purple band)                  │
│       + twinkling stars (dark sky only)              │
│       + lava core (plasma + voronoi + embers)        │
│       + volumetric blast (raymarched smoke)          │
│       + white flash (PALETTE_FADE)                   │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Pass 2: BLOOM (half-res + quarter-res)              │
│                                                     │
│   Brightness extraction → tight blur (3×H+V)        │
│   Downsample → wide blur (3×H+V)                    │
│                                                     │
├─────────────────────────────────────────────────────┤
│ Pass 3: COMPOSITE (full resolution → screen)        │
│                                                     │
│   scene + tight bloom + wide bloom                   │
│   with beat-reactive intensity                       │
└─────────────────────────────────────────────────────┘
```

---

## Texture Setup

Two textures are created at init time from the pre-baked RGBA frames:

```javascript
// effect.remastered.js, lines 746–761
// Background: frame 0, bilinear-upscaled (the ALKU landscape before explosion)
bgTex = gl.createTexture();
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA,
              gl.UNSIGNED_BYTE, coreFramesRGBA[0]);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);  // bilinear

// Core frame: updated per-frame with texSubImage2D (frames 0-6)
coreTex = gl.createTexture();
gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA,
              gl.UNSIGNED_BYTE, coreFramesRGBA[0]);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
```

Both use `gl.LINEAR` (bilinear filtering) so the 320×200 source scales
smoothly to native resolution. The classic uses `gl.NEAREST` to preserve
pixel edges; the remastered softens them intentionally since these textures
are just reference backdrops behind the procedural effects.

---

## The Scene Shader — Six Layers

The `SCENE_FRAG` shader is the most complex shader in this effect. It
composites six visual layers in order:

### Layer 1: Background

```glsl
// SCENE_FRAG, lines 510–511
vec2 bgUV = vec2(uv.x, 1.0 - uv.y);      // flip Y (GL vs image convention)
vec3 bg = texture(uBgTex, bgUV).rgb;       // sample frame-0 texture
```

The static ALKU landscape — always frame 0, never changes.

### Layer 2: Core frame overlay

```glsl
// SCENE_FRAG, lines 516–521
vec3 coreFrame = texture(uCoreTex, bgUV).rgb;
vec3 frameDiff = max(coreFrame - bg, vec3(0.0));
float diffLuma = dot(frameDiff, vec3(0.299, 0.587, 0.114));
float frameMix = smoothstep(0.06, 0.2, diffLuma) * uCoreAlpha * 0.35;
frameMix *= smoothstep(0.4, 0.15, diffLuma);
bg = mix(bg, coreFrame, frameMix);
```

This overlays frames 1–6 as a **faint ambient glow**. The difference between
the core frame and the background is computed; only pixels that changed
(the explosion region) are blended in, and bright sparks are suppressed
by the upper `smoothstep` cutoff. The result is a subtle warm halo — not
the full explosion frame, just its atmospheric haze.

### Layer 3: Horizon glow

```glsl
// SCENE_FRAG, lines 452–464
vec3 horizonGlow(vec2 uv, float t) {
  float band = smoothstep(0.45, 0.62, yFlip) * smoothstep(0.85, 0.65, yFlip);
  float pulse = sin(t * uHorizonPulseSpeed) * 0.5 + 0.5;
  vec3 glowColor = vec3(0.3, 0.05, 0.4);        // purple
  return glowColor * band * pulse * uHorizonGlow;
}
```

A pulsing purple band across the horizon, adding atmosphere. The two
`smoothstep` calls create a soft-edged horizontal band. Beat-reactive
pulsing makes it breathe with the music.

### Layer 4: Twinkling stars

```glsl
// SCENE_FRAG, lines 468–506
vec3 stars(vec2 uv, float t) {
  float skyMask = smoothstep(0.55, 0.35, yFlip);    // only in upper sky
  // ... grid-based star placement with hash-based randomness ...
  float twinkle = sin(t * speed + phase) * 0.4 + 0.6;
  return starColor * star * twinkle * uStarBrightness * skyMask;
}
```

Stars only appear on **dark pixels** (controlled by a luminance check in the
main function). Each star's position, size, colour warmth, and twinkle phase
are derived from hash functions seeded by grid cell coordinates — procedural,
deterministic, and infinite.

### Layer 5: Lava core

The lava core is the centrepiece. It builds a molten sphere from three
components:

```
┌────────────────────────────────────────────────┐
│                  LAVA CORE                     │
│                                                │
│   Plasma FBM ──┐                               │
│   (vortex       ├──→ Heat map ──→ Fire ramp    │
│    swirl)       │    (0.0–1.0)    5-stop grad  │
│                 │                               │
│   Voronoi ─────┘    ember → red → orange       │
│   crack veins       → yellow → white-hot       │
│   (2 scales)                                   │
│                                                │
│   + 24 small orbiting embers                    │
│   + 10 large orbiting sparks                    │
│   + soft halo glow around the core              │
└────────────────────────────────────────────────┘
```

The **fire colour ramp** maps a heat value (0–1) through five colour stops:

```glsl
// SCENE_FRAG, lines 225–235
vec3 c1 = vec3(0.08, 0.02, 0.0);    // dark ember
vec3 c2 = vec3(0.55, 0.08, 0.0);    // deep red
vec3 c3 = vec3(1.0, 0.4, 0.0);      // orange
vec3 c4 = vec3(1.0, 0.75, 0.1);     // yellow
vec3 c5 = vec3(1.0, 0.97, 0.8);     // white-hot
```

### Layer 6: Volumetric blast

The most computationally expensive layer — a **raymarched volumetric smoke
cloud** with self-shadowing:

```
Camera ray → march 12 steps through 3D density field
              │
              ├── at each step: sample smokeDensity(pos, t)
              │     ├── 3D FBM noise × radial falloff × vertical falloff
              │     └── expanding disc shape (flat, wide, slowly rising)
              │
              ├── at each step: lightMarch toward core (4 steps)
              │     └── Beer-Lambert: transmittance = exp(-density × absorption)
              │
              └── accumulate colour × (1 - stepTransmittance) × totalTransmittance
```

**Beer-Lambert attenuation** models how light is absorbed as it travels
through a medium. The deeper into the smoke a point is, the less core light
reaches it, creating natural self-shadowing:

```glsl
// SCENE_FRAG, lines 373–385
float lightMarch(vec3 pos, float explosionT) {
  vec3 lightDir = normalize(-pos);
  float totalDensity = 0.0;
  for (int i = 0; i < LIGHT_STEPS; i++) {
    pos += lightDir * stepSize;
    totalDensity += smokeDensity(pos, explosionT) * stepSize;
  }
  return exp(-totalDensity * ABSORPTION * 0.7);   // Beer-Lambert
}
```

---

## FBO Management

The effect creates 5 framebuffer objects (FBOs) for offscreen rendering.
They are rebuilt whenever the canvas resizes:

```javascript
// effect.remastered.js, lines 825–838
if (sw !== fboW || sh !== fboH) {
  // destroy old FBOs...
  sceneFBO      = createFBO(gl, sw, sh);          // full resolution
  bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1); // half resolution
  bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1); // half (ping-pong)
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2); // quarter resolution
  bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2); // quarter (ping-pong)
  fboW = sw; fboH = sh;
}
```

The `createFBO` helper allocates a framebuffer + texture pair with linear
filtering and clamp-to-edge wrapping:

```javascript
// effect.remastered.js, lines 608–621
function createFBO(gl, w, h) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0,
                gl.RGBA, gl.UNSIGNED_BYTE, null);     // allocate, no data
  gl.framebufferTexture2D(gl.FRAMEBUFFER,
                          gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { fb, tex };
}
```

---

## The Bloom Pipeline

After the scene pass, bright pixels are extracted and blurred in two tiers:

### Bloom extract (half resolution)

```glsl
// BLOOM_EXTRACT_FRAG, lines 554–558
vec3 c = texture(uScene, vUV).rgb;
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));   // BT.709 luminance
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

Pixels below the **bloom threshold** (default 0.25) output black. Pixels
above it output their full colour, with a soft transition zone of 0.3 to
avoid hard edges.

### Separable Gaussian blur

The same 9-tap Gaussian kernel is applied in two directions (horizontal,
then vertical). Three iterations of the H+V pair produce a wide, smooth blur:

```
Iteration 1: H → V    (effective radius ~9 pixels)
Iteration 2: H → V    (effective radius ~18 pixels)
Iteration 3: H → V    (effective radius ~27 pixels)
```

Each iteration reads from one FBO and writes to the other (**ping-pong**),
because a GPU cannot read and write the same texture simultaneously.

### Wide bloom (quarter resolution)

The tight bloom result is downsampled to quarter resolution and blurred again
with threshold 0.0 (take everything). This creates a broad, soft atmospheric
glow that wraps around the tight halo.

### Composite

```glsl
// COMPOSITE_FRAG, lines 594–603
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.25)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
```

Bloom is **additive** — it adds light on top of the scene. The beat pulse
(derived from `pow(1.0 - beat, 4.0)`) makes the bloom flare brighter on
each musical beat, creating a rhythmic breathing effect.

---

## Resource Summary

| Resource | Count | Lifetime |
|----------|-------|----------|
| Shader programs | 4 | init → destroy |
| Data textures | 2 | init → destroy (bgTex, coreTex) |
| FBO textures | 5 | resize → resize (scene + 2 tight + 2 wide) |
| Framebuffers | 5 | resize → resize |
| Fullscreen quad | 1 | init → destroy |

All resources are explicitly destroyed in the `destroy()` method. FBOs are
rebuilt on every canvas resize. Core frame texture data is uploaded via
`texSubImage2D` only when the frame index changes (at most 7 times per
4-second clip).

---

**Next:** [Layer 4 — Learning Path](04-learning-path.md)
