/**
 * PAM — Classic variant (Part 3)
 *
 * Pre-rendered explosion animation: an RLE-compressed video sequence
 * (originally a FLI file from 3D Studio) played back at 17.5 fps with
 * palette fading to/from white. The animation shows the ALKU landscape
 * exploding after the ships flyover.
 *
 * Original source: PAM/ folder in SecondReality repo (code by WILDFIRE,
 * animation by TRUG). The video was compressed with a custom RLE codec
 * in ANIM.C, decoded by ASMYT.ASM's ulosta_frame routine.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { ANI_B64, PALETTE } from './data.js';

const W = 320;
const H = 200;
const FRAME_RATE = 70 / 4; // 17.5 fps — original runs at VBlank/4

const PALETTE_FADE = [
  63, 32, 16, 8, 4, 2, 1, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 2, 4, 6, 9, 14, 20, 28, 37, 46,
  56, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63,
];

const MAX_VIDEO_FRAMES = 41;

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
  float beatPulse = pow(1.0 - uBeat, 8.0) * 0.06;
  color += color * beatPulse;
  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uFrame, uBeat;

let aniData = null;
let frameTex = null;
let rgbaBuffer = null;

// Pre-baked frames: array of Uint8Array(320*200) indexed framebuffers
let bakedFrames = null;

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function signed8(buf, i) {
  const v = buf[i];
  return v < 128 ? v : v - 256;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Decode all video frames from the RLE animation stream and store
 * each as an independent indexed framebuffer snapshot.
 */
function bakeAllFrames(data) {
  const fb = new Uint8Array(W * H);
  const frames = [];
  let ptr = 0;

  for (let f = 0; f < MAX_VIDEO_FRAMES; f++) {
    // Each frame starts on a 16-byte-aligned address
    while ((ptr & 0x0f) !== 0) ptr++;
    if (ptr >= data.length - 1) break;

    let p = 0;
    while (true) {
      const b = signed8(data, ptr++);
      if (b > 0) {
        const c = data[ptr++];
        for (let i = 0; i < b; i++) fb[p++] = c;
      } else if (b < 0) {
        p -= b;
      } else {
        break; // b === 0 → end of frame
      }
    }

    frames.push(Uint8Array.from(fb));
  }

  return frames;
}

/**
 * Build an RGBA palette with a white fade level applied.
 * fadeLevel: 0 = normal palette, 63 = full white.
 */
function buildFadedPalette(fadeLevel) {
  const pal = new Uint32Array(256);
  const k = 255 / 63;
  const fl = fadeLevel / 63;
  for (let i = 0; i < 256; i++) {
    const r = Math.round(clamp(fl * 63 + (1 - fl) * PALETTE[i * 3], 0, 63) * k);
    const g = Math.round(clamp(fl * 63 + (1 - fl) * PALETTE[i * 3 + 1], 0, 63) * k);
    const b = Math.round(clamp(fl * 63 + (1 - fl) * PALETTE[i * 3 + 2], 0, 63) * k);
    pal[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  return pal;
}

export default {
  label: 'pam',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrame = gl.getUniformLocation(program, 'uFrame');
    uBeat = gl.getUniformLocation(program, 'uBeat');

    aniData = b64ToUint8(ANI_B64);
    bakedFrames = bakeAllFrames(aniData);
    aniData = null; // free raw data after baking

    rgbaBuffer = new Uint8Array(W * H * 4);

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, beat, _params) {
    const animFrame = Math.floor(t * FRAME_RATE);
    const videoIdx = clamp(animFrame, 0, bakedFrames.length - 1);
    const fadeIdx = clamp(animFrame, 0, PALETTE_FADE.length - 1);
    const fadeLevel = PALETTE_FADE[fadeIdx];

    const palette32 = buildFadedPalette(fadeLevel);
    const fb = bakedFrames[videoIdx];
    const rgba32 = new Uint32Array(rgbaBuffer.buffer);
    for (let i = 0; i < W * H; i++) rgba32[i] = palette32[fb[i]];

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rgbaBuffer);

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
    aniData = null;
    bakedFrames = null;
    rgbaBuffer = null;
    frameTex = null;
  },
};
