/**
 * U2E — Remastered variant (Part 22)
 *
 * "Vector Part II" — 3D city flyover with 42 polygon objects (buildings,
 * trees, tunnels, roads, spaceship), driven by pre-baked animation — now
 * rendered with native WebGL at full display resolution instead of the
 * 320×200 CPU software rasterizer.
 *
 * Enhancements over classic:
 *   - GPU vertex pipeline at native resolution with depth buffer
 *   - Directional lighting with palette-ramp lookup via texture
 *   - Depth-based atmospheric fog for city depth
 *   - Spaceship exhaust glow (consistent with U2A remastered)
 *   - Dual-tier bloom post-processing
 *   - Beat-reactive bloom and brightness
 *   - Smooth intro transition matching classic 4-phase timing
 *
 * Original source: VISU/C/SCENE folder in SecondReality repo (code by PSI).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
import { createU2Engine } from './u2engine.js';
import {
  U2E_00M_base64, U2E_DataFiles, U2E_0AB_base64,
} from './data.js';

const ANIM_FRAME_RATE = 35;
const FRAME70_RATE = 70;

const PROJ_XO = 159, PROJ_YO = 99, ASPECT = 172 / 200;
const CLIP_X1 = 319;
const NEAR = 512, FAR = 10000000;

const LIGHT = [12118 / 16384, 10603 / 16384, 3030 / 16834];

const F_GOURAUD = 0x1000;
const F_SHADE32 = 0x0C00;

const TRANSITION_FRAMES_FADE_IN = 33;
const TRANSITION_FRAMES_WAIT = 16;
const TRANSITION_FRAMES_REVEAL = 32;
const ANIM_START_FRAME70 = TRANSITION_FRAMES_FADE_IN + TRANSITION_FRAMES_WAIT + TRANSITION_FRAMES_REVEAL;

// ── Object vertex shader ─────────────────────────────────────────────

const OBJ_VERT = `#version 300 es
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
out float vViewZ;

void main() {
  vec4 viewPos = uModelView * vec4(aPosition, 1.0);
  gl_Position = uProjection * viewPos;
  vNormal = normalize(uNormalMat * aNormal);
  vBasePalIdx = aBasePalIdx;
  vShadeDiv = aShadeDiv;
  vViewZ = viewPos.z;
}
`;

// ── Object fragment shader ───────────────────────────────────────────

const OBJ_FRAG = `#version 300 es
precision highp float;

in vec3 vNormal;
in float vBasePalIdx;
in float vShadeDiv;
in float vViewZ;

layout(location = 0) out vec4 fragColor;

uniform vec3 uLightDir;
uniform sampler2D uPalette;
uniform float uTime;

uniform float uIsShip;
uniform float uExhaustGlow;
uniform float uExhaustPulse;
uniform float uExhaustHueShift;

uniform float uFogDensity;
uniform float uFogNear;
uniform float uFogFar;
uniform vec3 uFogColor;

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

  // Exhaust glow (only on spaceship objects, consistent with U2A)
  if (uIsShip > 0.5) {
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
  }

  // Depth fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vViewZ) * uFogDensity;
  color = mix(color, uFogColor, fogFactor);

  fragColor = vec4(color, 1.0);
}
`;

// ── Transition shader (white fade overlay) ───────────────────────────

const TRANSITION_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uAlpha;
void main() {
  fragColor = vec4(1.0, 1.0, 1.0, uAlpha);
}
`;

// ── Sky background shader (stars + volumetric nebula) ────────────────

const SKY_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

uniform float uStarDensity;
uniform float uStarBrightness;
uniform float uStarTwinkle;
uniform float uNebulaIntensity;
uniform float uNebulaPulseSpeed;
uniform float uNebulaBeatReactivity;
uniform float uNebulaScale;
uniform float uNebulaSwirl;

// ── Noise primitives (same as PAM) ───────────────────────────────

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

float noise3D(vec3 p) {
  float zi = floor(p.z);
  float zf = fract(p.z);
  zf = zf * zf * (3.0 - 2.0 * zf);
  float a = noise(p.xy + zi * 17.17);
  float b = noise(p.xy + (zi + 1.0) * 17.17);
  return mix(a, b, zf);
}

float fbm3D(vec3 p) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 4; i++) {
    val += amp * noise3D(p * freq);
    freq *= 2.0;
    amp *= 0.5;
  }
  return val;
}

// ── Star field (jittered cells, PAM-style) ───────────────────────

vec3 starField(vec2 uv) {
  vec2 pixCoord = uv * uResolution;
  float cellSize = mix(40.0, 12.0, uStarDensity);
  vec2 cell = floor(pixCoord / cellSize);
  vec2 cellUV = fract(pixCoord / cellSize);

  float presence = hash21(cell * 127.1 + 311.7);
  if (presence < 1.0 - uStarDensity * 0.15) return vec3(0.0);

  vec2 starPos = vec2(
    hash21(cell * 269.5 + 183.3),
    hash21(cell * 413.1 + 271.9)
  ) * 0.6 + 0.2;

  float dist = length(cellUV - starPos) * cellSize;
  float star = smoothstep(1.8, 0.0, dist);

  float tier = hash21(cell * 731.1 + 97.3);
  float brightness = tier < 0.5 ? 0.16 : (tier < 0.8 ? 0.48 : 1.0);

  float phase = hash21(cell * 997.3 + 53.7) * 6.2832;
  float speed = 1.0 + hash21(cell * 571.7) * 2.0;
  float twinkle = 1.0 + uStarTwinkle * sin(uTime * speed + phase) * 0.3;

  return vec3(brightness * star * twinkle * uStarBrightness);
}

// ── Raymarched volumetric nebula (adapted from PAM blast) ────────

const int NEB_STEPS = 10;
const int NEB_LIGHT_STEPS = 3;
const float NEB_ABSORPTION = 6.0;

float nebulaDensity(vec3 pos, float t) {
  float swirl = t * uNebulaSwirl * 1.5;
  float cs = cos(swirl), sn = sin(swirl);
  vec3 sp = vec3(pos.x * cs - pos.z * sn, pos.y, pos.x * sn + pos.z * cs);

  float s = uNebulaScale;
  vec3 drift1 = vec3(sin(t * 2.0), cos(t * 1.5), sin(t * 1.7)) * 0.8;
  vec3 drift2 = vec3(cos(t * 1.8), sin(t * 2.2), cos(t * 1.3)) * 0.6;
  float n1 = fbm3D(sp * s + drift1);
  float n2 = fbm3D(sp * s * 2.0 + drift2 + 50.0);

  float density = n1 * 0.6 + n2 * 0.4;
  density = smoothstep(0.28, 0.58, density);

  float hDist = length(pos.xz);
  return density * smoothstep(2.0, 0.3, hDist);
}

float nebulaLightMarch(vec3 pos, float t) {
  vec3 lightDir = normalize(vec3(0.5, 0.8, -0.3));
  float totalDensity = 0.0;
  for (int i = 0; i < NEB_LIGHT_STEPS; i++) {
    pos += lightDir * 0.1;
    totalDensity += nebulaDensity(pos, t) * 0.1;
  }
  return exp(-totalDensity * NEB_ABSORPTION * 0.6);
}

vec3 nebula(vec2 uv) {
  float t = uTime * 0.1;
  float aspect = uResolution.x / uResolution.y;
  vec2 screenPos = (uv - 0.5) * vec2(aspect, 1.0);

  float depth = 1.2;
  float stepSize = (depth * 2.0) / float(NEB_STEPS);

  float transmittance = 1.0;
  vec3 accumulated = vec3(0.0);

  for (int i = 0; i < NEB_STEPS; i++) {
    float z = -depth + (float(i) + 0.5) * stepSize;
    vec3 pos = vec3(screenPos, z);
    float density = nebulaDensity(pos, t);

    if (density > 0.005) {
      float stepTrans = exp(-density * stepSize * NEB_ABSORPTION);
      float lightAmount = nebulaLightMarch(pos, t);

      vec3 cloudColor = mix(
        vec3(0.06, 0.01, 0.12),
        vec3(0.3, 0.06, 0.4),
        lightAmount
      );
      cloudColor = mix(cloudColor, vec3(0.45, 0.1, 0.5), density * 0.4);

      vec3 stepColor = cloudColor * (lightAmount * 1.3 + 0.25);
      accumulated += stepColor * (1.0 - stepTrans) * transmittance;
      transmittance *= stepTrans;

      if (transmittance < 0.01) break;
    }
  }

  float pulse = sin(uTime * uNebulaPulseSpeed) * 0.5 + 0.5;
  float beatMod = pow(1.0 - uBeat, 6.0) * uNebulaBeatReactivity;
  accumulated *= 0.8 + 0.2 * pulse + beatMod * 0.3;

  return accumulated * uNebulaIntensity;
}

void main() {
  vec3 neb = nebula(vUV);

  vec3 stars = starField(vUV);
  float nebLuma = dot(neb, vec3(0.299, 0.587, 0.114))
                / max(uNebulaIntensity, 0.001);
  stars *= 1.0 - smoothstep(0.0, 0.15, nebLuma);

  fragColor = vec4(neb + stars, 1.0);
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
uniform float uScanlineStr;
uniform vec2 uResolution;
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.15)
    + wide  * (uBloomStr * 0.5 + beatPulse * 0.1);
  float scanline = 1.0 - uScanlineStr * mod(gl_FragCoord.y, 2.0);
  color *= scanline;
  fragColor = vec4(color, 1.0);
}
`;

// ── Helpers ──────────────────────────────────────────────────────────

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

  const depthRB = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRB);
  gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);

  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRB);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { fb, tex, depthRB };
}

function deleteFBO(gl, fbo) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  if (fbo.tex) gl.deleteTexture(fbo.tex);
  if (fbo.depthRB) gl.deleteRenderbuffer(fbo.depthRB);
}

function buildPaletteRGBA(scene) {
  const rgba = new Uint8Array(256 * 4);
  const k = 255 / 63;
  for (let i = 0; i < 256; i++) {
    rgba[i * 4 + 0] = Math.round(Math.min(scene[i * 3 + 0], 63) * k);
    rgba[i * 4 + 1] = Math.round(Math.min(scene[i * 3 + 1], 63) * k);
    rgba[i * 4 + 2] = Math.round(Math.min(scene[i * 3 + 2], 63) * k);
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

function isShipName(name) {
  return name && name.length >= 4 && name[1] === 's' && name[2] === '0' && name[3] === '1';
}

function extractObjectGeometry(gl, obj) {
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

function buildProjectionMat4(fovDeg) {
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
  const nf = FAR - NEAR;
  return new Float32Array([
    sx,  0,    0,                       0,
    0,  -sy,   0,                       0,
    ox,  oy,   (FAR + NEAR) / nf,       1,
    0,   0,   -2 * FAR * NEAR / nf,     0,
  ]);
}

// ── Module state ─────────────────────────────────────────────────────

let engine = null;
let frameCount = 0;

let objProg, transitionProg, skyProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let paletteTex = null;
let palette768 = null;

let meshes = [];

let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let ou = {}, tu = {}, su = {}, beu = {}, blu = {}, cu = {};

// ── Effect interface ─────────────────────────────────────────────────

export default {
  label: 'u2e (remastered)',

  params: [
    gp('Sky',              { key: 'starDensity',    label: 'Star Density',        type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.25 }),
    gp('Sky',              { key: 'starBrightness', label: 'Star Brightness',     type: 'float', min: 0,   max: 2,    step: 0.01,  default: 1.0 }),
    gp('Sky',              { key: 'starTwinkle',    label: 'Star Twinkle',        type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.3 }),
    gp('Sky',              { key: 'nebulaIntensity',label: 'Nebula Intensity',    type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.44 }),
    gp('Sky',              { key: 'nebulaPulseSpeed',label:'Nebula Pulse',        type: 'float', min: 0,   max: 3,    step: 0.01,  default: 0.89 }),
    gp('Sky',              { key: 'nebulaBeatReactivity',label:'Nebula Beat',     type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.2 }),
    gp('Sky',              { key: 'nebulaScale',    label: 'Nebula Scale',        type: 'float', min: 0.5, max: 5,    step: 0.1,   default: 3.8 }),
    gp('Sky',              { key: 'nebulaSwirl',    label: 'Nebula Swirl',        type: 'float', min: 0,   max: 2,    step: 0.01,  default: 0.34 }),
    gp('Atmosphere',       { key: 'fogDensity',     label: 'Fog Density',         type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.08 }),
    gp('Atmosphere',       { key: 'fogNear',        label: 'Fog Near',            type: 'float', min: 0,   max: 50000,step: 100,   default: 5700 }),
    gp('Atmosphere',       { key: 'fogFar',         label: 'Fog Far',             type: 'float', min: 1000,max: 200000,step: 500,  default: 80000 }),
    gp('Atmosphere',       { key: 'fogR',           label: 'Fog Red',             type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.76 }),
    gp('Atmosphere',       { key: 'fogG',           label: 'Fog Green',           type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.25 }),
    gp('Atmosphere',       { key: 'fogB',           label: 'Fog Blue',            type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.22 }),
    gp('Exhaust Glow',     { key: 'exhaustGlow',    label: 'Glow Intensity',      type: 'float', min: 0,   max: 5,    step: 0.05,  default: 2.05 }),
    gp('Exhaust Glow',     { key: 'exhaustPulse',   label: 'Pulse Amount',        type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.60 }),
    gp('Exhaust Glow',     { key: 'exhaustHueShift',label: 'Hue Shift',           type: 'float', min: -0.5,max: 0.5,  step: 0.01,  default: 0.29 }),
    gp('Post-Processing',  { key: 'bloomThreshold', label: 'Bloom Threshold',     type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.25 }),
    gp('Post-Processing',  { key: 'bloomStrength',  label: 'Bloom Strength',      type: 'float', min: 0,   max: 2,    step: 0.01,  default: 0.04 }),
    gp('Post-Processing',  { key: 'beatReactivity', label: 'Beat Reactivity',     type: 'float', min: 0,   max: 1,    step: 0.01,  default: 0.20 }),
    gp('Post-Processing',  { key: 'scanlineStr',    label: 'Scanlines',           type: 'float', min: 0,   max: 0.5,  step: 0.01,  default: 0.01 }),
  ],

  init(gl) {
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);
    transitionProg = createProgram(gl, FULLSCREEN_VERT, TRANSITION_FRAG);
    skyProg = createProgram(gl, FULLSCREEN_VERT, SKY_FRAG);

    {
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, OBJ_VERT);
      gl.compileShader(vs);
      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, OBJ_FRAG);
      gl.compileShader(fs);
      objProg = gl.createProgram();
      gl.attachShader(objProg, vs);
      gl.attachShader(objProg, fs);
      gl.bindAttribLocation(objProg, 0, 'aPosition');
      gl.bindAttribLocation(objProg, 1, 'aNormal');
      gl.bindAttribLocation(objProg, 2, 'aBasePalIdx');
      gl.bindAttribLocation(objProg, 3, 'aShadeDiv');
      gl.linkProgram(objProg);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    }

    quad = createFullscreenQuad(gl);

    engine = createU2Engine();
    engine.setClippingY(25, 175);
    palette768 = engine.loadData(U2E_00M_base64, U2E_DataFiles, U2E_0AB_base64);
    frameCount = 0;

    paletteTex = gl.createTexture();
    const palRGBA = buildPaletteRGBA(palette768);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, palRGBA);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    meshes = [];
    for (let c = 1; c < engine.objectCount; c++) {
      const co = engine.getObject(c);
      if (!co || !co.o || !co.o.pd) continue;
      const mesh = extractObjectGeometry(gl, co.o);
      mesh.objIndex = c;
      mesh.isShip = isShipName(co.o.name);
      meshes.push(mesh);
    }

    ou = {
      modelView: gl.getUniformLocation(objProg, 'uModelView'),
      projection: gl.getUniformLocation(objProg, 'uProjection'),
      normalMat: gl.getUniformLocation(objProg, 'uNormalMat'),
      lightDir: gl.getUniformLocation(objProg, 'uLightDir'),
      palette: gl.getUniformLocation(objProg, 'uPalette'),
      time: gl.getUniformLocation(objProg, 'uTime'),
      isShip: gl.getUniformLocation(objProg, 'uIsShip'),
      exhaustGlow: gl.getUniformLocation(objProg, 'uExhaustGlow'),
      exhaustPulse: gl.getUniformLocation(objProg, 'uExhaustPulse'),
      exhaustHueShift: gl.getUniformLocation(objProg, 'uExhaustHueShift'),
      fogDensity: gl.getUniformLocation(objProg, 'uFogDensity'),
      fogNear: gl.getUniformLocation(objProg, 'uFogNear'),
      fogFar: gl.getUniformLocation(objProg, 'uFogFar'),
      fogColor: gl.getUniformLocation(objProg, 'uFogColor'),
    };

    tu = {
      alpha: gl.getUniformLocation(transitionProg, 'uAlpha'),
    };

    su = {
      time: gl.getUniformLocation(skyProg, 'uTime'),
      beat: gl.getUniformLocation(skyProg, 'uBeat'),
      resolution: gl.getUniformLocation(skyProg, 'uResolution'),
      starDensity: gl.getUniformLocation(skyProg, 'uStarDensity'),
      starBrightness: gl.getUniformLocation(skyProg, 'uStarBrightness'),
      starTwinkle: gl.getUniformLocation(skyProg, 'uStarTwinkle'),
      nebulaIntensity: gl.getUniformLocation(skyProg, 'uNebulaIntensity'),
      nebulaPulseSpeed: gl.getUniformLocation(skyProg, 'uNebulaPulseSpeed'),
      nebulaBeatReactivity: gl.getUniformLocation(skyProg, 'uNebulaBeatReactivity'),
      nebulaScale: gl.getUniformLocation(skyProg, 'uNebulaScale'),
      nebulaSwirl: gl.getUniformLocation(skyProg, 'uNebulaSwirl'),
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
      resolution: gl.getUniformLocation(compositeProg, 'uResolution'),
    };
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;

    // ── Resize FBOs ──────────────────────────────────────────
    if (sw !== fboW || sh !== fboH) {
      deleteFBO(gl, sceneFBO);
      deleteFBO(gl, bloomFBO1);
      deleteFBO(gl, bloomFBO2);
      deleteFBO(gl, bloomWideFBO1);
      deleteFBO(gl, bloomWideFBO2);
      sceneFBO      = createSceneFBO(gl, sw, sh);
      bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    const frame70 = Math.floor(t * FRAME70_RATE);

    // ── Intro transition phases ──────────────────────────────
    if (frame70 < ANIM_START_FRAME70) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, sw, sh);
      gl.clearColor(1, 1, 1, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (frame70 >= TRANSITION_FRAMES_FADE_IN + TRANSITION_FRAMES_WAIT) {
        const lev = (frame70 - (TRANSITION_FRAMES_FADE_IN + TRANSITION_FRAMES_WAIT)) / TRANSITION_FRAMES_REVEAL;
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(transitionProg);
        gl.uniform1f(tu.alpha, 1.0 - lev);
        quad.draw();
        gl.disable(gl.BLEND);
      }
      return;
    }

    // ── Advance animation ────────────────────────────────────
    const animFrame = Math.floor((frame70 - ANIM_START_FRAME70) / 2);

    if (animFrame < frameCount || engine.baked) {
      engine.seekFrame(animFrame);
    } else {
      const steps = Math.min(animFrame - frameCount, 500);
      for (let i = 0; i < steps && !engine.ended; i++) engine.stepOneAnimationFrame();
    }
    frameCount = animFrame;

    const proj = buildProjectionMat4(engine.fov);
    const cam = engine.camera;

    // ── Pass 1a: Sky background → sceneFBO ─────────────────────
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.depthMask(false);
    gl.useProgram(skyProg);
    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);
    gl.uniform2f(su.resolution, sw, sh);
    gl.uniform1f(su.starDensity, p('starDensity', 0.25));
    gl.uniform1f(su.starBrightness, p('starBrightness', 1.0));
    gl.uniform1f(su.starTwinkle, p('starTwinkle', 0.3));
    gl.uniform1f(su.nebulaIntensity, p('nebulaIntensity', 0.44));
    gl.uniform1f(su.nebulaPulseSpeed, p('nebulaPulseSpeed', 0.89));
    gl.uniform1f(su.nebulaBeatReactivity, p('nebulaBeatReactivity', 0.2));
    gl.uniform1f(su.nebulaScale, p('nebulaScale', 3.8));
    gl.uniform1f(su.nebulaSwirl, p('nebulaSwirl', 0.34));
    quad.draw();

    // ── Pass 1b: 3D city objects → sceneFBO ──────────────────
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);
    gl.depthMask(true);

    gl.useProgram(objProg);
    gl.uniformMatrix4fv(ou.projection, false, proj);
    gl.uniform3f(ou.lightDir, LIGHT[0] * 16384, LIGHT[1] * 16384, LIGHT[2] * 16384);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, paletteTex);
    gl.uniform1i(ou.palette, 0);
    gl.uniform1f(ou.time, t);
    gl.uniform1f(ou.exhaustGlow, p('exhaustGlow', 2.05));
    gl.uniform1f(ou.exhaustPulse, p('exhaustPulse', 0.60));
    gl.uniform1f(ou.exhaustHueShift, p('exhaustHueShift', 0.29));
    gl.uniform1f(ou.fogDensity, p('fogDensity', 0.08));
    gl.uniform1f(ou.fogNear, p('fogNear', 5700));
    gl.uniform1f(ou.fogFar, p('fogFar', 80000));
    gl.uniform3f(ou.fogColor, p('fogR', 0.76), p('fogG', 0.25), p('fogB', 0.22));

    for (let mi = 0; mi < meshes.length; mi++) {
      const mesh = meshes[mi];
      const co = engine.getObject(mesh.objIndex);
      if (!co || !co.on) continue;
      const mv = buildModelViewMat4(co.o.r0, cam);
      const nm = buildNormalMat3(mv);
      gl.uniformMatrix4fv(ou.modelView, false, mv);
      gl.uniformMatrix3fv(ou.normalMat, false, nm);
      gl.uniform1f(ou.isShip, mesh.isShip ? 1.0 : 0.0);
      gl.bindVertexArray(mesh.vao);
      gl.drawArrays(gl.TRIANGLES, 0, mesh.vertCount);
    }
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);

    // ── Pass 2: Bloom pipeline ───────────────────────────────
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

    // ── Pass 3: Composite to screen ──────────────────────────
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
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.04));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.20));
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.01));
    gl.uniform2f(cu.resolution, sw, sh);
    quad.draw();
  },

  destroy(gl) {
    for (const prog of [objProg, transitionProg, skyProg, bloomExtractProg, blurProg, compositeProg])
      if (prog) gl.deleteProgram(prog);
    if (quad) quad.destroy();
    if (paletteTex) gl.deleteTexture(paletteTex);
    for (const m of meshes) {
      gl.deleteVertexArray(m.vao);
      for (const b of m.bufs) gl.deleteBuffer(b);
    }
    for (const fbo of [sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2])
      deleteFBO(gl, fbo);

    objProg = transitionProg = skyProg = null;
    bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    paletteTex = null;
    palette768 = null;
    meshes = [];
    engine = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    frameCount = 0;
  },
};
