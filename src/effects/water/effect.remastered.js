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
import { gp } from '../index.js';

const FRAME_RATE = 70;
const SCP_MAX = 390;

// ── Palette presets ──────────────────────────────────────────────
// Each preset defines a 3×3 color remapping matrix (column-major).
// Applied as: output = mat3(colorR, colorG, colorB) * sceneRGB
// Classic = identity; other themes remap the raymarched scene colors.
// The sword texture is intentionally excluded from the remap.

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

uniform float uTime;
uniform float uBeat;
uniform float uFade;
uniform float uScrollOffset;
uniform vec2 uResolution;
uniform sampler2D uSwordTex;

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
uniform float uSwordX;
uniform float uSwordY;
uniform float uSwordZ;
uniform float uSwordPitch;
uniform float uSwordYaw;
uniform float uSwordRoll;
uniform float uSwordTilt;
uniform float uSwordWidth;
uniform float uSwordHeight;
uniform vec4 uSphere0;
uniform vec4 uSphere1;
uniform vec4 uSphere2;
uniform vec3 uColorR;
uniform vec3 uColorG;
uniform vec3 uColorB;

#define MAX_STEPS 80
#define MAX_DIST 50.0
#define SURF_DIST 0.002
#define PI 3.14159265

vec4 SPHERE_BASE[3];

vec3 spherePos[3];
float beatPulse;
float swordBottom;

// Sword plane frame: origin + two tangent axes + normal
vec3 swordOrigin;
vec3 swordN;
vec3 swordU;
vec3 swordV;
float swordHalfW;
float swordH;

void computeState() {
  SPHERE_BASE[0] = uSphere0;
  SPHERE_BASE[1] = uSphere1;
  SPHERE_BASE[2] = uSphere2;
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

  swordHalfW = uSwordWidth * 0.5;
  swordH = uSwordHeight;

  // Sword rises from the water over the first ~2.5 seconds.
  // Start partially emerged (tip already above water), then rise to full.
  float rise = clamp(uTime * 0.4, 0.0, 1.0);
  rise = rise * rise * (3.0 - 2.0 * rise);
  swordBottom = mix(-swordH * 0.5, -swordH * 0.1, rise);

  // Build oriented sword plane from pitch/yaw.
  // Pitch tilts the top toward the camera (positive = lean forward).
  // Yaw rotates around Y axis.
  float pitch = uSwordPitch * PI / 180.0;
  float yaw   = uSwordYaw   * PI / 180.0;
  float cp = cos(pitch), sp = sin(pitch);
  float cy = cos(yaw),   sy = sin(yaw);

  // Base normal (0, sin(pitch), -cos(pitch)) → points up-and-toward-camera
  vec3 n = vec3(0.0, sp, -cp);
  swordN = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);

  // Horizontal tangent
  vec3 baseU = vec3(cy, 0.0, -sy);

  // Vertical tangent (up direction on the tilted plane)
  vec3 bv = vec3(0.0, cp, sp);
  vec3 baseV = vec3(bv.x * cy + bv.z * sy, bv.y, -bv.x * sy + bv.z * cy);

  // Roll: rotate U/V around the plane normal so the sword image can spin.
  // At roll=0 the wide axis is horizontal; at roll=90 it points upward.
  float roll = uSwordRoll * PI / 180.0;
  float cro = cos(roll), sro = sin(roll);
  swordU = baseU * cro + baseV * sro;
  swordV = -baseU * sro + baseV * cro;

  // Tilt: rotate V and N around the sword's own U (long) axis
  float tilt = uSwordTilt * PI / 180.0;
  float ct = cos(tilt), st = sin(tilt);
  vec3 tiltedV = swordV * ct + swordN * st;
  vec3 tiltedN = -swordV * st + swordN * ct;
  swordV = tiltedV;
  swordN = tiltedN;

  swordOrigin = vec3(uSwordX, uSwordY, uSwordZ);
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
  float swordDist = abs(xz.y - swordOrigin.z);
  h += sin(swordDist * 12.0 - uTime * uRippleSpeed * 1.5) * uRippleAmp * 0.4 / (1.0 + swordDist * 3.0);
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

// Analytical ray vs oriented plane for the sword billboard.
// The plane is defined by swordOrigin, swordN, swordU, swordV (computed in computeState).
// Dark/black pixels are treated as transparent.
float hitSword(vec3 ro, vec3 rd, out vec3 outCol) {
  outCol = vec3(0.0);
  float denom = dot(rd, swordN);
  if (abs(denom) < 0.0001) return -1.0;
  float t = dot(swordOrigin - ro, swordN) / denom;
  if (t <= 0.001) return -1.0;
  vec3 p = ro + rd * t;
  vec3 rel = p - swordOrigin;
  float lu = dot(rel, swordU);
  float lv = dot(rel, swordV);
  if (abs(lu) > swordHalfW) return -1.0;
  if (lv < swordBottom || lv > swordBottom + swordH) return -1.0;

  float scrollNorm = uScrollOffset / float(${FONT_W});
  float localU = (lu + swordHalfW) / (swordHalfW * 2.0);
  float texU = scrollNorm * 1.3 + 0.25 - localU;
  if (texU < 0.0 || texU > 1.0) return -1.0;
  float v = (lv - swordBottom) / swordH;
  vec4 s = texture(uSwordTex, vec2(texU, v));
  float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
  if (lum < 0.015) return -1.0;
  outCol = s.rgb * uSwordBrightness;
  return t;
}

vec3 lighting(vec3 p, vec3 N, vec3 V, vec3 baseColor, float specMul) {
  vec3 L1 = normalize(vec3(0.4, 0.8, -0.3));
  vec3 L2 = normalize(vec3(-0.6, 0.3, 0.5));
  float diff1 = max(dot(N, L1), 0.0);
  float diff2 = max(dot(N, L2), 0.0) * 0.25;
  vec3 H = normalize(L1 + V);

  // Tight primary specular (subtle, small hotspot)
  float specPow = uSpecularPower + beatPulse * 32.0;
  float spec = pow(max(dot(N, H), 0.0), specPow) * specMul * 0.4;

  // Broad secondary glow: wide, soft highlight with a warm-blue tint
  float glow = pow(max(dot(N, H), 0.0), specPow * 0.06) * specMul * 0.2;
  vec3 glowColor = vec3(0.15, 0.2, 0.5) * glow;

  float rim = pow(1.0 - max(dot(N, V), 0.0), 4.0) * 0.25;
  vec3 ambient = baseColor * 0.15;
  vec3 diffuse = baseColor * (diff1 * 0.6 + diff2 * 0.2);
  vec3 specular = vec3(0.7, 0.75, 1.0) * spec;
  vec3 rimColor = vec3(0.1, 0.12, 0.3) * rim;
  return ambient + diffuse + specular + glowColor + rimColor;
}

// Check reflected ray for sword hit, return sword color or fallback
vec3 reflectSword(vec3 ro, vec3 rd) {
  vec3 sc;
  float st = hitSword(ro, rd, sc);
  if (st > 0.0) return sc;
  return vec3(0.0);
}

vec3 shade(vec3 ro, vec3 rd, float t, int objId) {
  vec3 p = ro + rd * t;
  vec3 V = -rd;

  if (objId >= 1) {
    int si = objId - 1;
    vec3 N = normalize(p - spherePos[si]);
    vec3 R = reflect(rd, N);
    float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelExp);
    fresnel = clamp(fresnel, 0.15, 1.0);

    vec3 chromeColor = vec3(0.06, 0.08, 0.35);
    vec3 lit = lighting(p, N, V, chromeColor, 2.5);

    // Reflected ray: check sword first, then scene
    vec3 envColor = vec3(0.0);
    vec3 swordRef;
    float swordRT = hitSword(p + N * 0.01, R, swordRef);
    int rId;
    float rt = march(p + N * 0.01, R, rId);

    if (swordRT > 0.0 && (rt < 0.0 || swordRT < rt)) {
      envColor = swordRef;
    } else if (rt > 0.0 && rId == 0) {
      vec3 rp = p + N * 0.01 + R * rt;
      vec3 wN = waterNormal(rp);
      vec3 waterCol = vec3(0.05, 0.07, 0.25) * (1.0 - uWaterDarkness * 0.7);
      vec3 wR = reflect(R, wN);
      envColor = waterCol + reflectSword(rp + wN * 0.01, wR) * 0.5;
    } else if (rt > 0.0 && rId >= 1) {
      int si2 = rId - 1;
      vec3 rp = p + N * 0.01 + R * rt;
      vec3 sN = normalize(rp - spherePos[si2]);
      envColor = lighting(rp, sN, -R, vec3(0.06, 0.08, 0.35), 1.5);
    }

    vec3 reflection = envColor * uChromeReflect;
    return mix(lit, lit + reflection, fresnel);
  }

  // Water shading
  vec3 N = waterNormal(p);
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), uFresnelExp * 0.7);
  fresnel = clamp(fresnel, 0.08, 1.0);

  vec3 waterBase = vec3(0.05, 0.07, 0.25) * (1.0 - uWaterDarkness * 0.7);
  vec3 lit = lighting(p, N, V, waterBase, 1.2);

  vec3 R = reflect(rd, N);
  vec3 reflColor = vec3(0.0);

  // Reflected ray from water: check sword first, then scene
  vec3 swordRef;
  float swordRT = hitSword(p + N * 0.01, R, swordRef);
  int rId;
  float rt = march(p + N * 0.01, R, rId);

  if (swordRT > 0.0 && (rt < 0.0 || swordRT < rt)) {
    reflColor = swordRef;
  } else if (rt > 0.0 && rId >= 1) {
    int si = rId - 1;
    vec3 rp = p + N * 0.01 + R * rt;
    vec3 sN = normalize(rp - spherePos[si]);
    vec3 sR = reflect(R, sN);
    vec3 sphereChrome = vec3(0.06, 0.08, 0.35);
    reflColor = lighting(rp, sN, -R, sphereChrome, 2.0);
    reflColor += reflectSword(rp + sN * 0.01, sR) * uChromeReflect * 0.5;
  }

  return mix(lit, lit + reflColor, fresnel);
}

void main() {
  computeState();

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

  // Check sword billboard (analytical) vs scene (raymarched)
  vec3 swordCol;
  float swordT = hitSword(ro, rd, swordCol);

  int objId;
  float sceneT = march(ro, rd, objId);

  vec3 col;
  if (swordT > 0.0 && (sceneT < 0.0 || swordT < sceneT)) {
    col = swordCol;
  } else if (sceneT > 0.0) {
    col = clamp(mat3(uColorR, uColorG, uColorB) * shade(ro, rd, sceneT, objId), 0.0, 1.0);
  } else {
    col = clamp(mat3(uColorR, uColorG, uColorB) * vec3(0.01, 0.015, 0.06), 0.0, 1.0);
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
    gp('Palette', { key: 'palette', label: 'Theme', type: 'select', options: PALETTES.map((p, i) => ({ value: i, label: p.name })), default: 0 }),

    gp('Animation', { key: 'bobAmplitude', label: 'Bob Amplitude', type: 'float', min: 0.0, max: 2.0, step: 0.01, default: 0.5 }),
    gp('Animation', { key: 'bobSpeed', label: 'Bob Speed', type: 'float', min: 0.1, max: 4.0, step: 0.05, default: 0.7 }),
    gp('Animation', { key: 'beatScale', label: 'Beat Bob Scale', type: 'float', min: 0, max: 1, step: 0.01, default: 0.15 }),

    gp('Scene', { key: 'rippleFreq', label: 'Ripple Frequency', type: 'float', min: 1, max: 30, step: 0.5, default: 8.0 }),
    gp('Scene', { key: 'rippleSpeed', label: 'Ripple Speed', type: 'float', min: 0.2, max: 6.0, step: 0.1, default: 2.0 }),
    gp('Scene', { key: 'rippleAmp', label: 'Ripple Amplitude', type: 'float', min: 0.001, max: 0.15, step: 0.001, default: 0.03 }),
    gp('Scene', { key: 'waterDarkness', label: 'Water Darkness', type: 'float', min: 0, max: 1, step: 0.01, default: 0.31 }),
    gp('Scene', { key: 'specularPower', label: 'Specular Power', type: 'float', min: 8, max: 512, step: 1, default: 256 }),
    gp('Scene', { key: 'fresnelExp', label: 'Fresnel Exponent', type: 'float', min: 0.5, max: 10, step: 0.1, default: 3.0 }),
    gp('Scene', { key: 'chromeReflect', label: 'Chrome Reflectivity', type: 'float', min: 0, max: 4, step: 0.05, default: 2.5 }),

    gp('Camera', { key: 'cameraHeight', label: 'Height', type: 'float', min: 0.5, max: 5.0, step: 0.1, default: 2.2 }),
    gp('Camera', { key: 'cameraAngle', label: 'Angle', type: 'float', min: -30, max: 30, step: 0.5, default: 5.0 }),

    gp('Sword', { key: 'swordBrightness', label: 'Brightness', type: 'float', min: 0.2, max: 6, step: 0.05, default: 1.80 }),
    gp('Sword', { key: 'swordX', label: 'X', type: 'float', min: -4, max: 4, step: 0.1, default: 0.0 }),
    gp('Sword', { key: 'swordY', label: 'Y', type: 'float', min: -1, max: 3, step: 0.05, default: -0.10 }),
    gp('Sword', { key: 'swordZ', label: 'Z', type: 'float', min: -3, max: 3, step: 0.1, default: -1.0 }),
    gp('Sword', { key: 'swordPitch', label: 'Pitch', type: 'float', min: -90, max: 90, step: 1, default: 4 }),
    gp('Sword', { key: 'swordYaw', label: 'Yaw', type: 'float', min: -45, max: 45, step: 1, default: -5 }),
    gp('Sword', { key: 'swordRoll', label: 'Roll', type: 'float', min: -180, max: 180, step: 1, default: 50 }),
    gp('Sword', { key: 'swordTilt', label: 'Tilt', type: 'float', min: -90, max: 90, step: 1, default: -15 }),
    gp('Sword', { key: 'swordWidth', label: 'Width', type: 'float', min: 2, max: 16, step: 0.5, default: 10.0 }),
    gp('Sword', { key: 'swordHeight', label: 'Height', type: 'float', min: 0.2, max: 3, step: 0.05, default: 0.45 }),

    gp('Sphere 1 (L)', { key: 'sphere0X', label: 'X', type: 'float', min: -5, max: 5, step: 0.1, default: -1.4 }),
    gp('Sphere 1 (L)', { key: 'sphere0Y', label: 'Y', type: 'float', min: -1, max: 4, step: 0.05, default: 0.20 }),
    gp('Sphere 1 (L)', { key: 'sphere0Z', label: 'Z', type: 'float', min: -3, max: 3, step: 0.1, default: -3.0 }),
    gp('Sphere 1 (L)', { key: 'sphere0R', label: 'Radius', type: 'float', min: 0.2, max: 3, step: 0.05, default: 1.3 }),

    gp('Sphere 2 (C)', { key: 'sphere1X', label: 'X', type: 'float', min: -5, max: 5, step: 0.1, default: -1.9 }),
    gp('Sphere 2 (C)', { key: 'sphere1Y', label: 'Y', type: 'float', min: -1, max: 4, step: 0.05, default: 0.05 }),
    gp('Sphere 2 (C)', { key: 'sphere1Z', label: 'Z', type: 'float', min: -3, max: 3, step: 0.1, default: 1.3 }),
    gp('Sphere 2 (C)', { key: 'sphere1R', label: 'Radius', type: 'float', min: 0.1, max: 2, step: 0.05, default: 1.85 }),

    gp('Sphere 3 (R)', { key: 'sphere2X', label: 'X', type: 'float', min: -5, max: 5, step: 0.1, default: 2.5 }),
    gp('Sphere 3 (R)', { key: 'sphere2Y', label: 'Y', type: 'float', min: -1, max: 4, step: 0.05, default: 0.65 }),
    gp('Sphere 3 (R)', { key: 'sphere2Z', label: 'Z', type: 'float', min: -3, max: 3, step: 0.1, default: -2.1 }),
    gp('Sphere 3 (R)', { key: 'sphere2R', label: 'Radius', type: 'float', min: 0.2, max: 3, step: 0.05, default: 1.15 }),

    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1, step: 0.01, default: 0.45 }),
    gp('Post-Processing', { key: 'bloomTightStr', label: 'Bloom Tight', type: 'float', min: 0, max: 3, step: 0.01, default: 0.3 }),
    gp('Post-Processing', { key: 'bloomWideStr', label: 'Bloom Wide', type: 'float', min: 0, max: 3, step: 0.01, default: 0.2 }),
    gp('Post-Processing', { key: 'scanlineStr', label: 'Scanlines', type: 'float', min: 0, max: 0.5, step: 0.01, default: 0.03 }),
    gp('Post-Processing', { key: 'beatBloom', label: 'Beat Bloom', type: 'float', min: 0, max: 1.5, step: 0.01, default: 0.35 }),
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
      swordX: gl.getUniformLocation(sceneProg, 'uSwordX'),
      swordY: gl.getUniformLocation(sceneProg, 'uSwordY'),
      swordZ: gl.getUniformLocation(sceneProg, 'uSwordZ'),
      swordPitch: gl.getUniformLocation(sceneProg, 'uSwordPitch'),
      swordYaw: gl.getUniformLocation(sceneProg, 'uSwordYaw'),
      swordRoll: gl.getUniformLocation(sceneProg, 'uSwordRoll'),
      swordTilt: gl.getUniformLocation(sceneProg, 'uSwordTilt'),
      swordWidth: gl.getUniformLocation(sceneProg, 'uSwordWidth'),
      swordHeight: gl.getUniformLocation(sceneProg, 'uSwordHeight'),
      beatScale: gl.getUniformLocation(sceneProg, 'uBeatScale'),
      sphere0: gl.getUniformLocation(sceneProg, 'uSphere0'),
      sphere1: gl.getUniformLocation(sceneProg, 'uSphere1'),
      sphere2: gl.getUniformLocation(sceneProg, 'uSphere2'),
      cameraHeight: gl.getUniformLocation(sceneProg, 'uCameraHeight'),
      cameraAngle: gl.getUniformLocation(sceneProg, 'uCameraAngle'),
      colorR: gl.getUniformLocation(sceneProg, 'uColorR'),
      colorG: gl.getUniformLocation(sceneProg, 'uColorG'),
      colorB: gl.getUniformLocation(sceneProg, 'uColorB'),
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
    gl.uniform1f(su.waterDarkness, p('waterDarkness', 0.31));
    gl.uniform1f(su.specularPower, p('specularPower', 256));
    gl.uniform1f(su.fresnelExp, p('fresnelExp', 3.0));
    gl.uniform1f(su.chromeReflect, p('chromeReflect', 2.5));
    gl.uniform1f(su.swordBrightness, p('swordBrightness', 1.80));
    gl.uniform1f(su.swordX, p('swordX', 0.0));
    gl.uniform1f(su.swordY, p('swordY', -0.10));
    gl.uniform1f(su.swordZ, p('swordZ', -1.0));
    gl.uniform1f(su.swordPitch, p('swordPitch', 4));
    gl.uniform1f(su.swordYaw, p('swordYaw', -5));
    gl.uniform1f(su.swordRoll, p('swordRoll', 50));
    gl.uniform1f(su.swordTilt, p('swordTilt', -15));
    gl.uniform1f(su.swordWidth, p('swordWidth', 10.0));
    gl.uniform1f(su.swordHeight, p('swordHeight', 0.45));
    gl.uniform1f(su.beatScale, p('beatScale', 0.15));
    gl.uniform4f(su.sphere0, p('sphere0X', -1.4), p('sphere0Y', 0.20), p('sphere0Z', -3.0), p('sphere0R', 1.3));
    gl.uniform4f(su.sphere1, p('sphere1X', -1.9), p('sphere1Y', 0.05), p('sphere1Z', 1.3), p('sphere1R', 1.85));
    gl.uniform4f(su.sphere2, p('sphere2X', 2.5), p('sphere2Y', 0.65), p('sphere2Z', -2.1), p('sphere2R', 1.15));
    gl.uniform1f(su.cameraHeight, p('cameraHeight', 2.2));
    gl.uniform1f(su.cameraAngle, p('cameraAngle', 5.0));

    const pal = PALETTES[p('palette', 0)];
    gl.uniform3fv(su.colorR, pal.colorMap[0]);
    gl.uniform3fv(su.colorG, pal.colorMap[1]);
    gl.uniform3fv(su.colorB, pal.colorMap[2]);

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
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.45));
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
    gl.uniform1f(cu.bloomTightStr, p('bloomTightStr', 0.3));
    gl.uniform1f(cu.bloomWideStr, p('bloomWideStr', 0.2));
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
