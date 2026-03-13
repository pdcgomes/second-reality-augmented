# Layer 4 — GPU Rendering

**Source:** `src/effects/water/effect.remastered.js` (831 lines)
**Concepts:** raymarching, signed distance functions, Fresnel reflections, bloom pipeline

---

## What This Layer Covers

- How **raymarching** traces rays through a procedural 3D scene entirely in a
  fragment shader — no mesh geometry at all
- How **signed distance functions (SDFs)** define chrome spheres and a water
  surface
- How the **sword texture** is composited as an oriented billboard plane
- How **Fresnel reflections** and **Blinn-Phong lighting** recreate the chrome look
- How a **dual-tier bloom pipeline** adds glow and beat reactivity

---

## The Rendering Architecture

The remastered variant uses four shader programs, all driven by a fullscreen
quad (no 3D geometry). The scene is entirely computed in the fragment shader:

```
  Pass 1: Raymarched scene → sceneFBO (full resolution)
  Pass 2: Bloom extract    → bloomFBO1 (half resolution)
  Pass 3: Gaussian blur    → ping-pong at half + quarter resolution
  Pass 4: Composite        → screen (scene + tight bloom + wide bloom)
```

```
  ┌──────────────┐
  │ SCENE_FRAG   │──→ sceneFBO (full res)
  │ raymarching  │        │
  └──────────────┘        ├──→ BLOOM_EXTRACT ──→ bloomFBO1 (half res)
                          │                          │
                          │    ┌─────────────────────┘
                          │    │
                          │    ├──→ BLUR × 3 (H+V) ──→ tight bloom (half)
                          │    │
                          │    └──→ downsample + BLUR × 3 ──→ wide bloom (quarter)
                          │
                          └──→ COMPOSITE (scene + tight + wide + scanlines)
                                    │
                                    ▼
                                  screen
```

---

## Raymarching: Walking Rays Through SDFs

Traditional rendering uses triangles. Raymarching uses **signed distance
functions** — mathematical formulas that return the distance from any point to
the nearest surface. A ray is advanced step-by-step until it gets close enough
to a surface.

```glsl
float march(vec3 ro, vec3 rd, out int objId) {
  float t = 0.0;
  objId = -1;
  for (int i = 0; i < MAX_STEPS; i++) {   // up to 80 steps
    vec3 p = ro + rd * t;
    float d = sceneSDF(p);                 // distance to nearest surface
    if (d < SURF_DIST) {                   // close enough? → hit
      objId = hitObject(p);
      return t;
    }
    if (t > MAX_DIST) break;               // too far? → miss
    t += d;                                // advance by the safe distance
  }
  return -1.0;                             // no hit
}
```

The key insight: `sceneSDF(p)` returns the **minimum distance** to any surface.
This means it is always safe to advance by that distance — you cannot overshoot.
The algorithm converges on the surface like a ball rolling downhill.

```
  Ray marching in 2D cross-section:

  Camera ●─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─→ ray direction
         │
    Step 0: d=4.2  ○─────────┐
         │         ·         │ radius = distance to nearest surface
    Step 1: d=2.1  ·  ○──┐   │
         │         ·  ·   │   │       ╭─────╮
    Step 2: d=0.8  ·  · ○─┐  │      ╱ sphere ╲
         │         ·  · · │  │     │           │
    Step 3: d=0.03 ·  · · ●  │     │           │
         │         ·  · ·    │      ╲         ╱
                              │       ╰─────╯
                              │
```

---

## The Scene SDF

The scene is the **union** (minimum) of two surface types:

```glsl
float sceneSDF(vec3 p) {
  float water = p.y - rippleHeight(p.xz);   // water plane with ripples
  float d = water;
  for (int i = 0; i < 3; i++) {
    d = min(d, sdSphere(p, spherePos[i], SPHERE_BASE[i].w));
  }
  return d;
}
```

- **Water**: a horizontal plane at y=0, displaced by the `rippleHeight()`
  function. Conceptually: `y = ripple(x, z)`.
- **Spheres**: three standard sphere SDFs.

The `min()` combines them — a ray hits whichever surface is closest.

---

## Water Ripples

Each sphere generates concentric ripples on the water surface. The ripple
function sums contributions from all three spheres plus ambient waves:

```glsl
float rippleHeight(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    float dist = length(xz - spherePos[i].xz);
    float proximity = max(0.0,
      1.0 - (spherePos[i].y - SPHERE_BASE[i].w * 0.3) * 0.8);
    float wave = sin(dist * uRippleFreq - uTime * uRippleSpeed
                     + float(i) * 1.5)
               + 0.5 * sin(dist * uRippleFreq * 1.7
                           - uTime * uRippleSpeed * 1.3
                           + float(i) * 2.7);
    h += wave * uRippleAmp * proximity / (1.0 + dist * 1.5);
  }
  // ... ambient waves and sword wake omitted
  return h;
}
```

The formula for each sphere's contribution:

```
  wave = sin(|xz - sphere.xz| × freq - time × speed + phase)
       + 0.5 × sin(|xz - sphere.xz| × freq × 1.7 - time × speed × 1.3 + phase₂)

  contribution = wave × amplitude × proximity / (1 + distance × damping)
```

Two overlapping sine waves at different frequencies (`freq` and `freq × 1.7`)
create a more natural, less uniform ripple pattern. The `proximity` term weakens
ripples when a sphere is high above the water. The `1 / (1 + dist)` damping
makes ripples fade with distance — just like real water waves.

---

## The Sword Billboard

The remastered sword is not a POS-table remap. It is an **oriented plane** in
3D space — a billboard that the camera ray can intersect analytically:

```glsl
float hitSword(vec3 ro, vec3 rd, out vec3 outCol) {
  float denom = dot(rd, swordN);             // ray vs plane normal
  if (abs(denom) < 0.0001) return -1.0;      // parallel → miss
  float t = dot(swordOrigin - ro, swordN) / denom;
  if (t <= 0.001) return -1.0;               // behind camera

  vec3 p = ro + rd * t;
  vec3 rel = p - swordOrigin;
  float lu = dot(rel, swordU);               // local U coordinate
  float lv = dot(rel, swordV);               // local V coordinate

  // Bounds check
  if (abs(lu) > swordHalfW) return -1.0;
  if (lv < swordBottom || lv > swordBottom + swordH) return -1.0;

  // Sample the sword texture with scroll offset
  float scrollNorm = uScrollOffset / float(FONT_W);
  float texU = scrollNorm * 1.3 + 0.25 - localU;
  vec4 s = texture(uSwordTex, vec2(texU, v));

  // Dark pixels are transparent
  float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
  if (lum < 0.015) return -1.0;

  outCol = s.rgb * uSwordBrightness;
  return t;
}
```

The sword plane has full orientation controls — pitch, yaw, roll, and tilt —
built from rotation matrices in `computeState()`. It rises continuously
throughout the clip via `swordOrigin.y += uTime * 0.12`.

---

## Chrome Lighting Model

Chrome spheres use a multi-component lighting model:

```
  Final colour = mix(lit, lit + reflection, fresnel)
```

Where `lit` combines:

```
  lit = ambient + diffuse + specular + glow + rim
      = base×0.15 + base×(diff1×0.6 + diff2×0.2) + spec + glow + rim
```

```
  ┌──────────┐     ┌──────────┐     ┌──────────┐
  │ Ambient  │     │ Diffuse  │     │ Specular │
  │ base×0.15│  +  │ Lambertian  +  │Blinn-Phong│
  └──────────┘     │ 2 lights │     │ tight +  │
                   └──────────┘     │ broad    │
                                    └──────────┘
        │                │                │
        └───────┬────────┘                │
                │   ┌─────────────────────┘
                ▼   ▼
            lit colour
                │
                ├──→ mix with reflection × Fresnel
                │
                ▼
          final sphere colour
```

The **Fresnel term** controls how reflective the surface is based on viewing
angle. At grazing angles (looking across the sphere's edge), reflectivity
approaches 1.0. At head-on angles, it drops to 0.15:

```glsl
float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelExp);
fresnel = clamp(fresnel, 0.15, 1.0);
```

---

## Reflection Rays

After a ray hits a chrome sphere, a **reflection ray** is cast to find what the
sphere reflects. The reflection checks for:

1. **Sword billboard** (analytical ray-plane intersection)
2. **Water surface** (raymarched)
3. **Other spheres** (raymarched)

```glsl
// Reflected ray: check sword first, then scene
vec3 swordRef;
float swordRT = hitSword(p + N * 0.01, R, swordRef);
int rId;
float rt = march(p + N * 0.01, R, rId);

if (swordRT > 0.0 && (rt < 0.0 || swordRT < rt)) {
  envColor = swordRef;                 // sword is closest reflection
} else if (rt > 0.0 && rId == 0) {
  // ... reflected water with its own reflection of the sword
} else if (rt > 0.0 && rId >= 1) {
  // ... reflected sphere (one-bounce inter-reflection)
}
```

Reflection depth is limited to **one bounce** — a sphere can reflect the sword
or water, but not a sphere reflecting a sphere reflecting the sword. This keeps
the raymarching cost bounded (each pixel does at most 2× the march steps).

---

## Beat Reactivity

Three visual properties pulse with the music beat:

| Effect | Formula | Visual result |
|--------|---------|---------------|
| Sphere bob | `amplitude × (1 + pow(1-beat, 6) × beatScale)` | Spheres bounce higher on beat |
| Specular | `specPow + pow(1-beat, 6) × 32` | Chrome highlights sharpen on beat |
| Bloom | `bloomStr + pow(1-beat, 6) × beatBloom` | Glow intensifies on beat |

The `pow(1 - beat, 6)` curve creates a sharp attack (beat = 0 → pulse = 1)
with a slow exponential decay (beat → 1 → pulse → 0):

```
  Beat pulse curve: pow(1 - beat, 6)

  1.0 │██
      │  ██
      │    ██
  0.5 │      ███
      │         ████
      │             ██████
  0.0 │                   ██████████████████
      └─────────────────────────────────────
      0.0                                1.0
                      beat
```

---

## Bloom Pipeline

The dual-tier bloom creates soft glow around bright areas:

**Step 1 — Extract**: Pixels brighter than `uThreshold` are extracted using
`smoothstep` (soft cutoff, not a hard threshold):

```glsl
float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
```

**Step 2 — Blur**: A 9-tap Gaussian kernel is applied 3 times in each direction
(H, V) for both tight (half-res) and wide (quarter-res) passes:

```
  sceneFBO ──→ extract (half res) ──→ 3×(H blur + V blur) = tight bloom
                      │
                      └──→ extract (quarter res) ──→ 3×(H + V) = wide bloom
```

**Step 3 — Composite**: Scene + weighted bloom + optional scanlines:

```glsl
vec3 color = scene
  + tight * (uBloomTightStr + beatPulse * uBeatBloom)
  + wide  * (uBloomWideStr  + beatPulse * uBeatBloom * 0.6);
float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * PI);
color *= scanline;
```

---

## Colour Remap (Palette Themes)

The remastered supports 13 colour themes via a 3×3 colour remapping matrix:

```glsl
col = clamp(mat3(uColorR, uColorG, uColorB) * shade(...), 0.0, 1.0);
```

The matrix transforms the scene's RGB values. The Classic theme uses the
identity matrix (no change). Other themes remap colours — for example, the
Synthwave theme maps blues to pinks and greens to cyans. The sword texture is
intentionally excluded from the remap to preserve its original palette.

---

## FBO Management

All framebuffers are lazily created and recreated when the canvas resizes:

```javascript
if (sw !== fboW || sh !== fboH) {
  deleteFBO(gl, sceneFBO);
  // ... delete all FBOs ...
  sceneFBO     = createFBO(gl, sw, sh);         // full resolution
  bloomFBO1    = createFBO(gl, sw >> 1, sh >> 1); // half resolution
  bloomFBO2    = createFBO(gl, sw >> 1, sh >> 1); // half (ping-pong)
  bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2); // quarter resolution
  bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2); // quarter (ping-pong)
  fboW = sw; fboH = sh;
}
```

| FBO | Resolution | Purpose |
|-----|-----------|---------|
| sceneFBO | Full | Raymarched scene output |
| bloomFBO1/2 | Half | Tight bloom ping-pong blur |
| bloomWideFBO1/2 | Quarter | Wide bloom ping-pong blur |

Total GPU resources: 4 shader programs, 6 textures (sword + 5 FBO attachments),
5 framebuffers. All cleaned up in `destroy()`.

---

**Previous:** [Layer 3 — Image Compositing](03-image-compositing.md)
**Next:** [Layer 5 — Learning Path](05-learning-path.md)
