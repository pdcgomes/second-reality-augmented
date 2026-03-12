# ALKU Effect - Code Implementation Details

## Critical Code Sections Explained

### 1. VGA Mode Setup (TWEAK.ASM)

```assembly
; tw_opengraph - Initialize custom 320x400 planar mode
PROC tw_opengraph
    mov ax, 13h              ; Start with mode 13h (320x200, 256 colors)
    int 10h                  ; BIOS video interrupt
    
    ; Disable chain-4 mode to access all 4 planes independently
    mov dx, 03c4h            ; Sequencer register
    mov ax, 0604h            ; Memory Mode register, disable chain-4
    out dx, ax
    
    ; Clear all video memory (all 4 planes)
    mov ax, 0f02h            ; Write to all planes
    out dx, ax
    mov dx, 0a000h
    mov es, dx
    xor di, di
    xor ax, ax
    mov cx, 8000h            ; 32KB × 4 planes = 128KB
    rep stosw
    
    ; Configure CRTC for custom mode
    mov dx, 03d4h            ; CRTC register
    mov ax, 0014h            ; Underline Location = 0 (long mode off)
    out dx, ax
    
    mov ax, 0e317h           ; Mode Control = 0xE3 (byte mode on)
    out dx, ax
    
    mov ax, 0009h            ; Maximum Scan Line = 0 (400 line mode)
    out dx, ax
    
    mov ax, 5813h            ; Offset = 88 (88 bytes × 4 planes = 352 pixels)
    out dx, ax               ; But we only use 320 pixels width
    
    mov ax, 07018h           ; Line Compare = 0x70 (split screen)
    out dx, ax
    
    mov ax, 1f07h            ; Overflow register (8th bit of line compare)
    out dx, ax
    
    ret
ENDP
```

**What this does:**
- Creates a 320-pixel wide, 400-line tall display
- Uses planar mode (4 bitplanes) instead of linear mode
- Each scanline is 88 bytes × 4 planes = 352 pixels of storage
- Only 320 pixels are visible, giving 32 pixels of overscan buffer

### 2. Terrain Column Rendering (ASMYT.ASM)

```assembly
; outline - Render one vertical column of terrain
; Arguments:
;   src:dword  - Pointer to heightmap data (4 bytes per column)
;   dest:dword - Destination in video memory
PROC C outline
    ARG src:dword, dest:dword
    
    push ds es si di
    
    mov [cs:mrol], 0802h     ; Start with plane 3 (bit pattern 1000)
    mov cx, 4d               ; Render 4 planes
    
@@l1:
    ; Select which VGA plane to write to
    mov dx, 3c4h             ; Sequencer Address Register
    mov ax, [cs:mrol]        ; Map Mask register + plane selection
    out dx, ax               ; Only writes to selected plane
    
    ; Load source and destination pointers
    lds si, [src]
    add si, cx
    dec si                   ; Offset for current plane
    les di, [dest]
    
    ; Clear top pixels (above terrain)
    xor ax, ax
    mov [es:di-352], al      ; Clear previous scanline
    mov [es:di-352+176], al  ; Both buffers
    
    ; Render first 75 scanlines
    ccc=0
    REPT 75
    mov al, [ds:si+ccc*640]      ; Read heightmap value
    mov [es:di+ccc*352], al      ; Write to screen (buffer A)
    mov [es:di+ccc*352+176], al  ; Write to screen (buffer B)
    ccc=ccc+1
    ENDM
    
    ; Move to next segment (DOS segment addressing)
    mov ax, ds
    add ax, 75*40            ; 75 lines × 640 bytes per line / 16
    mov ds, ax
    
    ; Render next 75 scanlines (total 150)
    ccc=0
    REPT 75
    mov al, [ds:si+ccc*640]
    mov [es:di+ccc*352+75*352], al
    mov [es:di+ccc*352+75*352+176], al
    ccc=ccc+1
    ENDM
    
    ; Move to next plane
    shr [cs:(Byte mrol+1)], 1d   ; Shift plane mask right
    dec cx
    jnz @@l1                     ; Loop for all 4 planes
    
    pop di si es ds
    ret
ENDP
```

**Key points:**
- Renders 4 pixels horizontally (one per plane) in one pass
- Renders 150 pixels vertically (terrain height)
- Writes to both buffer A and buffer B simultaneously
- Uses `REPT` macro for loop unrolling (performance optimization)

### 3. Scrolling Control (MAIN.C)

```c
// do_scroll - Advance the scrolling terrain by one pixel
int do_scroll(int mode) {
    // mode: 0=wait only, 1=scroll+render, 2=render without scroll
    
    if(mode == 0 && frame_count < SCRLF) 
        return 0;
    
    // Wait for enough frames (SCRLF = 9 frames per scroll)
    while(frame_count < SCRLF);
    frame_count -= SCRLF;
    
    // Update text overlay if in scroll mode
    if(mode == 1) 
        ascrolltext(a + p*352, dtau);
    
    // Set hardware scroll registers
    cop_start = a/4 + p*88;      // Video memory start offset
    cop_scrl = (a&3)*2;          // Pixel-level scroll (0,2,4,6)
    
    // Every 4 pixels, render a new column at the right edge
    if((a&3) == 0) {
        int col = a/4 + 86;      // Column to render
        
        // Render to both screen halves
        outline(
            MK_FP(FP_SEG(hzpic), FP_OFF(hzpic) + col*4 + 784),
            MK_FP(0x0a000, col + 176*50)
        );
        outline(
            MK_FP(FP_SEG(hzpic), FP_OFF(hzpic) + col*4 + 784),
            MK_FP(0x0a000, col + 176*50 + 88)
        );
    }
    
    a += 1;      // Advance position
    p ^= 1;      // Toggle buffer
    
    return 1;
}
```

**Scroll calculation explained:**
- `a` ranges from 0 to 319 (pixel position)
- `a/4` converts pixel position to byte offset (4 pixels per byte in planar mode)
- `p*88` toggles between buffer A (offset 0) and buffer B (offset 88)
- `(a&3)*2` gives fine pixel scroll: 0,2,4,6 (VGA pixel panning register)

### 4. Text Delta Encoding (MAIN.C)

```c
// maketext - Pre-compute text rendering deltas
void maketext(int scrl) {
    char far *vvmem = MK_FP(0x0a000, 0);
    int *p1 = dtau;  // Delta table pointer
    int mtau[] = {1*256+2, 2*256+2, 4*256+2, 8*256+2};  // Plane masks
    int m, x, y;
    
    // Build delta tables for each plane
    for(m = 0; m < 4; m++) {
        // Scan through text buffer, looking for changes
        for(x = m; x < 320; x += 4) {
            for(y = 1; y < 184; y++) {
                // If pixel differs from 2 pixels to the left
                if(tbuf[y][x] != tbuf[y][x-2]) {
                    // Store offset and XOR value
                    *p1++ = x/4 + y*176 + 100*176;
                    *p1++ = tbuf[y][x] ^ tbuf[y][x-2];
                }
            }
        }
        *p1++ = -1;  // End marker
        *p1++ = -1;
    }
    
    // Now render the text immediately to screen
    for(x = 0; x < 320; x++) {
        outport(0x3c4, mtau[(x+scrl)&3]);
        outport(0x3ce, ((x+scrl)&3)*256+4);
        
        for(y = 1; y < 184; y++) {
            // XOR the text into video memory
            vvmem[y*176 + 176*100 + (x+scrl)/4] ^= tbuf[y][x-1-1];
            vvmem[y*176 + 176*100 + (x+scrl)/4 + 88] ^= tbuf[y][x-1];
        }
    }
}
```

**Why XOR?**
- XOR is reversible: `A ^ B ^ B = A`
- Applying the same XOR twice removes the change
- Perfect for toggling text on/off
- Fast single-cycle operation

### 5. Text Scrolling (ASMYT.ASM)

```assembly
; ascrolltext - Apply pre-computed text deltas during scroll
; Arguments:
;   scrl:word - Current scroll position
;   text:dword - Pointer to delta table
PROC C ascrolltext
    ARG scrl:word, text:dword
    
    push ds es si di
    push 0a000h
    pop es
    lds si, [text]           ; Load delta table pointer
    mov cx, 0d               ; Start with plane 0
    
@@l1:
    ; Calculate plane selection
    mov bx, cx
    add bx, [scrl]
    and bx, 3d               ; Modulo 4
    shl bx, 1d               ; × 2 for word lookup
    
    ; Set VGA plane for writing
    mov ax, [cs:mmask+bx]
    mov dx, 3c4h
    out dx, ax
    
    ; Set VGA plane for reading
    mov ax, [cs:rmask+bx]
    mov dx, 3ceh
    out dx, ax
    
    ; Calculate base offset
    mov di, cx
    add di, [scrl]
    shr di, 2d               ; Convert to byte offset
    
@@l3:
    ; Process 20 deltas at a time (loop unrolling)
    REPT 20
    add si, 4d               ; Advance to next delta
    mov bx, [si-4]           ; Load offset
    cmp bx, -1
    je @@l2                  ; End of list?
    mov ax, [si-2]           ; Load XOR value
    xor [es:bx+di], al       ; Apply to screen
    ENDM
    jmp @@l3
    
@@l2:
    inc cx
    cmp cx, 4d
    jne @@l1                 ; Next plane
    
    pop di si es ds
    ret
ENDP
```

**Optimization techniques:**
- Loop unrolling (20 deltas per iteration)
- Direct VGA register manipulation
- Minimal branching
- Pre-computed offsets

### 6. Copper System (COPPER.ASM)

```assembly
; copper1 - Called at start of frame (highest priority)
PROC copper1
    ; Update hardware scroll position
    mov dx, 03d4h            ; CRTC Address Register
    mov al, 0dh              ; Start Address Low
    mov ah, [Byte cs:cop_start]
    out dx, ax
    
    mov al, 0ch              ; Start Address High
    mov ah, [Byte cs:cop_start+1]
    out dx, ax
    
    ; Update pixel panning
    mov dx, 3c0h             ; Attribute Controller
    mov al, 33h              ; Pixel Panning register
    out dx, al
    mov ax, [cs:cop_scrl]
    out dx, al
    
    retf                     ; Far return (called via DIS)
ENDP

; copper2 - Called during VBlank
PROC copper2
    inc [cs:frame_count]     ; Increment frame counter
    
    cmp [cs:do_pal], 0d
    je @@no_pal
    
    ; Update palette
    pusha
    push ds
    lds si, [cs:cop_pal]     ; Load palette pointer
    mov cx, 768d             ; 256 colors × 3 components
    mov dx, 3c8h             ; Palette Index Register
    mov al, 0d               ; Start at color 0
    out dx, al
    inc dx                   ; Palette Data Register
    rep outsb                ; Blast out palette
    mov [cs:do_pal], 0d
    pop ds
    popa
    
@@no_pal:
    retf
ENDP

; copper3 - Called every frame (palette fading)
PROC copper3
    cmp [cs:cop_dofade], 0d
    je @@l1
    dec [cs:cop_dofade]      ; Decrement fade counter
    
    push ds si di cx
    
    ; Point palette update to fade buffer
    mov [Word cs:cop_pal], OFFSET fadepal
    mov [Word cs:cop_pal+2], SEG fadepal
    mov [do_pal], 1d
    
    ; Load fade increment table
    lds si, [cs:cop_fadepal]
    mov di, OFFSET fadepal
    mov cx, 768/16d          ; Process 16 colors at a time
    
@@l4:
    ; Add fractional color values (16.8 fixed point)
    ccc=0
    REPT 16
    mov ax, [ds:si+ccc*2]        ; Load increment (hi=int, lo=frac)
    add [cs:di+ccc+768], al      ; Add fractional part
    adc [cs:di+ccc], ah          ; Add integer part with carry
    ccc=ccc+1
    ENDM
    
    add di, 16d
    add si, 32d
    dec cx
    jnz @@l4
    
    pop cx di si ds
    
@@l1:
    retf
ENDP
```

**Fixed-point arithmetic:**
- Each color component uses 16.8 fixed point
- High byte: integer part (0-63 for VGA)
- Low byte: fractional part (for smooth fading)
- Carry propagates from fractional to integer

### 7. Palette Blending (MAIN.C)

```c
// init - Initialize palettes and blending
void init() {
    // ... (VGA setup code)
    
    // Copy base palette from image
    memcpy(palette, hzpic+16, 768);
    
    // Create blended palettes for text layers
    for(y = 0; y < 768; y += 3) {
        if(y < 64*3) {
            // First 64 colors: terrain (unchanged)
            palette2[y+0] = palette[y+0];
            palette2[y+1] = palette[y+1];
            palette2[y+2] = palette[y+2];
        }
        else if(y < 128*3) {
            // Colors 64-127: blend with color 1
            int base = 0x1*3;  // Base color index
            palette2[y+0] = (fade2[y+0] = palette[base+0]) * 63 + 
                           palette[y%(64*3)+0] * (63-palette[base+0]) >> 6;
            palette2[y+1] = (fade2[y+1] = palette[base+1]) * 63 + 
                           palette[y%(64*3)+1] * (63-palette[base+1]) >> 6;
            palette2[y+2] = (fade2[y+2] = palette[base+2]) * 63 + 
                           palette[y%(64*3)+2] * (63-palette[base+2]) >> 6;
        }
        else if(y < 192*3) {
            // Colors 128-191: blend with color 2
            int base = 0x2*3;
            // ... (same blending formula)
        }
        else {
            // Colors 192-255: blend with color 3
            int base = 0x3*3;
            // ... (same blending formula)
        }
    }
    
    // Wrap palette for smooth scrolling
    for(a = 192; a < 768; a++) 
        palette[a] = palette[a-192];
    
    // Pre-compute fade increments
    for(a = 0; a < 768; a++) {
        textin[a] = (palette2[a] - palette[a]) * 256 / 64;
        textout[a] = (palette[a] - palette2[a]) * 256 / 64;
        picin[a] = (palette[a] - fade1[a]) * 256 / 128;
    }
}
```

**Blending formula explained:**
```
result = (base_color * 63 + terrain_color * (63 - base_color)) / 64

Example:
  base_color = 40 (text color)
  terrain_color = 20 (ground color)
  
  result = (40 * 63 + 20 * (63 - 40)) / 64
         = (2520 + 20 * 23) / 64
         = (2520 + 460) / 64
         = 2980 / 64
         = 46.5 ≈ 46
  
This creates a color that's mostly the text color but slightly
influenced by the terrain, giving a semi-transparent effect.
```

## Memory Map

```
DOS Memory Layout:
┌─────────────────────────────────────┐ 0x00000
│ Interrupt Vector Table              │
├─────────────────────────────────────┤ 0x00400
│ BIOS Data Area                      │
├─────────────────────────────────────┤ 0x00500
│ DOS Kernel                          │
├─────────────────────────────────────┤ ~0x10000
│ ALKU.EXE Code Segment               │
│ - MAIN.C compiled code              │
│ - Assembly routines                 │
├─────────────────────────────────────┤
│ ALKU.EXE Data Segment               │
│ - Variables (palette, tbuf, etc)    │
│ - dtau[] (30000 ints = 60KB)        │
│ - tbuf[] (186×352 = 65KB)           │
├─────────────────────────────────────┤
│ Far Data Segments                   │
│ - hzpic[] (heightmap data)          │
│ - font[] (31×1500 = 46KB)           │
├─────────────────────────────────────┤
│ Stack                               │
├─────────────────────────────────────┤
│ Free Memory                         │
└─────────────────────────────────────┘

VGA Memory (0xA0000-0xAFFFF):
┌─────────────────────────────────────┐ 0xA0000
│ Plane 0 (32KB)                      │
├─────────────────────────────────────┤ 0xA8000
│ Plane 1 (32KB)                      │
├─────────────────────────────────────┤ 0xB0000
│ Plane 2 (32KB)                      │
├─────────────────────────────────────┤ 0xB8000
│ Plane 3 (32KB)                      │
└─────────────────────────────────────┘ 0xC0000

Note: In planar mode, all 4 planes are accessed
through the same 0xA0000-0xAFFFF window using
VGA registers to select which plane(s) to read/write.
```

## Performance Analysis

### CPU Cycles per Frame (386DX-40MHz)

```
Operation                    Cycles      Percentage
─────────────────────────────────────────────────
Hardware scroll update         ~100      0.01%
New column render (every 4th) ~8,000     0.8%
Text delta apply              ~4,000     0.4%
Palette update (when needed)  ~2,000     0.2%
Frame synchronization         ~1,000     0.1%
Music playback (DIS)        ~50,000     5.0%
VBlank wait              ~560,000      56.0%
Idle time                ~374,900      37.5%
─────────────────────────────────────────────────
Total per frame          ~1,000,000    100.0%

Frame time: 14.3ms (70 Hz)
CPU time used: ~6.5ms (45%)
Idle time: ~7.8ms (55%)
```

### Memory Bandwidth

```
Per Frame:
- Column render: 150 bytes × 4 planes = 600 bytes
- Text deltas: ~100 XOR operations = 100 bytes
- Palette update: 768 bytes (when active)
Total: ~1,470 bytes per frame

Per Second (70 fps):
- ~103 KB/sec video memory writes
- VGA can handle ~10 MB/sec
- Bandwidth usage: ~1%
```

## Synchronization with Music

```c
// From MAIN.C - main() function
while(dis_sync() < 1 && !dis_exit());  // Wait for music cue 1
prtc(160, 120, "A");
// ... render text ...
dofade(fade1, fade2);                  // Fade in
wait(300);                             // Wait 300 frames (~4.3 sec)
dofade(fade2, fade1);                  // Fade out

while(dis_sync() < 2 && !dis_exit());  // Wait for music cue 2
// ... next screen ...

while(dis_sync() < 3 && !dis_exit());  // Wait for music cue 3
// ... start scrolling ...

while(dis_sync() < 4 && !dis_exit());  // Wait for music cue 4
// ... graphics credits ...
```

The `dis_sync()` function returns the current music position:
- 0 = Not started
- 1 = "Future Crew" cue
- 2 = "Assembly 93" cue
- 3 = Start scrolling
- 4 = Graphics credits
- 5 = Music credits
- 6 = Code credits
- 7 = Additional design credits
- 8 = Exit

## Tricks and Optimizations

1. **Loop Unrolling**: `REPT` macros expand loops at compile time
2. **Planar Rendering**: Process 4 pixels simultaneously
3. **Hardware Scrolling**: No memory copying needed
4. **Delta Encoding**: Only store changed pixels
5. **XOR Operations**: Fast, reversible pixel manipulation
6. **Fixed-Point Math**: Smooth fades without floating point
7. **Double Buffering**: Prevent tearing
8. **Pre-computed Tables**: Font positions, text deltas
9. **Far Pointers**: Access >64KB data segments
10. **Copper System**: Offload timing to interrupt handlers

## Conclusion

The ALKU effect demonstrates mastery of:
- VGA hardware programming
- x86 assembly optimization
- Memory management
- Real-time synchronization
- Visual effects composition

All running smoothly on a 386 processor with plenty of CPU time left for music playback. This is the essence of demo scene programming: **maximum visual impact with minimal resources**.
