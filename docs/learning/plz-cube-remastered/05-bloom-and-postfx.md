# Layer 5 — Bloom and Post-Processing

**Source:** `src/effects/plzCube/effect.remastered.js`, lines 263–324 (post-fx shaders), lines 326–365 (FBO helpers), lines 509–658 (render passes)
**Concepts:** framebuffer objects, MSAA resolve, brightness extraction, separable Gaussian blur, dual-tier bloom, beat reactivity, palette themes

---

## What This Layer Covers

- How **MSAA (Multi-Sample Anti-Aliasing)** smooths polygon edges
- How the rendered cube is **resolved** from an MSAA buffer into a regular texture
- How **brightness extraction** isolates the bright regions for bloom
- How a **separable 9-tap Gaussian** efficiently blurs in two passes
- How **dual-tier bloom** (half-res tight + quarter-res wide) creates natural glow
- How the **composite shader** combines everything with beat-reactive intensity
- How **12 palette themes** are structured and uploaded

---

## The Multi-Pass Pipeline

The effect renders in 7 passes per frame:

```
  Pass 1: Cube → MSAA FBO (full resolution)
       │
  Pass 2: MSAA Resolve → Scene texture (full resolution)
       │
  Pass 3: Bloom Extract → half-res FBO
       │
  Pass 4: Gaussian Blur ×3 → half-res ping-pong (tight bloom)
       │
  Pass 5: Downsample → quarter-res FBO
       │
  Pass 6: Gaussian Blur ×3 → quarter-res ping-pong (wide bloom)
       │
  Pass 7: Composite (scene + tight + wide) → screen
```

---

## MSAA Anti-Aliasing

The cube is rendered into a **multi-sample framebuffer** rather than directly
to a texture. This stores multiple colour samples per pixel at polygon edges,
which are averaged during resolve to smooth jagged edges.

```javascript
msaaFBO = createMSAAFBO(gl, sw, sh, msaaSamples);
```

The `createMSAAFBO` helper allocates two **renderbuffers** — one for colour
(RGBA8) and one for depth (DEPTH_COMPONENT24) — both with the requested sample
count:

```javascript
gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
```

The sample count is capped to the hardware maximum (typically 4× or 8×).

```
  Without MSAA:                    With 4× MSAA:

  ██░░                             ██▓░
  ██░░    aliased staircase        ██▒░    smooth anti-aliased edge
  ░░░░                             ░░░░
```

---

## MSAA Resolve

MSAA renderbuffers cannot be sampled as textures. The **blit resolve** copies
and averages the multi-sample data into a regular texture:

```javascript
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFBO.fb);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO.fb);
gl.blitFramebuffer(0, 0, sw, sh, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
```

After this, `sceneFBO.tex` is a standard 2D texture containing the anti-aliased
cube render. This texture feeds both the bloom pipeline and the final composite.

---

## Dynamic FBO Resizing

The canvas may be resized at any time (the editor is resizable, and the player
can go fullscreen). All FBOs are recreated when the dimensions change:

```javascript
if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, msaaFBO);
  deleteFBO(gl, sceneFBO);
  // ... delete all bloom FBOs ...
  msaaFBO       = createMSAAFBO(gl, sw, sh, msaaSamples);
  sceneFBO      = createFBO(gl, sw, sh);
  bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);   // half-res
  bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);   // quarter-res
  bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
  fboW = sw; fboH = sh;
}
```

The `>> 1` and `>> 2` bit-shifts divide by 2 and 4 respectively. The smaller
bloom FBOs are a deliberate quality/performance tradeoff — blurring fewer pixels
while naturally softening the result.

```
  FBO resolution hierarchy:

  Full (1920×1080):    MSAA + Scene
  Half (960×540):      Bloom extract + tight blur
  Quarter (480×270):   Wide bloom downsample + wide blur
```

---

## Brightness Extraction

Bloom only affects the bright parts of the image. The extraction shader
isolates them:

```glsl
vec3 c = texture(uScene, vUV).rgb;
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

The **luminance weights** `(0.2126, 0.7152, 0.0722)` are the standard
Rec. 709 coefficients — they account for human eye sensitivity (green
contributes most to perceived brightness). The `smoothstep` creates a soft
transition rather than a hard cutoff:

```
  Output brightness vs input brightness:

  1.0 ┃                    ╱────────
      ┃                  ╱
      ┃                ╱
  0.0 ┃───────────────╱
      ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━ brightness
                  threshold
                  (0.3)
```

Pixels below the threshold produce black (no bloom). Pixels above the
threshold produce their original colour at full strength.

---

## Separable Gaussian Blur

A 2D Gaussian blur can be split into two 1D passes — horizontal then vertical.
This reduces the work from O(n²) to O(2n) per pixel. The shader uses a
**9-tap kernel**:

```glsl
vec2 texel = uDirection / uResolution;
vec3 result = vec3(0.0);
result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
result += texture(uTex, vUV - 2.0 * texel).rgb * 0.1216;
result += texture(uTex, vUV - 1.0 * texel).rgb * 0.1945;
result += texture(uTex, vUV).rgb             * 0.2270;
result += texture(uTex, vUV + 1.0 * texel).rgb * 0.1945;
// ... symmetric other side
```

The weights sum to approximately 1.0 and follow a Gaussian bell curve:

```
  Kernel weights (9 taps):

  0.23 ┃        █
       ┃      █ █ █
  0.12 ┃    █ █ █ █ █
       ┃  █ █ █ █ █ █ █
  0.02 ┃█ █ █ █ █ █ █ █ █
       ┗━━━━━━━━━━━━━━━━━
       -4 -3 -2 -1  0 +1 +2 +3 +4
```

The `uDirection` uniform switches between `(1,0)` for horizontal and `(0,1)`
for vertical. **Three iterations** of H+V passes (6 total shader invocations)
produce a wide, smooth blur.

---

## Dual-Tier Bloom

The tight bloom operates at half-resolution (3 iterations). The wide bloom
takes the tight result, downsamples it to quarter-resolution, and runs 3 more
iterations. This creates two distinct glow radii that combine naturally:

```
  Tight bloom (half-res):           Wide bloom (quarter-res):

  ░░░▒▓██▓▒░░░                     ░░░░░░▒▒▓▓██▓▓▒▒░░░░░░
  ~10 pixel radius                  ~40 pixel radius (in full-res terms)
  Sharp, close glow                 Soft, diffuse halo
```

The wide bloom's extraction uses a threshold of 0.0 — it takes all of the
tight bloom's output and spreads it further. This is an efficient trick: the
tight bloom has already isolated the bright parts, so the wide pass just needs
to soften.

---

## Final Composite

The composite shader combines three textures:

```glsl
vec3 scene = texture(uScene, vUV).rgb;
vec3 tight = texture(uBloomTight, vUV).rgb;
vec3 wide  = texture(uBloomWide, vUV).rgb;

float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;

vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.25)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
```

The bloom is **additive** — it makes bright areas brighter without darkening
anything. The tight bloom uses the full `bloomStr`, while the wide bloom uses
half. On beats, both get an extra boost.

### Optional Scanlines

```glsl
if (uScanlineStr > 0.001) {
  float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;
}
```

This simulates CRT scanlines by darkening every other row. At full strength
(0.5), odd rows are dimmed to 50%. The `sin(y × π)` creates a smooth wave
rather than a hard on/off pattern, avoiding moiré with the display's actual
pixel grid. This is off by default (`scanlineStr = 0`).

---

## Beat Reactivity Summary

All beat-driven effects use the same decay curve:

```glsl
float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
```

| Effect | Where Applied | Formula | Peak at Default |
|--------|---------------|---------|-----------------|
| Colour boost | CUBE_FRAG | `baseColor × (1 + beatPulse × 0.15)` | +6% brightness |
| Specular sharpness | CUBE_FRAG | `specPow + beatPulse × 16` | +6.4 to exponent |
| Specular intensity | CUBE_FRAG | `0.4 + beatPulse × 0.2` | +0.08 intensity |
| Tight bloom boost | COMPOSITE_FRAG | `bloomStr + beatPulse × 0.25` | +0.1 bloom |
| Wide bloom boost | COMPOSITE_FRAG | `bloomStr × 0.5 + beatPulse × 0.15` | +0.06 bloom |

---

## Palette Themes

The effect ships with 12 palettes, each defining three two-segment colour
ramps (one per face pair):

```javascript
const PALETTES = [
  { name: 'Classic', faces: [
    [[0,0,0],[0,0,1],[1,1,1]],      // theme 0: black → blue → white
    [[0,0,0],[1,0,0],[1,1,0]],      // theme 1: black → red → yellow
    [[0,0,0],[.5,0,.33],[0,1,.33]], // theme 2: black → purple → green
  ]},
  { name: 'Gruvbox', faces: [ /* ... */ ] },
  // ... 10 more
];
```

Each ramp is an array of 3 RGB triples: `[lo, mid, hi]`. The palette is
uploaded as three `vec3` uniform arrays:

```javascript
gl.uniform3fv(cu_.palLo,  new Float32Array(pal.faces.map(f => f[0]).flat()));
gl.uniform3fv(cu_.palMid, new Float32Array(pal.faces.map(f => f[1]).flat()));
gl.uniform3fv(cu_.palHi,  new Float32Array(pal.faces.map(f => f[2]).flat()));
```

Palette names (Gruvbox, Monokai, Dracula, Solarized, Nord, One Dark,
Catppuccin, Tokyo Night, Synthwave, Kanagawa, Everforest, Rose Pine) are
inspired by popular code editor themes, giving developers an immediately
recognisable aesthetic.

---

## GPU Resource Summary

| Resource | Count | Purpose |
|----------|-------|---------|
| Shader programs | 4 | Cube, bloom extract, blur, composite |
| VAO | 1 | Cube mesh (24 vertices, 36 indices) |
| VBO + IBO | 2 | Interleaved vertex data + index buffer |
| Framebuffers | 6 | MSAA + scene + 2 tight bloom + 2 wide bloom |
| Textures | 5 | Scene + tight ping-pong + wide ping-pong |
| Renderbuffers | 2 | MSAA colour + MSAA depth |

All resources are properly cleaned up in `destroy()` — no GPU memory leaks
when the effect is unloaded.

---

**Next:** [Layer 6 — Learning Path](06-learning-path.md)
