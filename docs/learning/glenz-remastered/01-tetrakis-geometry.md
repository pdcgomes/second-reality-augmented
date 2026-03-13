# Layer 1 — Tetrakis Hexahedron Geometry

**Source:** `src/effects/glenzVectors/data.js` (47 lines)
**Concepts:** polyhedron topology, vertex/face tables, face normals, cube dual construction

---

## What This Layer Covers

Before any rendering, we need geometry. What shape are the two translucent
objects spinning on screen? They are **Tetrakis hexahedra** — a well-known
form in geometry created by erecting a pyramid on every face of a cube. The
result looks like a faceted crystal ball, which is why the demoscene called
this a "Glenz vector" (from the German *Glanz*, meaning shine/gloss).

This layer explains the vertex and face data that defines the shape, how to
read the data tables, and how normals are computed at render time.

---

## The Construction: Cube + Pyramids

Start with a cube. It has 8 vertices and 6 square faces. Now take each square
face and push its center outward, creating a 4-sided pyramid. Each square face
becomes 4 triangles (one per edge of the original square, connecting to the
new apex). This gives:

- **8** original cube corners
- **6** new apex vertices (one per face, protruding outward on each axis)
- **24** triangular faces (6 faces × 4 triangles each)
- **14** vertices total

```
            Tetrakis hexahedron — front view

                    ·  (apex +Y)
                   /|\
                  / | \
                 /  |  \
          ------+---+---+------
          |    / \  |  / \    |
          |   /   \ | /   \   |      Each original cube face
          |  /     \|/     \  |      gets a pyramid on top.
          | /   (apex +Z)   \ |      4 triangles replace 1 square.
          |/       / \       \|
          +-------+   +-------+
          |\     / \  /      /|
          | \   /   \/   \  / |
          |  \ /    /\    \/ .|
          |   +----+  +----+  |
          |  (cube corners)   |
          +-------------------+
                    ·  (apex -Y)
```

---

## The Vertex Table

The vertex data lives in `data.js`. Glenz1 uses scale factor `Z = 50`, Glenz2
uses `Q = 99`:

```javascript
const Z = 50;

export const G1_VERTS = [
  // 8 cube corners (±100*Z on each axis)
  [-100*Z, -100*Z, -100*Z], [ 100*Z, -100*Z, -100*Z],   // 0, 1
  [ 100*Z,  100*Z, -100*Z], [-100*Z,  100*Z, -100*Z],   // 2, 3
  [-100*Z, -100*Z,  100*Z], [ 100*Z, -100*Z,  100*Z],   // 4, 5
  [ 100*Z,  100*Z,  100*Z], [-100*Z,  100*Z,  100*Z],   // 6, 7

  // 6 apex vertices (±170*Z on one axis, 0 on others)
  [     0,      0, -170*Z],   // 8  — front apex  (-Z face)
  [     0,      0,  170*Z],   // 9  — back apex   (+Z face)
  [ 170*Z,      0,      0],   // 10 — right apex  (+X face)
  [-170*Z,      0,      0],   // 11 — left apex   (-X face)
  [     0,  170*Z,      0],   // 12 — top apex    (+Y face)
  [     0, -170*Z,      0],   // 13 — bottom apex (-Y face)
];
```

For Glenz1, the cube corners sit at ±5000 (100 × 50) and the apex vertices
protrude to ±8500 (170 × 50) on each axis. The ratio 170/100 = 1.7 controls
how "spiky" the shape is. A ratio of 1.0 would be a cube; higher ratios make
more pronounced pyramids.

Glenz2 uses `Q = 99` with slightly different proportions: cube corners at
±5940 (60 × 99) and apexes at ±10395 (105 × 99). The different base scale
means Glenz2 is a wider, less spiky variant.

---

## The Face Table

Each face is a triangle defined by `[colorIndex, vertexA, vertexB, vertexC]`:

```javascript
export const G1_FACES = [
  [0x01, 0, 1, 8],   // front face (-Z), triangle: bottom-left, bottom-right, apex
  [0x02, 1, 2, 8],   // front face (-Z), triangle: bottom-right, top-right, apex
  [0x03, 2, 3, 8],   // front face (-Z), triangle: top-right, top-left, apex
  [0x04, 3, 0, 8],   // front face (-Z), triangle: top-left, bottom-left, apex
  // ... 20 more for the other 5 cube faces
];
```

The 24 faces are organised in groups of 4: one group per original cube face.
Each group shares an apex vertex (indices 8–13) and uses 4 of the 8 cube
corners.

### Face layout for one cube face

```
    3 ─────────── 2         Cube face vertices: 0, 1, 2, 3
    |\           /|         Apex vertex: 8 (protruding toward camera)
    | \    ②   / |
    |  \       /  |         Triangle ① = [0, 1, 8]
    |   \     /   |         Triangle ② = [1, 2, 8]
    | ④  \   /  ③ |         Triangle ③ = [2, 3, 8]
    |     \ /     |         Triangle ④ = [3, 0, 8]
    |      8      |
    |     / \     |         The apex (8) connects to every edge,
    |    /   \    |         splitting the square into 4 triangles.
    |   /     \   |
    |  /   ①   \  |
    | /         \ |
    0 ─────────── 1
```

### Color indices

The **color index** in the face table determines how each face is shaded:

- **Glenz1**: Odd indices (0x01, 0x03, ...) are the "blue" faces. Even indices
  (0x02, 0x04, ...) are the "white" faces. Alternating blue/white creates the
  stained-glass checkerboard pattern.
- **Glenz2**: Uses only 0x04 (dark red) and 0x02 (bright red), alternating
  per face.

In the classic variant these indices drive the palette OR-blending trick. In
the remastered they map to RGBA colour presets via the palette system.

---

## How Normals Are Computed

The remastered variant computes per-face normals at init time in the
`buildMeshData()` function:

```javascript
function buildMeshData(verts, faces) {
  for (const [col, ai, bi, ci] of faces) {
    const a = verts[ai], b = verts[bi], c = verts[ci];

    // Two edge vectors
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];

    // Cross product → face normal
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;

    // Normalize to unit length
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    nx /= len; ny /= len; nz /= len;

    // Same normal for all 3 vertices of the triangle (flat shading)
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
  }
}
```

The **cross product** of two edge vectors gives a vector perpendicular to the
triangle surface. Normalising it to length 1 produces the **unit normal** —
the direction the surface "faces." This normal is later used by the fragment
shader for lighting calculations.

Because each triangle gets a single flat normal (the same value for all three
vertices), the shading is **per-face flat**. The Tetrakis hexahedron's 24
facets are clearly visible, which is exactly the crystalline look the effect
aims for.

---

## Two Objects, Same Topology

Both Glenz1 and Glenz2 use the same 14-vertex, 24-face topology. They differ
only in vertex positions (scale) and face colour assignments. At init time,
both meshes are built and uploaded to separate **Vertex Array Objects (VAOs)**:

```javascript
g1Mesh = buildMeshData(G1_VERTS, G1_FACES);
g2Mesh = buildMeshData(G2_VERTS, G2_FACES);
g1VAO = createMeshVAO(gl, g1Mesh);
g2VAO = createMeshVAO(gl, g2Mesh);
```

Each VAO stores the triangle positions and normals in GPU buffers. During
rendering, switching between objects is a single `gl.bindVertexArray()` call —
the GPU already has all the geometry it needs.

---

## Summary

| Property | Glenz1 | Glenz2 |
|----------|--------|--------|
| Scale factor | Z = 50 | Q = 99 |
| Cube corner range | ±5000 | ±5940 |
| Apex protrusion | ±8500 (170×Z) | ±10395 (105×Q) |
| Vertices | 14 | 14 |
| Triangular faces | 24 | 24 |
| Colour pattern | Alternating blue/white | Alternating dark/bright red |

The geometry is static — vertex positions never change after init. All
animation (rotation, scaling, translation, jelly deformation) is applied via
matrices in the vertex shader, which is covered in
[Layer 3](03-vertex-pipeline.md).

---

**Next:** [Layer 2 — Animation State Machine](02-animation-state-machine.md)
