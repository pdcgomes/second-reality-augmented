# Layer 5 — Learning Path

**Concepts:** hands-on experimentation, texture rendering, atmospheric effects

---

## What This Layer Covers

Now that you understand the full ALKU pipeline — landscape scrolling, bitmap
font rendering, palette fading, and GPU compositing with bloom — this layer
provides hands-on exercises.

---

## Exercise 1: Change the Credit Text

**Difficulty:** Easy
**File:** `src/effects/alku/effect.remastered.js`, TEXT_SCREENS array

Modify the text content in the `TEXT_SCREENS` array:

```javascript
const TEXT_SCREENS = [
  { lines: [{ y: 120, text: 'A' }, { y: 160, text: 'Future Crew' }, { y: 200, text: 'Production' }] },
  // ...
];
```

Each entry has a `y` position (in 256-pixel space) and `text` string. Try:
- Adding your own credits
- Changing the vertical spacing between lines
- Adding more text screens by extending the array and `SEQ_TIMES`

---

## Exercise 2: Create Custom Fade Curves

**Difficulty:** Medium
**File:** `src/effects/alku/effect.remastered.js`, fade computation

The default fade is linear. Try non-linear curves for different feels:

```javascript
// Linear (current):
fadeFrac = framesSinceStart / TEXT_FADE_FRAMES;

// Ease-in (slow start, fast end):
fadeFrac = Math.pow(framesSinceStart / TEXT_FADE_FRAMES, 2);

// Ease-out (fast start, slow end):
fadeFrac = 1 - Math.pow(1 - framesSinceStart / TEXT_FADE_FRAMES, 2);

// Ease-in-out (smooth both ends):
const t = framesSinceStart / TEXT_FADE_FRAMES;
fadeFrac = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
```

Ease-out feels more natural for fade-in (text appears quickly then settles),
while ease-in feels more dramatic for fade-out (text lingers then vanishes).

---

## Exercise 3: Add a Parallax Scroll Layer

**Difficulty:** Medium-Hard
**File:** `src/effects/alku/effect.remastered.js`, SCENE_FRAG

Create a two-layer parallax effect by sampling the landscape at two different
scroll speeds:

```glsl
// Far layer (current):
float farX = uv.x * 0.5 + uScrollOffset;
vec3 farColor = texture(uLandscape, vec2(farX, landscapeUVy)).rgb;

// Near layer (scrolls faster):
float nearX = uv.x * 0.5 + uScrollOffset * 1.5;
vec3 nearColor = texture(uLandscape, vec2(nearX, landscapeUVy * 0.8)).rgb;

// Blend based on vertical position (near layer only in foreground):
float nearMix = smoothstep(0.5, 0.8, uv.y);
color = mix(farColor, nearColor, nearMix * 0.4);
```

The near layer scrolls 50% faster and uses a slightly different vertical
region of the landscape texture. The `smoothstep` blend makes it visible
only in the lower portion of the screen, creating a sense of depth.

---

## Exercise 4: Enhance the Horizon Glow

**Difficulty:** Easy
**File:** Editor UI or `src/effects/alku/effect.remastered.js`

Experiment with the horizon glow parameters:

1. Set `horizonGlow` to 1.0 — dramatic purple band across the sky
2. Change `glowColor` from purple `(0.3, 0.05, 0.4)` to:
   - Golden: `(0.8, 0.5, 0.1)`
   - Cyan: `(0.1, 0.4, 0.6)`
   - Red: `(0.6, 0.05, 0.05)`
3. Increase `uGlowHeight` for a wider band that covers more of the sky
4. Set `horizonPulseSpeed` to 3.0 for rapid flickering

---

## Exercise 5: Add a Starfield Above the Landscape

**Difficulty:** Hard
**File:** `src/effects/alku/effect.remastered.js`, SCENE_FRAG

The sky above the landscape (uv.y < skyFraction) is currently black. Add
procedural stars:

```glsl
if (uv.y < skyFraction) {
  // Hash-based star placement
  vec2 cell = floor(uv * vec2(200.0, 50.0));
  float h = fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453);
  if (h > 0.98) {
    float twinkle = sin(uTime * 2.0 + h * 100.0) * 0.3 + 0.7;
    color = vec3(h * twinkle);
  }
}
```

The hash function places stars at random grid positions. The `> 0.98`
threshold controls star density (2% of cells have a star). The twinkle
oscillates brightness over time.

---

## Further Reading

- The classic effect spec: `docs/effects/01-alku.md`
- The remastered spec: `docs/effects/01-alku-remastered.md`
- Bitmap font rendering: [learnopengl.com/In-Practice/Text-Rendering](https://learnopengl.com/In-Practice/Text-Rendering)
- Parallax scrolling in games: [developer.mozilla.org/en-US/docs/Games/Techniques/2D_collision_detection](https://developer.mozilla.org)

---

**Back to:** [Overview](00-overview.md)
