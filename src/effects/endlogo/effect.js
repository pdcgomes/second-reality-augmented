/**
 * ENDLOGO — Classic variant (Part 23)
 *
 * Displays the end logo (320×400 VGA double-scan) with a fade-in
 * from white, a hold period, and a fade-out to black.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { ENDLOGO_PAL_B64, ENDLOGO_PIX_B64 } from './data.js';

const W = 320, H = 200, PIXELS = W * H;
const FRAME_RATE = 70;
const FADE_IN_FRAMES = 128;
const HOLD_START = FADE_IN_FRAMES;
const HOLD_END = 500;
const FADE_OUT_FRAMES = 32;

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
let rgba, basePal, pixels;

export default {
  label: 'endlogo',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    basePal = b64ToUint8(ENDLOGO_PAL_B64);
    pixels = b64ToUint8(ENDLOGO_PIX_B64);

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
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);

    let fadeLevel;
    if (frame < FADE_IN_FRAMES) {
      fadeLevel = 1.0 - frame / FADE_IN_FRAMES;
    } else if (frame < HOLD_END) {
      fadeLevel = 0;
    } else {
      const fadeOutProgress = clamp((frame - HOLD_END) / FADE_OUT_FRAMES, 0, 1);
      fadeLevel = -fadeOutProgress;
    }

    for (let y = 0; y < H; y++) {
      const srcY = y * 2;
      for (let x = 0; x < W; x++) {
        const ci = pixels[srcY * W + x];
        let r = basePal[ci * 3];
        let g = basePal[ci * 3 + 1];
        let b = basePal[ci * 3 + 2];

        if (fadeLevel > 0) {
          r = r + (63 - r) * fadeLevel;
          g = g + (63 - g) * fadeLevel;
          b = b + (63 - b) * fadeLevel;
        } else if (fadeLevel < 0) {
          const f = 1 + fadeLevel;
          r *= f; g *= f; b *= f;
        }

        r = Math.round(clamp(r, 0, 63) * k);
        g = Math.round(clamp(g, 0, 63) * k);
        b = Math.round(clamp(b, 0, 63) * k);
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
    rgba = basePal = pixels = null;
  },
};
