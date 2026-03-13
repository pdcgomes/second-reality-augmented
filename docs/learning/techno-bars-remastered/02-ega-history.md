# Layer 2 — EGA Bit-Plane Architecture

**Source:** `docs/effects/10-techno-bars.md` (classic spec), `src/effects/technoBars/effect.remastered.js` lines 289–415 (barHistory, stepOneFrame, getPlaneParams)
**Concepts:** EGA/VGA bit-plane architecture, 8-page animation, page-flipping, popcount palette, circular buffer

---

## What This Layer Covers

The techno bars effect was designed around a hardware feature that no longer
exists: EGA/VGA **bit-plane** memory. Understanding the original architecture
is essential for understanding the remastered code, because the remastered
faithfully mirrors the same 32-frame structure. This layer explains:

- What bit planes are and how they composite at the hardware level
- How 8 video pages × 4 planes create a 32-frame animation buffer
- Why the popcount palette turns overlapping bars into brighter colours
- How the remastered's circular buffer (`barHistory`) mirrors this system
- Why this was blazingly fast in 1993

---

## Bit Planes: Hardware-Composited Layers

In **EGA/VGA planar mode**, the frame buffer is not stored as one byte per
pixel. Instead, each pixel's colour is spread across **4 independent bit
planes**. Each plane stores one bit per pixel. The 4 bits combine to form a
4-bit colour index (0–15):

```
Plane 3:  0  1  0  1  1  0  0  1    (most significant bit)
Plane 2:  1  0  1  0  0  1  1  0
Plane 1:  0  1  0  0  1  0  1  1
Plane 0:  1  0  0  1  0  1  0  0    (least significant bit)
          ─  ─  ─  ─  ─  ─  ─  ─
Index:    5 10  4  9 12  6 14  4    (binary → decimal)
```

The hardware reads all 4 planes simultaneously and combines them into the
final colour index in a single memory cycle. No software blending is needed —
the VGA DAC (Digital-to-Analogue Converter) looks up each 4-bit index in a
16-entry palette and outputs the corresponding RGB signal.

---

## 8 Pages × 4 Planes = 32 Layers

VGA memory in this mode is 256 KB, enough for **8 independent video pages**
at 320×200. PSI's TECHNO/KOE.C exploits this by drawing bars into one plane
of one page each frame, cycling through all combinations:

```
Frame  1: Draw bars → Page 0, Plane 0
Frame  2: Draw bars → Page 1, Plane 0
Frame  3: Draw bars → Page 2, Plane 0
  ...
Frame  8: Draw bars → Page 7, Plane 0
Frame  9: Draw bars → Page 0, Plane 1    ← Page 0 now has planes 0+1
Frame 10: Draw bars → Page 1, Plane 1
  ...
Frame 32: Draw bars → Page 7, Plane 3    ← all pages fully populated
Frame 33: Draw bars → Page 0, Plane 0    ← overwrites frame 1's content
```

Each page accumulates bars across 4 planes over 32 frames. The **displayed
page** advances every frame (0, 1, 2, ... 7, 0, 1, ...), always showing the
most recently written page with its full 4-plane composite.

After 32 frames, every page has all 4 planes filled. From frame 33 onward,
each new draw overwrites the oldest content in a circular fashion — the page
always shows bars from the current frame plus bars from 8, 16, and 24 frames
ago.

---

## The Popcount Palette

The genius of this scheme is the **palette**. Because bars are drawn as solid
fills (value 1) into individual planes, overlapping bars set multiple bits in
the 4-bit index. The palette maps the **number of set bits** (popcount) to
brightness:

| 4-bit index | Binary | Popcount | Colour |
|-------------|--------|----------|--------|
| 0000 | 0 | 0 | Black (no bars) |
| 0001 | 1 | 1 | Dim purple |
| 0010 | 1 | 1 | Dim purple |
| 0011 | 2 | 2 | Medium |
| 0100 | 1 | 1 | Dim purple |
| 0101 | 2 | 2 | Medium |
| 0110 | 2 | 2 | Medium |
| 0111 | 3 | 3 | Bright |
| 1111 | 4 | 4 | Brightest |

Any combination of 1, 2, 3, or 4 overlapping planes produces the same
brightness for that popcount level. The specific bit pattern does not matter —
only how many bits are set. This means the palette must assign the same colour
to all indices with the same popcount:

```javascript
// Classic palette setup (from 10-techno-bars.md)
// Popcount 0 → black
// Popcount 1 → R:21, G:19, B:25   (dim purple-grey)
// Popcount 2 → R:29, G:25, B:33   (medium)
// Popcount 3 → R:38, G:35, B:42   (bright)
// Popcount 4 → R:47, G:44, B:51   (brightest)
```

---

## Why This Was Fast in 1993

The brilliance of this approach is that the VGA hardware does all the
compositing for free. Each frame, the CPU only needs to:

1. Select one bit plane for writing (a single I/O port write)
2. Draw 11 bar polygons as monochrome fills into that plane
3. Flip the displayed page (another single I/O port write)

The hardware automatically combines all 4 planes when reading pixels for
display. There is no software blending loop, no alpha compositing, no
read-modify-write of the frame buffer. On a 33 MHz 486, this made the
difference between 70 fps and single digits.

By contrast, modern GPUs have no concept of bit-plane compositing. The
remastered effect must evaluate all 4 planes explicitly per pixel in the
fragment shader (Layer 1).

---

## The Remastered Circular Buffer

The remastered effect mirrors the classic's 8-page × 4-plane system with a
**32-frame circular buffer** in JavaScript:

```javascript
let barHistory = new Array(32).fill(null);
```

Each frame, `stepOneFrame` computes the current bar parameters (rotation,
spacing, centre position) and stores them at `barHistory[frame % 32]`:

```javascript
barHistory[frame % 32] = {
  rot: barRot,
  vm: barVm,
  wx: barWx,
  wy: barWy,
  phaseStart,
  scrollX
};
```

The modulo-32 index wraps automatically, overwriting the oldest entry — just
like the classic's page/plane cycle overwrites the oldest frame.

---

## Extracting Plane Parameters

When rendering, `getPlaneParams` reads back the 4 parameter sets that
correspond to the current page's 4 planes:

```javascript
function getPlaneParams(targetFrame) {
  const page = targetFrame % 8;
  const curPlaneIdx = Math.floor(targetFrame / 8) % 4;

  for (let k = 0; k < 4; k++) {
    const planeIdx = (curPlaneIdx - k + 4) % 4;
    const histFrame = targetFrame - k * 8;
    // ...
    const entry = barHistory[histFrame % 32];
    rots[planeIdx] = entry.rot;
    vms[planeIdx] = entry.vm;
    // ...
  }
}
```

The logic mirrors the classic exactly:

- **Plane 0**: bar params from 0 frames ago (the current frame)
- **Plane 1**: bar params from 8 frames ago
- **Plane 2**: bar params from 16 frames ago
- **Plane 3**: bar params from 24 frames ago

Because bars from different frames have different rotations and spacings,
the 4 planes show bars at 4 different orientations — and where they cross,
the overlap count increases.

```
Frame 100:

  Plane 0 (frame 100):  ╲╲╲╲╲╲╲     (current rotation)
  Plane 1 (frame  92):  ═══════      (rotation from 8 frames ago)
  Plane 2 (frame  84):  ╱╱╱╱╱╱╱     (rotation from 16 frames ago)
  Plane 3 (frame  76):  ║║║║║║║     (rotation from 24 frames ago)

  Composite: complex interference grid where bars cross
```

---

## Phase Boundaries

The buffer must also handle **phase transitions**. When a new phase starts
(e.g. Phase 2 begins at frame 420), the old page/plane contents are invalid.
The `phaseStart` field in each history entry tracks which phase it belongs to:

```javascript
if (histFrame < entry.phaseStart) continue;
```

If the history entry predates the current phase's start, it is skipped and
that plane renders as empty. This prevents stale bars from a previous phase
bleeding into the new one — matching the classic's behaviour of clearing all
pages at phase transitions.

---

## Classic vs Remastered: Side by Side

| Aspect | Classic (1993) | Remastered (GPU) |
|--------|---------------|-----------------|
| Storage | 8 VGA video pages (VRAM) | 32-entry JS array |
| Compositing | Hardware bit-plane merge | GLSL evaluates 4 planes/pixel |
| Resolution | 320×200 | Native display resolution |
| Anti-aliasing | None (aliased polygons) | fwidth() smoothstep per edge |
| Palette | 16-entry DAC popcount | Continuous tint interpolation |
| Draw cost | 11 polygons/frame | 0 polygons (analytical per-pixel) |
| Flip cost | 1 I/O port write | Not applicable (FBO render) |

---

**Next:** [Layer 3 — Motion Sequences](03-motion-sequences.md)
