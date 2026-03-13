# Layer 2 — Cube Geometry

**Source:** `src/effects/plzCube/effect.remastered.js`, lines 132–163 (CUBE_DATA), lines 482–504 (VAO setup)
**Concepts:** interleaved vertex buffers, index buffers, vertex array objects, per-face attributes, triangle winding

---

## What This Layer Covers

- How the cube's 6 faces are defined as 24 vertices (4 per face) with shared normals
- How **interleaved vertex data** packs position, UV, normal, and theme index into one buffer
- How an **index buffer** turns 24 vertices into 12 triangles (36 indices)
- How a **Vertex Array Object (VAO)** binds the layout so the GPU knows where each attribute lives
- Why 3 **colour themes** map to pairs of opposite faces

---

## Face Definitions

The cube is defined as 6 faces, each with 4 corner vertices, a face normal,
and a theme index:

```javascript
const S = 125;   // half-size (cube spans -125 to +125 on each axis)
const faces = [
  { v: [[S,-S,S],[S,S,S],[-S,S,S],[-S,-S,S]],       n: [0,0,1],  t: 0 },  // front
  { v: [[-S,-S,-S],[-S,S,-S],[S,S,-S],[S,-S,-S]],    n: [0,0,-1], t: 0 },  // back
  { v: [[S,-S,-S],[S,S,-S],[S,S,S],[S,-S,S]],        n: [1,0,0],  t: 1 },  // right
  { v: [[-S,-S,S],[-S,S,S],[-S,S,-S],[-S,-S,-S]],    n: [-1,0,0], t: 1 },  // left
  { v: [[S,S,S],[S,S,-S],[-S,S,-S],[-S,S,S]],        n: [0,1,0],  t: 2 },  // top
  { v: [[S,-S,-S],[S,-S,S],[-S,-S,S],[-S,-S,-S]],    n: [0,-1,0], t: 2 },  // bottom
];
```

Notice that **opposite faces share the same theme** index: front/back = 0
(blue), right/left = 1 (red), top/bottom = 2 (purple). This mirrors the
original's three 64-colour palette bands.

```
           top (t=2)
           ┌──────────┐
          ╱│          ╱│
         ╱ │  back   ╱ │
        ╱  │ (t=0)  ╱  │
       ┌──────────┐ │  │ right (t=1)
       │   │      │ │  │
 left  │   └──────│─┘  │
 (t=1) │  ╱       │  ╱
       │ ╱ front  │ ╱
       │╱  (t=0)  │╱
       └──────────┘
          bottom (t=2)
```

---

## Why 24 Vertices, Not 8?

A geometric cube has 8 unique corner positions. But each face needs its own
**normal vector** and **UV coordinates** — a corner shared by three faces has
three different normals (pointing in three different directions). GPU vertex
attributes are per-vertex, not per-face, so each face gets its own 4 vertices:

```
  Shared corner (position [-125, 125, 125]):

  Face: front (z=+1)     top (y=+1)      left (x=-1)
  Normal: [0,0,1]        [0,1,0]         [-1,0,0]
  UV:     [0,1]          [1,1]           [0,0]

  → Three separate vertices at the same position
```

This gives 6 faces × 4 vertices = **24 vertices** total.

---

## Interleaved Vertex Layout

Each vertex stores 9 floats packed contiguously:

```
  Offset (bytes):  0    4    8    12   16   20   24   28   32
                   ├────┼────┼────┼────┼────┼────┼────┼────┤
                   │ px │ py │ pz │ u  │ v  │ nx │ ny │ nz │ th │
                   └────┴────┴────┴────┴────┴────┴────┴────┘
                   ╰─ position ─╯  ╰─UV─╯  ╰── normal ──╯  theme

  Stride = 9 × 4 = 36 bytes per vertex
  Total  = 24 vertices × 36 bytes = 864 bytes
```

**Interleaving** keeps all data for one vertex adjacent in memory. When the GPU
processes vertex N, it reads one contiguous 36-byte chunk instead of jumping
between separate position, UV, normal, and theme arrays. This is faster because
modern GPUs are optimised for sequential memory access.

The alternative — **separate buffers** — stores all positions together, then
all UVs, then all normals. This is easier to update partially but less cache-
friendly for the common case where all attributes are read together.

---

## Index Buffer

Each face is a quad, but GPUs draw triangles. An **index buffer** splits each
quad into two triangles by referencing vertex indices:

```javascript
const base = fi * 4;   // fi = face index (0–5)
indices[ii++] = base;     indices[ii++] = base+1;  indices[ii++] = base+2;
indices[ii++] = base;     indices[ii++] = base+2;  indices[ii++] = base+3;
```

For face 0 (front), vertices 0–3 become triangles (0,1,2) and (0,2,3):

```
  3 ────── 2          3 ────── 2
  │      ╱ │          │ ╲      │
  │    ╱   │    →     │   ╲    │
  │  ╱     │          │     ╲  │
  0 ────── 1          0 ────── 1

  Triangle 1: (0, 1, 2)     Triangle 2: (0, 2, 3)
```

6 faces × 2 triangles × 3 indices = **36 indices** stored in a `Uint16Array`.

---

## UV Coordinates

Every face uses the same UV layout — the four corners are mapped to the unit
square:

```javascript
const uvs = [[0,0],[1,0],[1,1],[0,1]];
```

This means the procedural plasma texture (computed in the fragment shader)
covers each face identically. The visual variety comes from the **theme index**
selecting different colour ramps, not different UV mappings.

```
  UV space          Cube face (front, looking straight on)
  (0,1)──(1,1)     (-125,125,125)──(125,125,125)
    │       │              │              │
    │       │              │   plasma     │
    │       │              │   pattern    │
  (0,0)──(1,0)     (-125,-125,125)──(125,-125,125)
```

Because the GPU interpolates UVs with **perspective correction**, the plasma
pattern stays undistorted even when the face is viewed at steep angles. The
classic's affine (linear) interpolation caused visible warping on large
faces — one of the key visual improvements in the remastered variant.

---

## VAO Setup

The **Vertex Array Object (VAO)** records how the GPU should interpret the
interleaved buffer. It is configured once in `init()`:

```javascript
cubeVAO = gl.createVertexArray();
gl.bindVertexArray(cubeVAO);

cubeVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
gl.bufferData(gl.ARRAY_BUFFER, CUBE_DATA.verts, gl.STATIC_DRAW);

const STRIDE = 9 * 4;   // 36 bytes
gl.enableVertexAttribArray(0);   // aPosition
gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
gl.enableVertexAttribArray(1);   // aUV
gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 12);
gl.enableVertexAttribArray(2);   // aNormal
gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 20);
gl.enableVertexAttribArray(3);   // aTheme
gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 32);
```

Each `vertexAttribPointer` call says: "attribute N starts at byte offset X,
has Y components, and repeats every STRIDE bytes." The VAO remembers these
bindings so the render loop only needs `gl.bindVertexArray(cubeVAO)`.

```
  vertexAttribPointer arguments:
                                                    byte
  Location  Components  Type   Stride  Offset   →  range
  ────────  ──────────  ─────  ──────  ──────      ──────
  0 (pos)   3           FLOAT  36      0           0–11
  1 (uv)    2           FLOAT  36      12          12–19
  2 (norm)  3           FLOAT  36      20          20–31
  3 (theme) 1           FLOAT  36      32          32–35
```

---

## Drawing the Cube

With geometry uploaded once, the entire cube draws in a single call:

```javascript
gl.bindVertexArray(cubeVAO);
gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
gl.bindVertexArray(null);
```

`drawElements` reads 36 indices from the index buffer, each referencing a
vertex in the VBO. The GPU runs the vertex shader 24 times (once per unique
vertex) and the fragment shader millions of times (once per covered pixel).

---

## Classic Comparison

| Aspect | Classic | Remastered |
|--------|---------|------------|
| Vertex count | 8 (shared corners) | 24 (separate per-face for normals/UVs) |
| Storage | JS objects `{x, y, z}` | Interleaved `Float32Array` (864 bytes) |
| Face data | Array of polygon index lists | Index buffer (72 bytes) |
| UV interpolation | Affine (scanline filler) | Perspective-correct (hardware) |
| Theme encoding | Palette band offset (c × 64) | Float attribute per vertex |
| Draw | Per-face CPU polygon fill | Single `drawElements` call |

---

**Next:** [Layer 3 — Spline Camera](03-spline-camera.md)
