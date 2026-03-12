# Layer 6 — The Bloom Pipeline

**Source:** `src/effects/dots/effect.remastered.js`, lines 176–234 (shaders), 512–560 (render)
**Concepts:** HDR extraction, separable Gaussian blur, ping-pong FBOs, additive compositing

---

## What This Layer Covers

Bloom is the glow around bright objects — the visual phenomenon where light
bleeds into surrounding areas. Think of streetlights in fog, or the halo
around the sun. In real-time graphics, bloom is simulated as a post-processing
effect: render the scene, extract the bright parts, blur them, and add them
back.

This effect uses **dual-tier bloom**: a detailed tight glow and a soft wide
glow layered together.

---

## The Pipeline

```
Scene texture (full resolution)
      |
      v
[Bloom Extract] ── extract pixels brighter than threshold
      |
      v
[Tight Bloom] ── 3x Gaussian blur at half resolution
      |
      v
[Wide Bloom] ── downsample + 3x Gaussian blur at quarter resolution
      |
      v
[Composite] ── scene + tight bloom + wide bloom → screen
```

---

## Step 1: Bright-Pixel Extraction

```glsl
// BLOOM_EXTRACT_FRAG
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
}
```

This shader reads each pixel of the rendered scene and decides: is it bright
enough to glow?

**Perceived brightness** is not just `(r + g + b) / 3`. Human eyes are most
sensitive to green, less to red, least to blue. The weights (0.2126, 0.7152,
0.0722) are the standard luminance coefficients (ITU-R BT.709, used by HDTV).

`smoothstep(threshold, threshold + 0.3, brightness)` creates a soft
transition: pixels below the threshold output black, pixels above it output
their full colour, and pixels near the threshold transition smoothly. This
avoids hard edges in the bloom.

The default threshold is 0.3 — so roughly the top 70% of brightness range
contributes to bloom. Only the specular highlights and well-lit sphere surfaces
will glow noticeably.

---

## Step 2: Gaussian Blur (The Heart of Bloom)

```glsl
// BLUR_FRAG
void main() {
  vec2 texel = uDirection / uResolution;
  vec3 result = vec3(0.0);
  result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
  result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV - 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV - 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV                ).rgb * 0.2270;
  result += texture(uTex, vUV + 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV + 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV + 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV + 4.0 * texel).rgb * 0.0162;
  fragColor = vec4(result, 1.0);
}
```

### What is a Gaussian blur?

A blur averages nearby pixels. A Gaussian blur weights the average with a
bell curve — the center pixel has the highest weight, and contributions
decrease with distance. This produces a natural, smooth blur.

### The weights

The 9 weights (0.0162, 0.0540, 0.1216, 0.1945, 0.2270, 0.1945, 0.1216,
0.0540, 0.0162) form a discrete Gaussian bell curve:

```
Weight:  0.016  0.054  0.122  0.195  0.227  0.195  0.122  0.054  0.016
         -4     -3     -2     -1      0     +1     +2     +3     +4
                              ▲ center pixel
```

They sum to 1.0 (approximately), so overall brightness is preserved.

### Separable blur — the key optimisation

A 2D Gaussian blur would require 9x9 = 81 texture samples per pixel. That is
expensive. The crucial mathematical property of the Gaussian function is that
it is **separable**: a 2D Gaussian is the product of two 1D Gaussians.

This means you can blur horizontally first, then vertically, and get the same
result as a full 2D blur — but with only 9 + 9 = 18 samples instead of 81.

The `uDirection` uniform controls which axis to blur along:
- `uDirection = (1.0, 0.0)` → horizontal pass
- `uDirection = (0.0, 1.0)` → vertical pass

### Ping-pong rendering

Each blur pass needs to read from one texture and write to another (you cannot
read and write the same texture simultaneously). This is called "ping-pong":

```javascript
for (let i = 0; i < 3; i++) {
  // Horizontal: read from FBO1, write to FBO2
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO2.fb);
  gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
  gl.uniform2f(blu.direction, 1.0, 0.0);    // horizontal
  quad.draw();

  // Vertical: read from FBO2, write back to FBO1
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
  gl.bindTexture(gl.TEXTURE_2D, bloomFBO2.tex);
  gl.uniform2f(blu.direction, 0.0, 1.0);    // vertical
  quad.draw();
}
```

After 3 iterations (6 passes total), the blur radius is effectively much
larger than 9 pixels because each iteration blurs an already-blurred image.

---

## Step 3: Dual-Tier Bloom

### Tight bloom (half resolution)

```javascript
const hw = sw >> 1, hh = sh >> 1;  // half width, half height

gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
gl.viewport(0, 0, hw, hh);
// ... extract bright pixels from scene ...
// ... 3 iterations of H+V blur ...
```

The tight bloom operates at half the screen resolution. This has two benefits:
- Each blur iteration covers a larger apparent area (pixels are bigger)
- Half the pixels to process means roughly 4x faster

### Wide bloom (quarter resolution)

```javascript
const qw = sw >> 2, qh = sh >> 2;  // quarter width, quarter height

gl.bindFramebuffer(gl.FRAMEBUFFER, bloomWideFBO1.fb);
gl.viewport(0, 0, qw, qh);
// Extract from the tight bloom result (not the scene)
gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
gl.uniform1f(beu.threshold, 0.0);    // no threshold — take everything
// ... 3 iterations of H+V blur ...
```

The wide bloom takes the tight bloom result, downsamples it further to quarter
resolution, and blurs it again. The threshold is 0 because we want to blur
all the light, not just the brightest pixels. This creates a broad, soft halo
around the already-tight glow.

---

## Step 4: Composite

```glsl
// COMPOSITE_FRAG
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;

  float beatPulse = pow(1.0 - uBeat, 6.0);

  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.2)
    + wide  * (uBloomStr * 0.6 + beatPulse * 0.12);

  float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;

  fragColor = vec4(color, 1.0);
}
```

The composite shader combines three textures:

1. **Scene** — the main rendered image (at full resolution)
2. **Tight bloom** — the detailed glow (at half resolution, but upsampled via
   bilinear filtering when sampled at full-res UVs)
3. **Wide bloom** — the soft atmospheric glow (at quarter resolution)

Bloom is **additive** — it adds light on top of the scene. This is physically
correct: bloom comes from excess light, not from replacing the original image.

**Beat reactivity** modulates bloom intensity: `beatPulse * 0.2` adds extra
bloom on each musical beat, making bright dots flare rhythmically.

**Scanlines** darken every other horizontal line slightly, adding a subtle CRT
monitor aesthetic: `sin(gl_FragCoord.y * pi)` oscillates between 0 and 1 with
a period of 2 pixels. The `uScanlineStr` parameter controls intensity (default
0.03 = barely visible).

---

## Why Dual-Tier?

A single blur tier produces either a tight glow (small radius) or a wide glow
(large radius), but not both. Real optical bloom has both:

- **Tight glow** — the sharp halo immediately around a bright object
- **Wide glow** — the soft atmospheric spread that gives a scene its "mood"

Using two tiers at different resolutions captures both characters. The
tight tier handles detail, the wide tier handles atmosphere, and they are
surprisingly cheap because lower-resolution textures have far fewer pixels
to process.

---

**Next:** [Layer 7 — The Render Loop](07-render-loop.md)
