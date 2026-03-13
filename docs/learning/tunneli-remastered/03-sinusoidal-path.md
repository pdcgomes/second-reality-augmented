# Layer 3 — The Sinusoidal Path

**Source:** `src/effects/tunneli/effect.remastered.js`, lines 49–52 (sinit/cosit tables), lines 340–356 (position computation)
**Concepts:** amplitude-growing sine tables, accelerating spiral, viewport tracking

---

## What This Layer Covers

The tunnel does not move in a straight line — it curves and spirals with
increasing intensity. This layer explains:

- The `sinit` and `cosit` position tables with linearly growing amplitude
- How growing amplitude creates an accelerating spiral
- How the reference circle provides viewport tracking (the "camera")
- Why different multipliers create the 3D illusion

---

## Position Tables with Growing Amplitude

The tunnel path is defined by two lookup tables:

```javascript
const sinit = new Float64Array(4096);
const cosit = new Float64Array(2048);
for (let x = 0; x < 4096; x++) sinit[x] = Math.sin(PI * x / 128) * (x * 3 / 128);
for (let x = 0; x < 2048; x++) cosit[x] = Math.cos(PI * x / 128) * (x * 4 / 64);
```

The key insight is the **amplitude term**: `x * 3 / 128` for sinit and
`x * 4 / 64` for cosit. The amplitude grows linearly with the index:

```
sinit:
  At x=0:    sin(0) × 0      = 0        (no movement)
  At x=128:  sin(π) × 3      = 0        (zero crossing)
  At x=256:  sin(2π) × 6     = 0        (zero crossing)
  At x=512:  sin(4π) × 12    = 0        (amplitude 12, but at zero)
  At x=100:  sin(~2.45) × 2.3 ≈ 1.5     (small excursion)
  At x=1000: sin(~24.5) × 23.4 ≈ varies (large excursion)

cosit:
  At x=0:    cos(0) × 0      = 0
  At x=500:  cos(~12.3) × 31 ≈ varies   (very large excursion)
```

Early frames (small indices) produce small position offsets. Later frames
produce much larger offsets. This is why the tunnel starts with gentle curves
and progressively spirals more wildly — it is literally an **amplitude-
modulated oscillation** where the envelope grows linearly.

```
Position offset over time:

small ──────╮                 ╭─────── large
             ╲  ╱╲  ╱╲  ╱╲ ╱╲ ╱╲  ╱
              ╲╱  ╲╱  ╲╱  ╳  ╳  ╲╱
                            gentle → wild
```

---

## How Position is Computed

Each circle's position is a combination of three sinusoidal components:

```javascript
const px = -sinit[(birthFrame * 3) & 4095];
const py = sinit[(birthFrame * 2) & 4095]
         - cosit[birthFrame & 2047]
         + sinit[birthFrame & 4095];
```

| Component | Table | Multiplier | Axis | Role |
|-----------|-------|------------|------|------|
| `px` | sinit | ×3 | horizontal | Fast horizontal sway |
| `py` term 1 | sinit | ×2 | vertical | Medium vertical bob |
| `py` term 2 | cosit | ×1 | vertical | Slow vertical drift |
| `py` term 3 | sinit | ×1 | vertical | Slow vertical offset |

The `birthFrame × 3` multiplier for the x-axis makes horizontal movement
faster than vertical (×2 and ×1). The three vertical terms at different
frequencies create a complex, non-repeating vertical path.

The bitmask `& 4095` wraps sinit indices at 4096 entries, and `& 2047` wraps
cosit at 2048 entries. Since these periods are not multiples of each other
(4096 and 2048 share factors, but the different multipliers on birthFrame
create non-trivial interference), the combined path does not repeat in a
visually obvious way during the effect's 17-second duration.

---

## The Reference Circle (Camera Tracking)

If every circle's position moved but the viewport stayed fixed, the tunnel
would appear to drift across the screen. Instead, the viewport tracks a
**reference circle** — circle index 5 (slightly ahead of the nearest):

```javascript
const birth5 = frame - 94;  // birthFrame of circle at index 5
let refX = 0, refY = 0;
if (birth5 >= 0) {
  refX = -sinit[(birth5 * 3) & 4095];
  refY = sinit[(birth5 * 2) & 4095] - cosit[birth5 & 2047] + sinit[birth5 & 4095];
}
```

Every circle's screen position is computed relative to the reference:

```javascript
const bx = px - refX;
const by = py - refY;
```

This subtraction centres the tunnel around the reference circle. As the
reference circle sways left, all other circles shift right by the same
amount, keeping the tunnel centred on screen. The viewer feels like they
are **inside** the tunnel, looking forward.

Why index 5 (not index 0)? Choosing a circle slightly inside the tunnel
rather than at the very front creates smoother camera tracking — the
reference is averaged over its neighbourhood rather than jumping when
circles enter/exit.

---

## Why the Spiral Accelerates

The combined effect of growing amplitude and the shift buffer creates a
beautiful visual acceleration:

1. Far circles (high depth index, recently born) have small position offsets
   because their `sinit` lookups use recent (low) indices
2. Near circles (low depth index, born long ago) have large position offsets
   because their `sinit` lookups use old (high) indices

Since all circles are on screen simultaneously, you see a gradient of motion
amplitude from back to front. The far end of the tunnel appears nearly
straight while the near end sways dramatically. This creates the perception
of flying through a curved tunnel at increasing speed.

```
Far end (small amplitude):           Near end (large amplitude):

      ·  ·  ·                              ·
     · ·   · ·                           ·   ·
      · ·  · ·                          ·       ·
       · · ·                           ·     ·
        · ·                           ·    ·
                                     ·  ·
                                    · ·
```

---

## The End Sequence

After frame `VEKE - 102` (frame 958), new circles are born with `baseColor = 0`
(invisible). The visible circles gradually scroll out of view as they
approach the camera and age off the shift buffer. By frame 1060, the last
visible circle has exited and the screen is black.

This creates a natural fadeout: the tunnel appears to stop generating new
rings and the existing ones fly past the camera until they are gone.

---

**Next:** [Layer 4 — Gaussian Splats](04-gaussian-splats.md)
