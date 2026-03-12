/**
 * WATER — Classic variant (Part 19)
 *
 * "Peilipalloscroll" (Mirror Ball Scroller) by TRUG. A chrome/mirror
 * sword image scrolls across a background using pre-computed position
 * lookup tables (same technique as FOREST). Non-zero sword pixels
 * overwrite the background directly; zero pixels show the background.
 * Three interlaced POS passes distribute rendering across frames.
 *
 * The animation works by cumulatively shifting the 158×34 flat buffer
 * left by 1 element per step (every 3 frames), then inserting a new
 * column from the 400×34 sword font. After scp reaches 390, the shift
 * continues so the content scrolls off-screen.
 *
 * Original code: WATER/DEMO.PAS + ROUTINES.ASM by TRUG.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  FONT_W, VIEW_W, VIEW_H,
  PAL_B64, FONT_B64, BG_B64,
  WAT1_B64, WAT2_B64, WAT3_B64,
} from './data.js';

const W = 320, H = 200, PIXELS = W * H;
const FRAME_RATE = 70;
const SCP_MAX = 390;

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
let rgba, pal, font, tausta, posData;
let cachedFbuf, cachedScp, cachedStep;
const CHECKPOINT_INTERVAL = 50;
let checkpoints;

function animateOneStep(fbuf, scp) {
  const len = VIEW_W * VIEW_H;
  for (let i = 0; i < len - 1; i++) fbuf[i] = fbuf[i + 1];
  fbuf[len - 1] = 0;
  for (let x = 0; x < 33; x++) {
    fbuf[VIEW_W + x * VIEW_W] = font[x * FONT_W + scp];
  }
  return scp < SCP_MAX ? scp + 1 : scp;
}

function ensureFbuf(targetStep) {
  if (targetStep <= 0) return new Uint8Array(VIEW_W * VIEW_H);

  // Find nearest checkpoint at or before targetStep
  let startStep = 0;
  let fbuf = new Uint8Array(VIEW_W * VIEW_H);
  let scp = 0;

  // Try cached state first (fast path for sequential playback)
  if (cachedStep !== null && cachedStep <= targetStep && targetStep - cachedStep < CHECKPOINT_INTERVAL * 2) {
    fbuf = new Uint8Array(cachedFbuf);
    scp = cachedScp;
    startStep = cachedStep;
  } else {
    // Find best checkpoint
    const cpIdx = Math.floor(targetStep / CHECKPOINT_INTERVAL);
    for (let i = Math.min(cpIdx, checkpoints.length - 1); i >= 0; i--) {
      if (checkpoints[i]) {
        fbuf = new Uint8Array(checkpoints[i].fbuf);
        scp = checkpoints[i].scp;
        startStep = i * CHECKPOINT_INTERVAL;
        break;
      }
    }
  }

  // Replay from startStep to targetStep
  for (let s = startStep; s < targetStep; s++) {
    scp = animateOneStep(fbuf, scp);
    // Save checkpoints as we go
    const ci = Math.floor((s + 1) / CHECKPOINT_INTERVAL);
    if ((s + 1) % CHECKPOINT_INTERVAL === 0 && ci < checkpoints.length && !checkpoints[ci]) {
      checkpoints[ci] = { fbuf: new Uint8Array(fbuf), scp };
    }
  }

  cachedFbuf = new Uint8Array(fbuf);
  cachedScp = scp;
  cachedStep = targetStep;

  return fbuf;
}

export default {
  label: 'water',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    pal = b64ToUint8(PAL_B64);
    font = b64ToUint8(FONT_B64);
    tausta = b64ToUint8(BG_B64);
    posData = [b64ToUint8(WAT1_B64), b64ToUint8(WAT2_B64), b64ToUint8(WAT3_B64)];

    // Max possible animation steps: scp goes to 390, then ~VIEW_W more to clear
    const maxSteps = SCP_MAX + VIEW_W + 64;
    const numCheckpoints = Math.ceil(maxSteps / CHECKPOINT_INTERVAL) + 1;
    checkpoints = new Array(numCheckpoints).fill(null);
    cachedFbuf = null;
    cachedScp = 0;
    cachedStep = null;

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
    const animSteps = Math.floor(frame / 3);

    const fbuf = ensureFbuf(animSteps);

    // Start with background
    const fb = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) fb[i] = tausta[i];

    // Apply all 3 POS passes (original applies one per frame, but since we
    // rebuild from scratch each render, applying all 3 gives the correct image)
    for (let pass = 0; pass < 3; pass++) {
      scr(pass, fbuf, fb);
    }

    // Palette fade-in over first 63 frames, fade-out over last 63 frames
    const activePal = new Uint8Array(768);
    // The sword is 400 columns, fully scrolls through 158-wide window, then
    // takes ~158 more steps to clear. Total ≈ 390 + 158 = 548 anim steps.
    // At 70fps/3 ≈ 23.3 steps/s, that's ~23.5s of scrolling.
    // Fade-out should begin near the end of scrolling.
    const fadeOutStartFrame = (SCP_MAX + VIEW_W) * 3 - 63;
    const fadeOutEndFrame = (SCP_MAX + VIEW_W) * 3;
    if (frame < 63) {
      const level = frame / 63;
      for (let i = 0; i < 768; i++) activePal[i] = Math.floor(pal[i] * level);
    } else if (frame > fadeOutStartFrame) {
      const level = clamp(1 - (frame - fadeOutStartFrame) / 63, 0, 1);
      for (let i = 0; i < 768; i++) activePal[i] = Math.floor(pal[i] * level);
    } else {
      for (let i = 0; i < 768; i++) activePal[i] = pal[i];
    }

    // Convert indexed framebuffer to RGBA
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < PIXELS; i++) {
      const ci = fb[i];
      const r = Math.round(clamp(activePal[ci * 3], 0, 63) * k);
      const g = Math.round(clamp(activePal[ci * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(activePal[ci * 3 + 2], 0, 63) * k);
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
    rgba = pal = font = tausta = posData = null;
    cachedFbuf = null; cachedStep = null; checkpoints = null;
  },
};

function scr(pass, fbuf, fb) {
  const pos = posData[pass];
  let posIdx = 0, fontIdx = 0;
  const totalPixels = VIEW_W * VIEW_H;
  for (let dx = 0; dx < totalPixels; dx++) {
    if (posIdx + 1 >= pos.length) break;
    const count = pos[posIdx] | (pos[posIdx + 1] << 8);
    posIdx += 2;
    if (count !== 0) {
      for (let i = 0; i < count; i++) {
        if (posIdx + 1 >= pos.length) break;
        const dest = pos[posIdx] | (pos[posIdx + 1] << 8);
        posIdx += 2;
        if (dest < PIXELS && fontIdx < fbuf.length) {
          let pv = fbuf[fontIdx];
          if (pv === 0) pv = tausta[dest];
          fb[dest] = pv;
        }
      }
    }
    fontIdx++;
  }
}
