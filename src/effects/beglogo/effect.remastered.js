/**
 * BEGLOGO — Remastered variant (Part 4)
 *
 * Same "Second Reality" title card with fade-from-white animation as
 * the classic. The remastered variant bilinear-upscales the 320×400
 * framebuffer 4× before upload and uses LINEAR texture filtering to
 * smooth pixel edges at high display resolutions.
 *
 * Original source: BEGLOGO/ folder in SecondReality repo.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { SRTITLE_B64 } from './data.js';

const W = 320;
const H = 400;
const FRAME_RATE = 70;
const WAIT_FRAMES = 32;
const FADE_FRAMES = 128;

const UPSCALE = 4;
const UP_W = W * UPSCALE;
const UP_H = H * UPSCALE;

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
let upscaledBuffer = null;

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

function bilinearUpscale(src, srcW, srcH, scale, dst) {
  const dstW = srcW * scale;
  const dstH = srcH * scale;

  for (let dy = 0; dy < dstH; dy++) {
    const srcY = (dy + 0.5) / scale - 0.5;
    const sy0 = Math.max(0, Math.floor(srcY));
    const sy1 = Math.min(sy0 + 1, srcH - 1);
    const fy = srcY - Math.floor(srcY);

    for (let dx = 0; dx < dstW; dx++) {
      const srcX = (dx + 0.5) / scale - 0.5;
      const sx0 = Math.max(0, Math.floor(srcX));
      const sx1 = Math.min(sx0 + 1, srcW - 1);
      const fx = srcX - Math.floor(srcX);

      const i00 = (sy0 * srcW + sx0) * 4;
      const i10 = (sy0 * srcW + sx1) * 4;
      const i01 = (sy1 * srcW + sx0) * 4;
      const i11 = (sy1 * srcW + sx1) * 4;

      const di = (dy * dstW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
        const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
        dst[di + c] = Math.round(top * (1 - fy) + bot * fy);
      }
    }
  }
}

export default {
  label: 'beglogo (remastered)',
  params: [],

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
    upscaledBuffer = new Uint8Array(UP_W * UP_H * 4);

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, UP_W, UP_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
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
    bilinearUpscale(rgbaBuffer, W, H, UPSCALE, upscaledBuffer);

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, UP_W, UP_H, gl.RGBA, gl.UNSIGNED_BYTE, upscaledBuffer);

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
    upscaledBuffer = null;
    frameTex = null;
  },
};
