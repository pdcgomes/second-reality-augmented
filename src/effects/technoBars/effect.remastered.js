/**
 * TECHNO_BARS — Remastered variant (Part 10)
 *
 * GPU-accelerated rotating bar interference rendered at native resolution.
 * The classic's 8-page × 4-plane EGA compositing system is faithfully
 * reproduced by evaluating 4 planes of analytical bar geometry per pixel
 * in GLSL, using a single modular-distance computation to test all 11
 * parallel bars simultaneously.
 *
 * The JS side replays the classic state machine frame-by-frame and stores
 * bar parameters (rot, vm, wx, wy) in a 32-frame circular buffer. Each
 * render call extracts the 4 parameter sets corresponding to the current
 * page's 4 planes and passes them as vec4 uniforms.
 *
 * Enhancements over classic: resolution-independent rendering, smooth
 * anti-aliased bar edges via fwidth(), continuous popcount color ramp,
 * palette presets with lo/hi tint interpolation, dual-tier bloom,
 * beat reactivity, and editor-tunable parameters.
 *
 *   Phase 1 (frames 0–419):    Slow rotating bars, bouncing spacing
 *   Phase 2 (frames 420–1259):  Accelerating rotation, collapsing spacing
 *   Phase 3 (frames 1260–2239): Orbiting center, scroll-out at end
 *
 * Post-processing: dual-tier bloom + optional scanlines + beat reactivity.
 *
 * Original code: TECHNO/KOE.C + KOEA.ASM by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';

const FRAME_RATE = 70;
const SEQ1_END = 70 * 6;
const SEQ2_END = 70 * (6 + 12);
const SEQ3_END = 70 * (6 + 12 + 14);

// ── Palette presets ──────────────────────────────────────────────
// Each preset defines lo (single-bar shadow) and hi (full-overlap highlight)
// RGB tint vectors. The shader interpolates between them based on overlap
// count (0–4 planes). Classic reproduces the original purple-gray ramp.

const PALETTES = [
  { name: 'Classic',     lo: [0.33, 0.30, 0.40], hi: [0.75, 0.70, 0.81] },
  { name: 'Ember',       lo: [0.45, 0.15, 0.02], hi: [1.00, 0.55, 0.10] },
  { name: 'Ocean',       lo: [0.05, 0.20, 0.45], hi: [0.15, 0.65, 1.00] },
  { name: 'Toxic',       lo: [0.10, 0.40, 0.08], hi: [0.30, 1.00, 0.25] },
  { name: 'Infrared',    lo: [0.45, 0.05, 0.12], hi: [1.00, 0.15, 0.30] },
  { name: 'Aurora',      lo: [0.08, 0.35, 0.25], hi: [0.30, 1.00, 0.55] },
  { name: 'Monochrome',  lo: [0.30, 0.30, 0.30], hi: [0.90, 0.90, 0.90] },
  { name: 'Sunset',      lo: [0.45, 0.12, 0.20], hi: [1.00, 0.45, 0.55] },
  { name: 'Matrix',      lo: [0.00, 0.30, 0.08], hi: [0.05, 1.00, 0.25] },
  { name: 'Gruvbox',     lo: [0.30, 0.22, 0.05], hi: [0.84, 0.60, 0.13] },
  { name: 'Monokai',     lo: [0.35, 0.06, 0.16], hi: [0.98, 0.15, 0.45] },
  { name: 'Dracula',     lo: [0.27, 0.21, 0.36], hi: [0.74, 0.58, 0.98] },
  { name: 'Solarized',   lo: [0.06, 0.20, 0.30], hi: [0.16, 0.55, 0.82] },
  { name: 'Nord',        lo: [0.20, 0.25, 0.30], hi: [0.53, 0.75, 0.82] },
  { name: 'One Dark',    lo: [0.14, 0.25, 0.35], hi: [0.38, 0.69, 0.94] },
  { name: 'Catppuccin',  lo: [0.20, 0.26, 0.36], hi: [0.54, 0.71, 0.98] },
  { name: 'Tokyo Night', lo: [0.17, 0.29, 0.37], hi: [0.48, 0.81, 1.00] },
  { name: 'Synthwave',   lo: [0.38, 0.18, 0.32], hi: [1.00, 0.49, 0.86] },
  { name: 'Kanagawa',    lo: [0.18, 0.22, 0.31], hi: [0.50, 0.61, 0.85] },
  { name: 'Everforest',  lo: [0.18, 0.27, 0.20], hi: [0.50, 0.73, 0.57] },
  { name: 'Rose Pine',   lo: [0.23, 0.30, 0.32], hi: [0.61, 0.81, 0.85] },
];

// ── Shaders ──────────────────────────────────────────────────────

const BARS_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec4 uBarRot;
uniform vec4 uBarVm;
uniform vec4 uBarWx;
uniform vec4 uBarWy;
uniform vec4 uPlaneActive;

uniform float uBeat;
uniform float uBeatReactivity;
uniform float uPalBrightness;
uniform float uHueShift;
uniform float uSaturationBoost;
uniform float uBrightness;
uniform float uColorSmooth;
uniform float uScrollX;

uniform vec3 uTintLo;
uniform vec3 uTintHi;

#define TAU 6.28318530718

float sin1024(float idx) {
  return sin(idx * TAU / 1024.0) * 255.0;
}

float evalBars(vec2 pos, float rotVal, float vmVal, vec2 center) {
  float hx = sin1024(rotVal) * 16.0 * 1.2;
  float hy = sin1024(rotVal + 256.0) * 16.0;
  float vx = sin1024(rotVal + 256.0) * 1.2 * vmVal / 100.0;
  float vy = sin1024(rotVal + 512.0) * vmVal / 100.0;

  vec2 d = (pos - center) * 16.0;
  vec2 u = vec2(hx, hy);
  vec2 v = vec2(vx, vy);

  float cross_uv = u.x * v.y - u.y * v.x;
  if (abs(cross_uv) < 0.01) return 0.0;

  float s = (d.x * v.y - d.y * v.x) / cross_uv;
  float t = (u.x * d.y - u.y * d.x) / cross_uv;

  float nearest = round(t / 4.0) * 4.0;

  float fw_s = fwidth(s);
  float fw_t = fwidth(t);
  float aa_s = 1.0 - smoothstep(1.0 - fw_s * 1.5, 1.0 + fw_s * 1.5, abs(s));
  float aa_t = 1.0 - smoothstep(1.0 - fw_t * 1.5, 1.0 + fw_t * 1.5, abs(t - nearest));
  float in_range = step(abs(nearest), 20.5);

  return aa_s * aa_t * in_range;
}

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
  vec2 pos = vec2(uv.x * 320.0, uv.y * 200.0);

  if (pos.x < uScrollX) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;

  float cov0 = evalBars(pos, uBarRot[0], uBarVm[0], vec2(uBarWx[0], uBarWy[0])) * uPlaneActive[0];
  float cov1 = evalBars(pos, uBarRot[1], uBarVm[1], vec2(uBarWx[1], uBarWy[1])) * uPlaneActive[1];
  float cov2 = evalBars(pos, uBarRot[2], uBarVm[2], vec2(uBarWx[2], uBarWy[2])) * uPlaneActive[2];
  float cov3 = evalBars(pos, uBarRot[3], uBarVm[3], vec2(uBarWx[3], uBarWy[3])) * uPlaneActive[3];

  float overlap_smooth = cov0 + cov1 + cov2 + cov3;

  float overlap_hard = step(0.5, cov0) + step(0.5, cov1) + step(0.5, cov2) + step(0.5, cov3);
  float overlap = mix(overlap_hard, overlap_smooth, uColorSmooth);

  float t_pal = overlap / 4.0;

  vec3 color = mix(uTintLo, uTintHi, t_pal) * t_pal;

  float palFlash = uPalBrightness / 15.0;
  color *= 1.0 + palFlash * 0.6;

  color += beatPulse * 0.05 * t_pal;

  if (uHueShift != 0.0) {
    color = hueRotate(color, uHueShift * TAU / 360.0);
  }
  if (uSaturationBoost != 0.0) {
    color = boostSaturation(color, uSaturationBoost);
  }
  color *= uBrightness + beatPulse * 0.12;

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

// ── Sin1024 lookup (used by JS state machine) ────────────────────

const sin1024 = new Int32Array(1024);
for (let x = 0; x < 1024; x++) {
  sin1024[x] = Math.floor(Math.sin(2 * Math.PI * x / 1024) * 255);
}

// ── Module state ─────────────────────────────────────────────────

let barsProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let mu = {}, beu = {}, blu = {}, cu = {};

// Animation state (mirrors classic state machine)
let rot, rota, rot2, vm, vma, xpos, xposa;
let curpal, lastFrame, seq1Init, seq2Init, seq3Init, doit3Start;
let currentPlane, currentPage;

// 32-frame circular buffer storing bar params per frame
let barHistory;

function resetState() {
  currentPlane = 0;
  currentPage = 0;
  rot = 0; rota = 0; rot2 = 0;
  vm = 0; vma = 0;
  xpos = 0; xposa = 0;
  curpal = 0;
  lastFrame = -1;
  seq1Init = false;
  seq2Init = false;
  seq3Init = false;
  doit3Start = 0;
  barHistory = new Array(32).fill(null);
}

function stepOneFrame(frame) {
  if (frame % 35 === 0) curpal = 15;
  if (curpal > 0) curpal--;

  let barRot = 0, barVm = 0, barWx = 160, barWy = 100;
  let scrollX = 0;
  let phaseStart = 0;

  if (frame < SEQ1_END) {
    if (!seq1Init) {
      seq1Init = true;
      currentPlane = 0; currentPage = 0;
      rot = 45; vm = 50; vma = 0;
    }
    phaseStart = 0;
    barRot = rot; barVm = vm; barWx = 160; barWy = 100;
    rot += 2;
    vm += vma;
    if (vm < 25) { vm -= vma; vma = -vma; }
    vma -= 1;
  } else if (frame < SEQ2_END) {
    if (!seq2Init) {
      seq2Init = true;
      currentPlane = 0; currentPage = 0;
      rot = 50; rota = 10; vm = 100 * 64; vma = 0;
    }
    phaseStart = SEQ1_END;
    barRot = rot; barVm = vm / 64; barWx = 160; barWy = 100;
    rot += rota / 10;
    vm += vma;
    if (vm < 0) { vm -= vma; vma = -vma; }
    vma -= 1;
    rota += 1;
  } else if (frame < SEQ3_END) {
    if (!seq3Init) {
      seq3Init = true;
      currentPlane = 0; currentPage = 0;
      rot = 45; rota = 10; rot2 = 0;
      xposa = 0; xpos = 0;
      vm = 100 * 64; vma = 0;
      doit3Start = frame;
    }
    phaseStart = SEQ2_END;
    const rot2f = Math.floor(rot2);
    if (rot2 < 32) {
      barWx = sin1024[(rot2f) & 1023] * rot2 / 8 + 160;
      barWy = sin1024[(rot2f + 256) & 1023] * rot2 / 8 + 100;
    } else {
      barWx = sin1024[(rot2f) & 1023] / 4 + 160;
      barWy = sin1024[(rot2f + 256) & 1023] / 4 + 100;
    }
    rot2 += 17;
    barRot = rot; barVm = vm / 64;
    rot += rota / 10;
    vm += vma;
    if (vm < 0) { vm -= vma; vma = -vma; }
    vma -= 1;
    rota += 1;

    if (frame - doit3Start > 70 * 14 - 333) {
      xpos += Math.floor(xposa / 4);
      if (xpos > 320) xpos = 320;
      else xposa += 1;
      scrollX = xpos;
    }
  }

  barHistory[frame % 32] = { rot: barRot, vm: barVm, wx: barWx, wy: barWy, phaseStart, scrollX };

  currentPage = (currentPage + 1) % 8;
  if (currentPage === 0) currentPlane = (currentPlane + 1) % 4;
}

function getPlaneParams(targetFrame) {
  const page = targetFrame % 8;
  const curPlaneIdx = Math.floor(targetFrame / 8) % 4;

  const rots = [0, 0, 0, 0];
  const vms = [0, 0, 0, 0];
  const wxs = [0, 0, 0, 0];
  const wys = [0, 0, 0, 0];
  const active = [0, 0, 0, 0];
  let scrollX = 0;

  for (let k = 0; k < 4; k++) {
    const planeIdx = (curPlaneIdx - k + 4) % 4;
    const histFrame = targetFrame - k * 8;
    if (histFrame < 0) continue;

    const entry = barHistory[histFrame % 32];
    if (!entry) continue;
    if (histFrame < entry.phaseStart) continue;

    rots[planeIdx] = entry.rot;
    vms[planeIdx] = entry.vm;
    wxs[planeIdx] = entry.wx;
    wys[planeIdx] = entry.wy;
    active[planeIdx] = 1;

    if (k === 0) scrollX = entry.scrollX;
  }

  return { rots, vms, wxs, wys, active, scrollX };
}

export default {
  label: 'technoBars (remastered)',

  params: [
    gp('Palette',         { key: 'palette',         label: 'Theme',            type: 'select', options: PALETTES.map((p, i) => ({ value: i, label: p.name })), default: 1 }),
    gp('Palette',         { key: 'hueShift',        label: 'Hue Shift',        type: 'float', min: 0,    max: 360,  step: 1,     default: 0 }),
    gp('Palette',         { key: 'saturationBoost', label: 'Saturation Boost', type: 'float', min: -0.5, max: 1,    step: 0.01,  default: 0.69 }),
    gp('Palette',         { key: 'brightness',      label: 'Brightness',       type: 'float', min: 0.5,  max: 2,    step: 0.01,  default: 1.19 }),
    gp('Effect',          { key: 'colorSmooth',     label: 'Color Smoothing',  type: 'float', min: 0,    max: 1,    step: 0.01,  default: 0.50 }),
    gp('Post-Processing', { key: 'bloomThreshold',  label: 'Bloom Threshold',  type: 'float', min: 0,    max: 1,    step: 0.01,  default: 0.24 }),
    gp('Post-Processing', { key: 'bloomStrength',   label: 'Bloom Strength',   type: 'float', min: 0,    max: 2,    step: 0.01,  default: 0.50 }),
    gp('Post-Processing', { key: 'beatReactivity',  label: 'Beat Reactivity',  type: 'float', min: 0,    max: 1,    step: 0.01,  default: 0.40 }),
    gp('Post-Processing', { key: 'scanlineStr',     label: 'Scanlines',        type: 'float', min: 0,    max: 0.5,  step: 0.01,  default: 0.26 }),
  ],

  init(gl) {
    barsProg = createProgram(gl, FULLSCREEN_VERT, BARS_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    mu = {
      barRot:          gl.getUniformLocation(barsProg, 'uBarRot'),
      barVm:           gl.getUniformLocation(barsProg, 'uBarVm'),
      barWx:           gl.getUniformLocation(barsProg, 'uBarWx'),
      barWy:           gl.getUniformLocation(barsProg, 'uBarWy'),
      planeActive:     gl.getUniformLocation(barsProg, 'uPlaneActive'),
      beat:            gl.getUniformLocation(barsProg, 'uBeat'),
      beatReactivity:  gl.getUniformLocation(barsProg, 'uBeatReactivity'),
      palBrightness:   gl.getUniformLocation(barsProg, 'uPalBrightness'),
      hueShift:        gl.getUniformLocation(barsProg, 'uHueShift'),
      saturationBoost: gl.getUniformLocation(barsProg, 'uSaturationBoost'),
      brightness:      gl.getUniformLocation(barsProg, 'uBrightness'),
      colorSmooth:     gl.getUniformLocation(barsProg, 'uColorSmooth'),
      scrollX:         gl.getUniformLocation(barsProg, 'uScrollX'),
      tintLo:          gl.getUniformLocation(barsProg, 'uTintLo'),
      tintHi:          gl.getUniformLocation(barsProg, 'uTintHi'),
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
      scene:          gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight:     gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:      gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:       gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:           gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReactivity: gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
      scanlineStr:    gl.getUniformLocation(compositeProg, 'uScanlineStr'),
    };

    resetState();
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

    // Advance state machine
    const targetFrame = Math.min(Math.floor(t * FRAME_RATE), SEQ3_END - 1);
    if (targetFrame < lastFrame) resetState();
    while (lastFrame < targetFrame) {
      lastFrame++;
      stepOneFrame(lastFrame);
    }

    if (beat < 0.1) curpal = 15;

    const { rots, vms, wxs, wys, active, scrollX } = getPlaneParams(targetFrame);

    // ── Pass 1: Bars → sceneFBO ─────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(barsProg);
    gl.uniform4fv(mu.barRot, rots);
    gl.uniform4fv(mu.barVm, vms);
    gl.uniform4fv(mu.barWx, wxs);
    gl.uniform4fv(mu.barWy, wys);
    gl.uniform4fv(mu.planeActive, active);
    gl.uniform1f(mu.beat, beat);
    gl.uniform1f(mu.beatReactivity, p('beatReactivity', 0.40));
    gl.uniform1f(mu.palBrightness, Math.max(curpal, 0));
    gl.uniform1f(mu.hueShift, p('hueShift', 0));
    gl.uniform1f(mu.saturationBoost, p('saturationBoost', 0.69));
    gl.uniform1f(mu.brightness, p('brightness', 1.19));
    gl.uniform1f(mu.colorSmooth, p('colorSmooth', 0.50));
    gl.uniform1f(mu.scrollX, scrollX);

    const pal = PALETTES[Math.round(p('palette', 1))] ?? PALETTES[1];
    gl.uniform3fv(mu.tintLo, pal.lo);
    gl.uniform3fv(mu.tintHi, pal.hi);

    quad.draw();

    // ── Pass 2: Bloom pipeline ──────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.24));
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

    // ── Pass 3: Composite to screen ─────────────────────────────

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
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.50));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.40));
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.26));
    quad.draw();
  },

  destroy(gl) {
    if (barsProg) gl.deleteProgram(barsProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    barsProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    barHistory = null;
  },
};
