# Second Reality ALKU Effect - Complete Analysis

This repository contains a comprehensive technical analysis of the ALKU effect from Future Crew's legendary 1993 demo "Second Reality".

## What is ALKU?

ALKU (Finnish for "beginning") is the opening credits sequence of Second Reality, featuring:
- A scrolling voxel-like terrain landscape
- Smooth horizontal camera movement
- Text overlays with credits
- Palette-based fade effects
- All running at 70fps on a 386 processor

## Documents in This Repository

### 1. [ALKU_ANALYSIS.md](ALKU_ANALYSIS.md)
**Main technical analysis** covering:
- Architecture and file structure
- Video mode configuration
- Terrain rendering algorithm (column-based heightmap)
- Text rendering system
- Credits content
- Color palette system
- "Copper" effects system
- Camera movement
- Performance optimizations

### 2. [ALKU_RENDERING_DIAGRAM.md](ALKU_RENDERING_DIAGRAM.md)
**Visual explanations** including:
- Memory layout diagrams
- Column rendering process
- Scrolling mechanism
- Text overlay delta encoding
- Palette layout
- Copper system timing
- Data flow diagrams
- Performance breakdown
- Comparison with true voxel rendering

### 3. [ALKU_CODE_DETAILS.md](ALKU_CODE_DETAILS.md)
**Detailed code analysis** with:
- Annotated assembly and C code
- VGA register manipulation
- Rendering algorithms explained
- Optimization techniques
- Memory maps
- CPU cycle analysis
- Synchronization with music
- Tricks and techniques

## Key Findings

### Not a Voxel Renderer
Despite appearances, ALKU is **not** a true voxel renderer like Comanche. It's a **column-based heightmap renderer** that:
- Pre-renders vertical columns
- Uses simple fill operations (not ray casting)
- Scrolls horizontally only (no forward/backward movement)
- Achieves 70fps on a 386 (vs ~20fps for true voxel engines)

### Hardware Mastery
The effect extensively uses VGA hardware features:
- **Planar mode**: 4 bitplanes for parallel pixel processing
- **Hardware scrolling**: Smooth movement without memory copying
- **Palette manipulation**: Smooth fades via "copper" effects
- **Custom video mode**: 320x400 tweaked from mode 13h

### Clever Optimizations
- **Delta encoding**: Text overlay stores only changed pixels
- **XOR operations**: Fast, reversible pixel manipulation
- **Loop unrolling**: Assembly macros for performance
- **Double buffering**: Prevents tearing
- **Fixed-point math**: Smooth fades without floating point

### Efficient Resource Usage
- **CPU usage**: ~45% per frame (plenty left for music)
- **Memory**: ~64KB video memory for terrain
- **Bandwidth**: ~1% of VGA capability
- **Frame rate**: 70fps (VBlank limited)

## Technical Specifications

| Aspect | Value |
|--------|-------|
| **Resolution** | 320x400 (200 visible) |
| **Color Depth** | 8-bit (256 colors) |
| **Video Mode** | Custom tweaked planar mode |
| **Frame Rate** | ~70 fps |
| **Platform** | MS-DOS, 386+, VGA |
| **Year** | 1993 |
| **Coder** | WILDFIRE |
| **Demo** | Second Reality by Future Crew |

## Source Code

Original source code: https://github.com/mtuomi/SecondReality/tree/master/ALKU

Key files:
- `MAIN.C` - Main control logic (541 lines)
- `ASMYT.ASM` - Text scrolling (109 lines)
- `COPPER.ASM` - VGA effects (149 lines)
- `TWEAK.ASM` - VGA mode setup (333 lines)
- `HOI.IN0` - Heightmap data
- `HOI.IN1` - Texture data
- `FONA.INC` - Font data (118KB)

## Additional Resources

- **Fabien Sanglard's Analysis**: https://fabiensanglard.net/second_reality/
- **VGA Documentation**: http://www.stanford.edu/class/cs140/projects/pintos/specs/freevga/home.htm
- **Michael Abrash's Graphics Programming Black Book**: http://www.gamedev.net/page/resources/_/technical/graphics-programming-and-theory/graphics-programming-black-book-r1698
- **Second Reality on YouTube**: https://www.youtube.com/watch?v=KTjnt_WSJu8

## Historical Context

**Second Reality** was released at Assembly 1993 and became one of the most influential demos in PC demo scene history. The ALKU effect set the tone for the entire demo, showcasing Future Crew's technical prowess and artistic vision.

The demo pushed the boundaries of what was thought possible on PC hardware, inspiring countless programmers and helping establish the PC as a serious platform for demo scene productions (previously dominated by Amiga).

## Credits

**ALKU Effect:**
- Code: WILDFIRE
- Part of: Second Reality
- Group: Future Crew
- Released: Assembly 1993

**This Analysis:**
- Based on original source code from Mikael Tuomi
- Informed by Fabien Sanglard's code review
- Compiled: 2025

## License

This analysis is provided for educational purposes. The original Second Reality source code is available under its original license at https://github.com/mtuomi/SecondReality.

## Why This Matters

The ALKU effect demonstrates timeless principles of systems programming:

1. **Know Your Hardware**: Deep understanding of VGA enables impossible-seeming effects
2. **Optimize Ruthlessly**: Every cycle counts when pushing hardware limits
3. **Clever Algorithms**: Simple heightmap beats complex voxel engine
4. **Trade-offs**: Sacrifice flexibility for performance where it matters
5. **Polish**: Smooth execution makes simple techniques look magical

These lessons remain relevant today, whether programming GPUs, embedded systems, or high-performance applications.

---

*"The demo scene is about making the impossible possible through deep hardware knowledge and clever programming."* - Demo scene philosophy

## Further Exploration

To truly understand ALKU, I recommend:

1. **Read the source code**: Start with MAIN.C, then ASMYT.ASM
2. **Study VGA documentation**: Understanding the hardware is key
3. **Watch the demo**: See the effect in context
4. **Experiment**: Try modifying the code (DOSBox + TASM/Turbo C)
5. **Read Fabien's analysis**: Covers the entire demo architecture

The demo scene represents some of the finest examples of optimization and creative programming in computer history. ALKU is a perfect case study.
