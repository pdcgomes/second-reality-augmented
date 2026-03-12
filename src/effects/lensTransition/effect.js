/**
 * LENS_TRANSITION — Classic variant (Part 13)
 *
 * The KOE (face/leaf) picture is revealed by two "thunderbolt" curtain
 * edges sweeping outward from the center. Two reveal cursors advance
 * at different speeds per scanline (creating a zigzag pattern), copying
 * one pixel from the background image per cursor per iteration. Six
 * iterations per frame, 80 frames to complete the reveal.
 *
 * Original code: LENS/MAIN.C part1() by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { LENS_PAL_B64, LENS_PIX_B64 } from './data.js';

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
let rgba, back, pal;

export default {
  label: 'lensTransition',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    pal = b64ToUint8(LENS_PAL_B64);
    back = b64ToUint8(LENS_PIX_B64);

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

    // Reconstruct framebuffer by replaying the thunderbolt reveal.
    // Initialize cursor positions and speeds per scanline.
    const firfade1 = new Float64Array(H);
    const firfade2 = new Float64Array(H);
    const firfade1a = new Float64Array(H);
    const firfade2a = new Float64Array(H);

    for (let b = 0; b < H; b++) {
      firfade1a[b] = Math.floor(19 + b / 5 + 4) & ~7;
      firfade2a[b] = Math.floor(-(19 + (199 - b) / 5 + 4)) & ~7;
      firfade1[b] = 170 * 64 + (100 - b) * 50;
      firfade2[b] = 170 * 64 + (100 - b) * 50;
    }

    // Track which pixels have been revealed
    const revealed = new Uint8Array(PIXELS);
    const fb = new Uint8Array(PIXELS);

    const framesRun = Math.min(frame, 80);
    for (let f = 0; f < framesRun; f++) {
      for (let c = 0; c < 6; c++) {
        for (let y = 0; y < H; y++) {
          let x1 = firfade1[y] >> 6;
          if (x1 >= 0 && x1 < W) {
            const idx = y * W + x1;
            fb[idx] = back[idx];
            revealed[idx] = 1;
          }
          let x2 = firfade2[y] >> 6;
          if (x2 >= 0 && x2 < W) {
            const idx = y * W + x2;
            fb[idx] = back[idx];
            revealed[idx] = 1;
          }
          firfade1[y] += firfade1a[y];
          firfade2[y] += firfade2a[y];
        }
      }
    }

    // After frame 80, the full picture is revealed
    if (frame >= 80) {
      for (let i = 0; i < PIXELS; i++) fb[i] = back[i];
    }

    // Convert indexed framebuffer to RGBA
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < PIXELS; i++) {
      const ci = fb[i];
      const r = Math.round(clamp(pal[ci * 3], 0, 63) * k);
      const g = Math.round(clamp(pal[ci * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(pal[ci * 3 + 2], 0, 63) * k);
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
    rgba = back = pal = null;
  },
};
