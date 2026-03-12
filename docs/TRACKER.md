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
- [ ] Editor scaffold: Vite + React 18 + Tailwind + shadcn/ui + Zustand
- [ ] Editor dark theme (FL Studio aesthetic)
- [ ] Editor 5-panel layout (Toolbar, Preview, Timeline, EffectLibrary, ClipProperties)
- [ ] `src/core/webgl.js` — shared WebGL2 helpers
- [ ] Editor Preview.jsx — WebGL2 canvas at 320×256, nearest-neighbor upscale
- [ ] Player stub — `src/player/index.html` + `player.js`, fullscreen canvas
- [ ] Core module stubs: clock, project, orchestrator, beatmap, modplayer
- [ ] Placeholder `assets/project.json` with realistic timings
- [ ] Effects registry (`src/effects/index.js`) with classic/remastered variant resolution
- [ ] Vitest setup + unit tests for core modules

### 1b — Clock
- [ ] `core/clock.js` — wraps `AudioContext.currentTime`, play/pause/scrub

### 1c — Project I/O
- [ ] `core/project.js` — project.json load/save/validate, File System Access API

### 1d — Orchestrator
- [ ] `core/orchestrator.js` — effect lifecycle, tick loop, cue dispatch, pre-warming

### 1e — MOD Player
- [ ] `core/modplayer.js` — libxmp-wasm + AudioWorklet, S3M playback

### 1f — Timeline
- [ ] `editor/ui/Timeline.jsx` — canvas-rendered timeline, playhead scrubbing, clip blocks, beat ticks, zoom

### 1g — Transport
- [ ] `editor/ui/Toolbar.jsx` — play/pause/stop, timecode, beat snap, keyboard shortcuts

### 1h — Library & Properties
- [ ] `editor/ui/EffectLibrary.jsx` — effect browser, drag-to-add
- [ ] `editor/ui/ClipProperties.jsx` — clip param editor

### 1i — Export Pipeline
- [ ] `tools/export.js` — inline all assets into a single self-contained HTML file

## Phase 2 — Amiga Opener Effects

- [ ] `copperBars` — copper gradient sky (fragment shader, palette cycling)
- [ ] `starfield` — two-layer parallax point sprites, warp mode
- [ ] `scrolltext` — sine wave displaced scrolling text

## Phase 3 — Mid-Tier Effects

- [ ] `plasma` — sin-sum fragment shader, rotating color palette
- [ ] `rotozoom` — UV rotation + scale matrix, beat zoom pulse
- [ ] `fire` — ping-pong framebuffer propagation, heat palette
- [ ] `tunnel` — atan2/length UV mapping, scrolling texture

## Phase 4 — 3D Vector Objects

- [ ] `wireframe3d` — rotating wireframe objects, Gouraud shading
- [ ] `vectorBalls` — sphere billboard sprites, Lissajous formations

## Phase 5 — Showpiece Effects

- [ ] `voxelLandscape` — heightmap raycast in fragment shader, distance fog
- [ ] `textured3d` — full WebGL rasterizer, perspective-correct texturing

## Phase 6 — Polish

- [ ] Post-processing pipeline (palette quantization, scanlines, CRT warp, phosphor glow)
- [ ] Transition system (hard cuts, fades, palette wipes)
- [ ] Beat map editor (tap tool, per-beat nudge)
- [ ] Video export (MediaRecorder → WebM)
- [ ] Tracker panel (read-only S3M pattern viewer, synced to playhead)

---

## Additional Effects (from original demo)

- [ ] `dots` — particle formations, sine wave 3D motion
- [ ] `grid` — morphing grid / deformation
- [ ] `lens` — magnification distortion (UV warp)
- [ ] `glenzVectors` — transparent/glassy 3D objects (XOR/additive blending)
- [ ] `creature` — 3D Commander scene (texture-mapped character)
- [ ] `introScroll` — opening intro scroll
- [ ] `jpLogo` — JP logo sequence
- [ ] `credits` — end credits
- [ ] `endScroll` — end scrolltext
- [ ] `raytracing` — FCP raytracing section
- [ ] `bouncingBitmap` — bouncing bitmap (PICS section)
