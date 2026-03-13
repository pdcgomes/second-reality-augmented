# Layer 3 — Vertex Pipeline

**Source:** `src/effects/glenzVectors/effect.remastered.js`, lines 25–43 (MESH_VERT), 258–325 (matrix math)
**Concepts:** model-view-projection, normal matrix, vertex attributes, VAO, column-major matrices

---

## What This Layer Covers

Every other effect in this project uses `FULLSCREEN_VERT` — a trivial
passthrough shader that maps a quad to the screen. Fragment shaders do all the
work. The Glenz remastered is different: it renders **actual 3D geometry**
through a custom vertex shader that transforms positions and normals through
model-view-projection matrices.

This is the foundational technique of all 3D graphics. If you understand this
layer, you understand how every 3D game and application places objects in a
scene.

---

## The Custom Vertex Shader: MESH_VERT

```glsl
#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;   // vertex position from VAO
layout(location = 1) in vec3 aNormal;     // face normal from VAO

uniform mat4 uModelView;      // model × view matrix
uniform mat4 uProjection;     // projection matrix
uniform mat3 uNormalMatrix;   // inverse-transpose of upper-left 3×3

out vec3 vNormal;             // interpolated normal → fragment shader
out vec3 vViewPos;            // view-space position → fragment shader

void main() {
  vec4 mvPos = uModelView * vec4(aPosition, 1.0);
  vViewPos = mvPos.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  gl_Position = uProjection * mvPos;
}
```

Three coordinate transforms happen in sequence:

```
Object space → Model-View → View space → Projection → Clip space → Screen
   (data.js)    (uModelView)               (uProjection)    (GPU)
```

---

## Step 1: Model Matrix (Rotation + Scale + Translation)

The model matrix places the polyhedron in world space. It combines the
animation state machine's output with the rotation angles:

```javascript
const rot1 = computeRotationMatrix(rx, ry, 0);   // 3×3 rotation

const sfx = s.g1sx * 64 / 32768 * scaleBeat;     // jelly-deformed X scale
const sfy = s.g1sy * 64 / 32768 * scaleBeat;     // jelly-deformed Y scale
const sfz = s.g1sz * 64 / 32768 * scaleBeat;     // jelly-deformed Z scale

const model1 = mat4FromRotScale(rot1, sfx, sfy, sfz,
  s.g1tx, -(s.ypos + 1500 + s.g1ty), s.g1tz);
```

`mat4FromRotScale` builds a 4×4 matrix that combines rotation, non-uniform
scaling, and translation in one step:

```javascript
function mat4FromRotScale(rot3x3, sx, sy, sz, tx, ty, tz) {
  return new Float32Array([
    rot3x3[0] * sx, rot3x3[3] * sx, rot3x3[6] * sx, 0,   // column 0
    rot3x3[1] * sy, rot3x3[4] * sy, rot3x3[7] * sy, 0,   // column 1
    rot3x3[2] * sz, rot3x3[5] * sz, rot3x3[8] * sz, 0,   // column 2
    tx,              ty,              tz,              1,   // column 3
  ]);
}
```

**Non-uniform scaling** is what makes the jelly effect work: during a bounce,
`sfx` and `sfy` are larger than `sfz`, stretching the polyhedron horizontally
while squashing it along depth. The `scaleBeat` multiplier adds a subtle
beat-reactive pulse on top.

---

## Step 2: View Matrix

The view matrix positions the camera. Here it is a simple Z-axis translation:

```javascript
const view = mat4Identity();
view[14] = -7500;   // camera at z = -7500, looking toward +Z
```

The model-view matrix is the product of view × model:

```javascript
const mv1 = mat4Multiply(view, model1);
```

This single matrix transforms vertices from **object space** (where the
polyhedron is centered at the origin) directly into **view space** (where the
camera is at the origin, looking down -Z).

---

## Step 3: Projection Matrix

The projection matrix creates the illusion of perspective: objects farther away
appear smaller.

```javascript
function mat4ClassicProjection(near, far) {
  const nf = 1 / (near - far);
  return new Float32Array([
    1.6,  0,    0,                 0,
    0,    2.13, 0,                 0,
    0,    0.3,  (far + near) * nf, -1,
    0,    0,    2 * far * near * nf, 0,
  ]);
}
```

This replicates the original 1993 projection exactly:

```
Original code:
  screen_x = x * 256 / z + 160    (320px wide display)
  screen_y = y * 213 / z + 130    (200px tall, stretched to 256px)

NDC equivalents:
  Sx = 2 × 256 / 320 = 1.6
  Sy = 2 × 213 / 200 = 2.13
  Oy = 0.3  (off-center vertical offset from PROJ_YADD = 130)
```

The **anisotropic** scale factors (1.6 vs 2.13) and the off-center offset
(0.3) faithfully reproduce the classic's slightly stretched, off-center look.
A modern perspective matrix would use equal horizontal/vertical FOV adjusted
by aspect ratio, but matching the classic is more important for visual fidelity.

---

## Step 4: Normal Matrix

Normals require special treatment. If the model matrix includes non-uniform
scaling (which it does, thanks to jelly deformation), you cannot just multiply
normals by the same matrix — they would skew incorrectly.

The correct transform is the **inverse-transpose** of the upper-left 3×3 of
the model-view matrix:

```javascript
function mat3NormalFromMat4(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  const det = a00 * (a11 * a22 - a12 * a21)
            - a01 * (a10 * a22 - a12 * a20)
            + a02 * (a10 * a21 - a11 * a20);
  const id = 1 / det;

  return new Float32Array([
    (a11 * a22 - a12 * a21) * id, ...  // cofactor matrix / determinant
  ]);
}
```

**Why inverse-transpose?** Imagine squashing a sphere into an ellipse. The
surface normals should rotate to stay perpendicular to the surface, not stretch
with the vertices. The inverse-transpose compensates for the non-uniform
scaling, keeping normals perpendicular.

```
  Uniform scale:              Non-uniform scale (jelly):
  Normal stays correct        Normal skews if not corrected

      ↑ N                         ↗ N (wrong!)     ↑ N (correct)
    ╭───╮                       ╭─────╮           ╭─────╮
    │   │                       │     │           │     │
    ╰───╯                       ╰─────╯           ╰─────╯
   (circle)                    (ellipse)         (inverse-transpose)
```

---

## VAO Setup

Each mesh's positions and normals are uploaded to GPU buffers once at init
time:

```javascript
function createMeshVAO(gl, mesh) {
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  // Position buffer → attribute 0
  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  // Normal buffer → attribute 1
  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, posBuf, normBuf, triCount: mesh.triCount };
}
```

A **Vertex Array Object (VAO)** remembers which buffers are bound to which
attribute locations. During rendering, a single `gl.bindVertexArray(g1VAO.vao)`
call activates the entire vertex layout. The shader reads `aPosition` from
attribute 0 and `aNormal` from attribute 1 automatically.

---

## Per-Face Drawing

Because transparency requires face sorting (covered in [Layer 4](04-transparency.md)),
faces are drawn individually rather than in a single draw call:

```javascript
gl.drawArrays(gl.TRIANGLES, idx * 3, 3);   // draw 1 triangle (3 vertices)
```

With 24 faces per object and separate front/back draws, that is up to 96 draw
calls per frame. This is tiny by modern standards — the overhead is negligible
for 48 triangles total.

---

## The Full Transform Chain

Putting it all together, here is the journey of a single vertex:

```
data.js: [-5000, -5000, -5000]          Object space (Glenz1 corner)
         × rotation matrix               Rotate by rx, ry
         × jelly scale (sfx, sfy, sfz)   Squash-and-stretch
         + translation (g1tx, ypos, g1tz) Position in world
         × view (z = -7500)              Camera-relative position
         = view-space position            → vViewPos (for lighting)
         × projection (Sx=1.6, Sy=2.13)  Perspective divide
         = clip-space position            → gl_Position (for rasteriser)
```

The fragment shader receives `vViewPos` and the transformed `vNormal`, which
are everything it needs for lighting calculations in the next layers.

---

**Next:** [Layer 4 — Transparency](04-transparency.md)
