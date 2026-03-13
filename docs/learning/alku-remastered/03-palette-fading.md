# Layer 3 — Palette Fading

**Source:** `src/effects/alku/effect.remastered.js` lines 33–70 (constants + timing), 380–448 (`computeState`)
**Concepts:** VGA palette interpolation, sequence state machines, frame-based timing, fade curves

---

## What This Layer Covers

The emotional impact of the ALKU opening comes from its **timing** — credits
fade in from darkness, hold, then dissolve away. The original 1993 effect
achieved this entirely through **palette manipulation**: interpolating 256-entry
colour tables between "visible" and "black" states. The remastered variant
replaces palette tricks with shader uniforms, but the underlying timing logic
is identical.

This layer explains the sequence state machine, how fade values are computed
from frame counts, and how the original palette technique maps to modern GPU
rendering.

---

## The Original VGA Technique

In the 1993 demo, fading worked by **interpolating the entire VGA palette**:

```
 Fade-in:  blackpalette ──────────► palette     (128 frames)
 Text on:  palette      ──────────► palette2    (64 frames)
 Text off: palette2     ──────────► palette     (64 frames)
```

- `blackpalette` — all 256 entries set to RGB(0,0,0)
- `palette` — the landscape colours (64 entries for the image)
- `palette2` — landscape colours + text blending (banks 1–3 contain
  landscape-text blends at 33%, 67%, 100% opacity)

Every frame, the CPU would compute 256 × 3 interpolated values and upload
them to the VGA DAC. This was the cheapest way to fade — no per-pixel work,
just a 768-byte palette swap.

---

## The Remastered Approach: Uniform Multiplication

The remastered variant replaces palette interpolation with two float uniforms:

| Uniform | Controls | Range |
|---------|----------|-------|
| `uBgFade` | Landscape brightness | 0.0 (black) → 1.0 (full) |
| `uTextFade` | Text opacity | 0.0 (invisible) → 1.0 (solid) |

In the shader:

```glsl
color *= uBgFade;                                      // landscape fade
color = mix(color, textSample.rgb, textSample.a * uTextFade);  // text fade
```

The `mix()` call blends between the background colour and white text, weighted
by the text texture's alpha channel multiplied by the fade factor. When
`uTextFade = 0`, text is invisible regardless of the texture content.

---

## The Sequence State Machine

The `computeState(t)` function is the heart of the timing system. It converts
a time value (seconds) into a complete rendering state:

```javascript
function computeState(t) {
  const seq = getSequence(t);
  const seqStart = SEQ_TIMES[seq];
  const seqT = t - seqStart;
  const seqFrames = seqT * FRAME_RATE;
  // ... compute showLandscape, bgFade, textFade, textIndex, scrollOffset
}
```

The sequence index is found by scanning the timestamp table backwards:

```javascript
const SEQ_TIMES = [
  0.0,   // seq 0: black wait
  1.5,   // seq 1: text over black
  8.5,   // seq 2: text over black
  15.5,  // seq 3: text over black
  22.0,  // seq 4: landscape fade-in
  30.0,  // seq 5: text over landscape
  38.0,  // seq 6: text over landscape
  46.0,  // seq 7: text over landscape
  54.0,  // seq 8: text over landscape
  62.0,  // end
];
```

---

## Fade Curves

Both text and background fades use **linear ramps** driven by frame counts.
Here is the text fade lifecycle:

```
 Frames:  0          64        64+hold     64+hold+64
          |──────────|─────────|───────────|
          fade in     hold      fade out
          0→1         1         1→0
```

In code:

```javascript
if (seqFrames < TEXT_FADE_FRAMES) {
  textFade = seqFrames / TEXT_FADE_FRAMES;           // linear ramp up
} else if (seqFrames < holdFrames) {
  textFade = 1;                                       // full visibility
} else if (seqFrames < holdFrames + TEXT_FADE_FRAMES) {
  textFade = 1 - (seqFrames - holdFrames) / TEXT_FADE_FRAMES;  // ramp down
} else {
  textFade = 0;                                       // gone
}
```

The constants control timing:

| Constant | Value | Meaning |
|----------|-------|---------|
| `FRAME_RATE` | 70 | Original VGA refresh rate |
| `TEXT_FADE_FRAMES` | 64 | ~0.91 seconds per fade |
| `TEXT_HOLD_FRAMES_BLACK` | 364 | Hold duration over black background |
| `TEXT_HOLD_FRAMES_SCROLL` | 264 | Hold duration over scrolling landscape |

Text over the landscape holds for fewer frames because the background provides
visual interest — the credits don't need to linger as long.

---

## Background Fade-In

The landscape fades from black to full brightness during sequence 4:

```javascript
if (seq === 4) {
  bgFade = Math.min(seqFrames / BG_FADEIN_FRAMES, 1);  // 128 frames
} else {
  bgFade = 1;  // fully bright from seq 5 onward
}
```

This produces a slow 1.8-second fade-in (128 frames ÷ 70 fps), matching the
original's gradual landscape reveal.

```
 Seq 4 timeline (22.0s – 30.0s):
 ┌──────────────────────────────────────────────────┐
 │  ░░▒▒▓▓██████████████████████████████████████████│
 │  fade-in (1.8s)        fully lit                 │
 └──────────────────────────────────────────────────┘
```

---

## Two Phases of Credits

The state machine handles two distinct credit phases:

**Phase 1: Text over black** (sequences 1–3)
- No landscape visible
- Text screens 0, 1, 2 (Future Crew, Assembly 93, Dolby logo)
- Longer hold time (300 + 64 frames)
- `textIndex = seq - 1`

**Phase 2: Text over landscape** (sequences 5–8)
- Landscape scrolling and fully bright
- Text screens 3, 4, 5, 6 (Graphics, Music, Code, Additional Design)
- Shorter hold time (200 + 64 frames)
- `textIndex = seq - 5 + 3`

Sequence 4 is the transition: landscape fades in with no text overlay.

```
 Seq:  0   1   2   3   4   5   6   7   8
       │   │   │   │   │   │   │   │   │
 Text: -  scr0 scr1 scr2  -  scr3 scr4 scr5 scr6
 BG:   ████████████████  fade ████████████████████
       black             ↑in   scrolling landscape
```

---

## Output Clamping

The state function clamps all values to the 0–1 range:

```javascript
return {
  showLandscape,
  bgFade: Math.max(0, Math.min(1, bgFade)),
  textFade: Math.max(0, Math.min(1, textFade)),
  textIndex,
  scrollOffset,
};
```

This defensive clamping prevents visual glitches from floating-point edge
cases at sequence boundaries.

---

## Why Frames, Not Seconds?

The timing uses **frame counts** (`seqFrames = seqT * FRAME_RATE`) rather
than raw seconds. This preserves the original 70 Hz quantisation — fades
progress in discrete steps that match the 1993 demo's behaviour. The visual
result is identical at any display refresh rate because `computeState` is
a pure function of elapsed time.

---

## Key Takeaways

- **VGA palette interpolation** was the 1993 technique for fading — the
  remastered version achieves the same effect with two float uniforms
- **Linear fade ramps** are simple but effective: divide elapsed frames by
  total frames to get a 0→1 progress value
- **Sequence state machines** with timestamp tables decouple timing from
  rendering — easy to retune by editing a single array
- **Frame-rate-independent replay** is achieved by converting wall-clock
  seconds to 70 Hz frame counts, preserving the original quantisation

---

**Next:** [Layer 4 — GPU Rendering](04-gpu-rendering.md) · **Back to:** [Overview](00-overview.md)
