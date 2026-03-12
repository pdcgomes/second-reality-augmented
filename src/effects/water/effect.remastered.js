/**
 * WATER — Remastered variant (Part 19)
 *
 * GPU raymarched scene: procedural chrome spheres bobbing over an animated
 * water surface with real-time ripples and reflections. The original lo-fi
 * sword texture (400×34 indexed pixels) is preserved as a NEAREST-filtered
 * environment map, reflected on the chrome surfaces and water.
 *
 * The scene recreates the original baked background composition: 3 chrome
 * spheres over concentric water ripples, viewed from an elevated oblique
 * camera angle. Sphere positions are derived from POS table analysis of
 * the original WAT1/WAT2/WAT3 data.
 *
 * Original code: WATER/DEMO.PAS + ROUTINES.ASM by TRUG.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { FONT_W, FONT_H, PAL_B64, FONT_B64 } from './data.js';

const FRAME_RATE = 70;
const SCP_MAX = 390;

// ── Shaders ──────────────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform float uFade;
uniform float uScrollOffset;
uniform vec2 uResolution;
uniform sampler2D uSwordTex;

// Scene params
uniform float uBobAmplitude;
uniform float uBobSpeed;
uniform float uRippleFreq;
uniform float uRippleSpeed;
uniform float uRippleAmp;
uniform float uWaterDarkness;
uniform float uSpecularPower;
uniform float uFresnelExp;
uniform float uChromeReflect;
uniform float uSwordBrightness;
uniform float uBeatScale;
uniform float uCameraHeight;
uniform float uCameraAngle;

#define MAX_STEPS 80
#define MAX_DIST 50.0
#define SURF_DIST 0.002
#define PI 3.14159265

// Sphere definitions: xyz = position, w = radius
// Derived from POS table analysis of original scene
const vec4 SPHERE_BASE[3] = vec4[3](
  vec4(-1.8,  0.85, -0.5, 1.3),
  vec4( 0.0,  0.55,  0.8, 0.45),
  vec4( 2.5,  0.7,  -0.3, 1.1)
);

vec3 spherePos[3];
float beatPulse;

void computeSpherePositions() {
  beatPulse = pow(1.0 - uBeat, 6.0);
  float bobScale = 1.0 + beatPulse * uBeatScale;
  for (int i = 0; i < 3; i++) {
    vec3 base = SPHERE_BASE[i].xyz;
    float phase = float(i) * 2.094;
    float t = uTime * uBobSpeed + phase;
    float bob = sin(t) * 0.5 + 0.5;
    bob = bob * bob * (3.0 - 2.0 * bob);
    base.y += (bob - 0.5) * uBobAmplitude * bobScale;
    spherePos[i] = base;
  }
}

float rippleHeight(vec2 xz) {
  float h = 0.0;
  for (int i = 0; i < 3; i++) {
    float dist = length(xz - spherePos[i].xz);
    float proximity = max(0.0, 1.0 - (spherePos[i].y - SPHERE_BASE[i].w * 0.3) * 0.8);
    float wave = sin(dist * uRippleFreq - uTime * uRippleSpeed + float(i) * 1.5)
               + 0.5 * sin(dist * uRippleFreq * 1.7 - uTime * uRippleSpeed * 1.3 + float(i) * 2.7);
    h += wave * uRippleAmp * proximity / (1.0 + dist * 1.5);
  }
  h += sin(xz.x * 3.0 + uTime * 0.4) * sin(xz.y * 2.5 - uTime * 0.3) * uRippleAmp * 0.15;
  return h;
}

float sdSphere(vec3 p, vec3 center, float r) {
  return length(p - center) - r;
}

float sceneSDF(vec3 p) {
  float water = p.y - rippleHeight(p.xz);
  float d = water;
  for (int i = 0; i < 3; i++) {
    d = min(d, sdSphere(p, spherePos[i], SPHERE_BASE[i].w));
  }
  return d;
}

int hitObject(vec3 p) {
  float water = p.y - rippleHeight(p.xz);
  float minD = water;
  int id = 0;
  for (int i = 0; i < 3; i++) {
    float sd = sdSphere(p, spherePos[i], SPHERE_BASE[i].w);
    if (sd < minD) { minD = sd; id = i + 1; }
  }
  return id;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    sceneSDF(p + e.xyy) - sceneSDF(p - e.xyy),
    sceneSDF(p + e.yxy) - sceneSDF(p - e.yxy),
    sceneSDF(p + e.yyx) - sceneSDF(p - e.yyx)
  ));
}

vec3 waterNormal(vec3 p) {
  vec2 e = vec2(0.002, 0.0);
  float h  = rippleHeight(p.xz);
  float hx = rippleHeight(p.xz + e.xy);
  float hz = rippleHeight(p.xz + e.yx);
  return normalize(vec3(h - hx, e.x, h - hz));
}

float march(vec3 ro, vec3 rd, out int objId) {
  float t = 0.0;
  objId = -1;
  for (int i = 0; i < MAX_STEPS; i++) {
    vec3 p = ro + rd * t;
    float d = sceneSDF(p);
    if (d < SURF_DIST) {
      objId = hitObject(p);
      return t;
    }
    if (t > MAX_DIST) break;
    t += d;
  }
  return -1.0;
}

vec3 sampleSword(vec3 reflDir) {
  float u = reflDir.x * 0.35 + 0.5;
  float v = reflDir.y * 0.8 + 0.5;
  u = u - uScrollOffset / float(${FONT_W});
  v = clamp(v, 0.0, 1.0);
  if (u < 0.0 || u > 1.0) return vec3(0.0);
  vec4 s = texture(uSwordTex, vec2(u, 1.0 - v));
  float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
  if (lum < 0.02) return vec3(0.0);
  return s.rgb * uSwordBrightness;
}

vec3 lighting(vec3 p, vec3 N, vec3 V, vec3 baseColor, float specMul) {
  vec3 L = normalize(vec3(0.4, 0.8, -0.3));
  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float specPow = uSpecularPower + beatPulse * 32.0;
  float spec = pow(max(dot(N, H), 0.0), specPow) * specMul;
  vec3 ambient = baseColor * 0.08;
  vec3 diffuse = baseColor * diff * 0.4;
  vec3 specular = vec3(0.9, 0.92, 1.0) * spec;
  return ambient + diffuse + specular;
}

vec3 shade(vec3 ro, vec3 rd, float t, int objId) {
  vec3 p = ro + rd * t;
  vec3 V = -rd;

  if (objId >= 1) {
    int si = objId - 1;
    vec3 N = normalize(p - spherePos[si]);
    vec3 R = reflect(rd, N);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelExp);

    vec3 chromeColor = vec3(0.12, 0.14, 0.35);
    vec3 lit = lighting(p, N, V, chromeColor, 2.0);

    vec3 envColor = sampleSword(R);

    int rId;
    float rt = march(p + N * 0.01, R, rId);
    if (rt > 0.0 && rId == 0) {
      vec3 rp = p + N * 0.01 + R * rt;
      vec3 wN = waterNormal(rp);
      vec3 waterCol = vec3(0.02, 0.04, 0.12) * (1.0 - uWaterDarkness * 0.5);
      envColor += waterCol * 0.3;
    }

    vec3 reflection = envColor * uChromeReflect;
    return mix(lit, lit + reflection, fresnel);
  }

  vec3 N = waterNormal(p);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelExp * 0.7);
  fresnel = clamp(fresnel, 0.05, 1.0);

  vec3 waterBase = vec3(0.01, 0.02, 0.08) * (1.0 - uWaterDarkness * 0.5);
  vec3 lit = lighting(p, N, V, waterBase, 1.0);

  vec3 R = reflect(rd, N);
  vec3 reflColor = vec3(0.0);

  int rId;
  float rt = march(p + N * 0.01, R, rId);
  if (rt > 0.0 && rId >= 1) {
    int si = rId - 1;
    vec3 rp = p + N * 0.01 + R * rt;
    vec3 sN = normalize(rp - spherePos[si]);
    vec3 sR = reflect(R, sN);
    vec3 sphereChrome = vec3(0.15, 0.18, 0.4);
    reflColor = lighting(rp, sN, -R, sphereChrome, 1.5);
    reflColor += sampleSword(sR) * uChromeReflect * 0.6;
  } else {
    reflColor = sampleSword(R) * 0.4;
  }

  return mix(lit, reflColor, fresnel * 0.85);
}

void main() {
  computeSpherePositions();

  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;

  float camAngle = uCameraAngle * PI / 180.0;
  vec3 ro = vec3(0.3, uCameraHeight, -4.5);
  vec3 lookAt = vec3(0.0, 0.3, 0.0);
  vec3 fwd = normalize(lookAt - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);

  float cosA = cos(camAngle);
  float sinA = sin(camAngle);
  vec3 fwd2 = fwd * cosA - up * sinA;
  vec3 up2 = fwd * sinA + up * cosA;

  vec3 rd = normalize(fwd2 + right * uv.x + up2 * uv.y);

  int objId;
  float t = march(ro, rd, objId);

  vec3 col;
  if (t > 0.0) {
    col = shade(ro, rd, t, objId);
  } else {
    col = vec3(0.005, 0.008, 0.025);
  }

  col *= uFade;
  fragColor = vec4(col, 1.0);
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

function decodeSwordTexture(gl) {
  const pal = b64ToUint8(PAL_B64);
  const font = b64ToUint8(FONT_B64);
  const k = 255 / 63;
  const pixels = new Uint8Array(FONT_W * FONT_H * 4);
  for (let i = 0; i < FONT_W * FONT_H; i++) {
    const idx = font[i];
    pixels[i * 4]     = Math.round(clamp(pal[idx * 3], 0, 63) * k);
    pixels[i * 4 + 1] = Math.round(clamp(pal[idx * 3 + 1], 0, 63) * k);
    pixels[i * 4 + 2] = Math.round(clamp(pal[idx * 3 + 2], 0, 63) * k);
    pixels[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, FONT_W, FONT_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── Module state ─────────────────────────────────────────────────

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let swordTex;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let su = {}, beu = {}, blu = {}, cu = {};

export default {
  label: 'water (remastered)',

  params: [
    { key: 'bobAmplitude', label: 'Bob Amplitude', type: 'float', min: 0.0, max: 2.0, step: 0.01, default: 0.5 },
    { key: 'bobSpeed', label: 'Bob Speed', type: 'float', min: 0.1, max: 4.0, step: 0.05, default: 0.7 },
    { key: 'rippleFreq', label: 'Ripple Frequency', type: 'float', min: 1, max: 30, step: 0.5, default: 8.0 },
    { key: 'rippleSpeed', label: 'Ripple Speed', type: 'float', min: 0.2, max: 6.0, step: 0.1, default: 2.0 },
    { key: 'rippleAmp', label: 'Ripple Amplitude', type: 'float', min: 0.001, max: 0.15, step: 0.001, default: 0.03 },
    { key: 'waterDarkness', label: 'Water Darkness', type: 'float', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'specularPower', label: 'Specular Power', type: 'float', min: 8, max: 512, step: 1, default: 128 },
    { key: 'fresnelExp', label: 'Fresnel Exponent', type: 'float', min: 0.5, max: 10, step: 0.1, default: 3.5 },
    { key: 'chromeReflect', label: 'Chrome Reflectivity', type: 'float', min: 0, max: 3, step: 0.05, default: 1.5 },
    { key: 'swordBrightness', label: 'Sword Brightness', type: 'float', min: 0.2, max: 4, step: 0.05, default: 1.8 },
    { key: 'cameraHeight', label: 'Camera Height', type: 'float', min: 0.5, max: 5.0, step: 0.1, default: 2.2 },
    { key: 'cameraAngle', label: 'Camera Angle', type: 'float', min: -30, max: 30, step: 0.5, default: 5.0 },
    { key: 'beatScale', label: 'Beat Bob Scale', type: 'float', min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'bloomTightStr', label: 'Bloom Tight', type: 'float', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'bloomWideStr', label: 'Bloom Wide', type: 'float', min: 0, max: 3, step: 0.01, default: 0.4 },
    { key: 'scanlineStr', label: 'Scanlines', type: 'float', min: 0, max: 0.5, step: 0.01, default: 0.03 },
    { key: 'beatBloom', label: 'Beat Bloom', type: 'float', min: 0, max: 1.5, step: 0.01, default: 0.35 },
  ],

  init(gl) {
    sceneProg = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    su = {
      time: gl.getUniformLocation(sceneProg, 'uTime'),
      beat: gl.getUniformLocation(sceneProg, 'uBeat'),
      fade: gl.getUniformLocation(sceneProg, 'uFade'),
      scrollOffset: gl.getUniformLocation(sceneProg, 'uScrollOffset'),
      resolution: gl.getUniformLocation(sceneProg, 'uResolution'),
      swordTex: gl.getUniformLocation(sceneProg, 'uSwordTex'),
      bobAmplitude: gl.getUniformLocation(sceneProg, 'uBobAmplitude'),
      bobSpeed: gl.getUniformLocation(sceneProg, 'uBobSpeed'),
      rippleFreq: gl.getUniformLocation(sceneProg, 'uRippleFreq'),
      rippleSpeed: gl.getUniformLocation(sceneProg, 'uRippleSpeed'),
      rippleAmp: gl.getUniformLocation(sceneProg, 'uRippleAmp'),
      waterDarkness: gl.getUniformLocation(sceneProg, 'uWaterDarkness'),
      specularPower: gl.getUniformLocation(sceneProg, 'uSpecularPower'),
      fresnelExp: gl.getUniformLocation(sceneProg, 'uFresnelExp'),
      chromeReflect: gl.getUniformLocation(sceneProg, 'uChromeReflect'),
      swordBrightness: gl.getUniformLocation(sceneProg, 'uSwordBrightness'),
      beatScale: gl.getUniformLocation(sceneProg, 'uBeatScale'),
      cameraHeight: gl.getUniformLocation(sceneProg, 'uCameraHeight'),
      cameraAngle: gl.getUniformLocation(sceneProg, 'uCameraAngle'),
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

    swordTex = decodeSwordTexture(gl);
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
    const scrollOffset = Math.min(Math.floor(frame / 3), SCP_MAX);

    let fade = 1.0;
    const fadeOutStart = (SCP_MAX + 158) * 3 - 63;
    if (frame < 63) {
      fade = frame / 63;
    } else if (frame > fadeOutStart) {
      fade = clamp(1 - (frame - fadeOutStart) / 63, 0, 1);
    }

    // ── Render scene via raymarching ────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, swordTex);
    gl.uniform1i(su.swordTex, 0);

    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);
    gl.uniform1f(su.fade, fade);
    gl.uniform1f(su.scrollOffset, scrollOffset);
    gl.uniform2f(su.resolution, sw, sh);

    gl.uniform1f(su.bobAmplitude, p('bobAmplitude', 0.5));
    gl.uniform1f(su.bobSpeed, p('bobSpeed', 0.7));
    gl.uniform1f(su.rippleFreq, p('rippleFreq', 8.0));
    gl.uniform1f(su.rippleSpeed, p('rippleSpeed', 2.0));
    gl.uniform1f(su.rippleAmp, p('rippleAmp', 0.03));
    gl.uniform1f(su.waterDarkness, p('waterDarkness', 0.5));
    gl.uniform1f(su.specularPower, p('specularPower', 128));
    gl.uniform1f(su.fresnelExp, p('fresnelExp', 3.5));
    gl.uniform1f(su.chromeReflect, p('chromeReflect', 1.5));
    gl.uniform1f(su.swordBrightness, p('swordBrightness', 1.8));
    gl.uniform1f(su.beatScale, p('beatScale', 0.15));
    gl.uniform1f(su.cameraHeight, p('cameraHeight', 2.2));
    gl.uniform1f(su.cameraAngle, p('cameraAngle', 5.0));

    quad.draw();

    // ── Bloom pipeline ──────────────────────────────────────────

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

    // ── Composite to screen ─────────────────────────────────────

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
    gl.uniform1f(cu.bloomTightStr, p('bloomTightStr', 0.6));
    gl.uniform1f(cu.bloomWideStr, p('bloomWideStr', 0.4));
    gl.uniform1f(cu.beatBloom, p('beatBloom', 0.35));
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
    if (swordTex) gl.deleteTexture(swordTex);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    swordTex = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    su = beu = blu = cu = {};
  },
};
