/**
 * ALKU — Remastered variant (Part 1)
 *
 * Nearly identical to the classic opening credits sequence. The original
 * texture, timing, text fade, and landscape scroll are preserved with
 * NEAREST-neighbor filtering so the pixel character is unchanged.
 *
 * Two subtle atmospheric effects (borrowed from the PAM remaster) layer on
 * top without altering the source material:
 *
 *   1. Purple horizon glow — soft pulsing band near the sky/landscape boundary
 *
 * Defaults to very low intensity so casual viewers see "the same intro."
 * A dual-tier bloom pass softly diffuses bright edges for an organic feel.
 * All enhancement parameters are exposed for editor control.
 *
 * Original source: ALKU/ folder in SecondReality repo (code by WILDFIRE).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
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

const FRAME_RATE = 70;
const BG_SCROLL_SPEED = 7.8 / FRAME_RATE;
const BG_FADEIN_FRAMES = 128;
const TEXT_FADE_FRAMES = 64;
const TEXT_HOLD_FRAMES_BLACK = 300 + TEXT_FADE_FRAMES;
const TEXT_HOLD_FRAMES_SCROLL = 200 + TEXT_FADE_FRAMES;

const DISPLAY_W = 320;
const DISPLAY_H = 256;

// ── Text screens ─────────────────────────────────────────────────────

const TEXT_SCREENS = [
  { lines: [{ y: 120, text: 'A' }, { y: 160, text: 'Future Crew' }, { y: 200, text: 'Production' }] },
  { lines: [{ y: 160, text: 'First Presented' }, { y: 200, text: 'at Assembly 93' }] },
  { lines: [{ y: 120, text: 'in' }, { y: 160, text: '[' }, { y: 179, text: ']' }] },
  { lines: [{ y: 150, text: 'Graphics' }, { y: 190, text: 'Marvel' }, { y: 230, text: 'Pixel' }] },
  { lines: [{ y: 150, text: 'Music' }, { y: 190, text: 'Purple Motion' }, { y: 230, text: 'Skaven' }] },
  { lines: [{ y: 130, text: 'Code' }, { y: 170, text: 'Psi' }, { y: 210, text: 'Trug' }, { y: 248, text: 'Wildfire' }] },
  { lines: [{ y: 150, text: 'Additional Design' }, { y: 190, text: 'Abyss' }, { y: 230, text: 'Gore' }] },
];

// ── Sequence timing (in seconds) ─────────────────────────────────────

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

// ── Scene fragment shader ────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

uniform sampler2D uLandscape;
uniform sampler2D uText;
uniform float uScrollOffset;
uniform float uBgFade;
uniform float uTextFade;
uniform int uShowLandscape;

uniform float uHorizonGlow;
uniform float uHorizonPulseSpeed;
uniform float uGlowY;
uniform float uGlowHeight;

uniform float uBeatReactivity;

vec3 horizonGlow(vec2 uv, float t) {
  if (uHorizonGlow <= 0.0) return vec3(0.0);

  float dist = abs(uv.y - uGlowY);
  float band = smoothstep(uGlowHeight, 0.0, dist);

  float pulse = sin(t * uHorizonPulseSpeed) * 0.5 + 0.5;
  float beatMod = pow(1.0 - uBeat, 6.0) * uBeatReactivity * 0.3;
  pulse = pulse * 0.7 + beatMod;

  vec3 glowColor = vec3(0.3, 0.05, 0.4);
  return glowColor * band * pulse * uHorizonGlow;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;

  vec3 color = vec3(0.0);

  if (uShowLandscape > 0) {
    float skyFraction = 50.0 / 400.0;
    if (uv.y >= skyFraction) {
      float landscapeUVy = (uv.y - skyFraction) / (1.0 - skyFraction);
      float landscapeUVx = uv.x * 0.5 + uScrollOffset;
      color = texture(uLandscape, vec2(landscapeUVx, landscapeUVy)).rgb;
    }
    color *= uBgFade;

    color += horizonGlow(uv, uTime) * uBgFade;
  }

  // Text overlay with anti-aliased alpha
  vec4 textSample = texture(uText, uv);
  color = mix(color, textSample.rgb, textSample.a * uTextFade);

  // Beat reactivity
  float beatPulse = pow(1.0 - uBeat, 8.0) * uBeatReactivity;
  color += color * beatPulse;

  fragColor = vec4(color, 1.0);
}
`;

// ── Bloom shaders (shared pattern with PAM remaster) ─────────────────

const BLOOM_EXTRACT_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = vec4(c * smoothstep(uThreshold, uThreshold + 0.3, brightness), 1.0);
}
`;

const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDirection;
uniform vec2 uResolution;
void main() {
  vec2 texel = uDirection / uResolution;
  vec3 result = vec3(0.0);
  result += texture(uTex, vUV - 4.0 * texel).rgb * 0.0162;
  result += texture(uTex, vUV - 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV - 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV - 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV).rgb * 0.2270;
  result += texture(uTex, vUV + 1.0 * texel).rgb * 0.1945;
  result += texture(uTex, vUV + 2.0 * texel).rgb * 0.1216;
  result += texture(uTex, vUV + 3.0 * texel).rgb * 0.0540;
  result += texture(uTex, vUV + 4.0 * texel).rgb * 0.0162;
  fragColor = vec4(result, 1.0);
}
`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloomTight;
uniform sampler2D uBloomWide;
uniform float uBloomStr;
uniform float uBeat;
uniform float uBeatReactivity;
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.15)
    + wide  * (uBloomStr * 0.5 + beatPulse * 0.1);
  fragColor = vec4(color, 1.0);
}
`;

// ── FBO helpers ──────────────────────────────────────────────────────

function createFBO(gl, w, h) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex };
}

function deleteFBO(gl, fbo) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  if (fbo.tex) gl.deleteTexture(fbo.tex);
}

// ── Helpers (shared with classic) ────────────────────────────────────

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

function decodeLandscape() {
  const indexed = b64ToUint8(LANDSCAPE_B64);
  const rgba = new Uint8Array(LANDSCAPE_W * LANDSCAPE_H * 4);
  for (let i = 0; i < LANDSCAPE_W * LANDSCAPE_H; i++) {
    const idx = indexed[i];
    const pi = (idx & 63) * 3;
    if (idx === 0) {
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
    while (x < FONT_W && isColumnBlank(x)) x++;
    if (x >= FONT_W) break;
    const startX = x;
    while (x < FONT_W && !isColumnBlank(x)) x++;
    const charCode = FONT_ORDER.charCodeAt(charIdx);
    chars[charCode] = { x: startX, w: x - startX };
    charIdx++;
  }

  chars[32] = { x: FONT_W - 20, w: 16 };
  return { chars, raw };
}

function renderTextScreen(screen, font) {
  const SRC_H = 400;
  const src = new Uint8Array(DISPLAY_W * SRC_H * 4);

  for (const line of screen.lines) {
    let totalW = 0;
    for (let i = 0; i < line.text.length; i++) {
      const ch = font.chars[line.text.charCodeAt(i)];
      if (ch) totalW += ch.w + 2;
    }

    let cx = Math.floor(160 - totalW / 2);
    const cy = line.y;

    const isDolbyUpper = line.text === '[';
    const charHeight = isDolbyUpper ? 19 : FONT_H;

    for (let i = 0; i < line.text.length; i++) {
      const ch = font.chars[line.text.charCodeAt(i)];
      if (!ch) { cx += 18; continue; }

      for (let fy = 0; fy < charHeight; fy++) {
        if (fy >= FONT_H) break;
        for (let fx = 0; fx < ch.w; fx++) {
          const fontVal = font.raw[ch.x + fx + fy * FONT_W];
          if (fontVal === 0) continue;

          const px = cx + fx;
          const py = cy + fy;
          if (px < 0 || px >= DISPLAY_W || py < 0 || py >= SRC_H) continue;

          const alpha = fontVal === 1 ? 85 : fontVal === 2 ? 170 : 255;
          const oi = (py * DISPLAY_W + px) * 4;
          const existing = src[oi + 3];
          if (alpha > existing) {
            src[oi]     = 255;
            src[oi + 1] = 255;
            src[oi + 2] = 255;
            src[oi + 3] = alpha;
          }
        }
      }
      cx += ch.w + 2;
    }
  }

  const rgba = new Uint8Array(DISPLAY_W * DISPLAY_H * 4);
  const ratio = SRC_H / DISPLAY_H;

  for (let dy = 0; dy < DISPLAY_H; dy++) {
    const srcY0 = dy * ratio;
    const srcY1 = (dy + 1) * ratio;
    const y0 = Math.floor(srcY0);
    const y1 = Math.min(Math.ceil(srcY1), SRC_H);

    for (let dx = 0; dx < DISPLAY_W; dx++) {
      let a = 0, weight = 0;

      for (let sy = y0; sy < y1; sy++) {
        let w = 1;
        if (sy < srcY0) w -= srcY0 - sy;
        if (sy + 1 > srcY1) w -= (sy + 1 - srcY1);

        const si = (sy * DISPLAY_W + dx) * 4;
        a += src[si + 3] * w;
        weight += w;
      }

      if (a > 0) {
        const di = (dy * DISPLAY_W + dx) * 4;
        rgba[di]     = 255;
        rgba[di + 1] = 255;
        rgba[di + 2] = 255;
        rgba[di + 3] = Math.round(a / weight);
      }
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

  if (seq >= 4) {
    showLandscape = true;
    const scrollStart = SEQ_TIMES[4];
    const scrollT = t - scrollStart;
    const scrollFrames = scrollT * FRAME_RATE;
    const scrollPixels = Math.min(scrollFrames * BG_SCROLL_SPEED, 320);
    scrollOffset = scrollPixels / 640;

    if (seq === 4) {
      bgFade = Math.min(seqFrames / BG_FADEIN_FRAMES, 1);
    } else {
      bgFade = 1;
    }
  }

  if (seq >= 1 && seq <= 3) {
    textIndex = seq - 1;
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
    textIndex = seq - 5 + 3;
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

// ── Module state ─────────────────────────────────────────────────────

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let landscapeTex = null;
let textTextures = [];
let emptyTextTex = null;
let fontChars = null;

let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let su = {}, beu = {}, blu = {}, cu = {};

// ── Effect interface ─────────────────────────────────────────────────

export default {
  label: 'alku (remastered)',

  params: [
    gp('Atmosphere', { key: 'horizonGlow',       label: 'Horizon Glow',       type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.08 }),
    gp('Atmosphere', { key: 'horizonPulseSpeed',  label: 'Horizon Pulse Speed',type: 'float', min: 0.2, max: 5,   step: 0.1,  default: 1.2 }),
    gp('Atmosphere', { key: 'glowY',              label: 'Glow Y Position',    type: 'float', min: 0.1, max: 0.9, step: 0.01, default: 0.62 }),
    gp('Atmosphere', { key: 'glowHeight',         label: 'Glow Spread',        type: 'float', min: 0.01,max: 0.4, step: 0.01, default: 0.12 }),
    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.4 }),
    gp('Post-Processing', { key: 'bloomStrength',  label: 'Bloom Strength',  type: 'float', min: 0,   max: 2,   step: 0.01, default: 0.15 }),
    gp('Post-Processing', { key: 'beatReactivity', label: 'Beat Reactivity', type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.12 }),
  ],

  init(gl) {
    sceneProg = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    landscapeTex = gl.createTexture();
    const landscapeRGBA = decodeLandscape();
    uploadTexture(gl, landscapeTex, LANDSCAPE_W, LANDSCAPE_H, landscapeRGBA);

    emptyTextTex = createBlackTexture(gl);

    const font = parseFont();
    fontChars = font.chars;
    textTextures = TEXT_SCREENS.map((screen) => {
      const tex = gl.createTexture();
      const rgba = renderTextScreen(screen, font);
      uploadTexture(gl, tex, DISPLAY_W, DISPLAY_H, rgba);
      return tex;
    });

    su = {
      time:             gl.getUniformLocation(sceneProg, 'uTime'),
      beat:             gl.getUniformLocation(sceneProg, 'uBeat'),
      resolution:       gl.getUniformLocation(sceneProg, 'uResolution'),
      landscape:        gl.getUniformLocation(sceneProg, 'uLandscape'),
      text:             gl.getUniformLocation(sceneProg, 'uText'),
      scrollOffset:     gl.getUniformLocation(sceneProg, 'uScrollOffset'),
      bgFade:           gl.getUniformLocation(sceneProg, 'uBgFade'),
      textFade:         gl.getUniformLocation(sceneProg, 'uTextFade'),
      showLandscape:    gl.getUniformLocation(sceneProg, 'uShowLandscape'),
      horizonGlow:      gl.getUniformLocation(sceneProg, 'uHorizonGlow'),
      horizonPulseSpeed:gl.getUniformLocation(sceneProg, 'uHorizonPulseSpeed'),
      glowY:            gl.getUniformLocation(sceneProg, 'uGlowY'),
      glowHeight:       gl.getUniformLocation(sceneProg, 'uGlowHeight'),
      beatReactivity:   gl.getUniformLocation(sceneProg, 'uBeatReactivity'),
    };

    beu = {
      scene:     gl.getUniformLocation(bloomExtractProg, 'uScene'),
      threshold: gl.getUniformLocation(bloomExtractProg, 'uThreshold'),
    };

    blu = {
      tex:       gl.getUniformLocation(blurProg, 'uTex'),
      direction: gl.getUniformLocation(blurProg, 'uDirection'),
      resolution:gl.getUniformLocation(blurProg, 'uResolution'),
    };

    cu = {
      scene:         gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight:    gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:     gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:      gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:          gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReactivity:gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
    };
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;

    // Recreate FBOs on resize
    if (sw !== fboW || sh !== fboH) {
      deleteFBO(gl, sceneFBO);
      deleteFBO(gl, bloomFBO1);
      deleteFBO(gl, bloomFBO2);
      deleteFBO(gl, bloomWideFBO1);
      deleteFBO(gl, bloomWideFBO2);
      sceneFBO      = createFBO(gl, sw, sh);
      bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    const state = computeState(t);

    // ── Pass 1: Scene → sceneFBO ────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);
    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);
    gl.uniform2f(su.resolution, sw, sh);
    gl.uniform1f(su.scrollOffset, state.scrollOffset);
    gl.uniform1f(su.bgFade, state.bgFade);
    gl.uniform1f(su.textFade, state.textFade);
    gl.uniform1i(su.showLandscape, state.showLandscape ? 1 : 0);

    gl.uniform1f(su.horizonGlow, p('horizonGlow', 0.08));
    gl.uniform1f(su.horizonPulseSpeed, p('horizonPulseSpeed', 1.2));
    gl.uniform1f(su.glowY, p('glowY', 0.62));
    gl.uniform1f(su.glowHeight, p('glowHeight', 0.12));
    gl.uniform1f(su.beatReactivity, p('beatReactivity', 0.12));

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, landscapeTex);
    gl.uniform1i(su.landscape, 0);

    gl.activeTexture(gl.TEXTURE1);
    const textTex = state.textIndex >= 0 ? textTextures[state.textIndex] : emptyTextTex;
    gl.bindTexture(gl.TEXTURE_2D, textTex);
    gl.uniform1i(su.text, 1);

    quad.draw();

    // ── Pass 2: Bloom pipeline ───────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    // Extract bright pixels at half-res
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.4));
    quad.draw();

    // Tight bloom: 3 blur iterations at half-res
    gl.useProgram(blurProg);
    gl.uniform1i(blu.tex, 0);
    gl.uniform2f(blu.resolution, hw, hh);
    for (let i = 0; i < 3; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO2.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
      gl.uniform2f(blu.direction, 1.0, 0.0);
      quad.draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomFBO2.tex);
      gl.uniform2f(blu.direction, 0.0, 1.0);
      quad.draw();
    }

    // Wide bloom: downsample tight bloom to quarter-res, blur again
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomWideFBO1.fb);
    gl.viewport(0, 0, qw, qh);
    gl.useProgram(bloomExtractProg);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, 0.0);
    quad.draw();

    gl.useProgram(blurProg);
    gl.uniform1i(blu.tex, 0);
    gl.uniform2f(blu.resolution, qw, qh);
    for (let i = 0; i < 3; i++) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomWideFBO2.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomWideFBO1.tex);
      gl.uniform2f(blu.direction, 1.0, 0.0);
      quad.draw();
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomWideFBO1.fb);
      gl.bindTexture(gl.TEXTURE_2D, bloomWideFBO2.tex);
      gl.uniform2f(blu.direction, 0.0, 1.0);
      quad.draw();
    }

    // ── Pass 3: Composite to screen ──────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(cu.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(cu.bloomTight, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloomWideFBO1.tex);
    gl.uniform1i(cu.bloomWide, 2);
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.15));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.12));
    quad.draw();
  },

  destroy(gl) {
    if (sceneProg) gl.deleteProgram(sceneProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (landscapeTex) gl.deleteTexture(landscapeTex);
    if (emptyTextTex) gl.deleteTexture(emptyTextTex);
    for (const tex of textTextures) gl.deleteTexture(tex);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    landscapeTex = null;
    emptyTextTex = null;
    textTextures = [];
    fontChars = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
  },
};
