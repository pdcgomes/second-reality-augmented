# Layer 4 — GPU Rendering

**Source:** `src/effects/alku/effect.remastered.js`, lines 74–200 (SCENE_FRAG, bloom/composite shaders), lines 350–500 (render passes)
**Concepts:** texture-based rendering, shader palette emulation, horizon glow, dual-tier bloom

---

## What This Layer Covers

The classic ALKU renders on the CPU — compositing landscape pixels and font
glyphs into a 320×256 framebuffer, then uploading the result as a texture.
The remastered ports this to GPU shaders while preserving the pixel character:

- How the landscape and text textures are sampled in a fragment shader
- The NEAREST-neighbour filtering choice to keep sharp pixel edges
- The purple horizon glow atmospheric effect
- The dual-tier bloom pipeline
- Beat reactivity and editor parameters

---

## Two Textures, One Shader

The remastered pre-bakes two textures on the CPU:

1. **Landscape texture** — the 640×350 pre-rendered landscape with its VGA
   palette converted to RGBA at init time
2. **Text texture** — a 320×256 RGBA overlay rendered each frame with
   the current credit text and fade state

The fragment shader composites them:

```glsl
void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;

  vec3 color = vec3(0.0);

  if (uShowLandscape > 0) {
    float skyFraction = 50.0 / 400.0;
    if (uv.y >= skyFraction) {
      float landscapeUVy = (uv.y - skyFraction) / (1.0 - skyFraction);
      float landscapeUVx = uv.x * 0.5 + uScrollOffset;
      color = texture(uLandscape, vec2(landscapeUVx, landscapeUVy)).rgb;
    }
    color *= uBgFade;
    color += horizonGlow(uv, uTime) * uBgFade;
  }

  vec4 textSample = texture(uText, uv);
  color = mix(color, textSample.rgb, textSample.a * uTextFade);

  float beatPulse = pow(1.0 - uBeat, 8.0) * uBeatReactivity;
  color += color * beatPulse;

  fragColor = vec4(color, 1.0);
}
```

The landscape UV uses `uv.x * 0.5 + uScrollOffset` — the `× 0.5` accounts
for the landscape being 640 pixels wide (twice the 320-pixel display width),
and `uScrollOffset` advances each frame to produce the horizontal scroll.

The text is overlaid using `mix()` with the text texture's alpha channel.
Where the text is opaque (alpha = 1), the text colour replaces the
landscape. Where transparent (alpha = 0), the landscape shows through.

---

## NEAREST-Neighbour Filtering

Both textures use `gl.NEAREST` filtering:

```javascript
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
```

This ensures that when the 320×256 content is scaled up to a modern display
resolution (e.g. 1920×1080), each original pixel becomes a sharp rectangle
rather than a blurry blob. The pixel art character of the original credits
is preserved exactly.

---

## Purple Horizon Glow

The one atmospheric addition to the remastered version is a soft purple glow
near the sky/landscape boundary:

```glsl
vec3 horizonGlow(vec2 uv, float t) {
  if (uHorizonGlow <= 0.0) return vec3(0.0);

  float dist = abs(uv.y - uGlowY);
  float band = smoothstep(uGlowHeight, 0.0, dist);

  float pulse = sin(t * uHorizonPulseSpeed) * 0.5 + 0.5;
  float beatMod = pow(1.0 - uBeat, 6.0) * uBeatReactivity * 0.3;
  pulse = pulse * 0.7 + beatMod;

  vec3 glowColor = vec3(0.3, 0.05, 0.4);
  return glowColor * band * pulse * uHorizonGlow;
}
```

The glow is a Gaussian-like band centred at `uGlowY` with width
`uGlowHeight`. It pulses sinusoidally over time and reacts to beats.
The default intensity is very low — casual viewers see essentially the
same intro as the original. The editor allows cranking it up for a more
dramatic atmospheric look.

---

## Dual-Tier Bloom

The bloom pipeline follows the same architecture as all other effects:

1. Scene → scene FBO (full resolution)
2. Bloom extract at half resolution (smoothstep threshold)
3. 3× separable 9-tap Gaussian blur (tight bloom)
4. Downsample to quarter resolution
5. 3× Gaussian blur (wide bloom)
6. Composite: scene + tight bloom + wide bloom

The composite shader adds beat-reactive bloom pulsing:

```glsl
float beatPulse = pow(1.0 - uBeat, 8.0) * uBeatReactivity;
vec3 color = scene
  + tight * (uBloomStr + beatPulse * 0.2)
  + wide  * (uBloomStr * 0.5 + beatPulse * 0.1);
```

The `pow(8)` exponent is steeper than most effects, producing a very sharp
beat flash that quickly fades — appropriate for the subdued credits sequence.

---

## Editor Parameters

| Key | Default | Purpose |
|-----|---------|---------|
| `horizonGlow` | 0.15 | Purple glow intensity (0 = off) |
| `horizonPulseSpeed` | 0.8 | Glow pulse frequency |
| `bloomThreshold` | 0.35 | Brightness cutoff for bloom |
| `bloomStrength` | 0.3 | Bloom overlay intensity |
| `beatReactivity` | 0.2 | Beat-driven brightness + bloom |

All defaults are deliberately understated to keep the classic feel.

---

**Next:** [Layer 5 — Learning Path](05-learning-path.md) · **Back to:** [Overview](00-overview.md)
