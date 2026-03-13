# Layer 6 — Learning Path

**Concepts:** hands-on experimentation, shader modification, parameter exploration

---

## What This Layer Covers

Now that you understand the full tunnel pipeline — circle templates, depth
perspective, sinusoidal paths, Gaussian splats, and neon bloom — this layer
provides hands-on exercises to deepen your understanding.

---

## Exercise 1: Change the Ring Count

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

Use the **Dots per Ring** parameter to see how density affects the visual:

1. Set to **64** — matches the classic. You can see the individual dots.
2. Set to **256** — the rings become smooth curves with barely visible gaps.
3. Set to **512** — nearly solid circles. The tunnel looks like a smooth tube.

Notice how more dots per ring means more additive overlap, which raises the
overall brightness. You may need to lower Bloom Strength to compensate.

---

## Exercise 2: Create a Double Helix

**Difficulty:** Medium
**File:** `src/effects/tunneli/effect.remastered.js`, dot buffer loop

Modify the dot placement to only draw dots in two opposing arcs (0–π and
π–2π) with a gap between them:

```javascript
for (let a = 0; a < dotsPerRing; a++) {
  const angle = a * angleStep;
  // Skip dots in the "gap" quadrants
  const norm = (angle % (2 * PI)) / (2 * PI);
  if (norm > 0.2 && norm < 0.3) continue;
  if (norm > 0.7 && norm < 0.8) continue;
  // ... rest of dot placement ...
}
```

Experiment with the gap positions and sizes. With the right gaps, the tunnel
looks like a DNA double helix spiralling into the distance.

---

## Exercise 3: Experiment with Additive vs Alpha Blending

**Difficulty:** Medium
**File:** `src/effects/tunneli/effect.remastered.js`, render pass 1

Change the blend mode from additive to standard alpha:

```javascript
// Additive (current):
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

// Standard alpha (try this):
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

With alpha blending, overlapping dots do not accumulate brightness — near
dots occlude far dots instead. The tunnel looks more solid and less
"glowing." Switch back and forth to see the dramatic difference.

---

## Exercise 4: Add Time-Varying Hue

**Difficulty:** Medium
**File:** `src/effects/tunneli/effect.remastered.js`, DOT_FRAG

Make the hue change over time so the tunnel cycles through colours:

```glsl
uniform float uTime;
// In main():
float hue = mod(uHueNear + hueDiff * vDepth + uTime * 30.0, 360.0);
```

Pass the effect time as `uTime`. The `× 30.0` rotates through the colour
wheel at 30° per second, completing a full cycle every 12 seconds.

---

## Exercise 5: Modify the Spiral Amplitude

**Difficulty:** Medium
**File:** `src/effects/tunneli/effect.remastered.js`, sinit/cosit tables

Change the amplitude growth rate of the position tables:

```javascript
// Original: linear growth
for (let x = 0; x < 4096; x++) sinit[x] = Math.sin(PI * x / 128) * (x * 3 / 128);

// Try: quadratic growth (faster acceleration)
for (let x = 0; x < 4096; x++) sinit[x] = Math.sin(PI * x / 128) * (x * x / 4096);

// Try: constant amplitude (no acceleration)
for (let x = 0; x < 4096; x++) sinit[x] = Math.sin(PI * x / 128) * 20;
```

Quadratic growth makes the tunnel spiral violently toward the end. Constant
amplitude makes a gentle, steady-state tunnel that never accelerates.

---

## Exercise 6: Add Motion Blur

**Difficulty:** Hard
**File:** `src/effects/tunneli/effect.remastered.js`

Replace `GL_POINTS` with `GL_LINES` to stretch each dot along its velocity
vector:

1. Compute two positions per dot: the current frame's and the previous frame's
2. Draw a line segment between them (use `gl_LineWidth` or geometry)
3. Apply the same Gaussian falloff but along the line rather than from a point

This creates motion-blurred dots that streak when the tunnel moves fast.
You will need to restructure the vertex buffer (2 vertices per dot instead
of 1) and write a new vertex shader.

---

## Further Reading

- The classic effect spec: `docs/effects/07-tunneli.md`
- The remastered spec: `docs/effects/07-tunneli-remastered.md`
- Point sprites in WebGL2: [webgl2fundamentals.org/webgl/lessons/webgl-points.html](https://webgl2fundamentals.org/webgl/lessons/webgl-points.html)
- Additive blending explained: [learnopengl.com/Advanced-OpenGL/Blending](https://learnopengl.com/Advanced-OpenGL/Blending)
