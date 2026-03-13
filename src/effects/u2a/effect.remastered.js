/**
 * U2A — Remastered variant (Part 2)
 *
 * Three polygon spaceships fly over the ALKU landscape — same choreography,
 * same camera, same models — but now rendered with native WebGL at full
 * display resolution instead of the 320×200 CPU software rasterizer.
 *
 * Enhancements over classic:
 *   - GPU-rendered polygon ships at native resolution with depth buffer
 *   - Directional lighting with palette-ramp lookup via texture
 *   - ALKU landscape background at native res (right half, NEAREST)
 *   - Purple horizon glow (ported from ALKU remaster)
 *   - Terrain shadow darkening beneath flying ships
 *   - Depth-of-field with dynamic focus on passing ships
 *   - Dual-tier bloom post-processing
 *
 * Original source: VISU/ folder in SecondReality repo (code by PSI).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
import { createU2Engine } from './engine.js';
import { SCENE_B64, ANIM_B64, OBJ_B64S } from './data.js';
import {
  LANDSCAPE_B64,
  LANDSCAPE_PAL,
  LANDSCAPE_W,
  LANDSCAPE_H,
} from '../alku/data.js';

const FRAME_RATE = 70;
const BG_COLOR_OFFSET = 192;
const MAX_SHIPS = 3;

const PROJ_XO = 159, PROJ_YO = 99, ASPECT = 172 / 200;
const CLIP_X1 = 319;
const CLIP_Y = [25, 174];

const LIGHT = [12118 / 16384, 10603 / 16384, 3030 / 16834];

const F_GOURAUD = 0x1000;
const F_SHADE32 = 0x0C00;

// ── Background fragment shader (landscape + glow + shadows) ──────────

const BG_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;
uniform sampler2D uLandscape;

uniform float uHorizonGlow;
uniform float uHorizonPulseSpeed;
uniform float uGlowY;
uniform float uGlowHeight;
uniform float uBeatReactivity;

uniform vec4 uShadows[${MAX_SHIPS}]; // xy = screen UV, z = radius, w = opacity
uniform float uShadowSoftness;

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

float terrainShadow(vec2 uv) {
  float shadow = 0.0;
  for (int i = 0; i < ${MAX_SHIPS}; i++) {
    vec4 s = uShadows[i];
    if (s.w <= 0.0) continue;
    vec2 diff = uv - s.xy;
    diff.x *= uResolution.x / uResolution.y;
    float d = length(diff) / max(s.z, 0.001);
    float falloff = 1.0 - smoothstep(1.0 - uShadowSoftness, 1.0, d);
    shadow = max(shadow, falloff * s.w);
  }
  return shadow;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  uv.y = 1.0 - uv.y;

  vec3 color = vec3(0.0);

  float vpTop = ${CLIP_Y[0]}.0 / 200.0;
  float vpBot = ${CLIP_Y[1]}.0 / 200.0;

  if (uv.y >= vpTop && uv.y <= vpBot) {
    float landscapeUVy = (uv.y - vpTop) / (vpBot - vpTop);
    landscapeUVy *= (${CLIP_Y[1] - CLIP_Y[0]}.0 / ${LANDSCAPE_H}.0);
    float landscapeUVx = uv.x * 0.5 + 0.5;
    color = texture(uLandscape, vec2(landscapeUVx, landscapeUVy)).rgb;
    color += horizonGlow(uv, uTime);
    color *= 1.0 - terrainShadow(uv);
  }

  float beatPulse = pow(1.0 - uBeat, 8.0) * uBeatReactivity;
  color += color * beatPulse;

  fragColor = vec4(color, 1.0);
}
`;

// ── Ship vertex shader ───────────────────────────────────────────────

const SHIP_VERT = `#version 300 es
precision highp float;

in vec3 aPosition;
in vec3 aNormal;
in float aBasePalIdx;
in float aShadeDiv;

uniform mat4 uModelView;
uniform mat4 uProjection;
uniform mat3 uNormalMat;

out vec3 vNormal;
out float vBasePalIdx;
out float vShadeDiv;
out float vDepth;

void main() {
  vec4 viewPos = uModelView * vec4(aPosition, 1.0);
  gl_Position = uProjection * viewPos;
  vNormal = normalize(uNormalMat * aNormal);
  vBasePalIdx = aBasePalIdx;
  vShadeDiv = aShadeDiv;
  vDepth = gl_Position.z / gl_Position.w;
}
`;

// ── Ship fragment shader ─────────────────────────────────────────────

const SHIP_FRAG = `#version 300 es
precision highp float;

in vec3 vNormal;
in float vBasePalIdx;
in float vShadeDiv;
in float vDepth;

layout(location = 0) out vec4 fragColor;

uniform vec3 uLightDir;
uniform sampler2D uPalette;
uniform float uTime;
uniform float uExhaustGlow;
uniform float uExhaustPulse;
uniform float uExhaustHueShift;

vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(1.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}

void main() {
  vec3 n = normalize(vNormal);
  float d = dot(n, uLightDir) / 16384.0 * 128.0;
  float light = clamp(d + 128.0, 0.0, 255.0);

  float div = vShadeDiv;
  float shade = light / div;
  float maxShade = 256.0 / div - 1.0;
  shade = clamp(shade, 2.0, maxShade);
  shade = floor(shade);

  float palIdx = vBasePalIdx + shade;
  float palU = (palIdx + 0.5) / 256.0;
  vec3 color = texture(uPalette, vec2(palU, 0.5)).rgb;

  float redness = color.r - max(color.g, color.b);
  float isExhaust = smoothstep(0.15, 0.35, redness) * smoothstep(0.2, 0.4, color.r);

  float pulse = 1.0 + uExhaustPulse * sin(uTime * 8.0) * 0.3
                     + uExhaustPulse * sin(uTime * 13.0) * 0.15;
  float glow = uExhaustGlow * pulse;

  vec3 hsv = rgb2hsv(color);
  hsv.x = fract(hsv.x + uExhaustHueShift);
  hsv.z *= (1.0 + glow);
  vec3 emissive = hsv2rgb(hsv);
  color = mix(color, emissive, isExhaust);

  fragColor = vec4(color, 1.0);
}
`;

// ── DoF shader ───────────────────────────────────────────────────────

const DOF_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBlurred;
uniform sampler2D uDepth;
uniform float uFocusDepth;
uniform float uDofStrength;
uniform float uDofRange;

void main() {
  vec3 sharp = texture(uScene, vUV).rgb;
  vec3 blurry = texture(uBlurred, vUV).rgb;
  float depth = texture(uDepth, vUV).r;

  float dist = abs(depth - uFocusDepth);
  float coc = smoothstep(0.0, uDofRange, dist) * uDofStrength;

  fragColor = vec4(mix(sharp, blurry, coc), 1.0);
}
`;

// ── Bloom shaders ────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

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

function createSceneFBO(gl, w, h) {
  const fb = gl.createFramebuffer();
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const depthTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, depthTex };
}

function deleteFBO(gl, fbo) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  if (fbo.tex) gl.deleteTexture(fbo.tex);
  if (fbo.depthTex) gl.deleteTexture(fbo.depthTex);
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

function buildPaletteRGBA(scene) {
  const pal768 = new Uint8Array(768);
  for (let i = 0; i < 768; i++) pal768[i] = scene[16 + i];
  for (let i = 0; i < 63 * 3; i++) pal768[BG_COLOR_OFFSET * 3 + i] = LANDSCAPE_PAL[i];
  const rgba = new Uint8Array(256 * 4);
  const k = 255 / 63;
  for (let i = 0; i < 256; i++) {
    rgba[i * 4 + 0] = Math.round(pal768[i * 3 + 0] * k);
    rgba[i * 4 + 1] = Math.round(pal768[i * 3 + 1] * k);
    rgba[i * 4 + 2] = Math.round(pal768[i * 3 + 2] * k);
    rgba[i * 4 + 3] = 255;
  }
  rgba[0] = rgba[1] = rgba[2] = rgba[3] = 0;
  return rgba;
}

// ── Geometry extraction ──────────────────────────────────────────────

function shadeDiv(flags) {
  const f = (flags << 8 & F_SHADE32) >> 10;
  if (f === 1) return 32;
  if (f === 2) return 16;
  if (f === 3) return 8;
  return 16;
}

function extractShipGeometry(gl, obj) {
  const positions = [];
  const normals = [];
  const palIdxs = [];
  const shadeDivs = [];

  for (const poly of obj.pd) {
    const verts = poly.vertex;
    if (verts.length < 3) continue;
    const isGouraud = (poly.flags << 8) & F_GOURAUD;
    const sd = shadeDiv(poly.flags);
    const faceNormal = obj.n0[poly.NormalIndex];

    for (let i = 1; i < verts.length - 1; i++) {
      const triVerts = [verts[0], verts[i], verts[i + 1]];
      for (const vi of triVerts) {
        const v = obj.v0[vi];
        positions.push(v.x, v.y, v.z);
        if (isGouraud && v.NormalIndex !== undefined && obj.n0[v.NormalIndex]) {
          const n = obj.n0[v.NormalIndex];
          normals.push(n.x, n.y, n.z);
        } else {
          normals.push(faceNormal.x, faceNormal.y, faceNormal.z);
        }
        palIdxs.push(poly.color);
        shadeDivs.push(sd);
      }
    }
  }

  const vertCount = positions.length / 3;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  const normBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  const palBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, palBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(palIdxs), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 1, gl.FLOAT, false, 0, 0);

  const sdBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, sdBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(shadeDivs), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 1, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);
  return { vao, vertCount, bufs: [posBuf, normBuf, palBuf, sdBuf] };
}

// ── Matrix helpers ───────────────────────────────────────────────────

function buildModelViewMat4(objR0, camR0) {
  const r = new Float64Array(12);
  r[0] = camR0[0]*objR0[0] + camR0[1]*objR0[3] + camR0[2]*objR0[6];
  r[1] = camR0[0]*objR0[1] + camR0[1]*objR0[4] + camR0[2]*objR0[7];
  r[2] = camR0[0]*objR0[2] + camR0[1]*objR0[5] + camR0[2]*objR0[8];
  r[3] = camR0[3]*objR0[0] + camR0[4]*objR0[3] + camR0[5]*objR0[6];
  r[4] = camR0[3]*objR0[1] + camR0[4]*objR0[4] + camR0[5]*objR0[7];
  r[5] = camR0[3]*objR0[2] + camR0[4]*objR0[5] + camR0[5]*objR0[8];
  r[6] = camR0[6]*objR0[0] + camR0[7]*objR0[3] + camR0[8]*objR0[6];
  r[7] = camR0[6]*objR0[1] + camR0[7]*objR0[4] + camR0[8]*objR0[7];
  r[8] = camR0[6]*objR0[2] + camR0[7]*objR0[5] + camR0[8]*objR0[8];
  const tx = objR0[9]*camR0[0] + objR0[10]*camR0[1] + objR0[11]*camR0[2];
  const ty = objR0[9]*camR0[3] + objR0[10]*camR0[4] + objR0[11]*camR0[5];
  const tz = objR0[9]*camR0[6] + objR0[10]*camR0[7] + objR0[11]*camR0[8];
  r[9]  = tx + camR0[9];
  r[10] = ty + camR0[10];
  r[11] = tz + camR0[11];
  return new Float32Array([
    r[0], r[3], r[6], 0,
    r[1], r[4], r[7], 0,
    r[2], r[5], r[8], 0,
    r[9], r[10], r[11], 1,
  ]);
}

function buildNormalMat3(mv) {
  return new Float32Array([
    mv[0], mv[1], mv[2],
    mv[4], mv[5], mv[6],
    mv[8], mv[9], mv[10],
  ]);
}

function buildProjectionMat4(fovDeg, _aspect, near, far) {
  let half = fovDeg / 2;
  if (half < 3) half = 3;
  if (half > 90) half = 90;
  const projXF = (CLIP_X1 - PROJ_XO) / Math.tan(half * Math.PI / 180);
  const projYF = projXF * ASPECT;
  const vpW = 320, vpH = 200;
  const sx = 2 * projXF / vpW;
  const sy = 2 * projYF / vpH;
  const ox = 2 * PROJ_XO / vpW - 1;
  const oy = 1 - 2 * PROJ_YO / vpH;
  const nf = far - near;
  return new Float32Array([
    sx,  0,    0,                    0,
    0,  -sy,   0,                    0,
    ox,  oy,   (far + near) / nf,    1,
    0,   0,   -2 * far * near / nf,  0,
  ]);
}

function projectToScreen(mv, proj) {
  const vx = mv[12], vy = mv[13], vz = mv[14];
  if (vz <= 0) return null;
  const cx = proj[0] * vx + proj[8] * vz;
  const cy = proj[5] * vy + proj[9] * vz;
  return { u: (cx / vz) * 0.5 + 0.5, v: 1.0 - ((cy / vz) * 0.5 + 0.5), z: vz };
}

function viewZToDepthBuf(z) {
  const near = 512, far = 10000000, nf = far - near;
  const ndcZ = (far + near) / nf - 2 * far * near / (nf * z);
  return (ndcZ + 1.0) * 0.5;
}

// ── Module state ─────────────────────────────────────────────────────

let engine = null;
let frameCount = 0;
let prevTime = 0;

let bgProg, shipProg, dofProg, bloomExtractProg, blurProg, compositeProg;
let quad;

let landscapeTex = null;
let paletteTex = null;

let shipMeshes = [];

let sceneFBO, dofFBO, dofBlurFBO1, dofBlurFBO2;
let bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let bgu = {}, shu = {}, du = {}, beu = {}, blu = {}, cu = {};

let focusDepth = 1.0;

// ── Effect interface ─────────────────────────────────────────────────

export default {
  label: 'u2a (remastered)',

  params: [
    gp('Atmosphere',       { key: 'horizonGlow',       label: 'Horizon Glow',       type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.08 }),
    gp('Atmosphere',       { key: 'horizonPulseSpeed',  label: 'Horizon Pulse Speed',type: 'float', min: 0.2, max: 5,   step: 0.1,  default: 1.2 }),
    gp('Atmosphere',       { key: 'glowY',              label: 'Glow Y Position',    type: 'float', min: 0.1, max: 0.9, step: 0.01, default: 0.62 }),
    gp('Atmosphere',       { key: 'glowHeight',         label: 'Glow Spread',        type: 'float', min: 0.01,max: 0.4, step: 0.01, default: 0.12 }),
    gp('Exhaust Glow',     { key: 'exhaustGlow',         label: 'Glow Intensity',     type: 'float', min: 0,   max: 5,   step: 0.05, default: 2.0 }),
    gp('Exhaust Glow',     { key: 'exhaustPulse',        label: 'Pulse Amount',       type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.6 }),
    gp('Exhaust Glow',     { key: 'exhaustHueShift',     label: 'Hue Shift',          type: 'float', min: -0.5,max: 0.5, step: 0.01, default: 0.29 }),
    gp('Shadows',          { key: 'shadowOpacity',      label: 'Shadow Opacity',     type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.5 }),
    gp('Shadows',          { key: 'shadowSize',         label: 'Shadow Size',        type: 'float', min: 0.01,max: 0.5, step: 0.01, default: 0.15 }),
    gp('Shadows',          { key: 'shadowSoftness',     label: 'Shadow Softness',    type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.5 }),
    gp('Depth of Field',   { key: 'dofStrength',        label: 'DoF Amount',         type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.35 }),
    gp('Depth of Field',   { key: 'dofRange',           label: 'DoF Focus Range',    type: 'float', min: 0.01,max: 1,   step: 0.01, default: 0.15 }),
    gp('Post-Processing',  { key: 'bloomThreshold',     label: 'Bloom Threshold',    type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.35 }),
    gp('Post-Processing',  { key: 'bloomStrength',      label: 'Bloom Strength',     type: 'float', min: 0,   max: 2,   step: 0.01, default: 0.2 }),
    gp('Post-Processing',  { key: 'beatReactivity',     label: 'Beat Reactivity',    type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.15 }),
  ],

  init(gl) {
    bgProg = createProgram(gl, FULLSCREEN_VERT, BG_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);
    dofProg = createProgram(gl, FULLSCREEN_VERT, DOF_FRAG);

    // Ship program with bound attribute locations
    {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, SHIP_VERT);
      gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, SHIP_FRAG);
      gl.compileShader(fs);
      shipProg = gl.createProgram();
      gl.attachShader(shipProg, vs);
      gl.attachShader(shipProg, fs);
      gl.bindAttribLocation(shipProg, 0, 'aPosition');
      gl.bindAttribLocation(shipProg, 1, 'aNormal');
      gl.bindAttribLocation(shipProg, 2, 'aBasePalIdx');
      gl.bindAttribLocation(shipProg, 3, 'aShadeDiv');
      gl.linkProgram(shipProg);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }

    quad = createFullscreenQuad(gl);

    engine = createU2Engine();
    const scene = engine.init(SCENE_B64, OBJ_B64S, ANIM_B64);
    frameCount = 0;
    prevTime = 0;

    landscapeTex = gl.createTexture();
    const landscapeRGBA = decodeLandscape();
    gl.bindTexture(gl.TEXTURE_2D, landscapeTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, LANDSCAPE_W, LANDSCAPE_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, landscapeRGBA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    paletteTex = gl.createTexture();
    const palRGBA = buildPaletteRGBA(scene);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palRGBA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    shipMeshes = [];
    for (let c = 1; c < engine.objectCount; c++) {
      const co = engine.getObject(c);
      const mesh = extractShipGeometry(gl, co.o);
      mesh.objIndex = c;
      shipMeshes.push(mesh);
    }

    // Uniform locations
    bgu = {
      time: gl.getUniformLocation(bgProg, 'uTime'),
      beat: gl.getUniformLocation(bgProg, 'uBeat'),
      resolution: gl.getUniformLocation(bgProg, 'uResolution'),
      landscape: gl.getUniformLocation(bgProg, 'uLandscape'),
      horizonGlow: gl.getUniformLocation(bgProg, 'uHorizonGlow'),
      horizonPulseSpeed: gl.getUniformLocation(bgProg, 'uHorizonPulseSpeed'),
      glowY: gl.getUniformLocation(bgProg, 'uGlowY'),
      glowHeight: gl.getUniformLocation(bgProg, 'uGlowHeight'),
      beatReactivity: gl.getUniformLocation(bgProg, 'uBeatReactivity'),
      shadows: [],
      shadowSoftness: gl.getUniformLocation(bgProg, 'uShadowSoftness'),
    };
    for (let i = 0; i < MAX_SHIPS; i++)
      bgu.shadows.push(gl.getUniformLocation(bgProg, `uShadows[${i}]`));

    shu = {
      modelView: gl.getUniformLocation(shipProg, 'uModelView'),
      projection: gl.getUniformLocation(shipProg, 'uProjection'),
      normalMat: gl.getUniformLocation(shipProg, 'uNormalMat'),
      lightDir: gl.getUniformLocation(shipProg, 'uLightDir'),
      palette: gl.getUniformLocation(shipProg, 'uPalette'),
      time: gl.getUniformLocation(shipProg, 'uTime'),
      exhaustGlow: gl.getUniformLocation(shipProg, 'uExhaustGlow'),
      exhaustPulse: gl.getUniformLocation(shipProg, 'uExhaustPulse'),
      exhaustHueShift: gl.getUniformLocation(shipProg, 'uExhaustHueShift'),
    };

    du = {
      scene: gl.getUniformLocation(dofProg, 'uScene'),
      blurred: gl.getUniformLocation(dofProg, 'uBlurred'),
      depth: gl.getUniformLocation(dofProg, 'uDepth'),
      focusDepth: gl.getUniformLocation(dofProg, 'uFocusDepth'),
      dofStrength: gl.getUniformLocation(dofProg, 'uDofStrength'),
      dofRange: gl.getUniformLocation(dofProg, 'uDofRange'),
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
    };
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;
    prevTime = t;

    // ── Resize FBOs ──────────────────────────────────────────
    if (sw !== fboW || sh !== fboH) {
      deleteFBO(gl, sceneFBO);
      deleteFBO(gl, dofFBO);
      deleteFBO(gl, dofBlurFBO1);
      deleteFBO(gl, dofBlurFBO2);
      deleteFBO(gl, bloomFBO1);
      deleteFBO(gl, bloomFBO2);
      deleteFBO(gl, bloomWideFBO1);
      deleteFBO(gl, bloomWideFBO2);
      sceneFBO      = createSceneFBO(gl, sw, sh);
      dofFBO        = createFBO(gl, sw, sh);
      dofBlurFBO1   = createFBO(gl, sw >> 1, sh >> 1);
      dofBlurFBO2   = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    // ── Advance animation ────────────────────────────────────
    const targetFrame = Math.floor(t * FRAME_RATE);
    if (targetFrame < frameCount) {
      engine.seekFrame(targetFrame);
    } else if (engine.baked) {
      engine.seekFrame(targetFrame);
    } else {
      const steps = Math.min(targetFrame - frameCount, 910);
      for (let i = 0; i < steps && !engine.ended; i++) engine.stepAnimation();
    }
    frameCount = targetFrame;

    const proj = buildProjectionMat4(engine.fov, sw / sh, 512, 10000000);
    const cam = engine.camera;

    // ── Compute per-ship data (MV, screen pos, shadows) ──────
    const curMVs = [];
    const shadowData = new Float32Array(MAX_SHIPS * 4);
    const shadowOpacity = p('shadowOpacity', 0.5);
    const shadowSize = p('shadowSize', 0.15);

    let nearestShipDepth = 1.0;
    let anyShipVisible = false;

    for (let mi = 0; mi < shipMeshes.length; mi++) {
      const mesh = shipMeshes[mi];
      const co = engine.getObject(mesh.objIndex);
      const mv = buildModelViewMat4(co.o.r0, cam);
      curMVs[mi] = mv;

      if (!co.on) continue;
      anyShipVisible = true;

      const sp = projectToScreen(mv, proj);
      if (sp && sp.z > 0) {
        const terrainY = 0.76;
        const altitude = terrainY - sp.v;
        const sizeScale = 5000 / Math.max(sp.z, 500) * (1 + altitude * 2);
        shadowData[mi * 4]     = sp.u;
        shadowData[mi * 4 + 1] = terrainY;
        shadowData[mi * 4 + 2] = shadowSize * sizeScale;
        shadowData[mi * 4 + 3] = shadowOpacity;

        const bufDepth = viewZToDepthBuf(sp.z);
        if (bufDepth < nearestShipDepth) nearestShipDepth = bufDepth;
      }
    }

    if (anyShipVisible) {
      focusDepth += (nearestShipDepth - focusDepth) * 0.08;
    } else {
      focusDepth += (1.0 - focusDepth) * 0.02;
    }

    // ── Pass 1: Background + shadows → sceneFBO ──────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.disable(gl.DEPTH_TEST);

    gl.useProgram(bgProg);
    gl.uniform1f(bgu.time, t);
    gl.uniform1f(bgu.beat, beat);
    gl.uniform2f(bgu.resolution, sw, sh);
    gl.uniform1f(bgu.horizonGlow, p('horizonGlow', 0.08));
    gl.uniform1f(bgu.horizonPulseSpeed, p('horizonPulseSpeed', 1.2));
    gl.uniform1f(bgu.glowY, p('glowY', 0.62));
    gl.uniform1f(bgu.glowHeight, p('glowHeight', 0.12));
    gl.uniform1f(bgu.beatReactivity, p('beatReactivity', 0.15));
    gl.uniform1f(bgu.shadowSoftness, p('shadowSoftness', 0.5));
    for (let i = 0; i < MAX_SHIPS; i++)
      gl.uniform4f(bgu.shadows[i], shadowData[i*4], shadowData[i*4+1], shadowData[i*4+2], shadowData[i*4+3]);

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, landscapeTex);
    gl.uniform1i(bgu.landscape, 0);
    quad.draw();

    // ── Pass 2: Solid ships ──────────────────────────────────
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);

    gl.useProgram(shipProg);
    gl.uniformMatrix4fv(shu.projection, false, proj);
    gl.uniform3f(shu.lightDir, LIGHT[0] * 16384, LIGHT[1] * 16384, LIGHT[2] * 16384);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.uniform1i(shu.palette, 0);
    gl.uniform1f(shu.time, t);
    gl.uniform1f(shu.exhaustGlow, p('exhaustGlow', 2.0));
    gl.uniform1f(shu.exhaustPulse, p('exhaustPulse', 0.6));
    gl.uniform1f(shu.exhaustHueShift, p('exhaustHueShift', 0.0));

    for (let mi = 0; mi < shipMeshes.length; mi++) {
      const co = engine.getObject(shipMeshes[mi].objIndex);
      if (!co.on) continue;
      const mesh = shipMeshes[mi];
      const nm = buildNormalMat3(curMVs[mi]);
      gl.uniformMatrix4fv(shu.modelView, false, curMVs[mi]);
      gl.uniformMatrix3fv(shu.normalMat, false, nm);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);

    // ── Pass 3: DoF blur (half-res) ──────────────────────────
    const hw = sw >> 1, hh = sh >> 1;
    const dofStr = p('dofStrength', 0.35);

    if (dofStr > 0) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, dofBlurFBO1.fb);
      gl.viewport(0, 0, hw, hh);
      gl.useProgram(blurProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
      gl.uniform1i(blu.tex, 0);
      gl.uniform2f(blu.resolution, hw, hh);
      gl.uniform2f(blu.direction, 1.0, 0.0);
      quad.draw();

      gl.bindFramebuffer(gl.FRAMEBUFFER, dofBlurFBO2.fb);
      gl.bindTexture(gl.TEXTURE_2D, dofBlurFBO1.tex);
      gl.uniform2f(blu.direction, 0.0, 1.0);
      quad.draw();

      for (let i = 0; i < 2; i++) {
        gl.bindFramebuffer(gl.FRAMEBUFFER, dofBlurFBO1.fb);
        gl.bindTexture(gl.TEXTURE_2D, dofBlurFBO2.tex);
        gl.uniform2f(blu.direction, 1.0, 0.0);
        quad.draw();
        gl.bindFramebuffer(gl.FRAMEBUFFER, dofBlurFBO2.fb);
        gl.bindTexture(gl.TEXTURE_2D, dofBlurFBO1.tex);
        gl.uniform2f(blu.direction, 0.0, 1.0);
        quad.draw();
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, dofFBO.fb);
      gl.viewport(0, 0, sw, sh);
      gl.useProgram(dofProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
      gl.uniform1i(du.scene, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, dofBlurFBO2.tex);
      gl.uniform1i(du.blurred, 1);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, sceneFBO.depthTex);
      gl.uniform1i(du.depth, 2);
      gl.uniform1f(du.focusDepth, focusDepth);
      gl.uniform1f(du.dofStrength, dofStr);
      gl.uniform1f(du.dofRange, p('dofRange', 0.15));
      quad.draw();
    }

    const bloomSource = dofStr > 0 ? dofFBO : sceneFBO;

    // ── Pass 4: Bloom pipeline ───────────────────────────────
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloomSource.tex);
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

    // ── Pass 5: Composite to screen ──────────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bloomSource.tex);
    gl.uniform1i(cu.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(cu.bloomTight, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloomWideFBO1.tex);
    gl.uniform1i(cu.bloomWide, 2);
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.2));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.15));
    quad.draw();
  },

  destroy(gl) {
    for (const prog of [bgProg, shipProg, dofProg, bloomExtractProg, blurProg, compositeProg])
      if (prog) gl.deleteProgram(prog);
    if (quad) quad.destroy();
    if (landscapeTex) gl.deleteTexture(landscapeTex);
    if (paletteTex) gl.deleteTexture(paletteTex);
    for (const m of shipMeshes) {
      gl.deleteVertexArray(m.vao);
      for (const b of m.bufs) gl.deleteBuffer(b);
    }
    for (const fbo of [sceneFBO, dofFBO, dofBlurFBO1, dofBlurFBO2,
                        bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2])
      deleteFBO(gl, fbo);

    bgProg = shipProg = dofProg = null;
    bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    landscapeTex = paletteTex = null;
    shipMeshes = [];
    engine = null;
    sceneFBO = dofFBO = dofBlurFBO1 = dofBlurFBO2 = null;
    bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    frameCount = 0;
    prevTime = 0;
    focusDepth = 1.0;
  },
};
