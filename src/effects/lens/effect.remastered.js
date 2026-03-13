/**
 * LENS_LENS — Remastered variant (Part 14)
 *
 * A shader-driven bouncing crystal ball over the KOE background image.
 * The lens refracts the background analytically using Snell's law with
 * configurable IOR, adding Blinn-Phong specular, Fresnel rim glow,
 * environment reflection, and optional chromatic aberration.
 *
 * The KOE background receives the same visual treatment as LENS_ROTO
 * remastered (color grading, eye glow, procedural nebula) to ensure
 * visual continuity between the two consecutive effects.
 *
 * Bouncing physics are replayed from frame 0 (identical to classic) and
 * the lens fades in over frames 32–96.
 *
 * Original code: LENS/MAIN.C part2() + CALC.C by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { LENS_W, LENS_H, LENS_PAL_B64, LENS_PIX_B64 } from './data.js';
import { gp } from '../index.js';

const FRAME_RATE = 70;
const BG_W = 320, BG_H = 200;

// Eye center positions in the 320×200 background (derived from the 256×256
// rotozoom positions via the inverse aspect remap: x+32, y*10/11-18)
const EYE_LEFT_U  = 130 / BG_W;
const EYE_LEFT_V  = 108 / BG_H;
const EYE_RIGHT_U = 201 / BG_W;
const EYE_RIGHT_V = 108 / BG_H;

// Lens half-dimensions in background pixel coords
const LENS_RX = LENS_W / 2;
const LENS_RY = LENS_H / 2;

// ── Shaders ──────────────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uTime;
uniform float uBeat;

// KOE color grading (shared with LENS_ROTO)
uniform float uHueShift;
uniform float uSaturationBoost;
uniform float uBrightness;

// Eye glow (shared with LENS_ROTO)
uniform float uEyeGlowIntensity;
uniform float uEyeGlowRadius;
uniform float uEyeGlowHue;

// Background nebula (shared with LENS_ROTO)
uniform float uBgIntensity;
uniform float uBgSpeed;
uniform float uBeatReactivity;

// Lens ball
uniform vec2  uLensCenter;   // normalized screen coords
uniform vec2  uLensRadius;   // normalized half-size (rx/screenW, ry/screenH)
uniform float uLensOpacity;  // 0–1 fade-in
uniform float uLensIOR;
uniform float uLensHue;
uniform float uLensSpecularPower;
uniform float uLensSpecularIntensity;
uniform float uLensFresnelExponent;
uniform float uLensFresnelIntensity;
uniform float uLensReflectivity;
uniform float uLensChromaticAberration;

#define PI  3.14159265359
#define TAU 6.28318530718

// ── Noise ────────────────────────────────────────────────────────

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.0;
    a *= 0.5;
  }
  return v;
}

// ── Color utilities ──────────────────────────────────────────────

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

vec3 hsl2rgb(float h) {
  return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
}

// ── Background sampling with grading ─────────────────────────────

vec3 sampleBg(vec2 uv) {
  vec3 img = texture(uTex, uv).rgb;
  if (uHueShift != 0.0) {
    img = hueRotate(img, uHueShift * TAU / 360.0);
  }
  if (uSaturationBoost != 0.0) {
    img = boostSaturation(img, uSaturationBoost);
  }
  return img * uBrightness;
}

void main() {
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  float t = uTime * uBgSpeed;

  // ── Background: procedural nebula ──────────────────────────────

  vec2 bgP = vUV * 3.0 + vec2(t * 0.15, t * 0.1);
  float n1 = fbm(bgP);
  float n2 = fbm(bgP + vec2(5.2, 1.3) + t * 0.08);
  float n3 = fbm(bgP * 1.5 + vec2(t * 0.05));

  vec3 bgCol1 = vec3(0.05, 0.02, 0.15);
  vec3 bgCol2 = vec3(0.02, 0.08, 0.18);
  vec3 bgCol3 = vec3(0.12, 0.03, 0.08);
  vec3 bg = bgCol1 * n1 + bgCol2 * n2 + bgCol3 * n3;
  bg *= 1.0 + beatPulse * 0.3;
  bg *= uBgIntensity;

  // ── KOE background with color grading ──────────────────────────

  vec2 bgUV = vec2(vUV.x, 1.0 - vUV.y);
  vec3 img = sampleBg(bgUV);

  float imgLuma = dot(img, vec3(0.299, 0.587, 0.114));
  vec3 color = mix(bg, img, clamp(imgLuma * 4.0 + 0.15, 0.0, 1.0));

  // ── Eye glow ───────────────────────────────────────────────────

  vec2 eyeL = vec2(${EYE_LEFT_U.toFixed(6)}, ${EYE_LEFT_V.toFixed(6)});
  vec2 eyeR = vec2(${EYE_RIGHT_U.toFixed(6)}, ${EYE_RIGHT_V.toFixed(6)});

  float dL = distance(bgUV, eyeL);
  float dR = distance(bgUV, eyeR);

  float glowL = exp(-dL * dL / (uEyeGlowRadius * uEyeGlowRadius));
  float glowR = exp(-dR * dR / (uEyeGlowRadius * uEyeGlowRadius));
  float glow = (glowL + glowR) * uEyeGlowIntensity;
  glow *= 1.0 + beatPulse * 1.5;

  vec3 glowColor = hsl2rgb(uEyeGlowHue / 360.0);
  color += glowColor * glow;

  // ── Bouncing crystal ball ──────────────────────────────────────

  vec2 d = (vUV - uLensCenter) / uLensRadius;
  float r2 = dot(d, d);

  if (r2 < 1.0 && uLensOpacity > 0.0) {
    float r = sqrt(r2);
    float nz = sqrt(1.0 - r2);
    vec3 N = normalize(vec3(d, nz));
    vec3 V = vec3(0.0, 0.0, 1.0);

    // Refraction: bend the UV lookup
    vec3 I = vec3(0.0, 0.0, -1.0);
    vec3 refracted = refract(I, N, 1.0 / uLensIOR);
    vec2 offset = refracted.xy * (1.0 - nz) * 0.5;
    vec2 refUV = bgUV + offset * vec2(uLensRadius.x, -uLensRadius.y) * 2.0;

    // Chromatic aberration: shift R and B channels
    float ca = uLensChromaticAberration * (1.0 - nz);
    vec2 caOff = N.xy * ca * 0.02;
    vec3 refImg;
    if (uLensChromaticAberration > 0.0) {
      refImg.r = sampleBg(refUV + caOff).r;
      refImg.g = sampleBg(refUV).g;
      refImg.b = sampleBg(refUV - caOff).b;
    } else {
      refImg = sampleBg(refUV);
    }

    // Lens hue tint
    if (uLensHue != 0.0) {
      refImg = hueRotate(refImg, uLensHue * TAU / 360.0);
    }

    // Re-blend nebula through dark areas of refracted image
    float refLuma = dot(refImg, vec3(0.299, 0.587, 0.114));
    vec3 lensColor = mix(bg, refImg, clamp(refLuma * 4.0 + 0.15, 0.0, 1.0));

    // Specular highlight (Blinn-Phong)
    vec3 L = normalize(vec3(0.3, 0.5, 1.0));
    vec3 halfV = normalize(L + V);
    float NdH = max(dot(N, halfV), 0.0);
    float spec = pow(NdH, uLensSpecularPower) * uLensSpecularIntensity;
    lensColor += vec3(1.0, 0.98, 0.95) * spec;

    // Fresnel rim glow
    float NdV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdV, uLensFresnelExponent) * uLensFresnelIntensity;
    lensColor += vec3(0.4, 0.5, 0.7) * fresnel;

    // Environment reflection
    vec3 R = reflect(-V, N);
    float envNoise = fbm(R.xy * 2.0 + uTime * 0.1);
    vec3 envColor = mix(vec3(0.1, 0.15, 0.3), vec3(0.3, 0.2, 0.4), envNoise);
    lensColor = mix(lensColor, envColor, uLensReflectivity * (1.0 - NdV));

    // Eye glow visible through the lens (at refracted UV)
    float dLE = distance(refUV, eyeL);
    float dRE = distance(refUV, eyeR);
    float glowLE = exp(-dLE * dLE / (uEyeGlowRadius * uEyeGlowRadius));
    float glowRE = exp(-dRE * dRE / (uEyeGlowRadius * uEyeGlowRadius));
    float glowE = (glowLE + glowRE) * uEyeGlowIntensity * (1.0 + beatPulse * 1.5);
    lensColor += glowColor * glowE;

    // Soft edge blend
    float edge = smoothstep(1.0, 0.92, r);
    color = mix(color, lensColor, edge * uLensOpacity);
  }

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

// ── Bouncing physics (identical to classic) ──────────────────────

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function computeLensPosition(frame) {
  let lx = 65 * 64, ly = -50 * 64, lxa = 64, lya = 64;
  let firstBounce = true;
  for (let f = 0; f < frame; f++) {
    lx += lxa; ly += lya;
    if (lx > 256 * 64 || lx < 60 * 64) lxa = -lxa;
    if (ly > 150 * 64 && f < 600) {
      ly -= lya;
      if (firstBounce) { lya = Math.floor(-lya * 2 / 3); firstBounce = false; }
      else lya = Math.floor(-lya * 9 / 10);
    }
    lya += 2;
  }
  return { x: lx / 64, y: ly / 64 };
}

// ── Module state ─────────────────────────────────────────────────

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad, koeBgTexture;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let su = {}, beu = {}, blu = {}, cu = {};

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

export default {
  label: 'lens (remastered)',

  params: [
    // KOE background — same keys and defaults as LENS_ROTO remastered
    gp('Palette',         { key: 'hueShift',                label: 'Hue Shift',              type: 'float', min: 0,    max: 360,  step: 1,    default: 0 }),
    gp('Palette',         { key: 'saturationBoost',         label: 'Saturation',              type: 'float', min: -0.5, max: 1,    step: 0.01, default: 0.11 }),
    gp('Palette',         { key: 'brightness',              label: 'Brightness',              type: 'float', min: 0.5,  max: 2,    step: 0.01, default: 0.77 }),
    gp('Eyes',            { key: 'eyeGlowIntensity',        label: 'Eye Glow',                type: 'float', min: 0,    max: 3,    step: 0.01, default: 0.22 }),
    gp('Eyes',            { key: 'eyeGlowRadius',           label: 'Glow Radius',             type: 'float', min: 0.01, max: 0.15, step: 0.005,default: 0.05 }),
    gp('Eyes',            { key: 'eyeGlowHue',              label: 'Glow Color',              type: 'float', min: 0,    max: 360,  step: 1,    default: 6 }),
    gp('Background',      { key: 'bgIntensity',             label: 'Background Intensity',    type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.27 }),
    gp('Background',      { key: 'bgSpeed',                 label: 'Background Speed',        type: 'float', min: 0.1,  max: 2,    step: 0.01, default: 0.50 }),
    // Crystal ball
    gp('Ball',            { key: 'lensIOR',                 label: 'Refraction (IOR)',        type: 'float', min: 1.0,  max: 2.5,  step: 0.01, default: 1.45 }),
    gp('Ball',            { key: 'lensHue',                 label: 'Ball Hue',                type: 'float', min: 0,    max: 360,  step: 1,    default: 0 }),
    gp('Ball',            { key: 'lensSpecularPower',       label: 'Specular Power',          type: 'float', min: 2,    max: 128,  step: 1,    default: 57 }),
    gp('Ball',            { key: 'lensSpecularIntensity',   label: 'Specular Intensity',      type: 'float', min: 0,    max: 1.5,  step: 0.01, default: 0.35 }),
    gp('Ball',            { key: 'lensFresnelExponent',     label: 'Fresnel Exponent',        type: 'float', min: 0.5,  max: 5,    step: 0.1,  default: 1.2 }),
    gp('Ball',            { key: 'lensFresnelIntensity',    label: 'Fresnel Intensity',       type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.25 }),
    gp('Ball',            { key: 'lensReflectivity',        label: 'Reflectivity',            type: 'float', min: 0,    max: 0.5,  step: 0.01, default: 0.09 }),
    gp('Ball',            { key: 'lensChromaticAberration', label: 'Chromatic Aberration',    type: 'float', min: 0,    max: 3,    step: 0.1,  default: 0.8 }),
    // Post-processing — same defaults as LENS_ROTO remastered
    gp('Post-Processing', { key: 'bloomThreshold',          label: 'Bloom Threshold',         type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.20 }),
    gp('Post-Processing', { key: 'bloomStrength',           label: 'Bloom Strength',          type: 'float', min: 0,    max: 2,    step: 0.01, default: 0.50 }),
    gp('Post-Processing', { key: 'beatReactivity',          label: 'Beat Reactivity',         type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.40 }),
    gp('Post-Processing', { key: 'scanlineStr',             label: 'Scanlines',               type: 'float', min: 0,    max: 0.5,  step: 0.01, default: 0.08 }),
  ],

  init(gl) {
    sceneProg        = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg         = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg    = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    su = {
      tex:                      gl.getUniformLocation(sceneProg, 'uTex'),
      time:                     gl.getUniformLocation(sceneProg, 'uTime'),
      beat:                     gl.getUniformLocation(sceneProg, 'uBeat'),
      hueShift:                 gl.getUniformLocation(sceneProg, 'uHueShift'),
      saturationBoost:          gl.getUniformLocation(sceneProg, 'uSaturationBoost'),
      brightness:               gl.getUniformLocation(sceneProg, 'uBrightness'),
      eyeGlowIntensity:         gl.getUniformLocation(sceneProg, 'uEyeGlowIntensity'),
      eyeGlowRadius:            gl.getUniformLocation(sceneProg, 'uEyeGlowRadius'),
      eyeGlowHue:               gl.getUniformLocation(sceneProg, 'uEyeGlowHue'),
      bgIntensity:              gl.getUniformLocation(sceneProg, 'uBgIntensity'),
      bgSpeed:                  gl.getUniformLocation(sceneProg, 'uBgSpeed'),
      beatReactivity:           gl.getUniformLocation(sceneProg, 'uBeatReactivity'),
      lensCenter:               gl.getUniformLocation(sceneProg, 'uLensCenter'),
      lensRadius:               gl.getUniformLocation(sceneProg, 'uLensRadius'),
      lensOpacity:              gl.getUniformLocation(sceneProg, 'uLensOpacity'),
      lensIOR:                  gl.getUniformLocation(sceneProg, 'uLensIOR'),
      lensHue:                  gl.getUniformLocation(sceneProg, 'uLensHue'),
      lensSpecularPower:        gl.getUniformLocation(sceneProg, 'uLensSpecularPower'),
      lensSpecularIntensity:    gl.getUniformLocation(sceneProg, 'uLensSpecularIntensity'),
      lensFresnelExponent:      gl.getUniformLocation(sceneProg, 'uLensFresnelExponent'),
      lensFresnelIntensity:     gl.getUniformLocation(sceneProg, 'uLensFresnelIntensity'),
      lensReflectivity:         gl.getUniformLocation(sceneProg, 'uLensReflectivity'),
      lensChromaticAberration:  gl.getUniformLocation(sceneProg, 'uLensChromaticAberration'),
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

    // Build 320×200 RGBA texture from the indexed KOE picture + palette
    const pal  = b64ToUint8(LENS_PAL_B64);
    const back = b64ToUint8(LENS_PIX_B64);
    const k = 255 / 63;

    const rgba = new Uint8Array(BG_W * BG_H * 4);
    for (let i = 0; i < BG_W * BG_H; i++) {
      const ci = back[i];
      rgba[i * 4]     = Math.round(pal[ci * 3]     * k);
      rgba[i * 4 + 1] = Math.round(pal[ci * 3 + 1] * k);
      rgba[i * 4 + 2] = Math.round(pal[ci * 3 + 2] * k);
      rgba[i * 4 + 3] = 255;
    }

    koeBgTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, koeBgTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, BG_W, BG_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

    // ── Bouncing physics ─────────────────────────────────────────

    const frame = Math.floor(t * FRAME_RATE);
    const pos = computeLensPosition(frame);

    // Normalized lens center and radius for the shader (in screen UV space)
    const lcx = pos.x / BG_W;
    const lcy = 1.0 - pos.y / BG_H;
    const lrx = LENS_RX / BG_W;
    const lry = LENS_RY / BG_H;

    // Lens opacity fade-in (frames 32–96)
    let lensOpacity = 1.0;
    if (frame < 32) lensOpacity = 0.0;
    else if (frame < 96) lensOpacity = clamp((frame - 32) / 64, 0, 1);

    // ── Pass 1: Scene → sceneFBO ─────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, koeBgTexture);
    gl.uniform1i(su.tex, 0);

    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);

    gl.uniform1f(su.hueShift,          p('hueShift', 0));
    gl.uniform1f(su.saturationBoost,   p('saturationBoost', 0.11));
    gl.uniform1f(su.brightness,        p('brightness', 0.77));
    gl.uniform1f(su.eyeGlowIntensity,  p('eyeGlowIntensity', 0.22));
    gl.uniform1f(su.eyeGlowRadius,     p('eyeGlowRadius', 0.05));
    gl.uniform1f(su.eyeGlowHue,        p('eyeGlowHue', 6));
    gl.uniform1f(su.bgIntensity,       p('bgIntensity', 0.27));
    gl.uniform1f(su.bgSpeed,           p('bgSpeed', 0.50));
    gl.uniform1f(su.beatReactivity,    p('beatReactivity', 0.40));

    gl.uniform2f(su.lensCenter, lcx, lcy);
    gl.uniform2f(su.lensRadius, lrx, lry);
    gl.uniform1f(su.lensOpacity, lensOpacity);
    gl.uniform1f(su.lensIOR,                  p('lensIOR', 1.45));
    gl.uniform1f(su.lensHue,                  p('lensHue', 0));
    gl.uniform1f(su.lensSpecularPower,        p('lensSpecularPower', 57));
    gl.uniform1f(su.lensSpecularIntensity,    p('lensSpecularIntensity', 0.35));
    gl.uniform1f(su.lensFresnelExponent,      p('lensFresnelExponent', 1.2));
    gl.uniform1f(su.lensFresnelIntensity,     p('lensFresnelIntensity', 0.25));
    gl.uniform1f(su.lensReflectivity,         p('lensReflectivity', 0.09));
    gl.uniform1f(su.lensChromaticAberration,  p('lensChromaticAberration', 0.8));

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
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.20));
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
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.50));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.40));
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.08));
    quad.draw();
  },

  destroy(gl) {
    if (sceneProg)        gl.deleteProgram(sceneProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg)         gl.deleteProgram(blurProg);
    if (compositeProg)    gl.deleteProgram(compositeProg);
    if (quad)             quad.destroy();
    if (koeBgTexture)     gl.deleteTexture(koeBgTexture);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null; koeBgTexture = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
  },
};
