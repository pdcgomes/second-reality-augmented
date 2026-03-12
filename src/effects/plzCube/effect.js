/**
 * PLZ_CUBE — Classic variant (Part 17)
 *
 * Plasma-textured rotating cube at 320×134 resolution. Three 64-color
 * palette bands (blue-white, red-yellow, purple-green) map to the three
 * face types. Procedural textures use nested sine waves with sinusoidal
 * distortion. Camera path follows spline-interpolated control points.
 * Per-face diffuse lighting from an orbiting light source.
 *
 * Original code: PLZ/VECT.C + PLZFILL.C + PLZA.ASM by WILDFIRE.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const W = 320, H_RENDER = 134, H_DISPLAY = 200, PIXELS = W * H_DISPLAY;
const FRAME_RATE = 70;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

const CUBE_VERTS = [
  { x: 125, y: 125, z: 125 }, { x: 125, y: -125, z: 125 },
  { x: -125, y: -125, z: 125 }, { x: -125, y: 125, z: 125 },
  { x: 125, y: 125, z: -125 }, { x: 125, y: -125, z: -125 },
  { x: -125, y: -125, z: -125 }, { x: -125, y: 125, z: -125 },
];
const CUBE_FACES = [
  { p: [1, 2, 3, 0], c: 0 }, { p: [7, 6, 5, 4], c: 0 },
  { p: [0, 4, 5, 1], c: 1 }, { p: [1, 5, 6, 2], c: 2 },
  { p: [2, 6, 7, 3], c: 1 }, { p: [3, 7, 4, 0], c: 2 },
];
const TXT = [{ x: 64, y: 4 }, { x: 190, y: 4 }, { x: 190, y: 60 }, { x: 64, y: 60 }];

// Spline coefficients (from SPLINE.INC, 1024 values)
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

let program, quad, uFrameLoc, frameTex;
let rgba;
let sinTab, cosTab, sini;
let basePal, kuva, dist1;

function initVect() {
  sinTab = new Int32Array(1024);
  cosTab = new Int32Array(1024);
  for (let i = 0; i < 1024; i++) {
    sinTab[i] = Math.floor(32767 * Math.sin(i * Math.PI / 512));
    cosTab[i] = Math.floor(32767 * Math.cos(i * Math.PI / 512));
  }

  sini = new Float64Array(1524);
  for (let a = 0; a < 1524; a++) sini[a] = Math.sin(a / 1024.0 * Math.PI * 4) * 127;

  basePal = new Uint8Array(768);
  for (let a = 1; a < 32; a++) { basePal[a * 3] = 0; basePal[a * 3 + 1] = 0; basePal[a * 3 + 2] = a * 2; }
  for (let a = 0; a < 32; a++) { basePal[(a + 32) * 3] = a * 2; basePal[(a + 32) * 3 + 1] = a * 2; basePal[(a + 32) * 3 + 2] = 63; }
  for (let a = 0; a < 32; a++) { basePal[(a + 64) * 3] = a * 2; basePal[(a + 64) * 3 + 1] = 0; basePal[(a + 64) * 3 + 2] = 0; }
  for (let a = 0; a < 32; a++) { basePal[(a + 96) * 3] = 63; basePal[(a + 96) * 3 + 1] = a * 2; basePal[(a + 96) * 3 + 2] = 0; }
  for (let a = 0; a < 32; a++) { basePal[(a + 128) * 3] = a; basePal[(a + 128) * 3 + 1] = 0; basePal[(a + 128) * 3 + 2] = Math.floor(a * 2 / 3); }
  for (let a = 0; a < 32; a++) { basePal[(a + 160) * 3] = 31 - a; basePal[(a + 160) * 3 + 1] = a * 2; basePal[(a + 160) * 3 + 2] = 21; }

  kuva = new Array(3);
  for (let c = 0; c < 3; c++) {
    kuva[c] = new Uint8Array(64 * 256);
    for (let y = 0; y < 64; y++)
      for (let x = 0; x < 256; x++)
        kuva[c][y * 256 + x] = Math.floor(sini[(y * 4 + sini[x * 2]) & 511] / 4 + 32 + c * 64);
  }

  dist1 = new Float64Array(256);
  for (let y = 0; y < 128; y++) dist1[y] = Math.floor(sini[y * 8] / 3);
}

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

export default {
  label: 'plzCube',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');
    rgba = new Uint8Array(PIXELS * 4);
    initVect();

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H_DISPLAY, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const frame = Math.floor(t * FRAME_RATE);
    const sp = getspl(4 * 256 + frame * 4);

    // Light direction
    const lsY = cosTab[sp.ls_kx] >> 8;
    const lsX = (sinTab[sp.ls_kx] >> 8) * (sinTab[sp.ls_ky] >> 8) >> 7;
    const lsZ = (sinTab[sp.ls_kx] >> 8) * (cosTab[sp.ls_ky] >> 8) >> 7;

    // Rotation matrix
    const SX = sinTab[sp.kx], SY = sinTab[sp.ky], SZ = sinTab[sp.kz];
    const CX = cosTab[sp.kx], CY = cosTab[sp.ky], CZ = cosTab[sp.kz];
    const cxx = (CY * CZ) >> 22, cxy = (CY * SZ) >> 22, cxz = -SY >> 7;
    const cyx = (((SX * CZ + 16384) >> 15) * SY - (CX * SZ)) >> 22;
    const cyy = (((SX * SY + 16384) >> 15) * SZ + (CX * CZ)) >> 22;
    const cyz = (CY * SX) >> 22;
    const czx = (((CX * CZ + 16384) >> 15) * SY + (SX * SZ)) >> 22;
    const czy = (((CX * SY + 16384) >> 15) * SZ - (SX * CZ)) >> 22;
    const czz = (CY * CX) >> 22;

    // Transform vertices
    const projected = CUBE_VERTS.map(v => {
      const xx = ((v.x * cxx >> 1) + (v.y * cxy >> 1) + (v.z * cxz >> 1) >> 7) + sp.tx;
      const yy = ((v.x * cyx >> 1) + (v.y * cyy >> 1) + (v.z * cyz >> 1) >> 7) + sp.ty;
      const zz = ((v.x * czx >> 1) + (v.y * czy >> 1) + (v.z * czz >> 1) >> 7) + sp.dis;
      return {
        xx, yy, zz,
        sx: Math.floor((xx * 245) / zz + 160),
        sy: Math.floor((yy * 137) / zz + 66),
      };
    });

    // Build indexed framebuffer
    const fb = new Uint8Array(W * H_RENDER);
    const fpal = new Uint8Array(768);
    const dd = frame & 63;

    for (const face of CUBE_FACES) {
      const v0 = projected[face.p[0]], v1 = projected[face.p[1]], v2 = projected[face.p[2]];
      const ax = v1.xx - v0.xx, ay = v1.yy - v0.yy, az = v1.zz - v0.zz;
      const bx = v2.xx - v0.xx, by = v2.yy - v0.yy, bz = v2.zz - v0.zz;
      const nz = ax * by - ay * bx;
      if (nz < 0) continue;
      const nx = ay * bz - az * by;
      const ny = az * bx - ax * bz;
      let s = Math.floor((lsX * nx + lsY * ny + lsZ * nz) / 250000 + 32);
      if (s < 0) s = 0; if (s > 64) s = 64;

      // Shade palette for this face
      const palOff = face.c * 64 * 3;
      for (let i = 0; i < 64; i++) {
        fpal[palOff + i * 3] = (basePal[palOff + i * 3] * s) >> 6;
        fpal[palOff + i * 3 + 1] = (basePal[palOff + i * 3 + 1] * s) >> 6;
        fpal[palOff + i * 3 + 2] = (basePal[palOff + i * 3 + 2] * s) >> 6;
      }

      // Draw textured quad
      const pts = face.p.map(pi => ({ x: projected[pi].sx, y: projected[pi].sy }));
      fillTexturedQuad(fb, pts, face.c, dd);
    }

    // Convert to RGBA (scale 134 → 200 by tripling scanlines)
    const vgaK = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let y = 0; y < H_DISPLAY; y++) {
      const srcY = Math.min(Math.floor(y * H_RENDER / H_DISPLAY), H_RENDER - 1);
      for (let x = 0; x < W; x++) {
        const ci = fb[srcY * W + x];
        const r = Math.round(clamp(fpal[ci * 3], 0, 63) * vgaK);
        const g = Math.round(clamp(fpal[ci * 3 + 1], 0, 63) * vgaK);
        const b = Math.round(clamp(fpal[ci * 3 + 2], 0, 63) * vgaK);
        rgba32[y * W + x] = (255 << 24) | (b << 16) | (g << 8) | r;
      }
    }

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H_DISPLAY, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.uniform1i(uFrameLoc, 0);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    if (frameTex) gl.deleteTexture(frameTex);
    program = null; quad = null; frameTex = null;
    rgba = sinTab = cosTab = sini = basePal = kuva = dist1 = null;
  },
};

function fillTexturedQuad(fb, pts, colorIdx, dd) {
  // Find top-most vertex
  let n = 0;
  for (let a = 1; a < 4; a++) if (pts[a].y < pts[n].y) n = a;

  const tex = kuva[colorIdx];
  let s1 = n, s2 = n;
  let d1 = (n - 1 + 4) & 3, d2 = (n + 1) & 3;

  function setupEdge(si, di) {
    let dx = pts[di].x - pts[si].x;
    let dy = pts[di].y - pts[si].y;
    if (dy === 0) dy = 1;
    return {
      ax: 65536 * dx / dy,
      xx: pts[si].x << 16,
      txx: TXT[si].x << 16, txy: TXT[si].y << 16,
      tax: 65536 * (TXT[di].x - TXT[si].x) / dy,
      tay: 65536 * (TXT[di].y - TXT[si].y) / dy,
    };
  }

  let e1 = setupEdge(s1, d1);
  let e2 = setupEdge(s2, d2);
  let yy = pts[s1].y;

  for (let seg = 0; seg < 4;) {
    const m = pts[d1].y < pts[d2].y ? pts[d1].y : pts[d2].y;
    const ycount = m - yy;

    for (let i = 0; i < ycount; i++) {
      if (yy >= H_RENDER) break;
      if (yy >= 0) {
        const xs = e1.xx >> 16, xe = e2.xx >> 16;
        const width = xe - xs;
        if (width > 0) {
          const txInc = (e2.txx - e1.txx) / width;
          const tyInc = (e2.txy - e1.txy) / width;
          let uc = e1.txx, vc = e1.txy;
          const row = yy * W;
          for (let x = xs; x < xe; x++) {
            if (x >= 0 && x < W) {
              const u = uc >> 16;
              const v = vc >> 16;
              const dv = dist1[dd + (v & 127)] || 0;
              const du = (u + Math.floor(dv)) & 255;
              const dvClamped = v & 63;
              fb[row + x] = tex[dvClamped * 256 + du];
            }
            uc += txInc; vc += tyInc;
          }
        }
      }
      e1.xx += e1.ax; e1.txx += e1.tax; e1.txy += e1.tay;
      e2.xx += e2.ax; e2.txx += e2.tax; e2.txy += e2.tay;
      yy++;
    }

    if (pts[d1].y === pts[d2].y) {
      s1 = d1; d1 = (s1 - 1 + 4) & 3;
      s2 = d2; d2 = (s2 + 1) & 3;
      seg += 2;
      e1 = setupEdge(s1, d1);
      e2 = setupEdge(s2, d2);
    } else if (pts[d1].y < pts[d2].y) {
      s1 = d1; d1 = (s1 - 1 + 4) & 3; seg++;
      e1 = setupEdge(s1, d1);
    } else {
      s2 = d2; d2 = (s2 + 1) & 3; seg++;
      e2 = setupEdge(s2, d2);
    }
    yy = m;
  }
}
