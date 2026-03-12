/**
 * DOTS — Classic variant (Part 18)
 *
 * 512 "mini vector balls" with gravity, bouncing, and depth-based
 * coloring. Dots are spawned in various patterns (spiral rise,
 * fountain, ring, random scatter) across multiple phases. Each dot
 * is a 4×3 pixel sprite whose color depends on Z-depth (16 levels ×
 * 4 shades). Shadows are drawn on a gray gradient floor. The scene
 * rotates around Y-axis.
 *
 * Original code: DOTS folder by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { FRAME_RATE, MAXDOTS, simulateDots } from './animation.js';

const W = 320, H = 200, PIXELS = W * H;

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

const COLS = [0,0,0, 4,25,30, 8,40,45, 16,55,60];

let program, quad, uFrameLoc, frameTex;
let rgba, pal, bgpic;
let dt1, dt2;

function buildPalAndBg() {
  pal = new Uint8Array(768);
  for (let a = 0; a < 16; a++)
    for (let b = 0; b < 4; b++) {
      const c = 100 + a * 9;
      pal[(a * 4 + b) * 3] = Math.floor(COLS[b * 3]);
      pal[(a * 4 + b) * 3 + 1] = Math.floor(COLS[b * 3 + 1] * c / 256);
      pal[(a * 4 + b) * 3 + 2] = Math.floor(COLS[b * 3 + 2] * c / 256);
    }
  pal[255 * 3] = 31; pal[255 * 3 + 1] = 0; pal[255 * 3 + 2] = 15;
  for (let a = 0; a < 100; a++) {
    let c = 64 - 256 / (a + 4);
    c = c * c / 64;
    pal[(64 + a) * 3] = Math.floor(c / 4);
    pal[(64 + a) * 3 + 1] = Math.floor(c / 4);
    pal[(64 + a) * 3 + 2] = Math.floor(c / 4);
  }

  bgpic = new Uint8Array(PIXELS);
  for (let a = 0; a < 100; a++)
    for (let x = 0; x < W; x++)
      bgpic[(100 + a) * W + x] = a + 64;

  dt1 = new Uint8Array(512);
  dt2 = new Uint8Array(512);
  for (let a = 0; a < 128; a++) {
    let c = Math.floor((a - 31) * 3 / 4 + 8);
    if (c < 0) c = 0; if (c > 15) c = 15;
    c = 15 - c;
    dt1[a * 4] = 2 + 4 * c; dt1[a * 4 + 1] = 2 + 4 * c;
    dt2[a * 4] = 2 + 4 * c; dt2[a * 4 + 1] = 3 + 4 * c;
    dt2[a * 4 + 2] = 3 + 4 * c; dt2[a * 4 + 3] = 2 + 4 * c;
  }
}

export default {
  label: 'dots',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);
    buildPalAndBg();

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const targetFrame = Math.floor(t * FRAME_RATE);
    const sim = simulateDots(targetFrame);
    const { dots, rotSin: rotsin, rotCos: rotcos, frame } = sim;

    const fb = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) fb[i] = bgpic[i];

    for (let i = 0; i < MAXDOTS; i++) {
      const d = dots[i];
      const bp = Math.floor(((d.z * rotcos - d.x * rotsin) / 0x10000) + 9000);
      if (bp <= 0) continue;
      const a = (d.z * rotsin + d.x * rotcos) / 0x100;
      const x = Math.floor((a + a / 8) / bp + 160);
      if (x < 0 || x >= W - 4) continue;

      const sy = Math.floor((0x80000 / bp) + 100);
      if (sy >= 0 && sy < H) {
        const sofs = sy * W + x;
        if (sofs >= 0 && sofs + 1 < PIXELS) { fb[sofs] = 87; fb[sofs + 1] = 87; }
      }

      const y = Math.floor((d.y * 64) / bp + 100);
      if (y < 0 || y >= H - 3) continue;
      let bpi = (bp >> 6) & ~3;
      if (bpi < 0) bpi = 0; if (bpi > 508) bpi = 508;
      const ofs = y * W + x;
      if (ofs + 1 < PIXELS) { fb[ofs + 1] = dt1[bpi]; fb[ofs + 2] = dt1[bpi + 1]; }
      if (ofs + W + 3 < PIXELS) {
        fb[ofs + W] = dt2[bpi]; fb[ofs + W + 1] = dt2[bpi + 1];
        fb[ofs + W + 2] = dt2[bpi + 2]; fb[ofs + W + 3] = dt2[bpi + 3];
      }
      if (ofs + 2 * W + 2 < PIXELS) { fb[ofs + 2 * W + 1] = dt1[bpi]; fb[ofs + 2 * W + 2] = dt1[bpi + 1]; }
    }

    const activePal = new Uint8Array(768);
    if (targetFrame < 128) {
      const fade = targetFrame / 128;
      for (let i = 0; i < 768; i++) activePal[i] = Math.floor(pal[i] * fade);
    } else if (frame >= 2360 && frame < 2400) {
      const a = frame - 2360;
      for (let i = 0; i < 256; i++) {
        activePal[i * 3] = clamp(pal[i * 3] + a * 3, 0, 63);
        activePal[i * 3 + 1] = clamp(pal[i * 3 + 1] + a * 3, 0, 63);
        activePal[i * 3 + 2] = clamp(pal[i * 3 + 2] + a * 4, 0, 63);
      }
    } else if (frame >= 2400) {
      const a = frame - 2400;
      const v = clamp(63 - a * 2, 0, 63);
      for (let i = 0; i < 768; i++) activePal[i] = v;
    } else {
      for (let i = 0; i < 768; i++) activePal[i] = pal[i];
    }

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
    rgba = pal = bgpic = dt1 = dt2 = null;
  },
};
