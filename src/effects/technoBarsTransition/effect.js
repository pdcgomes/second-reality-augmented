/**
 * TECHNO_BARS_TRANSITION — Classic variant (Part 9)
 *
 * Brief transition into the techno bars section. A white flash peaks
 * and hides a palette swap to 16 shades of blue with the framebuffer
 * filled to the brightest index. Four 80-pixel-wide vertical bars are
 * then cleared from top to bottom with accelerating speed, each
 * triggered by a beat-synced flash. A final flash ends the transition.
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

// Timing (frame numbers at 70fps) — approximates original music sync points.
// The clip is ~0.7s (49 frames). Bars are spaced at ~8-frame intervals
// (~114ms ≈ 16th note at 130 BPM).
const FLASH_IN_FRAMES = 4;
const BAR_SYNC = [6, 14, 22, 30];
const BAR_FLASH_FRAMES = 8;
const FINAL_FLASH_FRAME = 44;

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
    const frame = Math.floor(t * FRAME_RATE);
    const blueReady = frame >= FLASH_IN_FRAMES;

    // ── Build indexed framebuffer (O(1) — reconstructed each call) ──

    if (blueReady) {
      fb.fill(15);
      for (let b = 0; b < 4; b++) {
        if (frame >= BAR_SYNC[b]) {
          const barFrame = frame - BAR_SYNC[b];
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

    if (frame >= FINAL_FLASH_FRAME) {
      flashLevel = clamp(Math.floor((frame - FINAL_FLASH_FRAME) * 256 / FLASH_IN_FRAMES), 0, 256);
    } else if (!blueReady) {
      flashLevel = clamp(Math.floor(frame * 256 / FLASH_IN_FRAMES), 0, 256);
    } else if (frame < BAR_SYNC[0]) {
      flashLevel = 256;
    } else {
      let latestBar = -1;
      for (let b = 3; b >= 0; b--) {
        if (frame >= BAR_SYNC[b]) { latestBar = b; break; }
      }
      if (latestBar >= 0) {
        const dt = frame - BAR_SYNC[latestBar];
        flashLevel = 256 - clamp(Math.floor(dt * 256 / BAR_FLASH_FRAMES), 0, 256);
      }
    }

    // ── Apply flash: mix palette with white (63 in 6-bit VGA) ──

    const savedPal = blueReady ? BLUE_PAL : BLUE_PAL;
    const pal = new Float64Array(16 * 3);
    const j = 256 - flashLevel;
    for (let a = 0; a < 16; a++) {
      pal[a * 3] = Math.floor((savedPal[a * 3] * j + 63 * flashLevel) >> 8);
      pal[a * 3 + 1] = Math.floor((savedPal[a * 3 + 1] * j + 63 * flashLevel) >> 8);
      pal[a * 3 + 2] = Math.floor((savedPal[a * 3 + 2] * j + 63 * flashLevel) >> 8);
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
  },
};
