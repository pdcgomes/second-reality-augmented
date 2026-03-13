# Layer 5 — Learning Path

**Concepts:** hands-on experimentation, shader modification, parameter exploration

---

## What This Layer Covers

Now that you understand the full techno circles pipeline — EGA bit-plane
data, moiré interference, per-scanline distortion, palette theming, and
bloom — this layer provides hands-on exercises to deepen your understanding.
Each exercise can be done independently.

---

## Exercise 1: Explore Palette Themes

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

Open the effect in the editor and cycle through all 21 palette themes. For
each one, note:

- How `pal1` and `pal2` tints create contrast at the interference boundary
- How some themes (e.g., Monochrome) reduce the moiré to subtle shading
- How high-saturation themes (e.g., Synthwave) make the ring structure pop

Try scrubbing to Phase 2 (past ~3.7 seconds) where both circles are active.
Find a theme where the interference boundary is most visible, and one where
it nearly disappears. Why does this happen?

**Goal:** Build intuition for how palette tint vectors affect the visual.

---

## Exercise 2: Change the Distortion Scale

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

With the effect playing in Phase 2 (past ~12 seconds, when distortion is
active), adjust the **Distortion Scale** parameter:

- Set to 0.0 — distortion disappears entirely. The circles orbit cleanly.
- Set to 1.0 (default) — organic wave-like warping.
- Set to 3.0 (maximum) — extreme distortion, circle2 becomes heavily warped.

Notice how higher distortion values make the moiré bands wider and more
fluid, while lower values keep the interference pattern tighter and more
geometric.

**Goal:** Understand the relationship between distortion amplitude and
visual complexity.

---

## Exercise 3: Experiment with Colour Smoothing

**Difficulty:** Easy
**File:** Editor UI (no code changes needed)

Adjust the **Color Smoothing** parameter:

- Set to 0.0 — hard pixel-level ring edges, exactly like the 1993 original
- Set to 0.3 (default) — subtle anti-aliasing at ring boundaries
- Set to 1.0 — fully smooth blending between adjacent ring colours

Zoom in (if possible) to see the ring edges. At 0.0 you will see crisp
stair-step aliasing at ring boundaries. At 1.0 the rings blend smoothly
into each other, losing some of the retro crispness but gaining visual
refinement.

**Goal:** See how fractional palette interpolation provides anti-aliasing.

---

## Exercise 4: Create a Third Circle Pattern

**Difficulty:** Hard
**File:** `src/effects/technoCircles/effect.remastered.js`

The effect combines two circles via OR. Try adding a third synthetic circle:

1. Generate a simple ring pattern in JavaScript (concentric rings using
   distance from centre):
   ```javascript
   const c3data = new Uint8Array(640 * 400);
   for (let y = 0; y < 400; y++) {
     for (let x = 0; x < 640; x++) {
       const dx = x - 320, dy = y - 200;
       const dist = Math.sqrt(dx * dx + dy * dy);
       c3data[y * 640 + x] = Math.floor(dist / 20) % 8;
     }
   }
   ```

2. Upload it as a third R8 texture using `uploadCircleTexture()`

3. In the fragment shader, sample the third circle and combine it:
   ```glsl
   float ring3 = sampleCircle3(someCoord);
   float ci = floor(ring1 + 0.5) + floor(ring2 + 0.5);
   // Blend ring3 into the result somehow — XOR? addition? max?
   ```

4. Give it its own orbital parameters

Experiment with different combination methods. XOR (`ci = float(int(ci) ^
int(ring3))`) creates different interference patterns than OR or addition.

**Goal:** Understand how the choice of combination operator affects moiré
character.

---

## Exercise 5: Change Orbital Speeds

**Difficulty:** Medium
**File:** `src/effects/technoCircles/effect.remastered.js`, line 516–517

The two circles orbit at +7 and +5 per frame:

```javascript
const overrot  = (211 + 7 * n) % 1024;
const scrnrot  = (5 * n) % 1024;
```

Try different speed combinations:

- **Same speed** (`7, 7`): the circles orbit in sync — the interference
  pattern becomes static (boring!)
- **Very different** (`13, 3`): fast/slow contrast, rapid pattern evolution
- **One stationary** (`7, 0`): one circle stays centred while the other
  orbits around it
- **Opposite direction**: use negative speed for one (e.g., `1024 - 5`)

Notice how coprime speeds (like 5 and 7) produce the most varied long-term
patterns because the orbits never exactly repeat. Speeds sharing a common
factor create repetitive patterns that loop more visibly.

**Goal:** Develop intuition for how orbital speed ratios affect visual
complexity.

---

## Exercise 6: Add Vertical Distortion

**Difficulty:** Medium
**File:** `src/effects/technoCircles/effect.remastered.js`, GLSL `main()`

The current distortion only shifts horizontally. Add a vertical component:

```glsl
float sinrotx = mod(uSinurot + 9.0 * pos.x, 1024.0);
float sinx = mod(floor(sin1024(sinrotx) / 8.0), 256.0);
if (sinx < 0.0) sinx += 256.0;
float powry = power0(uSinuspower, sinx) * uDistortionScale * 0.5;

vec2 c2coord = vec2(pos.x + overx + powr, pos.y + overy + powry);
```

The `* 0.5` makes vertical distortion subtler. Observe how adding a second
distortion axis changes the character from "horizontal waves" to "rippling
water." Try different scaling factors to find a balance you like.

**Goal:** Understand how multi-axis distortion creates more complex warping.

---

## Exercise 7: Visualise the Palette Index

**Difficulty:** Beginner
**File:** `src/effects/technoCircles/effect.remastered.js`, GLSL `main()`

Replace the palette lookup with a direct visualisation of the colour index:

```glsl
// Replace: color = phase2Pal(ci, uPalShift, uColorSmooth);
// With:
color = vec3(ci / 15.0);  // grayscale: 0=black, 15=white
```

Now you see the raw interference pattern without palette colouring. The
0–7 band (circle1 only) appears as dark grays; the 8–15 band (overlap)
appears as bright grays. This reveals the moiré structure more clearly than
the coloured version.

Try: `color = vec3(ci / 15.0, mod(ci, 8.0) / 7.0, step(8.0, ci));` for
a false-colour visualisation that highlights both the ring index (green)
and the circle2 mask boundary (blue).

**Goal:** See the raw data that drives the visual, separated from palette
aesthetics.

---

## Further Reading

- The classic effect spec: `docs/effects/08-techno-circles.md`
- The remastered spec: `docs/effects/08-techno-circles-remastered.md`
- Wikipedia on Moiré patterns: [en.wikipedia.org/wiki/Moiré_pattern](https://en.wikipedia.org/wiki/Moir%C3%A9_pattern)
- EGA bit-plane architecture: [en.wikipedia.org/wiki/Enhanced_Graphics_Adapter](https://en.wikipedia.org/wiki/Enhanced_Graphics_Adapter)
- WebGL2 fundamentals: [webgl2fundamentals.org](https://webgl2fundamentals.org)

---

**Back to:** [Overview](00-overview.md)
