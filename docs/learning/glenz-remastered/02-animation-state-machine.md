# Layer 2 — Animation State Machine

**Source:** `src/effects/glenzVectors/animation.js` (148 lines)
**Concepts:** deterministic replay, Euler integration, spring-damper oscillation, sinusoidal orbits

---

## What This Layer Covers

The Glenz effect's visual complexity — bouncing, squishing, orbiting, fading —
all comes from a compact state machine replayed from frame 0 on every render
call. This module is pure maths: no GPU, no shaders, no WebGL. Both the
classic and remastered variants import from here, guaranteeing frame-perfect
choreography sync.

---

## Deterministic Replay

The most important design decision: **the animation replays from frame 0 every
single call.**

```javascript
const s = createState();
initState(s, checkerPal8);
for (let f = 0; f <= intFrame; f++) stepFrame(s, f);
```

Why? Because it makes scrubbing in the editor trivial. Jump to any point in
time, replay from zero, and you get the exact right state. No need to store or
restore history.

The tradeoff is CPU cost — replaying up to 2200 frames of state updates. But
with only ~20 arithmetic operations per frame, the entire replay completes in
well under 1 ms. For 70 fps × 30 seconds = 2100 frames, this is negligible.

---

## The State Object

`createState()` returns the full animation state:

```javascript
export function createState() {
  return {
    ypos: -9000, yposa: 0,          // vertical position and velocity
    boingm: 6, boingd: 7,           // bounce damping ratio (increases over time)
    jello: 0, jelloa: 0,            // jelly deformation and its velocity
    g1sx: 120, g1sy: 120, g1sz: 120, // Glenz1 scale (x, y, z)
    g2s: 0,                          // Glenz2 uniform scale
    g1tx: 0, g1ty: 0, g1tz: 0,      // Glenz1 translation offset
    g2tx: 0, g2ty: 0, g2tz: 0,      // Glenz2 translation offset
    bgCleared: false,                // has the checkerboard been faded out?
    // ... palette state for classic variant
  };
}
```

All fields are simple numbers. The state machine has no branches that depend
on floating-point accumulation, so replay is perfectly deterministic across
platforms.

---

## Phase 1: The Bounce (Frames 0–799)

```
  Frame:    0          200         400         600    709  799
            |           |           |           |      |    |
  ypos: -9000     ~~~~~~bounce~~~~~~bounce~~~~~  → -2800
                  ↑           ↑           ↑
              first impact  second      third
              (big jelly)  (smaller)  (smaller)
```

### Gravity and floor collision

```javascript
if (frame < 710) {
  s.yposa += 31;              // constant downward acceleration
  s.ypos += s.yposa / 40;    // integrate velocity → position
  if (s.ypos > -300) {       // hit the floor at y = -300
    s.ypos -= s.yposa / 40;  // undo the penetration
    s.yposa = -s.yposa * s.boingm / s.boingd;  // reverse & dampen
    s.boingm += 2;            // increase numerator → less bounce each time
    s.boingd++;               // increase denominator
  }
}
```

This is **Euler integration** with a collision response:

1. `velocity += acceleration` — gravity pulls down (positive yposa = downward)
2. `position += velocity / 40` — the `/40` scales velocity to world units
3. If position passes the floor: undo the move, flip velocity, and reduce it

The **damping ratio** `boingm / boingd` starts at 6/7 ≈ 0.857 and increases
each bounce (8/8, 10/9, 12/10...), meaning each successive bounce retains less
energy. The object settles after a few bounces.

### Jelly deformation (spring-damper)

On each bounce impact, the deformation value is set proportional to impact
velocity:

```javascript
if (s.ypos > -900 && s.yposa > 0) {
  s.jello = (s.ypos + 900) * 5 / 3;   // initial displacement
  s.jelloa = 0;                         // reset velocity
}
```

Then every frame, the jello oscillates as a **damped spring**:

```javascript
s.g1sy = s.g1sx = 120 + s.jello / 30;   // X/Y stretch
s.g1sz = 120 - s.jello / 30;             // Z squeeze (opposite)

const prev = s.jello;
s.jello += s.jelloa;                      // integrate
// Zero-crossing damping: reduce amplitude at each oscillation peak
if ((prev < 0 && s.jello > 0) || (prev > 0 && s.jello < 0))
  s.jelloa = s.jelloa * 5 / 6;
s.jelloa -= s.jello / 20;                // spring restoring force
```

The jelly system is a classic **spring-damper oscillator**:

- **Spring force** (`-jello / 20`): pulls the deformation back toward zero
- **Damping** (`× 5/6` at each zero crossing): reduces amplitude over time
- **Output**: X/Y scale increases while Z scale decreases (squash-and-stretch)

```
  Jelly deformation over time after a bounce:

  jello
    +  ╭─╮
    |  │  │     ╭╮
    | ─┤  ├─────┤├─────── 0
    |  │  │  ╭╮ ╰╯ ╭╮
    -  ╰──╯  ╰╯    ╰╯     → time

  The oscillation decays at each zero crossing (5/6 damping).
  X/Y scale = 120 + jello/30  (stretches horizontally on positive)
  Z  scale = 120 - jello/30  (squeezes along depth on positive)
```

After frame 710, the bounce phase ends and `ypos` glides toward -2800 (center
of the screen) at a constant rate.

---

## Phase 2: Glenz2 Scale-In (Frames 800–890)

```javascript
if (frame > 800 && frame <= 890) s.g2s += 2;   // grow from 0 to 180
```

Glenz2 appears after the checkerboard fades away. It scales linearly from 0 to
180 over 90 frames (about 1.3 seconds). Simple and effective — the gradual
growth makes it look like it is "inflating" into existence.

---

## Phase 3: Dual-Object Orbits (Frames 900–1800)

Both objects orbit with independent sinusoidal translation paths:

```javascript
// Glenz1 orbit
if (frame > 900) {
  const a = frame - 900;
  let b = Math.min(a, 50);    // ramp up over 50 frames
  s.g1tx = Math.sin(a * 3 / 1024 * 2 * Math.PI) * 255 * b / 10;
  s.g1ty = Math.sin(a * 5 / 1024 * 2 * Math.PI) * 255 * b / 10;
  s.g1tz = (Math.sin(a * 4 / 1024 * 2 * Math.PI) * 255 / 2 + 128) * b / 16;
}
```

Each axis uses a sine wave at a different frequency (3, 5, and 4 cycles per
1024 frames). Because the frequencies are coprime, the combined path never
exactly repeats — the object traces a **Lissajous-like figure** in 3D space.

The `b = min(a, 50)` ramp prevents a jarring pop: the orbit amplitude grows
smoothly from zero over 50 frames.

**Glenz2** follows a similar pattern with different frequencies (6, 7, 8) and
the opposite sign, creating a counter-orbiting motion:

```javascript
// Glenz2 orbit (note the negation)
s.g2tx = -Math.sin(a * 6 / 1024 * 2 * Math.PI) * 255;
s.g2ty = -Math.sin(a * 7 / 1024 * 2 * Math.PI) * 255;
s.g2tz =  Math.sin(a * 8 / 1024 * 2 * Math.PI) * 255 + 128;
```

The result is two crystalline objects weaving past each other in a visual
dance, each on its own unique 3D path.

---

## Phase 4: Exit and Fade (Frames 1800–2133)

### Glenz1 exit (frames 1800+)

```javascript
if (frame > 1800) {
  let b = 1800 - frame;           // starts at 0, goes negative
  if (b < -99) b = -99;           // cap at -99
  s.g1ty -= b * b / 2;           // quadratic acceleration upward
}
```

The `b * b / 2` term creates **quadratic acceleration** — Glenz1 rockets
upward with increasing speed, as if launched by a spring. The cap at -99
limits the acceleration so it does not disappear too quickly.

After frame 2009, both objects begin shrinking:

```javascript
if (frame > 2009) {
  if (s.g1sx > 0) s.g1sx -= 1;   // Glenz1 shrinks by 1/frame
  if (s.g2s > 0)  s.g2s  -= 1;   // Glenz2 shrinks by 1/frame
}
```

### Final fade (frames 2069–2133)

The renderer applies a global fade-to-black:

```javascript
let fade = 1.0;
if (intFrame > 2069) fade = clamp((2069 + 64 - intFrame) / 64, 0, 1);
```

This linearly fades from 1.0 to 0.0 over 64 frames (~0.9 seconds), ending
the effect in darkness before the next demo section begins.

---

## Rotation

Rotation is not part of the state machine — it is computed directly from the
frame counter in the render function:

```javascript
const rx = (32 * floatFrame) % (3 * 3600);
const ry = (7 * floatFrame) % (3 * 3600);
```

Glenz1 rotates at 32× and 7× the frame rate around X and Y axes (in 1/10
degree units). Glenz2 rotates at 1/3 the speed in the opposite direction:

```javascript
const rot2X = (3600 - rx / 3) % (3 * 3600);
const rot2Y = (3600 - ry / 3) % (3 * 3600);
```

The `computeRotationMatrix()` function converts these angles to a 3×3 rotation
matrix using the standard Y×X×Z Euler angle decomposition:

```javascript
export function computeRotationMatrix(roty, rotx, rotz) {
  const rxs = Math.sin(rotx * DEG), rxc = Math.cos(rotx * DEG);
  const rys = Math.sin(roty * DEG), ryc = Math.cos(roty * DEG);
  // ... combined rotation matrix entries
}
```

Where `DEG = π / 1800` converts the original's 1/10-degree units to radians.

---

## Summary: Animation Timeline

| Frames | Duration | What Happens |
|--------|----------|--------------|
| 0–709 | 10.1 s | Glenz1 bounces on checkerboard, jelly deformation on each impact |
| 700–765 | 0.9 s | Checkerboard palette fades to black |
| 710–799 | 1.3 s | Glenz1 glides to center position (y = -2800) |
| 800–890 | 1.3 s | Glenz2 scales in from 0 to 180 |
| 900–1800 | 12.9 s | Both objects orbit with sinusoidal translation |
| 1800+ | 5.2 s | Glenz1 exits upward with quadratic acceleration |
| 2009+ | 2.2 s | Both objects shrink (scale decreases by 1/frame) |
| 2069–2133 | 0.9 s | Final fade to black |

---

**Next:** [Layer 3 — Vertex Pipeline](03-vertex-pipeline.md)
