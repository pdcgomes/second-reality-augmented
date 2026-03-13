/**
 * PLZ_PLASMA — Remastered variant (Part 16)
 *
 * Full-resolution GPU plasma using the same multi-harmonic sine formulas
 * as the classic variant, computed natively in GLSL. Smooth continuous
 * palette interpolation replaces the 256-entry indexed lookup. Three
 * palette sequences cycle via drop transitions matching the classic timing.
 *
 * Post-processing: dual-tier bloom + optional scanlines + beat reactivity.
 *
 * Original code: PLZ/PLZ.C + ASMYT.ASM + COPPER.ASM by WILDFIRE.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAME_RATE = 70;
const DPII = 2 * Math.PI;

const INITTABLE = [
  [1000,2000,3000,4000,3500,2300,3900,3670],
  [1000,2000,4000,4000,1500,2300,3900,1670],
  [3500,1000,3000,1000,3500,3300,2900,2670],
  [1000,2000,3000,4000,3500,2300,3900,3670],
  [1000,2000,3000,4000,3500,2300,3900,3670],
  [1000,2000,3000,4000,3500,2300,3900,3670],
];

const SYNC_FRAMES = [0, 880, 1760, 2400];

// ── Shaders ──────────────────────────────────────────────────────

const PLASMA_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uK1, uK2, uK3, uK4;
uniform float uL1, uL2, uL3, uL4;
uniform float uFade;
uniform float uLc;
uniform float uBeat;
uniform float uBeatReactivity;
uniform float uHueShift;
uniform float uSaturationBoost;
uniform float uBrightness;
uniform int uPalette;
uniform int uPaletteNext;
uniform float uPaletteMix;

#define PI  3.14159265359
#define TAU 6.28318530718

float lsini4(float a) {
  float t = a * TAU / 4096.0;
  return (sin(t) * 55.0 + sin(t * 5.0) * 8.0 + sin(t * 15.0) * 2.0 + 64.0) * 8.0;
}

float lsini16(float a) {
  float t = a * TAU / 4096.0;
  return (sin(t) * 55.0 + sin(t * 4.0) * 5.0 + sin(t * 17.0) * 3.0 + 64.0) * 16.0;
}

float psini(float a) {
  float t = a * TAU / 4096.0;
  return sin(t) * 55.0 + sin(t * 6.0) * 5.0 + sin(t * 21.0) * 4.0 + 64.0;
}

float ptau(float k) {
  return cos(clamp(k, 0.0, 128.0) * TAU / 128.0 + PI) * 31.0 + 32.0;
}

vec3 palette0(float ci) {
  float t = ci / 256.0 * 4.0;
  float seg = floor(t);
  float f = fract(t);
  if (seg < 1.0) return vec3(ptau(f * 63.0), ptau(0.0), ptau(0.0));
  if (seg < 2.0) return vec3(ptau((1.0 - f) * 63.0), ptau(0.0), ptau(0.0));
  if (seg < 3.0) return vec3(ptau(0.0), ptau(0.0), ptau(f * 63.0));
  return vec3(ptau(f * 63.0), ptau(0.0), ptau((1.0 - f) * 63.0));
}

vec3 palette1(float ci) {
  float t = ci / 256.0 * 4.0;
  float seg = floor(t);
  float f = fract(t);
  if (seg < 1.0) return vec3(ptau(f * 63.0), ptau(0.0), ptau(0.0));
  if (seg < 2.0) return vec3(ptau((1.0 - f) * 63.0), ptau(0.0), ptau(f * 63.0));
  if (seg < 3.0) return vec3(ptau(0.0), ptau(f * 63.0), ptau((1.0 - f) * 63.0));
  return vec3(ptau(f * 63.0), ptau(63.0), ptau(f * 63.0));
}

vec3 palette2(float ci) {
  float t = ci / 256.0 * 4.0;
  float seg = floor(t);
  float f = fract(t);
  float v;
  if (seg < 1.0) v = ptau(0.0);
  else if (seg < 2.0) v = ptau(f * 63.0);
  else if (seg < 3.0) v = ptau((1.0 - f) * 63.0);
  else v = ptau(0.0);
  return vec3(v * 0.5, v * 0.5, v * 0.5);
}

vec3 getPalette(int idx, float ci) {
  if (idx == 0) return palette0(ci);
  if (idx == 1) return palette1(ci);
  return palette2(ci);
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
  float yNorm = 1.0 - vUV.y;
  float y = yNorm * 280.0;
  float lcOffset = uLc / 400.0;
  float yShifted = yNorm + lcOffset - 60.0 / 400.0;

  if (yShifted < 0.0 || yShifted > 1.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float x = vUV.x * 80.0;
  float rx = 80.0 - x;

  float yCoord = y;

  float kBx1 = lsini16(yCoord + uK2 + rx * 4.0);
  float kVal1 = psini(x * 8.0 + uK1 + kBx1);
  float kBx2 = lsini4(yCoord + uK4 + x * 16.0);
  float kVal2 = psini(kBx2 + yCoord * 2.0 + uK3 + rx * 4.0);
  float kCi = mod(kVal1 + kVal2, 256.0);

  float lBx1 = lsini16(yCoord + uL2 + rx * 4.0);
  float lVal1 = psini(x * 8.0 + uL1 + lBx1);
  float lBx2 = lsini4(yCoord + uL4 + x * 16.0);
  float lVal2 = psini(lBx2 + yCoord * 2.0 + uL3 + rx * 4.0);
  float lCi = mod(lVal1 + lVal2, 256.0);

  float blend = 0.5 + 0.2 * sin(yCoord * PI / 140.0) + 0.2 * sin(vUV.x * PI * 3.0);
  float ci = mix(kCi, lCi, blend);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  ci = mod(ci + beatPulse * 30.0, 256.0);

  vec3 colA = getPalette(uPalette, ci);
  vec3 colB = getPalette(uPaletteNext, ci);
  vec3 color = mix(colA, colB, uPaletteMix);

  color /= 63.0;

  if (uHueShift != 0.0) {
    color = hueRotate(color, uHueShift * TAU / 360.0);
  }
  if (uSaturationBoost != 0.0) {
    color = boostSaturation(color, uSaturationBoost);
  }
  color *= uBrightness + beatPulse * 0.15;
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

let plasmaProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let pu = {}, beu = {}, blu = {}, cu = {};

export default {
  label: 'plasma (remastered)',

  params: [
    { key: 'hueShift',        label: 'Hue Shift',        type: 'float', min: 0,   max: 360, step: 1,    default: 0 },
    { key: 'saturationBoost', label: 'Saturation Boost',  type: 'float', min: -0.5,max: 1,   step: 0.01, default: 0.2 },
    { key: 'brightness',      label: 'Brightness',        type: 'float', min: 0.5, max: 2,   step: 0.01, default: 1.1 },
    { key: 'bloomThreshold',  label: 'Bloom Threshold',   type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.25 },
    { key: 'bloomStrength',   label: 'Bloom Strength',    type: 'float', min: 0,   max: 2,   step: 0.01, default: 0.45 },
    { key: 'beatReactivity',  label: 'Beat Reactivity',   type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.4 },
    { key: 'scanlineStr',     label: 'Scanlines',         type: 'float', min: 0,   max: 0.5, step: 0.01, default: 0.02 },
  ],

  init(gl) {
    plasmaProg = createProgram(gl, FULLSCREEN_VERT, PLASMA_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    pu = {
      k1: gl.getUniformLocation(plasmaProg, 'uK1'),
      k2: gl.getUniformLocation(plasmaProg, 'uK2'),
      k3: gl.getUniformLocation(plasmaProg, 'uK3'),
      k4: gl.getUniformLocation(plasmaProg, 'uK4'),
      l1: gl.getUniformLocation(plasmaProg, 'uL1'),
      l2: gl.getUniformLocation(plasmaProg, 'uL2'),
      l3: gl.getUniformLocation(plasmaProg, 'uL3'),
      l4: gl.getUniformLocation(plasmaProg, 'uL4'),
      fade: gl.getUniformLocation(plasmaProg, 'uFade'),
      lc: gl.getUniformLocation(plasmaProg, 'uLc'),
      beat: gl.getUniformLocation(plasmaProg, 'uBeat'),
      beatReactivity: gl.getUniformLocation(plasmaProg, 'uBeatReactivity'),
      hueShift: gl.getUniformLocation(plasmaProg, 'uHueShift'),
      saturationBoost: gl.getUniformLocation(plasmaProg, 'uSaturationBoost'),
      brightness: gl.getUniformLocation(plasmaProg, 'uBrightness'),
      palette: gl.getUniformLocation(plasmaProg, 'uPalette'),
      paletteNext: gl.getUniformLocation(plasmaProg, 'uPaletteNext'),
      paletteMix: gl.getUniformLocation(plasmaProg, 'uPaletteMix'),
    };

    beu = {
      scene: gl.getUniformLocation(bloomExtractProg, 'uScene'),
      threshold: gl.getUniformLocation(bloomExtractProg, 'uThreshold'),
    };

    blu = {
      tex: gl.getUniformLocation(blurProg, 'uTex'),
      direction: gl.getUniformLocation(blurProg, 'uDirection'),
      resolution: gl.getUniformLocation(blurProg, 'uResolution'),
    };

    cu = {
      scene: gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight: gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide: gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr: gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat: gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReactivity: gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
      scanlineStr: gl.getUniformLocation(compositeProg, 'uScanlineStr'),
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

    let seq = 0;
    for (let s = SYNC_FRAMES.length - 1; s >= 0; s--) {
      if (frame >= SYNC_FRAMES[s]) { seq = s; break; }
    }

    let lc = 60;
    let inDrop = false;
    if (seq > 0) {
      const dropFrame = frame - SYNC_FRAMES[seq];
      if (dropFrame < 64) {
        lc = Math.floor(dropFrame * dropFrame / 4 * 43 / 128 + 60);
        inDrop = true;
      }
    }

    const seqStart = SYNC_FRAMES[seq];
    const seqFrame = inDrop ? 0 : frame - seqStart - (seq > 0 ? 64 : 0);
    const effectiveSeq = seq >= 3 ? 2 : seq;
    const nextSeq = (effectiveSeq + 1) > 2 ? 2 : effectiveSeq + 1;

    let k1 = INITTABLE[effectiveSeq][4], k2 = INITTABLE[effectiveSeq][5];
    let k3 = INITTABLE[effectiveSeq][6], k4 = INITTABLE[effectiveSeq][7];
    let l1 = INITTABLE[effectiveSeq][0], l2 = INITTABLE[effectiveSeq][1];
    let l3 = INITTABLE[effectiveSeq][2], l4 = INITTABLE[effectiveSeq][3];

    const MASK = 4095;
    const advFrames = Math.max(0, seqFrame);
    for (let f = 0; f < advFrames; f++) {
      k1 = (k1 - 3) & MASK; k2 = (k2 - 2) & MASK;
      k3 = (k3 + 1) & MASK; k4 = (k4 + 2) & MASK;
      l1 = (l1 - 1) & MASK; l2 = (l2 - 2) & MASK;
      l3 = (l3 + 2) & MASK; l4 = (l4 + 3) & MASK;
    }

    let fadeFrac = 1.0;
    if (seq === 0 && frame < 126) {
      fadeFrac = frame / 126;
    } else if (inDrop) {
      fadeFrac = 0.0;
    } else if (seq > 0 && seqFrame < 30) {
      fadeFrac = Math.max(0, seqFrame) / 30;
    }

    let paletteMix = 0.0;
    if (seq > 0 && !inDrop && seqFrame < 60) {
      paletteMix = 0.0;
    }

    // ── Pass 1: Plasma → sceneFBO ────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(plasmaProg);
    gl.uniform1f(pu.k1, k1);
    gl.uniform1f(pu.k2, k2);
    gl.uniform1f(pu.k3, k3);
    gl.uniform1f(pu.k4, k4);
    gl.uniform1f(pu.l1, l1);
    gl.uniform1f(pu.l2, l2);
    gl.uniform1f(pu.l3, l3);
    gl.uniform1f(pu.l4, l4);
    gl.uniform1f(pu.fade, fadeFrac);
    gl.uniform1f(pu.lc, lc);
    gl.uniform1f(pu.beat, beat);
    gl.uniform1f(pu.beatReactivity, p('beatReactivity', 0.4));
    gl.uniform1f(pu.hueShift, p('hueShift', 0));
    gl.uniform1f(pu.saturationBoost, p('saturationBoost', 0.2));
    gl.uniform1f(pu.brightness, p('brightness', 1.1));
    gl.uniform1i(pu.palette, effectiveSeq);
    gl.uniform1i(pu.paletteNext, nextSeq);
    gl.uniform1f(pu.paletteMix, paletteMix);
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
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.25));
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
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.45));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.4));
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.02));
    quad.draw();
  },

  destroy(gl) {
    if (plasmaProg) gl.deleteProgram(plasmaProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    plasmaProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
  },
};
