# Layer 7 — The Render Loop

**Source:** `src/effects/dots/effect.remastered.js`, lines 376–579 (render), 304–374 (init)
**Concepts:** framebuffer objects, MSAA, blit resolve, multi-pass rendering, resource management

---

## What This Layer Covers

This layer zooms out to see the full picture: how the 5 render passes fit
together, how framebuffers are managed, and how the GPU resources are set up
and torn down. If the previous layers were about individual techniques, this
one is about orchestration.

---

## The 5 Passes

Every frame, `render()` executes these passes in order:

```
Pass 1: REFLECTION
  Draw mirrored spheres → reflectionFBO

Pass 2: MAIN SCENE
  Draw ground (with reflection) + normal spheres → msaaFBO

Pass 3: MSAA RESOLVE
  Copy msaaFBO → sceneFBO (resolve anti-aliasing)

Pass 4: BLOOM
  Extract brights → blur at half-res → blur at quarter-res

Pass 5: COMPOSITE
  Combine scene + tight bloom + wide bloom → screen
```

Each pass writes to a different framebuffer, and later passes read the
textures produced by earlier passes.

---

## Framebuffer Objects (FBOs)

A framebuffer object is an off-screen render target. Instead of drawing to the
screen, you draw to a texture. That texture can then be read by later passes.

This effect uses 7 FBOs:

| FBO | Resolution | Type | Purpose |
|-----|-----------|------|---------|
| `reflectionFBO` | Full | Regular | Mirrored sphere impostors |
| `msaaFBO` | Full | MSAA renderbuffer | Anti-aliased main scene |
| `sceneFBO` | Full | Regular | Resolved scene (readable texture) |
| `bloomFBO1` | Half | Regular | Tight bloom ping-pong A |
| `bloomFBO2` | Half | Regular | Tight bloom ping-pong B |
| `bloomWideFBO1` | Quarter | Regular | Wide bloom ping-pong A |
| `bloomWideFBO2` | Quarter | Regular | Wide bloom ping-pong B |

### Creating an FBO

A regular FBO is a framebuffer with a texture attached:

```javascript
function createFBO(gl, w, h) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}
```

Key details:
- `gl.RGBA8` — 8 bits per channel (standard colour)
- `gl.LINEAR` filtering — smooth sampling when the texture is read at a
  different resolution (important for bloom upsampling)
- `gl.CLAMP_TO_EDGE` — prevents edge bleeding when sampling near texture borders
- `null` for the data argument — allocates GPU memory but does not fill it (the
  render pass will draw into it)

---

## MSAA (Multi-Sample Anti-Aliasing)

Anti-aliasing smooths jagged edges on geometry. MSAA works by computing
multiple colour samples per pixel at triangle edges, then averaging them.

### Why do we need it?

The sphere impostors have hard circle edges from the `discard` call. Without
anti-aliasing, these edges show visible staircasing (aliasing). MSAA smooths
them.

### The MSAA framebuffer

MSAA uses a **renderbuffer** instead of a texture, because MSAA storage is a
special GPU format that cannot be directly sampled as a texture:

```javascript
function createMSAAFBO(gl, w, h, samples) {
  const fb = gl.createFramebuffer();
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  return { fb, rb };
}
```

`samples` is the number of colour samples per pixel (typically 4). The effect
queries the GPU's maximum:

```javascript
msaaSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
```

### The resolve step (Pass 3)

To read the anti-aliased result as a texture, we must **resolve** the MSAA
renderbuffer — averaging the multiple samples into single pixels:

```javascript
gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFBO.fb);
gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO.fb);
gl.blitFramebuffer(0, 0, sw, sh, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.NEAREST);
```

`blitFramebuffer` copies pixels from one framebuffer to another. When the
source is MSAA and the destination is a regular texture, it automatically
resolves the samples. Now `sceneFBO.tex` contains the anti-aliased scene and
can be sampled by the bloom and composite shaders.

---

## Dynamic FBO Resizing

The canvas might be resized (window resize, fullscreen toggle). All FBOs must
match the new dimensions:

```javascript
const sw = gl.drawingBufferWidth;
const sh = gl.drawingBufferHeight;

if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, msaaFBO);
  deleteFBO(gl, sceneFBO);
  deleteFBO(gl, reflectionFBO);
  deleteFBO(gl, bloomFBO1);
  deleteFBO(gl, bloomFBO2);
  deleteFBO(gl, bloomWideFBO1);
  deleteFBO(gl, bloomWideFBO2);

  msaaFBO       = createMSAAFBO(gl, sw, sh, msaaSamples);
  sceneFBO      = createFBO(gl, sw, sh);
  reflectionFBO = createFBO(gl, sw, sh);
  bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);     // half res
  bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);     // quarter res
  bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);

  fboW = sw;
  fboH = sh;
}
```

This pattern — check if size changed, destroy old, create new — is standard
for resolution-independent rendering. The `>> 1` and `>> 2` operators are
bit-shifts for integer division by 2 and 4 respectively.

---

## Resource Cleanup

When the effect is unloaded, `destroy()` frees all GPU resources:

```javascript
destroy(gl) {
  if (sphereProg) gl.deleteProgram(sphereProg);
  if (groundProg) gl.deleteProgram(groundProg);
  if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
  if (blurProg) gl.deleteProgram(blurProg);
  if (compositeProg) gl.deleteProgram(compositeProg);
  if (quad) quad.destroy();
  if (sphereVAO) gl.deleteVertexArray(sphereVAO);
  if (quadBuf) gl.deleteBuffer(quadBuf);
  if (instanceBuf) gl.deleteBuffer(instanceBuf);
  deleteFBO(gl, msaaFBO);
  deleteFBO(gl, sceneFBO);
  deleteFBO(gl, reflectionFBO);
  deleteFBO(gl, bloomFBO1);
  deleteFBO(gl, bloomFBO2);
  deleteFBO(gl, bloomWideFBO1);
  deleteFBO(gl, bloomWideFBO2);
  // ... null all references ...
}
```

GPU resources are not garbage-collected like JavaScript objects. If you forget
to delete them, they leak until the page is closed. Every `gl.create*` call
needs a corresponding `gl.delete*` call.

---

## The Complete Data Flow

Here is how data flows through all 5 passes:

```
simulation (CPU)
  |
  ├─ positionData (512 NDC positions)
  └─ reflectionPosData (512 mirrored NDC positions)
      |
      v
Pass 1: reflectionPosData → sphere shader → reflectionFBO.tex
      |
      v
Pass 2: reflectionFBO.tex → ground shader ─┐
        positionData → sphere shader ───────┤→ msaaFBO
      |
      v
Pass 3: msaaFBO ──blit resolve──→ sceneFBO.tex
      |
      v
Pass 4: sceneFBO.tex → bloom extract → blur × 3 → bloomFBO1.tex (tight)
        bloomFBO1.tex → bloom extract → blur × 3 → bloomWideFBO1.tex (wide)
      |
      v
Pass 5: sceneFBO.tex + bloomFBO1.tex + bloomWideFBO1.tex → composite → screen
```

---

## GPU Resources Summary

The effect allocates:

| Resource type | Count | Purpose |
|---------------|-------|---------|
| Shader programs | 5 | sphere, ground, bloom extract, blur, composite |
| VAOs | 2 | sphere instances (sphereVAO) + fullscreen quad (in quad object) |
| Buffers | 2 | quad vertices (static) + instance positions (dynamic) |
| Framebuffers | 7 | reflection, MSAA, scene, bloom×4 |
| Textures | 6 | one per non-MSAA FBO |
| Renderbuffers | 1 | MSAA colour buffer |

Total GPU memory scales with resolution. At 1920x1080:
- Full-res FBOs: 3 × 1920 × 1080 × 4 bytes = ~24 MB
- Half-res bloom: 2 × 960 × 540 × 4 bytes = ~4 MB
- Quarter-res bloom: 2 × 480 × 270 × 4 bytes = ~1 MB
- MSAA renderbuffer: 1920 × 1080 × 4 × 4 samples = ~32 MB
- **Total: ~61 MB** — comfortable for any modern GPU

---

**Next:** [Layer 8 — Learning Path](08-learning-path.md)
