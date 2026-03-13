# Layer 3 — Camera Path

**Source:** `src/effects/coman/effect.remastered.js` lines 303–318 (precompute), 457–484 (replay)
**Concepts:** Cumulative state, sinusoidal rotation velocity, deterministic replay, frame-0 scrubbing

---

## What This Layer Covers

The camera in COMAN is not positioned explicitly. Instead, it **accumulates**
its position frame by frame based on rotation — each frame's position depends
on the sum of all previous frames' displacements. This is elegant but has a
critical consequence for scrubbing.

This layer explains:

- How rotation is computed from a sinusoidal velocity curve
- How the camera position accumulates from the rotation-derived direction
- Why scrubbing to any time `t` requires replaying from frame 0
- How the remastered variant smoothly interpolates rotation between frames
- The rise/fall animation at start and end

---

## Rotation: A Sine-Driven Velocity

The camera does not rotate at a constant speed. Instead, its angular velocity
oscillates as a sine wave, creating smooth acceleration and deceleration:

```javascript
function precomputeAnim() {
  let rot2 = 0, rot = 0;
  for (let f = 0; f < 4444; f++) {
    rot2 += 4;                                          // phase advances
    rot += Math.trunc(256 * Math.sin(rot2 / 1024 * 2 * Math.PI) / 15);
    const r = rot >> 3;
    rsinArr[f] = Math.trunc(256 * Math.sin(r / 1024 * 2 * Math.PI));
    rcosArr[f] = Math.trunc(256 * Math.sin((r + 256) / 1024 * 2 * Math.PI));
  }
}
```

Step by step:

1. **`rot2`** is a phase counter that increases by 4 each frame
2. **`rot`** is the actual rotation angle, which receives a sine-modulated
   increment each frame: `256 × sin(rot2 / 1024 × 2π) / 15`
3. The sine oscillation means `rot` speeds up, slows down, reverses,
   creating the smooth swooping camera motion

```
  rot2 (phase):    0 → 4 → 8 → 12 → ...  (linear ramp)

  sin(rot2/1024 × 2π):
          1 ┤    ╱╲
            │   ╱  ╲
          0 ┤──╱────╲────╱──   ← angular velocity oscillates
            │        ╲  ╱
         -1 ┤         ╲╱

  rot (angle):
            │      ╱‾‾╲
            │     ╱    ╲       ← integral of sine = smooth
            │    ╱      ╲         back-and-forth rotation
            │───╱        ╲───
```

The rotation drives **two** direction vectors — a primary (`rsin`, `rcos`)
and a secondary offset by 177 units (`rsin2`, `rcos2`). The secondary vector
creates the characteristic oblique viewing angle of the terrain.

---

## Position Accumulation

Unlike most 3D scenes where the camera has an explicit (x, y, z) position,
COMAN computes position **cumulatively**. Each frame, the camera moves
forward in its current rotation direction:

```javascript
for (let f = 0; f <= Math.min(frame, 4443); f++) {
  const fi = Math.min(Math.trunc(f / 2), 4443);
  const vrc = rcosArr[fi], vrs = rsinArr[fi];
  const vrc2 = rcos2Arr[fi], vrs2 = rsin2Arr[fi];

  const xa80 = Math.trunc((160 * vrs) / 256) & ~1;
  const ya80 = Math.trunc((160 * vrc2) / 256) & ~1;
  xwav += xa80 * 2;
  ywav += ya80 * 2;
}
```

Each frame contributes a displacement `(xa80, ya80)` derived from the current
rotation sine/cosine. The camera position `(xwav, ywav)` is the running sum
of all these displacements:

```
  Frame 0:  xwav = 0,  ywav = 0
  Frame 1:  xwav += dx₁,  ywav += dy₁
  Frame 2:  xwav += dx₂,  ywav += dy₂
   ...
  Frame N:  xwav = Σ(dx₀..dxₙ),  ywav = Σ(dy₀..dyₙ)
```

This is analogous to **dead reckoning** in navigation: you know your heading
and speed each moment, and you sum up all movements to get your current
position. The path is never stored — it is always recomputed.

### The `f/2` slowdown

The rotation index uses `Math.trunc(f / 2)` — the rotation lookup advances
at half the frame rate. This means the camera rotates more slowly than the
frame rate would suggest, creating a gentle flyover rather than a frantic
spin.

### The `& ~1` and `* 2` pattern

`& ~1` clears the lowest bit (forces even values), and `* 2` doubles the
result. This matches the original assembly code which operated on word-aligned
(2-byte) offsets into the height map arrays.

---

## Why Frame-0 Replay Is Required

Because `xwav` and `ywav` are cumulative sums, you cannot compute the camera
position at frame 500 without knowing frames 0–499. There is no closed-form
formula.

```
  ┌─────────────────────────────────────────────────┐
  │   Want position at t = 14.3s (frame 500)?       │
  │                                                  │
  │   You MUST compute:                              │
  │     frame 0:  xwav += dx₀                       │
  │     frame 1:  xwav += dx₁                       │
  │     frame 2:  xwav += dx₂                       │
  │     ...                                          │
  │     frame 500: xwav += dx₅₀₀  ← now you have   │
  │                                  the position    │
  └─────────────────────────────────────────────────┘
```

Both the classic and remastered variants replay the entire accumulation loop
from frame 0 every render call:

```javascript
render(gl, t, beat, params) {
  const frame = Math.floor(t * FRAME_RATE);

  let xwav = 0, ywav = 0, startrise = 120;
  for (let f = 0; f <= Math.min(frame, 4443); f++) {
    // ... accumulate position ...
  }
  // Now xwav and ywav are correct for this frame
}
```

This makes **scrubbing** (jumping to any point in time) trivial: call
`render(gl, anyTime, ...)` and the loop replays all history. The tradeoff is
CPU cost — replaying ~2500 frames of accumulation each render call. For this
simple loop (a few multiplies per frame), it takes under a millisecond.

### Could this be optimised?

Yes. You could snapshot `xwav`/`ywav` at regular intervals (say every 100
frames) and replay only from the nearest snapshot. This is a common technique
for long simulations. For 4444 frames of simple arithmetic, the replay is fast
enough that optimisation is unnecessary.

---

## Smooth Rotation Interpolation (Remastered)

The classic variant uses stepped rotation — the rotation lookup jumps at
`frame / 2` intervals, creating visible jitter at high display refresh rates.

The remastered variant **linearly interpolates** between adjacent rotation
entries for buttery-smooth camera motion:

```javascript
const rawFi = Math.min(t * FRAME_RATE * 0.5, 4443);
const fi0 = Math.min(Math.floor(rawFi), 4443);
const fi1 = Math.min(fi0 + 1, 4443);
const frac = rawFi - fi0;

const rcos  = rcosArr[fi0] + (rcosArr[fi1]  - rcosArr[fi0])  * frac;
const rsin  = rsinArr[fi0] + (rsinArr[fi1]  - rsinArr[fi0])  * frac;
const rcos2 = rcos2Arr[fi0] + (rcos2Arr[fi1] - rcos2Arr[fi0]) * frac;
const rsin2 = rsin2Arr[fi0] + (rsin2Arr[fi1] - rsin2Arr[fi0]) * frac;
```

Instead of snapping to integer frame indices, the fractional time `rawFi`
provides sub-frame interpolation. The pattern `a + (b - a) * frac` is
standard **linear interpolation (lerp)**:

```
  Classic (stepped):         Remastered (interpolated):
  ──┐  ┌──┐  ┌──            ──╲╱──╲╱──╲╱──
    │  │  │  │                smooth curve
    └──┘  └──┘
  visible stair-stepping     no visible jitter
```

Note that only the **rotation** (used for ray direction) is interpolated.
The **position** (`xwav`, `ywav`) still accumulates at the original frame
rate — it must, because interpolating a cumulative sum would change the path.

---

## Rise and Fall Animation

The terrain does not appear instantly. A `startrise` variable controls a
vertical offset that creates the entry/exit animation:

```javascript
let startrise = 120;     // start with terrain hidden below screen

for (let f = 0; f <= frame; f++) {
  if (f < 400) {
    if (startrise > 0) startrise--;     // rise: decrease offset by 1/frame
  } else if (f >= scrollDownFrame) {
    if (startrise < 160) startrise++;   // fall: increase offset by 1/frame
  }
}
```

```
  Frame 0:    startrise = 120  → terrain mostly hidden
  Frame 120:  startrise = 0    → terrain fully visible
  Frame 400:  startrise = 0    → terrain stays visible
  ...
  Near end:   startrise rising → terrain scrolls back down
```

The value `startrise + 22` is passed to the shader as `uStartRise`, which
sets the top row boundary for the visible terrain column. Higher values push
the terrain downward off-screen.

---

## Data Flow: CPU to GPU

The camera path is computed in JavaScript (CPU), and results are passed to
the fragment shader as **uniforms**:

```
  JavaScript (per frame):              GLSL uniforms:
  ┌──────────────────────┐            ┌──────────────────┐
  │ xwav (accumulated)   │ ────────→  │ uXWav            │
  │ ywav (accumulated)   │ ────────→  │ uYWav            │
  │ rcos  (interpolated) │ ────────→  │ uRCos            │
  │ rsin  (interpolated) │ ────────→  │ uRSin            │
  │ rcos2 (interpolated) │ ────────→  │ uRCos2           │
  │ rsin2 (interpolated) │ ────────→  │ uRSin2           │
  │ startrise            │ ────────→  │ uStartRise       │
  └──────────────────────┘            └──────────────────┘
```

The camera path **cannot** be moved to the GPU because it is a serial
cumulative computation — each frame depends on all previous frames. The GPU
excels at parallel work, not sequential accumulation. This is a natural
CPU/GPU work split: the CPU handles the inherently sequential camera path,
the GPU handles the massively parallel terrain rendering.

---

## Key Takeaways

- **Sinusoidal rotation velocity** creates smooth, natural camera swoops
- **Cumulative position accumulation** means the path is a running sum of
  displacements — no closed-form formula exists
- **Frame-0 replay** is required for scrubbing: every render call replays
  the full accumulation loop from the beginning
- The remastered variant **interpolates rotation** between frames for smooth
  camera motion at any display refresh rate
- **Rise/fall animation** at the start and end transitions the terrain in
  and out gracefully
- The camera path stays on the **CPU** because it is inherently sequential

---

**Previous:** [Layer 2 — Column Raymarching](02-column-raymarching.md)
**Next:** [Layer 4 — GPU VoxelSpace](04-gpu-voxelspace.md)
