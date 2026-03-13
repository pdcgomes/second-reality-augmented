# Layer 5 — Learning Path

**Concepts:** hands-on experimentation, shader modification, parameter exploration

---

## What This Layer Covers

Now that you understand the full plasma pipeline — sine harmonics, dual-layer
blending, procedural palettes, bloom, and beat reactivity — this layer
provides hands-on exercises to deepen your understanding. Each exercise can
be done independently.

---

## Exercise 1: Create a Custom Palette Theme

**Difficulty:** Easy
**File:** `src/effects/plasma/effect.remastered.js`, lines 24–46

Add a new entry to the `PALETTES` array with your own 3×3 colour remapping
matrix:

```javascript
{ name: 'MyTheme', colorMap: [[r1,g1,b1], [r2,g2,b2], [r3,g3,b3]] },
```

Each column controls how one input channel maps to RGB output. Start by
modifying an existing theme and observing the change in the editor. Try:

- A monochrome theme: make all three columns identical (e.g. `[0.5, 0.5, 0.5]`)
- An inverted theme: swap the red and blue columns
- A high-contrast theme: use values above 1.0 in one channel to over-saturate

The theme will automatically appear in the editor's dropdown after adding it.

---

## Exercise 2: Change the Harmonic Ratios

**Difficulty:** Medium
**File:** `src/effects/plasma/effect.remastered.js`, lines 87–100

Modify the harmonic multipliers in the GLSL sine functions. For example,
change `psini` to use different overtones:

```glsl
// Original:
return sin(t) * 55.0 + sin(t * 6.0) * 5.0 + sin(t * 21.0) * 4.0 + 64.0;

// Try: lower harmonics for smoother look
return sin(t) * 55.0 + sin(t * 2.0) * 15.0 + sin(t * 3.0) * 10.0 + 64.0;

// Try: very high harmonics for grainy texture
return sin(t) * 55.0 + sin(t * 31.0) * 8.0 + sin(t * 47.0) * 6.0 + 64.0;
```

Observe how lower harmonics produce flowing, blobby shapes while higher
harmonics create fine-grained noise. Try changing the amplitudes too — making
the higher harmonics louder than the fundamental inverts the visual hierarchy.

Remember to change both the GLSL functions in the shader and (optionally) the
JavaScript tables in the classic variant if you want both to match.

---

## Exercise 3: Add a Third Plasma Layer

**Difficulty:** Medium-Hard
**File:** `src/effects/plasma/effect.remastered.js`, GLSL `main()` function

The effect uses two layers (K and L). Add a third with its own parameter set:

1. Add uniforms `uM1, uM2, uM3, uM4` in the shader
2. Compute a third colour index `mCi` using the same formula chain
3. Extend the blend to mix three layers:
   ```glsl
   float blendKL = 0.5 + 0.2 * sin(yCoord * PI / 140.0);
   float blendM  = 0.3 * sin(vUV.x * PI * 2.0 + yCoord * PI / 200.0);
   float ci = mix(mix(kCi, lCi, blendKL), mCi, 0.5 + blendM);
   ```
4. In the JavaScript `render()`, add M-layer parameter drift with unique speeds

This will create an even richer visual by layering three independent plasma
patterns.

---

## Exercise 4: Animate the Blend Function

**Difficulty:** Medium
**File:** `src/effects/plasma/effect.remastered.js`, GLSL `main()` function

The spatial blend between K and L layers is currently static (depends only on
position). Make it time-dependent:

```glsl
uniform float uTime;
// ...
float blend = 0.5
  + 0.2 * sin(yCoord * PI / 140.0 + uTime * 0.5)
  + 0.2 * sin(vUV.x * PI * 3.0 - uTime * 0.3);
```

Pass `t` as `uTime` from the render function. The blend regions will now
slowly migrate across the screen, creating a more dynamic interplay between
the two layers. Experiment with different speeds and directions.

---

## Exercise 5: Experiment with Bloom Parameters

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

Use the editor's parameter controls to explore the bloom pipeline:

1. Set **Bloom Threshold** to 0.0 — everything blooms. Notice how the entire
   image gets a soft haze.
2. Set **Bloom Threshold** to 0.9 — only the brightest pixels bloom. The
   effect is more subtle and targeted.
3. Crank **Bloom Strength** to 2.0 — the glow overwhelms the original image.
4. Set **Beat Reactivity** to 1.0 and play the demo with music — watch how
   the plasma pulses on each downbeat.
5. Set **Scanlines** to 0.5 for an aggressive CRT look.

Try to find the sweet spot where bloom enhances without overwhelming. The
defaults (threshold 0.25, strength 0.45) are a good starting point.

---

## Exercise 6: Port a New Palette Function

**Difficulty:** Hard
**File:** `src/effects/plasma/effect.remastered.js`, GLSL palette functions

Create a completely new palette function `palette3` with a different colour
journey. Some ideas:

- **Neon**: bright cyan and magenta with black gaps
- **Thermal**: black → blue → red → yellow → white (like a thermal camera)
- **Pastel**: all channels stay above 0.3, never reaching full black

Use `ptau()` calls with different input ranges and channel assignments.
Register it by adding a case to `getPalette()` and a new palette sequence
entry. You will also need to add a new sync frame to `SYNC_FRAMES` to trigger
the transition.

---

## Further Reading

- The classic effect spec: `docs/effects/16-plz-plasma.md`
- The remastered spec: `docs/effects/16-plz-plasma-remastered.md`
- WebGL2 fundamentals: [webgl2fundamentals.org](https://webgl2fundamentals.org)
- Fourier synthesis visualised: [An Interactive Introduction to Fourier Transforms](https://www.jezzamon.com/fourier/)
- Inigo Quilez's articles on procedural colour palettes: [iquilezles.org/articles/palettes](https://iquilezles.org/articles/palettes/)
