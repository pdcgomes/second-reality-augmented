/**
 * CREDITS — Remastered variant (Part 24)
 *
 * Same scrolling credits with 21 picture+text screens as the classic.
 * The remastered variant bilinear-upscales the 320×200 framebuffer 4×
 * before upload and uses LINEAR texture filtering to smooth pixel edges
 * at high display resolutions.
 *
 * Resolution: 320×400 (VGA double-scan), displayed at 320×200.
 * Code by WILDFIRE.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  PIC01_UH_base64, PIC02_UH_base64, PIC03_UH_base64, PIC04_UH_base64,
  PIC05_UH_base64, PIC05B_UH_base64, PIC06_UH_base64, PIC07_UH_base64,
  PIC08_UH_base64, PIC09_UH_base64, PIC10_UH_base64, PIC10B_UH_base64,
  PIC11_UH_base64, PIC12_UH_base64, PIC13_UH_base64, PIC14_UH_base64,
  PIC14B_UH_base64, PIC15_UH_base64, PIC16_UH_base64, PIC17_UH_base64,
  PIC18_UH_base64, fona_credits_base64,
} from './data.js';

const W = 320, H = 200, H400 = 400, PIXELS = W * H;
const FRAME_RATE = 70;
const FONT_HEIGHT = 32;
const FONT_WIDTH = 1500;
const FONT_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/?!:,."()+-';

const UPSCALE = 4;
const UP_W = W * UPSCALE;
const UP_H = H * UPSCALE;

const CREDITS_TXT = [
  ['GRAPHICS - MARVEL', 'MUSIC - SKAVEN', 'CODE - WILDFIRE'],
  ['GRAPHICS - MARVEL', 'MUSIC - SKAVEN', 'CODE - PSI', 'OBJECTS - WILDFIRE'],
  ['GRAPHICS - MARVEL', 'MUSIC - SKAVEN', 'CODE - WILDFIRE', 'ANIMATION - TRUG'],
  ['', 'GRAPHICS - PIXEL'],
  ['GRAPHICS - PIXEL', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - TRUG'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['', 'GRAPHICS - PIXEL', 'MUSIC - PURPLE MOTION'],
  ['GRAPHICS - PIXEL', 'MUSIC - PURPLE MOTION', 'CODE - TRUG', 'RENDERING - TRUG'],
  ['SKETCH - SKAVEN', 'GRAPHICS - PIXEL', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['SKETCH - SKAVEN', 'GRAPHICS - PIXEL', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - WILDFIRE'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - WILDFIRE'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['GRAPHICS - PIXEL', 'MUSIC - PURPLE MOTION', 'CODE - TRUG', 'RENDERING - TRUG'],
  ['', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['GRAPHICS - MARVEL', 'MUSIC - PURPLE MOTION', 'CODE - PSI'],
  ['MUSIC - SKAVEN', 'CODE - PSI', 'WORLD - TRUG'],
  ['GRAPHICS - PIXEL', 'MUSIC - SKAVEN'],
  ['GRAPHICS - PIXEL', 'MUSIC - SKAVEN', 'CODE - WILDFIRE'],
];

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
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

let program, quad, uFrameLoc, frameTex;
let rgba, upscaledRgba;
let creditsPics, creditsPals, fontData, fontCharWidth, fontCharXPos;
let positions;

function initFont() {
  fontData = b64ToUint8(fona_credits_base64);
  fontCharWidth = new Array(256).fill(0);
  fontCharXPos = new Array(256).fill(0);
  let orderIdx = 0;
  let x = 0;
  while (x < FONT_WIDTH && orderIdx < FONT_ORDER.length) {
    while (x < FONT_WIDTH) {
      let found = false;
      for (let y = 0; y < FONT_HEIGHT; y++) { if (fontData[y * FONT_WIDTH + x]) { found = true; break; } }
      if (found) break;
      x++;
    }
    const b = x;
    while (x < FONT_WIDTH) {
      let found = false;
      for (let y = 0; y < FONT_HEIGHT; y++) { if (fontData[y * FONT_WIDTH + x]) { found = true; break; } }
      if (!found) break;
      x++;
    }
    fontCharXPos[FONT_ORDER.charCodeAt(orderIdx)] = b;
    fontCharWidth[FONT_ORDER.charCodeAt(orderIdx)] = x - b;
    orderIdx++;
  }
  fontCharXPos[32] = FONT_WIDTH - 32;
  fontCharWidth[32] = 8;
}

function initPositions() {
  positions = [];
  let y, yy, v;

  for (let i = 0; i < 5; i++) {
    positions.push({ textY: 200, picX: 322 });
  }

  for (y = 200 * 128; y > 0; y = Math.floor(y * 12 / 13)) {
    yy = 80 + y / 106;
    positions.push({ textY: Math.floor(y / 128), picX: Math.floor(yy) });
  }

  for (let i = 0; i < 200; i++) {
    yy = 80 + y / 106;
    positions.push({ textY: Math.floor(y / 128), picX: Math.floor(yy) });
  }

  for (y = 0, v = 0; y < 128 * 200; y = y + v, v += 15) {
    yy = 80 - y / 106;
    positions.push({ textY: Math.floor(y / 128), picX: Math.floor(yy) });
  }
}

function initPicsAndPals() {
  const picsB64 = [
    PIC01_UH_base64, PIC02_UH_base64, PIC03_UH_base64, PIC04_UH_base64,
    PIC05_UH_base64, PIC05B_UH_base64, PIC06_UH_base64, PIC07_UH_base64,
    PIC08_UH_base64, PIC09_UH_base64, PIC10_UH_base64, PIC10B_UH_base64,
    PIC11_UH_base64, PIC12_UH_base64, PIC13_UH_base64, PIC14_UH_base64,
    PIC14B_UH_base64, PIC15_UH_base64, PIC16_UH_base64, PIC17_UH_base64,
    PIC18_UH_base64,
  ];

  creditsPics = [];
  creditsPals = [];
  for (let i = 0; i < picsB64.length; i++) {
    const raw = b64ToUint8(picsB64[i]);
    const pal = new Uint8Array(768);
    for (let j = 0; j < 768; j++) pal[j] = raw[16 + j];
    const pix = raw.slice(16 + 768, 16 + 768 + 160 * 100);

    for (let j = 768 - 16 * 3 - 1; j >= 0; j--) pal[j + 16 * 3] = pal[j];
    for (let a = 0; a < 10; a++) pal[a * 3] = pal[a * 3 + 1] = pal[a * 3 + 2] = 7 * a;

    creditsPics.push(pix);
    creditsPals.push(pal);
  }
}

function prt(fb, x, y, txt) {
  for (let idx = 0; idx < txt.length; idx++) {
    const cc = txt.charCodeAt(idx);
    const cw = fontCharWidth[cc] || 0;
    let sx = fontCharXPos[cc] || 0;
    for (let x2 = x; x2 < x + cw; x2++) {
      for (let y2 = y; y2 < y + FONT_HEIGHT; y2++) {
        if (y2 >= 0 && y2 < H400 && x2 >= 0 && x2 < W)
          fb[x2 + y2 * W] = fontData[(y2 - y) * FONT_WIDTH + sx];
      }
      sx++;
    }
    x += cw + 2;
  }
}

function prtc(fb, x, y, txt) {
  let w = 0;
  for (let i = 0; i < txt.length; i++) w += (fontCharWidth[txt.charCodeAt(i)] || 0) + 2;
  prt(fb, Math.floor(x - w / 2), y, txt);
}

function screenIn(fb, screenIdx, screenFrame) {
  if (screenIdx >= CREDITS_TXT.length) return null;

  fb.fill(0);
  const pos = positions[Math.min(Math.floor(screenFrame), positions.length - 1)];
  const textY = pos.textY;
  const picX = pos.picX;
  const pic = creditsPics[screenIdx];

  for (let x = 0; x < 160; x++) {
    for (let y = 0; y < 100; y++) {
      const dx = picX + x;
      if (dx >= 0 && dx < W) {
        fb[dx + y * 2 * W] = pic[y * 160 + x] + 16;
        fb[dx + (y * 2 + 1) * W] = pic[y * 160 + x] + 16;
      }
    }
  }

  let ty = 160 + 60 + textY;
  for (const text of CREDITS_TXT[screenIdx]) {
    prtc(fb, 160, ty, text);
    ty += FONT_HEIGHT + 10;
  }

  return creditsPals[screenIdx];
}

export default {
  label: 'credits (remastered)',
  params: [],

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);
    upscaledRgba = new Uint8Array(UP_W * UP_H * 4);

    initFont();
    initPicsAndPals();
    initPositions();

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, UP_W, UP_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const frame = Math.floor(t * FRAME_RATE);
    const fb400 = new Uint8Array(W * H400);
    const posLen = positions.length;

    const screenIdx = Math.floor(frame / posLen);
    const screenFrame = frame % posLen;

    const activePal = screenIn(fb400, screenIdx, screenFrame);
    const pal = activePal || creditsPals[0];

    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let y = 0; y < H; y++) {
      const srcY = y * 2;
      for (let x = 0; x < W; x++) {
        const ci = fb400[srcY * W + x];
        const r = Math.round(Math.min(pal[ci * 3], 63) * k);
        const g = Math.round(Math.min(pal[ci * 3 + 1], 63) * k);
        const b = Math.round(Math.min(pal[ci * 3 + 2], 63) * k);
        rgba32[y * W + x] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }

    bilinearUpscale(rgba, W, H, UPSCALE, upscaledRgba);

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, UP_W, UP_H, gl.RGBA, gl.UNSIGNED_BYTE, upscaledRgba);
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
    rgba = upscaledRgba = creditsPics = creditsPals = fontData = fontCharWidth = fontCharXPos = positions = null;
  },
};
