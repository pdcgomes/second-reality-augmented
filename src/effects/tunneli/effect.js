/**
 * TUNNELI (Dottitunneli) — Classic variant (Part 7)
 *
 * Dot-based tunnel effect: concentric ellipses of 64 discrete dots
 * each, receding into depth. The tunnel path follows sinusoidal
 * curves whose amplitude grows over time, creating an accelerating
 * spiral. Circles alternate bright/dark every 8 frames.
 *
 * All state is derivable from the frame number (no cumulative state)
 * so scrubbing works in O(1).
 *
 * Original code: TUNNELI/ folder (Turbo Pascal by TRUG).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const W = 320, H = 200;
const FRAME_RATE = 70;
const VEKE = 1060;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

let program = null, quad = null, uFrameLoc;
let frameTex = null;
let fb = null, rgba = null;
let pcalc, sinit, cosit, sade, pal32;

export default {
  label: 'tunneli',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');

    fb = new Uint8Array(W * H);
    rgba = new Uint8Array(W * H * 4);

    // Circle templates: 138 radii, 64 dots each (elliptical: 1.7× wider than tall)
    pcalc = new Array(138);
    for (let z = 10; z < 148; z++) {
      const ring = new Array(64);
      for (let a = 0; a < 64; a++) {
        ring[a] = {
          x: 160 + Math.trunc(Math.sin(a * Math.PI / 32) * (1.7 * z)),
          y: 100 + Math.trunc(Math.cos(a * Math.PI / 32) * z),
        };
      }
      pcalc[z - 10] = ring;
    }

    // Position tables: amplitude grows with index for accelerating spiral
    sinit = new Float64Array(4096);
    cosit = new Float64Array(2048);
    for (let x = 0; x < 4096; x++) sinit[x] = Math.sin(Math.PI * x / 128) * (x * 3 / 128);
    for (let x = 0; x < 2048; x++) cosit[x] = Math.cos(Math.PI * x / 128) * (x * 4 / 64);

    // Perspective radius: far circles → small, near → large
    sade = new Int32Array(101);
    for (let z = 0; z <= 100; z++) sade[z] = Math.trunc(16384 / (z * 7 + 95));

    // Build RGBA palette from 6-bit VGA values
    pal32 = new Uint32Array(256);
    pal32.fill(0xFF000000);
    const k = 255 / 63;
    // Bright range: 64–128 (white→black)
    for (let x = 0; x <= 64; x++) {
      const v = Math.round(Math.min(63, 64 - x) * k);
      pal32[64 + x] = 0xFF000000 | (v << 16) | (v << 8) | v;
    }
    // Dark range: 128–192 (3/4-bright→black)
    for (let x = 0; x <= 64; x++) {
      const v = Math.round(Math.floor((64 - x) * 3 / 4) * k);
      pal32[128 + x] = 0xFF000000 | (v << 16) | (v << 8) | v;
    }
    // Black gaps for circle flicker
    pal32[0] = 0xFF000000;
    pal32[68] = 0xFF000000;
    pal32[132] = 0xFF000000;
    pal32[255] = 0xFF000000 | (Math.round(63 * k) << 8);

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
    fb.fill(0);

    // Reference circle (putki[5]) for viewport tracking
    const birth5 = frame - 94;
    let refX = 0, refY = 0;
    if (birth5 >= 0) {
      refX = -sinit[(birth5 * 3) & 4095];
      refY = sinit[(birth5 * 2) & 4095] - cosit[birth5 & 2047] + sinit[birth5 & 4095];
    }

    // Draw circles back-to-front (x=80 far → x=4 near)
    for (let x = 80; x >= 4; x--) {
      const birthFrame = frame - 99 + x;
      if (birthFrame < 0) continue;

      const px = -sinit[(birthFrame * 3) & 4095];
      const py = sinit[(birthFrame * 2) & 4095] - cosit[birthFrame & 2047] + sinit[birthFrame & 4095];

      let baseColor;
      if (birthFrame >= VEKE - 102) baseColor = 0;
      else if ((birthFrame & 15) > 7) baseColor = 128;
      else baseColor = 64;

      const bbc = baseColor + Math.trunc(x / 1.3);
      if (bbc < 64) continue;

      const bx = px - refX;
      const by = py - refY;
      const br = sade[x];
      if (br < 0 || br >= 138) continue;
      const ring = pcalc[br];

      for (let i = 0; i < 64; i++) {
        const dx = ring[i].x + bx;
        const dy = ring[i].y + by;
        if (dx >= 0 && dx <= 319 && dy >= 0 && dy <= 199) {
          fb[Math.trunc(dx) + Math.trunc(dy) * W] = bbc;
        }
      }
    }

    // Convert indexed framebuffer to RGBA
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < W * H; i++) rgba32[i] = pal32[fb[i]];

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
    program = null;
    quad = null;
    frameTex = null;
    fb = rgba = pcalc = sinit = cosit = sade = pal32 = null;
  },
};
