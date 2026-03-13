# Layer 3 — Gouraud Shading

**Source:** `src/effects/u2a/engine.js`, lines 287–302 (lighting), lines 425–507 (flat/Gouraud fill)
**Concepts:** Flat shading, Gouraud interpolation, palette ramps, scanline rasterisation

---

## What This Layer Covers

- How **flat shading** computes one colour per polygon from the face normal
- How **Gouraud shading** interpolates per-vertex colours across the polygon
- How the classic scanline rasteriser walks polygon edges and fills spans
- How palette ramps map lighting intensity to specific VGA colours
- How the remastered shader replicates the same palette-ramp logic on the GPU

---

## Flat Shading: One Colour Per Face

The simplest way to light a polygon is to compute a single colour from the
**face normal** — the surface direction of the entire polygon. Every pixel in
that polygon gets the same colour.

```javascript
function normalLight(n) {
  let d = (n.x * LIGHT[0] + n.y * LIGHT[1] + n.z * LIGHT[2])
          / 16384 * 128;
  return clamp(d + 128, 0, 255);
}
```

This is a **dot product** between the surface normal and the light direction
`[12118, 10603, 3030] / 16384`. The result is scaled to the 0–255 range.
Surfaces facing the light get high values (bright); surfaces facing away get
low values (dark).

```
          Light ──→
                     ╲
                      ╲   Normal ↑
                       ╲  │
                        ╲ │ θ
         ────────────────╳─────────  Surface
                dot = cos(θ)
         Facing light: cos(θ) ≈ 1  → bright
         Edge-on:      cos(θ) ≈ 0  → medium
         Away:         cos(θ) < 0  → dark
```

---

## Palette Ramps

The light value is not used as a greyscale intensity. Instead, it indexes into
a **palette ramp** — a contiguous range of VGA palette entries that go from
dark to light in a specific hue.

```javascript
function calcLight(flags, n) {
  let light = normalLight(n);
  let div = 16;
  const f = (flags & F_SHADE32) >> 10;
  if (f === 1) div = 32;
  else if (f === 2) div = 16;
  else if (f === 3) div = 8;
  light = light / div;
  light = clamp(light, 2, 256 / div - 1);
  return Math.floor(light);
}
```

The **shade division** (8, 16, or 32) controls how many palette entries the
ramp spans. A 32-shade ramp has finer gradations than an 8-shade one.

The final colour index is `baseColor + shadeLevel`:

```
Palette ramp example (32 shades, base index 96):
  Index: 96   97   98   99  ...  126  127
  Shade: dark ─────────────────────── bright
```

| Material    | Base | Shades | Mode    |
|-------------|------|--------|---------|
| DEFAULT     | 96   | 32     | Flat    |
| LIGHT_BLUE  | 32   | 32     | Gouraud |
| GREY        | 128  | 32     | Gouraud |
| ORANGE      | 64   | 32     | Flat    |

---

## Gouraud Shading: Smooth Colour Interpolation

**Gouraud shading** (Henri Gouraud, 1971) computes lighting at each vertex
and smoothly interpolates across the polygon surface. This creates the illusion
of a curved surface even though the geometry is flat polygons.

The key difference from flat shading: instead of one normal per face, each
vertex has its own **vertex normal** (typically the average of the surrounding
face normals). Each vertex gets its own shade level:

```javascript
if (flags & F_GOURAUD) {
  nv.color = color + calcLight(flags, n[v[point[i]].NormalIndex]);
}
```

The `NormalIndex` stored with each vertex points to a normal vector in the
object's normal table. The engine computes a shade level per vertex, and the
rasteriser interpolates between them.

```
Flat shading:                   Gouraud shading:
┌─────────────────┐             ┌─────────────────┐
│                 │             │ ░░░▒▒▒▓▓▓██████ │
│  uniform grey   │             │ ░░▒▒▒▓▓▓█████  │
│                 │             │ ░▒▒▓▓▓█████    │
│                 │             │ ▒▒▓▓██████     │
└─────────────────┘             └─────────────────┘
  One colour for the              Smooth gradient from
  entire polygon                  vertex to vertex
```

---

## The Scanline Rasteriser

The engine fills polygons one horizontal scanline at a time. The rasteriser
walks the left and right edges of the polygon simultaneously, computing the
X boundaries of each scanline.

### Finding the Top Vertex

```javascript
function findTopBottom(coords) {
  let topY = coords[0].y, topI = 0, botY = coords[0].y;
  for (let i = 1; i < coords.length; i++) {
    if (coords[i].y < topY) { topY = coords[i].y; topI = i; }
    else if (coords[i].y > botY) { botY = coords[i].y; }
  }
  return { topY, topI, botY };
}
```

The rasteriser starts at the topmost vertex and works downward. Two "cursors"
walk the polygon edges — one clockwise (right edge), one counter-clockwise
(left edge).

### Flat Fill

For flat-shaded polygons, every pixel in a scanline gets the same colour:

```javascript
for (let y = 0; y < h; y++) {
  const xl = Math.round(Math.min(x1, x2));
  const xr = Math.round(Math.max(x1, x2));
  for (let x = xl; x <= xr; x++) fb[x + ym] = color;   // engine.js line 458
  x1 += sL.slope; x2 += sR.slope; ym += W;
}
```

`sL.slope` and `sR.slope` are the X increment per scanline for the left and
right edges — computed by dividing the horizontal distance by the vertical
distance of each edge segment.

### Gouraud Fill

For Gouraud-shaded polygons, the colour is interpolated both vertically
(along edges) and horizontally (across each scanline):

```javascript
for (let y = 0; y < h; y++) {
  const xl = Math.round(Math.min(x1, x2));
  const xr = Math.round(Math.max(x1, x2));
  const chs = xl !== xr ? (c2 - c1) / (x2 - x1) : 0;  // engine.js line 498
  let c = x2 < x1 ? c2 : c1;
  for (let x = xl; x < xr; x++) {
    fb[x + ym] = Math.round(c);                          // engine.js line 500
    c += chs;
  }
  x1 += sL.slope; x2 += sR.slope;
  c1 += sL.cSlope; c2 += sR.cSlope;                     // engine.js line 502
  ym += W;
}
```

The interpolation chain:
1. **Vertex colours** — computed at polygon setup from per-vertex normals
2. **Edge interpolation** — `cSlope` slides the colour along each edge as Y advances
3. **Scanline interpolation** — `chs` (colour horizontal slope) slides the colour
   across each pixel in the span

```
Vertex A (shade 5)──────────Edge AB──────────Vertex B (shade 12)
         │                                         │
         │  Scanline: shade interpolates 5 → 12    │
         │  across pixels from left to right        │
         │                                         │
Vertex C (shade 8)──────────Edge CD──────────Vertex D (shade 15)
```

---

## The Remastered Approach: GPU Palette Lookup

The remastered variant performs the same palette-ramp lighting on the GPU. A
256×1 texture holds the full VGA palette, and the fragment shader computes
the shade index identically to the software rasteriser:

```glsl
float d = dot(n, uLightDir) / 16384.0 * 128.0;
float light = clamp(d + 128.0, 0.0, 255.0);

float shade = light / div;
shade = clamp(shade, 2.0, maxShade);
shade = floor(shade);

float palIdx = vBasePalIdx + shade;
float palU = (palIdx + 0.5) / 256.0;
vec3 color = texture(uPalette, vec2(palU, 0.5)).rgb;
```

The `+ 0.5` offset centres the texture sample on the palette entry, avoiding
off-by-one errors from bilinear interpolation. The GPU does the Gouraud
interpolation automatically — vertex normals passed as varying outputs
are hardware-interpolated across fragments.

---

## Why Gouraud Instead of Phong?

**Phong shading** interpolates normals across the surface and computes
lighting per-pixel. It produces smoother highlights but requires more
computation.

In 1993, Gouraud shading was the practical choice because:
- Lighting is computed only at vertices (3–6 per polygon), not every pixel
- The colour interpolation is cheap — just addition per pixel
- The VGA palette has only 256 entries, limiting how smooth shading can look

The remastered variant keeps Gouraud-style palette-ramp lighting to preserve
visual fidelity with the original. A future Phong-shaded variant could produce
smoother specular highlights.

---

**Next:** [Layer 4 — Polygon Clipping](04-polygon-clipping.md)
