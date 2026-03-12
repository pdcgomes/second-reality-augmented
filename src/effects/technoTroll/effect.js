/**
 * TECHNO_TROLL — Classic variant (Part 11)
 *
 * The "troll" (monster face) picture scrolls in from the right with
 * accelerating speed, bounces with dampening and a white flash, then
 * undergoes a classic CRT TV shutdown: vertical shrink, horizontal
 * line shrink, and a pulsing single pixel fade-out.
 *
 * The image is 320×400 (VGA double-scan). Displayed at 320×200 by
 * taking every other line. Palette flash uses 16 pre-computed faded
 * palettes mixed with an offset (+45 down to 0 in steps of 3).
 *
 * Original code: TECHNO/KOE.C (doit3 scroll) + PANIC/SHUTDOWN.C by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { TROLL_W, TROLL_H, TROLL_PAL_B64, TROLL_PIX_B64 } from './data.js';

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

const SEQ_SCROLL = 60;
const SEQ_BOUNCE = 50;
const SEQ_SHUTDOWN = 700;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

let program, quad, uFrameLoc, frameTex;
let fb, rgba;
let trollPix, trollPal;
let fadePals;
let sin1024;

export default {
  label: 'technoTroll',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');

    fb = new Uint8Array(PIXELS);
    rgba = new Uint8Array(PIXELS * 4);

    trollPal = b64ToUint8(TROLL_PAL_B64);
    trollPix = b64ToUint8(TROLL_PIX_B64);

    // Pre-compute 16 faded palettes (flash effect)
    fadePals = new Array(16);
    for (let y = 0; y < 16; y++) {
      const p = new Uint8Array(768);
      const offset = 45 - y * 3;
      for (let a = 0; a < 768; a++) {
        p[a] = Math.min(trollPal[a] + offset, 63);
      }
      fadePals[y] = p;
    }

    sin1024 = new Int32Array(1024);
    for (let i = 0; i < 1024; i++) sin1024[i] = Math.floor(Math.sin(2 * Math.PI * i / 1024) * 255);

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
    let activePal = trollPal;
    const k = 255 / 63;

    fb.fill(0);

    if (frame < SEQ_SCROLL) {
      // ── Phase 1: Scroll-in with accelerating speed ──
      let xpos = 0, xposa = 0;
      for (let f = 0; f <= frame; f++) {
        xpos += xposa / 4;
        if (xpos > 320) xpos = 320;
        else xposa++;
      }
      displayTroll(Math.floor(xpos));
      activePal = trollPal;

    } else if (frame < SEQ_SCROLL + SEQ_BOUNCE) {
      // ── Phase 2: Bounce + flash ──
      const bf = frame - SEQ_SCROLL;
      let ripple = 0, ripplep = 8;
      for (let f = 0; f <= bf; f++) {
        if (ripplep > 1023) ripplep = 1024;
        else ripplep = ripplep * (5 / 4);
        ripple += ripplep + 100;
      }
      const xpos = 320 + sin1024[Math.floor(ripple % 1024)] / ripplep;
      const fadeIdx = clamp(bf, 0, 15);
      activePal = fadePals[Math.floor(fadeIdx)];
      displayTroll(Math.floor(xpos));

    } else {
      // ── Phase 3: CRT Shutdown ──
      const sf = frame - SEQ_SCROLL - SEQ_BOUNCE;
      runShutdown(sf);
    }

    // Convert indexed framebuffer to RGBA
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
    fb = rgba = trollPix = trollPal = fadePals = sin1024 = null;
  },
};

// ── Display troll at horizontal scroll position ──

function displayTroll(scrollPos) {
  const xoff = 320 - scrollPos;
  for (let y = 0; y < H; y++) {
    const srcRow = (y * 2) * TROLL_W;
    const dstRow = y * W;
    for (let x = 0; x < W; x++) {
      if (x < xoff) fb[dstRow + x] = 0;
      else fb[dstRow + x] = trollPix[srcRow + (x - xoff)];
    }
  }
}

// ── CRT Shutdown sequence ──

function runShutdown(sf) {
  // Sequence timing (cumulative frames):
  // 0: full picture (1 frame)
  // 1: half-height + flash (1 frame)
  // 2: flash ends (1 frame)
  // 3+: shrink vertically until height <= 2
  // then: shrink horizontal line
  // then: pulsing single pixel

  const k = 255 / 63;

  if (sf === 0) {
    // Full picture at 320×200
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        fb[y * W + x] = trollPix[y * 2 * TROLL_W + x];
      }
    }
    return;
  }

  if (sf === 1) {
    // Half vertical size + white flash
    shrinkY(100);
    return;
  }

  if (sf === 2) {
    shrinkY(100);
    return;
  }

  // Vertical shrink: height reduces by factor (5/6) per frame
  let height = 32;
  let shrinkFrames = sf - 3;
  if (shrinkFrames >= 0) {
    height = 32 * Math.pow(5 / 6, shrinkFrames);
    if (height < 2) height = 2;
  }

  if (height > 2) {
    shrinkY(Math.floor(height));
    return;
  }

  // Horizontal line shrink
  const hStart = sf - 3 - Math.ceil(Math.log(32 / 2) / Math.log(6 / 5));
  let lineWidth = 280;
  if (hStart > 0) {
    lineWidth = 280 - 3 * hStart;
    if (lineWidth < 1) lineWidth = 1;
  }

  if (lineWidth > 1) {
    fb.fill(0);
    const row = 100 * W;
    const halfW = Math.floor(lineWidth / 2);
    for (let x = 160 - halfW; x <= 160 + halfW; x++) {
      if (x >= 0 && x < W) fb[row + x] = trollPix[200 * TROLL_W + x];
    }
    return;
  }

  // Single pixel pulse
  const pixelStart = hStart + Math.ceil(280 / 3);
  const extinct = sf - 3 - Math.ceil(Math.log(32 / 2) / Math.log(6 / 5)) - Math.ceil(280 / 3);
  fb.fill(0);
  if (extinct >= 0 && extinct < 60) {
    fb[100 * W + 160] = 1;
  }
}

function shrinkY(finalHeight) {
  const halfH = Math.floor(finalHeight / 2);
  const top = 100 - halfH;
  const bot = 100 + halfH;
  for (let y = 0; y < H; y++) {
    const dstRow = y * W;
    if (y < top || y >= bot) {
      for (let x = 0; x < W; x++) fb[dstRow + x] = 0;
    } else {
      const srcY = Math.floor((y - top) * TROLL_H / finalHeight);
      const clampedSrcY = Math.min(srcY, TROLL_H - 1);
      for (let x = 0; x < W; x++) {
        fb[dstRow + x] = trollPix[clampedSrcY * TROLL_W + x];
      }
    }
  }
}
