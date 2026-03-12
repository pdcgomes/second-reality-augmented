/**
 * LENS_LENS — Classic variant (Part 14)
 *
 * A see-through bouncing crystal ball over the KOE background image.
 * The lens distorts the background using pre-computed pixel lookup maps
 * stored in LENS_EX[1-4]. Transparency is palette-based: background
 * uses indices 0-63, lens layers use 64-127, 128-191, 192-255 via
 * OR masking. The lens bounces with gravity and dampened rebounds.
 *
 * Original code: LENS/MAIN.C part2() + CALC.C by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  LENS_W, LENS_H,
  LENS_PAL_B64, LENS_PIX_B64,
  LENS_EX0_B64, LENS_EX1_B64, LENS_EX2_B64, LENS_EX3_B64, LENS_EX4_B64,
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

function u16(buf, off) { return buf[off] | (buf[off + 1] << 8); }
function s16(buf, off) {
  const v = buf[off] | (buf[off + 1] << 8);
  return v >= 32768 ? v - 65536 : v;
}

let program, quad, uFrameLoc, frameTex;
let rgba, back, basePal, fullPal;
let lensEx1, lensEx2, lensEx3, lensEx4;
let lensXS, lensYS;
let fade2;

export default {
  label: 'lens',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    basePal = b64ToUint8(LENS_PAL_B64);
    back = b64ToUint8(LENS_PIX_B64);

    const ex0 = b64ToUint8(LENS_EX0_B64);
    lensEx1 = b64ToUint8(LENS_EX1_B64);
    lensEx2 = b64ToUint8(LENS_EX2_B64);
    lensEx3 = b64ToUint8(LENS_EX3_B64);
    lensEx4 = b64ToUint8(LENS_EX4_B64);

    lensXS = Math.floor(LENS_W / 2);
    lensYS = Math.floor(LENS_H / 2);

    // Build full palette with lens color mixing (from EX0 header)
    fullPal = new Uint8Array(768);
    for (let i = 0; i < 768; i++) fullPal[i] = basePal[i];

    let cp = 4;
    for (let i = 1; i < 4; i++) {
      const lr = ex0[cp++], lg = ex0[cp++], lb = ex0[cp++];
      for (let a = 0; a < 64; a++) {
        fullPal[(i * 64 + a) * 3] = Math.min(lr + basePal[a * 3], 63);
        fullPal[(i * 64 + a) * 3 + 1] = Math.min(lg + basePal[a * 3 + 1], 63);
        fullPal[(i * 64 + a) * 3 + 2] = Math.min(lb + basePal[a * 3 + 2], 63);
      }
    }

    // Build fade2 table: 32 opacity levels for lens palette (indices 64-255)
    fade2 = new Float64Array(32 * 192 * 3);
    let idx = 0;
    for (let x = 0; x < 32; x++) {
      for (let y = 64 * 3; y < 256 * 3; y++) {
        const a = y % (64 * 3);
        fade2[idx++] = fullPal[y] - fullPal[a] * (31 - x) / 31;
      }
    }

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

    // Replay lens position physics
    let lx = 65 * 64, ly = -50 * 64, lxa = 64, lya = 64;
    let firstBounce = true;
    for (let f = 0; f < frame; f++) {
      lx += lxa; ly += lya;
      if (lx > 256 * 64 || lx < 60 * 64) lxa = -lxa;
      if (ly > 150 * 64 && f < 600) {
        ly -= lya;
        if (firstBounce) { lya = Math.floor(-lya * 2 / 3); firstBounce = false; }
        else lya = Math.floor(-lya * 9 / 10);
      }
      lya += 2;
    }

    const x0 = Math.floor(lx / 64);
    const y0 = Math.floor(ly / 64);

    // Build active palette with fade-in for lens colors
    const activePal = new Uint8Array(768);
    for (let i = 0; i < 768; i++) activePal[i] = fullPal[i];

    if (frame < 96) {
      const fadeLevel = Math.max(Math.floor((frame - 32) / 2), 0);
      const off = fadeLevel * 192 * 3;
      for (let ci = 64; ci < 256; ci++) {
        const fi = (ci - 64) * 3;
        activePal[ci * 3] = clamp(Math.round(fade2[off + fi]), 0, 63);
        activePal[ci * 3 + 1] = clamp(Math.round(fade2[off + fi + 1]), 0, 63);
        activePal[ci * 3 + 2] = clamp(Math.round(fade2[off + fi + 2]), 0, 63);
      }
    }

    // Start with background
    const fb = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) fb[i] = back[i];

    // Draw lens at (x0, y0)
    drawLens(fb, x0, y0);

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
    rgba = back = basePal = fullPal = fade2 = null;
    lensEx1 = lensEx2 = lensEx3 = lensEx4 = null;
  },
};

function drawLens(fb, x0, y0) {
  const ys = Math.floor(LENS_H / 2);
  const ye = LENS_H - 1;
  let u1 = (x0 - lensXS) + (y0 - lensYS) * W;
  let u2 = (x0 - lensXS) + (y0 + lensYS - 1) * W;

  for (let y = 0; y < ys; y++) {
    if (u1 >= 0 && u1 < PIXELS) {
      dorow(lensEx1, u1, y, 0x40, fb);
      dorow2(lensEx2, u1, y, 0x80, fb);
      dorow2(lensEx3, u1, y, 0xC0, fb);
      dorow3(lensEx4, u1, y, fb);
    }
    u1 += W;
    if (u2 >= 0 && u2 < PIXELS) {
      dorow(lensEx1, u2, ye - y, 0x40, fb);
      dorow2(lensEx2, u2, ye - y, 0x80, fb);
      dorow2(lensEx3, u2, ye - y, 0xC0, fb);
      dorow3(lensEx4, u2, ye - y, fb);
    }
    u2 -= W;
  }
}

function dorow(buf, lensPos, curY, mask, fb) {
  const segIdx = u16(buf, curY * 4);
  const nPix = u16(buf, curY * 4 + 2);
  if (nPix === 0) return;
  const baseAddr = lensPos + s16(buf, segIdx);
  let si = segIdx + 2;
  let dest = baseAddr;
  for (let i = 0; i < nPix; i++) {
    const src = baseAddr + s16(buf, si);
    si += 2;
    if (dest >= 0 && dest < PIXELS && src >= 0 && src < PIXELS) {
      fb[dest] = back[src] | mask;
    }
    dest++;
  }
}

function dorow2(buf, lensPos, curY, mask, fb) {
  const pixIdx = u16(buf, curY * 4);
  const nPix = u16(buf, curY * 4 + 2);
  if (nPix === 0) return;
  const baseAddr = lensPos + s16(buf, pixIdx);
  let si = pixIdx + 2;
  for (let i = 0; i < nPix; i++) {
    const dest = baseAddr + s16(buf, si);
    const src = baseAddr + s16(buf, si + 2);
    si += 4;
    if (dest >= 0 && dest < PIXELS && src >= 0 && src < PIXELS) {
      fb[dest] = back[src] | mask;
    }
  }
}

function dorow3(buf, lensPos, curY, fb) {
  const segIdx = u16(buf, curY * 4);
  const nPix = u16(buf, curY * 4 + 2);
  if (nPix === 0) return;
  const baseAddr = lensPos + s16(buf, segIdx);
  let si = segIdx + 2;
  for (let i = 0; i < nPix; i++) {
    const src = baseAddr + s16(buf, si);
    si += 2;
    if (src >= 0 && src < PIXELS) {
      fb[src] = back[src];
    }
  }
}
