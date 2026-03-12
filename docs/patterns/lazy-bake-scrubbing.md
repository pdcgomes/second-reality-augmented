# Pattern: Lazy-Bake Scrubbing

## Problem

Some effects are driven by a **delta-compressed animation stream** — each frame
reads incremental updates from a binary buffer and mutates internal state. This
is fast and memory-efficient for forward playback, but fundamentally
incompatible with backward seeking because you can't reverse the deltas without
replaying from the start.

During normal (player) playback, time only moves forward, so this isn't an
issue. But in the **editor**, the user can scrub the timeline freely in any
direction, producing arbitrary time jumps.

## Solution: Dual-Mode Engine

Expose **two APIs** from the engine and let the effect switch between them
automatically at runtime:

| Mode | API | Used when | Cost |
|---|---|---|---|
| **Streaming** | `stepAnimation()` | Forward playback (player & editor) | O(1) per frame, zero memory overhead |
| **Snapshot** | `seekFrame(n)` | After first backward seek (editor scrubbing) | O(1) per seek, ~N × stateSize memory |

The key insight: **baking is lazy**. The effect starts in streaming mode. The
first time it detects a backward time jump (`targetFrame < frameCount`), the
engine bakes all frames into snapshots. From that point on, every seek — forward
or backward — uses the snapshot array.

## When to Use

This pattern is viable when:

1. **The animation is finite and bounded** — you can enumerate all frames at
   init or on first scrub. Open-ended / procedural effects don't apply.
2. **Per-frame state is small** — a snapshot is just the mutable state the
   engine carries between frames (transforms, visibility flags, FOV, etc.), not
   the full framebuffer. Typically a few hundred bytes per frame.
3. **Total frame count is manageable** — the U2A effect has ~910 frames at 70
   fps over 13 seconds. Even at 1 KB/snapshot that's under 1 MB.
4. **Stepping is fast** — baking replays the full animation stream from scratch,
   so each step needs to be cheap (just reading bytes and updating matrices).

Effects that are pure functions of time (shader-based, no accumulated state)
don't need this pattern — they already handle arbitrary `t` values.

## Implementation Guide

### 1. Engine: Add Snapshot Machinery

```javascript
let snapshots = null;

function snapshot() {
  // Capture all mutable state into a plain object.
  // Clone arrays — don't store references.
  return {
    fov,
    on: Uint8Array.from(visibilityFlags),
    transforms: transforms.map(t => Float64Array.from(t)),
  };
}

function restoreSnapshot(s) {
  setFov(s.fov);
  visibilityFlags.set(s.on);
  transforms.forEach((t, i) => t.set(s.transforms[i]));
}

function bakeAnimation() {
  reset();                         // rewind to frame 0
  snapshots = [snapshot()];        // frame 0 state
  while (!ended) {
    stepAnimation();               // advance one frame
    snapshots.push(snapshot());    // capture state
  }
}

function seekFrame(n) {
  if (!snapshots) bakeAnimation(); // lazy bake on first call
  const idx = Math.max(0, Math.min(n, snapshots.length - 1));
  restoreSnapshot(snapshots[idx]);
}
```

### 2. Engine: Expose Both APIs

```javascript
return {
  // Real-time (forward-only)
  stepAnimation,
  reset,

  // Lazy-bake (random access)
  bakeAnimation,
  seekFrame,

  // Introspection
  get baked() { return !!snapshots; },
  get ended() { return animEnd; },
  get totalFrames() { return snapshots ? snapshots.length : 0; },

  // Rendering (mode-independent)
  renderFrame,
  get framebuffer() { return fb; },
};
```

### 3. Effect: Auto-Switch on Backward Seek

```javascript
let frameCount = 0;

render(gl, t, beat, params) {
  const targetFrame = Math.floor(t * FRAME_RATE);

  if (targetFrame < frameCount) {
    // Backward jump detected — switch to snapshot mode.
    // seekFrame() lazily bakes if not already done.
    engine.seekFrame(targetFrame);
  } else if (engine.baked) {
    // Already in snapshot mode — use it for forward seeks too.
    engine.seekFrame(targetFrame);
  } else {
    // Normal forward playback — stream incrementally.
    const steps = targetFrame - frameCount;
    for (let i = 0; i < steps && !engine.ended; i++) {
      engine.stepAnimation();
    }
  }
  frameCount = targetFrame;

  // ... render from engine state as usual ...
}
```

## Candidate Effects

Effects in the Second Reality sequence that may benefit from this pattern:

| Effect | Why |
|---|---|
| **U2A** (Part 2) | Delta-compressed 3D animation stream — ✅ already uses this pattern |
| **U2E** (Part 22) | Same U2 engine, longer city flyover animation |
| **PAM** (Part 3) | Pre-rendered frame sequence — simpler case, but same principle applies if frames are decoded incrementally |

## Trade-offs

| | Streaming | Snapshot |
|---|---|---|
| Init time | Instant | Instant (bake is lazy) |
| Forward playback | O(1) per frame | O(1) per frame |
| Backward seek | Impossible without replay | O(1) |
| Memory | Zero overhead | N × snapshot size |
| First backward seek | — | One-time bake cost (replay all N frames) |

The lazy approach means the player never pays the bake cost, and the editor
only pays it once — on the first scrub backward.
