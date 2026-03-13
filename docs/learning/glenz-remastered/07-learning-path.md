# Layer 7 — Learning Path

**Concepts:** hands-on experimentation, 3D graphics modification, material tuning

---

## What This Layer Covers

Now that you understand the full GLENZ pipeline — Tetrakis geometry, animation
state machine, vertex pipeline, transparency, Phong lighting, and bloom
compositing — this layer provides hands-on exercises to deepen your
understanding.

---

## Exercise 1: Swap in a Different Polyhedron

**Difficulty:** Medium
**File:** `src/effects/glenzVectors/data.js`

Replace the Tetrakis hexahedron vertex and face data with a different solid:

- **Icosahedron** (12 vertices, 20 faces): more spherical, fewer flat planes
- **Dodecahedron** (20 vertices, 12 pentagonal faces → 36 triangles)
- **Octahedron** (6 vertices, 8 faces): simpler, more angular

You need to provide:
1. Vertex positions as `[x, y, z]` arrays
2. Face definitions as `[colorIndex, v0, v1, v2]` arrays
3. The vertex pipeline handles normal computation automatically from the face data

Start with the octahedron — it is the simplest to define by hand:
```javascript
export const G1_VERTS = [
  [0, 1, 0], [1, 0, 0], [0, 0, 1],
  [-1, 0, 0], [0, 0, -1], [0, -1, 0],
];
```

---

## Exercise 2: Modify the Jelly Physics

**Difficulty:** Medium
**File:** `src/effects/glenzVectors/animation.js`

The jelly deformation uses a spring-damper system. Try changing:

- **Spring stiffness**: makes the jelly bounce faster or slower
- **Damping ratio**: higher damping = less wobble, lower = more oscillation
- **Deformation asymmetry**: scale x/y/z differently for squash-and-stretch

Watch how stiffer springs make the polyhedron feel like hard rubber, while
softer springs create a gelatin-like wobble.

---

## Exercise 3: Change the Fresnel Exponent

**Difficulty:** Easy
**File:** Editor UI or `src/effects/glenzVectors/effect.remastered.js`

The Fresnel exponent controls how the glass transparency varies with viewing
angle:

- **Low exponent (1.0)**: faces are almost equally transparent everywhere —
  the object looks like coloured cellophane
- **Default (2.2)**: moderate edge brightening — convincing glass
- **High exponent (5.0+)**: only extreme grazing angles are opaque — the
  object appears nearly invisible from the front, with bright edges

Use the editor's `fresnelExp` parameter to experiment in real-time, or
modify the default value in the source code.

---

## Exercise 4: Add Environment Mapping

**Difficulty:** Hard
**File:** `src/effects/glenzVectors/effect.remastered.js`, MESH_FRAG

Add a reflection of the environment to the glass surface:

1. Compute the reflection vector: `vec3 R = reflect(-V, N);`
2. Use R to sample a cubemap or spherical environment texture
3. Mix the environment colour with the existing lighting using the Fresnel
   factor (more reflection at grazing angles)

You could use the checkerboard texture as a simple environment map, or
generate a procedural gradient sky.

---

## Exercise 5: Experiment with Specular Power

**Difficulty:** Easy
**File:** Editor UI

The specular power controls the size of the highlight:

- **Low (10)**: broad, soft highlight — the surface looks matte/waxy
- **Default (75)**: tight, focused highlight — polished glass
- **Very high (300)**: pinpoint highlight — mirror-like

Notice how beat reactivity adds up to 32 to the specular power on each
beat, making the highlight sharper momentarily. Try increasing `beatScale`
alongside high specular power for dramatic flashes.

---

## Exercise 6: Modify the Lighting Direction

**Difficulty:** Easy
**File:** `src/effects/glenzVectors/effect.remastered.js`, MESH_FRAG line 68

The light direction is hardcoded:

```glsl
vec3 L = normalize(vec3(0.5, 0.8, 0.6));
```

Try different directions:
- `(0, 1, 0)` — directly above (dramatic top-down lighting)
- `(0, 0, 1)` — from behind the camera (flat, even lighting)
- `(-1, -0.5, 0.3)` — from the lower left (theatrical side lighting)

You could also make the light direction time-dependent by passing a uniform
and computing it from the frame number in JavaScript.

---

## Exercise 7: Create a Palette Theme

**Difficulty:** Medium
**File:** `src/effects/glenzVectors/effect.remastered.js`, PALETTES array

Add a new palette by defining colour mappings for both Glenz1 and Glenz2:

```javascript
{
  name: 'Crystal',
  g1: { front: [0.9, 0.95, 1.0, 0.5], back: [0.7, 0.8, 0.95, 0.3] },
  g2: { front: [0.95, 0.85, 1.0, 0.4], back: [0.8, 0.7, 0.9, 0.25] },
}
```

Each colour is `[r, g, b, alpha]`. The alpha controls base transparency
before Fresnel modification. Try a theme with:

- High alpha (0.8+) for opaque stained-glass look
- Very low alpha (0.1) for nearly invisible ghost objects
- Complementary colours between Glenz1 and Glenz2

---

## Further Reading

- The classic effect spec: `docs/effects/06-glenz-3d.md`
- The remastered spec: `docs/effects/06-glenz-3d-remastered.md`
- LearnOpenGL Blinn-Phong: [learnopengl.com/Advanced-Lighting/Advanced-Lighting](https://learnopengl.com/Advanced-Lighting/Advanced-Lighting)
- Fresnel effect explained: [marmoset.co/posts/basic-theory-of-physically-based-rendering](https://marmoset.co/posts/basic-theory-of-physically-based-rendering/)
- Tetrakis hexahedron geometry: [en.wikipedia.org/wiki/Tetrakis_hexahedron](https://en.wikipedia.org/wiki/Tetrakis_hexahedron)
