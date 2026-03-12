# Second Reality ALKU Effect - Technical Analysis

## Overview
The ALKU effect is the opening credits sequence of Second Reality, featuring a scrolling voxel-like terrain with text overlays. This analysis is based on the original source code from https://github.com/mtuomi/SecondReality and Fabien Sanglard's analysis at https://fabiensanglard.net/second_reality/.

## Architecture

### File Structure
The ALKU folder contains:
- **MAIN.C** (541 lines) - Main control logic, text rendering, fade effects
- **ASMYT.ASM** (109 lines) - Assembly optimized text scrolling
- **COPPER.ASM** (149 lines) - "Copper" effects (VGA register manipulation per scanline)
- **TWEAK.ASM** (333 lines) - VGA mode setup and low-level graphics primitives
- **INCLUDE.ASM** - Data includes (terrain data and font)
- **HOI.IN0** - Terrain heightmap data (first segment)
- **HOI.IN1** - Terrain texture/color data (second segment)
- **FONA.INC** - Font data (118KB, bitmap font)
- Various .LBM files - Deluxe Paint images for backgrounds

### Video Mode
The effect uses a custom "tweaked" VGA mode:
- **Resolution**: 320x400 pixels (tweaked from mode 13h)
- **Color depth**: 8-bit (256 colors)
- **Memory layout**: 4 planar bitplanes (chain-4 disabled)
- **Viewport**: 320x200 visible area with hardware scrolling
- **Buffer size**: 176 bytes per scanline × 400 lines

Key VGA registers manipulated:
```assembly
; From TWEAK.ASM - Setting up the mode
mov ax, 13h          ; Start with mode 13h (320x200)
int 10h

mov dx, 03c4h
mov ax, 0604h
out dx, ax           ; Disable chain-4 mode

mov ax, 0014h        ; CRTC long mode off
mov ax, 0e317h       ; CRTC byte mode on
mov ax, 0009h        ; 400 line mode
mov ax, 5813h        ; 640 pixels wide (88 bytes × 4 planes = 352 pixels)
```

## Terrain Rendering Algorithm

### Data Structure
The terrain is stored in two data segments:

1. **HOI.IN0** - Heightmap/palette header
   - First 16 bytes: Header (252, 252, 128, 2, 200, 0, 0, 1, 49...)
   - Next 768 bytes: Color palette (RGB values, 6-bit per channel)
   - Remaining: Heightmap data (single byte per column)

2. **HOI.IN1** - Texture/color indices
   - Contains color index values (typically 17-34 range, with some 48s)
   - Maps to palette entries for terrain coloring

### Rendering Method: Column-Based Heightmap Renderer

This is **NOT** a true voxel renderer, but rather a **column-based heightmap renderer** similar to the technique used in games like Comanche. Here's how it works:

#### Core Algorithm (from ASMYT.ASM - `outline` procedure)

```assembly
PROC C outline
    ; Renders one vertical column of terrain
    ; ARG src:dword   - pointer to heightmap data (4 bytes per column)
    ; ARG dest:dword  - destination in video memory
    
    mov [cs:mrol], 0802h
    mov cx, 4d              ; 4 planes to render
@@l1:
    ; Select VGA plane
    mov dx, 3c4h
    mov ax, [cs:mrol]
    out dx, ax
    
    ; Render 75 pixels twice (150 total height)
    REPT 75
    mov al, [ds:si+ccc*640]      ; Read from heightmap
    mov [es:di+ccc*352], al      ; Write to screen (left half)
    mov [es:di+ccc*352+176], al  ; Write to screen (right half)
    ccc=ccc+1
    ENDM
    
    ; Continue for next 75 pixels
    mov ax, ds
    add ax, 75*40               ; Move to next segment
    mov ds, ax
    
    REPT 75
    mov al, [ds:si+ccc*640]
    mov [es:di+ccc*352+75*352], al
    mov [es:di+ccc*352+75*352+176], al
    ccc=ccc+1
    ENDM
    
    shr [cs:(Byte mrol+1)], 1d  ; Next plane
    dec cx
    jnz @@l1
```

#### How It Works:

1. **Column-by-column rendering**: The terrain is rendered as vertical columns
2. **Heightmap lookup**: Each column has a height value (0-150 pixels)
3. **Solid fill**: From the bottom of the screen up to the height value, pixels are filled with the terrain color
4. **Double buffering**: Each column is written twice (left and right halves at offsets 0 and 176)
5. **Planar rendering**: Uses VGA's 4 bitplanes, rendering 4 pixels at a time

### Scrolling Mechanism

The terrain scrolls horizontally using hardware scrolling:

```c
// From MAIN.C - do_scroll()
cop_start = a/4 + p*88;      // Set video memory start offset
cop_scrl = (a&3)*2;          // Set pixel-level scroll (0, 2, 4, 6)

// Every 4 pixels, render a new column
if((a&3)==0) {
    outline(hzpic + (a/4+86)*4 + 784, vmem + (a/4+86) + 176*50);
    outline(hzpic + (a/4+86)*4 + 784, vmem + (a/4+86) + 176*50 + 88);
}
a += 1;
p ^= 1;  // Toggle between two buffers
```

**Key insight**: The terrain doesn't actually move - the viewport scrolls through pre-rendered columns stored in video memory. New columns are drawn at the right edge as the viewport moves.

### Memory Layout

```
Video Memory (0xA0000):
+------------------+
| Lines 0-49       | Background image (horizon)
+------------------+
| Lines 50-199     | Scrolling terrain area
+------------------+
| Lines 200-399    | Text overlay buffer
+------------------+

Terrain buffer uses double-buffering:
- Columns 0-87:   Buffer A
- Columns 88-175: Buffer B
```

## Text Rendering System

### Font System
- **Font data**: FONA.INC (118KB bitmap font)
- **Character set**: "ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:()+-*='"
- **Font format**: 32 pixels high, variable width
- **Encoding**: 2 bits per pixel (4 levels: 0x00, 0x40, 0x80, 0xC0)

### Text Overlay Technique

The text is rendered using a clever delta-encoding system:

```c
// From MAIN.C - maketext()
// Pre-compute differences between adjacent pixels
for(x=0; x<320; x+=4) {
    for(y=1; y<184; y++) {
        if(tbuf[y][x] != tbuf[y][x-2]) {
            *p1++ = x/4 + y*176 + 100*176;  // Memory offset
            *p1++ = tbuf[y][x] ^ tbuf[y][x-2];  // XOR difference
        }
    }
    *p1++ = -1;  // End marker
    *p1++ = -1;
}
```

Then during scrolling (ASMYT.ASM - `ascrolltext`):
```assembly
; Apply the pre-computed deltas
@@l3:
    mov bx, [si-4]          ; Get offset
    cmp bx, -1
    je @@l2                 ; End of list
    mov ax, [si-2]          ; Get XOR value
    xor [es:bx+di], al      ; Apply to screen
```

This technique:
1. **Reduces memory**: Only stores changed pixels
2. **Speeds rendering**: XOR operations are fast
3. **Enables smooth scrolling**: Text scrolls with terrain

## Credits Text Content

From MAIN.C, the credits displayed are:

**Screen 1:**
- "A"
- "Future Crew"
- "Production"

**Screen 2:**
- "First Presented"
- "at Assembly 93"

**Screen 3:**
- "in"
- (Two blank lines - likely for logos)

**Scrolling Credits:**
- **Graphics**: Marvel, Pixel
- **Music**: Purple Motion, Skaven
- **Code**: Psi, Trug, Wildfire
- **Additional Design**: Abyss, Gore

## Color Palette System

### Palette Structure
- **64 colors** for terrain (indices 0-63)
- **64 colors** for text layer 1 (indices 64-127)
- **64 colors** for text layer 2 (indices 128-191)
- **64 colors** for text layer 3 (indices 192-255)

### Palette Manipulation

```c
// From MAIN.C - init()
// Create blended palettes for text overlay
for(y=64*3; y<128*3; y+=3) {
    // Blend terrain palette with text color
    palette2[y+0] = (palette[0x1*3+0]*63 + palette[y%(64*3)+0]*(63-palette[0x1*3+0])) >> 6;
    palette2[y+1] = (palette[0x1*3+1]*63 + palette[y%(64*3)+1]*(63-palette[0x1*3+1])) >> 6;
    palette2[y+2] = (palette[0x1*3+2]*63 + palette[y%(64*3)+2]*(63-palette[0x1*3+2])) >> 6;
}
```

### Fade Effects

The effect uses hardware palette fading via the "copper" system:

```assembly
; From COPPER.ASM - copper3
; Incremental palette fade (called every frame)
PROC copper3
    cmp [cs:cop_dofade], 0d
    je @@l1
    dec [cs:cop_dofade]
    
    ; Add fractional color values (16.8 fixed point)
    mov ax, [ds:si+ccc*2]
    add [cs:di+ccc+768], al    ; Add fractional part
    adc [cs:di+ccc], ah        ; Add integer part with carry
```

Fade speeds:
- **128 frames**: Initial terrain fade-in
- **64 frames**: Text fade in/out

## "Copper" System

Named after the Amiga's Copper coprocessor, this system allows per-scanline effects:

### Three Copper Routines:

1. **copper1** - Called at start of frame
   - Sets hardware scroll position (`cop_start`, `cop_scrl`)
   - Updates VGA CRTC registers for smooth scrolling

2. **copper2** - Called during vertical blank
   - Updates palette if `do_pal` flag is set
   - Increments frame counter

3. **copper3** - Called every frame
   - Handles incremental palette fading
   - Updates `fadepal` buffer with fractional color accumulation

### Integration with DIS (Demo Interrupt Server)

```assembly
; From COPPER.ASM - init_copper
mov bx, 7
mov ax, 0              ; Install copper3 as main interrupt
mov cx, OFFSET copper3
mov dx, SEG copper3
int 0fch               ; DIS interrupt

mov ax, 1              ; Install copper1 as secondary
mov cx, OFFSET copper1
int 0fch

mov ax, 2              ; Install copper2 as tertiary
mov cx, OFFSET copper2
int 0fch
```

## Camera Path/Movement

The camera movement is **linear** and **automatic**:

```c
// From MAIN.C - main loop
for(f=60; a<320 && !dis_exit(); ) {
    // a = current X position (0-319)
    // Increments by 1 each frame at 9 frames per scroll step
    do_scroll(1);
}
```

- **Total distance**: 320 pixels (columns)
- **Speed**: 1 pixel per frame (after initial fade-in)
- **Frame rate**: Approximately 70 fps (limited by VGA vertical blank)
- **Duration**: ~4.5 seconds of scrolling

No complex camera path - it's a simple left-to-right scroll through the pre-rendered terrain.

## Performance Optimizations

1. **Planar rendering**: Processes 4 pixels simultaneously using VGA planes
2. **Delta encoding**: Text only stores changed pixels
3. **XOR operations**: Fast pixel manipulation
4. **Hardware scrolling**: No memory copying for smooth scroll
5. **Pre-computed tables**: Font positions, text deltas
6. **Assembly critical paths**: Rendering loops in hand-optimized assembly
7. **Double buffering**: Prevents tearing during column updates

## Technical Specifications Summary

| Aspect | Details |
|--------|---------|
| **Resolution** | 320x400 (200 visible) |
| **Color Depth** | 8-bit (256 colors) |
| **Terrain Method** | Column-based heightmap renderer |
| **Terrain Size** | ~320 columns × 150 pixels high |
| **Frame Rate** | ~70 fps (VGA vblank synced) |
| **Memory Usage** | ~64KB video memory for terrain |
| **Scroll Speed** | 1 pixel per frame |
| **Text Encoding** | Delta/XOR compression |
| **Palette Fades** | 64-128 frame incremental fades |

## Key Differences from True Voxel Rendering

This is **NOT** a voxel renderer like Comanche or Outcast. Key differences:

1. **No ray casting**: Columns are pre-rendered, not traced
2. **No height interpolation**: Each column is a solid fill
3. **No perspective correction**: Simple orthogonal projection
4. **No texture mapping**: Colors are flat per column
5. **2D scrolling**: Only horizontal movement, no forward/backward

It's more accurately described as a **parallax scrolling heightmap** with clever VGA tricks to make it look 3D.

## Conclusion

The ALKU effect is a masterclass in VGA programming and optimization. By combining:
- Custom VGA modes
- Hardware scrolling
- Planar rendering
- Delta-encoded text
- Copper-style palette effects
- Clever memory management

...Wildfire created a visually impressive opening that runs smoothly on a 386 processor. The "voxel terrain" is actually a simpler column-based heightmap renderer, but the execution is so polished that it creates the illusion of a complex 3D landscape.

The code demonstrates the demo scene's philosophy: **understand your hardware deeply, and you can achieve the impossible.**

---

## References

- Original source: https://github.com/mtuomi/SecondReality/tree/master/ALKU
- Fabien Sanglard's analysis: https://fabiensanglard.net/second_reality/
- VGA documentation: http://www.stanford.edu/class/cs140/projects/pintos/specs/freevga/home.htm
- Assembly 1993 demo party (first presentation)

**Author of ALKU part**: WILDFIRE  
**Date**: 1993  
**Platform**: MS-DOS, 386+, VGA
