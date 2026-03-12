# Layer 5 — Reflections

**Source:** `src/effects/dots/effect.remastered.js`, lines 123–174 (GROUND_FRAG), 458–473 (reflection pass)
**Concepts:** planar reflection, Fresnel effect, roughness blur, grid lines

---

## What This Layer Covers

The bottom half of the screen shows a dark, glossy floor with reflections of
the bouncing dots. This layer explains how reflections work and how the ground
shader blends them into the floor surface.

---

## Planar Reflection — The Concept

Real reflections involve tracing light rays bouncing off surfaces. That is
expensive. For a flat (planar) surface like a floor, there is a much cheaper
trick:

1. Compute the **mirror position** of every object by flipping it below the
   floor plane
2. Render those mirrored objects into a texture
3. Map that texture onto the floor

This produces a perfect reflection for any flat surface, at the cost of
rendering the scene twice.

---

## Computing Mirror Positions (CPU)

For each dot, the mirrored position is computed alongside the normal position:

```javascript
const groundScreenY = 0x80000 / bp + 100;        // where the floor is at this depth
const reflScreenY = 2 * groundScreenY - screenY;  // mirror the dot below the floor
const reflNdcY = -(reflScreenY - 100) / 100;

reflectionPosData[i * 3]     = ndcX;         // same X
reflectionPosData[i * 3 + 1] = reflNdcY;     // mirrored Y
reflectionPosData[i * 3 + 2] = bp;           // same depth
```

The mirror formula `2 * ground - position` is intuitive: if the floor is at
screen-Y 150 and the dot is at screen-Y 120 (30 pixels above), the reflection
is at 180 (30 pixels below).

---

## Rendering the Reflection (Pass 1)

The reflection is drawn to its own framebuffer:

```javascript
gl.bindFramebuffer(gl.FRAMEBUFFER, reflectionFBO.fb);
gl.viewport(0, 0, sw, sh);
gl.clearColor(0, 0, 0, 0);             // transparent black background
gl.clear(gl.COLOR_BUFFER_BIT);
gl.enable(gl.BLEND);
gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
gl.bufferSubData(gl.ARRAY_BUFFER, 0, reflectionPosData);   // upload mirrored positions
setSphereUniforms(true);                                     // isReflection = true
gl.bindVertexArray(sphereVAO);
gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAXDOTS);
```

This draws the exact same sphere impostors as the main scene, but:
- Positions are mirrored (flipped below the floor)
- `uIsReflection = 1.0` tells the fragment shader to dim the output (60%
  brightness, 70% alpha)
- The result is stored in `reflectionFBO.tex` — a texture the ground shader
  can sample

---

## The Ground Shader

The ground is drawn as a fullscreen quad. The fragment shader decides what to
show at each pixel.

### Floor region detection

```glsl
if (vUV.y > 0.5) discard;    // top half = sky → nothing
float t = (0.5 - vUV.y) / 0.5;  // 0 at horizon, 1 at bottom edge
```

The floor only exists in the bottom half of the screen. `t` measures how far
"into" the floor you are looking — 0 at the horizon, 1 at the bottom.

### Sampling the reflection texture

```glsl
vec3 refl = texture(uReflectionTex, vUV).rgb;
```

In the simple case, the ground shader just reads the reflection texture at the
same UV coordinate. The mirrored dots are already in the right position because
we computed them that way on the CPU.

### Roughness blur

Real floors are not perfectly smooth. The `uGroundRoughness` parameter adds a
subtle blur to the reflection by sampling nearby texels:

```glsl
if (uGroundRoughness > 0.001) {
  vec2 texel = 1.0 / uResolution;
  float r = uGroundRoughness * 12.0;
  // Sample 9 points in a weighted pattern
  refl += texture(uReflectionTex, vUV + vec2(-r, -r) * texel).rgb * 0.0625;
  refl += texture(uReflectionTex, vUV + vec2( r, -r) * texel).rgb * 0.0625;
  // ... (8 surrounding samples + 1 center sample, weighted to sum to 1.0)
  refl += texture(uReflectionTex, vUV).rgb * 0.25;
}
```

This is a simple 3x3 weighted blur. The weights (0.0625, 0.125, 0.25) form a
small Gaussian kernel. Higher roughness spreads the samples further apart,
creating a blurrier reflection.

### The Fresnel effect

```glsl
float viewAngle = 1.0 - t;
float fresnel = mix(uReflectivity * 0.4, uReflectivity, pow(viewAngle, 2.0));
```

The **Fresnel effect** (pronounced "freh-NEL") describes how reflectivity
changes with viewing angle. When you look straight down at a floor, you mostly
see the floor surface. When you look at a shallow angle (near the horizon),
you see strong reflections.

`viewAngle` is 1.0 at the horizon (shallow angle, high reflection) and 0.0 at
the bottom (steep angle, low reflection). `pow(viewAngle, 2.0)` shapes the
curve. The `mix` function blends between 40% and 100% of the `uReflectivity`
parameter based on this angle.

Real Fresnel equations are more complex (they depend on the material's
refractive index), but this quadratic approximation looks convincing for a demo.

### The base floor colour

```glsl
vec3 baseGround = vec3(0.02, 0.02, 0.025) * uGroundBrightness;
```

A very dark, slightly blue-tinted surface.

### Grid lines

```glsl
float gridX = abs(fract(vUV.x * 40.0) - 0.5);
float gridZ = abs(fract(t * 20.0 / (t + 0.1)) - 0.5);
float lineX = 1.0 - smoothstep(0.0, 0.02, gridX);
float lineZ = 1.0 - smoothstep(0.0, 0.03, gridZ);
float gridLine = max(lineX, lineZ) * 0.08 * uGroundBrightness * (1.0 - t * 0.8);
baseGround += vec3(gridLine * 0.3, gridLine * 0.5, gridLine * 0.6);
```

`fract()` returns the fractional part of a number. Multiplying by 40 and
taking `fract` creates a repeating 0..1 pattern 40 times across the screen.
Subtracting 0.5 and taking `abs` creates a V-shape that is 0 at the grid
line and 0.5 between lines. `smoothstep` turns this into a sharp line.

The Z grid uses a non-linear formula `t * 20 / (t + 0.1)` to make lines
converge toward the horizon (perspective foreshortening).

The grid lines are cyan-tinted (`0.3, 0.5, 0.6`) and fade with distance
(`1 - t * 0.8`) so they do not dominate the far floor.

### Final blend

```glsl
vec3 color = mix(baseGround, refl, fresnel);
float edgeFade = smoothstep(0.0, 0.05, t);
fragColor = vec4(color * uFade, uFade * edgeFade);
```

`mix(base, reflection, fresnel)` blends the floor surface with the reflection
according to the Fresnel factor. The `edgeFade` prevents a hard edge at the
exact horizon line.

---

## Summary

The reflection pipeline in diagram form:

```
CPU: compute mirrored positions (flip Y below ground)
         |
         v
Pass 1: draw mirrored spheres → reflectionFBO texture
         |
         v
Pass 2: ground shader reads reflectionFBO
         + roughness blur
         + Fresnel blending
         + grid lines
         → final floor appearance in msaaFBO
```

---

**Next:** [Layer 6 — Bloom](06-bloom.md)
