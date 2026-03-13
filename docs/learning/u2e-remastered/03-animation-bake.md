# Layer 3 — Animation Bake

**Source:** `src/effects/u2e/u2engine.js` (lines 208–265, 718–772)
**Concepts:** Bytecode interpreters, delta encoding, variable-length fields, animation baking, editor scrubbing

---

## What This Layer Covers

The U2E city flyover is not procedurally generated — every camera move, every
building appearing, every FOV change is **pre-baked** into a binary animation
stream. This stream was authored by PSI (Future Crew) using custom tools in
1993 and encoded as compact bytecode.

This layer explains:

- How the animation bytecode format encodes per-frame commands
- How delta-encoded transforms accumulate to produce smooth motion
- How the engine bakes the entire animation for instant random access
- Why scrubbing in the editor requires special handling for cumulative state

---

## The Animation Stream

The animation bytecode (`U2E_0AB_base64`) is a sequential stream of
variable-length commands. A global pointer (`anim_pointer`) advances through
the stream, and each call to `stepOneAnimationFrame()` processes commands
until a frame boundary is reached.

```
┌─────────────────────────────────────────────────────────┐
│  0AB Animation Bytecode Stream                          │
│                                                         │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐     ┌──────────┐ │
│  │cmd 1 │→│cmd 2 │→│cmd 3 │→│ 0xFF │ ... │ 0xFF 0xFF│ │
│  │obj+Δ │ │obj+Δ │ │fov=n │ │(end  │     │(animation│ │
│  │      │ │      │ │      │ │frame)│     │  end)    │ │
│  └──────┘ └──────┘ └──────┘ └──────┘     └──────────┘ │
└─────────────────────────────────────────────────────────┘
```

### Frame Boundaries

A special marker `0xFF` followed by a value `≤ 0x7F` signals the end of the
current frame (and optionally sets a new FOV). The marker `0xFF 0xFF` signals
the end of the entire animation.

```javascript
if (a === 0xff) {
  a = SceneAnimData[anim_pointer]; anim_pointer++;
  if (a <= 0x7f) {
    fov = a / 256 * 360;   // new field of view
    return;                  // frame complete
  } else if (a === 0xff) {
    animation_end = true;    // animation finished
    return;
  }
}
```

---

## Command Format

Each non-marker byte encodes an object number and an action in a single byte:

```
Bits 7-6: Action
  0x80 = turn object ON
  0x40 = turn object OFF
  0x00 = no visibility change

Bits 3-0: Object number (low 4 bits)

Special: if bits 7-6 = 0xC0, the byte is an "extended object number"
  prefix — the low 6 bits become the high bits of the object number,
  and the next byte provides the low 4 bits + action.
```

This compact encoding means most commands fit in just 1–2 bytes. The
extended prefix handles object numbers above 15 (the U2E scene has 42 objects).

```javascript
if ((a & 0xc0) === 0xc0) {
  onum = (a & 0x3f) << 4;            // high bits
  a = SceneAnimData[anim_pointer];    // next byte
  anim_pointer++;
}
onum = (onum & 0xff0) | (a & 0xf);   // combine high + low
```

---

## Delta-Encoded Transforms

After the object number and visibility action, the command optionally encodes
**position and rotation deltas** — changes to the object's transform matrix.

### Position Flags

A variable-length "pflag" field describes which matrix elements are changing:

```javascript
switch (a & 0x30) {
  case 0x00: pflag = 0;         break; // no transform update
  case 0x10: pflag = 1 byte;    break;
  case 0x20: pflag = 2 bytes;   break;
  case 0x30: pflag = 3 bytes;   break;
}
```

The pflag bits control which of the 12 matrix elements receive a delta:

```
pflag bits 0-1:   translation X size (0=skip, 1=s8, 2=s16, 3=s32)
pflag bits 2-3:   translation Y size
pflag bits 4-5:   translation Z size
pflag bit 6:      rotation precision flag (0=s8, 1=s16 per element)
pflag bits 7-15:  which of the 9 rotation elements are present
```

### Variable-Length Values

The `lsget()` function reads a value whose size depends on a 2-bit code:

```javascript
function lsget(f) {
  switch (f & 3) {
    case 0: return 0;                    // no data (zero delta)
    case 1: return s8(...);  ptr += 1;   // 8-bit signed
    case 2: return s16(...); ptr += 2;   // 16-bit signed
    case 3: return s32(...); ptr += 4;   // 32-bit signed
  }
}
```

This is a form of **entropy coding** — small deltas (common for smooth motion)
use fewer bytes. A building that is not moving costs 0 bytes for translation. A
camera moving smoothly might use 1-byte deltas. A sudden jump uses 4-byte
deltas.

### Applying Deltas

The deltas are **accumulated** onto the object's existing matrix:

```javascript
const factor = onum === 0 ? 1 : 128;

r[9]  += lsget(pflag)      / factor;   // translation X
r[10] += lsget(pflag >> 2) / factor;   // translation Y
r[11] += lsget(pflag >> 4) / factor;   // translation Z

// Rotation deltas (if pflag bits 7..15 set)
for (let b = 0; b < 9; b++)
  if (pflag & (0x80 << b))
    r[b] += lsget(precision) / 128;
```

Notice the **camera exception**: object 0 (the camera) uses `factor = 1`
while all other objects use `factor = 128`. The camera needs higher-precision
translation because it moves through the entire scene, while building
positions are relatively fixed.

---

## Why Deltas Are Cumulative

Each frame's commands **add to** the previous state rather than replacing it.
This means:

```
Frame 0:  camera.tx = 0
Frame 1:  camera.tx += 5     → tx = 5
Frame 2:  camera.tx += 5     → tx = 10
Frame 3:  camera.tx += 5     → tx = 15
  ...
Frame N:  camera.tx = sum of all deltas from frame 0 to N
```

This cumulative design has two consequences:

1. **Compact encoding**: Smooth motion only needs to store the velocity, not
   the full position each frame. The original animation file is remarkably
   small for 1000+ frames of 42-object choreography.

2. **No random access**: You cannot jump to frame 500 without replaying
   frames 0–499 first, because the state at frame 500 depends on every
   preceding delta.

---

## Animation Baking

The remastered variant solves the random-access problem by **baking** the
entire animation into a snapshot array:

```javascript
function bakeAnimation() {
  resetAnimationState();
  snapshots = [snapshot()];          // frame 0
  while (!animation_end) {
    stepOneAnimationFrame();
    snapshots.push(snapshot());      // frame 1, 2, 3, ...
  }
}
```

Each snapshot captures the complete engine state:

```javascript
function snapshot() {
  return {
    anim_pointer,      // bytecode position
    animation_end,     // has the animation ended?
    fov,               // current field of view
    on: Uint8Array,    // visibility for each object
    r0: Float64Array[], // transform matrix for each object
  };
}
```

After baking, `seekFrame(n)` is instant — just restore the snapshot:

```javascript
function seekFrame(n) {
  if (!snapshots) bakeAnimation();   // lazy: bake on first seek
  const idx = clamp(n, 0, snapshots.length - 1);
  restoreSnapshot(snapshots[idx]);
}
```

### Memory Cost

Each snapshot stores: 1 int + 1 bool + 1 float + 43 bytes (visibility) +
43 × 12 × 8 bytes (transforms) ≈ **4.2 KB**. For ~1500 frames, the total
bake is roughly **6.3 MB** — acceptable for a desktop browser.

---

## Classic vs Remastered Scrubbing

The two variants use different strategies for non-sequential playback:

```
Classic (effect.js):
  ┌────────────────────────────────────────────┐
  │ Cache a snapshot every 100 frames          │
  │ To reach frame 350:                        │
  │   restore snapshot at frame 300            │
  │   replay frames 301..350 sequentially      │
  │ Cache capped at 50 entries (~200 KB)       │
  └────────────────────────────────────────────┘

Remastered (effect.remastered.js):
  ┌────────────────────────────────────────────┐
  │ Bake all frames on first seek              │
  │ To reach frame 350:                        │
  │   restore snapshots[350] directly          │
  │ Cost: ~6.3 MB one-time                     │
  └────────────────────────────────────────────┘
```

The classic approach is more memory-efficient but has higher latency when
scrubbing (up to 99 frames of replay). The remastered approach trades memory
for instant access, which is essential for smooth editor scrubbing.

---

## Animation Timeline

The animation stream produces this approximate sequence:

```
Frame       Event
──────      ─────────────────────────────────
  0         Camera starts at origin, all objects off
  1–50      First buildings appear, camera begins moving
 50–300     City flyover: buildings toggle on/off as camera advances
300–600     Tunnels and roads appear, FOV changes for dramatic effect
600–900     Deep city: trees, more buildings, density increases
900–1100    Spaceship appears (forced to front of draw order)
1100+       Final sequence, spaceship departure
~1500       Animation end marker (0xFF 0xFF)
```

The exact timeline depends on the original artist's authoring. The engine
faithfully replays every command regardless of variant.

---

## Key Insight: Animation as Data, Not Code

The U2E animation is pure data — there is no procedural logic for camera paths
or building choreography. Every movement was hand-authored, encoded into the
bytecode stream, and plays back identically every time. This is the opposite of
modern procedural animation, but it gives the demo director (PSI) frame-perfect
control over the visual narrative.

The remastered variant preserves this philosophy: it never modifies the
animation, only changes how the resulting transforms are rendered. The
choreography is identical in classic and remastered — toggle between them in the
editor and the camera follows the same path.

---

**Previous:** [Layer 2 — The Polygon Engine](02-polygon-engine.md) · **Next:** [Layer 4 — Large Scene Rendering](04-large-scene-rendering.md)
