/**
 * ENDSCRL — Classic variant (Part 25)
 *
 * Ending text scroller: greetings and credits scroll upward in a
 * variable-width font on a 640×400 framebuffer, downsampled to
 * 320×200. Each frame scrolls up by 1 scanline and fills the
 * bottom line from the next row of text.
 *
 * Frame rate: 35 fps (70 Hz / 2).
 * Code by original coder (ENDSCRL folder).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { endscrl_font_base64, text } from './data.js';

const W = 320, H = 200, PIXELS = W * H;
const FBW = 640, FBH = 400;
const FRAME_RATE = 35;
const FONT_HEIGHT = 25;
const FONT_BMP_WIDTH = 1550;
const FONT_ORDER = 'ABCDEFGHIJKLMNOPQRSTUVWXabcdefghijklmnopqrstuvwxyz0123456789!?,.:""()+-*=\'Z\u201eY/&';

const PAL = new Uint8Array(16 * 3);

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

let program, quad, uFrameLoc, frameTex;
let rgba;
let fontData, fontCharWidth, fontCharXPos;
let fb640;
let scrollState;

function initPalette() {
  PAL[0] = PAL[1] = PAL[2] = 0;
  PAL[3] = PAL[4] = PAL[5] = 0;
  PAL[6] = PAL[7] = PAL[8] = 20;
  for (let i = 2; i < 16; i++) {
    PAL[i * 3] = PAL[i * 3 + 1] = PAL[i * 3 + 2] = i <= 1 ? 0 : 60;
  }
  PAL[6] = PAL[7] = PAL[8] = 40;
}

function initFont() {
  fontData = b64ToUint8(endscrl_font_base64);
  fontCharWidth = new Array(256).fill(0);
  fontCharXPos = new Array(256).fill(0);
  let orderIdx = 0;
  let x = 0;
  while (x < FONT_BMP_WIDTH && orderIdx < FONT_ORDER.length) {
    while (x < FONT_BMP_WIDTH) {
      let found = false;
      for (let y = 0; y < FONT_HEIGHT; y++) { if (fontData[y * FONT_BMP_WIDTH + x]) { found = true; break; } }
      if (found) break;
      x++;
    }
    const b = x;
    while (x < FONT_BMP_WIDTH) {
      let found = false;
      for (let y = 0; y < FONT_HEIGHT; y++) { if (fontData[y * FONT_BMP_WIDTH + x]) { found = true; break; } }
      if (!found) break;
      x++;
    }
    fontCharXPos[FONT_ORDER.charCodeAt(orderIdx)] = b;
    fontCharWidth[FONT_ORDER.charCodeAt(orderIdx)] = x - b;
    orderIdx++;
  }
  fontCharXPos[32] = FONT_BMP_WIDTH - 20;
  fontCharWidth[32] = 16;
}

function createScrollState() {
  return {
    line: 0,
    tptr: 0,
    tstart: 0,
    chars: 0,
    textline: new Array(100).fill(0),
    ended: false,
  };
}

function doScroll(state, fb) {
  if (state.ended) return;

  fb.copyWithin(0, FBW, FBW * FBH);

  if (state.line === 0) {
    let a = 0;
    state.tstart = 0;
    state.chars = 0;
    while (text[state.tptr] !== '\n' && state.tptr < text.length) {
      state.textline[a] = text.charCodeAt(state.tptr);
      state.tstart += (fontCharWidth[state.textline[a]] || 0) + 2;
      state.tptr++;
      a++;
      state.chars++;
    }
    state.textline[a] = text.charCodeAt(state.tptr);
    state.tptr++;
    state.tstart = Math.floor((639 - state.tstart) / 2);
    if (state.textline[0] === 91) state.chars = 0; // '['
  }

  const scanbuf = new Uint8Array(FBW);
  let x = state.tstart;
  for (let a = 0; a < state.chars; a++) {
    const cw = fontCharWidth[state.textline[a]] || 0;
    const sx0 = fontCharXPos[state.textline[a]] || 0;
    for (let b = 0; b < cw; b++, x++) {
      if (x >= 0 && x < FBW)
        scanbuf[x] = fontData[state.line * FONT_BMP_WIDTH + sx0 + b];
    }
    x += 2;
  }
  fb.set(scanbuf, 399 * FBW);

  if (state.textline[0] === 91) { // '['
    const height = (state.textline[1] - 48) * 10 + (state.textline[2] - 48);
    state.line = (state.line + 1) % height;
  } else {
    state.line = (state.line + 1) % FONT_HEIGHT;
  }

  if (String.fromCharCode(state.textline[0]) === '%') {
    state.ended = true;
  }
}

export default {
  label: 'endscrl',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    initPalette();
    initFont();
    fb640 = new Uint8Array(FBW * FBH);
    scrollState = createScrollState();

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

    // Replay from start to reach target frame (stateful scroller)
    fb640.fill(0);
    const st = createScrollState();
    for (let f = 0; f < targetFrame; f++) {
      doScroll(st, fb640);
      if (st.ended) break;
    }

    // Downsample 640×400 to 320×200
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let y = 0; y < H; y++) {
      const srcY = y * 2;
      for (let x = 0; x < W; x++) {
        const srcX = x * 2;
        const ci = fb640[srcY * FBW + srcX];
        const pi = Math.min(ci, 15);
        const r = Math.round(PAL[pi * 3] * k);
        const g = Math.round(PAL[pi * 3 + 1] * k);
        const b = Math.round(PAL[pi * 3 + 2] * k);
        rgba32[y * W + x] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
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
    rgba = fontData = fontCharWidth = fontCharXPos = fb640 = scrollState = null;
  },
};
