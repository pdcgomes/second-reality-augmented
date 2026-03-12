/**
 * PLZ_PLASMA — Classic variant (Part 16)
 *
 * Two layered sine-wave plasmas rendered at 320×280 in interleaved
 * mode (even/odd rows and columns swap plasma layers). The plasma
 * uses multi-harmonic sine tables (lsini4, lsini16, psini) giving
 * rich organic patterns. Three palette sequences (red-ish, rainbow,
 * gray-white) cycle via "drop" transitions where the plasma falls
 * off-screen and reinitializes.
 *
 * Original code: PLZ/PLZ.C + ASMYT.ASM + COPPER.ASM by WILDFIRE.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const W = 320, H = 200, PIXELS = W * H;
const FRAME_RATE = 70;
const QUAD_MAXX = 80;
const MAXY = 280;
const DPII = 2 * Math.PI;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

const INITTABLE = [
  [1000,2000,3000,4000,3500,2300,3900,3670],
  [1000,2000,4000,4000,1500,2300,3900,1670],
  [3500,1000,3000,1000,3500,3300,2900,2670],
  [1000,2000,3000,4000,3500,2300,3900,3670],
  [1000,2000,3000,4000,3500,2300,3900,3670],
  [1000,2000,3000,4000,3500,2300,3900,3670],
];

// Approximate sync points as frame numbers (3 drops across 37.7s ≈ 2639 frames)
const SYNC_FRAMES = [0, 880, 1760, 2400];

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

let program, quad, uFrameLoc, frameTex;
let rgba;
let lsini4, lsini16, psini, ptau;
let pals;

function initTables() {
  lsini4 = new Int32Array(8192);
  lsini16 = new Int32Array(8192);
  psini = new Int32Array(16384);
  ptau = new Int32Array(129);

  for (let a = 0; a < 8192; a++)
    lsini4[a] = Math.floor((Math.sin(a * DPII / 4096) * 55 + Math.sin(a * DPII / 4096 * 5) * 8 + Math.sin(a * DPII / 4096 * 15) * 2 + 64) * 8);
  for (let a = 0; a < 8192; a++)
    lsini16[a] = Math.floor((Math.sin(a * DPII / 4096) * 55 + Math.sin(a * DPII / 4096 * 4) * 5 + Math.sin(a * DPII / 4096 * 17) * 3 + 64) * 16);
  for (let a = 0; a < 16384; a++)
    psini[a] = Math.floor(Math.sin(a * DPII / 4096) * 55 + Math.sin(a * DPII / 4096 * 6) * 5 + Math.sin(a * DPII / 4096 * 21) * 4 + 64);

  ptau[0] = 0;
  for (let a = 1; a <= 128; a++)
    ptau[a] = Math.floor(Math.cos(a * DPII / 128 + Math.PI) * 31 + 32);

  function iptau(k) { return ptau[Math.floor(clamp(k, 0, 128))]; }

  pals = new Array(6);
  for (let i = 0; i < 6; i++) { pals[i] = new Float64Array(768); }

  let pptr, pal;
  // Palette 0: RGB red
  pptr = 3; pal = pals[0];
  for (let a = 1; a < 64; a++) { pal[pptr++] = iptau(a); pal[pptr++] = iptau(0); pal[pptr++] = iptau(0); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(63 - a); pal[pptr++] = iptau(0); pal[pptr++] = iptau(0); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(0); pal[pptr++] = iptau(0); pal[pptr++] = iptau(a); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(a); pal[pptr++] = iptau(0); pal[pptr++] = iptau(63 - a); }

  // Palette 1: RB-rainbow
  pptr = 3; pal = pals[1];
  for (let a = 1; a < 64; a++) { pal[pptr++] = iptau(a); pal[pptr++] = iptau(0); pal[pptr++] = iptau(0); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(63 - a); pal[pptr++] = iptau(0); pal[pptr++] = iptau(a); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(0); pal[pptr++] = iptau(a); pal[pptr++] = iptau(63 - a); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(a); pal[pptr++] = iptau(63); pal[pptr++] = iptau(a); }

  // Palette 2: white/gray
  pptr = 3; pal = pals[2];
  for (let a = 1; a < 64; a++) { pal[pptr++] = Math.floor(iptau(0) / 2); pal[pptr++] = Math.floor(iptau(0) / 2); pal[pptr++] = Math.floor(iptau(0) / 2); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = Math.floor(iptau(a) / 2); pal[pptr++] = Math.floor(iptau(a) / 2); pal[pptr++] = Math.floor(iptau(a) / 2); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = Math.floor(iptau(63 - a) / 2); pal[pptr++] = Math.floor(iptau(63 - a) / 2); pal[pptr++] = Math.floor(iptau(63 - a) / 2); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = Math.floor(iptau(0) / 2); pal[pptr++] = Math.floor(iptau(0) / 2); pal[pptr++] = Math.floor(iptau(0) / 2); }

  // Palette 3: RB-white (unused in final but present)
  pptr = 3; pal = pals[3];
  for (let a = 1; a < 64; a++) { pal[pptr++] = iptau(a); pal[pptr++] = iptau(0); pal[pptr++] = iptau(0); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(63); pal[pptr++] = iptau(a); pal[pptr++] = iptau(a); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(63 - a); pal[pptr++] = iptau(63 - a); pal[pptr++] = iptau(63); }
  for (let a = 0; a < 64; a++) { pal[pptr++] = iptau(0); pal[pptr++] = iptau(0); pal[pptr++] = iptau(63); }
}

export default {
  label: 'plasma',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);
    initTables();

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

    // Determine current sequence based on approximate sync points
    let seq = 0;
    for (let s = SYNC_FRAMES.length - 1; s >= 0; s--) {
      if (frame >= SYNC_FRAMES[s]) { seq = s; break; }
    }

    // Compute drop state
    let lc = 60;
    let inDrop = false;
    if (seq > 0) {
      const dropFrame = frame - SYNC_FRAMES[seq];
      if (dropFrame < 64) {
        lc = Math.floor(dropFrame * dropFrame / 4 * 43 / 128 + 60);
        inDrop = true;
      }
    }

    // Replay plasma parameters from sequence start
    const seqStart = SYNC_FRAMES[seq];
    const seqFrame = inDrop ? 0 : frame - seqStart - (seq > 0 ? 64 : 0);
    const effectiveSeq = seq >= 3 ? 2 : seq;

    let k1 = INITTABLE[effectiveSeq][4], k2 = INITTABLE[effectiveSeq][5];
    let k3 = INITTABLE[effectiveSeq][6], k4 = INITTABLE[effectiveSeq][7];
    let l1 = INITTABLE[effectiveSeq][0], l2 = INITTABLE[effectiveSeq][1];
    let l3 = INITTABLE[effectiveSeq][2], l4 = INITTABLE[effectiveSeq][3];

    const MASK = 4095;
    const advFrames = Math.max(0, seqFrame);
    for (let f = 0; f < advFrames; f++) {
      k1 = (k1 - 3) & MASK; k2 = (k2 - 2) & MASK;
      k3 = (k3 + 1) & MASK; k4 = (k4 + 2) & MASK;
      l1 = (l1 - 1) & MASK; l2 = (l2 - 2) & MASK;
      l3 = (l3 + 2) & MASK; l4 = (l4 + 3) & MASK;
    }

    // Render plasma into a 320×400 buffer (we'll display the visible 200 lines)
    const fb400 = new Uint8Array(320 * 400);
    const kp = [k1, k2, k3, k4];
    const lp = [l1, l2, l3, l4];

    for (let y = 0; y < MAXY; y++) {
      const params = (y & 1) === 0 ? kp : lp;
      const firstEven = true;
      plzline(fb400, y, lc, params, firstEven);
    }
    for (let y = 0; y < MAXY; y++) {
      const params = (y & 1) === 1 ? kp : lp;
      plzline(fb400, y, lc, params, false);
    }

    // Select palette for current sequence
    const targetPal = pals[effectiveSeq];

    // Compute fade level
    let fadeFrac = 1;
    if (seq === 0 && frame < 126) {
      fadeFrac = frame / 126;
    } else if (inDrop) {
      fadeFrac = 0;
    } else if (seq > 0 && seqFrame < 30) {
      fadeFrac = Math.max(0, seqFrame) / 30;
    }

    // Build active palette
    const activePal = new Uint8Array(768);
    if (seq === 0 && frame < 126) {
      for (let i = 0; i < 768; i++) {
        activePal[i] = clamp(Math.round(63 + (targetPal[i] - 63) * fadeFrac), 0, 63);
      }
    } else {
      for (let i = 0; i < 768; i++) {
        activePal[i] = clamp(Math.round(targetPal[i] * fadeFrac), 0, 63);
      }
    }

    // Convert to 320×200 by taking every other line from the 400-line buffer
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let y = 0; y < H; y++) {
      const srcY = y * 2;
      for (let x = 0; x < W; x++) {
        const ci = fb400[srcY * 320 + x];
        const r = Math.round(clamp(activePal[ci * 3], 0, 63) * k);
        const g = Math.round(clamp(activePal[ci * 3 + 1], 0, 63) * k);
        const b = Math.round(clamp(activePal[ci * 3 + 2], 0, 63) * k);
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
    rgba = lsini4 = lsini16 = psini = ptau = pals = null;
  },
};

function plzline(fb, y, lc, params, firstPixelEven) {
  const fp = firstPixelEven ? 0 : 1;
  const yy = (y + lc) * 320;
  if (y + lc >= 400) return;
  let xx = 0;
  for (let x = 0; x < QUAD_MAXX; x++) {
    const rx = QUAD_MAXX - x;
    const bx1 = lsini16[(y + params[1] + rx * 4) & 0xFFF];
    const val1 = psini[(x * 8 + params[0] + bx1) & 0x3FFF];
    const bx2 = lsini4[(y + params[3] + x * 16) & 0xFFF];
    const val2 = psini[(bx2 + y * 2 + params[2] + rx * 4) & 0x3FFF];
    const ci = (val1 + val2) & 0xFF;
    fb[yy + xx + fp] = ci;
    fb[yy + xx + fp + 2] = ci;
    xx += 4;
  }
}
