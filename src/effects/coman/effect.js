/**
 * COMAN — Classic variant (Part 20)
 *
 * "3D-Sinusfield" — VoxelSpace-style raymarched terrain rendered
 * column by column. Two 256×128 height maps are summed with a
 * z-wave offset. Camera rotates on a pre-computed path. Each of the
 * 160 columns (pixel-doubled to 320) is raymarched from bottom to
 * top, coloring pixels based on terrain height and distance. At start
 * the terrain rises from below; at end it scrolls back down.
 *
 * Original code: COMAN folder by PSI. DOLOOP.C generates the
 * unrolled assembly loop for the raymarcher.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { W1DTA_B64, W2DTA_B64 } from './data.js';

const W = 320, H = 200, PIXELS = W * H;
const FRAME_RATE = 35;
const HORIZONY = 70;
const BAIL = 192;
const BAILHALVE = 64;

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
let rgba, palette;
let wave1, wave2, zwave;
let rsinArr, rcosArr, rsin2Arr, rcos2Arr;

function buildPalette() {
  palette = new Uint8Array(768);
  for (let a = 0; a < 256; a++) {
    const uc = (223 - Math.floor(a * 22 / 26)) * 3;
    if (uc < 0 || uc >= 768) continue;
    let b1 = Math.floor((230 - a) / 4) + Math.floor(256 * Math.sin(a * 4 / 1024 * 2 * Math.PI) / 32);
    if (b1 < 0) b1 = 0; if (b1 > 63) b1 = 63;
    palette[uc + 1] = b1;
    let b2 = Math.floor((255 - a) / 3);
    if (b2 > 63) b2 = 63;
    palette[uc + 2] = b2;
    let b3 = a - 220; if (b3 < 0) b3 = -b3;
    if (b3 > 40) b3 = 40; b3 = 40 - b3;
    palette[uc] = Math.floor(b3 / 3);
  }
  for (let a = 0; a < 768 - 16 * 3; a++) {
    let b = palette[a] * 9 / 6;
    if (b > 63) b = 63;
    palette[a] = Math.floor(b);
  }
  for (let a = 0; a < 24; a++) {
    const uc = (255 - a) * 3;
    let b = a - 4; if (b < 0) b = 0;
    palette[uc] = Math.floor(b / 2);
    palette[uc + 1] = 0; palette[uc + 2] = 0;
  }
  palette[0] = palette[1] = palette[2] = 0;
}

function precomputeAnim() {
  rsinArr = new Float64Array(4444);
  rcosArr = new Float64Array(4444);
  rsin2Arr = new Float64Array(4444);
  rcos2Arr = new Float64Array(4444);
  let rot2 = 0, rot = 0;
  for (let f = 0; f < 4444; f++) {
    rot2 += 4;
    rot += Math.trunc(256 * Math.sin(rot2 / 1024 * 2 * Math.PI) / 15);
    const r = rot >> 3;
    rsinArr[f] = Math.trunc(256 * Math.sin(r / 1024 * 2 * Math.PI));
    rcosArr[f] = Math.trunc(256 * Math.sin((r + 256) / 1024 * 2 * Math.PI));
    rsin2Arr[f] = Math.trunc(256 * Math.sin((r + 177) / 1024 * 2 * Math.PI));
    rcos2Arr[f] = Math.trunc(256 * Math.sin((r + 177 + 256) / 1024 * 2 * Math.PI));
  }
}

export default {
  label: 'coman',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    buildPalette();

    const w1raw = b64ToUint8(W1DTA_B64);
    const w2raw = b64ToUint8(W2DTA_B64);
    wave1 = new Int16Array(256 * 128);
    wave2 = new Int16Array(256 * 128);
    for (let i = 0; i < 256 * 128; i++) {
      wave1[i] = (w1raw[i * 2] | (w1raw[i * 2 + 1] << 8)) << 16 >> 16;
      wave2[i] = (w2raw[i * 2] | (w2raw[i * 2 + 1] << 8)) << 16 >> 16;
    }

    zwave = new Int32Array(BAIL);
    for (let i = 0; i < BAIL; i++) zwave[i] = Math.trunc(16.0 * Math.sin(i * Math.PI * 2.0 * 3.0 / BAIL));

    precomputeAnim();

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

    // Replay xwav/ywav and startrise from frame 0
    let xwav = 0, ywav = 0, startrise = 120;
    const totalFrames = Math.floor(71.6 * FRAME_RATE);
    const scrollDownFrame = totalFrames - 160;

    for (let f = 0; f <= Math.min(frame, 4443); f++) {
      if (f < 400) { if (startrise > 0) startrise--; }
      else if (f >= scrollDownFrame) { if (startrise < 160) startrise++; }

      const fi = Math.min(Math.trunc(f / 2), 4443);
      const valrcos = rcosArr[fi], valrsin = rsinArr[fi];
      const valrcos2 = rcos2Arr[fi], valrsin2 = rsin2Arr[fi];

      const x80 = 0;
      const y = 160;
      const xa80 = Math.trunc((x80 * valrcos + y * valrsin) / 256) & ~1;
      const ya80 = Math.trunc((y * valrcos2 - x80 * valrsin2) / 256) & ~1;
      xwav += xa80 * 2;
      ywav += ya80 * 2;
    }

    // Render the voxel terrain
    const fb = new Uint8Array(PIXELS);
    const fi = Math.min(Math.trunc(frame / 2), 4443);
    const valrcos = rcosArr[fi], valrsin = rsinArr[fi];
    const valrcos2 = rcos2Arr[fi], valrsin2 = rsin2Arr[fi];

    for (let a = 0; a < 160; a++) {
      const x = a - 80;
      let xa = Math.trunc((x * valrcos + 160 * valrsin) / 256) & ~1;
      let ya = Math.trunc((160 * valrcos2 - x * valrsin2) / 256) & ~1;

      const colTop = startrise + 22;
      const colBot = Math.min(colTop + 199, H - 1);
      docol(fb, xwav, ywav, xa, ya, a * 2, colTop, colBot);
    }

    // Convert to RGBA
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < PIXELS; i++) {
      const ci = fb[i];
      const r = Math.round(clamp(palette[ci * 3], 0, 63) * k);
      const g = Math.round(clamp(palette[ci * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(palette[ci * 3 + 2], 0, 63) * k);
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
    rgba = palette = wave1 = wave2 = zwave = null;
    rsinArr = rcosArr = rsin2Arr = rcos2Arr = null;
  },
};

function docol(fb, xw, yw, xa, ya, screenX, colTop, colBot) {
  if (screenX < 0 || screenX >= W - 1 || colTop >= H) return;

  let rayHeight = 0;
  let rayInc = (-(200 - HORIZONY) * 2560) / 65536;
  xw = xw & ~1; yw = yw & ~1;
  xa = xa & ~1; ya = ya & ~1;

  let dest = colBot;
  const destEnd = Math.max(colTop, 0);

  for (let j = 0; j < BAIL && dest >= destEnd; j++) {
    if (j === BAILHALVE) { xa += xa; ya += ya; }
    xw += xa; yw += ya;

    const terrainH = (wave1[(xw >> 1) & 32767] + wave2[(yw >> 1) & 32767]) + (zwave[j] - 240);

    if (rayHeight < terrainH) {
      const ci = ((terrainH + 140 - Math.floor(j / 8)) & 0xFF) >> 1;
      const l = (j * 2560) / 65536;

      while (rayHeight < terrainH && dest >= destEnd) {
        rayHeight += l;
        if (dest >= 0 && dest < H) {
          fb[dest * W + screenX] = ci;
          fb[dest * W + screenX + 1] = ci;
        }
        dest--;
        rayInc += 2560 / 65536;
      }
    }

    rayHeight += rayInc;
    if (j === BAILHALVE) { rayHeight += rayInc; }
    if (j >= BAILHALVE) j++;
  }

  while (dest >= destEnd) {
    if (dest >= 0 && dest < H) {
      fb[dest * W + screenX] = 0;
      fb[dest * W + screenX + 1] = 0;
    }
    dest--;
  }
}
