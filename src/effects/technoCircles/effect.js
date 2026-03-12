/**
 * TECHNO_CIRCLES — Classic variant (Part 8)
 *
 * Two-phase circle interference effect rendered at 320×200.
 *
 * Phase 1 (KOEB, frames 0–255): Single concentric circle pattern
 *   with rotating palette — a bright ring sweeps through the radii.
 * Phase 2 (KOEA, frames 256+): Two circle images OR'd together with
 *   per-scanline sinusoidal distortion that grows over time, creating
 *   rich moiré interference patterns. Palette cycles through warm tones.
 *
 * The circle images are pre-computed quarter-circles stored as EGA
 * bit-plane data, mirrored to 640×400 at init time. The OR blend
 * maps to a 16-color palette for the interference look.
 *
 * Original code: TECHNO/KOE*.ASM by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { CIRCLE1_B64, CIRCLE2_B64 } from './data.js';

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

// ── Palettes (6-bit VGA, doubled for circular wrapping) ──

const PAL0 = [
  0,30,40, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0,
  0,30,40, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0, 0,0,0,
];

const PAL1 = [
  30,30*8/9,30, 60,60*8/9,60, 50,50*8/9,50, 40,40*8/9,40,
  30,30*8/9,30, 20,20*8/9,20, 10,10*8/9,10,  0, 0*8/9, 0,
  30,30*8/9,30, 60,60*8/9,60, 50,50*8/9,50, 40,40*8/9,40,
  30,30*8/9,30, 20,20*8/9,20, 10,10*8/9,10,  0, 0*8/9, 0,
];

const PAL2 = [
   0, 0*7/9, 0, 10,10*7/9,10, 20,20*7/9,20, 30,30*7/9,30,
  40,40*7/9,40, 50,50*7/9,50, 60,60*7/9,60, 30,30*7/9,30,
   0, 0*7/9, 0, 10,10*7/9,10, 20,20*7/9,20, 30,30*7/9,30,
  40,40*7/9,40, 50,50*7/9,50, 60,60*7/9,60, 30,30*7/9,30,
];

// ── Helpers ──

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── Module state ──

let program = null, quad = null, uFrameLoc;
let frameTex = null;
let fb = null, rgba = null;
let circle1 = null, circle2 = null;
let sin1024 = null, power0 = null;

function decodeCircle1(raw) {
  const out = new Uint8Array(640 * 400);
  for (let y = 0; y < 200; y++) {
    for (let xd = 0; xd < 320; xd++) {
      const lineStart = 40 * y * 3;
      const byteIdx = xd >> 3;
      const bitIdx = 7 - (xd & 7);
      let color = 0;
      for (let plane = 0; plane < 3; plane++) {
        color |= ((raw[lineStart + plane * 40 + byteIdx] >> bitIdx) & 1) << plane;
      }
      out[y * 640 + xd] = color;
      out[(399 - y) * 640 + xd] = color;
      out[y * 640 + 320 + (319 - xd)] = color;
      out[(399 - y) * 640 + 320 + (319 - xd)] = color;
    }
  }
  return out;
}

function decodeCircle2(raw) {
  const out = new Uint8Array(640 * 400);
  for (let y = 0; y < 200; y++) {
    for (let xd = 0; xd < 320; xd++) {
      const lineStart = 40 * y;
      const byteIdx = xd >> 3;
      const bitIdx = 7 - (xd & 7);
      const color = ((raw[lineStart + byteIdx] >> bitIdx) & 1) << 3;
      out[y * 640 + xd] = color;
      out[(399 - y) * 640 + xd] = color;
      out[y * 640 + 320 + (319 - xd)] = color;
      out[(399 - y) * 640 + 320 + (319 - xd)] = color;
    }
  }
  return out;
}

export default {
  label: 'technoCircles',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');

    fb = new Uint8Array(W * H);
    rgba = new Uint8Array(W * H * 4);

    circle1 = decodeCircle1(b64ToUint8(CIRCLE1_B64));
    circle2 = decodeCircle2(b64ToUint8(CIRCLE2_B64));

    sin1024 = new Int32Array(1024);
    for (let x = 0; x < 1024; x++) sin1024[x] = Math.floor(Math.sin(2 * Math.PI * x / 1024) * 255);

    power0 = new Int32Array(256 * 16);
    let idx = 0;
    for (let b = 0; b < 16; b++) {
      for (let c = 0; c < 128; c++) power0[idx++] = Math.floor(c * b / 15);
      for (let c = -128; c < 0; c++) power0[idx++] = Math.floor(c * b / 15);
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
    const k = 255 / 63;
    const vgaPal = new Float64Array(16 * 3);

    if (frame < 256) {
      // ── Phase 1: KOEB — single circle with rotating palette ──
      const palfader = clamp(frame * 2, 0, 512);
      const pal = new Float64Array(48);

      for (let i = 0; i < 24; i++) {
        pal[i] = palfader <= 256
          ? Math.floor(PAL0[i] * palfader / 256)
          : clamp(PAL0[i] + palfader - 256, 0, 63);
      }
      for (let i = 0; i < 24; i++) {
        pal[24 + i] = palfader <= 256
          ? Math.floor(PAL0[i] * palfader / 256)
          : clamp(PAL0[i] + palfader - 256, 0, 63);
      }

      const shft = frame % 8;
      for (let i = 0; i < 16; i++) {
        const src = ((i + 7 - shft + 800) % 8) * 3;
        vgaPal[i * 3] = pal[src];
        vgaPal[i * 3 + 1] = pal[src + 1];
        vgaPal[i * 3 + 2] = pal[src + 2];
      }

      // Render circle1 centered
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          fb[y * W + x] = circle1[(y + 100) * 640 + (x + 160)];
        }
      }
    } else {
      // ── Phase 2: KOEA — two-circle interference with sinusoidal distortion ──
      const n = frame - 256;

      const overrot = (211 + 7 * n) % 1024;
      const scrnrot = (5 * n) % 1024;
      const sinurot = (7 * (n + 1)) % 1024;
      const sinuspower = n > 350 ? clamp(Math.floor((n - 350) / 16), 1, 15) : 0;
      const palanimc = (7 + n) % 8;

      for (let i = 0; i < 8; i++) {
        const src = (i + (7 - palanimc)) * 3;
        vgaPal[i * 3] = PAL1[src];
        vgaPal[i * 3 + 1] = PAL1[src + 1];
        vgaPal[i * 3 + 2] = PAL1[src + 2];
      }
      for (let i = 0; i < 8; i++) {
        const src = (i + (7 - palanimc)) * 3;
        vgaPal[(i + 8) * 3] = PAL2[src];
        vgaPal[(i + 8) * 3 + 1] = PAL2[src + 1];
        vgaPal[(i + 8) * 3 + 2] = PAL2[src + 2];
      }

      const overx = 160 + Math.floor(sin1024[overrot] / 4);
      const overy = 100 + Math.floor(sin1024[(overrot + 256) % 1024] / 4);
      const scrnx = 160 + Math.floor(sin1024[scrnrot] / 4);
      const scrny = 100 + Math.floor(sin1024[(scrnrot + 256) % 1024] / 4);

      for (let y = 0; y < H; y++) {
        const sinroty = (sinurot + 9 * y) % 1024;
        const siny = Math.floor(sin1024[sinroty] / 8) & 0xFF;
        const powr = power0[sinuspower * 256 + siny];

        const c1row = (y + scrny) * 640;
        const c2row = (y + overy) * 640;
        const fbrow = y * W;
        for (let x = 0; x < W; x++) {
          fb[fbrow + x] = circle1[c1row + x + scrnx] | circle2[c2row + x + overx + powr];
        }
      }
    }

    // Convert indexed framebuffer to RGBA via 16-color VGA palette
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < W * H; i++) {
      const ci = fb[i];
      const r = Math.round(clamp(vgaPal[ci * 3], 0, 63) * k);
      const g = Math.round(clamp(vgaPal[ci * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(vgaPal[ci * 3 + 2], 0, 63) * k);
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
    program = null;
    quad = null;
    frameTex = null;
    fb = rgba = circle1 = circle2 = sin1024 = power0 = null;
  },
};
