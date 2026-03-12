/**
 * FOREST — Classic variant (Part 12)
 *
 * "Vuori-Scrolli" (Mountain Scroller) by TRUG. Text reading
 * "ANOTHER WAY TO SCROLL" is mapped onto a mountain/hill landscape
 * using pre-computed position lookup tables. The text scrolls through
 * a 237×30 sliding window over a 640×30 source image. Three
 * interlaced update passes (POS1/POS2/POS3) distribute the work
 * across frames. Palette fades in from black (green leaves first,
 * then full background), and fades out at the end.
 *
 * Original code: FOREST/MAIN2.PAS + ROUTINES.ASM by TRUG.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  FONT_W, FONT_H, BG_W, BG_H,
  FONT_B64, PAL_B64, HBACK_B64,
  POS1_B64, POS2_B64, POS3_B64,
} from './data.js';

const W = BG_W, H = BG_H, PIXELS = W * H;
const FRAME_RATE = 70;
const FONT_VIEW_W = 237;
const FONT_VIEW_H = 30;
const INITIAL_SCP = 133;

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
let rgba;
let fbuf, pal, fpal, hback, posData;

export default {
  label: 'forest',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);

    fbuf = b64ToUint8(FONT_B64);
    pal = b64ToUint8(PAL_B64);
    hback = b64ToUint8(HBACK_B64);
    posData = [b64ToUint8(POS1_B64), b64ToUint8(POS2_B64), b64ToUint8(POS3_B64)];

    // Build fpal: palette with only green leaves (entries 0-31 and 128-159 zeroed)
    fpal = new Uint8Array(pal);
    for (let i = 0; i < 32 * 3; i++) fpal[i] = 0;
    for (let i = 128 * 3; i < 160 * 3; i++) fpal[i] = 0;

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

    // Reconstruct font sliding window and framebuffer for this frame.
    // The scroller advances once every 3 frames (after all 3 POS passes).
    const scrollSteps = Math.floor(frame / 3);

    // Build font sliding window
    const font = new Uint8Array(FONT_VIEW_W * FONT_VIEW_H);
    let scp = INITIAL_SCP + scrollSteps;
    if (scp > FONT_W - 1) scp = FONT_W - 1;

    // Fill the font window: columns 0..(viewW-1) from the source
    // The window shows columns (scp - FONT_VIEW_W + 1) .. scp of the source
    const srcStart = scp - FONT_VIEW_W + 1;
    for (let row = 0; row < FONT_VIEW_H; row++) {
      for (let col = 0; col < FONT_VIEW_W; col++) {
        const srcCol = srcStart + col;
        if (srcCol >= 0 && srcCol < FONT_W) {
          font[row * FONT_VIEW_W + col] = fbuf[row * FONT_W + srcCol];
        }
      }
    }

    // Start with background
    const fb = new Uint8Array(PIXELS);
    for (let i = 0; i < PIXELS; i++) fb[i] = hback[i];

    // Apply all 3 POS passes to composite text onto background
    for (let pass = 0; pass < 3; pass++) {
      scr(pass, font, fb);
    }

    // Palette animation:
    // - First ~63 frames: fade in green leaves (fpal) from black
    // - Next ~128 frames: cross-fade from fpal to full pal
    // - Last ~63 frames: fade out to black
    const totalFrames = Math.floor(28.9 * FRAME_RATE);
    const fadeInLeaves = 63;
    const fadeInFull = 128;
    const fadeOutStart = totalFrames - 63;

    const activePal = new Uint8Array(768);

    if (frame < fadeInLeaves) {
      // Fade in green leaves from black
      const level = frame / 63;
      for (let i = 0; i < 768; i++) {
        activePal[i] = Math.floor(fpal[i] * level);
      }
    } else if (frame < fadeInLeaves + fadeInFull) {
      // Cross-fade from fpal to full pal
      const level = clamp((frame - fadeInLeaves) / fadeInFull, 0, 1);
      const inc = Math.floor(level * 63);
      for (let i = 0; i < 768; i++) {
        activePal[i] = clamp(inc, fpal[i], pal[i]);
      }
    } else if (frame >= fadeOutStart) {
      // Fade out to black
      const level = clamp(1 - (frame - fadeOutStart) / 63, 0, 1);
      for (let i = 0; i < 768; i++) {
        activePal[i] = Math.floor(pal[i] * level);
      }
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
    rgba = fbuf = pal = fpal = hback = posData = null;
  },
};

// Apply one POS pass: map font pixels to screen positions
function scr(pass, font, fb) {
  const pos = posData[pass];
  let posIdx = 0;
  let fontIdx = 0;
  const totalPixels = FONT_VIEW_W * (FONT_VIEW_H + 1);

  for (let dx = 0; dx < totalPixels; dx++) {
    if (posIdx + 1 >= pos.length) break;
    const count = pos[posIdx] | (pos[posIdx + 1] << 8);
    posIdx += 2;
    if (count !== 0) {
      for (let i = 0; i < count; i++) {
        if (posIdx + 1 >= pos.length) break;
        const dest = pos[posIdx] | (pos[posIdx + 1] << 8);
        posIdx += 2;
        if (dest < PIXELS && fontIdx < font.length) {
          const bgPix = hback[dest];
          const fontPix = font[fontIdx];
          fb[dest] = bgPix + fontPix;
        }
      }
    }
    fontIdx++;
  }
}
