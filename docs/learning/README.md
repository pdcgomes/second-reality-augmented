# Learning Guides

Deep-dive tutorials that use effects from this project to teach real-time
graphics programming concepts. Each guide is self-contained with inline code
snippets — you can read them on GitHub without cloning the repo.

## Available Guides

### [Dots Remastered](dots-remastered/00-overview.md)

A 7-layer walkthrough of the remastered DOTS effect (Part 18 of Second Reality).
Covers physics simulation, GPU instancing, sphere impostors, projection maths,
planar reflections, bloom post-processing, and multi-pass rendering.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](dots-remastered/00-overview.md) |
| 1 | Physics simulation | [01-simulation.md](dots-remastered/01-simulation.md) |
| 2 | GPU instancing | [02-instancing.md](dots-remastered/02-instancing.md) |
| 3 | Sphere impostors | [03-sphere-impostor.md](dots-remastered/03-sphere-impostor.md) |
| 4 | Projection maths | [04-projection.md](dots-remastered/04-projection.md) |
| 5 | Reflections | [05-reflections.md](dots-remastered/05-reflections.md) |
| 6 | Bloom pipeline | [06-bloom.md](dots-remastered/06-bloom.md) |
| 7 | Render loop | [07-render-loop.md](dots-remastered/07-render-loop.md) |
| 8 | Learning path | [08-learning-path.md](dots-remastered/08-learning-path.md) |

---

### [Plasma Remastered](plasma-remastered/00-overview.md)

A 4-layer walkthrough of the remastered PLZ_PLASMA effect (Part 16 of Second
Reality). Covers multi-harmonic sine synthesis, dual-layer blending, procedural
colour palettes with theme matrices, and bloom post-processing.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](plasma-remastered/00-overview.md) |
| 1 | Sine harmonics | [01-sine-harmonics.md](plasma-remastered/01-sine-harmonics.md) |
| 2 | Dual-layer interleave | [02-dual-layer-interleave.md](plasma-remastered/02-dual-layer-interleave.md) |
| 3 | Palette sequences | [03-palette-sequences.md](plasma-remastered/03-palette-sequences.md) |
| 4 | Bloom and beat reactivity | [04-bloom-and-beat.md](plasma-remastered/04-bloom-and-beat.md) |
| 5 | Learning path | [05-learning-path.md](plasma-remastered/05-learning-path.md) |

---

### [Tunneli Remastered](tunneli-remastered/00-overview.md)

A 5-layer walkthrough of the remastered TUNNELI effect (Part 7 of Second
Reality). Covers elliptical ring templates, perspective foreshortening,
amplitude-growing sinusoidal paths, Gaussian-splat point sprites with additive
blending, and neon bloom post-processing.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](tunneli-remastered/00-overview.md) |
| 1 | Circle templates | [01-circle-templates.md](tunneli-remastered/01-circle-templates.md) |
| 2 | Depth and perspective | [02-depth-and-perspective.md](tunneli-remastered/02-depth-and-perspective.md) |
| 3 | Sinusoidal path | [03-sinusoidal-path.md](tunneli-remastered/03-sinusoidal-path.md) |
| 4 | Gaussian splats | [04-gaussian-splats.md](tunneli-remastered/04-gaussian-splats.md) |
| 5 | Neon bloom | [05-neon-bloom.md](tunneli-remastered/05-neon-bloom.md) |
| 6 | Learning path | [06-learning-path.md](tunneli-remastered/06-learning-path.md) |

---

### [Techno Circles Remastered](techno-circles-remastered/00-overview.md)

A 4-layer walkthrough of the remastered TECHNO_CIRCLES effect (Part 8 of Second
Reality). Covers EGA bit-plane circle data, moiré interference patterns,
per-scanline sinusoidal distortion, and the rendering pipeline with palette
themes and bloom.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](techno-circles-remastered/00-overview.md) |
| 1 | Circle data and EGA bit planes | [01-circle-data.md](techno-circles-remastered/01-circle-data.md) |
| 2 | Circle interference | [02-interference.md](techno-circles-remastered/02-interference.md) |
| 3 | Scanline distortion | [03-scanline-distortion.md](techno-circles-remastered/03-scanline-distortion.md) |
| 4 | Pipeline and bloom | [04-pipeline-and-bloom.md](techno-circles-remastered/04-pipeline-and-bloom.md) |
| 5 | Learning path | [05-learning-path.md](techno-circles-remastered/05-learning-path.md) |

---

### [Techno Bars Remastered](techno-bars-remastered/00-overview.md)

A 4-layer walkthrough of the remastered TECHNO_BARS effect (Part 10 of Second
Reality). Covers analytical bar geometry with anti-aliased edges, the historical
EGA bit-plane architecture, three motion phases with acceleration physics, and
GPU rendering with overlap-based colouring.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](techno-bars-remastered/00-overview.md) |
| 1 | Bar geometry and rotation | [01-bar-geometry.md](techno-bars-remastered/01-bar-geometry.md) |
| 2 | EGA bit-plane history | [02-ega-history.md](techno-bars-remastered/02-ega-history.md) |
| 3 | Motion sequences | [03-motion-sequences.md](techno-bars-remastered/03-motion-sequences.md) |
| 4 | GPU rendering | [04-gpu-rendering.md](techno-bars-remastered/04-gpu-rendering.md) |
| 5 | Learning path | [05-learning-path.md](techno-bars-remastered/05-learning-path.md) |

---

### [Lens Roto Remastered](lens-roto-remastered/00-overview.md)

A 5-layer walkthrough of the remastered LENS_ROTO effect (Part 15 of Second
Reality). Covers the classic rotozoom affine transform, GPU texture sampling
with bilinear filtering, scripted animation curves with multi-phase zoom
physics, lens material (Blinn-Phong specular, Fresnel rim), beat-reactive eye
glow, and a dual-tier bloom pipeline.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](lens-roto-remastered/00-overview.md) |
| 1 | The rotozoom formula | [01-affine-transform.md](lens-roto-remastered/01-affine-transform.md) |
| 2 | Texture and sampling | [02-texture-sampling.md](lens-roto-remastered/02-texture-sampling.md) |
| 3 | Animation curves | [03-animation-curves.md](lens-roto-remastered/03-animation-curves.md) |
| 4 | Palette and post-processing | [04-palette-and-postfx.md](lens-roto-remastered/04-palette-and-postfx.md) |
| 5 | Learning path | [05-learning-path.md](lens-roto-remastered/05-learning-path.md) |

---

### [Lens Lens Remastered](lens-lens-remastered/00-overview.md)

A 6-layer walkthrough of the remastered LENS_LENS effect (Part 14 of Second
Reality). Covers Snell's law refraction optics, pre-computed displacement maps,
bouncing physics with dampened rebounds, GPU refraction shaders with Blinn-Phong
specular and Fresnel rim glow, and bloom post-processing.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](lens-lens-remastered/00-overview.md) |
| 1 | Refraction optics | [01-refraction-optics.md](lens-lens-remastered/01-refraction-optics.md) |
| 2 | Displacement map | [02-displacement-map.md](lens-lens-remastered/02-displacement-map.md) |
| 3 | Bounce physics | [03-bounce-physics.md](lens-lens-remastered/03-bounce-physics.md) |
| 4 | GPU displacement | [04-gpu-displacement.md](lens-lens-remastered/04-gpu-displacement.md) |
| 5 | Bloom and palette | [05-bloom-and-palette.md](lens-lens-remastered/05-bloom-and-palette.md) |
| 6 | Learning path | [06-learning-path.md](lens-lens-remastered/06-learning-path.md) |

---

### [Water Remastered](water-remastered/00-overview.md)

A 5-layer walkthrough of the remastered WATER effect (Part 19 of Second
Reality). Covers pre-computed position lookup tables for chrome sphere
reflections, interlaced rendering with temporal shimmer, sliding-window image
compositing, GPU raymarching with SDF spheres and animated water ripples, and
dual-tier bloom post-processing.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](water-remastered/00-overview.md) |
| 1 | Position lookup tables | [01-lookup-tables.md](water-remastered/01-lookup-tables.md) |
| 2 | Interlaced rendering | [02-interlaced-rendering.md](water-remastered/02-interlaced-rendering.md) |
| 3 | Image compositing | [03-image-compositing.md](water-remastered/03-image-compositing.md) |
| 4 | GPU rendering | [04-gpu-rendering.md](water-remastered/04-gpu-rendering.md) |
| 5 | Learning path | [05-learning-path.md](water-remastered/05-learning-path.md) |

---

### [Glenz Remastered](glenz-remastered/00-overview.md)

A 7-layer walkthrough of the remastered GLENZ_3D effect (Part 6 of Second
Reality). Covers Tetrakis hexahedron geometry, the jelly/bounce animation state
machine, a custom vertex pipeline with model-view-projection matrices, Fresnel
alpha transparency, Blinn-Phong lighting, and MSAA bloom compositing.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](glenz-remastered/00-overview.md) |
| 1 | Tetrakis geometry | [01-tetrakis-geometry.md](glenz-remastered/01-tetrakis-geometry.md) |
| 2 | Animation state machine | [02-animation-state-machine.md](glenz-remastered/02-animation-state-machine.md) |
| 3 | Vertex pipeline | [03-vertex-pipeline.md](glenz-remastered/03-vertex-pipeline.md) |
| 4 | Transparency | [04-transparency.md](glenz-remastered/04-transparency.md) |
| 5 | Phong lighting | [05-phong-lighting.md](glenz-remastered/05-phong-lighting.md) |
| 6 | Bloom and composite | [06-bloom-composite.md](glenz-remastered/06-bloom-composite.md) |
| 7 | Learning path | [07-learning-path.md](glenz-remastered/07-learning-path.md) |

---

### [PLZ Cube Remastered](plz-cube-remastered/00-overview.md)

A 6-layer walkthrough of the remastered PLZ_CUBE effect (Part 17 of Second
Reality). Covers procedural plasma textures via nested sine synthesis, cube
mesh construction with interleaved vertex buffers, B-spline camera path
interpolation, per-pixel Blinn-Phong lighting with an orbiting light source,
and a dual-tier bloom pipeline with beat reactivity.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](plz-cube-remastered/00-overview.md) |
| 1 | Plasma as texture | [01-plasma-as-texture.md](plz-cube-remastered/01-plasma-as-texture.md) |
| 2 | Cube geometry | [02-cube-geometry.md](plz-cube-remastered/02-cube-geometry.md) |
| 3 | Spline camera | [03-spline-camera.md](plz-cube-remastered/03-spline-camera.md) |
| 4 | Diffuse lighting | [04-diffuse-lighting.md](plz-cube-remastered/04-diffuse-lighting.md) |
| 5 | Bloom and post-processing | [05-bloom-and-postfx.md](plz-cube-remastered/05-bloom-and-postfx.md) |
| 6 | Learning path | [06-learning-path.md](plz-cube-remastered/06-learning-path.md) |

---

### [Coman Remastered](coman-remastered/00-overview.md)

A 6-layer walkthrough of the remastered COMAN effect (Part 20 of Second
Reality). Covers the VoxelSpace terrain algorithm (Comanche, NovaLogic 1992),
dual signed height maps with z-wave undulation, front-to-back column
raymarching, cumulative camera paths requiring frame-0 replay, GPU fragment
shader porting with bilinear interpolation, and atmospheric fog with bloom
post-processing.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](coman-remastered/00-overview.md) |
| 1 | Dual height maps | [01-height-maps.md](coman-remastered/01-height-maps.md) |
| 2 | Column raymarching | [02-column-raymarching.md](coman-remastered/02-column-raymarching.md) |
| 3 | Camera path | [03-camera-path.md](coman-remastered/03-camera-path.md) |
| 4 | GPU VoxelSpace | [04-gpu-voxelspace.md](coman-remastered/04-gpu-voxelspace.md) |
| 5 | Atmosphere | [05-atmosphere.md](coman-remastered/05-atmosphere.md) |
| 6 | Learning path | [06-learning-path.md](coman-remastered/06-learning-path.md) |

---

### [U2A Remastered](u2a-remastered/00-overview.md)

A 7-layer walkthrough of the remastered U2A effect (Part 2 of Second Reality).
Covers binary mesh data formats, painter's algorithm depth sorting, Gouraud
scanline shading, Sutherland-Hodgman polygon clipping, 1993-era perspective
projection, and the modern GPU rendering pipeline with palette-texture lighting,
depth of field, and dual-tier bloom.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](u2a-remastered/00-overview.md) |
| 1 | Mesh data and animation stream | [01-mesh-data.md](u2a-remastered/01-mesh-data.md) |
| 2 | Painter's algorithm | [02-painters-algorithm.md](u2a-remastered/02-painters-algorithm.md) |
| 3 | Gouraud shading | [03-gouraud-shading.md](u2a-remastered/03-gouraud-shading.md) |
| 4 | Polygon clipping | [04-polygon-clipping.md](u2a-remastered/04-polygon-clipping.md) |
| 5 | Perspective projection | [05-projection.md](u2a-remastered/05-projection.md) |
| 6 | GPU rendering pipeline | [06-gpu-rendering.md](u2a-remastered/06-gpu-rendering.md) |
| 7 | Learning path | [07-learning-path.md](u2a-remastered/07-learning-path.md) |

---

### [U2E Remastered](u2e-remastered/00-overview.md)

A 6-layer walkthrough of the remastered U2E effect (Part 22 of Second Reality).
Covers the 42-object city scene graph with binary chunk parsing, the full U2
polygon engine (transforms, clipping, flat + Gouraud shading), pre-baked
animation bytecode with delta encoding and animation baking, large-scene
rendering with painter's algorithm and depth sorting, GPU polygon rendering
with palette-texture lighting and atmospheric fog, and a dual-tier bloom
pipeline.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](u2e-remastered/00-overview.md) |
| 1 | Scene graph | [01-scene-graph.md](u2e-remastered/01-scene-graph.md) |
| 2 | Polygon engine | [02-polygon-engine.md](u2e-remastered/02-polygon-engine.md) |
| 3 | Animation bake | [03-animation-bake.md](u2e-remastered/03-animation-bake.md) |
| 4 | Large scene rendering | [04-large-scene-rendering.md](u2e-remastered/04-large-scene-rendering.md) |
| 5 | GPU rendering | [05-gpu-rendering.md](u2e-remastered/05-gpu-rendering.md) |
| 6 | Learning path | [06-learning-path.md](u2e-remastered/06-learning-path.md) |

---

### [Alku Remastered](alku-remastered/00-overview.md)

A 5-layer walkthrough of the remastered ALKU effect (Part 1 of Second
Reality). Covers the 640×350 pre-rendered landscape with horizontal scrolling,
variable-width bitmap font rendering and text layout, timed palette fading
for credit sequences, GPU texture-based rendering with purple horizon glow,
and a dual-tier bloom pipeline.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](alku-remastered/00-overview.md) |
| 1 | Landscape scroll | [01-landscape-scroll.md](alku-remastered/01-landscape-scroll.md) |
| 2 | Bitmap font | [02-bitmap-font.md](alku-remastered/02-bitmap-font.md) |
| 3 | Palette fading | [03-palette-fading.md](alku-remastered/03-palette-fading.md) |
| 4 | GPU rendering | [04-gpu-rendering.md](alku-remastered/04-gpu-rendering.md) |
| 5 | Learning path | [05-learning-path.md](alku-remastered/05-learning-path.md) |

---

### [PAM Remastered](pam-remastered/00-overview.md)

A 4-layer walkthrough of the remastered PAM effect (Part 3 of Second Reality).
Covers Base64-encoded FLI frame decoding with a custom RLE codec, the
PALETTE_FADE white-flash curve for dramatic timed transitions, GPU texture
upload with shader-based palette mapping and volumetric raymarched smoke, and
a dual-tier bloom pipeline with beat reactivity.

**No prerequisites assumed** — maths and GPU concepts are explained from first
principles.

| Layer | Topic | File |
|-------|-------|------|
| 0 | Overview and architecture | [00-overview.md](pam-remastered/00-overview.md) |
| 1 | Frame sequence | [01-frame-sequence.md](pam-remastered/01-frame-sequence.md) |
| 2 | Palette effects | [02-palette-effects.md](pam-remastered/02-palette-effects.md) |
| 3 | GPU rendering | [03-gpu-rendering.md](pam-remastered/03-gpu-rendering.md) |
| 4 | Learning path | [04-learning-path.md](pam-remastered/04-learning-path.md) |
