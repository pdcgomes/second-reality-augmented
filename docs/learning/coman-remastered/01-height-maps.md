# Layer 1 — Dual Height Maps

**Source:** `src/effects/coman/effect.remastered.js` lines 320–334 (decode), `data.js`
**Concepts:** Height fields, signed 16-bit data, R32F GPU textures, z-wave undulation

---

## What This Layer Covers

Before we can render terrain, we need terrain data. The COMAN effect does not
use a triangle mesh. Instead, it stores the landscape as two flat grids of
height values — **height maps**. Each cell holds a number that says "how tall
is the terrain at this point?"

This layer explains:

- What the two 256×128 height maps contain and how they are stored
- How summing them creates richer terrain than either alone
- How a sinusoidal z-wave adds rolling undulation along the view depth
- How the remastered variant uploads them as R32F floating-point GPU textures

---

## What Is a Height Map?

A **height map** (also called a height field) is a 2D grid where each cell
stores a single number: the terrain elevation at that (x, y) coordinate.

```
         Height map (top-down view)
     ┌───┬───┬───┬───┬───┬───┐
     │ 12│ 14│ 18│ 22│ 20│ 16│  ← each cell = terrain height
     ├───┼───┼───┼───┼───┼───┤
     │ 10│ 30│ 45│ 50│ 42│ 20│
     ├───┼───┼───┼───┼───┼───┤
     │  8│ 25│ 60│ 70│ 55│ 18│  ← higher values = taller terrain
     ├───┼───┼───┼───┼───┼───┤
     │  5│ 15│ 35│ 40│ 30│ 12│
     └───┴───┴───┴───┴───┴───┘

     Side view along one row:
         70 ·
         60 ·    ╱╲
         50 ·   ╱  ╲
         40 ·  ╱    ╲
         30 · ╱      ╲
         20 ·╱        ╲
         10 ·          ╲
```

This is the same technique used in Comanche (1992), SimCity terrain, and
countless flight simulators. No vertex buffers, no triangle connectivity —
just a flat array of numbers.

---

## The Two Height Maps: W1DTA and W2DTA

COMAN uses **two** height maps, each 256 columns × 128 rows, stored as
**signed 16-bit integers** (values from −32768 to +32767).

The raw data lives in `data.js` as base64-encoded strings:

```javascript
import { W1DTA_B64, W2DTA_B64 } from './data.js';
```

Each map contains 256 × 128 = 32768 entries, stored as two bytes per entry
(little-endian), for a total of 65536 bytes (64 KB) per map.

### Why signed?

The terrain has both peaks (positive heights) and valleys (negative heights).
Signed values let the landscape dip below the "zero plane," creating a
natural mix of hills and depressions.

### Why two maps instead of one?

Summing two height maps with different spatial frequencies produces terrain
that is more complex than either map alone — similar to how mixing two
musical notes creates a richer sound than either in isolation.

```
  wave1[x]         wave2[y]         wave1[x] + wave2[y]
    ╱╲                ╱╲╱╲            ╱╲  ╱╲
   ╱  ╲              ╱    ╲          ╱  ╲╱  ╲╱╲
  ╱    ╲            ╱      ╲        ╱          ╲
 ╱      ╲          ╱        ╲      ╱            ╲
   smooth          higher         richer, more
   rolling         frequency      varied terrain
```

The classic code reads them with integer indexing:

```javascript
wave1[(xw >> 1) & 32767] + wave2[(yw >> 1) & 32767]
```

The `>> 1` halves the coordinate (stepping by 2), and `& 32767` wraps around
the 32768-entry array, creating a seamless tiling landscape.

---

## Decoding: From Base64 to Float32

The remastered variant decodes each height map into a **Float32Array** and
uploads it as an R32F GPU texture:

```javascript
function decodeHeightMap(gl, b64) {
  const raw = b64ToUint8(b64);
  const f32 = new Float32Array(256 * 128);
  for (let i = 0; i < 256 * 128; i++) {
    f32[i] = ((raw[i * 2] | (raw[i * 2 + 1] << 8)) << 16 >> 16);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 256, 128, 0,
                gl.RED, gl.FLOAT, f32);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return tex;
}
```

### The bit-twiddling decode

```javascript
((raw[i * 2] | (raw[i * 2 + 1] << 8)) << 16 >> 16)
```

Step by step:

1. `raw[i*2]` — low byte, `raw[i*2+1]` — high byte (little-endian)
2. `low | (high << 8)` — combine into a 16-bit unsigned value (0–65535)
3. `<< 16 >> 16` — **sign extension trick**: shift left to bit 31, then
   arithmetic-shift right to restore sign. This converts an unsigned 16-bit
   value into a signed 32-bit integer (−32768 to +32767).

The result is cast to `Float32Array`, giving us floating-point heights that
the GPU shader can read directly.

### Why R32F?

**R32F** is a single-channel 32-bit floating-point texture format. Each texel
stores one float. This preserves the full signed range without clamping to
0–1 as a RGBA8 texture would. The shader reads heights with `texelFetch()`
and gets the exact floating-point value.

The texture uses `gl.NEAREST` filtering because the shader does its own
manual bilinear interpolation (see Layer 4).

---

## The Z-Wave: Sinusoidal Undulation

After sampling both height maps, a **z-wave** offset is added based on ray
depth. This creates rolling hills that undulate along the viewing direction:

Classic (precomputed integer table):

```javascript
const zwave = new Int32Array(192);
for (let i = 0; i < 192; i++)
  zwave[i] = Math.trunc(16.0 * Math.sin(i * Math.PI * 2.0 * 3.0 / 192));
```

Remastered (computed in the shader per fragment):

```glsl
rawH += uZWaveAmp * sin(float(j) * PI * 2.0 * uZWaveFreq / float(BAIL));
```

The z-wave adds `amplitude × sin(step × 2π × frequency / totalSteps)`. With
the default values of amplitude=16 and frequency=3, this produces 3 complete
sine cycles across the ray depth — three rolling ridges that ripple away from
the camera.

```
  Without z-wave:         With z-wave (3 cycles):
  ╱╲    ╱╲    ╱╲          ╱╲  ╱╲╱╲  ╱╲╱╲  ╱╲
 ╱  ╲  ╱  ╲  ╱  ╲        ╱  ╲╱    ╲╱    ╲╱  ╲
╱    ╲╱    ╲╱    ╲       ╱                    ╲
  flat terrain data        + rolling undulation
```

The remastered variant exposes both amplitude and frequency as editor
parameters, letting you tune the undulation in real time.

---

## Combined Height Formula

The final terrain height at each ray step `j` is:

```
terrainHeight = wave1[xw] + wave2[yw] + zwave(j) − 240
```

The constant `−240` shifts the entire terrain downward so the camera flies
above most of the landscape. Without it, the terrain would fill the screen
and there would be no visible horizon.

In the remastered shader, this becomes:

```glsl
float rawH = sampleWave(uWave1, xw) + sampleWave(uWave2, yw);
rawH += uZWaveAmp * sin(float(j) * PI * 2.0 * uZWaveFreq / float(BAIL));
rawH -= 240.0;
float h = rawH * uTerrainScale;
```

The additional `uTerrainScale` multiplier (default 1.0, range 0.3–3.0) lets
the editor exaggerate or flatten the terrain.

---

## Texture Layout on the GPU

The 256×128 height maps are stored as 2D textures, but the shader treats
them as **1D arrays** mapped onto a 2D grid:

```
  1D index:     0    1    2   ...  255  256  257  ...  32767
                 ↓    ↓    ↓        ↓    ↓    ↓         ↓
  2D texel:   (0,0)(1,0)(2,0)...(255,0)(0,1)(1,1)...(255,127)

  Column (x) = index & 255       (low 8 bits)
  Row    (y) = (index >> 8) & 127 (next 7 bits)
```

The shader reconstructs this mapping in `sampleWave()`:

```glsl
float v0 = texelFetch(tex, ivec2(i0 & 255, (i0 >> 8) & 127), 0).r;
```

This lets the shader index the height map as a wrapping 1D array while the
data physically lives in a 2D texture — matching the classic code's flat
array access pattern.

---

## Key Takeaways

- **Height maps** store terrain as a 2D grid of elevation values — no
  vertices, no triangles
- **Two maps summed** produce richer terrain than one, like mixing harmonics
- **Signed 16-bit** values allow both peaks and valleys
- **R32F textures** preserve the full signed float range on the GPU
- **Z-wave undulation** adds rolling ridges along the depth axis
- The `−240` offset places the camera above the landscape

---

**Next:** [Layer 2 — Column Raymarching](02-column-raymarching.md)
