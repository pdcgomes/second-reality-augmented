# Layer 5 — Learning Path

**Source:** `src/effects/water/effect.remastered.js`, `src/effects/water/effect.js`
**Concepts:** hands-on experimentation, parameter tuning, shader modification

---

## What This Layer Covers

- **Five exercises** of increasing difficulty to deepen your understanding
- Each exercise modifies a specific part of the codebase and produces a
  visible result you can verify immediately in the editor
- Exercises are independent — do them in any order

---

## Exercise 1: Change the Scroll Speed

**Difficulty:** Beginner
**File:** `src/effects/water/effect.remastered.js` line 678
**Time:** 5 minutes

The sword scrolls at a rate of 1 column every 3 frames. Change it to scroll
faster or slower.

Find this line in the `render()` function:

```javascript
const scrollOffset = Math.min(Math.floor(frame / 3), SCP_MAX);
```

**Try these modifications:**

1. Change `/ 3` to `/ 1` — the sword scrolls 3× faster (one column per frame)
2. Change `/ 3` to `/ 6` — the sword scrolls at half speed
3. Change `/ 3` to `/ 10` — very slow, dreamy scroll

**What to observe:** The sword billboard in the 3D scene scrolls its texture UV
coordinates based on `uScrollOffset`. A faster scroll means the chrome sword
text whips past quickly; a slower scroll gives more time to read it.

**Bonus:** The classic variant uses the same formula at line 140. Change both
and toggle between classic/remastered — the scroll speed should match.

---

## Exercise 2: Swap the Sword Artwork

**Difficulty:** Intermediate
**Files:** `src/effects/water/data.js`, `tools/extract-assets-png.mjs`
**Time:** 20 minutes

The sword texture is a 400×34 pixel indexed-colour image stored as base64 in
`data.js`. You can replace it with your own artwork.

**Steps:**

1. Extract the current sword to see what it looks like:
   ```bash
   node tools/extract-assets-png.mjs
   ls assets/effects/water/
   ```

2. Create a replacement image (400×34 pixels, PNG). Use any image editor.
   Keep it simple — white text on black background works well since black
   pixels become transparent.

3. The data pipeline expects indexed-colour data. For a quick test, modify
   `decodeSwordTexture()` in `effect.remastered.js` (line 501) to load your
   PNG directly as an RGBA texture instead of decoding from the palette:

   ```javascript
   // Replace the palette decode with a direct RGBA upload
   // You'll need to load your image as an HTMLImageElement first
   ```

4. Verify in the editor — your custom artwork should appear on the chrome
   sword billboard and in sphere reflections.

**What you learn:** How the data pipeline converts indexed palette data to GPU
textures, and how the `NEAREST` filter preserves the chunky pixel aesthetic.

---

## Exercise 3: Experiment with Distortion Maps

**Difficulty:** Intermediate
**File:** `src/effects/water/effect.remastered.js` lines 173–186
**Time:** 15 minutes

The water ripple function determines the distortion on the water surface. Modify
it to create different visual effects.

**Try these modifications to `rippleHeight()`:**

1. **Calm water** — reduce all ripple contributions to zero:
   ```glsl
   float rippleHeight(vec2 xz) {
     return 0.0;
   }
   ```
   Observe: the water becomes a perfect mirror. Chrome spheres reflect
   sharply. The scene looks like a still lake.

2. **Stormy seas** — amplify the ripples:
   ```glsl
   h += wave * uRippleAmp * proximity * 5.0 / (1.0 + dist * 0.5);
   ```
   Change the damping from `1.5` to `0.5` and multiply amplitude by 5.
   The water becomes chaotic and the reflections break up.

3. **Single point source** — remove the per-sphere loop and use a fixed center:
   ```glsl
   float rippleHeight(vec2 xz) {
     float dist = length(xz);
     return sin(dist * 12.0 - uTime * 3.0) * 0.05 / (1.0 + dist);
   }
   ```
   This creates concentric ripples from the origin — a clean, hypnotic pattern.

4. **Hexagonal pattern** — use a repeating geometric pattern:
   ```glsl
   float rippleHeight(vec2 xz) {
     return (sin(xz.x * 8.0) + sin(xz.y * 8.0)
           + sin((xz.x + xz.y) * 5.66)) * uRippleAmp * 0.5;
   }
   ```

**What you learn:** How the SDF water plane displacement directly controls
the visual character of the scene. Small changes to the ripple function produce
dramatically different moods.

---

## Exercise 4: Add a Fourth Sphere

**Difficulty:** Advanced
**File:** `src/effects/water/effect.remastered.js`
**Time:** 30 minutes

The scene has 3 chrome spheres. Add a fourth.

**Steps:**

1. Add a new uniform for the fourth sphere. In `SCENE_FRAG`, add:
   ```glsl
   uniform vec4 uSphere3;
   ```

2. Change the sphere array size from 3 to 4:
   ```glsl
   vec4 SPHERE_BASE[4];
   vec3 spherePos[4];
   ```

3. In `computeState()`, add:
   ```glsl
   SPHERE_BASE[3] = uSphere3;
   ```
   And change the loop bound from 3 to 4.

4. In `sceneSDF()` and `hitObject()`, change the loop bound from 3 to 4.

5. In the JavaScript `init()` function, get the new uniform location:
   ```javascript
   sphere3: gl.getUniformLocation(sceneProg, 'uSphere3'),
   ```

6. In `render()`, set the uniform:
   ```javascript
   gl.uniform4f(su.sphere3, 0.0, 0.5, 0.0, 0.8);  // center, medium size
   ```

7. (Optional) Add editor parameters for the fourth sphere following the
   pattern of Spheres 1–3 in the `params` array.

**What you learn:** How the SDF scene composition works — adding geometry is
just adding another `min()` term. The reflection system automatically picks up
the new sphere because reflection rays use the same `march()` / `hitObject()`
functions.

---

## Exercise 5: Modify the Bloom Character

**Difficulty:** Beginner
**File:** `src/effects/water/effect.remastered.js` lines 407–467
**Time:** 10 minutes

The bloom pipeline controls how "glowy" the scene feels. Experiment with the
parameters in the editor first (Post-Processing group), then try modifying
the shaders:

1. **Change the bloom colour**: In `BLOOM_EXTRACT_FRAG`, tint the extracted
   bloom:
   ```glsl
   fragColor = vec4(c.r * 0.3, c.g * 0.5, c.b * 1.5, 1.0)
             * smoothstep(uThreshold, uThreshold + 0.3, brightness);
   ```
   This gives the bloom a blue tint — the glow will feel cooler and more
   aquatic.

2. **Widen the blur kernel**: In `BLUR_FRAG`, the Gaussian samples 9 texels
   (±4). Try extending to ±6:
   ```glsl
   result += texture(uTex, vUV - 6.0 * texel).rgb * 0.006;
   result += texture(uTex, vUV - 5.0 * texel).rgb * 0.011;
   // ... existing 9 taps ...
   result += texture(uTex, vUV + 5.0 * texel).rgb * 0.011;
   result += texture(uTex, vUV + 6.0 * texel).rgb * 0.006;
   ```
   The bloom becomes softer and more diffuse. Make sure the weights still
   sum to approximately 1.0.

3. **Kill the bloom entirely**: In `COMPOSITE_FRAG`, set both bloom
   contributions to zero:
   ```glsl
   vec3 color = scene;  // no bloom at all
   ```
   Observe how much flatter and less atmospheric the scene looks without
   bloom. This demonstrates why post-processing matters.

**What you learn:** How the bloom pipeline shapes the final look. The bloom
extraction threshold, blur radius, and composite weights are the three knobs
that control glow character.

---

## Further Exploration

Once you are comfortable with the exercises above, try these open-ended
challenges:

- **Camera animation**: Make the camera slowly orbit the scene by modifying
  `ro` (ray origin) in the `main()` function of `SCENE_FRAG`. Use `uTime`
  to drive rotation around the Y axis.

- **Colour-shifting water**: Make the water colour change over time using
  `uTime` to modulate the base colour in the `shade()` function.

- **Fog**: Add distance fog to the raymarched scene — objects further from
  the camera fade to a background colour. This is one line:
  `col = mix(col, fogColor, 1.0 - exp(-t * fogDensity))`.

- **Multiple sword layers**: Render two sword billboards at different depths
  and angles, creating a parallax effect.

---

## Summary

| Layer | Key takeaway |
|-------|-------------|
| 1 — Lookup Tables | Pre-computed displacement maps fake 3D reflections on a 1993 CPU |
| 2 — Interlaced Rendering | Splitting work across frames creates shimmer as a side effect |
| 3 — Image Compositing | A sliding window and overwrite semantics create the scrolling sword |
| 4 — GPU Rendering | Raymarching + SDFs replace all of the above with real-time 3D |
| 5 — Learning Path | Modify scroll speed, artwork, ripples, geometry, and bloom to learn by doing |

---

**Previous:** [Layer 4 — GPU Rendering](04-gpu-rendering.md)
**Back to overview:** [00-overview.md](00-overview.md)
