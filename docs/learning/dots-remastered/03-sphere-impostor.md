# Layer 3 — The Sphere Impostor

**Source:** `src/effects/dots/effect.remastered.js`, lines 21–121 (SPHERE_VERT, SPHERE_FRAG)
**Concepts:** signed distance fields, surface normals, Phong lighting, HSL colour, discard

---

## What This Layer Covers

The dots look like 3D spheres — smooth, shaded, with shiny highlights. But they
are not 3D meshes with hundreds of triangles. Each "sphere" is a flat 2-triangle
quad with a clever fragment shader that fakes 3D. This technique is called a
**sphere impostor** (or **billboard sphere**).

This is arguably the single most valuable technique in the entire effect. It
appears everywhere: molecular visualisation, particle systems, astronomical
renderers, VFX.

---

## The Vertex Shader — Positioning and Sizing Each Quad

```glsl
#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuadPos;       // quad corner: (-1,-1) to (1,1)
layout(location = 1) in vec3 aInstancePos;    // x=ndcX, y=ndcY, z=depth

uniform float uDotScale;
uniform float uAspect;

out vec2 vLocalUV;
out float vDepth;

void main() {
  float depth = aInstancePos.z;
  if (depth <= 0.0) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);   // off-screen: behind clip plane
    vLocalUV = vec2(0.0);
    vDepth = 0.0;
    return;
  }

  float radius = uDotScale * 450.0 / depth;     // smaller when farther away
  vec2 offset;
  offset.x = aQuadPos.x * radius / uAspect;     // correct for aspect ratio
  offset.y = aQuadPos.y * radius;

  vec2 center = aInstancePos.xy;                 // screen position (NDC)
  float zNdc = 2.0 * clamp((depth - 2000.0) / 18000.0, 0.0, 1.0) - 1.0;

  gl_Position = vec4(center + offset, zNdc, 1.0);
  vLocalUV = aQuadPos;                           // pass quad UV to fragment shader
  vDepth = depth;
}
```

Key points:

- **Depth culling:** dots with `depth <= 0` are placed behind the camera.
- **Size from depth:** `radius = 450 / depth` makes far dots smaller (perspective).
- **Aspect ratio correction:** dividing x by aspect ratio prevents stretching
  on non-square screens.
- **`vLocalUV`** passes the quad's local coordinates (-1..+1 in each axis) to
  the fragment shader. This is the "canvas" the impostor will paint on.

---

## The Fragment Shader — Faking a Sphere

This is where the magic happens. We will walk through it line by line.

### Step 1: Discard pixels outside the circle

```glsl
float dist2 = dot(vLocalUV, vLocalUV);   // x² + y²
if (dist2 > 1.0) discard;                // outside unit circle → invisible
```

`dot(v, v)` computes `x*x + y*y` — the squared distance from the center of
the quad. If it is greater than 1.0, the pixel is outside the unit circle and
gets thrown away. This turns our square quad into a circle.

**What is `discard`?** It tells the GPU: "do not write this pixel to the
framebuffer at all." It is as if the pixel does not exist. This is how the
quad's corners become transparent.

### Step 2: Reconstruct the sphere's surface normal

```glsl
vec3 N = vec3(vLocalUV, sqrt(1.0 - dist2));
```

This is the key insight of the entire technique. Here is the intuition:

Imagine a sphere of radius 1 sitting on a table, viewed from directly in
front. At the center of the sphere, the surface points straight at you
(normal = 0, 0, 1). At the edges, the surface curves away.

For any point (x, y) on the visible face of a unit sphere, the z-component of
the surface normal is determined by the sphere equation:

```
x² + y² + z² = 1
z = sqrt(1 - x² - y²)
```

Since `dist2 = x² + y²`, we get `z = sqrt(1 - dist2)`. Combined with x and y,
that gives us a perfect surface normal `N = (x, y, z)` — the direction the
sphere's surface faces at this pixel.

```
       Top view of the quad:

    (-1,1)-----(1,1)
      |    .---.    |
      |   /     \   |     Pixels inside the circle get normals.
      |  | (0,0) |  |     Pixels in the corners are discarded.
      |   \     /   |
      |    '---'    |
    (-1,-1)---(1,-1)

       Side view of the reconstructed normals:

              N=(0,0,1)     ← center: points straight at camera
             /         \
        N=(-0.7,0,0.7)  N=(0.7,0,0.7)    ← edges: point sideways
           |             |
           ┗━━━━━━━━━━━━━┛   ← the flat quad
```

### Step 3: Phong lighting

With a surface normal, we can light the sphere realistically.

```glsl
vec3 L = normalize(vec3(0.4, 0.8, 0.5));    // light direction
vec3 V = vec3(0.0, 0.0, 1.0);               // view direction (looking at screen)

float diff = max(dot(N, L), 0.0);           // diffuse: how much surface faces light
vec3 H = normalize(L + V);                  // half-vector (between light and view)
float spec = pow(max(dot(N, H), 0.0), specPow);  // specular highlight
```

**Diffuse lighting** is the dot product between the surface normal and the
light direction. When the surface faces the light directly, `dot(N, L) = 1`
(fully lit). When it faces away, `dot(N, L) < 0` (in shadow, clamped to 0).

**Specular highlighting** creates the shiny bright spot you see on glossy
objects. The "half-vector" `H` is the direction halfway between the light and
the viewer. When the surface normal aligns with `H`, you get a bright
reflection. The `pow(..., specPow)` controls how tight the highlight is — higher
power = smaller, sharper spot.

**Beat reactivity** modulates the specular:

```glsl
float beatPulse = pow(1.0 - uBeat, 6.0);
float specPow = uSpecularPower + beatPulse * 16.0;
```

`pow(1.0 - beat, 6.0)` creates a sharp spike at the start of each beat (when
`beat` is near 0) that quickly falls off. This makes the highlights flash
brighter on musical accents.

### Step 4: Depth-based colouring with HSL

```glsl
float depthFactor = clamp(1.0 - vDepth / uDepthRange, 0.15, 1.0);
float lightness = mix(0.15, 0.65, depthFactor);
vec3 baseColor = hsl2rgb(uHue, uSaturation, lightness);
```

Instead of the classic's 16 discrete colour levels, the remastered uses smooth
continuous colouring. The HSL colour model is used:

- **Hue** (default 185 = cyan) — the colour on the colour wheel
- **Saturation** (default 0.73) — how vivid the colour is
- **Lightness** — computed from depth. Near dots are brighter, far dots dimmer.

The `hsl2rgb` function (lines 72-85) converts these values to RGB. HSL is
convenient because you can adjust brightness (lightness) without changing the
hue, unlike RGB where making "darker cyan" requires adjusting R, G, and B
proportionally.

### Step 5: Combine and output

```glsl
vec3 ambient = baseColor * 0.2;
vec3 diffuse = baseColor * diff * 0.7;
vec3 specular = vec3(1.0) * spec * (0.5 + beatPulse * 0.3);

vec3 color = ambient + diffuse + specular;
```

The final colour is the sum of three components:

- **Ambient** (20%) — a flat base so nothing is ever pure black
- **Diffuse** (70%) — the main shading from the light source
- **Specular** — white highlights (not tinted by the base colour)

For reflections, the colour is dimmed:

```glsl
if (uIsReflection > 0.5) {
  color *= 0.6;
  alpha *= 0.7;
}
```

Edge softening prevents harsh circle edges:

```glsl
float edgeSoft = 1.0 - smoothstep(0.85, 1.0, dist2);
fragColor = vec4(color * uFade, alpha * uFade * edgeSoft);
```

`smoothstep(0.85, 1.0, dist2)` creates a smooth falloff from 1 to 0 near the
circle edge, making the sphere fade out at its silhouette instead of having a
hard pixel boundary.

---

## Why Not Use Actual 3D Sphere Meshes?

A decent-looking sphere mesh needs at least 100+ triangles. With 512 dots,
that is 50,000+ triangles plus the overhead of a much larger vertex buffer.

Sphere impostors give you:
- **Pixel-perfect roundness** at any zoom level (it is a mathematical circle)
- **2 triangles per sphere** (the quad), regardless of resolution
- **Per-pixel normals** for lighting, better than low-poly mesh normals
- **Trivial billboarding** — quads always face the camera by definition

The only downside is that impostors do not handle occlusion between overlapping
spheres perfectly (the depth buffer sees a flat quad, not a bumped sphere). For
small particles like these dots, this is invisible.

---

**Next:** [Layer 4 — Projection Maths](04-projection.md)
