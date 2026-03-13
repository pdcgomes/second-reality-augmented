/**
 * TECHNO_BARS_TRANSITION — Classic variant (Part 9)
 *
 * Brief transition into the techno bars section. A white flash peaks
 * and hides a palette swap to 16 shades of blue with the framebuffer
 * filled to the brightest index. Four 80-pixel-wide vertical bars are
 * then cleared from top to bottom with accelerating speed, each
 * triggered by a beat-synced flash. A final flash ends the transition.
 *
 * Bar timing is derived from the authoritative music sync points
 * (TECHNO_BAR1–4, TECHNO_BAR_FINAL_FLASH) so the bars land exactly
 * on the beat, regardless of clip boundaries.
 *
 * The blue palette: r = i*3, g = i*3.5, b = i*4 (6-bit VGA values)
 * for indices 0–15. Index 0 = black, index 15 = brightest blue.
 *
 * Bar clearing uses the BarClear[] table: cumulative sum 1+2+3+…+n,
 * giving 20 frames of accelerating top-down wipe per bar.
 *
 * Original code: TECHNO/KOE*.C by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { getSyncTime } from '../../core/musicsync.js';

const W = 320, H = 200;
const FRAME_RATE = 70;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

// Bar clearing table: accelerating line count (cumulative sum 1+2+…+n)
const BAR_CLEAR = new Array(20);
{
  let zy = 0, zya = 0;
  for (let a = 0; a < 20; a++) {
    zya++;
    zy += zya;
    BAR_CLEAR[a] = Math.min(zy, H - 1);
  }
}

// Blue palette (6-bit VGA): 16 shades from black to bright blue
const BLUE_PAL = new Float64Array(16 * 3);
for (let i = 0; i < 16; i++) {
  BLUE_PAL[i * 3] = i * 3;
  BLUE_PAL[i * 3 + 1] = i * 3.5;
  BLUE_PAL[i * 3 + 2] = i * 4;
}

// Flash durations (in seconds, from original 70fps frame counts)
const FLASH_IN_DUR = 4 / FRAME_RATE;       // initial flash ramp-up: 4 frames
const BAR_FLASH_DUR = 8 / FRAME_RATE;      // per-bar flash decay: 8 frames
const FINAL_FLASH_DUR = 4 / FRAME_RATE;    // final flash ramp-up: 4 frames

// Fallback timing from constant-BPM estimate (MUSIC1: 130 BPM, speed 3)
// Row offsets from TECHNO_BARS_TRANSITION: BAR1=12, BAR2=20, BAR3=28, BAR4=36, FINAL=43
const MS_PER_ROW = 2500 / (130 * 1.00231) * 3;
const FALLBACK_BARS = [12, 20, 28, 36].map(r => r * MS_PER_ROW / 1000);
const FALLBACK_FINAL = 43 * MS_PER_ROW / 1000;

let _cachedTiming = null;

function getBarTiming() {
  if (_cachedTiming) return _cachedTiming;

  const base = getSyncTime('TECHNO_BARS_TRANSITION');
  const b1 = getSyncTime('TECHNO_BAR1');

  if (base != null && b1 != null) {
    _cachedTiming = {
      bars: [
        b1 - base,
        getSyncTime('TECHNO_BAR2') - base,
        getSyncTime('TECHNO_BAR3') - base,
        getSyncTime('TECHNO_BAR4') - base,
      ],
      finalFlash: getSyncTime('TECHNO_BAR_FINAL_FLASH') - base,
    };
    return _cachedTiming;
  }

  return { bars: FALLBACK_BARS, finalFlash: FALLBACK_FINAL };
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

let program = null, quad = null, uFrameLoc;
let frameTex = null;
let fb = null, rgba = null;

export default {
  label: 'technoBarsTransition',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');

    fb = new Uint8Array(W * H);
    rgba = new Uint8Array(W * H * 4);

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const timing = getBarTiming();
    const barTimes = timing.bars;
    const finalFlashTime = timing.finalFlash;

    const blueReady = t >= FLASH_IN_DUR;

    // ── Build indexed framebuffer ──

    if (blueReady) {
      fb.fill(15);
      for (let b = 0; b < 4; b++) {
        if (t >= barTimes[b]) {
          const barFrame = Math.floor((t - barTimes[b]) * FRAME_RATE);
          const nLines = BAR_CLEAR[Math.min(barFrame, BAR_CLEAR.length - 1)];
          for (let y = 0; y < nLines; y++) {
            const row = y * W;
            for (let x = b * 80; x < (b + 1) * 80; x++) fb[row + x] = 0;
          }
        }
      }
    } else {
      fb.fill(0);
    }

    // ── Compute flash level ──

    let flashLevel = 0;

    if (t >= finalFlashTime) {
      flashLevel = clamp(Math.floor((t - finalFlashTime) / FINAL_FLASH_DUR * 256), 0, 256);
    } else if (!blueReady) {
      flashLevel = clamp(Math.floor(t / FLASH_IN_DUR * 256), 0, 256);
    } else if (t < barTimes[0]) {
      flashLevel = 256;
    } else {
      let latestBar = -1;
      for (let b = 3; b >= 0; b--) {
        if (t >= barTimes[b]) { latestBar = b; break; }
      }
      if (latestBar >= 0) {
        const dt = t - barTimes[latestBar];
        flashLevel = 256 - clamp(Math.floor(dt / BAR_FLASH_DUR * 256), 0, 256);
      }
    }

    // ── Apply flash: mix palette with white (63 in 6-bit VGA) ──

    const pal = new Float64Array(16 * 3);
    const j = 256 - flashLevel;
    for (let a = 0; a < 16; a++) {
      pal[a * 3] = Math.floor((BLUE_PAL[a * 3] * j + 63 * flashLevel) >> 8);
      pal[a * 3 + 1] = Math.floor((BLUE_PAL[a * 3 + 1] * j + 63 * flashLevel) >> 8);
      pal[a * 3 + 2] = Math.floor((BLUE_PAL[a * 3 + 2] * j + 63 * flashLevel) >> 8);
    }

    // ── Convert indexed framebuffer → RGBA ──

    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < W * H; i++) {
      const ci = fb[i];
      const r = Math.round(clamp(pal[ci * 3], 0, 63) * k);
      const g = Math.round(clamp(pal[ci * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(pal[ci * 3 + 2], 0, 63) * k);
      rgba32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }

    // ── Upload texture and draw ──

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.uniform1i(uFrameLoc, 0);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    if (frameTex) gl.deleteTexture(frameTex);
    program = null;
    quad = null;
    frameTex = null;
    fb = rgba = null;
    _cachedTiming = null;
  },
};
