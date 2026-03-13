# Layer 4 — Gaussian Splats

**Source:** `src/effects/tunneli/effect.remastered.js`, lines 59–87 (DOT_VERT), lines 89–143 (DOT_FRAG), lines 410–437 (render pass)
**Concepts:** GL_POINTS, point sprites, Gaussian falloff, additive blending, anti-aliasing

---

## What This Layer Covers

The classic tunnel drew each dot as a single pixel. The remastered replaces
these with soft, glowing **Gaussian splats** — anti-aliased circles with a
smooth brightness falloff from centre to edge. This layer explains:

- How `GL_POINTS` and `gl_PointSize` create scalable point sprites
- How the Gaussian falloff function creates soft edges
- Why additive blending produces natural glow where dots overlap
- How the vertex buffer is built and uploaded each frame

---

## GL_POINTS and Point Sprites

WebGL's `GL_POINTS` drawing mode renders each vertex as a square **point
sprite** — a screen-aligned quad centred on the vertex position. The vertex
shader controls its size via `gl_PointSize`, and the fragment shader receives
`gl_PointCoord` (a vec2 from (0,0) to (1,1) within the sprite).

```
gl_PointCoord:

  (0,0)────────(1,0)
    │      ●      │      ● = vertex position (centre)
    │             │
  (0,1)────────(1,1)
```

This means each point becomes a tiny canvas that the fragment shader can
paint however it likes — a circle, a star, a texture lookup. The tunnel uses
it to draw soft Gaussian circles.

---

## The Vertex Shader

```glsl
void main() {
  vec2 ndc = (aPosition / vec2(160.0, 100.0)) - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  float baseSz = uDotSize * (1.0 - aDepth * 0.6);
  float scale = uResolution.y / 200.0;
  gl_PointSize = clamp(baseSz * scale * (1.0 + beatPulse * 0.3), 1.0, 128.0);

  vBrightness = aBrightness;
  vDepth = aDepth;
}
```

The size computation has three factors:

| Factor | Formula | Purpose |
|--------|---------|---------|
| Base | `uDotSize` (default 2.7) | User-controlled dot size |
| Depth | `1.0 - aDepth × 0.6` | Far dots (depth=1) are 40% smaller |
| Scale | `uResolution.y / 200.0` | Resolution-proportional: bigger display → bigger dots |

The `clamp(…, 1.0, 128.0)` prevents degenerate sizes. The beat pulse adds
up to 30% size increase on each downbeat.

---

## The Gaussian Falloff

The fragment shader computes a soft circle using an exponential decay:

```glsl
void main() {
  vec2 pc = gl_PointCoord * 2.0 - 1.0;  // remap to [-1, 1]
  float r2 = dot(pc, pc);               // squared distance from centre
  if (r2 > 1.0) discard;                // outside unit circle → invisible
  float alpha = exp(-r2 * 3.5);         // Gaussian bell curve
  // ...
}
```

The `exp(-r² × 3.5)` function produces a bell-shaped brightness profile:

```
r (distance from centre):  0.0   0.2   0.4   0.6   0.8   1.0
alpha:                     1.00  0.87  0.57  0.28  0.11  0.03

Brightness profile (cross-section):

1.0 ┤        ████
    │      ██    ██
0.5 ┤    ██        ██
    │  ██            ██
0.0 ┤██                ██
    └────────────────────
    edge    centre    edge
```

The 3.5 multiplier controls how quickly the brightness falls off. A higher
value makes the dot sharper (more concentrated centre, darker edges); a lower
value makes it wider and softer. At 3.5, the dot is about 97% transparent at
the edge — effectively invisible, giving a smooth fade rather than a hard
circle.

The `discard` for `r² > 1.0` is an optimisation — fragments outside the
unit circle are thrown away entirely, saving the GPU from blending invisible
pixels.

---

## Additive Blending

The scene pass uses **additive blending**:

```javascript
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
```

With `SRC_ALPHA, ONE`:
- Each fragment's RGB is multiplied by its alpha (the Gaussian value)
- The result is **added** to whatever is already in the framebuffer

This means overlapping dots accumulate brightness:

```
Single dot:                 Two overlapping dots:

    · ·                          · · ·
   · · ·                        · ·█· ·
    · ·                          · · ·

(dim everywhere)            (bright where they overlap)
```

Additive blending is the natural choice for glowing objects — two light
sources that overlap should be brighter than either alone. This is in contrast
to standard alpha blending (`SRC_ALPHA, ONE_MINUS_SRC_ALPHA`) which would
make overlapping dots look opaque rather than brighter.

In the context of the tunnel, additive blending creates bright convergence
points where many rings overlap at similar screen positions. These hotspots
are exactly where bloom will have the most dramatic effect.

---

## The Vertex Buffer

Each frame, the CPU computes all visible dot positions and packs them into a
flat `Float32Array`:

```javascript
const dotData = new Float32Array(MAX_DOTS * 4);  // x, y, brightness, depth

// For each ring, for each dot:
const off = dotCount * 4;
dotData[off]     = dx;        // x position in 320×200 space
dotData[off + 1] = dy;        // y position in 320×200 space
dotData[off + 2] = brightness; // 0–1 brightness
dotData[off + 3] = depth;     // 0–1 depth (0=near, 1=far)
```

The buffer is uploaded to the GPU each frame via `bufferSubData`:

```javascript
gl.bindBuffer(gl.ARRAY_BUFFER, dotVBO);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, dotData, 0, dotCount * 4);
```

The VAO (Vertex Array Object) maps the interleaved data to shader attributes:

```javascript
const STRIDE = 4 * 4;  // 4 floats × 4 bytes each = 16 bytes per vertex
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);   // aPosition (xy)
gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8);   // aBrightness
gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 12);  // aDepth
```

Finally, all dots are drawn in a single call:

```javascript
gl.drawArrays(gl.POINTS, 0, dotCount);
```

With 77 rings × 144 dots = ~11,000 vertices, this is a lightweight draw call.
The GPU processes all dots in parallel.

---

## Bounds Clipping

Dots outside the visible area are skipped on the CPU side:

```javascript
if (dx < -20 || dx > 340 || dy < -20 || dy > 220) continue;
```

The range extends 20 pixels beyond the 320×200 viewport to allow partially
visible dots (whose point sprites extend off-screen) to still render. Without
this margin, dots near the edges would pop in and out abruptly.

---

**Next:** [Layer 5 — Neon Bloom](05-neon-bloom.md)
