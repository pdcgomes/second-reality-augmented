/**
 * U2E — Classic variant (Part 22)
 *
 * "Vector Part II" — 3D city flyover using the U2 engine.
 * Multiple buildings, trees, tunnels rendered with flat & Gouraud
 * shading. Camera follows a pre-baked animation path.
 *
 * Runs at 35 fps (half VGA 70 Hz).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { createU2Engine } from './u2engine.js';
import {
  U2E_00M_base64, U2E_DataFiles, U2E_0AB_base64,
} from './data.js';

const W = 320, H = 200, PIXELS = W * H;
const FRAME_RATE = 35;

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

let program, quad, uFrameLoc, frameTex;
let rgba;
let engine;
let palette;
let stateCache;
let lastRenderedAnimFrame;

const TRANSITION_FRAMES_FADE_IN = 33;
const TRANSITION_FRAMES_WAIT = 16;
const TRANSITION_FRAMES_REVEAL = 32;
const ANIM_START_FRAME70 = TRANSITION_FRAMES_FADE_IN + TRANSITION_FRAMES_WAIT + TRANSITION_FRAMES_REVEAL;

export default {
  label: 'u2e',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    engine = createU2Engine();
    engine.setClippingY(25, 175);
    palette = engine.loadData(U2E_00M_base64, U2E_DataFiles, U2E_0AB_base64);

    stateCache = new Map();
    lastRenderedAnimFrame = -1;

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const frame70 = Math.floor(t * 70);
    const fb = new Uint8Array(PIXELS);
    const k = 255 / 63;
    let activePal = palette;
    let palMod = null;

    if (frame70 < TRANSITION_FRAMES_FADE_IN) {
      // Phase 1: Fade previous part to white (we just show white since we have no previous)
      fillWhite(fb);
    } else if (frame70 < TRANSITION_FRAMES_FADE_IN + TRANSITION_FRAMES_WAIT) {
      // Phase 2: Set up transition image (white with border zones)
      setupTransitionImage(fb);
      palMod = makeTransitionPal1();
    } else if (frame70 < ANIM_START_FRAME70) {
      // Phase 3: Fade transition colors
      const lev = (frame70 - (TRANSITION_FRAMES_FADE_IN + TRANSITION_FRAMES_WAIT)) / TRANSITION_FRAMES_REVEAL;
      setupTransitionImage(fb);
      palMod = makeTransitionPal2(lev);
    } else {
      // Phase 4: 3D animation
      const animFrame = Math.floor((frame70 - ANIM_START_FRAME70) / 2);

      replayToFrame(animFrame);

      for (let y = 25; y < 175; y++)
        for (let x = 0; x < W; x++)
          fb[y * W + x] = 0;

      if (!engine.isAnimationEnd()) {
        engine.renderFrame(fb, animFrame);
      }

      lastRenderedAnimFrame = animFrame;
    }

    // Convert indexed to RGBA
    const pal = palMod || palette;
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
    rgba = palette = engine = stateCache = null;
  },
};

function fillWhite(fb) {
  fb.fill(253);
}

function setupTransitionImage(fb) {
  const left = 68, right = 253;
  for (let y = 0; y < 25; y++) {
    for (let x = 0; x < left; x++) fb[y * W + x] = 0;
    for (let x = left; x < right; x++) fb[y * W + x] = 252;
    for (let x = right; x < W; x++) fb[y * W + x] = 0;
  }
  for (let y = 25; y < 175; y++) {
    for (let x = 0; x < left; x++) fb[y * W + x] = 254;
    for (let x = left; x < right; x++) fb[y * W + x] = 253;
    for (let x = right; x < W; x++) fb[y * W + x] = 254;
  }
  for (let y = 175; y < H; y++) {
    for (let x = 0; x < left; x++) fb[y * W + x] = 0;
    for (let x = left; x < right; x++) fb[y * W + x] = 252;
    for (let x = right; x < W; x++) fb[y * W + x] = 0;
  }
}

function makeTransitionPal1() {
  const p = new Uint8Array(768);
  p[252 * 3] = p[252 * 3 + 1] = p[252 * 3 + 2] = 63;
  p[253 * 3] = p[253 * 3 + 1] = p[253 * 3 + 2] = 63;
  return p;
}

function makeTransitionPal2(lev) {
  const p = new Uint8Array(768);
  const v252 = clamp(Math.floor(63 - lev * 63), 0, 63);
  const v254 = clamp(Math.floor(lev * 63), 0, 63);
  p[252 * 3] = p[252 * 3 + 1] = p[252 * 3 + 2] = v252;
  p[253 * 3] = p[253 * 3 + 1] = p[253 * 3 + 2] = 63;
  p[254 * 3] = p[254 * 3 + 1] = p[254 * 3 + 2] = v254;
  return p;
}

function replayToFrame(targetFrame) {
  if (targetFrame === lastRenderedAnimFrame) return;

  let startFrame = -1;
  let bestCached = -1;
  for (const [f] of stateCache) {
    if (f <= targetFrame && f > bestCached) bestCached = f;
  }

  if (bestCached >= 0 && bestCached <= targetFrame) {
    engine.restoreState(stateCache.get(bestCached));
    startFrame = bestCached;
  } else {
    engine.reset();
    palette = engine.loadData(U2E_00M_base64, U2E_DataFiles, U2E_0AB_base64);
    engine.setClippingY(25, 175);
    startFrame = -1;
  }

  for (let f = startFrame + 1; f <= targetFrame; f++) {
    if (engine.isAnimationEnd()) break;
    engine.stepOneAnimationFrame();
  }

  if (targetFrame % 100 === 0 && !stateCache.has(targetFrame)) {
    stateCache.set(targetFrame, engine.saveState());
    if (stateCache.size > 50) {
      const oldest = stateCache.keys().next().value;
      stateCache.delete(oldest);
    }
  }
}
