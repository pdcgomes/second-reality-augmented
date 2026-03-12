# ALKU Terrain Rendering - Visual Explanation

## Memory Layout Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    VGA Memory (0xA0000)                     │
│                     176 bytes × 400 lines                    │
├─────────────────────────────────────────────────────────────┤
│  Lines 0-49: Background/Horizon Image                       │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Static horizon image (pre-rendered)                   │  │
│  │ Contains sky gradient and distant mountains           │  │
│  └───────────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────┤
│  Lines 50-199: Scrolling Terrain Area (150 lines)          │
│  ┌─────────────────┬─────────────────┐                     │
│  │  Buffer A       │  Buffer B       │                     │
│  │  (88 columns)   │  (88 columns)   │                     │
│  │                 │                 │                     │
│  │  Terrain        │  Terrain        │                     │
│  │  columns        │  columns        │                     │
│  │  rendered       │  rendered       │                     │
│  │  here           │  here           │                     │
│  └─────────────────┴─────────────────┘                     │
│         ↑ Hardware scroll viewport moves across these      │
├─────────────────────────────────────────────────────────────┤
│  Lines 200-399: Text Overlay Buffer                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │ Credits text rendered with delta encoding             │  │
│  │ XOR blended with terrain for transparency effect      │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## Column Rendering Process

```
Step 1: Read Heightmap Data
┌──────────────────┐
│ HOI.IN0 (height) │  ──→  Height value (0-150)
│ HOI.IN1 (color)  │  ──→  Color index (17-48)
└──────────────────┘

Step 2: Render Column (from bottom up)
        Screen
    ┌──────────┐
    │          │ ← Top of screen (y=50)
    │   Sky    │
    │          │
    ├──────────┤ ← Height value determines fill point
    │▓▓▓▓▓▓▓▓▓▓│
    │▓▓▓▓▓▓▓▓▓▓│ ← Fill with terrain color
    │▓▓▓▓▓▓▓▓▓▓│
    │▓▓▓▓▓▓▓▓▓▓│
    └──────────┘ ← Bottom (y=199)

Step 3: Write to 4 VGA Planes
    Plane 0  Plane 1  Plane 2  Plane 3
    ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐
    │  █  │  │  █  │  │  █  │  │  █  │
    │  █  │  │  █  │  │  █  │  │  █  │
    │  █  │  │  █  │  │  █  │  │  █  │
    └─────┘  └─────┘  └─────┘  └─────┘
       ↓        ↓        ↓        ↓
    Pixel 0  Pixel 1  Pixel 2  Pixel 3
    (Renders 4 horizontal pixels at once)
```

## Scrolling Mechanism

```
Frame 0:                    Frame 1:
┌────────────────────┐     ┌────────────────────┐
│ Viewport            │     │  Viewport          │
│ ┌────────────────┐ │     │  ┌────────────────┐│
│ │ Visible area   │ │     │  │ Visible area   ││
│ │ (320x150)      │ │     │  │ (320x150)      ││
│ └────────────────┘ │     │  └────────────────┘│
└────────────────────┘     └────────────────────┘
        ↓                           ↓
Hardware scroll register    Scroll += 1 pixel
points here                 New column drawn at right edge

Frame 2:                    Frame 3:
┌────────────────────┐     ┌────────────────────┐
│   Viewport         │     │    Viewport        │
│   ┌────────────────┐     │    ┌────────────────┐
│   │ Visible area   │     │    │ Visible area   │
│   │ (320x150)      │     │    │ (320x150)      │
│   └────────────────┘     │    └────────────────┘
└────────────────────┘     └────────────────────┘
```

## Text Overlay Delta Encoding

```
Original Text Buffer (tbuf):
  X: 0  1  2  3  4  5  6  7  8  9
Y 0: 0  0  0  0  0  0  0  0  0  0
  1: 0  0  0  0  0  0  0  0  0  0
  2: 0  0 64 64 64  0  0  0  0  0
  3: 0  0 64 64 64  0  0  0  0  0
     ↓
Delta Encoding (only store changes):
  [offset: 2, value: 64]   ← X=2 changed from 0 to 64
  [offset: 3, value: 0]    ← X=3 unchanged (64^64=0)
  [offset: 4, value: 0]    ← X=4 unchanged
  [offset: 5, value: 64]   ← X=5 changed from 64 to 0
  [-1, -1]                 ← End marker

During rendering:
  FOR each delta:
    screen[offset] ^= value  ← XOR applies the change
```

## Palette Layout

```
┌─────────────────────────────────────────────────┐
│ Palette Index Range │ Usage                     │
├─────────────────────────────────────────────────┤
│  0-63               │ Terrain colors            │
│                     │ (browns, greens, grays)   │
├─────────────────────────────────────────────────┤
│  64-127             │ Text layer 1              │
│                     │ (blended with terrain)    │
├─────────────────────────────────────────────────┤
│  128-191            │ Text layer 2              │
│                     │ (blended differently)     │
├─────────────────────────────────────────────────┤
│  192-255            │ Text layer 3              │
│                     │ (for additional effects)  │
└─────────────────────────────────────────────────┘

Blending formula for text layers:
  text_color = (base_color * 63 + terrain_color * (63 - base_color)) >> 6
  
  This creates a semi-transparent effect where text is visible
  but terrain shows through slightly.
```

## Copper System Timing

```
VGA Frame Timing (70 Hz):
┌─────────────────────────────────────────────────┐
│                                                 │
│  Visible Area (200 lines)                      │
│  ┌───────────────────────────────────────────┐ │
│  │                                           │ │
│  │  Copper1 called here ──→ Set scroll pos  │ │
│  │                                           │ │
│  │  Rendering happens during visible area   │ │
│  │                                           │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
│  Vertical Blank (200 lines)                    │
│  ┌───────────────────────────────────────────┐ │
│  │  Copper2 called here ──→ Update palette  │ │
│  │  Copper3 called here ──→ Fade palette    │ │
│  └───────────────────────────────────────────┘ │
│                                                 │
└─────────────────────────────────────────────────┘
         ↓
    Next frame begins
```

## Data Flow Diagram

```
┌──────────────┐
│  HOI.IN0     │ ← Heightmap data (768 byte palette + height values)
│  (Palette +  │
│   Heights)   │
└──────┬───────┘
       │
       ↓
┌──────────────┐
│  HOI.IN1     │ ← Color/texture indices
│  (Colors)    │
└──────┬───────┘
       │
       ↓
┌──────────────────────────────────────┐
│  outline() function (ASMYT.ASM)      │
│  - Reads height value                │
│  - Reads color index                 │
│  - Fills column from bottom to height│
│  - Writes to 4 VGA planes            │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  VGA Memory (0xA0000)                │
│  - Column stored in planar format    │
│  - Hardware scrolls viewport         │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  ascrolltext() (ASMYT.ASM)           │
│  - Applies delta-encoded text        │
│  - XORs changes into video memory    │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  Copper routines (COPPER.ASM)        │
│  - copper1: Update scroll registers  │
│  - copper2: Update palette           │
│  - copper3: Fade palette             │
└──────┬───────────────────────────────┘
       │
       ↓
┌──────────────────────────────────────┐
│  VGA Display                         │
│  - Shows scrolling terrain + text    │
└──────────────────────────────────────┘
```

## Rendering Pipeline Per Frame

```
1. Frame Start
   ↓
2. copper1() - Set hardware scroll position
   ↓
3. Main Loop (MAIN.C - do_scroll)
   ↓
4. If (a & 3) == 0: Render new column
   │  ├─→ outline() - Draw terrain column
   │  └─→ Write to both buffers (A and B)
   ↓
5. ascrolltext() - Apply text deltas
   ↓
6. Increment scroll position (a++)
   ↓
7. Toggle buffer (p ^= 1)
   ↓
8. Wait for VBlank
   ↓
9. copper2() - Update palette if needed
   ↓
10. copper3() - Fade palette incrementally
    ↓
11. Frame counter++
    ↓
12. Next frame (goto 1)
```

## Performance Breakdown

```
Per Frame Operations:
┌────────────────────────────────────────────────┐
│ Operation              │ Time    │ Frequency   │
├────────────────────────────────────────────────┤
│ Hardware scroll update │ ~10 μs  │ Every frame │
│ New column render      │ ~200 μs │ Every 4th   │
│ Text delta apply       │ ~100 μs │ Every frame │
│ Palette update         │ ~50 μs  │ On change   │
│ VBlank wait            │ ~14 ms  │ Every frame │
└────────────────────────────────────────────────┘

Total CPU usage per frame: < 1 ms
VBlank wait: ~14 ms (70 Hz)
Frame rate: ~70 fps (VBlank limited)

CPU utilization: ~7% (plenty of headroom for music playback)
```

## Comparison: This vs True Voxel Rendering

```
ALKU Heightmap Renderer:          True Voxel Renderer (Comanche):
┌──────────────────────┐          ┌──────────────────────┐
│ Pre-rendered columns │          │ Ray-cast per pixel   │
│ Simple column fill   │          │ Height interpolation │
│ 2D scroll only       │          │ Full 3D movement     │
│ ~70 fps on 386       │          │ ~20 fps on 486       │
│ No perspective       │          │ Perspective correct  │
│ Flat colors          │          │ Texture mapping      │
└──────────────────────┘          └──────────────────────┘
        ↓                                  ↓
   Fast but limited              Slow but flexible
```

## Key Insights

1. **Not a voxel renderer**: Despite appearances, this is a simple column-based heightmap renderer, not a true voxel engine.

2. **Hardware acceleration**: Extensive use of VGA hardware features (planar mode, hardware scrolling, palette manipulation) offloads work from CPU.

3. **Delta encoding**: Text overlay uses XOR delta encoding to minimize memory and CPU usage.

4. **Double buffering**: Two terrain buffers prevent tearing during column updates.

5. **Copper system**: Per-scanline effects borrowed from Amiga programming enable smooth palette fades and scrolling.

6. **Memory efficiency**: Total effect uses ~64KB video memory, leaving plenty for other demo parts.

7. **CPU efficiency**: Rendering takes <1ms per frame, leaving CPU free for music playback and synchronization.

The genius is not in complex algorithms, but in **deeply understanding the hardware** and using every trick available to create a visually impressive effect with minimal CPU overhead.
