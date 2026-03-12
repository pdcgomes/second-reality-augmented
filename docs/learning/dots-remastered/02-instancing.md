# Layer 2 — GPU Instancing

**Source:** `src/effects/dots/effect.remastered.js`, lines 354–371 (init), 467–503 (draw)
**Concepts:** vertex arrays, instance buffers, attribute divisors, instanced draw calls

---

## What This Layer Covers

We have 512 dot positions from the simulation. Now we need to draw them. The
naive approach — looping 512 times and issuing a draw call for each dot — would
be painfully slow. GPU instancing lets us draw all 512 in a single call.

---

## The Core Idea

Instancing says: "Here is a shape (a quad). Here is a list of 512 positions.
Draw the shape 512 times, once at each position."

The GPU handles the repetition internally, which is vastly faster than 512
separate draw calls because:

- Each draw call has CPU overhead (driver validation, state checking)
- The GPU is designed for massive parallelism — 512 quads is trivial
- Data stays on the GPU; only the position buffer is updated per frame

---

## Setting Up the Vertex Array Object (VAO)

The VAO bundles two data sources together:

```javascript
// Create the VAO — a container that remembers attribute bindings
sphereVAO = gl.createVertexArray();
gl.bindVertexArray(sphereVAO);
```

### Attribute 0: The Quad Template (shared by all instances)

```javascript
quadBuf = gl.createBuffer();
const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
```

This is a unit quad: four corners at (-1,-1), (1,-1), (-1,1), (1,1). Every
sphere will use this same quad — the vertex shader scales and positions it.

`gl.STATIC_DRAW` tells the GPU this data never changes.

### Attribute 1: Per-Instance Positions (updated every frame)

```javascript
instanceBuf = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
gl.bufferData(gl.ARRAY_BUFFER, MAXDOTS * 3 * 4, gl.DYNAMIC_DRAW);
gl.enableVertexAttribArray(1);
gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
gl.vertexAttribDivisor(1, 1);  // <-- THE KEY LINE
```

`MAXDOTS * 3 * 4` allocates space for 512 positions × 3 floats (x, y, z) ×
4 bytes per float = 6144 bytes. `gl.DYNAMIC_DRAW` hints that this data changes
frequently.

**The key line is `gl.vertexAttribDivisor(1, 1)`**. Here is what it means:

- Without a divisor (or divisor = 0): the attribute advances once per **vertex**.
  So vertex 0 reads element 0, vertex 1 reads element 1, etc.
- With divisor = 1: the attribute advances once per **instance**. So all 4
  vertices of instance 0 read element 0, all 4 vertices of instance 1 read
  element 1, etc.

This is what makes instancing work. The quad corners (attribute 0) cycle
through 4 values per instance. The position (attribute 1) stays the same for
all 4 corners of each quad, then steps to the next dot.

```
Instance 0:  vertex 0 → quad(-1,-1) + pos[0]
             vertex 1 → quad( 1,-1) + pos[0]
             vertex 2 → quad(-1, 1) + pos[0]
             vertex 3 → quad( 1, 1) + pos[0]

Instance 1:  vertex 0 → quad(-1,-1) + pos[1]
             vertex 1 → quad( 1,-1) + pos[1]
             ...
```

---

## Uploading Positions Each Frame

Every frame, after the simulation runs, the new positions are uploaded:

```javascript
gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionData);
```

`bufferSubData` updates the existing buffer in-place (no reallocation).
`positionData` is a `Float32Array(512 * 3)` computed from the simulation
output.

---

## The Draw Call

```javascript
gl.bindVertexArray(sphereVAO);
gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAXDOTS);
gl.bindVertexArray(null);
```

Breaking this down:

- `gl.TRIANGLE_STRIP` — drawing mode. With 4 vertices, a triangle strip
  produces 2 triangles (a quad). Vertices connect as: 0-1-2, then 1-2-3.
- `0` — start at vertex index 0
- `4` — 4 vertices per instance (the quad)
- `MAXDOTS` (512) — number of instances

One call. 512 quads. 1024 triangles. The GPU handles it all in parallel.

---

## What the Vertex Shader Receives

For each vertex of each instance, the vertex shader gets:

```glsl
layout(location = 0) in vec2 aQuadPos;      // from quadBuf: (-1,-1), (1,-1), etc.
layout(location = 1) in vec3 aInstancePos;   // from instanceBuf: (ndcX, ndcY, depth)
```

The shader then positions and sizes the quad — which we will explore in the
next two layers.

---

## Why This Matters

Instancing is one of the most important techniques in real-time graphics:

- **Particle systems** — thousands of particles, one draw call
- **Forests** — one tree mesh drawn thousands of times at different positions
- **Crowds** — instanced character meshes with per-instance animation offsets
- **Stars/galaxies** — millions of point-like objects

The pattern is always the same: a shared template (mesh/quad) plus a per-instance
buffer (position/color/scale/rotation). Understanding it here with 512 dots
gives you the mental model for any scale.

---

**Next:** [Layer 3 — The Sphere Impostor](03-sphere-impostor.md)
