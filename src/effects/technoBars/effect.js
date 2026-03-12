/**
 * TECHNO_BARS — Classic variant (Part 10)
 *
 * Rotating parallel bars drawn into 8 video pages across 4 EGA bit-planes.
 * Each frame draws bars into a monochrome buffer, then merges into one
 * bit-plane of the current page. Pages cycle every frame, planes every
 * 8 frames. After 32 frames all planes are filled — overlapping bars
 * from different bit-planes create brighter colors via the palette.
 *
 * Three sequences with different motion parameters:
 *   doit1 (6s): Slow rotating bars with bouncing spacing
 *   doit2 (12s): Accelerating rotation, collapsing spacing
 *   doit3 (14s): Orbiting center point, scroll-out at end
 *
 * Original code: TECHNO/KOE.C + KOEA.ASM by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const W = 320, H = 200, PX = W * H;
const FRAME_RATE = 70;
const SEQ1_END = 70 * 6;
const SEQ2_END = 70 * (6 + 12);
const SEQ3_END = 70 * (6 + 12 + 14);

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

// ── Convex polygon scanline fill ──

function fillConvex(fb, verts, color) {
  const n = verts.length;
  if (n < 3) return;
  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (verts[i][1] < yMin) yMin = verts[i][1];
    if (verts[i][1] > yMax) yMax = verts[i][1];
  }
  const yStart = Math.max(0, Math.ceil(yMin));
  const yEnd = Math.min(H - 1, Math.floor(yMax));
  for (let y = yStart; y <= yEnd; y++) {
    let xMin = W, xMax = -1;
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      if ((a[1] <= y && b[1] >= y) || (b[1] <= y && a[1] >= y)) {
        const dy = b[1] - a[1];
        if (dy === 0) {
          if (a[0] < xMin) xMin = a[0];
          if (a[0] > xMax) xMax = a[0];
          if (b[0] < xMin) xMin = b[0];
          if (b[0] > xMax) xMax = b[0];
        } else {
          const x = a[0] + (y - a[1]) * (b[0] - a[0]) / dy;
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
        }
      }
    }
    const x0 = Math.max(0, Math.round(xMin));
    const x1 = Math.min(W - 1, Math.round(xMax));
    const base = y * W;
    for (let x = x0; x <= x1; x++) fb[base + x] = color;
  }
}

// ── Palette generation ──

function generateBasePalette() {
  const pal = new Uint8Array(16 * 3 * 16);
  const baseRGB = [
    [0, 0, 0],
    [Math.floor(38 * 64 / 111), Math.floor(33 * 64 / 111), Math.floor(44 * 64 / 111)],
    [Math.floor(52 * 64 / 111), Math.floor(45 * 64 / 111), Math.floor(58 * 64 / 111)],
    [Math.floor(67 * 64 / 111), Math.floor(61 * 64 / 111), Math.floor(73 * 64 / 111)],
    [Math.floor(83 * 64 / 111), Math.floor(77 * 64 / 111), Math.floor(89 * 64 / 111)],
  ];
  for (let c = 0; c < 16; c++) {
    let idx = 16 * 3 * c;
    for (let a = 0; a < 16; a++) {
      let pop = 0;
      if (a & 1) pop++;
      if (a & 2) pop++;
      if (a & 4) pop++;
      if (a & 8) pop++;
      let [r, g, b] = baseRGB[pop];
      r = Math.floor(r * Math.floor(10 + c * 9 / 9) / 10);
      g = Math.floor(g * Math.floor(10 + c * 7 / 9) / 10);
      b = Math.floor(b * Math.floor(10 + c * 5 / 9) / 10);
      pal[idx++] = clamp(r, 0, 63);
      pal[idx++] = clamp(g, 0, 63);
      pal[idx++] = clamp(b, 0, 63);
    }
  }
  return pal;
}

// ── Module state ──

let program = null, quad = null, uFrameLoc, frameTex;
let rgba = null;
let sin1024, basePal;
let vpages, vbuf, fb;
let currentPlane, currentPage;
let rot, rota, rot2, vm, vma, xpos, xposa;
let curpal, lastFrame, seq1Init, seq2Init, seq3Init, doit3Start;

function resetState() {
  vpages = [];
  for (let i = 0; i < 8; i++) vpages[i] = new Uint8Array(PX);
  vbuf = new Uint8Array(PX);
  fb = new Uint8Array(PX);
  currentPlane = 0;
  currentPage = 0;
  rot = 0; rota = 0; rot2 = 0;
  vm = 0; vma = 0;
  xpos = 0; xposa = 0;
  curpal = 0;
  lastFrame = -1;
  seq1Init = false;
  seq2Init = false;
  seq3Init = false;
  doit3Start = 0;
}

function drawBars(rotVal, vmVal, wx, wy) {
  vbuf.fill(0);
  const rotf = Math.floor(rotVal);
  const hx = sin1024[(rotf) & 1023] * 16 * 6 / 5;
  const hy = sin1024[(rotf + 256) & 1023] * 16;
  let vx = sin1024[(rotf + 256) & 1023] * 6 / 5;
  let vy = sin1024[(rotf + 512) & 1023];
  vx = vx * vmVal / 100;
  vy = vy * vmVal / 100;
  for (let c = -10; c < 11; c += 2) {
    const cx = vx * c * 2, cy = vy * c * 2;
    fillConvex(vbuf, [
      [(-hx - vx + cx) / 16 + wx, (-hy - vy + cy) / 16 + wy],
      [(-hx + vx + cx) / 16 + wx, (-hy + vy + cy) / 16 + wy],
      [(+hx + vx + cx) / 16 + wx, (+hy + vy + cy) / 16 + wy],
      [(+hx - vx + cx) / 16 + wx, (+hy - vy + cy) / 16 + wy],
    ], 1);
  }
}

function mergePlane(pageIdx, plane, scrollX) {
  const page = vpages[pageIdx];
  const msk = 1 << plane;
  const nmsk = ~msk & 0xFF;
  for (let i = 0; i < PX; i++) {
    if (vbuf[i]) page[i] |= msk;
    else page[i] &= nmsk;
  }
  if (scrollX === 0) {
    fb.set(page);
  } else {
    for (let yy = 0; yy < PX; yy += W) {
      for (let x = 0; x < W; x++) {
        fb[yy + x] = x < scrollX ? 0 : page[yy + x - scrollX];
      }
    }
  }
}

function advancePage() {
  currentPage = (currentPage + 1) % 8;
  if (currentPage === 0) currentPlane = (currentPlane + 1) % 4;
}

function stepOneFrame(frame) {
  // Approximate beat-synced palette flash every ~35 frames
  if (frame % 35 === 0) curpal = 15;
  if (curpal > 0) curpal--;

  if (frame < SEQ1_END) {
    if (!seq1Init) {
      seq1Init = true;
      currentPlane = 0; currentPage = 0;
      for (let i = 0; i < 8; i++) vpages[i].fill(0);
      rot = 45; vm = 50; vma = 0;
    }
    drawBars(rot, vm, 160, 100);
    rot += 2;
    vm += vma;
    if (vm < 25) { vm -= vma; vma = -vma; }
    vma -= 1;
    mergePlane(currentPage, currentPlane, 0);
    advancePage();
  } else if (frame < SEQ2_END) {
    if (!seq2Init) {
      seq2Init = true;
      currentPlane = 0; currentPage = 0;
      for (let i = 0; i < 8; i++) vpages[i].fill(0);
      rot = 50; rota = 10; vm = 100 * 64; vma = 0;
    }
    drawBars(rot, vm / 64, 160, 100);
    rot += rota / 10;
    vm += vma;
    if (vm < 0) { vm -= vma; vma = -vma; }
    vma -= 1;
    rota += 1;
    mergePlane(currentPage, currentPlane, 0);
    advancePage();
  } else if (frame < SEQ3_END) {
    if (!seq3Init) {
      seq3Init = true;
      currentPlane = 0; currentPage = 0;
      for (let i = 0; i < 8; i++) vpages[i].fill(0);
      rot = 45; rota = 10; rot2 = 0;
      xposa = 0; xpos = 0;
      vm = 100 * 64; vma = 0;
      doit3Start = frame;
    }
    const rot2f = Math.floor(rot2);
    let wx, wy;
    if (rot2 < 32) {
      wx = sin1024[(rot2f) & 1023] * rot2 / 8 + 160;
      wy = sin1024[(rot2f + 256) & 1023] * rot2 / 8 + 100;
    } else {
      wx = sin1024[(rot2f) & 1023] / 4 + 160;
      wy = sin1024[(rot2f + 256) & 1023] / 4 + 100;
    }
    rot2 += 17;
    drawBars(rot, vm / 64, wx, wy);
    rot += rota / 10;
    vm += vma;
    if (vm < 0) { vm -= vma; vma = -vma; }
    vma -= 1;
    rota += 1;

    let scrollX = 0;
    if (frame - doit3Start > 70 * 14 - 333) {
      xpos += Math.floor(xposa / 4);
      if (xpos > 320) xpos = 320;
      else xposa += 1;
      scrollX = xpos;
    }
    mergePlane(currentPage, currentPlane, scrollX);
    advancePage();
  }
}

export default {
  label: 'technoBars',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PX * 4);

    sin1024 = new Int32Array(1024);
    for (let x = 0; x < 1024; x++) sin1024[x] = Math.floor(Math.sin(2 * Math.PI * x / 1024) * 255);
    basePal = generateBasePalette();

    resetState();

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, beat, _params) {
    const targetFrame = Math.min(Math.floor(t * FRAME_RATE), SEQ3_END - 1);

    if (targetFrame < lastFrame) resetState();
    while (lastFrame < targetFrame) {
      lastFrame++;
      stepOneFrame(lastFrame);
    }

    // Build RGBA from indexed fb + palette
    const palOff = clamp(curpal, 0, 15) * 16 * 3;
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < PX; i++) {
      const ci = fb[i] & 0x0F;
      const r = Math.round(basePal[palOff + ci * 3] * k);
      const g = Math.round(basePal[palOff + ci * 3 + 1] * k);
      const b = Math.round(basePal[palOff + ci * 3 + 2] * k);
      rgba32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }

    // Beat-pulse overlay: briefly flash palette on beat
    if (beat < 0.1) curpal = 15;

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
    rgba = vpages = vbuf = fb = sin1024 = basePal = null;
  },
};
