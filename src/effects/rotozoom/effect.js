/**
 * LENS_ROTO — Classic variant (Part 15)
 *
 * Rotozoom of the KOE picture at 160×100 resolution. The 320×200
 * background is resampled to a 256×256 wrapping texture. Each frame,
 * a rotated/scaled rectangle is sampled from the texture using two
 * displacement vectors (pixel-step and line-step). Animation parameters
 * (rotation angle, scale, offset) evolve per-frame following the
 * original's physics. Palette fades from white at start and to white
 * at end.
 *
 * Original code: LENS/MAIN.C part3() + ASM.ASM _rotate by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { LENS_PAL_B64, LENS_PIX_B64 } from '../lens/data.js';

const W = 160, H = 100;
const OUT_W = 320, OUT_H = 200;
const PIXELS = OUT_W * OUT_H;
const FRAME_RATE = 70;
const ASPECT_RATIO = 307 / 256;

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
let rgba, rotpic, pal;
let animD1, animD2, animScale, animFade;

function computeAnimParams() {
  let d1 = 0, d2 = 0.00007654321, d3 = 0;
  let scale = 2, scalea = -0.01;
  const maxFrames = 2001;

  animD1 = new Float64Array(maxFrames);
  animD2 = new Float64Array(maxFrames);
  animScale = new Float64Array(maxFrames);
  animFade = new Float64Array(maxFrames);

  for (let f = 0; f <= 2000; f++) {
    d1 -= 0.005;
    d2 += d3;
    scale += scalea;

    if (f > 25) { if (d3 < 0.02) d3 += 0.00005; }
    if (f < 270) { if (scale < 0.9) { if (scalea < 1) scalea += 0.0001; } }
    else if (f < 400) { if (scalea > 0.001) scalea -= 0.0001; }
    else if (f > 1600) { if (scalea > -0.1) scalea -= 0.001; }
    else if (f > 1100) {
      let a = f - 900; if (a > 100) a = 100;
      if (scalea < 256) scalea += 0.000001 * a;
    }

    let fade = 0;
    if (f > 2000 - 128) fade = clamp((f - (2000 - 128)) / 128, 0, 1);
    else if (f < 16) fade = 1 - clamp(f / 15, 0, 1);

    animD1[f] = d1;
    animD2[f] = d2;
    animScale[f] = scale;
    animFade[f] = fade;
  }
}

function interpolate(arr, frame) {
  const f = clamp(frame, 0, arr.length - 2);
  const lo = Math.floor(f);
  const hi = Math.min(lo + 1, arr.length - 1);
  const t = f - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}

export default {
  label: 'rotozoom',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    pal = b64ToUint8(LENS_PAL_B64);
    const back = b64ToUint8(LENS_PIX_B64);

    // Build 256×256 wrapping texture from 320×200 background
    rotpic = new Uint8Array(256 * 256);
    for (let x = 0; x < 256; x++) {
      for (let y = 0; y < 256; y++) {
        let a = Math.floor(y * 10 / 11 - 36 / 2);
        if (a < 0 || a > 199) a = 0;
        const srcIdx = (x + 32) + a * 320;
        rotpic[x + y * 256] = srcIdx < back.length ? back[srcIdx] : 0;
      }
    }

    computeAnimParams();

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, OUT_W, OUT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const frame = t * FRAME_RATE;
    const d1 = interpolate(animD1, frame);
    const d2 = interpolate(animD2, frame);
    const scale = interpolate(animScale, frame);
    const fadeLevel = interpolate(animFade, frame);

    // Compute displacement vectors
    const xa = Math.floor(-1024.0 * Math.sin(d2) * scale);
    const ya = Math.floor(1024.0 * Math.cos(d2) * scale);

    let startX = Math.floor(70.0 * Math.sin(d1) - 30);
    let startY = Math.floor(70.0 * Math.cos(d1) + 60);
    startX -= Math.floor(xa / 16);
    startY -= Math.floor(ya / 16);

    // Rotozoom at 160×100 into a 320×200 framebuffer (pixel-doubled)
    const fb = new Uint8Array(W * H);
    const npU = ya / 1024;
    const npV = -xa / 1024;
    const nlU = -npV * ASPECT_RATIO;
    const nlV = npU * ASPECT_RATIO;

    let u1 = startX, v1 = startY;
    let ofs = 0;
    for (let y = 0; y < H; y++) {
      let u = u1 + nlU;
      let v = v1 + nlV;
      u1 = u; v1 = v;
      for (let x = 0; x < W; x++) {
        u += npU;
        v += npV;
        fb[ofs++] = rotpic[((v & 0xFF) << 8) | (u & 0xFF)];
      }
    }

    // Apply palette with fade-to-white
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    let dstIdx = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const ci = fb[y * W + x];
        const baseR = pal[ci * 3], baseG = pal[ci * 3 + 1], baseB = pal[ci * 3 + 2];
        const r = Math.round(clamp(baseR + (63 - baseR) * fadeLevel, 0, 63) * k);
        const g = Math.round(clamp(baseG + (63 - baseG) * fadeLevel, 0, 63) * k);
        const b = Math.round(clamp(baseB + (63 - baseB) * fadeLevel, 0, 63) * k);
        const pixel = (255 << 24) | (b << 16) | (g << 8) | r;
        // Pixel-double: write to 2×2 block in 320×200 output
        const dy = y * 2, dx = x * 2;
        rgba32[dy * OUT_W + dx] = pixel;
        rgba32[dy * OUT_W + dx + 1] = pixel;
        rgba32[(dy + 1) * OUT_W + dx] = pixel;
        rgba32[(dy + 1) * OUT_W + dx + 1] = pixel;
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, OUT_W, OUT_H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
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
    rgba = rotpic = pal = null;
    animD1 = animD2 = animScale = animFade = null;
  },
};
