/**
 * GLENZ_TRANSITION — Classic variant (Part 5)
 *
 * Two-phase transition from the BEGLOGO title card to the GLENZ vectors:
 *
 *   Phase 1 (frames 0–48 at 70 fps ≈ 0.69s):
 *     "Zoomer1" — progressively wipe the 320×400 title picture from top
 *     and bottom while fading its palette to gray. Cleared pixels become
 *     black (index 255). Starts at the CHECKERBOARD_FALL sync point.
 *
 *   Phase 2 (frames 49+ ≈ 2.7s):
 *     Switch to 320×200 Mode 13h. A pre-rendered checkerboard image
 *     (16-color palette) drops from the top of the screen with gravity
 *     and bounces off the bottom with 2/3 restitution, settling into
 *     its final resting position. The face of the checkerboard is
 *     vertically scaled; the bottom edge is always unscaled.
 *
 * Original code: GLENZ/MAIN.C (by PSI). The checkerboard image is in
 * FC's raw image format (16-byte header + 768-byte palette + 320×200 pixels).
 * This part reuses the srtitle data from Part 4 (BEGLOGO).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { SRTITLE_B64 } from '../beglogo/data.js';
import { CHECKERBOARD_B64 } from './data.js';

const W = 320;
const H_TITLE = 400;
const H_CHECKER = 200;
const FRAME_RATE = 70;
const ZOOMER_FRAMES = 48;
const FADE_MAX = 32;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  fragColor = vec4(texture(uFrame, uv).rgb, 1.0);
}
`;

let program = null;
let quad = null;
let uFrameLoc;

let titleTex = null;
let checkerTex = null;

let titlePixels = null;
let titlePal = null;
let titleRGBA = null;

let checkerData = null;
let checkerPal32 = null;
let checkerFB = null;
let checkerRGBA = null;

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function u16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
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
      if (b <= 127) { n = 1; } else { n = b & 0x7f; b = src[srcIdx++]; }
      for (let i = 0; i < n; i++) pix[destIdx++] = b;
    }
  }
  return { pal, pix, width, height };
}

/**
 * Compute the top-wipe position (zy) at a given frame by replaying
 * the original accumulation: zy += floor(frame/4) each frame, capped at 260.
 */
function computeZy(frame) {
  let zy = 0;
  for (let f = 0; f <= frame; f++) {
    zy += Math.floor(f / 4);
    if (zy >= 260) return 260;
  }
  return zy;
}

/**
 * Phase 1: wipe the title picture and fade palette to gray.
 * Returns the RGBA buffer for the 320×400 frame.
 */
function renderZoomer(origPixels, origPal, frame, rgba) {
  const zy = computeZy(frame);
  const zy2 = Math.floor(125 * zy / 260);
  const fadeLevel = Math.min(frame, FADE_MAX);

  const k = 255 / 63;
  const pal32 = new Uint32Array(256);
  for (let i = 0; i < 128; i++) {
    const r = Math.round(((FADE_MAX - fadeLevel) * origPal[i * 3] + fadeLevel * 30) / FADE_MAX * k);
    const g = Math.round(((FADE_MAX - fadeLevel) * origPal[i * 3 + 1] + fadeLevel * 30) / FADE_MAX * k);
    const b = Math.round(((FADE_MAX - fadeLevel) * origPal[i * 3 + 2] + fadeLevel * 30) / FADE_MAX * k);
    pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  for (let i = 128; i < 255; i++) {
    const r = Math.round(origPal[i * 3] * k);
    const g = Math.round(origPal[i * 3 + 1] * k);
    const b = Math.round(origPal[i * 3 + 2] * k);
    pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  pal32[255] = 0xff000000;

  const rgba32 = new Uint32Array(rgba.buffer);
  const total = W * H_TITLE;

  for (let i = 0; i < total; i++) {
    const y = Math.floor(i / W);
    const isCleared = y <= zy || y >= (H_TITLE - 1 - zy2);
    rgba32[i] = isCleared ? pal32[255] : pal32[origPixels[i]];
  }
}

/**
 * Phase 2: run the bounce simulation up to the given frame and render
 * the scaled checkerboard into a 320×200 indexed framebuffer.
 */
function simulateBounce(bounceFrame) {
  let vel = 0, pos = 0;
  let settled = false;
  for (let i = 0; i < bounceFrame && !settled; i++) {
    vel++;
    pos += vel;
    if (pos > 48 * 16) {
      pos -= vel;
      vel = Math.trunc(-vel * 2 / 3);
      if (vel > -4 && vel < 4) settled = true;
    }
  }
  return { pos, vel, settled };
}

function renderCheckerboard(bounceFrame, fb, rgba, srcData, pal32) {
  const { pos, vel } = simulateBounce(bounceFrame);

  fb.fill(0);

  const y = Math.floor(pos / 16);
  const y1 = Math.floor(130 + y / 2);
  const y2 = Math.floor(130 + y * 3 / 2);

  if (vel > 0) {
    for (let ry = Math.max(0, y1 - 4); ry < y1 && ry < H_CHECKER; ry++) {
      const d = ry * W;
      for (let x = 0; x < W; x++) fb[d + x] = 0;
    }
  }

  let b = 0;
  if (y2 !== y1) b = 100 / (y2 - y1);

  let ry = y1;
  for (let c = 0; ry < y2 && ry < H_CHECKER; ry++, c += b) {
    const srcRow = Math.floor(c);
    if (srcRow >= H_CHECKER) break;
    const s = 768 + 16 + srcRow * W;
    const d = ry * W;
    for (let x = 0; x < W; x++) fb[d + x] = srcData[s + x];
  }

  for (let c = 0; c < 8 && ry < H_CHECKER; c++, ry++) {
    const srcRow = c + 100;
    const s = 768 + 16 + srcRow * W;
    const d = ry * W;
    for (let x = 0; x < W; x++) fb[d + x] = srcData[s + x];
  }

  if (vel < 0) {
    for (let c = 0; c < 8 && ry < H_CHECKER; c++, ry++) {
      const d = ry * W;
      for (let x = 0; x < W; x++) fb[d + x] = 0;
    }
  }

  const rgba32 = new Uint32Array(rgba.buffer);
  for (let i = 0; i < W * H_CHECKER; i++) rgba32[i] = pal32[fb[i]];
}

function buildCheckerPalette(srcData) {
  const k = 255 / 63;
  const pal32 = new Uint32Array(256);
  pal32[0] = 0xff000000;
  for (let i = 1; i < 16; i++) {
    const r = Math.round(srcData[16 + i * 3] * k);
    const g = Math.round(srcData[16 + i * 3 + 1] * k);
    const b = Math.round(srcData[16 + i * 3 + 2] * k);
    pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return pal32;
}

export default {
  label: 'glenzTransition',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');

    const titleRaw = b64ToUint8(SRTITLE_B64);
    const decoded = decodeReadp(titleRaw);
    titlePixels = decoded.pix;
    titlePal = decoded.pal;
    titleRGBA = new Uint8Array(W * H_TITLE * 4);

    checkerData = b64ToUint8(CHECKERBOARD_B64);
    checkerPal32 = buildCheckerPalette(checkerData);
    checkerFB = new Uint8Array(W * H_CHECKER);
    checkerRGBA = new Uint8Array(W * H_CHECKER * 4);

    titleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, titleTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H_TITLE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    checkerTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, checkerTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H_CHECKER, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const frame = Math.floor(t * FRAME_RATE);
    let activeTex;

    if (frame <= ZOOMER_FRAMES) {
      renderZoomer(titlePixels, titlePal, frame, titleRGBA);
      gl.bindTexture(gl.TEXTURE_2D, titleTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H_TITLE, gl.RGBA, gl.UNSIGNED_BYTE, titleRGBA);
      activeTex = titleTex;
    } else {
      const bounceFrame = frame - ZOOMER_FRAMES;
      renderCheckerboard(bounceFrame, checkerFB, checkerRGBA, checkerData, checkerPal32);
      gl.bindTexture(gl.TEXTURE_2D, checkerTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H_CHECKER, gl.RGBA, gl.UNSIGNED_BYTE, checkerRGBA);
      activeTex = checkerTex;
    }

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, activeTex);
    gl.uniform1i(uFrameLoc, 0);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    if (titleTex) gl.deleteTexture(titleTex);
    if (checkerTex) gl.deleteTexture(checkerTex);
    program = null;
    quad = null;
    titleTex = null;
    checkerTex = null;
    titlePixels = null;
    titlePal = null;
    titleRGBA = null;
    checkerData = null;
    checkerPal32 = null;
    checkerFB = null;
    checkerRGBA = null;
  },
};
