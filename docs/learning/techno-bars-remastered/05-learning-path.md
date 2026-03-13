# Layer 5 — Learning Path

**Concepts:** hands-on experimentation, shader modification, parameter exploration

---

## What This Layer Covers

Now that you understand the full techno bars pipeline — bar geometry, EGA
history, motion phases, and GPU rendering — this layer provides hands-on
exercises to deepen your understanding. Each exercise can be done
independently.

---

## Exercise 1: Change the Bar Count

**Difficulty:** Easy
**File:** `src/effects/technoBars/effect.remastered.js`, line 114 (GLSL)

The modular distance computation determines bar spacing. Change the divisor
to alter how many bars appear:

```glsl
// Original: bars spaced 4 units apart (11 bars visible)
float nearest = round(t / 4.0) * 4.0;

// Try: bars spaced 2 units apart (denser, more bars)
float nearest = round(t / 2.0) * 2.0;

// Try: bars spaced 8 units apart (fewer, wider gaps)
float nearest = round(t / 8.0) * 8.0;
```

You will also need to adjust the range check on line 120:

```glsl
// Original: bars from -20 to +20 (11 bars at spacing 4)
float in_range = step(abs(nearest), 20.5);

// For spacing 2: extend range to fit more bars
float in_range = step(abs(nearest), 20.5);

// For spacing 8: reduce range
float in_range = step(abs(nearest), 24.5);
```

Observe how denser bars create more complex interference patterns, while
sparser bars make the individual rotations more visible.

**Goal:** Understand how modular distance controls bar density.

---

## Exercise 2: Experiment with Colour Smoothing

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

In the editor, select the TECHNO_BARS clip and adjust the **Color Smoothing**
parameter:

- **0.0** — pure hard counting. Colour jumps in discrete steps (0, 1, 2, 3, 4).
  This exactly matches the classic 1993 popcount look.
- **0.5** — the default blend. Sharp colour character with softened edges.
- **1.0** — pure smooth counting. Continuous colour gradients at every bar edge.
  The pattern looks more like a modern generative art piece.

Scrub through time while adjusting this parameter to see how it interacts
with different overlap densities. Dense Phase 2 patterns look very different
at smooth=0 vs smooth=1.

**Goal:** Build intuition for hard vs soft overlap counting.

---

## Exercise 3: Create Radial Bars

**Difficulty:** Medium
**File:** `src/effects/technoBars/effect.remastered.js`, GLSL `evalBars`

Replace the parallel bar geometry with radial (spoke) bars. Instead of using
the modular distance in the linear `t` coordinate, use the angular position:

```glsl
float evalBarsRadial(vec2 pos, float rotVal, float vmVal, vec2 center) {
  vec2 d = pos - center;
  float angle = atan(d.y, d.x) + rotVal * TAU / 1024.0;
  float radius = length(d);

  float barAngle = round(angle / (TAU / 11.0)) * (TAU / 11.0);
  float angDist = abs(angle - barAngle);

  float fw = fwidth(angle);
  float barWidth = vmVal / 2000.0;
  float aa = 1.0 - smoothstep(barWidth - fw, barWidth + fw, angDist);

  float radialFade = smoothstep(0.0, 20.0, radius);
  return aa * radialFade;
}
```

This creates 11 bars radiating outward from the centre like clock hands,
with the same rotation and anti-aliasing principles but in polar coordinates.

**Goal:** Understand that the modular-distance trick works in any coordinate
system, not just Cartesian.

---

## Exercise 4: Add Per-Bar Colour Variation

**Difficulty:** Medium
**File:** `src/effects/technoBars/effect.remastered.js`, GLSL `evalBars` and `main`

Modify `evalBars` to return both coverage and bar identity:

```glsl
vec2 evalBarsWithID(vec2 pos, float rotVal, float vmVal, vec2 center) {
  // ... same setup as evalBars ...
  float nearest = round(t / 4.0) * 4.0;
  float barID = nearest / 4.0 + 5.0;  // 0-10 range

  // ... same aa computation ...
  return vec2(aa_s * aa_t * in_range, barID / 11.0);
}
```

In `main`, use the bar ID to tint each bar differently:

```glsl
vec2 result0 = evalBarsWithID(pos, uBarRot[0], uBarVm[0], ...);
float hue = result0.y * 0.3;  // slight hue variation per bar
vec3 barTint = vec3(0.5 + 0.5 * cos(hue * TAU),
                    0.5 + 0.5 * cos(hue * TAU + 2.094),
                    0.5 + 0.5 * cos(hue * TAU + 4.189));
```

**Goal:** Learn how to extract additional information from the geometry
evaluation and use it for per-primitive shading.

---

## Exercise 5: Modify Rotation Acceleration Curves

**Difficulty:** Medium
**File:** `src/effects/technoBars/effect.remastered.js`, lines 338–344 (Phase 2)

Phase 2 uses linear acceleration (`rota += 1` each frame). Try different
acceleration profiles:

```javascript
// Original: linear acceleration
rota += 1;

// Try: quadratic acceleration (faster ramp-up)
rota += Math.floor((frame - SEQ1_END) / 100) + 1;

// Try: sinusoidal acceleration (speed breathes in and out)
rota = 10 + Math.floor(50 * Math.sin((frame - SEQ1_END) * Math.PI / 840));

// Try: sudden jumps (rotation speed doubles every 2 seconds)
if ((frame - SEQ1_END) % 140 === 0) rota *= 2;
```

Each profile creates a dramatically different visual feel. Linear acceleration
builds tension gradually. Quadratic creates an explosive climax. Sinusoidal
creates a breathing, organic rhythm.

**Goal:** Understand how the acceleration curve shapes the emotional arc of
the animation.

---

## Exercise 6: Experiment with Bloom Parameters

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

Use the editor's parameter controls to explore the bloom pipeline:

1. Set **Bloom Threshold** to 0.0 — everything blooms. The bars get a soft,
   dreamy haze.
2. Set **Bloom Threshold** to 0.9 — only the brightest 4-bar overlaps glow.
3. Crank **Bloom Strength** to 2.0 — extreme glow overwhelms bar edges.
4. Set **Beat Reactivity** to 1.0 and play with music — watch how bloom
   pulses on each downbeat.
5. Set **Scanlines** to 0.5 — aggressive CRT effect that emphasises the
   retro character.
6. Compare different **Palette** themes with bloom. Some themes (Ember,
   Synthwave) bloom dramatically; others (Monochrome, Nord) are more subtle.

**Goal:** Build intuition for how post-processing parameters interact with
the underlying bar geometry.

---

## Exercise 7: Trace the Circular Buffer

**Difficulty:** Advanced
**No code changes needed**

Pick frame 450 (early Phase 2). Work through `getPlaneParams(450)` by hand:

1. What is `page`? (`450 % 8 = 2`)
2. What is `curPlaneIdx`? (`Math.floor(450 / 8) % 4 = 56 % 4 = 0`)
3. For k=0: `histFrame = 450`, `planeIdx = 0`. What rotation was stored at
   frame 450?
4. For k=1: `histFrame = 442`, `planeIdx = 3`. Is this frame in the same
   phase? (442 > 420 = SEQ1_END, so yes — it is in Phase 2.)
5. For k=2: `histFrame = 434`, `planeIdx = 2`. Also Phase 2.
6. For k=3: `histFrame = 426`, `planeIdx = 1`. Also Phase 2.

Now try frame 428 (just after Phase 2 starts):
- For k=3: `histFrame = 404`. This is before SEQ1_END (420)? No, 404 < 420 so
  it belongs to Phase 1. But `phaseStart` for Phase 2 is 420, and
  `404 < 420`, so this plane is skipped (`active[planeIdx] = 0`).

**Goal:** Understand how the circular buffer and phase boundaries interact
to produce the correct 4-plane composite at every frame.

---

## Exercise 8: Create a Trail Effect

**Difficulty:** Advanced
**File:** `src/effects/technoBars/effect.remastered.js`

Add temporal persistence by blending the current frame with previous frames:

1. Create a new FBO pair (`trailFBO1`, `trailFBO2`)
2. After the bars pass, blend the current `sceneFBO` with the previous trail:
   - Render `trailFBO1` at 90% opacity (fade old trails)
   - Render `sceneFBO` on top at full opacity
   - Write result to `trailFBO2`, then swap
3. Use the trail texture as input to the bloom pipeline instead of `sceneFBO`

The bars will leave ghostly afterimages as they rotate, creating luminous
streaks that trace the rotation path. Experiment with different fade rates
(80% for long trails, 95% for subtle persistence).

**Goal:** Learn temporal accumulation and FBO chaining — the foundation of
motion blur and trail effects.

---

## Further Reading

- The classic effect spec: `docs/effects/10-techno-bars.md`
- WebGL2 fundamentals: [webgl2fundamentals.org](https://webgl2fundamentals.org)
- `fwidth()` and screen-space derivatives: [Khronos fwidth reference](https://registry.khronos.org/OpenGL-Refpages/gl4/html/fwidth.xhtml)
- Inigo Quilez on 2D SDF shapes: [iquilezles.org/articles/distfunctions2d](https://iquilezles.org/articles/distfunctions2d/)
- The demoscene's use of VGA planar mode: [Fabien Sanglard's VGA articles](https://fabiensanglard.net/vga/)

---

**Back to:** [Overview](00-overview.md)
