# Second Reality Web Demo Engine — Project Brief

> **Handoff Document** — Full context for continuing development with a fresh model instance.
> Begin by reading this document in full, then proceed to Phase 1a implementation.

-----

## Project Vision

Build a **web-based clone of Second Reality** (Future Crew, 1993 — winner of Assembly'93) that faithfully reproduces its effects at full modern fidelity using WebGL2 shaders. The project has two equally important components:

1. **The Demo Runtime** — a precise, music-synced orchestrator that runs self-contained effect programs in sequence, like a virtual machine for demo effects.
1. **The Editor UI** — a video-editor-style tool for sequencing effects on a timeline, authoring beat maps, and scrubbing through the demo in real time.

The aesthetic target is the **Amiga OCS/ECS demoscene era** — 320x256 PAL resolution, 32-color palette, copper gradient effects, blitter objects, MOD music. Modern WebGL shaders are used to achieve these effects at full fidelity rather than attempting CPU-based simulation.

-----

## Why the Web Platform

- `AudioContext.currentTime` is **sample-accurate** and hardware-tied — it becomes the single master clock for the entire demo, enabling Second Reality-level sync precision.
- **Fragment shaders** make the hardest 1993 effects (voxel landscape, plasma, tunnel) trivially simple — what required hand-optimized x86 assembly now runs in ~20 lines of GLSL at 4K.
- **ES Modules** map perfectly to the "each effect is an isolated program" architecture.
- No build tools, no framework — vanilla JS and raw WebGL preserves the demo spirit and keeps every system transparent.

-----

## Technical Stack

|Layer         |Technology                                      |
|--------------|------------------------------------------------|
|Rendering     |WebGL2 (raw, no Three.js)                       |
|Audio playback|libxmp compiled to WASM → Web Audio AudioWorklet|
|Master clock  |`AudioContext.currentTime`                      |
|Effect modules|ES Modules (one file per effect)                |
|Beat/sync data|Pre-authored JSON beat map                      |
|UI            |Vanilla JS + Canvas-rendered timeline           |
|Post-process  |Framebuffer chain, full-screen GLSL pass        |
|Export        |`MediaRecorder` on the WebGL canvas → WebM      |

**No frameworks. No bundlers required for development. Single `index.html` entry point.**

-----

## Core Architectural Principle

Each effect is a **self-contained ES module** with a clean three-method interface:

```javascript
// effects/plasma/effect.js
export default {
  label: 'plasma',

  init(gl) {
    // Compile shaders, create buffers, load textures
    // Called once when the effect is pre-initialized
    this.program = createProgram(gl, vertSrc, fragSrc);
  },

  render(gl, t, beat) {
    // t    = seconds elapsed since this clip's start (from AudioContext.currentTime)
    // beat = normalized 0.0–1.0 position within the current bar
    gl.useProgram(this.program);
    gl.uniform1f(this.uTime, t);
    gl.uniform1f(this.uBeat, beat);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  },

  destroy(gl) {
    // Clean up — delete programs, buffers, textures
  }
}
```

The orchestrator calls `init()` slightly *before* a clip's start time (pre-warming) so there is zero hitch on transitions.

### Effect Fidelity Model

Each effect has two variants:

- **Classic** (`effect.js`) — faithful 1:1 reproduction of the original algorithm at 320×256
- **Remastered** (`effect.remastered.js`) — optional enhanced version with 4K support, better lighting, shading, modern techniques

Classic is always implemented first. The registry falls back to classic if no remastered variant exists.

### Remastered Variant Guidelines

**All remastered effects must be fully shader-based.** No CPU-side pixel manipulation (`putImageData`, `texSubImage2D` per frame, indexed framebuffers, etc.). Everything that touches the screen each frame must run in GLSL. Static asset decoding at init time is acceptable, but per-frame rendering must be GPU-only.

Several classic variants intentionally use software renderers to faithfully reproduce the original algorithms (glenzVectors, glenzTransition, tunneli, technoCircles, beglogo, pam, u2a). The remastered variants for these effects are where we break from the original approach and go fully GPU.

**3D-heavy effects require design discussion before implementation.** Effects involving polygon rasterization, 3D transformations, or scene graphs (glenzVectors, u2a, u2e, plzCube, dots) should be discussed to determine whether they need a shared mini 3D engine (vertex buffer pipeline, projection matrices, depth sorting) or can be handled with raymarching / SDF techniques in a single fragment shader.

-----

## Project Data Format

The entire demo is described by a single JSON project file:

```json
{
  "bpm": 135,
  "audioFile": "secondreality.mod",
  "clips": [
    { "id": "c1", "effect": "copperBars",     "start": 0.000,  "end": 12.440, "params": {} },
    { "id": "c2", "effect": "starfield",       "start": 12.440, "end": 24.800, "params": {} },
    { "id": "c3", "effect": "plasma",          "start": 24.800, "end": 41.200, "params": { "speed": 1.2, "palette": "amiga32" } },
    { "id": "c4", "effect": "rotozoom",        "start": 41.200, "end": 52.000, "params": {} },
    { "id": "c5", "effect": "fire",            "start": 52.000, "end": 61.600, "params": {} },
    { "id": "c6", "effect": "tunnel",          "start": 61.600, "end": 72.000, "params": {} },
    { "id": "c7", "effect": "vectorBalls",     "start": 72.000, "end": 88.000, "params": {} },
    { "id": "c8", "effect": "wireframe3d",     "start": 88.000, "end": 102.400,"params": {} },
    { "id": "c9", "effect": "voxelLandscape",  "start": 102.400,"end": 128.000,"params": {} },
    { "id":"c10", "effect": "textured3d",      "start": 128.000,"end": 152.000,"params": {} }
  ],
  "transitions": [
    { "at": 12.440, "type": "hardCut" },
    { "at": 24.800, "type": "fadeWhite", "duration": 0.3 },
    { "at": 41.200, "type": "paletteWipe", "duration": 0.5 }
  ],
  "cues": {
    "drop":    24.800,
    "buildup": 62.400,
    "finale":  128.000
  },
  "beatMap": {
    "bpm": 135,
    "beats": [0.000, 0.444, 0.888, 1.333, 1.777],
    "bars":  [0.000, 1.777, 3.555, 5.333],
    "overrides": {}
  }
}
```

-----

## Repository Structure

```
second-reality-augmented/
│
├── .cursor/rules/                ← AI coding convention rules
│
├── docs/                         ← Technical design documents
│   ├── PROJECT_BRIEF.md
│   └── TRACKER.md
│
├── src/
│   ├── editor/                   ← ENTRY POINT 1: React + Vite creative tool
│   │   ├── index.html
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── store/
│   │   │   └── editorStore.js
│   │   ├── ui/
│   │   │   ├── Toolbar.jsx
│   │   │   ├── Preview.jsx
│   │   │   ├── Timeline.jsx
│   │   │   ├── EffectLibrary.jsx
│   │   │   └── ClipProperties.jsx
│   │   ├── vite.config.js
│   │   └── package.json
│   │
│   ├── player/                   ← ENTRY POINT 2: Vanilla JS runtime
│   │   ├── index.html
│   │   └── player.js
│   │
│   ├── core/                     ← SHARED: Runtime machinery
│   │   ├── orchestrator.js
│   │   ├── clock.js
│   │   ├── beatmap.js
│   │   ├── modplayer.js
│   │   ├── project.js
│   │   └── webgl.js
│   │
│   ├── effects/                  ← SHARED: One subfolder per effect
│   │   ├── index.js              # Effect registry
│   │   └── <name>/
│   │       ├── effect.js         # Classic (1:1 faithful)
│   │       └── effect.remastered.js  # Remastered (optional)
│   │
│   └── __tests__/                ← Unit tests (Vitest)
│
├── assets/
│   ├── project.json
│   ├── MUSIC0.S3M
│   ├── MUSIC1.S3M
│   └── textures/
│
├── tools/
│   ├── generate-project.js
│   └── export.js
│
└── lib/
    └── libxmp.wasm
```

-----

## Editor Technology Stack

|Layer           |Technology           |Rationale                                                    |
|----------------|---------------------|-------------------------------------------------------------|
|Framework       |**React 18**         |Complex shared state across many panels                      |
|Build tool      |**Vite**             |Instant HMR, ES-module native                                |
|Styling         |**Tailwind CSS**     |Dark theme, FL Studio aesthetic                              |
|Component lib   |**shadcn/ui**        |Headless unstyled components                                 |
|State           |**Zustand**          |Lightweight global store                                     |
|Canvas rendering|**Vanilla canvas 2D**|High-frequency drawing inside React-managed lifecycle        |

-----

## Source Code References

### Tier 1 — Original Source Code
- Primary: `https://github.com/mtuomi/SecondReality`
- Annotated fork: `https://github.com/fabiensanglard/SecondReality`

### Tier 2 — Fabien Sanglard's Code Review
- Part 1: `https://fabiensanglard.net/second_reality/`
- Part 2: `https://fabiensanglard.net/second_reality_engine.php`
- Part 3: `https://fabiensanglard.net/second_reality_dis.php`
- Part 4: `https://fabiensanglard.net/second_reality_dev_Vs_Prod.php`
- Part 5: `https://fabiensanglard.net/second_reality_parts.php`

### Tier 3 — Complete JavaScript Port
- Repo: `https://github.com/covalichou/second-reality-js`
- Live: `https://covalichou.github.io/second-reality-js/`

-----

## Per-Effect Source Folder Mapping

|Our Effect Module  |Original Folder|
|-------------------|---------------|
|`copperBars`       |`BEG/`         |
|`starfield`        |`DDSTARS/`     |
|`scrolltext`       |`START/`       |
|`plasma`           |`PAM/`         |
|`rotozoom`         |`PLZPART/`     |
|`fire`             |`TECHNO/`      |
|`tunnel`           |`PANIC/`       |
|`glenzVectors`     |`GLENZ/`       |
|`dots`             |`DOTS/`        |
|`voxelLandscape`   |`FOREST/`      |
|`creature`         |`COMAN/`       |
|`grid`             |`GRID/`        |
|`lens`             |`LENS/`        |
|`jpLogo`           |`JPLOGO/`      |
|`credits`          |`CREDITS/`     |
|`endScroll`        |`ENDSCRL/`     |

-----

## Second Reality Reference

**Original:** Second Reality by Future Crew, Assembly 1993 party winner.
**Platform:** DOS, 486 CPU, Mode 13h (320x200, 256 colors)
**Music:** Skaven (Peter Hajba) — MOD/S3M format, ~135 BPM

The demo's defining characteristic was **perfect music synchronization** — every visual event was choreographed to an exact beat.
