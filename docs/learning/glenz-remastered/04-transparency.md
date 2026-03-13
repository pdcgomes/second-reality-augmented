# Layer 4 — Transparency

**Source:** `src/effects/glenzVectors/effect.js` (classic, lines 90–128, 150–205), `effect.remastered.js` (lines 397–504, 686–766)
**Concepts:** OR-indexed palette blending, alpha blending, painter's algorithm, depth sorting, Fresnel transparency

---

## What This Layer Covers

The Glenz effect is famous for its translucent, stained-glass appearance. But
how do you make objects see-through? In 1993 and today the answer is very
different. This layer explains both approaches — the classic's ingenious
palette trick and the modern GPU alpha-blending pipeline — and why the
remastered needs face sorting that the classic could skip entirely.

---

## The Classic: OR-Indexed Palette Transparency

The original Second Reality ran on VGA Mode 13h: 320×200 pixels, each stored
as an 8-bit **palette index** (0–255). There was no per-pixel alpha channel.
Blending two colours would require reading the pixel, looking up both colours,
computing the mix, finding the closest palette entry, and writing it back —
far too expensive for a 386.

PSI's solution was brilliant: **encode transparency in the bit pattern of the
palette indices themselves.**

### The bit layout

```
  Colour index (8 bits):

  Bit 7  6  5  4  3  2  1  0
  ─────────────────────────────
  │  face colour (0x08–0xC0)  │  background (0–7)  │
  ─────────────────────────────
  │     set by polygon fill   │  set by background  │
  ─────────────────────────────
```

- **Bits 0–2** (values 0–7): background colour — the checkerboard or mixing
  colour for Glenz2
- **Bits 3+** (multiples of 8): face colour identifier — which Glenz1 face
  this pixel belongs to

### How OR combines them

When a polygon is rasterised, each pixel's colour index is written with
bitwise OR:

```javascript
for (let x = x0; x < x1; x++) fb[base + x] |= color;
```

If the background pixel was index 3 (binary `00000011`) and the face writes
index 0x10 (binary `00010000`), the OR result is `00010011` = 0x13. The
palette is pre-constructed so that index 0x13 contains exactly the correct
blended colour of that face over that background.

### Why it works

OR is **commutative and associative**. It does not matter in which order you
draw the polygons — `A | B | C` gives the same result regardless of draw
order. This means:

1. No depth sorting needed
2. No read-modify-write (just write with OR)
3. Multiple overlapping translucent faces combine correctly
4. The palette handles all colour mixing — zero per-pixel maths

The palette construction happens at runtime:

```javascript
for (let i = 0; i < 8; i++) {
  const idx = (color + i) * 3;
  s.vgaPal[idx]     = clamp(Math.floor(r + s.bgPal[i * 3] / 4), 0, 63);
  s.vgaPal[idx + 1] = clamp(Math.floor(g + s.bgPal[i * 3 + 1] / 4), 0, 63);
  s.vgaPal[idx + 2] = clamp(Math.floor(b + s.bgPal[i * 3 + 2] / 4), 0, 63);
}
```

For each face colour (bits 3+), 8 palette entries are created — one for each
possible background value (bits 0–2). Each entry blends the face shade with
the corresponding background colour.

### The limitation

Only 3 bits (8 values) are available for background mixing. This limits the
number of simultaneously visible background colours to 8. It also means only
one "layer" of transparency: two overlapping translucent faces cannot blend
with each other independently. For the Glenz effect this was fine — the visual
result was stunning by 1993 standards.

---

## The Remastered: True Alpha Blending

Modern GPUs have hardware alpha blending built in. Each fragment outputs an
RGBA colour where A is the opacity (0 = fully transparent, 1 = fully opaque):

```javascript
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
```

This tells the GPU: for each pixel, compute:

```
result = source.rgb × source.alpha + destination.rgb × (1 - source.alpha)
```

A face with alpha 0.55 contributes 55% of its colour and lets 45% of
whatever is behind it show through. Multiple translucent layers accumulate
naturally.

---

## The Depth Sorting Problem

Alpha blending has a catch: **it is order-dependent.** Drawing face A on top of
face B gives a different result than B on top of A (unlike OR, which is
commutative). If you draw a near face first, the far face behind it will blend
incorrectly — its contribution will be added on top rather than behind.

The solution is **painter's algorithm**: sort faces back-to-front and draw them
in that order, so farther faces are always in the framebuffer before nearer
faces blend over them.

```javascript
function sortFacesByDepth(faces, verts, modelView) {
  const sorted = faces.map(([col, ai, bi, ci], idx) => {
    const a = verts[ai], b = verts[bi], c = verts[ci];
    // Compute centroid in object space
    const cx = (a[0] + b[0] + c[0]) / 3;
    const cy = (a[1] + b[1] + c[1]) / 3;
    const cz = (a[2] + b[2] + c[2]) / 3;
    // Transform centroid to view space (only need Z for sorting)
    const viewZ = modelView[2] * cx + modelView[6] * cy
                + modelView[10] * cz + modelView[14];
    return { idx, depth: viewZ };
  });
  sorted.sort((a, b) => a.depth - b.depth);  // back-to-front
  return sorted;
}
```

For each face, the centroid (average of 3 vertices) is transformed into view
space. Only the Z coordinate matters — it tells us how far from the camera the
face is. Sorting by ascending Z puts the farthest faces first.

With 24 faces per object, the sort is trivial — well under a microsecond. The
sorted order determines the draw sequence:

```javascript
const sorted1 = sortFacesByDepth(G1_FACES, G1_VERTS, mv1);
for (const { idx } of sorted1) {
  // Draw front face, then back face for this triangle
  gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
}
```

---

## Front and Back Face Rendering

Each triangle is drawn **twice** — once as a front face, once as a back face
(if that side is visible). This replaces the classic's face-culling-based
draw/skip logic:

```javascript
for (const { idx } of sorted1) {
  const col = G1_FACES[idx][0];

  // Front face
  const fc1 = getGlenz1Color(pal, col, true);
  if (fc1) {
    gl.uniform3f(mu.baseColor, fc1[0], fc1[1], fc1[2]);
    gl.uniform1f(mu.alpha, fc1[3]);
    gl.uniform1i(mu.isBackFace, 0);
    gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
  }

  // Back face (different colour, lower alpha)
  const bc1 = getGlenz1Color(pal, col, false);
  if (bc1) {
    gl.uniform3f(mu.baseColor, bc1[0], bc1[1], bc1[2]);
    gl.uniform1f(mu.alpha, bc1[3]);
    gl.uniform1i(mu.isBackFace, 1);
    gl.drawArrays(gl.TRIANGLES, idx * 3, 3);
  }
}
```

The fragment shader flips the normal when `uIsBackFace` is true, ensuring
correct lighting for the inner surface. Back faces use lower alpha (typically
35% of the front face value), so they are more transparent — creating the
illusion of looking through the back wall of a glass vessel.

---

## Fresnel Transparency

In real glass, transparency varies with viewing angle. Looking straight
through a window it is mostly transparent. At glancing angles it becomes
reflective and opaque. This is the **Fresnel effect** (pronounced "fre-NEL").

The remastered approximates this with **Schlick's Fresnel approximation**:

```glsl
float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelExp);
float alpha = mix(uAlpha * 0.4, uAlpha, fresnel);
```

- `dot(N, V)` measures how much the surface faces the camera (1.0 = head-on,
  0.0 = edge-on)
- `pow(1.0 - NdotV, exponent)` is 0 at center, 1 at edges
- `mix(low, high, fresnel)` interpolates between translucent (center) and
  opaque (edges)

```
  Looking at a glass polyhedron face:

       Edge (opaque)        Center (translucent)        Edge (opaque)
  ▓▓▓▓▓▓▒▒▒▒░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░▒▒▒▒▓▓▓▓▓▓

  Fresnel:  1.0   0.7   0.3   0.1   0.0   0.1   0.3   0.7   1.0
  Alpha:    high  ───── decreasing ─────  low  ───── increasing ────  high
```

The `uFresnelExp` parameter (default 2.2) controls how quickly the transition
happens. Higher values concentrate opacity more at the edges, making the
center more see-through — like thinner glass.

---

## Classic vs Remastered Comparison

| Aspect | Classic (OR-indexed) | Remastered (alpha blending) |
|--------|---------------------|---------------------------|
| Transparency method | Bitwise OR on palette indices | Hardware `SRC_ALPHA / ONE_MINUS_SRC_ALPHA` |
| Per-pixel math | None (palette lookup only) | Full RGBA blend per fragment |
| Draw order | Does not matter (OR is commutative) | Must sort back-to-front |
| Transparency layers | 1 (3-bit background) | Unlimited |
| Viewing-angle variation | None (constant per face) | Fresnel: edges opaque, centers clear |
| Colour depth | 6-bit per channel (VGA DAC) | 8-bit per channel (RGBA8 FBO) |

---

**Next:** [Layer 5 — Phong Lighting](05-phong-lighting.md)
