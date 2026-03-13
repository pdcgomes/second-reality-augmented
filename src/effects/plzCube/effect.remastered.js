/**
 * PLZ_CUBE — Remastered variant (Part 17)
 *
 * A 3D rotating cube with procedural plasma textures on each face,
 * rendered with a proper GPU vertex pipeline. Per-pixel Phong lighting
 * with specular highlights replaces the classic's flat per-face shading.
 * Perspective-correct texturing fixes the UV warping visible in the
 * original. Camera path follows the same spline-interpolated control
 * points as the classic variant for choreography sync.
 *
 * Three color themes (blue, red, purple) map to pairs of opposite faces.
 * Each theme's hue is independently tunable via editor parameters.
 *
 * Original code: PLZ/VECT.C + PLZFILL.C + PLZA.ASM by WILDFIRE.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';

const FRAME_RATE = 70;
const PI = Math.PI;

// ── Spline data (from classic) ───────────────────────────────────

const SPLINE_COEFF = [0,0,0,0,2,3,5,7,9,12,15,18,22,26,30,35,40,45,51,57,63,69,76,83,91,99,107,115,124,133,143,152,162,173,183,194,205,217,229,241,254,267,280,293,307,321,335,350,365,380,396,412,428,445,461,479,496,514,532,550,569,588,607,626,646,666,687,707,728,750,771,793,815,838,860,883,907,930,954,978,1002,1027,1052,1077,1103,1129,1155,1181,1208,1234,1261,1289,1317,1344,1373,1401,1430,1459,1488,1517,1547,1577,1607,1638,1669,1700,1731,1762,1794,1826,1858,1891,1923,1956,1989,2023,2056,2090,2124,2159,2193,2228,2263,2298,2334,2369,2405,2441,2478,2514,2551,2588,2625,2662,2700,2738,2776,2814,2852,2891,2929,2968,3008,3047,3087,3126,3166,3206,3247,3287,3328,3368,3409,3451,3492,3533,3575,3617,3659,3701,3744,3786,3829,3872,3915,3958,4001,4044,4088,4132,4176,4220,4264,4308,4353,4397,4442,4487,4532,4577,4622,4667,4713,4759,4804,4850,4896,4942,4988,5035,5081,5128,5174,5221,5268,5315,5362,5409,5456,5503,5551,5598,5646,5693,5741,5789,5837,5885,5933,5981,6029,6078,6126,6174,6223,6271,6320,6369,6417,6466,6515,6564,6613,6662,6711,6760,6809,6858,6907,6956,7006,7055,7104,7154,7203,7253,7302,7351,7401,7450,7500,7549,7599,7648,7698,7748,7797,7847,7896,7946,7995,8045,8095,8144,8194,8243,8293,8342,8392,8441,8491,8540,8589,8639,8688,8737,8787,8836,8885,8934,8983,9033,9082,9131,9180,9228,9277,9326,9375,9424,9472,9521,9569,9618,9666,9715,9763,9811,9859,9907,9955,10003,10051,10099,10146,10194,10242,10289,10336,10384,10431,10478,10525,10572,10618,10665,10712,10758,10804,10851,10897,10943,10989,11035,11080,11126,11171,11217,11262,11307,11352,11397,11442,11486,11531,11575,11619,11663,11707,11751,11795,11838,11882,11925,11968,12011,12054,12096,12139,12181,12223,12265,12307,12349,12390,12432,12473,12514,12555,12596,12636,12676,12717,12757,12797,12836,12876,12915,12954,12993,13032,13071,13109,13147,13185,13223,13261,13298,13335,13373,13409,13446,13483,13519,13555,13591,13626,13662,13697,13732,13767,13802,13836,13870,13904,13938,13972,14005,14038,14071,14104,14136,14169,14201,14233,14264,14295,14327,14358,14388,14419,14449,14479,14509,14538,14567,14596,14625,14654,14682,14710,14738,14766,14793,14820,14847,14874,14900,14926,14952,14978,15003,15028,15053,15078,15102,15126,15150,15174,15197,15220,15243,15265,15288,15310,15332,15353,15374,15395,15416,15437,15457,15477,15496,15516,15535,15554,15572,15591,15609,15626,15644,15661,15678,15695,15711,15727,15743,15759,15774,15789,15804,15818,15833,15847,15860,15874,15887,15899,15912,15924,15936,15948,15959,15970,15981,15992,16002,16012,16021,16031,16040,16049,16057,16066,16074,16081,16089,16096,16103,16109,16115,16121,16127,16132,16137,16142,16147,16151,16155,16158,16162,16165,16168,16170,16172,16174,16176,16177,16178,16179,16179,16179,16179,16179,16178,16177,16176,16174,16172,16170,16168,16165,16162,16158,16155,16151,16147,16142,16137,16132,16127,16121,16115,16109,16103,16096,16089,16081,16074,16066,16057,16049,16040,16031,16021,16012,16002,15992,15981,15970,15959,15948,15936,15924,15912,15899,15887,15874,15860,15847,15833,15818,15804,15789,15774,15759,15743,15727,15711,15695,15678,15661,15644,15626,15609,15591,15572,15554,15535,15516,15496,15477,15457,15437,15416,15395,15374,15353,15332,15310,15288,15265,15243,15220,15197,15174,15150,15126,15102,15078,15053,15028,15003,14978,14952,14926,14900,14874,14847,14820,14793,14766,14738,14710,14682,14654,14625,14596,14567,14538,14509,14479,14449,14419,14388,14358,14327,14295,14264,14233,14201,14169,14136,14104,14071,14038,14005,13972,13938,13904,13870,13836,13802,13767,13732,13697,13662,13626,13591,13555,13519,13483,13446,13409,13373,13335,13298,13261,13223,13185,13147,13109,13071,13032,12993,12954,12915,12876,12836,12797,12757,12717,12676,12636,12596,12555,12514,12473,12432,12390,12349,12307,12265,12223,12181,12139,12096,12054,12011,11968,11925,11882,11838,11795,11751,11707,11663,11619,11575,11531,11486,11442,11397,11352,11307,11262,11217,11171,11126,11080,11035,10989,10943,10897,10851,10804,10758,10712,10665,10618,10572,10525,10478,10431,10384,10336,10289,10242,10194,10146,10099,10051,10003,9955,9907,9859,9811,9763,9715,9666,9618,9569,9521,9472,9424,9375,9326,9277,9228,9180,9131,9082,9033,8983,8934,8885,8836,8787,8737,8688,8639,8589,8540,8491,8441,8392,8342,8293,8243,8194,8144,8095,8045,7995,7946,7896,7847,7797,7748,7698,7648,7599,7549,7500,7450,7401,7351,7302,7253,7203,7154,7104,7055,7006,6956,6907,6858,6809,6760,6711,6662,6613,6564,6515,6466,6417,6369,6320,6271,6223,6174,6126,6078,6029,5981,5933,5885,5837,5789,5741,5693,5646,5598,5551,5503,5456,5409,5362,5315,5268,5221,5174,5128,5081,5035,4988,4942,4896,4850,4804,4759,4713,4667,4622,4577,4532,4487,4442,4397,4353,4308,4264,4220,4176,4132,4088,4044,4001,3958,3915,3872,3829,3786,3744,3701,3659,3617,3575,3533,3492,3451,3409,3368,3328,3287,3247,3206,3166,3126,3087,3047,3008,2968,2929,2891,2852,2814,2776,2738,2700,2662,2625,2588,2551,2514,2478,2441,2405,2369,2334,2298,2263,2228,2193,2159,2124,2090,2056,2023,1989,1956,1923,1891,1858,1826,1794,1762,1731,1700,1669,1638,1607,1577,1547,1517,1488,1459,1430,1401,1373,1344,1317,1289,1261,1234,1208,1181,1155,1129,1103,1077,1052,1027,1002,978,954,930,907,883,860,838,815,793,771,750,728,707,687,666,646,626,607,588,569,550,532,514,496,479,461,445,428,412,396,380,365,350,335,321,307,293,280,267,254,241,229,217,205,194,183,173,162,152,143,133,124,115,107,99,91,83,76,69,63,57,51,45,40,35,30,26,22,18,15,12,9,7,5,3,2,0,0,0];

const K = 100;
const ANIM_SPLINE = [
  [0,2000,500,K*0,K*4,K*6,0,0],[0,2000,500,K*1,K*5,K*7,0,0],[0,2000,500,K*2,K*6,K*8,0,0],
  [0,2000,500,K*3,K*7,K*7,0,0],[0,2000,500,K*4,K*8,K*6,0,0],[0,-150,500,K*5,K*7,K*5,0,0],
  [0,0,500,K*6,K*6,K*4,0,0],[0,0,500,K*7,K*5,K*3,0,0],[0,0,500,K*8,K*4,K*2,32,0],
  [0,0,500,K*7,K*3,K*1,64,0],[0,0,500,K*6,K*2,K*0,96,0],[0,0,450,K*5,K*1,K*1,128,0],
  [0,0,400,K*4,K*0,K*2,160,0],[0,0,350,K*3,K*1,K*3,192,0],[0,0,300,K*2,K*2,K*4,224,0],
  [0,0,300,K*1,K*3,K*5,256,0],[0,0,300,K*0,K*4,K*6,256,0],[0,0,300,K*1,K*5,K*7,256,0],
  [0,0,300,K*2,K*6,K*8,256,0],[0,0,300,K*3,K*7,K*7,256,0],[0,0,300,K*4,K*8,K*6,256,0],
  [0,0,300,K*5,K*7,K*5,256,0],[0,0,300,K*6,K*6,K*4,256,0],[0,0,300,K*7,K*5,K*3,256,0],
  [0,0,300,K*8,K*4,K*2,256,0],[0,0,300,K*7,K*3,K*1,256,0],[0,0,300,K*6,K*2,K*0,256,0],
  [0,0,300,K*5,K*1,K*1,256,0],[0,0,300,K*4,K*0,K*2,256,0],[0,0,300,K*3,K*1,K*3,256,0],
  [0,0,300,K*2,K*2,K*4,256,0],[0,0,300,K*1,K*3,K*5,256,0],
  [0,0,350,K*0,K*4,K*4,0,128],[0,0,400,K*1,K*3,K*3,64,256],
  [0,0,450,K*2,K*2,K*2,128,384],[0,0,500,K*1,K*1,K*1,192,512],
];
for (let i = 0; i < 10; i++) ANIM_SPLINE.push([0,0,500,0,0,0,256,512]);

function getspl(pos) {
  const i = pos >> 8;
  const f = pos & 0xFF;
  const r = new Float64Array(8);
  for (let p = 0; p < 8; p++) {
    const ci = Math.min(i + 3, ANIM_SPLINE.length - 1);
    const ci1 = Math.min(i + 2, ANIM_SPLINE.length - 1);
    const ci2 = Math.min(i + 1, ANIM_SPLINE.length - 1);
    const ci3 = Math.min(i, ANIM_SPLINE.length - 1);
    r[p] = ((ANIM_SPLINE[ci][p] * SPLINE_COEFF[f] +
             ANIM_SPLINE[ci1][p] * SPLINE_COEFF[f + 256] +
             ANIM_SPLINE[ci2][p] * SPLINE_COEFF[f + 512] +
             ANIM_SPLINE[ci3][p] * SPLINE_COEFF[f + 768]) * 2) >> 16;
  }
  return { tx: r[0], ty: r[1], dis: r[2], kx: r[3] & 1023, ky: r[4] & 1023, kz: r[5] & 1023, ls_kx: r[6] & 1023, ls_ky: r[7] & 1023 };
}

// ── Cube geometry ────────────────────────────────────────────────

// 6 faces × 4 vertices. Each vertex: position(3), uv(2), normal(3), theme(1) = 9 floats
// Themes: 0 = blue (front/back), 1 = red (right/left), 2 = purple (top/bottom)
const CUBE_DATA = (() => {
  const S = 125;
  const faces = [
    { v: [[S,-S,S],[S,S,S],[-S,S,S],[-S,-S,S]],       n: [0,0,1],  t: 0 },   // front
    { v: [[-S,-S,-S],[-S,S,-S],[S,S,-S],[S,-S,-S]],    n: [0,0,-1], t: 0 },   // back
    { v: [[S,-S,-S],[S,S,-S],[S,S,S],[S,-S,S]],        n: [1,0,0],  t: 1 },   // right
    { v: [[-S,-S,S],[-S,S,S],[-S,S,-S],[-S,-S,-S]],    n: [-1,0,0], t: 1 },   // left
    { v: [[S,S,S],[S,S,-S],[-S,S,-S],[-S,S,S]],        n: [0,1,0],  t: 2 },   // top
    { v: [[S,-S,-S],[S,-S,S],[-S,-S,S],[-S,-S,-S]],    n: [0,-1,0], t: 2 },   // bottom
  ];
  const verts = new Float32Array(6 * 4 * 9);
  const indices = new Uint16Array(6 * 6);
  const uvs = [[0,0],[1,0],[1,1],[0,1]];
  let vi = 0, ii = 0;
  for (let fi = 0; fi < 6; fi++) {
    const f = faces[fi];
    const base = fi * 4;
    for (let ci = 0; ci < 4; ci++) {
      verts[vi++] = f.v[ci][0]; verts[vi++] = f.v[ci][1]; verts[vi++] = f.v[ci][2];
      verts[vi++] = uvs[ci][0]; verts[vi++] = uvs[ci][1];
      verts[vi++] = f.n[0]; verts[vi++] = f.n[1]; verts[vi++] = f.n[2];
      verts[vi++] = f.t;
    }
    indices[ii++] = base; indices[ii++] = base+1; indices[ii++] = base+2;
    indices[ii++] = base; indices[ii++] = base+2; indices[ii++] = base+3;
  }
  return { verts, indices };
})();

// ── Shaders ──────────────────────────────────────────────────────

const CUBE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec2 aUV;
layout(location = 2) in vec3 aNormal;
layout(location = 3) in float aTheme;

uniform mat4 uMVP;
uniform mat3 uNormalMat;

out vec2 vUV;
out vec3 vWorldNormal;
flat out int vTheme;

void main() {
  gl_Position = uMVP * vec4(aPosition, 1.0);
  vUV = aUV;
  vWorldNormal = normalize(uNormalMat * aNormal);
  vTheme = int(aTheme + 0.5);
}
`;

const CUBE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
in vec3 vWorldNormal;
flat in int vTheme;

out vec4 fragColor;

uniform vec3 uLightDir;
uniform float uSpecularPower;
uniform float uAmbient;
uniform float uDistortion;
uniform float uDistortionOffset;
uniform float uBeat;
uniform float uBeatReactivity;
uniform float uFade;
uniform vec3 uThemeHue;

#define PI  3.14159265359
#define TAU 6.28318530718

float sini(float a) {
  return sin(a / 1024.0 * PI * 4.0) * 127.0;
}

vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = h / 60.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  vec3 rgb;
  if      (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else               rgb = vec3(c, 0.0, x);
  float m = l - c * 0.5;
  return rgb + m;
}

void main() {
  float u = vUV.x * 255.0;
  float v = vUV.y * 63.0;

  float dist = sini((uDistortionOffset + v) * 8.0) / 3.0 * uDistortion;
  float du = mod(u + dist, 256.0);
  float plasmaRaw = sini(v * 4.0 + sini(du * 2.0)) / 4.0 + 32.0;
  float plasmaVal = clamp(plasmaRaw / 64.0, 0.0, 1.0);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;

  float hue = uThemeHue[vTheme];
  float lightness = mix(0.05, 0.7, plasmaVal);
  float saturation = 0.8 + beatPulse * 0.15;
  vec3 baseColor = hsl2rgb(hue, saturation, lightness);

  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = vec3(0.0, 0.0, 1.0);

  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float spec = pow(max(dot(N, H), 0.0), uSpecularPower + beatPulse * 16.0);

  vec3 ambient = baseColor * uAmbient;
  vec3 diffuse = baseColor * diff * (1.0 - uAmbient);
  vec3 specular = vec3(1.0) * spec * (0.4 + beatPulse * 0.2);

  vec3 color = ambient + diffuse + specular;
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
  if (uScanlineStr > 0.001) {
    float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
    color *= scanline;
  }
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

function createMSAAFBO(gl, w, h, samples) {
  const fb = gl.createFramebuffer();
  const colorRb = gl.createRenderbuffer();
  const depthRb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, colorRb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
  gl.bindRenderbuffer(gl.RENDERBUFFER, depthRb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, colorRb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  return { fb, colorRb, depthRb };
}

function deleteFBO(gl, fbo) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  if (fbo.tex) gl.deleteTexture(fbo.tex);
  if (fbo.colorRb) gl.deleteRenderbuffer(fbo.colorRb);
  if (fbo.depthRb) gl.deleteRenderbuffer(fbo.depthRb);
}

// ── Matrix helpers ───────────────────────────────────────────────

function mat4Perspective(fovY, aspect, near, far) {
  const f = 1.0 / Math.tan(fovY / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0,
  ]);
}

function mat4Multiply(a, b) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] = a[i] * b[j * 4] + a[4 + i] * b[j * 4 + 1] + a[8 + i] * b[j * 4 + 2] + a[12 + i] * b[j * 4 + 3];
    }
  return out;
}

function buildModelView(sp) {
  const toRad = PI / 512;
  const sx = Math.sin(sp.kx * toRad), cx = Math.cos(sp.kx * toRad);
  const sy = Math.sin(sp.ky * toRad), cy = Math.cos(sp.ky * toRad);
  const sz = Math.sin(sp.kz * toRad), cz = Math.cos(sp.kz * toRad);

  const r00 = cy * cz, r01 = cy * sz, r02 = -sy;
  const r10 = sx * sy * cz - cx * sz, r11 = sx * sy * sz + cx * cz, r12 = sx * cy;
  const r20 = cx * sy * cz + sx * sz, r21 = cx * sy * sz - sx * cz, r22 = cx * cy;

  // Classic uses +Y down, +Z forward. OpenGL uses +Y up, -Z forward.
  // Negate Y and Z rows of the rotation and translation to convert.
  return {
    mv: new Float32Array([
      r00,  -r10,  -r20, 0,
      r01,  -r11,  -r21, 0,
      r02,  -r12,  -r22, 0,
      sp.tx, -sp.ty, -sp.dis, 1,
    ]),
    normalMat: new Float32Array([r00, r10, r20, r01, r11, r21, r02, r12, r22]),
  };
}

// ── Module state ─────────────────────────────────────────────────

let cubeProg, bloomExtractProg, blurProg, compositeProg;
let quad, cubeVAO, cubeVBO, cubeIBO;
let msaaFBO, sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0, msaaSamples = 4;

let cu_ = {}, beu = {}, blu = {}, cou = {};

export default {
  label: 'plzCube (remastered)',

  params: [
    gp('Face A (Blue)',   { key: 'hueA',     label: 'Hue',       type: 'float', min: 0, max: 360, step: 1,    default: 220 }),
    gp('Face B (Red)',    { key: 'hueB',     label: 'Hue',       type: 'float', min: 0, max: 360, step: 1,    default: 10 }),
    gp('Face C (Purple)', { key: 'hueC',     label: 'Hue',       type: 'float', min: 0, max: 360, step: 1,    default: 280 }),
    gp('Texture',     { key: 'distortion',    label: 'Distortion',      type: 'float', min: 0,   max: 3,   step: 0.01, default: 1.0 }),
    gp('Lighting',    { key: 'specularPower', label: 'Specular Power',  type: 'float', min: 4,   max: 128, step: 1,    default: 32 }),
    gp('Lighting',    { key: 'ambient',       label: 'Ambient',         type: 'float', min: 0,   max: 0.5, step: 0.01, default: 0.15 }),
    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1, step: 0.01, default: 0.3 }),
    gp('Post-Processing', { key: 'bloomStrength',  label: 'Bloom Strength',  type: 'float', min: 0, max: 2, step: 0.01, default: 0.45 }),
    gp('Post-Processing', { key: 'beatReactivity', label: 'Beat Reactivity', type: 'float', min: 0, max: 1, step: 0.01, default: 0.4 }),
    gp('Post-Processing', { key: 'scanlineStr',    label: 'Scanlines',       type: 'float', min: 0, max: 0.5, step: 0.01, default: 0 }),
  ],

  init(gl) {
    cubeProg = createProgram(gl, CUBE_VERT, CUBE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    cu_ = {
      mvp:        gl.getUniformLocation(cubeProg, 'uMVP'),
      normalMat:  gl.getUniformLocation(cubeProg, 'uNormalMat'),
      lightDir:   gl.getUniformLocation(cubeProg, 'uLightDir'),
      specPow:    gl.getUniformLocation(cubeProg, 'uSpecularPower'),
      ambient:    gl.getUniformLocation(cubeProg, 'uAmbient'),
      distortion: gl.getUniformLocation(cubeProg, 'uDistortion'),
      distOff:    gl.getUniformLocation(cubeProg, 'uDistortionOffset'),
      beat:       gl.getUniformLocation(cubeProg, 'uBeat'),
      beatReact:  gl.getUniformLocation(cubeProg, 'uBeatReactivity'),
      fade:       gl.getUniformLocation(cubeProg, 'uFade'),
      themeHue:   gl.getUniformLocation(cubeProg, 'uThemeHue'),
    };

    beu = {
      scene:     gl.getUniformLocation(bloomExtractProg, 'uScene'),
      threshold: gl.getUniformLocation(bloomExtractProg, 'uThreshold'),
    };
    blu = {
      tex:       gl.getUniformLocation(blurProg, 'uTex'),
      direction: gl.getUniformLocation(blurProg, 'uDirection'),
      resolution:gl.getUniformLocation(blurProg, 'uResolution'),
    };
    cou = {
      scene:      gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight: gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:  gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:   gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:       gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReact:  gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
      scanlineStr:gl.getUniformLocation(compositeProg, 'uScanlineStr'),
    };

    // Cube geometry
    cubeVAO = gl.createVertexArray();
    gl.bindVertexArray(cubeVAO);

    cubeVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, cubeVBO);
    gl.bufferData(gl.ARRAY_BUFFER, CUBE_DATA.verts, gl.STATIC_DRAW);

    const STRIDE = 9 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, STRIDE, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, STRIDE, 20);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, STRIDE, 32);

    cubeIBO = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, cubeIBO);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, CUBE_DATA.indices, gl.STATIC_DRAW);

    gl.bindVertexArray(null);

    msaaSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;

    if (sw !== fboW || sh !== fboH) {
      deleteFBO(gl, msaaFBO);
      deleteFBO(gl, sceneFBO);
      deleteFBO(gl, bloomFBO1);
      deleteFBO(gl, bloomFBO2);
      deleteFBO(gl, bloomWideFBO1);
      deleteFBO(gl, bloomWideFBO2);
      msaaFBO       = createMSAAFBO(gl, sw, sh, msaaSamples);
      sceneFBO      = createFBO(gl, sw, sh);
      bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    const frame = Math.floor(t * FRAME_RATE);
    const sp = getspl(4 * 256 + frame * 4);

    // Light direction from orbiting source
    const lsToRad = PI / 512;
    const lx = Math.sin(sp.ls_kx * lsToRad) * Math.sin(sp.ls_ky * lsToRad);
    const ly = Math.cos(sp.ls_kx * lsToRad);
    const lz = Math.sin(sp.ls_kx * lsToRad) * Math.cos(sp.ls_ky * lsToRad);
    const lLen = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;

    const { mv, normalMat } = buildModelView(sp);
    const aspect = sw / sh;
    const proj = mat4Perspective(0.9, aspect, 10, 5000);
    const mvp = mat4Multiply(proj, mv);

    const dd = (frame & 63) / 63;

    // Fade: quick fade-in at start
    let fade = 1.0;
    if (frame < 70) fade = frame / 70;

    // ── Pass 1: Cube → MSAA FBO ──────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LESS);

    gl.useProgram(cubeProg);
    gl.uniformMatrix4fv(cu_.mvp, false, mvp);
    gl.uniformMatrix3fv(cu_.normalMat, false, normalMat);
    gl.uniform3f(cu_.lightDir, lx / lLen, ly / lLen, lz / lLen);
    gl.uniform1f(cu_.specPow, p('specularPower', 32));
    gl.uniform1f(cu_.ambient, p('ambient', 0.15));
    gl.uniform1f(cu_.distortion, p('distortion', 1.0));
    gl.uniform1f(cu_.distOff, dd * 63);
    gl.uniform1f(cu_.beat, beat);
    gl.uniform1f(cu_.beatReact, p('beatReactivity', 0.4));
    gl.uniform1f(cu_.fade, fade);
    gl.uniform3f(cu_.themeHue, p('hueA', 220), p('hueB', 10), p('hueC', 280));

    gl.bindVertexArray(cubeVAO);
    gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
    gl.bindVertexArray(null);
    gl.disable(gl.DEPTH_TEST);

    // ── Resolve MSAA → scene texture ─────────────────────────────

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFBO.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO.fb);
    gl.blitFramebuffer(0, 0, sw, sh, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    // ── Bloom pipeline ───────────────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.3));
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

    // ── Composite to screen ──────────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, sw, sh);
    gl.useProgram(compositeProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(cou.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(cou.bloomTight, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloomWideFBO1.tex);
    gl.uniform1i(cou.bloomWide, 2);
    gl.uniform1f(cou.bloomStr, p('bloomStrength', 0.45));
    gl.uniform1f(cou.beat, beat);
    gl.uniform1f(cou.beatReact, p('beatReactivity', 0.4));
    gl.uniform1f(cou.scanlineStr, p('scanlineStr', 0));
    quad.draw();
  },

  destroy(gl) {
    if (cubeProg) gl.deleteProgram(cubeProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (cubeVAO) gl.deleteVertexArray(cubeVAO);
    if (cubeVBO) gl.deleteBuffer(cubeVBO);
    if (cubeIBO) gl.deleteBuffer(cubeIBO);
    deleteFBO(gl, msaaFBO);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    cubeProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    cubeVAO = cubeVBO = cubeIBO = null;
    msaaFBO = sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
  },
};
