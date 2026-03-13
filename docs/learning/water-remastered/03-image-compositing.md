# Layer 3 — Image Compositing

**Source:** `src/effects/water/effect.js` lines 54–105, 138–190
**Concepts:** sliding-window animation, indexed-colour compositing, palette fading, depth ordering

---

## What This Layer Covers

- How the **scrolling sword** is animated using a shifting flat buffer
- How the **mountain background** is layered beneath the chrome reflections
- The **depth ordering** that determines what appears in front of what
- How **palette fading** creates smooth fade-in/fade-out transitions
- How **checkpoint caching** enables random-access scrubbing of stateful animation

---

## The Compositing Stack

The classic WATER effect composites three layers in a specific order:

```
  Layer 3 (top):   Sword pixels via POS table remap
                   Non-zero palette indices overwrite everything below

  Layer 2 (mid):   Background (tausta) fallback for transparent sword pixels
                   Palette index 0 in the sword → show background

  Layer 1 (base):  Full 320×200 background (BKG.CLX / tausta)
                   Copied to the framebuffer first, before any POS work
```

The compositing order in code:

```javascript
render(gl, t, _beat, _params) {
  // ...
  const fb = new Uint8Array(PIXELS);

  // Step 1: Copy background as base layer
  for (let i = 0; i < PIXELS; i++) fb[i] = tausta[i];

  // Step 2: Apply POS tables — sword overwrites where non-zero
  for (let pass = 0; pass < 3; pass++) {
    scr(pass, fbuf, fb);
  }

  // Step 3: Apply palette fade → convert to RGBA → upload to GPU
  // ...
}
```

---

## The Sliding Window (Scroll Buffer)

The sword image is 400 columns wide but the POS tables read from a 158-column
window. Animation is achieved by **sliding this window** across the sword:

```javascript
function animateOneStep(fbuf, scp) {
  const len = VIEW_W * VIEW_H;       // 158 × 34 = 5,372

  // Shift entire buffer left by 1 element
  for (let i = 0; i < len - 1; i++) fbuf[i] = fbuf[i + 1];
  fbuf[len - 1] = 0;

  // Insert new column from sword font at row-start positions
  for (let x = 0; x < 33; x++) {
    fbuf[VIEW_W + x * VIEW_W] = font[x * FONT_W + scp];
  }

  return scp < SCP_MAX ? scp + 1 : scp;
}
```

Walking through the mechanics:

1. **Shift left**: Every element in the 5,372-byte buffer moves one position
   left. This scrolls the visible content leftward by one pixel.

2. **Insert column**: A new column from the sword font (at offset `scp`) is
   written into the buffer at positions `VIEW_W + x * VIEW_W` for rows 0–32.
   This fills in the right edge with fresh sword data.

3. **Advance pointer**: `scp` increments from 0 to 390 (the maximum scroll
   position). After 390, the counter stops but the shift continues, causing
   existing content to scroll off the left edge.

```
  Step 0:                    Step 1:                    Step 2:
  ┌─────────────────────┐    ┌─────────────────────┐    ┌─────────────────────┐
  │[0][0][0]...[0] [S0] │    │[0][0]...[0] [S0][S1]│    │[0]...[0] [S0][S1][S2]
  │[0][0][0]...[0] [S0] │    │[0][0]...[0] [S0][S1]│    │[0]...[0] [S0][S1][S2]
  └─────────────────────┘    └─────────────────────┘    └─────────────────────┘
        158 columns                 ← shift left              ← shift left
        [Sn] = column n             + insert col 1            + insert col 2
        from sword font
```

The sword gradually slides into view from the right, crosses the full window
width (158 columns), and then slides out the left. The total animation is
~548 steps (390 to fill + 158 to clear).

---

## Timing

The animation runs at a fraction of the 70 fps frame rate:

```javascript
const frame = Math.floor(t * FRAME_RATE);   // 70 fps
const animSteps = Math.floor(frame / 3);    // 1 scroll step every 3 frames
```

One scroll step every 3 frames = ~23.3 steps per second. At 548 total steps,
the full scroll takes approximately 23.5 seconds — comfortably within the
effect's 28.9-second window, leaving time for fade-in and fade-out.

```
  Timeline (seconds):

  0.0 ──── 0.9 ──── 16.7 ──── 23.5 ──── 28.9
  │  fade  │  sword scrolls right→left  │ fade │
  │  in    │                            │ out  │
  └────────┴────────────────────────────┴──────┘
  63 frames  ~390 scroll steps + 158     63 frames
             clear steps
```

---

## Depth Ordering via Overwrite Semantics

The classic WATER effect uses the simplest possible depth ordering: **later
writes win**. There is no z-buffer, no alpha blending, no transparency mask.

The `scr()` function writes sword pixels on top of the background. Non-zero
pixels overwrite; zero pixels fall back to the background:

```javascript
let pv = fbuf[fontIdx];         // source pixel from scroll buffer
if (pv === 0) pv = tausta[dest]; // transparent → show background
fb[dest] = pv;                   // overwrite framebuffer
```

This creates a two-level depth stack:

```
  Screen pixel decision tree:

       POS table maps
       source pixel here?
              │
        ┌─────┴─────┐
        │ YES        │ NO
        │            │
   Source pixel       Background
   is non-zero?       pixel shown
        │
   ┌────┴────┐
   │ YES     │ NO
   │         │
  Sword     Background
  pixel     pixel shown
  shown
```

The chrome spheres appear to float in front of the mountains because the POS
tables write the sword *after* the background is laid down.

---

## Palette Fade-In and Fade-Out

The classic effect doesn't use alpha blending. Instead, it **scales the entire
palette** to create fade transitions:

```javascript
const activePal = new Uint8Array(768);   // 256 colours × 3 channels

if (frame < 63) {
  // Fade in: palette entries scaled from 0% to 100%
  const level = frame / 63;
  for (let i = 0; i < 768; i++)
    activePal[i] = Math.floor(pal[i] * level);

} else if (frame > fadeOutStartFrame) {
  // Fade out: palette entries scaled from 100% to 0%
  const level = clamp(1 - (frame - fadeOutStartFrame) / 63, 0, 1);
  for (let i = 0; i < 768; i++)
    activePal[i] = Math.floor(pal[i] * level);

} else {
  // Normal: palette at full brightness
  for (let i = 0; i < 768; i++) activePal[i] = pal[i];
}
```

This is the same technique used by the original VGA hardware: the palette DAC
registers were multiplied by a fade factor. Every colour in the scene dims
uniformly — a cheap but effective transition.

The palette is stored in 6-bit VGA format (0–63 per channel). The final
conversion to 8-bit RGBA uses a scaling factor of `255/63 ≈ 4.048`:

```javascript
const k = 255 / 63;
const r = Math.round(clamp(activePal[ci * 3], 0, 63) * k);
const g = Math.round(clamp(activePal[ci * 3 + 1], 0, 63) * k);
const b = Math.round(clamp(activePal[ci * 3 + 2], 0, 63) * k);
```

---

## Checkpoint-Based Scrubbing

The scroll animation is **stateful** — the buffer at step N depends on all
previous shifts. This makes random-access scrubbing expensive: jumping to step
400 requires replaying 400 shifts from a blank buffer.

The implementation uses a **checkpoint cache** to mitigate this:

```javascript
const CHECKPOINT_INTERVAL = 50;
let checkpoints;   // array of { fbuf, scp } snapshots
```

Every 50 animation steps, a snapshot of the buffer state is saved. Scrubbing to
any position replays from the nearest checkpoint:

```
  Checkpoints:
  Step 0     Step 50    Step 100   Step 150   ...
  [saved]    [saved]    [saved]    [saved]

  To reach step 173:
  1. Load checkpoint at step 150
  2. Replay 23 steps (150 → 173)
  3. Done — max 49 replays instead of 173
```

For sequential playback, the cached state from the last frame is reused:

```javascript
if (cachedStep !== null && cachedStep <= targetStep &&
    targetStep - cachedStep < CHECKPOINT_INTERVAL * 2) {
  // Fast path: resume from last frame's state
  fbuf = new Uint8Array(cachedFbuf);
  scp = cachedScp;
  startStep = cachedStep;
}
```

This gives O(1) incremental cost for normal playback and O(50) worst-case cost
for random scrubbing — a good tradeoff for interactive editor use.

---

## How the Remastered Differs

The remastered variant eliminates the entire compositing pipeline:

| Classic | Remastered |
|---------|------------|
| Background copied as base layer | No background — procedural water surface |
| Sliding buffer shifts sword pixels | Scroll offset as a uniform: `uScrollOffset` |
| POS tables scatter pixels to screen | Sword sampled via UV offset in shader |
| Palette index 0 = transparent | Dark pixels (`lum < 0.015`) = transparent |
| Palette fade via DAC scaling | `uFade` uniform multiplies final colour |

The scroll offset computation is identical:

```javascript
const scrollOffset = Math.min(Math.floor(frame / 3), SCP_MAX);
```

But instead of driving a shift buffer, it is passed to the GPU as a uniform
and used to offset texture coordinates in the sword billboard shader.

---

**Previous:** [Layer 2 — Interlaced Rendering](02-interlaced-rendering.md)
**Next:** [Layer 4 — GPU Rendering](04-gpu-rendering.md)
