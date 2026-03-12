# Second Reality Augmented

A web-based recreation of [Second Reality](https://en.wikipedia.org/wiki/Second_Reality) (Future Crew, Assembly'93) built with WebGL2 shaders and Web Audio, paired with a timeline editor for sequencing and scrubbing through the demo in real time.

https://github.com/mtuomi/SecondReality — original source code

## What is Second Reality?

Second Reality is a legendary DOS demo by Future Crew that won the Assembly 1993 demo competition. It pushed 486-era PCs to their limits with hand-optimized x86 assembly, producing effects like voxel landscapes, plasma fields, 3D polygon flyovers, and glenz vectors — all perfectly synchronized to Skaven's tracker music.

This project rebuilds those effects using modern web technologies while staying faithful to the original 320×256 PAL aesthetic.

## Architecture

The project has two entry points:

- **Player** (`src/player/`) — a standalone vanilla JS runtime that plays the demo fullscreen, synced to the original S3M soundtrack via Web Audio.
- **Editor** (`src/editor/`) — a React + Vite creative tool with a video-editor-style timeline for sequencing effects, authoring beat maps, and scrubbing through the demo.

Both share a common core (`src/core/`) that handles the orchestrator, clock, beat map, MOD player, and WebGL helpers.

### Effects as Modules

Each visual effect is a self-contained ES module with a three-method interface (`init`, `render`, `destroy`). The orchestrator pre-warms effects before their clip starts, ensuring zero-hitch transitions. Effects come in two variants:

- **Classic** — faithful 1:1 reproduction of the original algorithm at 320×256
- **Remastered** — optional enhanced version with modern techniques (4K, better lighting/shading)

### Tech Stack

| Layer | Technology |
|-------|------------|
| Rendering | WebGL2 (raw, no Three.js) |
| Audio | S3M playback via vendored webaudio-mod-player |
| Master clock | `AudioContext.currentTime` (sample-accurate) |
| Editor framework | React 18 + Vite + Tailwind CSS + Zustand |
| Post-processing | Framebuffer chain, full-screen GLSL passes |

No frameworks or bundlers required for the player — vanilla JS and raw WebGL.

## Implemented Effects

Effects from the original demo sequence:

| # | Effect | Original Part | Status |
|---|--------|--------------|--------|
| 1 | Scrolling landscape credits | ALKU | Done |
| 2 | 3D polygon ships flyover | U2A | Done |
| 3 | Pre-rendered explosion | PAM | Done |
| 6 | Translucent rotating polyhedra | GLENZ | Done |
| 7 | Dot tunnel | TUNNELI | Done |
| 14 | Bouncing crystal ball | LENS | Done |
| 15 | Rotozoom | LENS_ROTO | Done |
| 16 | Plasma waves | PLZ_PLASMA | Done |
| 18 | Mini vector balls | DOTS | Done |
| 20 | 3D sinusfield / voxel landscape | COMAN | Done |
| 25 | Vertical text scroller | ENDSCRL | Done |

Bonus effects (not in the original demo):

Starfield, Copper Bars, Fire, Wireframe 3D, Vector Balls, Bouncing Bitmap, Grid, Tunnel

## Running

**Player** — open `src/player/index.html` in a browser (serve over HTTP for ES module support).

**Editor:**

```bash
cd src/editor
npm install
npm run dev
```

## Project Structure

```
src/
  core/           Shared runtime (orchestrator, clock, beatmap, modplayer, webgl)
  effects/        One subfolder per effect (classic + optional remastered variant)
  editor/         React + Vite editor UI
  player/         Standalone vanilla JS player
assets/
  project.json    Demo timeline definition (clips, transitions, beat map)
  MUSIC0.S3M      Original Skaven soundtrack (part 1)
  MUSIC1.S3M      Original Skaven soundtrack (part 2)
  effects/        Per-effect textures and sprite sheets
lib/
  webaudio-mod-player/   Vendored S3M playback engine (MIT)
tools/            Asset extraction and project generation scripts
docs/             Design documents and effect analyses
reference/        Code from the JS port used as implementation reference
```

## Credits

- **Original demo:** Future Crew (1993) — Psi, Trug, Wildfire, Gore, Marvel, Skaven
- **Music:** Skaven (Peter Hajba) — S3M tracker modules
- **JS reference port:** [covalichou/second-reality-js](https://github.com/covalichou/second-reality-js)
- **Code review:** [Fabien Sanglard's Second Reality series](https://fabiensanglard.net/second_reality/)

## License

This is a non-commercial fan recreation for educational and preservation purposes. The original Second Reality demo and its assets are the property of Future Crew / Futuremark.
