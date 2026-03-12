# Second Reality Web Demo Engine — Master Tracker

> Single source of truth for project progress. Update checkboxes as work completes.

---

## Phase 0 — Beat Map & Timeline Extraction

- [ ] Clone SecondReality repo (`github.com/mtuomi/SecondReality`)
- [ ] Create `tools/generate-project.js` (S3M tick extraction via libxmp-wasm)
- [ ] Generate `assets/project.json` from MUSIC0.S3M + MUSIC1.S3M
- [ ] Validate extracted timings against original demo playback

## Phase 1 — Orchestrator Core + Editor Shell

### 1a — Monorepo Scaffold
- [x] `.cursor/rules/` — 7 project convention rules
- [x] `docs/PROJECT_BRIEF.md` + `docs/TRACKER.md`
- [x] Editor scaffold: Vite + React 18 + Tailwind + shadcn/ui + Zustand
- [x] Editor dark theme (FL Studio aesthetic)
- [x] Editor 5-panel layout (Toolbar, Preview, Timeline, EffectLibrary, ClipProperties)
- [x] `src/core/webgl.js` — shared WebGL2 helpers
- [x] Editor Preview.jsx — WebGL2 canvas at 320×256, nearest-neighbor upscale
- [x] Player stub — `src/player/index.html` + `player.js`, fullscreen canvas
- [x] Core module stubs: clock, project, orchestrator, beatmap, modplayer
- [x] Placeholder `assets/project.json` with realistic timings
- [x] Effects registry (`src/effects/index.js`) with classic/remastered variant resolution
- [x] Vitest setup + unit tests for core modules

### 1b — Clock
- [x] `core/clock.js` — wraps `AudioContext.currentTime`, play/pause/scrub

### 1c — Project I/O
- [x] `core/project.js` — project.json load/validate
- [ ] `core/project.js` — File System Access API save (editor-specific)

### 1d — Orchestrator
- [x] `core/orchestrator.js` — effect lifecycle, tick loop, cue dispatch, pre-warming

### 1e — MOD Player
- [x] `core/modplayer.js` — webaudio-mod-player (vendored), dual-song S3M playback
- [x] `lib/webaudio-mod-player/` — MIT-licensed S3M engine converted to ES module
- [x] `assets/MUSIC0.S3M` + `assets/MUSIC1.S3M` — original Skaven soundtrack
- [x] `assets/ref/` — original GIF assets from SecondReality repo

### 1f — Timeline
- [x] `editor/ui/Timeline.jsx` — canvas-rendered timeline, playhead scrubbing, clip blocks, beat ticks, zoom

### 1g — Transport
- [x] `editor/ui/Toolbar.jsx` — play/pause/stop, timecode, beat snap, keyboard shortcuts

### 1h — Library & Properties
- [x] `editor/ui/EffectLibrary.jsx` — effect browser (listing)
- [ ] `editor/ui/EffectLibrary.jsx` — drag-to-add clips
- [x] `editor/ui/ClipProperties.jsx` — clip param viewer

### 1i — Transition System
- [x] `core/transitions.js` — transition overlay renderer (fade, flash, CRT shutdown, checkerboard wipe)
- [x] `editor/ui/Preview.jsx` — transition rendering integrated into preview loop
- [ ] Transition editor UI (pick type/duration per clip boundary)

### 1j — Export Pipeline
- [ ] `tools/export.js` — inline all assets into a single self-contained HTML file

---

## Original Demo Effects (25 parts)

The following maps to the actual Second Reality demo sequence. Each effect has a "classic" variant (faithful 320×256) and an optional "remastered" variant (4K enhanced).

### Part 1 — ALKU (Opening Credits)
- [x] `alku/effect.js` — scrolling landscape with credits text overlay (WILDFIRE)
- [ ] `alku/effect.remastered.js`

### Part 2 — U2A (3D Ships Flyover)
- [x] `u2a/effect.js` — polygon 3D ships flyover (PSI)
- [ ] `u2a/effect.remastered.js`

### Part 3 — PAM (Explosion)
- [x] `pam/effect.js` — pre-rendered explosion animation (TRUG/WILDFIRE)
- [ ] `pam/effect.remastered.js`

### Part 4 — BEGLOGO (Title Card)
- [x] `beglogo/effect.js` — "Second Reality" title display
- [ ] `beglogo/effect.remastered.js`

### Part 5 — GLENZ_TRANSITION (Checkerboard Fall)
- [x] `glenzTransition/effect.js` — checkerboard tile fall transition (PSI)
- [ ] `glenzTransition/effect.remastered.js`

### Part 6 — GLENZ_3D (Glenz Vectors)
- [x] `glenzVectors/effect.js` — translucent rotating polyhedra (PSI) [REWRITTEN: full 1:1 port]
- [ ] `glenzVectors/effect.remastered.js`

### Part 7 — TUNNELI (Dot Tunnel)
- [x] `tunneli/effect.js` — concentric circles receding into depth (TRUG) [REWRITTEN: full 1:1 port]
- [ ] `tunneli/effect.remastered.js`

### Part 8 — TECHNO_CIRCLES (Circle Interference)
- [x] `technoCircles/effect.js` — circle interference Moire patterns (PSI) [REWRITTEN: full 1:1 port]
- [ ] `technoCircles/effect.remastered.js`

### Part 9 — TECHNO_BARS_TRANSITION (Bars Transition)
- [x] `technoBarsTransition/effect.js` — four synced bars transition (PSI)
- [ ] `technoBarsTransition/effect.remastered.js`

### Part 10 — TECHNO_BARS (Rotating Bars)
- [x] `technoBars/effect.js` — rotating layered bars with palette pulse (PSI)
- [ ] `technoBars/effect.remastered.js`

### Part 11 — TECHNO_TROLL (Troll Picture)
- [x] `technoTroll/effect.js` — troll picture with CRT shutdown (PSI/WILDFIRE)
- [ ] `technoTroll/effect.remastered.js`

### Part 12 — FOREST (Mountain Scroller)
- [x] `forest/effect.js` — text mapped onto mountain landscape (TRUG)
- [ ] `forest/effect.remastered.js`

### Part 13 — LENS_TRANSITION (Lens Slide-In)
- [x] `lensTransition/effect.js` — face picture slides in (PSI)
- [ ] `lensTransition/effect.remastered.js`

### Part 14 — LENS_LENS (Bouncing Crystal Ball)
- [x] `lens/effect.js` — bouncing crystal ball over background (PSI) [REWRITTEN: full 1:1 port]
- [ ] `lens/effect.remastered.js`

### Part 15 — LENS_ROTO (Rotozoom)
- [x] `rotozoom/effect.js` — rotozoom of picture (PSI) [REWRITTEN: full 1:1 port]
- [ ] `rotozoom/effect.remastered.js`

### Part 16 — PLZ_PLASMA (Plasma)
- [x] `plasma/effect.js` — colorful plasma/smoke waves (WILDFIRE) [REWRITTEN: full 1:1 port]
- [ ] `plasma/effect.remastered.js`

### Part 17 — PLZ_CUBE (Plasma Cube)
- [x] `plzCube/effect.js` — texture-mapped rotating 3D cube (WILDFIRE)
- [ ] `plzCube/effect.remastered.js`

### Part 18 — DOTS (Mini Vector Balls)
- [x] `dots/effect.js` — 512 mini vector balls with gravity (PSI) [REWRITTEN: full 1:1 port]
- [ ] `dots/effect.remastered.js`

### Part 19 — WATER (Mirror Ball Scroller)
- [x] `water/effect.js` — sword on water background scroller (TRUG)
- [ ] `water/effect.remastered.js`

### Part 20 — COMAN (3D Sinusfield)
- [x] `coman/effect.js` — 3D sinusfield / voxel landscape (PSI) [REWRITTEN: full 1:1 port]
- [ ] `voxelLandscape/effect.remastered.js`

### Part 21 — JPLOGO (Jelly Logo)
- [x] `jplogo/effect.js` — jelly-distorted Future Crew logo (PSI) [REWRITTEN: full 1:1 port]
- [ ] `jplogo/effect.remastered.js`

### Part 22 — U2E (3D City Flyover)
- [ ] `u2e/effect.js` — 3D city polygon flyover (PSI)
- [ ] `u2e/effect.remastered.js`

### Part 23 — ENDLOGO (End Picture)
- [ ] `endlogo/effect.js` — end picture flash
- [ ] `endlogo/effect.remastered.js`

### Part 24 — CREDITS (Scrolling Credits)
- [ ] `credits/effect.js` — scrolling credits with demo screenshots
- [ ] `credits/effect.remastered.js`

### Part 25 — ENDSCRL (Greetings Scroll)
- [x] `scrolltext/effect.js` — vertical text scroller (WILDFIRE)
- [ ] `scrolltext/effect.remastered.js`

---

## Bonus Effects (not in original demo)

These are additional effects developed for creative use in the editor. Not part of the original demo sequence.

- [x] `starfield/effect.js` — two-layer parallax starfield (maps to hidden DDSTARS part)
- [x] `copperBars/effect.js` — copper gradient sky (fragment shader, palette cycling)
- [x] `fire/effect.js` — procedural noise fire, heat palette
- [x] `wireframe3d/effect.js` — raymarched wireframe objects, morphing cube/torus
- [x] `vectorBalls/effect.js` — raymarched chrome spheres, Lissajous formations
- [x] `bouncingBitmap/effect.js` — bouncing bitmap (SDF logo)
- [x] `grid/effect.js` — morphing neon grid, perspective floor
- [x] `tunnel/effect.js` — classic tunnel/vortex (original name, now bonus)

---

## Remastered Variant Strategy

> **Rule: all remastered effects must be 100% shader-based (no software renderers).**

Several classic variants faithfully reproduce the original CPU-based algorithms using indexed framebuffers and `texSubImage2D` per frame. The remastered variants must replace these with pure GLSL implementations.

### Software-rendered classics requiring shader rewrites for remastered

| Effect | Classic technique | Remastered approach (TBD) |
|---|---|---|
| `glenzVectors` | CPU 3D polygon rasterization, scanline filler, OR blending | **Needs design discussion** — vertex pipeline or raymarched SDF? |
| `glenzTransition` | CPU checkerboard + title compositing | Fragment shader with procedural tiles |
| `tunneli` | CPU circle rasterization (back-to-front) | Fragment shader (polar coordinates / raymarching) |
| `technoCircles` | CPU circle compositing with palette animation | Fragment shader (SDF circles, palette LUT) |
| `beglogo` | CPU palette-cycling decoded bitmap | Fragment shader with palette LUT texture |
| `pam` | Pre-baked CPU frames, palette lookup | Texture atlas + shader playback |
| `u2a` | CPU background compositing, palette | **Needs design discussion** — 3D ships need vertex pipeline or SDF |

### 3D engine discussion (before starting)

Effects with real 3D geometry need a decision on approach before implementation:

- [ ] **Option A — Mini vertex pipeline**: shared `core/geometry.js` with projection matrices, vertex buffers, depth sorting, instancing. Covers glenzVectors, u2a, u2e, plzCube, dots remastered.
- [ ] **Option B — Raymarching/SDF only**: each effect self-contained with raymarched SDFs in a single fragment shader. Works well for simple shapes (cubes, spheres, tori) but harder for complex polygon meshes.
- [ ] **Option C — Hybrid**: simple effects use SDF, complex polygon effects (u2a, u2e city flyover) get the mini vertex pipeline.

---

## Phase 6 — Polish

- [ ] Post-processing pipeline (palette quantization, scanlines, CRT warp, phosphor glow)
- [ ] Beat map editor (tap tool, per-beat nudge)
- [ ] Video export (MediaRecorder → WebM)
- [ ] Tracker panel (read-only S3M pattern viewer, synced to playhead)
- [ ] Preview pane modes — cycle between layouts with a keyboard shortcut:
  - **Tracker mode** (current): Preview + S3M pattern viewer side by side
  - **Compare mode**: Classic (original) + Remastered canvases side by side, fully synced to the same clock position
