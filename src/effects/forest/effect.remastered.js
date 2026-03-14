/**
 * FOREST — Remastered variant (Part 12)
 *
 * The original mountain text scroller reimagined with:
 * - Procedural animated cenote water background (crystal-clear blue/emerald)
 * - Undulating foliage shadows that sway like underwater plants
 * - Text hue shift control
 * - Bloom post-processing
 *
 * CPU-side POS-table text mapping is preserved from the classic — the position
 * lookup tables encode arbitrary pixel-to-pixel mappings that can't easily move
 * to GPU. All visual enhancement is GPU-driven via a fragment shader that
 * composites three layers: procedural cenote water, foliage shadows with UV
 * distortion, and the POS-mapped text with configurable hue rotation.
 *
 * Original code: FOREST/MAIN2.PAS + ROUTINES.ASM by TRUG.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import {
  FONT_W, FONT_H, BG_W, BG_H,
  FONT_B64, PAL_B64, HBACK_B64,
  POS1_B64, POS2_B64, POS3_B64,
} from './data.js';
import { gp } from '../index.js';

const W = BG_W, H = BG_H, PIXELS = W * H;
const FRAME_RATE = 70;
const FONT_VIEW_W = 237;
const FONT_VIEW_H = 30;
const INITIAL_SCP = 133;

// ── Shaders ──────────────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform float uFade;
uniform float uFadeLeaves;
uniform float uFadeFull;
uniform vec2 uResolution;

uniform sampler2D uTextLayer;
uniform sampler2D uFoliageTex;

uniform float uHueShift;
uniform float uWaterSpeed;
uniform float uWaterDepth;
uniform float uCausticIntensity;
uniform float uWaterBrightness;
uniform float uWaterHue;
uniform float uFoliageSway;
uniform float uFoliageSwaySpeed;
uniform float uFoliageOpacity;
uniform float uShadowOffsetX;
uniform float uShadowOffsetY;
uniform float uTextBrightness;

#define PI 3.14159265

// ── Noise ────────────────────────────────────────────────────────

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float hash21(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float valueNoise(vec2 p) {
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
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    val += amp * valueNoise(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

// ── Caustic pattern (Voronoi-based) ──────────────────────────────

float caustic(vec2 uv, float time) {
  vec2 p = uv * 8.0;
  float t = time * 0.3;
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cell = floor(p) + neighbor;
      vec2 point = hash22(cell);
      point = 0.5 + 0.5 * sin(t * 0.8 + 6.2831 * point);
      float d = length(fract(p) - neighbor - point);
      minDist = min(minDist, d);
    }
  }
  return smoothstep(0.0, 0.4, minDist);
}

// ── HSV conversion ───────────────────────────────────────────────

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

// ── Main ─────────────────────────────────────────────────────────

void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);
  float aspect = uResolution.x / uResolution.y;

  vec2 centered = (uv - 0.5) * vec2(aspect, 1.0);
  float radialDist = length(centered);

  float t = uTime * uWaterSpeed;

  // ── 1. Cenote water background ──────────────────────────────

  // Large-scale UV warping for deep-water movement
  vec2 warp;
  warp.x = sin(uv.y * 2.5 + t * 0.4) * 0.025 + sin(uv.y * 5.0 - t * 0.7) * 0.012;
  warp.y = sin(uv.x * 3.0 - t * 0.35) * 0.02  + sin(uv.x * 6.0 + t * 0.6) * 0.01;
  vec2 distortedUV = uv + warp;

  // Multi-scale noise layers for visible texture
  float n1 = fbm(distortedUV * 3.5 + vec2(t * 0.12, t * 0.08));
  float n2 = fbm(distortedUV * 7.0 - vec2(t * 0.1, -t * 0.06));
  float n3 = valueNoise(distortedUV * 14.0 + vec2(t * 0.3, -t * 0.2));
  float n4 = valueNoise(distortedUV * 28.0 - vec2(-t * 0.25, t * 0.35));
  float waterPattern = n1 * 0.4 + n2 * 0.3 + n3 * 0.2 + n4 * 0.1;

  // Ripple ridges — sharp concentric-ish waves across the surface
  float ridge1 = pow(0.5 + 0.5 * sin(distortedUV.x * 18.0 + distortedUV.y * 12.0 + t * 1.8), 4.0);
  float ridge2 = pow(0.5 + 0.5 * sin(distortedUV.x * 14.0 - distortedUV.y * 20.0 - t * 1.3), 4.0);
  float ridges = (ridge1 + ridge2) * 0.15;

  // Cenote palette: crystal-clear turquoise / emerald
  vec3 deepColor    = vec3(0.005, 0.04, 0.10);
  vec3 midColor     = vec3(0.015, 0.15, 0.24);
  vec3 brightColor  = vec3(0.06, 0.38, 0.34);
  vec3 surfaceColor = vec3(0.12, 0.52, 0.46);

  float centerLight = 1.0 - smoothstep(0.0, 0.85, radialDist);
  centerLight = centerLight * centerLight;

  float depthFactor = mix(0.25, 0.85, centerLight) * uWaterDepth;
  vec3 waterColor = mix(deepColor, midColor, depthFactor);
  waterColor = mix(waterColor, brightColor, centerLight * 0.65);
  waterColor = mix(waterColor, surfaceColor, centerLight * centerLight * 0.35);

  // Noise-driven color variation (much stronger than before)
  waterColor += (waterPattern - 0.45) * 0.18;
  waterColor += ridges * vec3(0.06, 0.14, 0.12) * (0.4 + centerLight * 0.6);

  // Caustics
  float caust = caustic(distortedUV, uTime);
  float caustHighlight = pow(caust, 1.8) * uCausticIntensity * (0.3 + centerLight * 0.7);
  waterColor += vec3(0.04, 0.13, 0.10) * caustHighlight;

  // Specular ripple sparkle
  float sparkle = pow(max(0.0,
    sin(distortedUV.x * 24.0 + t * 2.5) *
    sin(distortedUV.y * 18.0 - t * 1.8)), 12.0);
  waterColor += vec3(0.15, 0.25, 0.22) * sparkle * centerLight * 0.5;

  // Apply water hue shift
  if (uWaterHue > 0.001) {
    vec3 wHsv = rgb2hsv(waterColor);
    wHsv.x = fract(wHsv.x + uWaterHue / 360.0);
    waterColor = hsv2rgb(wHsv);
  }

  waterColor *= uWaterBrightness;

  float waterVis = max(0.15 * uFadeLeaves, uFadeFull);
  vec3 color = waterColor * waterVis;

  // ── 2a. Foliage shadow (undulates on the water) ─────────────
  // Base offset in a consistent light direction + time-varying undulation

  vec2 baseOffset = vec2(uShadowOffsetX, uShadowOffsetY) * 0.01;
  float undulX = sin(uv.y * 5.0 + uTime * uFoliageSwaySpeed * 0.8) * uFoliageSway * 0.005
               + sin(uv.y * 11.0 + uTime * uFoliageSwaySpeed * 1.4 + 1.0) * uFoliageSway * 0.002;
  float undulY = sin(uv.x * 4.0 + uTime * uFoliageSwaySpeed * 0.5) * uFoliageSway * 0.003;
  vec2 shadowUV = uv + baseOffset + vec2(undulX, undulY);

  float shadowMask = texture(uFoliageTex, shadowUV).a;
  float shadowStr = shadowMask * uFadeLeaves * uFoliageOpacity * 0.55;
  color *= 1.0 - shadowStr;

  // ── 2b. Foliage artwork (static) ──────────────────────────

  vec4 foliageSample = texture(uFoliageTex, uv);
  float foliageStr = foliageSample.a * uFadeLeaves;
  color = mix(color, foliageSample.rgb, foliageStr);

  // ── 3. Text layer with hue shift ────────────────────────────

  vec4 textSample = texture(uTextLayer, uv);
  float textAlpha = textSample.a;

  if (textAlpha > 0.01) {
    vec3 textColor = textSample.rgb;

    if (uHueShift > 0.001) {
      vec3 hsv = rgb2hsv(textColor);
      hsv.x = fract(hsv.x + uHueShift / 360.0);
      textColor = hsv2rgb(hsv);
    }

    color += textColor * textAlpha * uFadeFull * uTextBrightness;
  }

  // ── 4. Global fade ──────────────────────────────────────────

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
uniform float uBloomTightStr;
uniform float uBloomWideStr;
uniform float uBeatBloom;
uniform float uBeat;
uniform float uScanlineStr;
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 6.0);
  vec3 color = scene
    + tight * (uBloomTightStr + beatPulse * uBeatBloom)
    + wide  * (uBloomWideStr  + beatPulse * uBeatBloom * 0.6);
  float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;
  fragColor = vec4(color, 1.0);
}
`;

// ── Helpers ──────────────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

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

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let textLayerTex, foliageTex;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let su = {}, beu = {}, blu = {}, cu = {};

let fbuf, pal, hback, posData;
let textRGBA;

// ── CPU-side POS-table text mapping ──────────────────────────────

function buildTextLayer(frame) {
  textRGBA.fill(0);

  const scrollSteps = Math.floor(frame / 3);
  const font = new Uint8Array(FONT_VIEW_W * FONT_VIEW_H);
  let scp = INITIAL_SCP + scrollSteps;
  if (scp > FONT_W - 1) scp = FONT_W - 1;

  const srcStart = scp - FONT_VIEW_W + 1;
  for (let row = 0; row < FONT_VIEW_H; row++) {
    for (let col = 0; col < FONT_VIEW_W; col++) {
      const srcCol = srcStart + col;
      if (srcCol >= 0 && srcCol < FONT_W) {
        font[row * FONT_VIEW_W + col] = fbuf[row * FONT_W + srcCol];
      }
    }
  }

  const textContrib = new Uint8Array(PIXELS);
  for (let pass = 0; pass < 3; pass++) {
    scrTextOnly(pass, font, textContrib);
  }

  const k = 255 / 63;
  const rgba32 = new Uint32Array(textRGBA.buffer);
  for (let i = 0; i < PIXELS; i++) {
    const fontPix = textContrib[i];
    if (fontPix > 0) {
      const compositeIdx = Math.min(255, hback[i] + fontPix);
      const r = Math.round(clamp(pal[compositeIdx * 3], 0, 63) * k);
      const g = Math.round(clamp(pal[compositeIdx * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(pal[compositeIdx * 3 + 2], 0, 63) * k);
      rgba32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }
  }
}

function scrTextOnly(pass, font, textContrib) {
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
          const fontPix = font[fontIdx];
          if (fontPix > 0) {
            textContrib[dest] = fontPix;
          }
        }
      }
    }
    fontIdx++;
  }
}

// ── Static texture builders ──────────────────────────────────────

function buildFoliageTexture(gl) {
  const rgba = new Uint8Array(PIXELS * 4);
  const k = 255 / 63;
  for (let i = 0; i < PIXELS; i++) {
    const idx = hback[i];
    const isFoliage = (idx >= 32 && idx < 128) || idx >= 160;
    if (isFoliage) {
      rgba[i * 4]     = Math.round(clamp(pal[idx * 3], 0, 63) * k);
      rgba[i * 4 + 1] = Math.round(clamp(pal[idx * 3 + 1], 0, 63) * k);
      rgba[i * 4 + 2] = Math.round(clamp(pal[idx * 3 + 2], 0, 63) * k);
      rgba[i * 4 + 3] = 255;
    }
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── Effect module ────────────────────────────────────────────────

export default {
  label: 'forest (remastered)',

  params: [
    gp('Text', { key: 'hueShift', label: 'Hue Shift', type: 'float', min: 0, max: 360, step: 1, default: 70 }),
    gp('Text', { key: 'textBrightness', label: 'Brightness', type: 'float', min: 0.3, max: 3.0, step: 0.05, default: 0.75 }),

    gp('Water', { key: 'waterSpeed', label: 'Undulation Speed', type: 'float', min: 0.1, max: 3.0, step: 0.05, default: 0.8 }),
    gp('Water', { key: 'waterDepth', label: 'Depth', type: 'float', min: 0.1, max: 1.5, step: 0.05, default: 1.0 }),
    gp('Water', { key: 'causticIntensity', label: 'Caustic Intensity', type: 'float', min: 0, max: 2.0, step: 0.05, default: 0.35 }),
    gp('Water', { key: 'waterBrightness', label: 'Brightness', type: 'float', min: 0.3, max: 3.0, step: 0.05, default: 1.2 }),
    gp('Water', { key: 'waterHue', label: 'Hue Shift', type: 'float', min: 0, max: 360, step: 1, default: 39 }),

    gp('Foliage', { key: 'foliageSway', label: 'Shadow Undulation', type: 'float', min: 0, max: 5.0, step: 0.1, default: 1.5 }),
    gp('Foliage', { key: 'foliageSwaySpeed', label: 'Undulation Speed', type: 'float', min: 0.1, max: 4.0, step: 0.1, default: 1.2 }),
    gp('Foliage', { key: 'foliageOpacity', label: 'Shadow Opacity', type: 'float', min: 0, max: 1.0, step: 0.01, default: 0.85 }),
    gp('Foliage', { key: 'shadowOffsetX', label: 'Shadow Offset X', type: 'float', min: -5.0, max: 5.0, step: 0.1, default: 1.5 }),
    gp('Foliage', { key: 'shadowOffsetY', label: 'Shadow Offset Y', type: 'float', min: -5.0, max: 5.0, step: 0.1, default: 2.0 }),

    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1, step: 0.01, default: 0.4 }),
    gp('Post-Processing', { key: 'bloomTightStr', label: 'Bloom Tight', type: 'float', min: 0, max: 3, step: 0.01, default: 0.35 }),
    gp('Post-Processing', { key: 'bloomWideStr', label: 'Bloom Wide', type: 'float', min: 0, max: 3, step: 0.01, default: 0.25 }),
    gp('Post-Processing', { key: 'scanlineStr', label: 'Scanlines', type: 'float', min: 0, max: 0.5, step: 0.01, default: 0.02 }),
    gp('Post-Processing', { key: 'beatBloom', label: 'Beat Bloom', type: 'float', min: 0, max: 1.5, step: 0.01, default: 0.3 }),
  ],

  init(gl) {
    fbuf = b64ToUint8(FONT_B64);
    pal = b64ToUint8(PAL_B64);
    hback = b64ToUint8(HBACK_B64);
    posData = [b64ToUint8(POS1_B64), b64ToUint8(POS2_B64), b64ToUint8(POS3_B64)];
    textRGBA = new Uint8Array(PIXELS * 4);

    sceneProg = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    foliageTex = buildFoliageTexture(gl);

    textLayerTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, textLayerTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    su = {
      time: gl.getUniformLocation(sceneProg, 'uTime'),
      beat: gl.getUniformLocation(sceneProg, 'uBeat'),
      fade: gl.getUniformLocation(sceneProg, 'uFade'),
      fadeLeaves: gl.getUniformLocation(sceneProg, 'uFadeLeaves'),
      fadeFull: gl.getUniformLocation(sceneProg, 'uFadeFull'),
      resolution: gl.getUniformLocation(sceneProg, 'uResolution'),
      textLayer: gl.getUniformLocation(sceneProg, 'uTextLayer'),
      foliageTex: gl.getUniformLocation(sceneProg, 'uFoliageTex'),
      hueShift: gl.getUniformLocation(sceneProg, 'uHueShift'),
      waterSpeed: gl.getUniformLocation(sceneProg, 'uWaterSpeed'),
      waterDepth: gl.getUniformLocation(sceneProg, 'uWaterDepth'),
      causticIntensity: gl.getUniformLocation(sceneProg, 'uCausticIntensity'),
      waterBrightness: gl.getUniformLocation(sceneProg, 'uWaterBrightness'),
      waterHue: gl.getUniformLocation(sceneProg, 'uWaterHue'),
      foliageSway: gl.getUniformLocation(sceneProg, 'uFoliageSway'),
      foliageSwaySpeed: gl.getUniformLocation(sceneProg, 'uFoliageSwaySpeed'),
      foliageOpacity: gl.getUniformLocation(sceneProg, 'uFoliageOpacity'),
      shadowOffsetX: gl.getUniformLocation(sceneProg, 'uShadowOffsetX'),
      shadowOffsetY: gl.getUniformLocation(sceneProg, 'uShadowOffsetY'),
      textBrightness: gl.getUniformLocation(sceneProg, 'uTextBrightness'),
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
      bloomTightStr: gl.getUniformLocation(compositeProg, 'uBloomTightStr'),
      bloomWideStr: gl.getUniformLocation(compositeProg, 'uBloomWideStr'),
      beatBloom: gl.getUniformLocation(compositeProg, 'uBeatBloom'),
      beat: gl.getUniformLocation(compositeProg, 'uBeat'),
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
      sceneFBO = createFBO(gl, sw, sh);
      bloomFBO1 = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2 = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    const frame = Math.floor(t * FRAME_RATE);

    const totalFrames = Math.floor(28.9 * FRAME_RATE);
    const fadeInLeaves = 63;
    const fadeInFull = 128;
    const fadeOutStart = totalFrames - 63;

    let fade = 1.0;
    let fadeLeaves = 1.0;
    let fadeFull = 1.0;

    if (frame < fadeInLeaves) {
      fadeLeaves = frame / 63;
      fadeFull = 0.0;
      fade = 1.0;
    } else if (frame < fadeInLeaves + fadeInFull) {
      fadeLeaves = 1.0;
      fadeFull = clamp((frame - fadeInLeaves) / fadeInFull, 0, 1);
      fade = 1.0;
    } else if (frame >= fadeOutStart) {
      fade = clamp(1 - (frame - fadeOutStart) / 63, 0, 1);
    }

    // ── CPU: build text layer ────────────────────────────────────

    buildTextLayer(frame);

    gl.bindTexture(gl.TEXTURE_2D, textLayerTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, textRGBA);

    // ── GPU: scene pass ──────────────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, textLayerTex);
    gl.uniform1i(su.textLayer, 0);

    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, foliageTex);
    gl.uniform1i(su.foliageTex, 1);

    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);
    gl.uniform1f(su.fade, fade);
    gl.uniform1f(su.fadeLeaves, fadeLeaves);
    gl.uniform1f(su.fadeFull, fadeFull);
    gl.uniform2f(su.resolution, sw, sh);

    gl.uniform1f(su.hueShift, p('hueShift', 70));
    gl.uniform1f(su.waterSpeed, p('waterSpeed', 0.8));
    gl.uniform1f(su.waterDepth, p('waterDepth', 1.0));
    gl.uniform1f(su.causticIntensity, p('causticIntensity', 0.35));
    gl.uniform1f(su.waterBrightness, p('waterBrightness', 1.2));
    gl.uniform1f(su.waterHue, p('waterHue', 39));
    gl.uniform1f(su.foliageSway, p('foliageSway', 1.5));
    gl.uniform1f(su.foliageSwaySpeed, p('foliageSwaySpeed', 1.2));
    gl.uniform1f(su.foliageOpacity, p('foliageOpacity', 0.85));
    gl.uniform1f(su.shadowOffsetX, p('shadowOffsetX', 1.5));
    gl.uniform1f(su.shadowOffsetY, p('shadowOffsetY', 2.0));
    gl.uniform1f(su.textBrightness, p('textBrightness', 0.75));

    quad.draw();

    // ── Bloom pipeline ───────────────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.4));
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
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.useProgram(bloomExtractProg);
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

    // ── Composite to screen ──────────────────────────────────────

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
    gl.uniform1f(cu.bloomTightStr, p('bloomTightStr', 0.35));
    gl.uniform1f(cu.bloomWideStr, p('bloomWideStr', 0.25));
    gl.uniform1f(cu.beatBloom, p('beatBloom', 0.3));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.02));
    quad.draw();
  },

  destroy(gl) {
    if (sceneProg) gl.deleteProgram(sceneProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (textLayerTex) gl.deleteTexture(textLayerTex);
    if (foliageTex) gl.deleteTexture(foliageTex);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    textLayerTex = foliageTex = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    su = beu = blu = cu = {};
    fbuf = pal = hback = posData = textRGBA = null;
  },
};
