/**
 * COMAN — Remastered variant (Part 20)
 *
 * GPU VoxelSpace terrain renderer. The two 256×128 height maps are
 * uploaded as R32F textures and sampled with manual bilinear interpolation
 * in the fragment shader for smooth terrain at native display resolution.
 *
 * Camera path logic stays in JavaScript (cumulative replay required).
 * Interpolated rotation values, accumulated camera position, and rise/fall
 * state are passed as uniforms each frame.
 *
 * Original code: COMAN folder by PSI.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { W1DTA_B64, W2DTA_B64 } from './data.js';
import { gp } from '../index.js';

const FRAME_RATE = 35;

const PALETTES = [
  { name: 'Classic',     colorMap: [[1,0,0],       [0,1,0],       [0,0,1]]       },
  { name: 'Gruvbox',     colorMap: [[0.8,0.37,0.05], [0.6,0.59,0.1],  [0.27,0.53,0.35]] },
  { name: 'Monokai',     colorMap: [[0.98,0.15,0.45],[0.65,0.89,0.18],[0.4,0.85,0.94]]  },
  { name: 'Dracula',     colorMap: [[1,0.33,0.33],   [0.31,0.98,0.48],[0.74,0.58,0.98]] },
  { name: 'Solarized',   colorMap: [[0.86,0.2,0.18], [0.52,0.6,0],    [0.15,0.55,0.82]] },
  { name: 'Nord',        colorMap: [[0.75,0.38,0.42],[0.64,0.74,0.55],[0.37,0.51,0.67]] },
  { name: 'One Dark',    colorMap: [[0.88,0.42,0.46],[0.6,0.76,0.47], [0.38,0.69,0.94]] },
  { name: 'Catppuccin',  colorMap: [[0.95,0.55,0.66],[0.65,0.89,0.63],[0.54,0.71,0.98]] },
  { name: 'Tokyo Night', colorMap: [[0.97,0.47,0.56],[0.62,0.81,0.42],[0.48,0.81,1]]    },
  { name: 'Synthwave',   colorMap: [[1,0.49,0.86],   [0.45,0.98,0.72],[0.21,0.98,0.96]] },
  { name: 'Kanagawa',    colorMap: [[0.76,0.25,0.26],[0.46,0.58,0.42],[0.5,0.61,0.85]]  },
  { name: 'Everforest',  colorMap: [[0.9,0.5,0.5],   [0.65,0.75,0.5], [0.5,0.73,0.7]]   },
  { name: 'Rose Pine',   colorMap: [[0.92,0.44,0.57],[0.96,0.76,0.47],[0.77,0.65,0.9]]  },
];

// ── Shaders ──────────────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform vec2 uResolution;
uniform float uBeat;
uniform float uXWav, uYWav;
uniform float uRCos, uRSin, uRCos2, uRSin2;
uniform float uStartRise;
uniform float uHorizonY;
uniform float uTerrainScale;
uniform float uZWaveAmp;
uniform float uZWaveFreq;
uniform float uFogIntensity;
uniform float uBeatReactivity;
uniform vec3 uColorR, uColorG, uColorB;
uniform sampler2D uWave1, uWave2, uPalette;

const int BAIL = 192;
const float PERSP = 2560.0 / 65536.0;
const float PI = 3.14159265;
const vec3 FOG_COLOR = vec3(0.01, 0.015, 0.04);

float sampleWave(sampler2D tex, float pos) {
  float idx = mod(pos * 0.5, 32768.0);
  float i0f = floor(idx);
  float frac = idx - i0f;
  int i0 = int(i0f);
  int i1 = i0 + 1;
  if (i1 >= 32768) i1 = 0;
  float v0 = texelFetch(tex, ivec2(i0 & 255, (i0 >> 8) & 127), 0).r;
  float v1 = texelFetch(tex, ivec2(i1 & 255, (i1 >> 8) & 127), 0).r;
  return mix(v0, v1, frac);
}

void main() {
  vec2 res = uResolution;
  float col = (gl_FragCoord.x / res.x - 0.5) * 160.0;
  float pixelRow = (1.0 - gl_FragCoord.y / res.y) * 200.0;

  float horizonRow = uHorizonY * 200.0;
  float colTopRow = uStartRise + 22.0;

  if (pixelRow < colTopRow || pixelRow > 199.0) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  float dx = (col * uRCos + 160.0 * uRSin) / 256.0;
  float dy = (160.0 * uRCos2 - col * uRSin2) / 256.0;

  float xw = uXWav;
  float yw = uYWav;
  float localDx = dx;
  float localDy = dy;

  float rayHeight = 0.0;
  float rayInc = -(200.0 - horizonRow) * PERSP;
  float destRow = 199.0;

  vec3 color = vec3(0.0);
  bool found = false;

  for (int iter = 0; iter < 128; iter++) {
    if (destRow < colTopRow) break;

    int j = (iter < 64) ? iter : (64 + (iter - 64) * 2);

    if (iter == 64) {
      localDx *= 2.0;
      localDy *= 2.0;
    }

    xw += localDx;
    yw += localDy;

    float rawH = sampleWave(uWave1, xw) + sampleWave(uWave2, yw);
    rawH += uZWaveAmp * sin(float(j) * PI * 2.0 * uZWaveFreq / float(BAIL));
    rawH -= 240.0;
    float h = rawH * uTerrainScale;

    if (rayHeight < h) {
      float fj = float(j);
      float l = fj * PERSP;
      float n;
      if (l < 0.0001) {
        n = destRow - colTopRow;
      } else {
        n = (h - rayHeight) / l;
        n = min(n, destRow - colTopRow);
      }

      float bandTop = destRow - n;

      if (pixelRow <= destRow && pixelRow > bandTop) {
        float ci = mod(rawH + 140.0 - floor(fj / 8.0), 256.0) * 0.5;
        ci = clamp(ci, 0.0, 127.0);
        vec3 palColor = texture(uPalette, vec2((ci + 0.5) / 128.0, 0.5)).rgb;

        float fogT = smoothstep(0.0, 1.0, fj / float(BAIL)) * uFogIntensity;
        color = mix(palColor, FOG_COLOR, fogT);

        float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
        color *= 1.0 + beatPulse;

        found = true;
        break;
      }

      if (l >= 0.0001) {
        rayHeight += n * l;
      }
      rayInc += n * PERSP;
      destRow -= n;
    }

    rayHeight += rayInc;
    if (iter == 64) rayHeight += rayInc;
  }

  if (found) {
    color = mat3(uColorR, uColorG, uColorB) * color;
    color = max(color, vec3(0.0));
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

function buildPaletteTexture() {
  const pal = new Uint8Array(768);
  for (let a = 0; a < 256; a++) {
    const uc = (223 - Math.floor(a * 22 / 26)) * 3;
    if (uc < 0 || uc >= 768) continue;
    let b1 = Math.floor((230 - a) / 4) + Math.floor(256 * Math.sin(a * 4 / 1024 * 2 * Math.PI) / 32);
    if (b1 < 0) b1 = 0; if (b1 > 63) b1 = 63;
    pal[uc + 1] = b1;
    let b2 = Math.floor((255 - a) / 3);
    if (b2 > 63) b2 = 63;
    pal[uc + 2] = b2;
    let b3 = a - 220; if (b3 < 0) b3 = -b3;
    if (b3 > 40) b3 = 40; b3 = 40 - b3;
    pal[uc] = Math.floor(b3 / 3);
  }
  for (let a = 0; a < 768 - 16 * 3; a++) {
    let b = pal[a] * 9 / 6;
    if (b > 63) b = 63;
    pal[a] = Math.floor(b);
  }
  for (let a = 0; a < 24; a++) {
    const uc = (255 - a) * 3;
    let b = a - 4; if (b < 0) b = 0;
    pal[uc] = Math.floor(b / 2);
    pal[uc + 1] = 0; pal[uc + 2] = 0;
  }
  pal[0] = pal[1] = pal[2] = 0;

  const k = 255 / 63;
  const rgba = new Uint8Array(128 * 4);
  for (let i = 0; i < 128; i++) {
    rgba[i * 4]     = Math.round(clamp(pal[i * 3], 0, 63) * k);
    rgba[i * 4 + 1] = Math.round(clamp(pal[i * 3 + 1], 0, 63) * k);
    rgba[i * 4 + 2] = Math.round(clamp(pal[i * 3 + 2], 0, 63) * k);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

function precomputeAnim() {
  rsinArr = new Float64Array(4444);
  rcosArr = new Float64Array(4444);
  rsin2Arr = new Float64Array(4444);
  rcos2Arr = new Float64Array(4444);
  let rot2 = 0, rot = 0;
  for (let f = 0; f < 4444; f++) {
    rot2 += 4;
    rot += Math.trunc(256 * Math.sin(rot2 / 1024 * 2 * Math.PI) / 15);
    const r = rot >> 3;
    rsinArr[f] = Math.trunc(256 * Math.sin(r / 1024 * 2 * Math.PI));
    rcosArr[f] = Math.trunc(256 * Math.sin((r + 256) / 1024 * 2 * Math.PI));
    rsin2Arr[f] = Math.trunc(256 * Math.sin((r + 177) / 1024 * 2 * Math.PI));
    rcos2Arr[f] = Math.trunc(256 * Math.sin((r + 177 + 256) / 1024 * 2 * Math.PI));
  }
}

function decodeHeightMap(gl, b64) {
  const raw = b64ToUint8(b64);
  const f32 = new Float32Array(256 * 128);
  for (let i = 0; i < 256 * 128; i++) {
    f32[i] = ((raw[i * 2] | (raw[i * 2 + 1] << 8)) << 16 >> 16);
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 256, 128, 0, gl.RED, gl.FLOAT, f32);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── Module state ─────────────────────────────────────────────────

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let wave1Tex, wave2Tex, paletteTex;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;
let su = {}, beu = {}, blu = {}, cu = {};
let rsinArr, rcosArr, rsin2Arr, rcos2Arr;

export default {
  label: 'coman (remastered)',

  params: [
    gp('Palette', { key: 'palette', label: 'Theme', type: 'select', options: PALETTES.map((p, i) => ({ value: i, label: p.name })), default: 0 }),

    gp('Terrain', { key: 'terrainScale', label: 'Height Scale', type: 'float', min: 0.3, max: 3.0, step: 0.05, default: 1.0 }),
    gp('Terrain', { key: 'zwaveAmp', label: 'Z-Wave Amplitude', type: 'float', min: 0, max: 48, step: 0.5, default: 16.0 }),
    gp('Terrain', { key: 'zwaveFreq', label: 'Z-Wave Frequency', type: 'float', min: 0.5, max: 10.0, step: 0.25, default: 3.0 }),
    gp('Terrain', { key: 'horizonY', label: 'Horizon', type: 'float', min: 0.15, max: 0.60, step: 0.01, default: 0.35 }),

    gp('Atmosphere', { key: 'fogIntensity', label: 'Fog Intensity', type: 'float', min: 0, max: 1, step: 0.01, default: 0.3 }),

    gp('Animation', { key: 'beatReactivity', label: 'Beat Reactivity', type: 'float', min: 0, max: 1, step: 0.01, default: 0.2 }),

    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1, step: 0.01, default: 0.35 }),
    gp('Post-Processing', { key: 'bloomTightStr', label: 'Bloom Tight', type: 'float', min: 0, max: 3, step: 0.01, default: 0.3 }),
    gp('Post-Processing', { key: 'bloomWideStr', label: 'Bloom Wide', type: 'float', min: 0, max: 3, step: 0.01, default: 0.2 }),
    gp('Post-Processing', { key: 'beatBloom', label: 'Beat Bloom', type: 'float', min: 0, max: 1.5, step: 0.01, default: 0.3 }),
    gp('Post-Processing', { key: 'scanlineStr', label: 'Scanlines', type: 'float', min: 0, max: 0.5, step: 0.01, default: 0.03 }),
  ],

  init(gl) {
    sceneProg = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    wave1Tex = decodeHeightMap(gl, W1DTA_B64);
    wave2Tex = decodeHeightMap(gl, W2DTA_B64);

    const palRGBA = buildPaletteTexture();
    paletteTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 128, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palRGBA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    precomputeAnim();

    su = {
      resolution:      gl.getUniformLocation(sceneProg, 'uResolution'),
      beat:            gl.getUniformLocation(sceneProg, 'uBeat'),
      xwav:            gl.getUniformLocation(sceneProg, 'uXWav'),
      ywav:            gl.getUniformLocation(sceneProg, 'uYWav'),
      rcos:            gl.getUniformLocation(sceneProg, 'uRCos'),
      rsin:            gl.getUniformLocation(sceneProg, 'uRSin'),
      rcos2:           gl.getUniformLocation(sceneProg, 'uRCos2'),
      rsin2:           gl.getUniformLocation(sceneProg, 'uRSin2'),
      startrise:       gl.getUniformLocation(sceneProg, 'uStartRise'),
      horizonY:        gl.getUniformLocation(sceneProg, 'uHorizonY'),
      terrainScale:    gl.getUniformLocation(sceneProg, 'uTerrainScale'),
      zwaveAmp:        gl.getUniformLocation(sceneProg, 'uZWaveAmp'),
      zwaveFreq:       gl.getUniformLocation(sceneProg, 'uZWaveFreq'),
      fogIntensity:    gl.getUniformLocation(sceneProg, 'uFogIntensity'),
      beatReactivity:  gl.getUniformLocation(sceneProg, 'uBeatReactivity'),
      colorR:          gl.getUniformLocation(sceneProg, 'uColorR'),
      colorG:          gl.getUniformLocation(sceneProg, 'uColorG'),
      colorB:          gl.getUniformLocation(sceneProg, 'uColorB'),
      wave1:           gl.getUniformLocation(sceneProg, 'uWave1'),
      wave2:           gl.getUniformLocation(sceneProg, 'uWave2'),
      palette:         gl.getUniformLocation(sceneProg, 'uPalette'),
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
      bloomTightStr: gl.getUniformLocation(compositeProg, 'uBloomTightStr'),
      bloomWideStr:  gl.getUniformLocation(compositeProg, 'uBloomWideStr'),
      beatBloom:     gl.getUniformLocation(compositeProg, 'uBeatBloom'),
      beat:          gl.getUniformLocation(compositeProg, 'uBeat'),
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

    // ── Camera path replay (exact classic logic) ───────────────
    const frame = Math.floor(t * FRAME_RATE);
    const totalFrames = Math.floor(71.6 * FRAME_RATE);
    const scrollDownFrame = totalFrames - 160;

    let xwav = 0, ywav = 0, startrise = 120;
    for (let f = 0; f <= Math.min(frame, 4443); f++) {
      if (f < 400) { if (startrise > 0) startrise--; }
      else if (f >= scrollDownFrame) { if (startrise < 160) startrise++; }

      const fi = Math.min(Math.trunc(f / 2), 4443);
      const vrc = rcosArr[fi], vrs = rsinArr[fi];
      const vrc2 = rcos2Arr[fi], vrs2 = rsin2Arr[fi];
      const xa80 = Math.trunc((160 * vrs) / 256) & ~1;
      const ya80 = Math.trunc((160 * vrc2) / 256) & ~1;
      xwav += xa80 * 2;
      ywav += ya80 * 2;
    }

    // Smoothly interpolated rotation for the shader
    const rawFi = Math.min(t * FRAME_RATE * 0.5, 4443);
    const fi0 = Math.min(Math.floor(rawFi), 4443);
    const fi1 = Math.min(fi0 + 1, 4443);
    const frac = rawFi - fi0;
    const rcos  = rcosArr[fi0]  + (rcosArr[fi1]  - rcosArr[fi0])  * frac;
    const rsin  = rsinArr[fi0]  + (rsinArr[fi1]  - rsinArr[fi0])  * frac;
    const rcos2 = rcos2Arr[fi0] + (rcos2Arr[fi1] - rcos2Arr[fi0]) * frac;
    const rsin2 = rsin2Arr[fi0] + (rsin2Arr[fi1] - rsin2Arr[fi0]) * frac;

    // ── Pass 1: Scene ──────────────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, wave1Tex);
    gl.uniform1i(su.wave1, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, wave2Tex);
    gl.uniform1i(su.wave2, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.uniform1i(su.palette, 2);

    gl.uniform2f(su.resolution, sw, sh);
    gl.uniform1f(su.beat, beat);
    gl.uniform1f(su.xwav, xwav);
    gl.uniform1f(su.ywav, ywav);
    gl.uniform1f(su.rcos, rcos);
    gl.uniform1f(su.rsin, rsin);
    gl.uniform1f(su.rcos2, rcos2);
    gl.uniform1f(su.rsin2, rsin2);
    gl.uniform1f(su.startrise, startrise);
    gl.uniform1f(su.horizonY, p('horizonY', 0.35));
    gl.uniform1f(su.terrainScale, p('terrainScale', 1.0));
    gl.uniform1f(su.zwaveAmp, p('zwaveAmp', 16.0));
    gl.uniform1f(su.zwaveFreq, p('zwaveFreq', 3.0));
    gl.uniform1f(su.fogIntensity, p('fogIntensity', 0.3));
    gl.uniform1f(su.beatReactivity, p('beatReactivity', 0.2));

    const pal = PALETTES[p('palette', 0)];
    gl.uniform3fv(su.colorR, pal.colorMap[0]);
    gl.uniform3fv(su.colorG, pal.colorMap[1]);
    gl.uniform3fv(su.colorB, pal.colorMap[2]);

    quad.draw();

    // ── Pass 2: Bloom pipeline ─────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.35));
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

    // ── Pass 3: Composite to screen ────────────────────────────

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
    gl.uniform1f(cu.bloomTightStr, p('bloomTightStr', 0.3));
    gl.uniform1f(cu.bloomWideStr, p('bloomWideStr', 0.2));
    gl.uniform1f(cu.beatBloom, p('beatBloom', 0.3));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.03));
    quad.draw();
  },

  destroy(gl) {
    if (sceneProg) gl.deleteProgram(sceneProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (wave1Tex) gl.deleteTexture(wave1Tex);
    if (wave2Tex) gl.deleteTexture(wave2Tex);
    if (paletteTex) gl.deleteTexture(paletteTex);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    wave1Tex = wave2Tex = paletteTex = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    su = beu = blu = cu = {};
    rsinArr = rcosArr = rsin2Arr = rcos2Arr = null;
  },
};
