/**
 * U2A — Classic variant (Part 2)
 *
 * 3D polygon ships flyover: three flat/Gouraud-shaded spaceship models
 * fly over the ALKU landscape background, driven by a pre-recorded binary
 * animation stream at 70 fps. The 3D engine uses painter's algorithm
 * with Sutherland-Hodgman polygon clipping — a faithful port of PSI's
 * original VISU engine running in VGA Mode 13h (320×200).
 *
 * Original source: VISU/ folder in SecondReality repo (code by PSI).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { createU2Engine } from './engine.js';
import { SCENE_B64, ANIM_B64, OBJ_B64S } from './data.js';
import {
  LANDSCAPE_B64,
  LANDSCAPE_PAL,
  LANDSCAPE_W,
  LANDSCAPE_H,
} from '../alku/data.js';

const W = 320;
const H = 200;
const DISPLAY_H = 256;
const FRAME_RATE = 70;
const BG_COLOR_OFFSET = 192;
const BG_XSCROLL = 320;

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

let engine = null;
let bgPic = null;
let palette32 = null;
let rgbaBuffer = null;
let frameTex = null;

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function buildPalette(scene) {
  const pal768 = new Uint8Array(768);
  for (let i = 0; i < 768; i++) pal768[i] = scene[16 + i];
  for (let i = 0; i < 63 * 3; i++) pal768[BG_COLOR_OFFSET * 3 + i] = LANDSCAPE_PAL[i];

  const pal = new Uint32Array(256);
  const k = 255 / 63;
  for (let i = 0; i < 256; i++) {
    const r = Math.round(pal768[i * 3] * k);
    const g = Math.round(pal768[i * 3 + 1] * k);
    const b = Math.round(pal768[i * 3 + 2] * k);
    pal[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  pal[0] = 0;
  return pal;
}

function buildBackground() {
  const pix = b64ToUint8(LANDSCAPE_B64);
  const bg = new Uint8Array(W * H);
  for (let y = 0; y < H - 2; y++) {
    for (let x = 0; x < W; x++) {
      bg[x + y * W] = pix[x + BG_XSCROLL + y * LANDSCAPE_W] + BG_COLOR_OFFSET;
    }
  }
  return bg;
}

export default {
  label: 'u2a',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrame = gl.getUniformLocation(program, 'uFrame');
    uBeat = gl.getUniformLocation(program, 'uBeat');

    engine = createU2Engine();
    const scene = engine.init(SCENE_B64, OBJ_B64S, ANIM_B64);
    engine.bakeAnimation();

    palette32 = buildPalette(scene);
    bgPic = buildBackground();
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
    const targetFrame = Math.floor(t * FRAME_RATE);

    engine.seekFrame(targetFrame);

    const fb = engine.framebuffer;
    const cy0 = engine.clipY[0];
    const cy1 = engine.clipY[1];

    fb.fill(0);
    for (let y = 0; y < cy1; y++) {
      for (let x = 0; x < W; x++) {
        fb[x + (y + cy0) * W] = bgPic[x + y * W];
      }
    }

    engine.renderFrame();

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
    engine = null;
    bgPic = null;
    palette32 = null;
    rgbaBuffer = null;
    frameTex = null;
  },
};
