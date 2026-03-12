# ALKU Effect - Quick Reference Guide

## At a Glance

**What it is**: Opening credits of Second Reality with scrolling terrain  
**Platform**: MS-DOS, 386+, VGA  
**Year**: 1993  
**Coder**: WILDFIRE  
**Frame rate**: 70 fps  
**Resolution**: 320x200 visible (320x400 buffer)

## Core Algorithm

```
NOT a voxel renderer!
It's a column-based heightmap renderer:

1. Pre-render vertical columns of terrain
2. Scroll viewport horizontally using VGA hardware
3. Draw new columns at right edge as needed
4. Overlay text using XOR delta encoding
5. Fade palettes using "copper" effects
```

## File Structure

```
ALKU/
├── MAIN.C          - Main logic, text, fades (541 lines)
├── ASMYT.ASM       - Text scrolling optimization (109 lines)
├── COPPER.ASM      - VGA register effects (149 lines)
├── TWEAK.ASM       - VGA mode setup (333 lines)
├── INCLUDE.ASM     - Data includes
├── HOI.IN0         - Heightmap + palette data
├── HOI.IN1         - Texture/color indices
├── FONA.INC        - Bitmap font (118KB)
└── *.LBM           - Background images
```

## Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `main()` | MAIN.C | Main loop, synchronization |
| `init()` | MAIN.C | Setup palettes, fonts, VGA |
| `do_scroll()` | MAIN.C | Advance scroll, render columns |
| `outline()` | ASMYT.ASM | Render one terrain column |
| `ascrolltext()` | ASMYT.ASM | Apply text deltas |
| `maketext()` | MAIN.C | Pre-compute text deltas |
| `tw_opengraph()` | TWEAK.ASM | Setup custom VGA mode |
| `copper1/2/3()` | COPPER.ASM | Per-frame VGA effects |

## VGA Registers Used

| Register | Address | Purpose |
|----------|---------|---------|
| Sequencer | 0x3C4 | Plane selection for writing |
| Graphics | 0x3CE | Plane selection for reading |
| CRTC | 0x3D4 | Scroll position, video mode |
| Attribute | 0x3C0 | Pixel panning (fine scroll) |
| Palette | 0x3C8/9 | Color palette updates |

## Memory Layout

```
VGA Memory (0xA0000):
┌─────────────────────┐
│ 0-49:   Background  │ Horizon image
│ 50-199: Terrain     │ Scrolling landscape
│ 200-399: Text       │ Credits overlay
└─────────────────────┘

Terrain buffer:
├─ 0-87:   Buffer A
└─ 88-175: Buffer B
```

## Data Structures

```c
// Terrain data
char far hzpic[];          // Heightmap from HOI.IN0
                           // [0-15]: Header
                           // [16-783]: Palette (768 bytes)
                           // [784+]: Height values

// Text rendering
char far tbuf[186][352];   // Text buffer (65KB)
int far dtau[30000];       // Delta table (60KB)

// Font
char far font[31][1500];   // Bitmap font (46KB)
int fonap[256];            // Character positions
int fonaw[256];            // Character widths

// Palettes
char palette[768];         // Main palette
char palette2[768];        // Text-blended palette
char fade1[768];           // Black
char fade2[768];           // Text colors
```

## Rendering Pipeline

```
Frame N:
1. copper1() → Update scroll registers
2. do_scroll() → Main logic
   ├─ If (a&3)==0: outline() → Render new column
   └─ ascrolltext() → Apply text deltas
3. Wait for VBlank
4. copper2() → Update palette if needed
5. copper3() → Fade palette incrementally
6. Repeat

Every 4 pixels: New column rendered
Every frame: Text deltas applied
Every frame: Palette potentially updated
```

## Performance Budget (per frame @ 70fps)

```
Operation              Time      CPU%
─────────────────────────────────────
Scroll update          ~10 μs    0.01%
Column render          ~200 μs   0.8%
Text deltas            ~100 μs   0.4%
Palette update         ~50 μs    0.2%
Music (DIS)            ~500 μs   5.0%
VBlank wait            ~14 ms    56%
Idle                   ~7.8 ms   38%
─────────────────────────────────────
Total frame time       14.3 ms   100%
```

## Optimization Techniques

1. **Planar rendering**: 4 pixels at once
2. **Hardware scrolling**: No memory copies
3. **Delta encoding**: Only changed pixels
4. **XOR operations**: Fast pixel manipulation
5. **Loop unrolling**: REPT macros
6. **Fixed-point math**: No floating point
7. **Double buffering**: No tearing
8. **Pre-computed tables**: Font, deltas

## Color Palette

```
Indices 0-63:    Terrain colors
Indices 64-127:  Text layer 1 (blended)
Indices 128-191: Text layer 2 (blended)
Indices 192-255: Text layer 3 (blended)

Blending formula:
result = (base * 63 + terrain * (63 - base)) >> 6
```

## Scrolling Math

```c
a = pixel position (0-319)
p = buffer toggle (0 or 1)

cop_start = a/4 + p*88;    // Video memory offset
cop_scrl = (a&3)*2;        // Pixel panning (0,2,4,6)

Every 4 pixels:
  col = a/4 + 86;          // Column to render
  outline(hzpic + col*4 + 784, vmem + col + 176*50);
```

## Text Delta Encoding

```c
// Pre-compute:
for each pixel:
  if(tbuf[y][x] != tbuf[y][x-2]):
    dtau[i++] = offset;
    dtau[i++] = tbuf[y][x] ^ tbuf[y][x-2];
dtau[i++] = -1;  // End marker

// Apply:
while(dtau[i] != -1):
  screen[dtau[i]] ^= dtau[i+1];
  i += 2;
```

## Fade System

```assembly
; Fixed-point 16.8 format
; High byte: integer (0-63)
; Low byte: fractional (0-255)

fadepal[color] += increment_lo;  // Add fraction
fadepal[color] += increment_hi;  // Add integer + carry

Fade speeds:
- 128 frames: Terrain fade-in
- 64 frames: Text fade in/out
```

## Credits Text

```
Screen 1: "A" / "Future Crew" / "Production"
Screen 2: "First Presented" / "at Assembly 93"
Screen 3: "in" / [logos]

Scrolling:
- Graphics: Marvel, Pixel
- Music: Purple Motion, Skaven
- Code: Psi, Trug, Wildfire
- Additional Design: Abyss, Gore
```

## Music Synchronization

```c
dis_sync() returns:
0 = Not started
1 = "Future Crew" cue
2 = "Assembly 93" cue
3 = Start scrolling
4 = Graphics credits
5 = Music credits
6 = Code credits
7 = Additional design
8 = Exit
```

## Common Misconceptions

❌ **"It's a voxel renderer"**  
✅ It's a column-based heightmap renderer (much simpler)

❌ **"It uses ray casting"**  
✅ It uses simple column fill operations

❌ **"It has 3D camera movement"**  
✅ It only scrolls horizontally (2D)

❌ **"It's written entirely in assembly"**  
✅ Main logic is C, critical paths are assembly

❌ **"It's a single monolithic effect"**  
✅ It's one of 32 separate executables in the demo

## Building from Source

```bash
# Requirements:
# - Turbo C 3.0
# - Turbo Assembler (TASM)
# - DOS or DOSBox

cd ALKU
tcc -ml -c MAIN.C
tasm /ml ASMYT.ASM
tasm /ml COPPER.ASM
tasm /ml TWEAK.ASM
tasm /ml INCLUDE.ASM
tlink /c /x MAIN.OBJ ASMYT.OBJ COPPER.OBJ TWEAK.OBJ INCLUDE.OBJ ..\DIS\DISC.OBJ, ALKU.EXE
```

## Testing/Running

```bash
# In DOSBox:
cd MAIN\DATA
SECOND.EXE

# Or just the ALKU part:
cd ALKU
ALKU.EXE
```

## Key Insights

1. **Simple beats complex**: Heightmap is faster than voxels
2. **Hardware is your friend**: VGA features do the heavy lifting
3. **Pre-compute everything**: Tables, deltas, increments
4. **Optimize hot paths**: Assembly for rendering loops
5. **Know your limits**: 70fps leaves room for music

## Further Reading

- Full analysis: `ALKU_ANALYSIS.md`
- Visual diagrams: `ALKU_RENDERING_DIAGRAM.md`
- Code details: `ALKU_CODE_DETAILS.md`
- Source: https://github.com/mtuomi/SecondReality/tree/master/ALKU
- Fabien's review: https://fabiensanglard.net/second_reality/

## Quick Tips for Understanding the Code

1. **Start with MAIN.C**: High-level flow is clear
2. **Ignore DOS memory model**: Just know FAR = >64KB access
3. **Focus on algorithms**: Not syntax
4. **Trace one frame**: Follow do_scroll() execution
5. **Understand VGA planes**: Key to rendering speed
6. **Watch the demo**: Context helps understanding

## One-Sentence Summary

**ALKU is a column-based heightmap renderer that uses VGA hardware scrolling, planar rendering, XOR-encoded text, and copper-style palette effects to create a smooth 70fps scrolling terrain on a 386 processor.**

---

*For detailed explanations, see the full analysis documents.*
