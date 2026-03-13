/**
 * LENS_ROTO — Remastered variant (Part 15)
 *
 * GPU-native rotozoom at display resolution with bilinear filtering,
 * shader-based lens material (specular, fresnel, reflection), animated
 * eye glow, procedural background, and dual-tier bloom post-processing.
 *
 * The rotozoom animation (rotation angle, scale, offset) is identical
 * to the classic variant — pre-computed per-frame arrays guarantee
 * frame-perfect choreography sync. The shader replaces the CPU sampling
 * loop with a linear UV transform and hardware texture lookup.
 *
 * Original code: LENS/MAIN.C part3() + ASM.ASM _rotate by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { LENS_PAL_B64, LENS_PIX_B64 } from '../lens/data.js';
import { gp } from '../index.js';

const FRAME_RATE = 70;
const W = 160, H = 100;
const ASPECT_RATIO = 307 / 256;

// Eye center positions in 256×256 normalized UV space (empirically measured)
const EYE_LEFT_U  = 98.2  / 256;
const EYE_LEFT_V  = 138.9 / 256;
const EYE_RIGHT_U = 169.3 / 256;
const EYE_RIGHT_V = 138.9 / 256;

// ── Shaders ──────────────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uTex;
uniform float uTime;
uniform float uBeat;
uniform float uFade;

// Rotozoom transform: texUV = uBase + vUV.x * uSpanX + fy * uSpanY
uniform vec2 uBase;
uniform vec2 uSpanX;
uniform vec2 uSpanY;

// Palette / color
uniform float uHueShift;
uniform float uSaturationBoost;
uniform float uBrightness;

// Lens material
uniform float uSpecularPower;
uniform float uSpecularIntensity;
uniform float uFresnelExponent;
uniform float uFresnelIntensity;
uniform float uReflectivity;

// Eye glow
uniform float uEyeGlowIntensity;
uniform float uEyeGlowRadius;
uniform float uEyeGlowHue;
uniform float uBeatReactivity;

// Background
uniform float uBgIntensity;
uniform float uBgSpeed;

#define PI  3.14159265359
#define TAU 6.28318530718

// ── Noise (value noise, 3 octave FBM) ────────────────────────────

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

// ── Toroidal distance (handles texture wrap) ─────────────────────

float toroidalDist(vec2 a, vec2 b) {
  vec2 d = abs(a - b);
  d = min(d, 1.0 - d);
  return length(d);
}

void main() {
  float fy = 1.0 - vUV.y;
  vec2 texCoord = uBase + vUV.x * uSpanX + fy * uSpanY;
  vec2 texUV = texCoord / 256.0;

  // ── Background: procedural nebula ──────────────────────────────

  float t = uTime * uBgSpeed;
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;

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

  // ── Rotozoom sample (bilinear via hardware) ────────────────────

  vec3 img = texture(uTex, texUV).rgb;

  // ── Color grading ──────────────────────────────────────────────

  if (uHueShift != 0.0) {
    img = hueRotate(img, uHueShift * TAU / 360.0);
  }
  if (uSaturationBoost != 0.0) {
    img = boostSaturation(img, uSaturationBoost);
  }
  img *= uBrightness;

  // Blend background through dark areas of the image
  float imgLuma = dot(img, vec3(0.299, 0.587, 0.114));
  vec3 color = mix(bg, img, clamp(imgLuma * 4.0 + 0.15, 0.0, 1.0));

  // ── Lens material: specular + fresnel ──────────────────────────

  vec2 sc = vUV * 2.0 - 1.0;
  float r2 = dot(sc, sc);
  float sphereMask = smoothstep(1.0, 0.85, sqrt(r2));

  if (r2 < 1.0) {
    float nz = sqrt(1.0 - r2);
    vec3 N = normalize(vec3(sc, nz));
    vec3 V = vec3(0.0, 0.0, 1.0);
    vec3 L = normalize(vec3(0.3, 0.5, 1.0));
    vec3 halfV = normalize(L + V);

    float NdH = max(dot(N, halfV), 0.0);
    float spec = pow(NdH, uSpecularPower) * uSpecularIntensity;
    color += vec3(1.0, 0.98, 0.95) * spec * sphereMask;

    float NdV = max(dot(N, V), 0.0);
    float fresnel = pow(1.0 - NdV, uFresnelExponent) * uFresnelIntensity;
    color += vec3(0.4, 0.5, 0.7) * fresnel * sphereMask;

    // Subtle procedural environment reflection
    vec3 R = reflect(-V, N);
    float envNoise = fbm(R.xy * 2.0 + uTime * 0.1);
    vec3 envColor = mix(vec3(0.1, 0.15, 0.3), vec3(0.3, 0.2, 0.4), envNoise);
    color = mix(color, envColor, uReflectivity * sphereMask * (1.0 - NdV));
  }

  // ── Eye glow ───────────────────────────────────────────────────

  vec2 wrappedUV = fract(texUV);
  vec2 eyeL = vec2(${EYE_LEFT_U.toFixed(6)}, ${EYE_LEFT_V.toFixed(6)});
  vec2 eyeR = vec2(${EYE_RIGHT_U.toFixed(6)}, ${EYE_RIGHT_V.toFixed(6)});

  float dL = toroidalDist(wrappedUV, eyeL);
  float dR = toroidalDist(wrappedUV, eyeR);

  float glowL = exp(-dL * dL / (uEyeGlowRadius * uEyeGlowRadius));
  float glowR = exp(-dR * dR / (uEyeGlowRadius * uEyeGlowRadius));
  float glow = (glowL + glowR) * uEyeGlowIntensity;
  glow *= 1.0 + beatPulse * 1.5;

  vec3 glowColor = hsl2rgb(uEyeGlowHue / 360.0);
  color += glowColor * glow;

  // ── Fade to/from white ─────────────────────────────────────────

  color = mix(color, vec3(1.0), uFade);

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

// ── Animation (identical to classic) ─────────────────────────────

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

let animD1, animD2, animScale, animFade;

function computeAnimParams() {
  let d1 = 0, d2 = 0.00007654321, d3 = 0;
  let scale = 2, scalea = -0.01;
  const maxFrames = 2001;

  animD1    = new Float64Array(maxFrames);
  animD2    = new Float64Array(maxFrames);
  animScale = new Float64Array(maxFrames);
  animFade  = new Float64Array(maxFrames);

  for (let f = 0; f <= 2000; f++) {
    d1 -= 0.005;
    d2 += d3;
    scale += scalea;

    if (f > 25)   { if (d3 < 0.02) d3 += 0.00005; }
    if (f < 270)  { if (scale < 0.9) { if (scalea < 1) scalea += 0.0001; } }
    else if (f < 400)  { if (scalea > 0.001)  scalea -= 0.0001; }
    else if (f > 1600) { if (scalea > -0.1)   scalea -= 0.001; }
    else if (f > 1100) {
      let a = f - 900; if (a > 100) a = 100;
      if (scalea < 256) scalea += 0.000001 * a;
    }

    let fade = 0;
    if (f > 2000 - 128) fade = clamp((f - (2000 - 128)) / 128, 0, 1);
    else if (f < 16)    fade = 1 - clamp(f / 15, 0, 1);

    animD1[f]    = d1;
    animD2[f]    = d2;
    animScale[f] = scale;
    animFade[f]  = fade;
  }
}

function interpolate(arr, frame) {
  const f = clamp(frame, 0, arr.length - 2);
  const lo = Math.floor(f);
  const hi = Math.min(lo + 1, arr.length - 1);
  const t = f - lo;
  return arr[lo] * (1 - t) + arr[hi] * t;
}

// ── Module state ─────────────────────────────────────────────────

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad, koeTexture;
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
  label: 'rotozoom (remastered)',

  params: [
    gp('Palette',         { key: 'hueShift',          label: 'Hue Shift',            type: 'float', min: 0,    max: 360,  step: 1,    default: 0 }),
    gp('Palette',         { key: 'saturationBoost',   label: 'Saturation',            type: 'float', min: -0.5, max: 1,    step: 0.01, default: 0.15 }),
    gp('Palette',         { key: 'brightness',        label: 'Brightness',            type: 'float', min: 0.5,  max: 2,    step: 0.01, default: 1.1 }),
    gp('Lens',            { key: 'specularPower',     label: 'Specular Power',        type: 'float', min: 2,    max: 128,  step: 1,    default: 32 }),
    gp('Lens',            { key: 'specularIntensity', label: 'Specular Intensity',    type: 'float', min: 0,    max: 1.5,  step: 0.01, default: 0.4 }),
    gp('Lens',            { key: 'fresnelExponent',   label: 'Fresnel Exponent',      type: 'float', min: 0.5,  max: 5,    step: 0.1,  default: 2.0 }),
    gp('Lens',            { key: 'fresnelIntensity',  label: 'Fresnel Intensity',     type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.25 }),
    gp('Lens',            { key: 'reflectivity',      label: 'Reflectivity',          type: 'float', min: 0,    max: 0.5,  step: 0.01, default: 0.1 }),
    gp('Eyes',            { key: 'eyeGlowIntensity',  label: 'Eye Glow',              type: 'float', min: 0,    max: 3,    step: 0.01, default: 1.0 }),
    gp('Eyes',            { key: 'eyeGlowRadius',     label: 'Glow Radius',           type: 'float', min: 0.01, max: 0.15, step: 0.005,default: 0.05 }),
    gp('Eyes',            { key: 'eyeGlowHue',        label: 'Glow Color',            type: 'float', min: 0,    max: 360,  step: 1,    default: 45 }),
    gp('Background',      { key: 'bgIntensity',       label: 'Background Intensity',  type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.3 }),
    gp('Background',      { key: 'bgSpeed',           label: 'Background Speed',      type: 'float', min: 0.1,  max: 2,    step: 0.01, default: 0.5 }),
    gp('Post-Processing', { key: 'bloomThreshold',    label: 'Bloom Threshold',       type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.2 }),
    gp('Post-Processing', { key: 'bloomStrength',     label: 'Bloom Strength',        type: 'float', min: 0,    max: 2,    step: 0.01, default: 0.5 }),
    gp('Post-Processing', { key: 'beatReactivity',    label: 'Beat Reactivity',       type: 'float', min: 0,    max: 1,    step: 0.01, default: 0.4 }),
    gp('Post-Processing', { key: 'scanlineStr',       label: 'Scanlines',             type: 'float', min: 0,    max: 0.5,  step: 0.01, default: 0.02 }),
  ],

  init(gl) {
    sceneProg        = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg         = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg    = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    // Cache uniform locations
    su = {
      tex:               gl.getUniformLocation(sceneProg, 'uTex'),
      time:              gl.getUniformLocation(sceneProg, 'uTime'),
      beat:              gl.getUniformLocation(sceneProg, 'uBeat'),
      fade:              gl.getUniformLocation(sceneProg, 'uFade'),
      base:              gl.getUniformLocation(sceneProg, 'uBase'),
      spanX:             gl.getUniformLocation(sceneProg, 'uSpanX'),
      spanY:             gl.getUniformLocation(sceneProg, 'uSpanY'),
      hueShift:          gl.getUniformLocation(sceneProg, 'uHueShift'),
      saturationBoost:   gl.getUniformLocation(sceneProg, 'uSaturationBoost'),
      brightness:        gl.getUniformLocation(sceneProg, 'uBrightness'),
      specularPower:     gl.getUniformLocation(sceneProg, 'uSpecularPower'),
      specularIntensity: gl.getUniformLocation(sceneProg, 'uSpecularIntensity'),
      fresnelExponent:   gl.getUniformLocation(sceneProg, 'uFresnelExponent'),
      fresnelIntensity:  gl.getUniformLocation(sceneProg, 'uFresnelIntensity'),
      reflectivity:      gl.getUniformLocation(sceneProg, 'uReflectivity'),
      eyeGlowIntensity:  gl.getUniformLocation(sceneProg, 'uEyeGlowIntensity'),
      eyeGlowRadius:     gl.getUniformLocation(sceneProg, 'uEyeGlowRadius'),
      eyeGlowHue:        gl.getUniformLocation(sceneProg, 'uEyeGlowHue'),
      beatReactivity:    gl.getUniformLocation(sceneProg, 'uBeatReactivity'),
      bgIntensity:       gl.getUniformLocation(sceneProg, 'uBgIntensity'),
      bgSpeed:           gl.getUniformLocation(sceneProg, 'uBgSpeed'),
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

    // Build 256×256 RGBA texture from the indexed KOE picture + palette
    const pal  = b64ToUint8(LENS_PAL_B64);
    const back = b64ToUint8(LENS_PIX_B64);
    const k = 255 / 63;

    const rotpic = new Uint8Array(256 * 256);
    for (let x = 0; x < 256; x++) {
      for (let y = 0; y < 256; y++) {
        let a = Math.floor(y * 10 / 11 - 36 / 2);
        if (a < 0 || a > 199) a = 0;
        const srcIdx = (x + 32) + a * 320;
        rotpic[x + y * 256] = srcIdx < back.length ? back[srcIdx] : 0;
      }
    }

    const rgba = new Uint8Array(256 * 256 * 4);
    for (let i = 0; i < 256 * 256; i++) {
      const ci = rotpic[i];
      rgba[i * 4]     = Math.round(pal[ci * 3]     * k);
      rgba[i * 4 + 1] = Math.round(pal[ci * 3 + 1] * k);
      rgba[i * 4 + 2] = Math.round(pal[ci * 3 + 2] * k);
      rgba[i * 4 + 3] = 255;
    }

    koeTexture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, koeTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 256, 256, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);

    computeAnimParams();
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;

    // Resize FBOs if needed
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

    // ── Compute rotozoom animation (same physics as classic) ──────

    const frame = t * FRAME_RATE;
    const d1    = interpolate(animD1, frame);
    const d2    = interpolate(animD2, frame);
    const scale = interpolate(animScale, frame);
    const fade  = interpolate(animFade, frame);

    const sinD2 = Math.sin(d2);
    const cosD2 = Math.cos(d2);

    const npU = cosD2 * scale;
    const npV = sinD2 * scale;
    const nlU = -npV * ASPECT_RATIO;
    const nlV = npU * ASPECT_RATIO;

    const startX = 70.0 * Math.sin(d1) - 30 + 64.0 * sinD2 * scale;
    const startY = 70.0 * Math.cos(d1) + 60 - 64.0 * cosD2 * scale;

    const baseU = startX + nlU + npU;
    const baseV = startY + nlV + npV;

    // ── Pass 1: Scene → sceneFBO ─────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, koeTexture);
    gl.uniform1i(su.tex, 0);

    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);
    gl.uniform1f(su.fade, fade);

    gl.uniform2f(su.base, baseU, baseV);
    gl.uniform2f(su.spanX, W * npU, W * npV);
    gl.uniform2f(su.spanY, H * nlU, H * nlV);

    gl.uniform1f(su.hueShift,          p('hueShift', 0));
    gl.uniform1f(su.saturationBoost,   p('saturationBoost', 0.15));
    gl.uniform1f(su.brightness,        p('brightness', 1.1));
    gl.uniform1f(su.specularPower,     p('specularPower', 32));
    gl.uniform1f(su.specularIntensity, p('specularIntensity', 0.4));
    gl.uniform1f(su.fresnelExponent,   p('fresnelExponent', 2.0));
    gl.uniform1f(su.fresnelIntensity,  p('fresnelIntensity', 0.25));
    gl.uniform1f(su.reflectivity,      p('reflectivity', 0.1));
    gl.uniform1f(su.eyeGlowIntensity,  p('eyeGlowIntensity', 1.0));
    gl.uniform1f(su.eyeGlowRadius,     p('eyeGlowRadius', 0.05));
    gl.uniform1f(su.eyeGlowHue,        p('eyeGlowHue', 45));
    gl.uniform1f(su.beatReactivity,    p('beatReactivity', 0.4));
    gl.uniform1f(su.bgIntensity,       p('bgIntensity', 0.3));
    gl.uniform1f(su.bgSpeed,           p('bgSpeed', 0.5));

    quad.draw();

    // ── Pass 2: Bloom pipeline ───────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    // Tight bloom: extract brights at half-res
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.2));
    quad.draw();

    // 3 passes of H+V Gaussian blur
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

    // Wide bloom: downsample to quarter-res + blur
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
    if (sceneProg)        gl.deleteProgram(sceneProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg)         gl.deleteProgram(blurProg);
    if (compositeProg)    gl.deleteProgram(compositeProg);
    if (quad)             quad.destroy();
    if (koeTexture)       gl.deleteTexture(koeTexture);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null; koeTexture = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    animD1 = animD2 = animScale = animFade = null;
  },
};
