# Layer 3 — Bounce Physics

**Source:** `src/effects/lens/effect.remastered.js` (lines 355–369), `src/effects/lens/effect.js` (lines 112–123)
**Concepts:** Euler integration, fixed-point arithmetic, gravity, dampened rebound, deterministic replay

---

## What This Layer Covers

The crystal ball does not just sit still — it bounces. This layer explains:

- How **position + velocity + gravity** create realistic bouncing motion
- Why the simulation uses **fixed-point arithmetic** (×64 scaling)
- How **dampened rebounds** make the ball lose energy on each bounce
- Why the simulation is **replayed from frame 0** every render call
- How this compares to the DOTS effect's physics (much simpler — one object
  instead of 512)

---

## The Physics Loop

Both classic and remastered use identical physics. The remastered extracts
it into a standalone function:

```javascript
function computeLensPosition(frame) {
  let lx = 65 * 64, ly = -50 * 64, lxa = 64, lya = 64;
  let firstBounce = true;
  for (let f = 0; f < frame; f++) {
    lx += lxa; ly += lya;
    if (lx > 256 * 64 || lx < 60 * 64) lxa = -lxa;
    if (ly > 150 * 64 && f < 600) {
      ly -= lya;
      if (firstBounce) { lya = Math.floor(-lya * 2 / 3); firstBounce = false; }
      else lya = Math.floor(-lya * 9 / 10);
    }
    lya += 2;
  }
  return { x: lx / 64, y: ly / 64 };
}
```

Let's break this down step by step.

---

## Fixed-Point Arithmetic

Positions and velocities are stored as integers scaled by 64:

```
lx  = 65 * 64  = 4160    →  actual position: 65 pixels
ly  = -50 * 64 = -3200   →  actual position: -50 pixels (above screen)
lxa = 64                  →  actual velocity: 1 pixel/frame
lya = 64                  →  actual velocity: 1 pixel/frame
```

The ×64 scaling gives **6 bits of sub-pixel precision** without using floating
point. This was critical in 1993 when floating-point operations were expensive.
The final screen position is recovered by dividing by 64:

```javascript
return { x: lx / 64, y: ly / 64 };
```

---

## Step-By-Step Physics

Each frame applies three rules in order:

### 1. Move

```javascript
lx += lxa;   // x position += x velocity
ly += lya;   // y position += y velocity
```

This is **Euler integration** — the simplest form of physics simulation.
Position changes by velocity each timestep.

### 2. Bounce off walls (X axis)

```javascript
if (lx > 256 * 64 || lx < 60 * 64) lxa = -lxa;
```

If the lens moves past the left boundary (x = 60) or right boundary (x = 256),
the horizontal velocity reverses. This is a perfectly elastic wall bounce — no
energy is lost horizontally.

```
              60                         256
  ─────────── │ ◀──────────────────────▶ │ ───────────
              │     ball bounces here    │
              │     ←────→  ←────→      │
```

### 3. Bounce off floor (Y axis) with damping

```javascript
if (ly > 150 * 64 && f < 600) {
  ly -= lya;              // undo the move that went past the floor
  if (firstBounce) {
    lya = Math.floor(-lya * 2 / 3);   // first bounce: keep 2/3 energy
    firstBounce = false;
  } else {
    lya = Math.floor(-lya * 9 / 10);  // subsequent: keep 9/10 energy
  }
}
```

The floor is at `y = 150` (in the 320×200 coordinate space). When the ball
hits the floor:

1. The downward move is undone (`ly -= lya`)
2. The vertical velocity reverses and is **dampened** — multiplied by a
   fraction less than 1

The first bounce is more dramatic (loses 1/3 of energy: `2/3` retention),
giving a strong initial impact. Subsequent bounces are gentler (lose only 1/10:
`9/10` retention), so the ball settles gradually.

```
  Start: ball above screen (y = -50)
    ↓
    ↓  falls under gravity
    ↓
   ─●──────── first bounce (2/3 energy kept)
    ↑
    ↑  rises to ~2/3 of original height
    ↑
    ↓
   ─●──────── second bounce (9/10 energy kept)
    ↑
    ↓
   ─●──────── third bounce (9/10)
    ↑↓
   ─●──── settles on floor
```

### 4. Gravity

```javascript
lya += 2;   // constant downward acceleration
```

Every frame, the downward velocity increases by 2 (in fixed-point units, that
is `2/64 ≈ 0.03` pixels per frame²). This is a constant gravitational
acceleration — the same `F = ma` that makes real objects fall.

---

## The f < 600 Guard

```javascript
if (ly > 150 * 64 && f < 600) {
```

After frame 600, bouncing is disabled. The ball can fall through the floor.
This is a safety rail — by frame 600 the ball has long since settled, and the
guard prevents any numerical drift from causing unexpected late bounces.

---

## Deterministic Replay

The simulation has no persistent state between render calls. Every time
`computeLensPosition(frame)` is called, it replays from frame 0:

```javascript
const frame = Math.floor(t * FRAME_RATE);  // convert seconds → frame number
const pos = computeLensPosition(frame);     // replay from scratch
```

**Why?** Because it makes editor scrubbing trivial. Jump to any point in time
and the position is correct. No need to store or restore checkpoints.

The tradeoff is CPU cost — `O(frame)` per render call. For a single object over
~800 frames (11.3 seconds × 70 fps), this is negligible. Compare this to the
DOTS effect, which replays 512 particles — the cost is 512× higher there, but
still fast enough.

---

## Comparison with DOTS Physics

| Aspect | LENS_LENS | DOTS |
|--------|-----------|------|
| **Objects** | 1 ball | 512 particles |
| **Dimensions** | 2D (x, y) | 3D (x, y, z) |
| **Gravity** | `+2` per frame | `+gravity` (variable, decreases over time) |
| **Bounce damping** | 2/3 first, 9/10 after | Fixed `13/16` (81%) for all |
| **Wall collisions** | Left/right walls + floor | Floor only |
| **Spawn phases** | Single entry from above | 4 phases (helix, fountain, ring, scatter) |
| **Replay cost** | O(frame) — trivial | O(frame × 512) — still fast |

The LENS_LENS physics is intentionally simple — one ball with gravity, walls,
and dampened floor bounces. The visual interest comes from the refraction
effect, not the motion complexity.

---

## From Physics to Shader Uniforms

The remastered converts the integer position to normalized UV coordinates for
the GPU shader:

```javascript
const lcx = pos.x / BG_W;                     // 0..1 horizontal
const lcy = 1.0 - pos.y / BG_H;               // 0..1 vertical (Y-flipped for GL)
const lrx = LENS_RX / BG_W;                   // half-width in UV space
const lry = LENS_RY / BG_H;                   // half-height in UV space

gl.uniform2f(su.lensCenter, lcx, lcy);
gl.uniform2f(su.lensRadius, lrx, lry);
```

The shader then uses these to define the unit disc where the refraction is
computed (as described in Layer 1).

---

## Key Takeaways

- The bouncing physics uses **Euler integration**: velocity += gravity, position
  += velocity, check for collisions
- **Fixed-point ×64 scaling** provides sub-pixel precision without floating point
- **Dampened rebounds** reduce the ball's energy each bounce (2/3 first, 9/10
  after), making it settle naturally
- The simulation is **replayed from frame 0** every render call for trivial
  scrubbing — acceptable cost for a single object
- The physics is identical between classic and remastered — only the rendering
  differs

---

**Previous:** [Layer 2 — Displacement Map](02-displacement-map.md) · **Next:** [Layer 4 — GPU Displacement](04-gpu-displacement.md)
