/**
 * ALKU — Classic variant (Part 1)
 *
 * Opening credits sequence: text fades in/out over a black background
 * for the first ~20 seconds, then a pre-rendered landscape image fades
 * in and scrolls horizontally while more credits appear.
 *
 * The "landscape" is NOT 3D terrain — it's a pre-rendered 640×200 image
 * that scrolls rightward at ~7.8 px/sec (at 70 Hz). Text uses a
 * variable-width anti-aliased bitmap font with 4 transparency levels,
 * originally blended via VGA palette manipulation.
 *
 * Original source: ALKU/ folder in SecondReality repo (code by WILDFIRE).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  LANDSCAPE_W,
  LANDSCAPE_H,
  FONT_W,
  FONT_H,
  FONT_ORDER,
  LANDSCAPE_PAL,
  FONT_B64,
  LANDSCAPE_B64,
} from './data.js';

// ── Constants matching the original ──────────────────────────────────

const FRAME_RATE = 70; // original VGA refresh rate
const BG_SCROLL_SPEED = 7.8 / FRAME_RATE; // px/frame at 70 Hz
const BG_FADEIN_FRAMES = 128;
const TEXT_FADE_FRAMES = 64;
const TEXT_HOLD_FRAMES_BLACK = 300 + TEXT_FADE_FRAMES; // text over black
const TEXT_HOLD_FRAMES_SCROLL = 200 + TEXT_FADE_FRAMES; // text over landscape

// Display geometry: original is 320×400 with landscape at lines 50–449
// (200 source lines doubled). We render to 320×256 so we scale accordingly.
const DISPLAY_W = 320;
const DISPLAY_H = 256;

// ── Text screens ─────────────────────────────────────────────────────

const TEXT_SCREENS = [
  // seq 1: over black
  { lines: [{ y: 120, text: 'A' }, { y: 160, text: 'Future Crew' }, { y: 200, text: 'Production' }] },
  // seq 2: over black
  { lines: [{ y: 160, text: 'First Presented' }, { y: 200, text: 'at Assembly 93' }] },
  // seq 3: over black (Dolby logo placeholder — '[' and ']' in original font)
  { lines: [{ y: 120, text: 'in' }, { y: 160, text: '[' }, { y: 179, text: ']' }] },
  // seq 5: over landscape
  { lines: [{ y: 150, text: 'Graphics' }, { y: 190, text: 'Marvel' }, { y: 230, text: 'Pixel' }] },
  // seq 6: over landscape
  { lines: [{ y: 150, text: 'Music' }, { y: 190, text: 'Purple Motion' }, { y: 230, text: 'Skaven' }] },
  // seq 7: over landscape
  { lines: [{ y: 130, text: 'Code' }, { y: 170, text: 'Psi' }, { y: 210, text: 'Trug' }, { y: 248, text: 'Wildfire' }] },
  // seq 8: over landscape
  { lines: [{ y: 150, text: 'Additional Design' }, { y: 190, text: 'Abyss' }, { y: 230, text: 'Gore' }] },
];

// ── Sequence timing (in seconds) ─────────────────────────────────────
// These approximate the original music sync points.
// The original uses dis_sync() calls tied to the S3M tracker position.
// Times below are calibrated against the JS port / demo playback.

const SEQ_TIMES = [
  0.0,   // seq 0: black wait
  1.5,   // seq 1: "A / Future Crew / Production"
  8.5,   // seq 2: "First Presented / at Assembly 93"
  15.5,  // seq 3: "in / [Dolby logo]"
  22.0,  // seq 4: landscape fade-in (no text)
  30.0,  // seq 5: "Graphics / Marvel / Pixel"
  38.0,  // seq 6: "Music / Purple Motion / Skaven"
  46.0,  // seq 7: "Code / Psi / Trug / Wildfire"
  54.0,  // seq 8: "Additional Design / Abyss / Gore"
  62.0,  // end
];

// ── Fragment shader ──────────────────────────────────────────────────

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

uniform sampler2D uLandscape;
uniform sampler2D uText;
uniform float uScrollOffset;   // 0..1 normalized scroll through the 640px image
uniform float uBgFade;         // 0..1 landscape brightness
uniform float uTextFade;       // 0..1 text opacity
uniform int uShowLandscape;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;

  vec3 color = vec3(0.0);

  if (uShowLandscape > 0) {
    // The landscape image is 640×200.
    // We show a 320-px-wide viewport that slides rightward.
    // Vertically, it occupies roughly the middle 78% of the screen
    // (original: lines 50–449 of a 400-line display ≈ top 12.5% is sky).
    float skyFraction = 50.0 / 400.0;
    float landscapeTop = skyFraction;

    if (uv.y >= landscapeTop) {
      float landscapeUVy = (uv.y - landscapeTop) / (1.0 - landscapeTop);
      float landscapeUVx = uv.x * 0.5 + uScrollOffset;
      vec4 sample_ = texture(uLandscape, vec2(landscapeUVx, landscapeUVy));
      // Index 0 in the original is transparent/black
      color = sample_.rgb;
    }

    color *= uBgFade;
  }

  // Text overlay with anti-aliased alpha
  vec4 textSample = texture(uText, uv);
  color = mix(color, textSample.rgb, textSample.a * uTextFade);

  // Subtle beat reactivity: slight brightness pulse
  float beatPulse = pow(1.0 - uBeat, 8.0) * 0.08;
  color += color * beatPulse;

  fragColor = vec4(color, 1.0);
}
`;

// ── Module state ─────────────────────────────────────────────────────

let program = null;
let quad = null;
let uTime, uBeat, uResolution;
let uLandscape, uText, uScrollOffset, uBgFade, uTextFade, uShowLandscape;

let landscapeTex = null;
let textTextures = []; // one per TEXT_SCREENS entry
let emptyTextTex = null;

let fontChars = null; // parsed font character map

// ── Helpers ──────────────────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function createBlackTexture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  return tex;
}

function uploadTexture(gl, tex, width, height, rgba) {
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

/** Decode the 640×200 indexed landscape image using the VGA palette. */
function decodeLandscape() {
  const indexed = b64ToUint8(LANDSCAPE_B64);
  const rgba = new Uint8Array(LANDSCAPE_W * LANDSCAPE_H * 4);
  for (let i = 0; i < LANDSCAPE_W * LANDSCAPE_H; i++) {
    const idx = indexed[i];
    const pi = (idx & 63) * 3; // palette uses only first 64 entries for landscape
    if (idx === 0) {
      // Index 0 is transparent (black)
      rgba[i * 4 + 3] = 0;
    } else {
      rgba[i * 4 + 0] = Math.min(255, LANDSCAPE_PAL[pi + 0] * 4);
      rgba[i * 4 + 1] = Math.min(255, LANDSCAPE_PAL[pi + 1] * 4);
      rgba[i * 4 + 2] = Math.min(255, LANDSCAPE_PAL[pi + 2] * 4);
      rgba[i * 4 + 3] = 255;
    }
  }
  return rgba;
}

/** Parse the variable-width bitmap font, returning character metrics. */
function parseFont() {
  const raw = b64ToUint8(FONT_B64);
  const chars = {};

  function isColumnBlank(x) {
    for (let y = 0; y < FONT_H; y++) {
      if (raw[x + y * FONT_W] !== 0) return false;
    }
    return true;
  }

  let charIdx = 0;
  let x = 0;
  while (x < FONT_W && charIdx < FONT_ORDER.length) {
    // Find start of character (first non-blank column)
    while (x < FONT_W && isColumnBlank(x)) x++;
    if (x >= FONT_W) break;
    const startX = x;
    // Find end of character (first blank column after start)
    while (x < FONT_W && !isColumnBlank(x)) x++;
    const charCode = FONT_ORDER.charCodeAt(charIdx);
    chars[charCode] = { x: startX, w: x - startX };
    charIdx++;
  }

  // Space character
  chars[32] = { x: FONT_W - 20, w: 16 };

  return { chars, raw };
}

/** Render a text screen (array of {y, text} lines) to an RGBA buffer. */
function renderTextScreen(screen, font) {
  const rgba = new Uint8Array(DISPLAY_W * DISPLAY_H * 4);
  // Scale Y positions from original 400-line space to our 256-line space
  const yScale = DISPLAY_H / 400;

  for (const line of screen.lines) {
    // Calculate string pixel width
    let totalW = 0;
    for (let i = 0; i < line.text.length; i++) {
      const ch = font.chars[line.text.charCodeAt(i)];
      if (ch) totalW += ch.w + 2;
    }

    // Center horizontally around x=160 (half of 320)
    let cx = Math.floor(160 - totalW / 2);
    const cy = Math.floor(line.y * yScale);

    // Handle special Dolby logo height
    const isDolbyUpper = line.text === '[';
    const charHeight = isDolbyUpper ? 19 : FONT_H;
    const scaledCharH = Math.floor(charHeight * yScale);

    for (let i = 0; i < line.text.length; i++) {
      const ch = font.chars[line.text.charCodeAt(i)];
      if (!ch) { cx += 18; continue; }

      const scaledW = Math.max(1, Math.floor(ch.w * (DISPLAY_W / 320)));
      const renderH = Math.min(scaledCharH, Math.floor(FONT_H * yScale));

      for (let fy = 0; fy < renderH; fy++) {
        const srcY = Math.floor(fy / yScale);
        if (srcY >= FONT_H) break;
        for (let fx = 0; fx < scaledW; fx++) {
          const srcX = Math.floor(fx * ch.w / scaledW);
          const fontVal = font.raw[ch.x + srcX + srcY * FONT_W];
          if (fontVal === 0) continue;

          const px = cx + fx;
          const py = cy + fy;
          if (px < 0 || px >= DISPLAY_W || py < 0 || py >= DISPLAY_H) continue;

          // Font values 1-3 map to anti-aliasing levels
          const alpha = fontVal === 1 ? 85 : fontVal === 2 ? 170 : 255;
          const oi = (py * DISPLAY_W + px) * 4;
          // White/light-gray text like the original
          const existing = rgba[oi + 3];
          if (alpha > existing) {
            rgba[oi + 0] = 255;
            rgba[oi + 1] = 255;
            rgba[oi + 2] = 255;
            rgba[oi + 3] = alpha;
          }
        }
      }
      cx += Math.floor((ch.w + 2) * (DISPLAY_W / 320));
    }
  }
  return rgba;
}

// ── Sequence logic ───────────────────────────────────────────────────

function getSequence(t) {
  for (let i = SEQ_TIMES.length - 1; i >= 0; i--) {
    if (t >= SEQ_TIMES[i]) return i;
  }
  return 0;
}

function computeState(t) {
  const seq = getSequence(t);
  const seqStart = SEQ_TIMES[seq];
  const seqT = t - seqStart;
  const seqFrames = seqT * FRAME_RATE;

  let showLandscape = false;
  let bgFade = 0;
  let textFade = 0;
  let textIndex = -1;
  let scrollOffset = 0;

  // Landscape scroll state (persists from seq 4 onward)
  if (seq >= 4) {
    showLandscape = true;
    const scrollStart = SEQ_TIMES[4];
    const scrollT = t - scrollStart;
    const scrollFrames = scrollT * FRAME_RATE;
    const scrollPixels = Math.min(scrollFrames * BG_SCROLL_SPEED, 320);
    scrollOffset = scrollPixels / 640; // normalized 0..0.5

    // Background fade-in during seq 4
    if (seq === 4) {
      bgFade = Math.min(seqFrames / BG_FADEIN_FRAMES, 1);
    } else {
      bgFade = 1;
    }
  }

  // Text handling per sequence
  if (seq >= 1 && seq <= 3) {
    // Text over black background
    textIndex = seq - 1; // screens 0, 1, 2
    const holdFrames = TEXT_HOLD_FRAMES_BLACK;
    if (seqFrames < TEXT_FADE_FRAMES) {
      textFade = seqFrames / TEXT_FADE_FRAMES;
    } else if (seqFrames < holdFrames) {
      textFade = 1;
    } else if (seqFrames < holdFrames + TEXT_FADE_FRAMES) {
      textFade = 1 - (seqFrames - holdFrames) / TEXT_FADE_FRAMES;
    } else {
      textFade = 0;
    }
  } else if (seq >= 5 && seq <= 8) {
    // Text over landscape
    textIndex = seq - 5 + 3; // screens 3, 4, 5, 6
    const holdFrames = TEXT_HOLD_FRAMES_SCROLL;
    if (seqFrames < TEXT_FADE_FRAMES) {
      textFade = seqFrames / TEXT_FADE_FRAMES;
    } else if (seqFrames < holdFrames) {
      textFade = 1;
    } else if (seqFrames < holdFrames + TEXT_FADE_FRAMES) {
      textFade = 1 - (seqFrames - holdFrames) / TEXT_FADE_FRAMES;
    } else {
      textFade = 0;
    }
  }

  return {
    showLandscape,
    bgFade: Math.max(0, Math.min(1, bgFade)),
    textFade: Math.max(0, Math.min(1, textFade)),
    textIndex,
    scrollOffset,
  };
}

// ── Effect interface ─────────────────────────────────────────────────

export default {
  label: 'alku',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);

    uTime = gl.getUniformLocation(program, 'uTime');
    uBeat = gl.getUniformLocation(program, 'uBeat');
    uResolution = gl.getUniformLocation(program, 'uResolution');
    uLandscape = gl.getUniformLocation(program, 'uLandscape');
    uText = gl.getUniformLocation(program, 'uText');
    uScrollOffset = gl.getUniformLocation(program, 'uScrollOffset');
    uBgFade = gl.getUniformLocation(program, 'uBgFade');
    uTextFade = gl.getUniformLocation(program, 'uTextFade');
    uShowLandscape = gl.getUniformLocation(program, 'uShowLandscape');

    // Decode landscape and upload as texture
    landscapeTex = gl.createTexture();
    const landscapeRGBA = decodeLandscape();
    uploadTexture(gl, landscapeTex, LANDSCAPE_W, LANDSCAPE_H, landscapeRGBA);

    // Empty text texture (transparent)
    emptyTextTex = createBlackTexture(gl);

    // Parse font and pre-render all text screens
    const font = parseFont();
    fontChars = font.chars;
    textTextures = TEXT_SCREENS.map((screen) => {
      const tex = gl.createTexture();
      const rgba = renderTextScreen(screen, font);
      uploadTexture(gl, tex, DISPLAY_W, DISPLAY_H, rgba);
      return tex;
    });
  },

  render(gl, t, beat, _params) {
    const state = computeState(t);

    gl.useProgram(program);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uBeat, beat);
    gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniform1f(uScrollOffset, state.scrollOffset);
    gl.uniform1f(uBgFade, state.bgFade);
    gl.uniform1f(uTextFade, state.textFade);
    gl.uniform1i(uShowLandscape, state.showLandscape ? 1 : 0);

    // Bind landscape texture to unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, landscapeTex);
    gl.uniform1i(uLandscape, 0);

    // Bind current text screen to unit 1
    gl.activeTexture(gl.TEXTURE1);
    const textTex = state.textIndex >= 0 ? textTextures[state.textIndex] : emptyTextTex;
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(uText, 1);

    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    if (landscapeTex) gl.deleteTexture(landscapeTex);
    if (emptyTextTex) gl.deleteTexture(emptyTextTex);
    for (const tex of textTextures) gl.deleteTexture(tex);
    program = null;
    quad = null;
    landscapeTex = null;
    emptyTextTex = null;
    textTextures = [];
    fontChars = null;
  },
};
