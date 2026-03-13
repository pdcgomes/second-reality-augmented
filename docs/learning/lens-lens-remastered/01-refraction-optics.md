# Layer 1 — Refraction Optics

**Source:** `src/effects/lens/effect.remastered.js` (lines 196–261, SCENE_FRAG)
**Concepts:** Snell's law, index of refraction, sphere normals, displacement from refraction

---

## What This Layer Covers

Before we look at any code, we need to understand the real-world physics being
simulated. This layer answers:

- Why does a glass sphere distort the image behind it?
- What is **Snell's law** and how does it control the bending?
- Why are pixels near the edge of the sphere displaced more than those at the
  center?
- How does a pre-computed displacement map approximate this cheaply?

---

## Light Bending Through Glass

When a ray of light passes from one material into another (air → glass, or
glass → air), it changes direction. This is **refraction**. The amount of
bending depends on the **index of refraction (IOR)** of each material.

```
        AIR (IOR = 1.0)          GLASS (IOR ≈ 1.5)

        incoming ray              refracted ray
             \  θ₁                   /
              \ |                   / θ₂
               \|                  /
   ─────────────●─────────────────
                surface normal
```

**Snell's law** relates the two angles:

```
n₁ · sin(θ₁) = n₂ · sin(θ₂)
```

Where:
- **n₁** = IOR of the first medium (air = 1.0)
- **n₂** = IOR of the second medium (glass ≈ 1.5)
- **θ₁** = angle of the incoming ray relative to the surface normal
- **θ₂** = angle of the refracted ray

When light enters a denser material (n₂ > n₁), it bends **toward** the
normal. When it exits (n₂ < n₁), it bends **away**. A glass sphere bends
light twice — once entering, once exiting — which is what creates the
magnifying/distorting effect you see.

---

## Why a Sphere Distorts More at the Edges

Consider a cross-section of the crystal ball. The **surface normal** at each
point on the sphere points outward from the center:

```
              N (straight up)
              ↑
         ╱────●────╲
       ╱      |      ╲
     ╱  N     |     N  ╲
    ╱  ↗      |      ↖  ╲
   ●─────────────────────●
   ↑                      ↑
   N (sideways)            N (sideways)

   center: normal faces viewer → minimal bending
   edge:   normal is nearly perpendicular → maximum bending
```

At the **center** of the sphere, the normal points straight at the viewer
(parallel to the incoming ray). The angle of incidence θ₁ is nearly zero, so
sin(θ₁) ≈ 0, and Snell's law gives sin(θ₂) ≈ 0 — almost no bending. The
pixel behind the center of the ball shows through with minimal displacement.

At the **edge**, the normal is nearly perpendicular to the viewing direction.
θ₁ is large, sin(θ₁) is large, so the refracted ray bends significantly. The
pixel you see through the edge of the ball actually comes from far away in the
background.

This is the fundamental principle: **displacement increases from center to
edge**, creating the characteristic fisheye/magnification look.

---

## The Sphere Normal

To compute refraction, we need the surface normal at every pixel. For a sphere,
this is straightforward. If we define a unit disc where `d = (fragUV - center) / radius`:

```
r² = d.x² + d.y²
nz = sqrt(1 - r²)
N  = normalize(d.x, d.y, nz)
```

The z component `nz` is derived from the sphere equation: `x² + y² + z² = 1`.
At the center (d = 0), `nz = 1` (normal points straight at viewer). At the
edge (r → 1), `nz → 0` (normal is perpendicular to the view).

---

## GLSL's refract() Built-In

GLSL provides a built-in `refract(I, N, eta)` function that implements Snell's
law directly. The remastered effect uses it like this:

```glsl
vec3 I = vec3(0.0, 0.0, -1.0);           // incoming ray (viewer looks into screen)
vec3 refracted = refract(I, N, 1.0 / uLensIOR);  // eta = n1/n2 = 1.0/1.45
```

The function returns a new direction vector — the refracted ray. Its `.xy`
components tell us how much to shift the background UV lookup:

```glsl
vec2 offset = refracted.xy * (1.0 - nz) * 0.5;
vec2 refUV  = bgUV + offset * vec2(lensRadius.x, -lensRadius.y) * 2.0;
```

The `(1.0 - nz)` factor means the offset is zero at the center and maximum at
the edges — matching the physics we described above.

---

## IOR Values and Their Visual Effect

The **index of refraction** controls how much the image distorts:

| IOR | Material | Visual effect |
|-----|----------|---------------|
| 1.0 | Air (no refraction) | Background shows through undistorted |
| 1.33 | Water | Mild distortion, subtle magnification |
| 1.45 | Default (this effect) | Clear crystal ball look |
| 1.52 | Crown glass | Slightly stronger distortion |
| 2.0+ | Diamond-like | Extreme fisheye, heavy warping |

The editor exposes `lensIOR` as a slider (range 1.0–2.5) so you can experiment
with different values in real time.

---

## Classic vs Remastered Approach

The classic and remastered achieve the same visual concept through completely
different means:

| Aspect | Classic | Remastered |
|--------|---------|------------|
| **How displacement is computed** | Pre-computed lookup tables (EX1–EX4) baked offline | Per-pixel Snell's law in a fragment shader |
| **Resolution** | 320×200 fixed | Any resolution (scales to 4K) |
| **Configurability** | Fixed distortion pattern | Adjustable IOR slider |
| **Cost** | Memory (34 KB of tables) | GPU compute (per-pixel trig) |

The pre-computed tables were necessary in 1993 because a 386/486 CPU could not
afford per-pixel trigonometry at 70 fps. Today's GPUs compute Snell's law for
millions of pixels in under a millisecond.

---

## Key Takeaways

- **Refraction** bends light when it crosses a boundary between materials
- **Snell's law** (`n₁ sin θ₁ = n₂ sin θ₂`) governs the bending angle
- A sphere's surface normal varies from center (facing viewer) to edge
  (perpendicular), creating **increasing displacement toward the edges**
- The classic pre-computed this displacement into lookup tables; the remastered
  computes it per-pixel on the GPU using GLSL's `refract()` built-in

---

**Next:** [Layer 2 — Displacement Map](02-displacement-map.md)
