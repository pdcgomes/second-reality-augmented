# Layer 1 — The Physics Simulation

**Source:** `src/effects/dots/animation.js` (119 lines)
**Concepts:** Euler integration, seeded PRNG, deterministic replay, fixed timestep

---

## What This Layer Covers

Before any graphics, we need positions. Where are the 512 dots? How do they
move? The `animation.js` module is pure maths — no GPU, no shaders, no WebGL.
It simulates 512 particles bouncing around in 3D space.

Both the classic (CPU) and remastered (GPU) variants import this module. They
share the exact same simulation, guaranteeing identical choreography.

---

## The Big Picture

```javascript
export const FRAME_RATE = 70;   // 70 frames per second (VGA Mode 13h refresh rate)
export const MAXDOTS = 512;     // number of particles
```

The simulation runs at a fixed 70 fps — matching the original 1993 VGA demo.
This is independent of display refresh rate. The renderer converts wall-clock
seconds to simulation frames:

```javascript
const targetFrame = Math.floor(t * FRAME_RATE);
// t = 1.0 seconds → frame 70
// t = 5.0 seconds → frame 350
```

---

## Deterministic Replay (No Persistent State)

The most important design decision: **the simulation replays from frame 0
every single call.**

```javascript
export function simulateDots(targetFrame) {
  // Start fresh every time
  const dots = new Array(MAXDOTS);
  for (let i = 0; i < MAXDOTS; i++)
    dots[i] = { x: 0, y: 2560 - 22000, z: 0, yadd: 0 };

  // ... replay all frames from 0 to targetFrame ...

  return { dots, positions, rotSin, rotCos, frame, fade };
}
```

Why? Because it makes scrubbing in the editor trivial. Jump to any point in
time, call `simulateDots(frame)`, and you get the exact right state. No need
to store or restore simulation history.

The tradeoff is CPU cost — replaying 2000+ frames of physics every render call.
For 512 dots this is fine (a few milliseconds). For tens of thousands it would
need optimisation (snapshots, caching).

---

## The Seeded Random Number Generator

The "random scatter" phase needs random positions, but they must be the same
every time. A seeded PRNG solves this:

```javascript
let seed = 12345;
function rand() {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return (seed >> 16) & 0x7fff;
}
```

This is a **Linear Congruential Generator (LCG)** — the same algorithm used by
the C standard library's `rand()`. It produces a deterministic sequence of
pseudo-random numbers from a fixed seed. Because the seed resets to 12345 at
the start of every `simulateDots()` call, the "random" positions are identical
every time.

---

## The Four Spawn Phases

Each frame, one dot (cycling through all 512 in a round-robin) gets repositioned
according to the current phase:

### Phase 1: Spiral Rise (frames 0–499)

```javascript
if (frame < 500) {
  dots[j].x = isin(f * 11) * 40;
  dots[j].y = icos(f * 13) * 10 - dropper;
  dots[j].z = isin(f * 17) * 40;
  dots[j].yadd = 0;
}
```

Dots spawn in a 3D helix pattern. The `isin` and `icos` functions are scaled
sine/cosine that return values in the -255..+255 range:

```javascript
function isin(deg) { return Math.sin(Math.PI * deg / 512) * 255; }
function icos(deg) { return Math.cos(Math.PI * deg / 512) * 255; }
```

Using different multipliers for x (11), y (13), and z (17) creates a spiralling
pattern because the three axes cycle at different rates. Think of it like three
clocks ticking at different speeds — their combined position traces a helix.

The `dropper` variable starts at 22000 (far above the scene) and decreases
over time, so dots gradually descend into view.

### Phase 2: Fountain (frames 500–899)

```javascript
} else if (frame < 900) {
  dots[j].x = icos(f * 15) * 55;
  dots[j].y = dropper;
  dots[j].z = isin(f * 15) * 55;
  dots[j].yadd = -260;
}
```

Dots spawn at the top (`dropper`) with a strong upward velocity (`yadd = -260`,
negative = up). They arc upward, slow down, and fall back under gravity —
creating a fountain effect. The x/z positions trace a circle (`cos` and `sin`
with the same multiplier).

### Phase 3: Expanding Ring (frames 900–1699)

```javascript
} else if (frame < 1700) {
  const a = Math.floor(256 * Math.sin(frame / 1024 * 2 * Math.PI) / 8);
  dots[j].x = icos(f * 66) * a;
  dots[j].y = 8000;
  dots[j].z = isin(f * 66) * a;
  dots[j].yadd = -300;
}
```

The radius `a` oscillates via `sin(frame / 1024 * 2π)` — the ring breathes
in and out over time. Dots are placed on this expanding/contracting ring and
launched upward.

### Phase 4: Random Scatter (frames 1700–2359)

```javascript
} else if (frame < 2360) {
  dots[j].x = (rand() % 0x7fff) - 16384;
  dots[j].y = 8000 - (rand() % 0x7fff) / 2;
  dots[j].z = (rand() % 0x7fff) - 16384;
  dots[j].yadd = 0;
  if (frame > 1900 && !(frame & 31) && grav > 0) grav--;
}
```

Random positions fill the space. After frame 1900, gravity decreases every 32
frames (`!(frame & 31)` is a fast check for "divisible by 32"). This makes dots
float longer before falling, creating an ethereal quality as the scene winds
down.

---

## Gravity and Bouncing

Every frame, every dot experiences gravity:

```javascript
for (let i = 0; i < MAXDOTS; i++) {
  const d = dots[i];

  // ... projection to check if dot is on screen (lines 79-84) ...

  d.yadd += gravity;          // accelerate downward
  let b = d.y + d.yadd;       // new position = old position + velocity

  if (b >= gravitybottom) {   // hit the floor?
    d.yadd = Math.floor((-d.yadd * gravd) / 0x10);  // bounce: flip and dampen
    b += d.yadd;
  }

  d.y = b;
}
```

This is **Euler integration** — the simplest possible physics:

1. `velocity += acceleration` (gravity pulls down)
2. `position += velocity` (move the dot)
3. If `position > floor`: reverse velocity and multiply by a damping factor

The damping factor is `gravd / 16` (where `gravd = 13`), so each bounce
retains 13/16 = 81% of the velocity. Dots bounce lower and lower until they
settle on the floor.

**Why Euler integration?** It is the simplest scheme and was standard in 1993
demos. More accurate methods exist (Verlet, RK4), but for visual bouncing
balls the difference is imperceptible.

---

## Y-Axis Rotation

The entire scene rotates around the vertical (Y) axis:

```javascript
rotcos = icos(rot) * 64;
rotsin = isin(rot) * 64;

rots += 2;
if (frame > 1900) {
  rot += rota / 64;
  rota--;
} else {
  rot = isin(rots);
}
```

- For frames 0–1900: `rot` oscillates as a sine wave (gentle back-and-forth)
- After frame 1900: `rot` accelerates (`rota` decreases, meaning faster spin)
  creating a dramatic whirlwind effect at the end

The `rotsin` and `rotcos` values are pre-multiplied by 64 as a fixed-point
optimisation (more precision without floating point). The renderer uses these
to rotate every dot's x/z coordinates.

---

## Fade Control

The returned `fade` value (0.0 to 1.0) controls overall brightness:

```javascript
let fade = 1.0;
if (targetFrame < 128) {
  fade = targetFrame / 128;            // fade in over ~1.8 seconds
} else if (frame >= 2360 && frame < 2400) {
  fade = 1.0;                          // flash white (handled by palette in classic)
} else if (frame >= 2400) {
  fade = Math.max(0, 1.0 - (frame - 2400) / 32);  // fade out quickly
}
```

---

## Output

`simulateDots` returns everything the renderer needs:

```javascript
return {
  dots,       // array of 512 { x, y, z, yadd } objects
  positions,  // Float32Array(512 * 3) — same data, flat, for GPU upload
  rotSin,     // current rotation sine (pre-scaled by 64)
  rotCos,     // current rotation cosine (pre-scaled by 64)
  frame,      // simulation frame counter (0–2450)
  fade,       // overall brightness (0.0–1.0)
};
```

The `dots` array is used by the classic renderer (which needs per-dot
properties). The `positions` Float32Array is used by the remastered renderer
(which uploads it directly to the GPU).

---

**Next:** [Layer 2 — GPU Instancing](02-instancing.md)
