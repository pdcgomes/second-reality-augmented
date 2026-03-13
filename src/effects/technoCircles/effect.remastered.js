/**
 * TECHNO_CIRCLES — Remastered variant (Part 8)
 *
 * GPU-accelerated circle interference using the original EGA circle
 * bitmaps uploaded as textures and sampled in the fragment shader.
 * This preserves the exact ring patterns of the classic while rendering
 * at native resolution. The palette lookup, interference OR, sinusoidal
 * distortion, and orbital motion are all computed in GLSL.
 *
 * Enhancements over classic: bilinear-filtered upscale of circle data,
 * smooth palette gradients at ring edges, dual-tier bloom, beat
 * reactivity, and editor-tunable parameters.
 *
 *   Phase 1 (frames 0–255): Single circle with rotating palette sweep.
 *   Phase 2 (frames 256+):  Two-circle interference with sinusoidal
 *     per-scanline distortion that intensifies over time.
 *
 * Post-processing: dual-tier bloom + optional scanlines + beat reactivity.
 *
 * Original code: TECHNO/KOE*.ASM by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
import { CIRCLE1_B64, CIRCLE2_B64 } from './data.js';

const FRAME_RATE = 70;

// ── Palette presets ──────────────────────────────────────────────
// Each preset defines 3 RGB tint vectors (0–1):
//   phase1 — bright ring color for Phase 1 (PAL0 highlight)
//   pal1   — tint for palette bank 0–7 (classic: warm purple-gray)
//   pal2   — tint for palette bank 8–15 (classic: cool purple-gray)

const PALETTES = [
  { name: 'Classic',    phase1: [0, 0.476, 0.635], pal1: [1.0, 0.889, 1.0],  pal2: [1.0, 0.778, 1.0]  },
  { name: 'Ember',      phase1: [1.0, 0.5, 0.05],  pal1: [1.0, 0.6, 0.2],    pal2: [1.0, 0.3, 0.1]    },
  { name: 'Ocean',      phase1: [0.0, 0.6, 1.0],   pal1: [0.3, 0.7, 1.0],    pal2: [0.1, 0.9, 0.8]    },
  { name: 'Toxic',      phase1: [0.2, 1.0, 0.3],   pal1: [0.4, 1.0, 0.2],    pal2: [0.2, 0.8, 0.5]    },
  { name: 'Infrared',   phase1: [1.0, 0.1, 0.3],   pal1: [1.0, 0.2, 0.5],    pal2: [0.8, 0.1, 1.0]    },
  { name: 'Aurora',     phase1: [0.3, 1.0, 0.5],   pal1: [0.2, 0.9, 0.7],    pal2: [0.5, 0.3, 1.0]    },
  { name: 'Monochrome', phase1: [0.7, 0.8, 0.9],   pal1: [1.0, 1.0, 1.0],    pal2: [0.85, 0.85, 0.85] },
  { name: 'Sunset',     phase1: [1.0, 0.4, 0.6],   pal1: [1.0, 0.5, 0.2],    pal2: [0.7, 0.2, 0.8]    },
  { name: 'Matrix',     phase1: [0.0, 1.0, 0.3],   pal1: [0.1, 1.0, 0.3],    pal2: [0.0, 0.7, 0.2]    },
  { name: 'Gruvbox',    phase1: [0.41, 0.62, 0.42], pal1: [0.84, 0.6, 0.13],  pal2: [0.69, 0.38, 0.53] },
  { name: 'Monokai',    phase1: [0.4, 0.85, 0.94],  pal1: [0.98, 0.15, 0.45], pal2: [0.68, 0.51, 1.0]  },
  { name: 'Dracula',    phase1: [0.55, 0.91, 0.99], pal1: [0.74, 0.58, 0.98], pal2: [1.0, 0.47, 0.78]  },
  { name: 'Solarized',  phase1: [0.16, 0.55, 0.82], pal1: [0.71, 0.54, 0.0],  pal2: [0.17, 0.63, 0.6]  },
  { name: 'Nord',       phase1: [0.53, 0.75, 0.82], pal1: [0.75, 0.38, 0.42], pal2: [0.64, 0.74, 0.55] },
  { name: 'One Dark',   phase1: [0.38, 0.69, 0.94], pal1: [0.88, 0.42, 0.46], pal2: [0.78, 0.47, 0.87] },
  { name: 'Catppuccin', phase1: [0.54, 0.71, 0.98], pal1: [0.95, 0.55, 0.66], pal2: [0.8, 0.65, 0.96]  },
  { name: 'Tokyo Night',phase1: [0.48, 0.81, 1.0],  pal1: [0.97, 0.47, 0.56], pal2: [0.73, 0.6, 0.97]  },
  { name: 'Synthwave',  phase1: [0.45, 0.98, 0.72], pal1: [1.0, 0.49, 0.86],  pal2: [0.21, 0.98, 0.96] },
  { name: 'Kanagawa',   phase1: [0.5, 0.61, 0.85],  pal1: [0.76, 0.25, 0.26], pal2: [0.59, 0.5, 0.72]  },
  { name: 'Everforest', phase1: [0.5, 0.73, 0.57],  pal1: [0.9, 0.5, 0.5],    pal2: [0.65, 0.75, 0.5]  },
  { name: 'Rose Pine',  phase1: [0.61, 0.81, 0.85], pal1: [0.92, 0.44, 0.57], pal2: [0.77, 0.65, 0.9]  },
];

// ── Circle decoding (same as classic, runs once at init) ─────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function decodeCircle1(raw) {
  const out = new Uint8Array(640 * 400);
  for (let y = 0; y < 200; y++) {
    for (let xd = 0; xd < 320; xd++) {
      const lineStart = 40 * y * 3;
      const byteIdx = xd >> 3;
      const bitIdx = 7 - (xd & 7);
      let color = 0;
      for (let plane = 0; plane < 3; plane++) {
        color |= ((raw[lineStart + plane * 40 + byteIdx] >> bitIdx) & 1) << plane;
      }
      out[y * 640 + xd] = color;
      out[(399 - y) * 640 + xd] = color;
      out[y * 640 + 320 + (319 - xd)] = color;
      out[(399 - y) * 640 + 320 + (319 - xd)] = color;
    }
  }
  return out;
}

function decodeCircle2(raw) {
  const out = new Uint8Array(640 * 400);
  for (let y = 0; y < 200; y++) {
    for (let xd = 0; xd < 320; xd++) {
      const lineStart = 40 * y;
      const byteIdx = xd >> 3;
      const bitIdx = 7 - (xd & 7);
      const color = ((raw[lineStart + byteIdx] >> bitIdx) & 1) << 3;
      out[y * 640 + xd] = color;
      out[(399 - y) * 640 + xd] = color;
      out[y * 640 + 320 + (319 - xd)] = color;
      out[(399 - y) * 640 + 320 + (319 - xd)] = color;
    }
  }
  return out;
}

// ── Shaders ──────────────────────────────────────────────────────

const CIRCLES_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uFrame;
uniform float uPhase;
uniform float uFade;
uniform float uBeat;
uniform float uBeatReactivity;
uniform float uHueShift;
uniform float uSaturationBoost;
uniform float uBrightness;
uniform float uDistortionScale;
uniform float uColorSmooth;

uniform float uOverrot;
uniform float uScrnrot;
uniform float uSinurot;
uniform float uSinuspower;
uniform float uPalShift;

uniform sampler2D uCircle1;
uniform sampler2D uCircle2;

uniform vec3 uPhase1Color;
uniform vec3 uPal1Tint;
uniform vec3 uPal2Tint;

#define PI  3.14159265359
#define TAU 6.28318530718

float sin1024(float idx) {
  return sin(idx * TAU / 1024.0) * 255.0;
}

float power0(float sinuspower, float siny) {
  float c = siny < 128.0 ? siny : siny - 256.0;
  return floor(c * sinuspower / 15.0);
}

// Sample circle texture: coords in 640x400 pixel space → UV
float sampleCircle1(vec2 pixCoord) {
  vec2 uv = pixCoord / vec2(640.0, 400.0);
  return texture(uCircle1, uv).r * 255.0;
}

float sampleCircle2(vec2 pixCoord) {
  vec2 uv = pixCoord / vec2(640.0, 400.0);
  return texture(uCircle2, uv).r * 255.0;
}

// ── Palette functions (discrete, matching classic VGA values) ──

// PAL0 values (6-bit VGA): only index 0 is non-black: (0, 30, 40)
// 16 entries = 8-entry pal0 repeated, rotated by shift
vec3 phase1Pal(float ci, float shift, float palfader) {
  float idx = mod(floor(ci) + 7.0 - floor(shift) + 800.0, 8.0);
  float bright = idx < 0.5 ? 1.0 : 0.0;
  vec3 base = uPhase1Color * 63.0 * bright;
  if (palfader <= 256.0) {
    base *= palfader / 256.0;
  } else {
    base = clamp(base + (palfader - 256.0), 0.0, 63.0);
  }
  return base / 63.0;
}

// PAL1 entries (8 values): 30, 60, 50, 40, 30, 20, 10, 0
const float PAL1_V[8] = float[8](30.0, 60.0, 50.0, 40.0, 30.0, 20.0, 10.0, 0.0);

// PAL2 entries (8 values): 0, 10, 20, 30, 40, 50, 60, 30
const float PAL2_V[8] = float[8](0.0, 10.0, 20.0, 30.0, 40.0, 50.0, 60.0, 30.0);

vec3 phase2Pal(float ci, float shift, float smooth_amount) {
  float intCi = floor(ci);
  float frac_ci = ci - intCi;
  float blend = frac_ci * smooth_amount;

  int idx0 = int(mod(intCi, 16.0));
  int idx1 = int(mod(intCi + 1.0, 16.0));

  float s = floor(shift);
  vec3 c0, c1;

  if (idx0 < 8) {
    int si = int(mod(float(idx0) + 7.0 - s, 8.0));
    c0 = vec3(PAL1_V[si]) * uPal1Tint;
  } else {
    int si = int(mod(float(idx0 - 8) + 7.0 - s, 8.0));
    c0 = vec3(PAL2_V[si]) * uPal2Tint;
  }

  if (idx1 < 8) {
    int si = int(mod(float(idx1) + 7.0 - s, 8.0));
    c1 = vec3(PAL1_V[si]) * uPal1Tint;
  } else {
    int si = int(mod(float(idx1 - 8) + 7.0 - s, 8.0));
    c1 = vec3(PAL2_V[si]) * uPal2Tint;
  }

  return mix(c0, c1, blend) / 63.0;
}

// ── Color grading ──

vec3 hueRotate(vec3 color, float angle) {
  float cosA = cos(angle);
  float sinA = sin(angle);
  mat3 rot = mat3(
    0.299 + 0.701*cosA + 0.168*sinA,
    0.299 - 0.299*cosA - 0.328*sinA,
    0.299 - 0.299*cosA + 1.250*sinA,
    0.587 - 0.587*cosA + 0.330*sinA,
    0.587 + 0.413*cosA + 0.035*sinA,
    0.587 - 0.587*cosA - 1.050*sinA,
    0.114 - 0.114*cosA - 0.497*sinA,
    0.114 - 0.114*cosA + 0.292*sinA,
    0.114 + 0.886*cosA - 0.203*sinA
  );
  return clamp(rot * color, 0.0, 1.0);
}

vec3 boostSaturation(vec3 color, float amount) {
  float luma = dot(color, vec3(0.299, 0.587, 0.114));
  return clamp(mix(vec3(luma), color, 1.0 + amount), 0.0, 1.0);
}

void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);

  // Screen position in classic 320x200 space
  vec2 pos = vec2(uv.x * 320.0, uv.y * 200.0);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  vec3 color;

  if (uPhase < 0.5) {
    // ── Phase 1: single circle, rotating palette sweep ──
    float palfader = clamp(uFrame * 2.0, 0.0, 512.0);
    float shift = mod(uFrame, 8.0);

    // Sample circle1 centered: classic reads (x+160, y+100) in 640x400
    vec2 circleCoord = vec2(pos.x + 160.0, pos.y + 100.0);
    float ci = sampleCircle1(circleCoord);

    color = phase1Pal(ci, shift, palfader);
    color += beatPulse * 0.06;

  } else {
    // ── Phase 2: two-circle interference with distortion ──
    float overx = 160.0 + sin1024(uOverrot) / 4.0;
    float overy = 100.0 + sin1024(mod(uOverrot + 256.0, 1024.0)) / 4.0;
    float scrnx = 160.0 + sin1024(uScrnrot) / 4.0;
    float scrny = 100.0 + sin1024(mod(uScrnrot + 256.0, 1024.0)) / 4.0;

    // Per-scanline sinusoidal distortion on circle2
    float sinroty = mod(uSinurot + 9.0 * pos.y, 1024.0);
    float siny = mod(floor(sin1024(sinroty) / 8.0), 256.0);
    if (siny < 0.0) siny += 256.0;
    float powr = power0(uSinuspower, siny) * uDistortionScale;

    // Sample both circles with their orbital offsets (same coords as classic)
    vec2 c1coord = vec2(pos.x + scrnx, pos.y + scrny);
    vec2 c2coord = vec2(pos.x + overx + powr, pos.y + overy);

    float ring1 = sampleCircle1(c1coord);
    float ring2 = sampleCircle2(c2coord);

    // Bitwise OR of the two circle patterns (bits don't overlap: 0-7 | 0,8 = 0-15)
    // With texture filtering, values may be fractional — reconstruct discrete OR
    float r1 = floor(ring1 + 0.5);
    float r2 = floor(ring2 + 0.5);
    float ci_int = r1 + r2;

    // Smooth version blends the fractional ring values for AA at ring edges
    float ci_smooth = ring1 + ring2;

    float ci = mix(ci_int, ci_smooth, uColorSmooth);

    color = phase2Pal(ci, uPalShift, uColorSmooth);
    color += beatPulse * 0.04;
  }

  if (uHueShift != 0.0) {
    color = hueRotate(color, uHueShift * TAU / 360.0);
  }
  if (uSaturationBoost != 0.0) {
    color = boostSaturation(color, uSaturationBoost);
  }
  color *= uBrightness + beatPulse * 0.12;
  color *= uFade;

  fragColor = vec4(color, 1.0);
}
`;

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
uniform float uScanlineStr;
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.25)
    + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
  float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;
  fragColor = vec4(color, 1.0);
}
`;

// ── FBO helpers ──────────────────────────────────────────────────

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

// ── Module state ─────────────────────────────────────────────────

let circlesProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;
let circle1Tex = null, circle2Tex = null;

let mu = {}, beu = {}, blu = {}, cu = {};

function uploadCircleTexture(gl, data, w, h) {
  const tex = gl.createTexture();
  const luminance = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) luminance[i] = data[i];
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, w, h, 0, gl.RED, gl.UNSIGNED_BYTE, luminance);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

export default {
  label: 'technoCircles (remastered)',

  params: [
    gp('Palette',          { key: 'palette',          label: 'Theme',            type: 'select', options: PALETTES.map((p, i) => ({ value: i, label: p.name })), default: 1 }),
    gp('Palette',          { key: 'hueShift',         label: 'Hue Shift',        type: 'float', min: 0,    max: 360,  step: 1,     default: 7 }),
    gp('Palette',          { key: 'saturationBoost',  label: 'Saturation Boost', type: 'float', min: -0.5, max: 1,    step: 0.01,  default: 0.30 }),
    gp('Palette',          { key: 'brightness',       label: 'Brightness',       type: 'float', min: 0.5,  max: 2,    step: 0.01,  default: 1.15 }),
    gp('Effect',           { key: 'colorSmooth',      label: 'Color Smoothing',  type: 'float', min: 0,    max: 1,    step: 0.01,  default: 0.3 }),
    gp('Effect',           { key: 'distortionScale',  label: 'Distortion Scale', type: 'float', min: 0,    max: 3,    step: 0.05,  default: 1.0 }),
    gp('Post-Processing',  { key: 'bloomThreshold',   label: 'Bloom Threshold',  type: 'float', min: 0,    max: 1,    step: 0.01,  default: 0.2 }),
    gp('Post-Processing',  { key: 'bloomStrength',    label: 'Bloom Strength',   type: 'float', min: 0,    max: 2,    step: 0.01,  default: 0.5 }),
    gp('Post-Processing',  { key: 'beatReactivity',   label: 'Beat Reactivity',  type: 'float', min: 0,    max: 1,    step: 0.01,  default: 0.4 }),
    gp('Post-Processing',  { key: 'scanlineStr',      label: 'Scanlines',        type: 'float', min: 0,    max: 0.5,  step: 0.01,  default: 0.02 }),
  ],

  init(gl) {
    circlesProg = createProgram(gl, FULLSCREEN_VERT, CIRCLES_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    // Decode and upload circle bitmaps as GPU textures
    const c1data = decodeCircle1(b64ToUint8(CIRCLE1_B64));
    const c2data = decodeCircle2(b64ToUint8(CIRCLE2_B64));
    circle1Tex = uploadCircleTexture(gl, c1data, 640, 400);
    circle2Tex = uploadCircleTexture(gl, c2data, 640, 400);

    mu = {
      frame:           gl.getUniformLocation(circlesProg, 'uFrame'),
      phase:           gl.getUniformLocation(circlesProg, 'uPhase'),
      fade:            gl.getUniformLocation(circlesProg, 'uFade'),
      beat:            gl.getUniformLocation(circlesProg, 'uBeat'),
      beatReactivity:  gl.getUniformLocation(circlesProg, 'uBeatReactivity'),
      hueShift:        gl.getUniformLocation(circlesProg, 'uHueShift'),
      saturationBoost: gl.getUniformLocation(circlesProg, 'uSaturationBoost'),
      brightness:      gl.getUniformLocation(circlesProg, 'uBrightness'),
      distortionScale: gl.getUniformLocation(circlesProg, 'uDistortionScale'),
      colorSmooth:     gl.getUniformLocation(circlesProg, 'uColorSmooth'),
      overrot:         gl.getUniformLocation(circlesProg, 'uOverrot'),
      scrnrot:         gl.getUniformLocation(circlesProg, 'uScrnrot'),
      sinurot:         gl.getUniformLocation(circlesProg, 'uSinurot'),
      sinuspower:      gl.getUniformLocation(circlesProg, 'uSinuspower'),
      palShift:        gl.getUniformLocation(circlesProg, 'uPalShift'),
      circle1:         gl.getUniformLocation(circlesProg, 'uCircle1'),
      circle2:         gl.getUniformLocation(circlesProg, 'uCircle2'),
      phase1Color:     gl.getUniformLocation(circlesProg, 'uPhase1Color'),
      pal1Tint:        gl.getUniformLocation(circlesProg, 'uPal1Tint'),
      pal2Tint:        gl.getUniformLocation(circlesProg, 'uPal2Tint'),
    };

    beu = {
      scene:     gl.getUniformLocation(bloomExtractProg, 'uScene'),
      threshold: gl.getUniformLocation(bloomExtractProg, 'uThreshold'),
    };

    blu = {
      tex:        gl.getUniformLocation(blurProg, 'uTex'),
      direction:  gl.getUniformLocation(blurProg, 'uDirection'),
      resolution: gl.getUniformLocation(blurProg, 'uResolution'),
    };

    cu = {
      scene:         gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight:    gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:     gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:      gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:          gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReactivity:gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
      scanlineStr:   gl.getUniformLocation(compositeProg, 'uScanlineStr'),
    };
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;

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

    const frame = Math.floor(t * FRAME_RATE);
    const isPhase2 = frame >= 256;
    const n = isPhase2 ? frame - 256 : 0;

    // Fade in during first ~1.8s (128 frames)
    let fade = 1.0;
    if (frame < 128) fade = frame / 128;

    // Phase 2 animation state (all O(1) derivable from frame number)
    const overrot  = (211 + 7 * n) % 1024;
    const scrnrot  = (5 * n) % 1024;
    const sinurot  = (7 * (n + 1)) % 1024;
    const sinuspower = n > 350 ? Math.min(Math.max(Math.floor((n - 350) / 16), 1), 15) : 0;
    const palanimc = (7 + n) % 8;

    // ── Pass 1: Circle interference → sceneFBO ───────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(circlesProg);

    // Bind circle textures to units 0 and 1
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, circle1Tex);
    gl.uniform1i(mu.circle1, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, circle2Tex);
    gl.uniform1i(mu.circle2, 1);

    gl.uniform1f(mu.frame, frame);
    gl.uniform1f(mu.phase, isPhase2 ? 1.0 : 0.0);
    gl.uniform1f(mu.fade, fade);
    gl.uniform1f(mu.beat, beat);
    gl.uniform1f(mu.beatReactivity, p('beatReactivity', 0.4));
    gl.uniform1f(mu.hueShift, p('hueShift', 7));
    gl.uniform1f(mu.saturationBoost, p('saturationBoost', 0.30));
    gl.uniform1f(mu.brightness, p('brightness', 1.15));
    gl.uniform1f(mu.distortionScale, p('distortionScale', 1.0));
    gl.uniform1f(mu.colorSmooth, p('colorSmooth', 0.3));
    gl.uniform1f(mu.overrot, overrot);
    gl.uniform1f(mu.scrnrot, scrnrot);
    gl.uniform1f(mu.sinurot, sinurot);
    gl.uniform1f(mu.sinuspower, sinuspower);
    gl.uniform1f(mu.palShift, palanimc);

    const pal = PALETTES[Math.round(p('palette', 1))] ?? PALETTES[0];
    gl.uniform3fv(mu.phase1Color, pal.phase1);
    gl.uniform3fv(mu.pal1Tint, pal.pal1);
    gl.uniform3fv(mu.pal2Tint, pal.pal2);

    quad.draw();

    // ── Pass 2: Bloom pipeline ───────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.2));
    quad.draw();

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
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.5));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.4));
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.02));
    quad.draw();
  },

  destroy(gl) {
    if (circlesProg) gl.deleteProgram(circlesProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (circle1Tex) gl.deleteTexture(circle1Tex);
    if (circle2Tex) gl.deleteTexture(circle2Tex);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    circlesProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    circle1Tex = circle2Tex = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
  },
};
