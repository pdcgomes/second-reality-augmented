/**
 * BEGLOGO — Classic variant (Part 4)
 *
 * "Second Reality" title card: a 320×400 compressed image displayed
 * with a fade-from-white animation. The picture uses Future Crew's
 * custom "readp" image format — an RLE-compressed indexed bitmap with
 * an embedded 256-color VGA palette (from beg/readp.c).
 *
 * The animation sequence at 70 fps:
 *   Frames 0–31:   Black (wait)
 *   Frames 32–159: Fade from white to normal palette (128 frames)
 *   Frames 160+:   Hold picture at normal palette until clip ends
 *
 * Original source: BEGLOGO/ folder in SecondReality repo.
 * The title picture data (srtitle) is also reused by Part 5 (GLENZ_TRANSITION).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { SRTITLE_B64 } from './data.js';

const W = 320;
const H = 400;
const FRAME_RATE = 70;
const WAIT_FRAMES = 32;
const FADE_FRAMES = 128;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uFrame;
uniform float uBeat;

void main() {
  vec2 uv = vUV;
  uv.y = 1.0 - uv.y;
  vec3 color = texture(uFrame, uv).rgb;
  float beatPulse = pow(1.0 - uBeat, 8.0) * 0.04;
  color += color * beatPulse;
  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uFrame, uBeat;

let palette768 = null;
let pixels = null;
let frameTex = null;
let rgbaBuffer = null;

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function u16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Decode FC's "readp" compressed image format (beg/readp.c).
 *
 * Header (10 bytes):
 *   [0-1] magic, [2-3] width, [4-5] height, [6-7] cols, [8-9] add
 * Palette: 768 bytes at offset 16 (256 × 3, 6-bit VGA values)
 * Row data starts at offset add*16:
 *   Each row: u16 byteCount, then RLE payload
 *   RLE: byte <= 127 → 1 pixel of that value
 *        byte > 127  → (byte & 0x7F) pixels of the next byte's value
 */
function decodeReadp(src) {
  const width = u16(src, 2);
  const height = u16(src, 4);
  const add = u16(src, 8);

  const pal = new Uint8Array(768);
  for (let i = 0; i < 768; i++) pal[i] = src[16 + i];

  const pix = new Uint8Array(width * height);
  let srcIdx = add * 16;

  for (let row = 0; row < height; row++) {
    const bytes = u16(src, srcIdx);
    srcIdx += 2;
    const rowEnd = srcIdx + bytes;
    let destIdx = row * width;

    while (srcIdx < rowEnd) {
      let b = src[srcIdx++];
      let n;
      if (b <= 127) {
        n = 1;
      } else {
        n = b & 0x7f;
        b = src[srcIdx++];
      }
      for (let i = 0; i < n; i++) pix[destIdx++] = b;
    }
  }

  return { pal, pix, width, height };
}

/**
 * Build an RGBA buffer from indexed pixels with a white fade level.
 * whiteLevel: 1.0 = full white, 0.0 = normal palette.
 */
function renderWithFade(pix, pal, whiteLevel, rgba) {
  const k = 255 / 63;
  const wl = clamp(whiteLevel, 0, 1);
  const pal32 = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const r = Math.round(clamp(wl * 63 + (1 - wl) * pal[i * 3], 0, 63) * k);
    const g = Math.round(clamp(wl * 63 + (1 - wl) * pal[i * 3 + 1], 0, 63) * k);
    const b = Math.round(clamp(wl * 63 + (1 - wl) * pal[i * 3 + 2], 0, 63) * k);
    pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }

  const rgba32 = new Uint32Array(rgba.buffer);
  for (let i = 0; i < pix.length; i++) rgba32[i] = pal32[pix[i]];
}

export default {
  label: 'beglogo',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrame = gl.getUniformLocation(program, 'uFrame');
    uBeat = gl.getUniformLocation(program, 'uBeat');

    const raw = b64ToUint8(SRTITLE_B64);
    const decoded = decodeReadp(raw);
    palette768 = decoded.pal;
    pixels = decoded.pix;

    rgbaBuffer = new Uint8Array(W * H * 4);

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, beat, _params) {
    const frame = Math.floor(t * FRAME_RATE);

    let whiteLevel;
    if (frame < WAIT_FRAMES) {
      whiteLevel = 1.0;
    } else {
      const fadeProgress = clamp((frame - WAIT_FRAMES) / FADE_FRAMES, 0, 1);
      whiteLevel = 1.0 - fadeProgress;
    }

    renderWithFade(pixels, palette768, whiteLevel, rgbaBuffer);

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rgbaBuffer);

    gl.useProgram(program);
    gl.uniform1f(uBeat, beat);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.uniform1i(uFrame, 0);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    if (frameTex) gl.deleteTexture(frameTex);
    program = null;
    quad = null;
    palette768 = null;
    pixels = null;
    rgbaBuffer = null;
    frameTex = null;
  },
};
