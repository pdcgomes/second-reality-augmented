# Layer 2 — Column Raymarching

**Source:** `src/effects/coman/effect.js` lines 198–242 (`docol` function)
**Concepts:** VoxelSpace rendering, front-to-back occlusion, painter's algorithm inversion, bail-and-double optimisation

---

## What This Layer Covers

VoxelSpace terrain is not rendered like a polygon mesh. There is no Z-buffer,
no triangle rasteriser, no vertex shader. Instead, each screen column is
rendered independently by marching a ray forward through the height map and
painting vertical strips of colour from the **bottom of the screen upward**.

This layer explains:

- The per-column raymarching loop and how it produces terrain imagery
- Front-to-back occlusion — how closer terrain hides farther terrain
- The "painter from front" approach that inverts the usual back-to-front rule
- The bail-and-double optimisation that doubles step size at distance

---

## The Core Idea

Imagine standing on a hill and looking at the horizon. Close terrain fills
the bottom of your view. Distant terrain appears higher on the screen. The
VoxelSpace algorithm exploits this by scanning each column from the bottom
of the screen upward, drawing terrain strips as it marches the ray forward:

```
  Screen column (one of 160):

  row 0   ┌─────┐  ← top (sky)
           │     │
           │ sky │
           │     │
  row 70   │─────│  ← horizon
           │ far │
           │ mid │  ← terrain fills upward from bottom
           │near │
  row 199  └─────┘  ← bottom (closest terrain)
```

Each ray starts at the camera and steps forward. At each step, the algorithm
checks if the terrain is taller than what has been drawn so far. If yes, it
fills pixels upward until the ray "catches up."

---

## The `docol` Function (Classic)

The classic renderer calls `docol` once per screen column (160 times per
frame). Here is the core loop, annotated:

```javascript
function docol(fb, xw, yw, xa, ya, screenX, colTop, colBot) {
  let rayHeight = 0;
  let rayInc = (-(200 - HORIZONY) * 2560) / 65536;  // initial slope

  let dest = colBot;                 // start at bottom of visible area

  for (let j = 0; j < BAIL && dest >= destEnd; j++) {
    if (j === BAILHALVE) {           // step 64: double the step size
      xa += xa;
      ya += ya;
    }
    xw += xa;                        // advance ray in world space
    yw += ya;

    // Sample terrain height from both height maps + z-wave
    const terrainH = wave1[(xw >> 1) & 32767]
                   + wave2[(yw >> 1) & 32767]
                   + (zwave[j] - 240);

    if (rayHeight < terrainH) {
      // Terrain is taller than ray — fill pixels upward
      const ci = ((terrainH + 140 - Math.floor(j / 8)) & 0xFF) >> 1;
      const l = (j * 2560) / 65536;           // perspective factor

      while (rayHeight < terrainH && dest >= destEnd) {
        rayHeight += l;
        fb[dest * W + screenX] = ci;          // write pixel
        fb[dest * W + screenX + 1] = ci;      // pixel-double
        dest--;                                // move up one row
        rayInc += 2560 / 65536;
      }
    }

    rayHeight += rayInc;
    if (j === BAILHALVE) rayHeight += rayInc;  // extra step at halve point
  }
}
```

---

## Front-to-Back Occlusion

The standard **painter's algorithm** draws back-to-front: distant objects
first, close objects on top. VoxelSpace does the opposite — it draws
**front-to-back** and tracks the highest pixel already drawn.

```
  Step 1 (j=0, closest):
  ┌─────────┐
  │         │
  │         │
  │         │
  │ █ drawn │  ← close terrain fills bottom rows
  └─────────┘

  Step 10 (j=10, further):
  ┌─────────┐
  │         │
  │ █ new   │  ← only pixels ABOVE already-drawn area
  │ ░ skip  │  ← already filled by step 1
  │ ░ skip  │
  └─────────┘
```

The variable `dest` tracks the highest (lowest row number) pixel drawn so
far. Each new terrain strip can only fill rows above `dest`. This is why the
inner `while` loop moves `dest` upward (decrements it) — once a row is
claimed by closer terrain, farther terrain cannot overwrite it.

This approach is more efficient than back-to-front because distant terrain
that would be hidden by closer terrain is never drawn at all. The `dest`
pointer only moves upward, giving us natural occlusion culling for free.

---

## Ray Height and Perspective

The ray does not travel in a straight line through the height map. It
follows a curved path dictated by perspective projection:

```
  Side view (camera looking right):

  Camera ──→  ╱ ray path curves downward (perspective)
              ╱
             ╱   ← rayHeight increases as we project downward
            ╱
  ─────────╱──────── terrain surface
```

Two variables track the ray's projected height:

- **`rayHeight`** — the accumulated projected height of the ray at the
  current step. This increases each step by `rayInc`.
- **`rayInc`** — the per-step increment, which itself grows as each pixel
  row is consumed. This simulates perspective foreshortening: near rows
  span large angular changes, far rows span small ones.

The perspective constant is `2560 / 65536 ≈ 0.039`. This comes from the
original Comanche-style projection: `2560` is the fixed-point perspective
factor, `65536` is the 16-bit fixed-point denominator (1 << 16).

```
  l = j × 2560 / 65536     (perspective at step j)

  j=0:   l = 0.000          close — steep projection
  j=10:  l = 0.391
  j=64:  l = 2.500          mid distance
  j=128: l = 5.000          far — shallow projection
```

---

## The Bail-and-Double Optimisation

At step 64 (the `BAILHALVE` constant), the ray step size **doubles**:

```javascript
if (j === BAILHALVE) {
  xa += xa;   // double x step
  ya += ya;   // double y step
}
```

Far terrain has less visual detail (it occupies fewer pixels), so there is
no point sampling it at the same fine resolution as near terrain. Doubling
the step size after 64 iterations means the ray covers twice as much ground
per step in the far field:

```
  Near (steps 0–63):        Far (steps 64–191):
  ┃·┃·┃·┃·┃·┃·┃·┃·┃        ┃··┃··┃··┃··┃··┃··┃
  fine steps (1× spacing)   coarse steps (2× spacing)
```

This is a classic LOD (Level of Detail) technique: spend computational
budget where it matters most (close up) and economise where the eye cannot
tell the difference (far away).

The total march is 192 steps (`BAIL`), but the first 64 are fine and the
remaining 128 cover the same ground as 64 coarse steps — effectively
scanning 64 + 64 = 128 "logical" depth slices.

---

## The Colour Index

Each terrain pixel gets a colour from a 128-entry procedural palette. The
index is computed from terrain height and ray distance:

```javascript
const ci = ((terrainH + 140 - Math.floor(j / 8)) & 0xFF) >> 1;
```

Breaking this down:

1. `terrainH + 140` — shift into positive range (terrain heights can be
   negative)
2. `- Math.floor(j / 8)` — distant terrain gets a lower index, creating
   natural **distance darkening** (a primitive form of fog)
3. `& 0xFF` — clamp to 0–255
4. `>> 1` — divide by 2, mapping to the 128-entry palette

The result: peaks are bright (high index), valleys and distant terrain are
dark (low index). This produces the illusion of atmospheric depth without
any explicit fog calculation.

---

## Column Rendering Summary

```
  For each of 160 columns:
  ┌────────────────────────────────────────────────────┐
  │ 1. Compute ray direction from camera rotation      │
  │ 2. Set dest = bottom of screen                     │
  │ 3. For j = 0 to 191 (BAIL):                       │
  │    a. If j == 64: double step size                 │
  │    b. Advance ray (xw += xa, yw += ya)             │
  │    c. Sample terrain height from both maps + zwave │
  │    d. If terrain > ray:                            │
  │       - Compute colour from height + distance      │
  │       - Fill pixels upward until ray catches up    │
  │       - Advance dest pointer                       │
  │    e. Advance rayHeight by rayInc                  │
  │ 4. Fill remaining rows above dest with black (sky) │
  └────────────────────────────────────────────────────┘
```

Each column is completely independent — no data flows between columns. This
made VoxelSpace easy to parallelise on 1990s CPUs (unrolled assembly per
column) and is what makes the GPU port natural: each fragment shader
invocation handles one "column" independently.

---

## Key Takeaways

- **VoxelSpace renders columns, not triangles** — one ray per screen column
  marches through the height field
- **Front-to-back drawing** with a rising `dest` pointer provides natural
  occlusion without a Z-buffer
- **Perspective projection** is encoded in `rayHeight`/`rayInc`, not in a
  matrix transform
- **Bail-and-double** at step 64 halves the sampling cost for far terrain
  with no visible quality loss
- **Colour index from height + distance** creates implicit fog/atmosphere
- **Column independence** makes the algorithm trivially parallelisable

---

**Previous:** [Layer 1 — Dual Height Maps](01-height-maps.md)
**Next:** [Layer 3 — Camera Path](03-camera-path.md)
