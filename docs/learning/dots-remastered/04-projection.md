# Layer 4 — The Projection Maths

**Source:** `src/effects/dots/effect.remastered.js`, lines 407–438
**Concepts:** Y-axis rotation, perspective projection, NDC, fixed-point arithmetic

---

## What This Layer Covers

The simulation gives us 512 dot positions in 3D world space (x, y, z). The GPU
needs 2D screen positions. The remastered effect uses the exact same projection
maths as the original 1993 demo — no view matrices, no projection matrices,
just raw arithmetic.

Understanding this code demystifies what "projection" actually does.

---

## The Full Projection Pipeline

For each dot, three steps happen:

```javascript
for (let i = 0; i < MAXDOTS; i++) {
  const d = sim.dots[i];

  // Step 1: Y-axis rotation
  const bp = Math.floor(((d.z * rotcos - d.x * rotsin) / 0x10000) + 9000);

  // Step 2: Perspective projection
  const a = (d.z * rotsin + d.x * rotcos) / 0x100;
  const screenX = (a + a / 8) / bp + 160;
  const screenY = (d.y * 64) / bp + 100;

  // Step 3: Convert to NDC
  const ndcX = (screenX - 160) / 160;
  const ndcY = -(screenY - 100) / 100;
}
```

Let us unpack each step.

---

## Step 1: Y-Axis Rotation

```javascript
const bp = Math.floor(((d.z * rotcos - d.x * rotsin) / 0x10000) + 9000);
const a  = (d.z * rotsin + d.x * rotcos) / 0x100;
```

This rotates the dot's (x, z) coordinates around the vertical (Y) axis. If you
have done any 2D rotation, this is the same formula — just applied to the x-z
plane instead of x-y.

A 2D rotation by angle θ transforms (x, z) to:

```
new_x = x * cos(θ) + z * sin(θ)
new_z = z * cos(θ) - x * sin(θ)
```

Here, `rotcos` and `rotsin` are the precomputed cos and sin values (from the
simulation). The divisions by `0x10000` and `0x100` are **fixed-point scaling**:

In 1993, floating point was expensive. Demo coders used integers scaled up by
powers of 2. Multiplying two scaled values gives a doubly-scaled result, so
you divide back down. `0x10000 = 65536 = 2^16` and `0x100 = 256 = 2^8`.

The result:
- `bp` = the dot's **depth** after rotation (how far from the camera). The
  `+ 9000` offset ensures this is always positive (needed for perspective
  division).
- `a` = the dot's **horizontal position** after rotation.

---

## Step 2: Perspective Projection

```javascript
const screenX = (a + a / 8) / bp + 160;
const screenY = (d.y * 64) / bp + 100;
```

**Perspective** is the phenomenon where far-away things look smaller. In maths,
it is just division by depth:

```
screen_position = world_position / depth
```

That is exactly what `/bp` does. `bp` is the depth, so dividing by it makes
far dots converge toward the center (smaller apparent position).

The `+ 160` and `+ 100` shift the origin to the center of the 320x200 screen
(the classic VGA resolution). Without this offset, (0, 0) would be at the
top-left corner.

The `a + a/8` is `a * 1.125` — a subtle horizontal field-of-view adjustment.
The `d.y * 64` scales the Y coordinate to match the rendering scale.

### Why is this the same as a projection matrix?

A standard perspective projection matrix does exactly this:

```
ndcX = (focalLength * x) / z
ndcY = (focalLength * y) / z
```

The 1993 code just does it with explicit arithmetic instead of a 4x4 matrix
multiplication. The result is identical.

---

## Step 3: Convert to Normalized Device Coordinates (NDC)

WebGL expects positions in **NDC**: x and y both in the range -1 to +1, where
(0, 0) is the center of the screen, (-1, -1) is the bottom-left, and (1, 1)
is the top-right.

```javascript
const ndcX = (screenX - 160) / 160;
const ndcY = -(screenY - 100) / 100;
```

- `(screenX - 160) / 160` maps 0..320 → -1..+1
- `-(screenY - 100) / 100` maps 0..200 → +1..-1 (negated because screen Y
  goes downward but NDC Y goes upward)

---

## The Reflection Position

For planar reflections (covered in Layer 5), a mirrored position is computed:

```javascript
const groundScreenY = 0x80000 / bp + 100;      // floor Y for this depth
const reflScreenY = 2 * groundScreenY - screenY; // mirror below floor
const reflNdcY = -(reflScreenY - 100) / 100;
```

The floor position varies by depth (`0x80000 / bp`) because of perspective —
the floor appears higher for distant dots. The reflection is the mirror image:

```
reflScreenY = 2 * groundY - screenY
```

This is the standard mirror formula: if the ground is at position G and the
dot is at position D, the reflection is at G + (G - D) = 2G - D.

---

## What Gets Uploaded to the GPU

The computed values are packed into the instance buffer:

```javascript
positionData[i * 3]     = ndcX;    // screen x in NDC
positionData[i * 3 + 1] = ndcY;    // screen y in NDC
positionData[i * 3 + 2] = bp;      // raw depth (used for sphere sizing + colouring)
```

The vertex shader reads `aInstancePos.xy` as the screen position and
`aInstancePos.z` as the depth. The depth is not in NDC — it is the raw
projection depth, used to:

1. Size the sphere impostor: `radius = 450 / depth`
2. Colour the sphere: `depthFactor = 1 - depth / depthRange`
3. Set the z-buffer value: `zNdc = 2 * clamp((depth - 2000) / 18000, 0, 1) - 1`

---

## Why Not Use a Normal Projection Matrix?

The remastered effect inherits the classic's projection maths to guarantee
pixel-perfect sync between the two variants. Using a modern projection matrix
would produce slightly different rounding and field-of-view, making the
choreography drift.

This also makes an educational point: projection matrices are not magic. They
encapsulate the same arithmetic shown here in a convenient 4x4 format. If you
understand `/bp + 160`, you understand the core of what `gl_Position =
projectionMatrix * viewMatrix * modelMatrix * vec4(pos, 1)` actually does.

---

**Next:** [Layer 5 — Reflections](05-reflections.md)
