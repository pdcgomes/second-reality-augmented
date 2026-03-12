/**
 * WATER — Classic variant (Part 19)
 *
 * "Peilipalloscroll" (Mirror Ball Scroller) by TRUG. A chrome/mirror
 * sword image scrolls across a background using pre-computed position
 * lookup tables (same technique as FOREST). Non-zero sword pixels
 * overwrite the background directly; zero pixels show the background.
 * Three interlaced POS passes distribute rendering across frames.
 *
 * Original code: WATER/DEMO.PAS + ROUTINES.ASM by TRUG.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  FONT_W, VIEW_W, VIEW_H,
  PAL_B64, FONT_B64, BG_B64,
  WAT1_B64, WAT2_B64, WAT3_B64,
} from './data.js';

const W = 320, H = 200, PIXELS = W * H;
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

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

let program, quad, uFrameLoc, frameTex;
let rgba, pal, font, tausta, posData;

export default {
  label: 'water',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    pal = b64ToUint8(PAL_B64);
    font = b64ToUint8(FONT_B64);
    tausta = b64ToUint8(BG_B64);
    posData = [b64ToUint8(WAT1_B64), b64ToUint8(WAT2_B64), b64ToUint8(WAT3_B64)];

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
    const scrollSteps = Math.floor(frame / 3);

    // Build the font sliding window (158×34)
    const fbuf = new Uint8Array(VIEW_W * VIEW_H);
    let scp = scrollSteps;
    if (scp > FONT_W - 10) scp = FONT_W - 10;

    // The font scrolls one column per step; fill the window from the source
    const srcStart = scp - VIEW_W + 1;
    for (let col = 0; col < VIEW_W; col++) {
      const srcCol = srcStart + col;
      for (let row = 0; row < VIEW_H - 1; row++) {
        if (srcCol >= 0 && srcCol < FONT_W) {
          fbuf[row * VIEW_W + col] = font[row * FONT_W + srcCol];
        }
      }
    }

    // Start with background
    const fb = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) fb[i] = tausta[i];

    // Apply all 3 POS passes
    for (let pass = 0; pass < 3; pass++) {
      scr(pass, fbuf, fb);
    }

    // Palette fade: in at start, out at end
    const totalFrames = Math.floor(28.9 * FRAME_RATE);
    const activePal = new Uint8Array(768);
    if (frame < 63) {
      const level = frame / 63;
      for (let i = 0; i < 768; i++) activePal[i] = Math.floor(pal[i] * level);
    } else if (frame > totalFrames - 63) {
      const level = clamp(1 - (frame - (totalFrames - 63)) / 63, 0, 1);
      for (let i = 0; i < 768; i++) activePal[i] = Math.floor(pal[i] * level);
    } else {
      for (let i = 0; i < 768; i++) activePal[i] = pal[i];
    }

    // Convert indexed framebuffer to RGBA
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < PIXELS; i++) {
      const ci = fb[i];
      const r = Math.round(clamp(activePal[ci * 3], 0, 63) * k);
      const g = Math.round(clamp(activePal[ci * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(activePal[ci * 3 + 2], 0, 63) * k);
      rgba32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }

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
    program = null; quad = null; frameTex = null;
    rgba = pal = font = tausta = posData = null;
  },
};

function scr(pass, fbuf, fb) {
  const pos = posData[pass];
  let posIdx = 0, fontIdx = 0;
  const totalPixels = VIEW_W * VIEW_H;
  for (let dx = 0; dx < totalPixels; dx++) {
    if (posIdx + 1 >= pos.length) break;
    const count = pos[posIdx] | (pos[posIdx + 1] << 8);
    posIdx += 2;
    if (count !== 0) {
      for (let i = 0; i < count; i++) {
        if (posIdx + 1 >= pos.length) break;
        const dest = pos[posIdx] | (pos[posIdx + 1] << 8);
        posIdx += 2;
        if (dest < PIXELS && fontIdx < fbuf.length) {
          let pv = fbuf[fontIdx];
          if (pv === 0) pv = tausta[dest];
          fb[dest] = pv;
        }
      }
    }
    fontIdx++;
  }
}
