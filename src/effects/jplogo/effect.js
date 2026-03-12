/**
 * JPLOGO — Classic variant (Part 21)
 *
 * "Jellypic" — The Future Crew logo scrolls in vertically with
 * deceleration, then bounces/distorts with a jelly effect. The logo
 * is 320×400 (VGA double-scan), displayed by horizontally zooming
 * each row based on a sine-wave modulation with bouncing amplitude.
 *
 * Original code: JPLOGO folder by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { LOGO_W, LOGO_H, LOGO_PAL_B64, LOGO_PIX_B64 } from './data.js';

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
let rgba, pal, logoRows;
let scrollpos, framey1t, framey2t;
let sin1024;

function precompute() {
  sin1024 = new Int32Array(1024);
  for (let i = 0; i < 1024; i++) sin1024[i] = Math.floor(255 * Math.sin(i / 1024 * 2 * Math.PI));

  // Pre-compute scroll positions (decelerating scroll-in)
  let scrolly = 400, scrollyspd = 64;
  scrollpos = [];
  while (scrolly > 0) {
    scrolly -= scrollyspd / 64;
    scrollyspd += 6;
    if (scrolly < 0) scrolly = 0;
    scrollpos.push(Math.floor(scrolly));
  }

  // Pre-compute jelly bounce parameters
  const framey1 = new Float64Array(200);
  const framey2 = new Float64Array(200);
  let y1 = 0, y2 = 399 * 16, y1a = 500, y2a = 500, mika = 1, halt = 0, a = 0, la;
  for (let frame = 0; frame < 200; frame++) {
    if (!halt) {
      y1 += y1a; y2 += y2a;
      y2a += 16;
      if (y2 > 400 * 16) { y2 -= y2a; y2a = Math.floor(-y2a * mika / 8); if (mika < 4) mika += 3; }
      y1a += 16;
      la = a;
      a = (y2 - y1) - 400 * 16;
      if ((a & 0x8000) ^ (la & 0x8000)) y1a = Math.floor(y1a * 7 / 8);
      y1a += Math.floor(a / 8);
      y2a -= Math.floor(a / 8);
    }
    if (frame > 90) {
      if (y2 >= 399 * 16) { y2 = 400 * 16; halt = 1; }
      else y2a = 8;
      y1 = y2 - 400 * 16;
    }
    framey1[frame] = Math.floor(y1);
    framey2[frame] = Math.floor(y2);
  }

  framey1t = new Float64Array(800);
  framey2t = new Float64Array(800);
  for (let a = 0; a < 800; a++) {
    const b = Math.floor(a / 4);
    const c = a & 3, d = 3 - c;
    const b1 = Math.min(b + 1, 199);
    framey1t[a] = Math.floor((framey1[b] * d + framey1[b1] * c) / 3);
    framey2t[a] = Math.floor((framey2[b] * d + framey2[b1] * c) / 3);
  }
}

export default {
  label: 'jplogo',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    pal = b64ToUint8(LOGO_PAL_B64);
    pal[64 * 3] = pal[64 * 3 + 1] = pal[64 * 3 + 2] = 0;
    logoRows = b64ToUint8(LOGO_PIX_B64);

    precompute();

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
    const fb = new Uint8Array(W * 400);

    if (frame < scrollpos.length) {
      // Phase 1: Vertical scroll-in
      const yy = scrollpos[Math.min(frame, scrollpos.length - 1)];
      for (let y = 0; y < 400; y++) {
        const dest = y - yy;
        if (dest > 0 && dest < 400) {
          linezoom(fb, dest * W, y, 184);
        }
      }
    } else {
      // Phase 2: Jelly distortion
      const jframe = Math.min(frame - scrollpos.length, 799);
      const y1 = Math.floor(framey1t[jframe] / 16);
      const y2 = Math.floor(framey2t[jframe] / 16);
      const xsc = (400 - (y2 - y1)) / 8;

      for (let y = 0; y < 400; y++) {
        if (y < y1 || y >= y2) {
          for (let x = 0; x < W; x++) fb[y * W + x] = 0;
        } else {
          const b = Math.floor((y - y1) * 400 / (y2 - y1));
          let a = 184 + Math.floor((sin1024[Math.floor(b * 32 / 25) & 1023] * xsc + 32) / 64);
          a &= ~1;
          linezoom(fb, y * W, b, a);
        }
      }
    }

    // Convert 320×400 to 320×200 (every other line)
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let y = 0; y < H; y++) {
      const srcY = y * 2;
      for (let x = 0; x < W; x++) {
        const ci = fb[srcY * W + x];
        const r = Math.round(clamp(pal[ci * 3], 0, 63) * k);
        const g = Math.round(clamp(pal[ci * 3 + 1], 0, 63) * k);
        const b = Math.round(clamp(pal[ci * 3 + 2], 0, 63) * k);
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
    rgba = pal = logoRows = scrollpos = framey1t = framey2t = sin1024 = null;
  },
};

function linezoom(fb, dest, srcRow, size) {
  if (size <= 0) {
    for (let x = 0; x < W; x++) fb[dest + x] = 0;
    return;
  }
  const halfsize = Math.floor(size / 2);
  const firstx = 160 - halfsize;
  const lastx = 160 + halfsize;
  const inc = LOGO_W / (lastx - firstx);
  const rowOff = srcRow * LOGO_W;

  for (let x = 0; x < firstx; x++) fb[dest + x] = 0;
  for (let x = lastx + 1; x < W; x++) fb[dest + x] = 0;
  let cx = 0;
  for (let x = firstx; x <= lastx; x++) {
    if (x >= 0 && x < W) fb[dest + x] = logoRows[rowOff + Math.min(Math.floor(cx), LOGO_W - 1)];
    cx += inc;
  }
}
