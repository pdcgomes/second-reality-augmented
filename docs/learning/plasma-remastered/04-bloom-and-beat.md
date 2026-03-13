# Layer 4 — Bloom and Beat Reactivity

**Source:** `src/effects/plasma/effect.remastered.js`, lines 220–279 (bloom/composite shaders), lines 281–296 (FBO helpers), lines 451–553 (render passes)
**Concepts:** framebuffer objects, bloom pipeline, separable Gaussian blur, ping-pong rendering, beat reactivity

---

## What This Layer Covers

The plasma pass produces a flat image with no glow or atmosphere. Post-
processing transforms it into something that feels alive:

- How Framebuffer Objects (FBOs) let you render to textures instead of the screen
- How bloom extracts bright pixels and blurs them to create a glow halo
- Why the blur is "separable" and what that means for performance
- How dual-tier bloom (tight + wide) creates both sharp glow and soft ambiance
- How beat reactivity makes the plasma pulse with the music

---

## The Render Pipeline

The remastered plasma renders in three logical passes:

```
Pass 1: Plasma → sceneFBO          (full resolution)
Pass 2: Bloom extraction + blur    (half and quarter resolution)
Pass 3: Composite to screen        (full resolution)

┌──────────────┐
│ PLASMA_FRAG  │─────► sceneFBO (full res)
└──────────────┘            │
                            ▼
                  ┌──────────────────┐
                  │ BLOOM_EXTRACT    │──► bloomFBO1 (half res)
                  └──────────────────┘        │
                                              ▼
                                    ┌─────────────────┐
                                    │ BLUR (×3 H+V)   │──► bloomFBO1 (tight bloom)
                                    └─────────────────┘        │
                                              │                ▼
                                              │    ┌──────────────────┐
                                              │    │ BLOOM_EXTRACT    │──► wideFBO1 (¼ res)
                                              │    └──────────────────┘        │
                                              │                                ▼
                                              │                    ┌─────────────────┐
                                              │                    │ BLUR (×3 H+V)   │
                                              │                    └─────────────────┘
                                              │                           │
                                              ▼                           ▼
                                    ┌───────────────────────────────────────┐
                                    │ COMPOSITE_FRAG (scene + tight + wide) │──► screen
                                    └───────────────────────────────────────┘
```

---

## Framebuffer Objects (FBOs)

Normally, WebGL draws directly to the screen. An **FBO** redirects rendering
to a texture instead. You can then read that texture in a later pass — this
is how multi-pass rendering works.

```javascript
function createFBO(gl, w, h) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}
```

The key settings:
- `gl.LINEAR` filtering — when the bloom texture is sampled at a different
  resolution than it was rendered at, the GPU interpolates between pixels
  smoothly. This is essential for bloom, which renders at reduced resolution
  and composites back at full resolution.
- `gl.CLAMP_TO_EDGE` — prevents colour bleeding from the opposite edge when
  sampling near the border.

---

## Dynamic FBO Resizing

The effect must handle window resizes gracefully. Each frame checks if the
canvas dimensions changed:

```javascript
const sw = gl.drawingBufferWidth;
const sh = gl.drawingBufferHeight;

if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, sceneFBO);
  // ... delete all FBOs ...
  sceneFBO      = createFBO(gl, sw, sh);           // full resolution
  bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1); // half resolution
  bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1); // half (ping-pong partner)
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2); // quarter resolution
  bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2); // quarter (ping-pong partner)
  fboW = sw;
  fboH = sh;
}
```

The `>> 1` (right shift by 1) divides by 2; `>> 2` divides by 4. Bloom at
reduced resolution is both intentional (the blur looks better with bigger
pixels) and a performance optimisation (fewer pixels to process).

---

## Bloom Extraction

Bloom should only affect bright areas — dark regions should not glow. The
extraction shader uses a `smoothstep` threshold:

```glsl
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
}
```

The `dot(c, vec3(0.2126, 0.7152, 0.0722))` computes **perceptual
luminance** — human eyes are most sensitive to green, less to red, least
to blue. These are the BT.709 (HDTV) luminance coefficients.

`smoothstep(edge0, edge1, x)` returns:
- 0.0 when `x < edge0`
- 1.0 when `x > edge1`
- A smooth S-curve between

This means pixels below the threshold contribute nothing, pixels well above
contribute fully, and pixels near the threshold transition smoothly. The
0.3 range prevents harsh cutoff artefacts.

---

## Separable Gaussian Blur

The blur uses a 9-tap **Gaussian kernel** with pre-computed weights:

```glsl
void main() {
  vec2 texel = uDirection / uResolution;
  vec3 result = vec3(0.0);
  result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
  result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV - 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV - 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV).rgb * 0.2270;
  result += texture(uTex, vUV + 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV + 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV + 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV + 4.0 * texel).rgb * 0.0162;
  fragColor = vec4(result, 1.0);
}
```

The weights follow a Gaussian (bell curve) distribution: the centre pixel
has the highest weight (0.2270), and it falls off symmetrically. The weights
sum to ~1.0, preserving overall brightness.

### Why "separable"?

A 2D Gaussian blur is **separable**: blurring by a 9×9 kernel is equivalent
to blurring by a 9×1 kernel horizontally, then by a 1×9 kernel vertically.
This reduces the cost from 81 texture lookups per pixel to 18 (9 + 9).

```
2D blur (expensive):          Separable (cheap):

  ○ ○ ○ ○ ○ ○ ○ ○ ○          Pass 1 (horizontal):
  ○ ○ ○ ○ ○ ○ ○ ○ ○          ○ ○ ○ ○ ○ ○ ○ ○ ○
  ○ ○ ○ ○ ○ ○ ○ ○ ○
  ○ ○ ○ ○ ● ○ ○ ○ ○          Pass 2 (vertical):
  ○ ○ ○ ○ ○ ○ ○ ○ ○                    ○
  ○ ○ ○ ○ ○ ○ ○ ○ ○                    ○
  ○ ○ ○ ○ ○ ○ ○ ○ ○                    ○
  ○ ○ ○ ○ ○ ○ ○ ○ ○                    ●
  ○ ○ ○ ○ ○ ○ ○ ○ ○                    ○
                                        ○
  81 samples per pixel                  ○
                                        ○
                                        ○
                              18 samples per pixel
```

The `uDirection` uniform switches between horizontal `(1, 0)` and vertical
`(0, 1)` to control the blur axis. The same shader is used for both passes.

---

## Ping-Pong Rendering

Each blur iteration reads from one FBO and writes to another, then they swap:

```javascript
gl.useProgram(blurProg);
for (let i = 0; i < 3; i++) {
  // Horizontal: read FBO1, write FBO2
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO2.fb);
  gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
  gl.uniform2f(blu.direction, 1.0, 0.0);
  quad.draw();

  // Vertical: read FBO2, write FBO1
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
  gl.bindTexture(gl.TEXTURE_2D, bloomFBO2.tex);
  gl.uniform2f(blu.direction, 0.0, 1.0);
  quad.draw();
}
```

Three iterations of horizontal + vertical blur produce a wide, smooth bloom.
Each iteration doubles the effective blur radius because it operates on the
already-blurred result from the previous iteration. After 3 iterations, the
effective kernel is much wider than 9 pixels.

---

## Dual-Tier Bloom

The plasma uses **two bloom layers** at different resolutions:

| Tier | Resolution | FBOs | Purpose |
|------|-----------|------|---------|
| Tight | Half (sw/2 × sh/2) | bloomFBO1, bloomFBO2 | Sharp, focused glow around bright areas |
| Wide | Quarter (sw/4 × sh/4) | bloomWideFBO1, bloomWideFBO2 | Soft, diffuse ambient glow |

The wide tier is created by extracting from the tight bloom result (not the
original scene) with a threshold of 0.0 — everything passes through. Running
blur at quarter resolution makes each pixel cover 4× the area, producing a
much wider spread.

---

## Final Composite

The composite shader combines all three layers:

```glsl
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.25)
    + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
  float scanline = (1.0 - uScanlineStr)
    + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;
  fragColor = vec4(color, 1.0);
}
```

Bloom is **additive** — the blurred glow is added on top of the original
scene. This is why bloom makes things look brighter, not just blurrier. The
wide bloom is mixed at half the strength of the tight bloom, providing
ambient glow without washing out the image.

---

## Beat Reactivity

The beat value (0.0–1.0) represents position within the current musical bar.
The plasma responds to beats at three points in the pipeline:

```
beatPulse = pow(1.0 - beat, 4.0) × beatReactivity
```

`pow(1 - beat, 4)` creates a sharp spike at beat = 0 (the downbeat) that
decays rapidly:

```
beat:       0.0    0.25    0.5    0.75    1.0
pulse:      1.0    0.32    0.06   0.004   0.0
            ████
            █
```

This spike is applied in three places:

| Where | Formula | Effect |
|-------|---------|--------|
| Plasma shader | `ci += beatPulse × 30` | Colour index shifts on each beat, cycling the palette |
| Plasma shader | `color × (brightness + beatPulse × 0.15)` | Flash brighter on each beat |
| Composite | `tight × (bloomStr + beatPulse × 0.25)` | Glow flares on each beat |

The combined effect: on each beat, the plasma briefly shifts colour, flashes
brighter, and the glow halo intensifies — then everything relaxes before the
next beat. The `beatReactivity` parameter (0–1) controls the intensity of all
three effects simultaneously.

---

## Scanlines

A subtle CRT scanline overlay adds retro texture:

```glsl
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * PI);
color *= scanline;
```

`sin(gl_FragCoord.y * π)` produces a wave that peaks on even pixel rows and
dips on odd rows (since `sin(nπ) = 0` for integer n). At the default
strength of 0.02, this creates barely perceptible darkening on alternating
rows — enough to evoke a CRT feel without being distracting.

---

## Resource Summary

| Resource | Count | Purpose |
|----------|-------|---------|
| Shader programs | 4 | Plasma, bloom extract, blur, composite |
| FBOs | 5 | Scene + 2 tight bloom (ping-pong) + 2 wide bloom (ping-pong) |
| Textures | 5 | One per FBO |
| Input textures | 0 | Everything is procedural |

All resources are created in `init()` (programs) and lazily in `render()`
(FBOs, on first frame or resize), and cleaned up in `destroy()`.

---

**Next:** [Layer 5 — Learning Path](05-learning-path.md)
