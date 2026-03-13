/**
 * GLENZ_TRANSITION — Remastered variant (Part 5)
 *
 * GPU-rendered two-phase transition with dual-tier bloom and
 * configurable checkerboard hue/saturation/brightness.
 *
 * Phase 1 (frames 0–48): CPU title wipe identical to classic,
 * uploaded as a texture and composited through the bloom pipeline.
 *
 * Phase 2 (frames 49+): GPU fragment shader renders the bouncing
 * checkerboard with the same physics as the classic, applying HSV
 * color adjustments and bloom post-processing.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
import { SRTITLE_B64 } from '../beglogo/data.js';
import { CHECKERBOARD_B64 } from './data.js';

const W = 320;
const H_TITLE = 400;
const H_CHECKER = 200;
const FRAME_RATE = 70;
const ZOOMER_FRAMES = 48;
const FADE_MAX = 32;

// ── Shaders ──────────────────────────────────────────────────────

const TITLE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

const BOUNCE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uCheckerTex;
uniform float uBounceY1;
uniform float uBounceY2;
uniform float uEdgeHeight;
uniform float uHue;
uniform float uSaturation;
uniform float uBrightness;

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

vec3 adjustHSV(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  hsv.x = fract(hsv.x + uHue / 360.0);
  hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
  hsv.z *= uBrightness;
  return hsv2rgb(hsv);
}

void main() {
  vec2 uv = vec2(vUV.x, 1.0 - vUV.y);

  // Face region: vertically scaled source rows 0–99
  if (uv.y >= uBounceY1 && uv.y < uBounceY2 && uBounceY2 > uBounceY1) {
    float t = (uv.y - uBounceY1) / (uBounceY2 - uBounceY1);
    vec3 color = texture(uCheckerTex, vec2(uv.x, t * 0.5)).rgb;
    fragColor = vec4(adjustHSV(color), 1.0);
    return;
  }

  // Edge region: rows 100–107 at 1:1 scale below face
  float edgeBottom = uBounceY2 + uEdgeHeight;
  if (uv.y >= uBounceY2 && uv.y < edgeBottom) {
    float t = (uv.y - uBounceY2) / uEdgeHeight;
    vec3 color = texture(uCheckerTex, vec2(uv.x, 0.5 + t * 0.04)).rgb;
    fragColor = vec4(adjustHSV(color), 1.0);
    return;
  }

  fragColor = vec4(0.0, 0.0, 0.0, 1.0);
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

// ── Data decoders ────────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function u16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function decodeReadp(src) {
  const width = u16(src, 2);
  const height = u16(src, 4);
  const add = u16(src, 8);
  const pal = new Uint8Array(768);
  for (let i = 0; i < 768; i++) pal[i] = src[16 + i];
  const pix = new Uint8Array(width * height);
  let srcIdx = add * 16;
  for (let row = 0; row < height; row++) {
    const bytes = u16(src, srcIdx);
    srcIdx += 2;
    const rowEnd = srcIdx + bytes;
    let destIdx = row * width;
    while (srcIdx < rowEnd) {
      let b = src[srcIdx++];
      let n;
      if (b <= 127) { n = 1; } else { n = b & 0x7f; b = src[srcIdx++]; }
      for (let i = 0; i < n; i++) pix[destIdx++] = b;
    }
  }
  return { pal, pix, width, height };
}

// ── Title wipe (Phase 1) ────────────────────────────────────────

function computeZy(frame) {
  let zy = 0;
  for (let f = 0; f <= frame; f++) {
    zy += Math.floor(f / 4);
    if (zy >= 260) return 260;
  }
  return zy;
}

function renderZoomer(origPixels, origPal, frame, rgba) {
  const zy = computeZy(frame);
  const zy2 = Math.floor(125 * zy / 260);
  const fadeLevel = Math.min(frame, FADE_MAX);

  const k = 255 / 63;
  const pal32 = new Uint32Array(256);
  for (let i = 0; i < 128; i++) {
    const r = Math.round(((FADE_MAX - fadeLevel) * origPal[i * 3] + fadeLevel * 30) / FADE_MAX * k);
    const g = Math.round(((FADE_MAX - fadeLevel) * origPal[i * 3 + 1] + fadeLevel * 30) / FADE_MAX * k);
    const b = Math.round(((FADE_MAX - fadeLevel) * origPal[i * 3 + 2] + fadeLevel * 30) / FADE_MAX * k);
    pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  for (let i = 128; i < 255; i++) {
    const r = Math.round(origPal[i * 3] * k);
    const g = Math.round(origPal[i * 3 + 1] * k);
    const b = Math.round(origPal[i * 3 + 2] * k);
    pal32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
  }
  pal32[255] = 0xff000000;

  const rgba32 = new Uint32Array(rgba.buffer);
  const total = W * H_TITLE;
  for (let i = 0; i < total; i++) {
    const y = Math.floor(i / W);
    const isCleared = y <= zy || y >= (H_TITLE - 1 - zy2);
    rgba32[i] = isCleared ? pal32[255] : pal32[origPixels[i]];
  }
}

// ── Bounce simulation (Phase 2) ─────────────────────────────────

function simulateBounce(bounceFrame) {
  let vel = 0, pos = 0;
  let settled = false;
  for (let i = 0; i < bounceFrame && !settled; i++) {
    vel++;
    pos += vel;
    if (pos > 48 * 16) {
      pos -= vel;
      vel = Math.trunc(-vel * 2 / 3);
      if (vel > -4 && vel < 4) settled = true;
    }
  }
  return { pos, vel, settled };
}

// ── Checkerboard texture loader ──────────────────────────────────

function loadCheckerTexture(gl) {
  const raw = b64ToUint8(CHECKERBOARD_B64);
  const palette = new Uint8Array(768);
  for (let i = 0; i < 768; i++) palette[i] = raw[16 + i];
  const pixels = new Uint8Array(W * H_CHECKER * 4);
  const k = 255 / 63;
  for (let i = 0; i < W * H_CHECKER; i++) {
    const idx = raw[768 + 16 + i];
    pixels[i * 4]     = Math.round(Math.min(63, Math.max(0, palette[idx * 3])) * k);
    pixels[i * 4 + 1] = Math.round(Math.min(63, Math.max(0, palette[idx * 3 + 1])) * k);
    pixels[i * 4 + 2] = Math.round(Math.min(63, Math.max(0, palette[idx * 3 + 2])) * k);
    pixels[i * 4 + 3] = 255;
  }
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H_CHECKER, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

// ── FBO helper ───────────────────────────────────────────────────

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

// ── Module state ─────────────────────────────────────────────────

let titleProg, bounceProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let titleTex, checkerTex;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;

let titlePixels = null;
let titlePal = null;
let titleRGBA = null;

let tu = {}, bu = {}, beu = {}, blu = {}, cu = {};

// ── Effect module ────────────────────────────────────────────────

export default {
  label: 'glenzTransition (remastered)',

  params: [
    gp('Ground',          { key: 'checkerHue',        label: 'Hue Shift',       type: 'float', min: 0,   max: 360, step: 1,    default: 0 }),
    gp('Ground',          { key: 'checkerSaturation', label: 'Saturation',      type: 'float', min: 0,   max: 2,   step: 0.01, default: 1 }),
    gp('Ground',          { key: 'checkerBrightness', label: 'Brightness',      type: 'float', min: 0.5, max: 3,   step: 0.05, default: 1 }),
    gp('Post-Processing', { key: 'bloomThreshold',    label: 'Bloom Threshold', type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.2 }),
    gp('Post-Processing', { key: 'bloomTightStr',     label: 'Bloom Tight',     type: 'float', min: 0,   max: 2,   step: 0.01, default: 0.5 }),
    gp('Post-Processing', { key: 'bloomWideStr',      label: 'Bloom Wide',      type: 'float', min: 0,   max: 2,   step: 0.01, default: 0.35 }),
    gp('Post-Processing', { key: 'beatBloom',         label: 'Beat Bloom',      type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.25 }),
    gp('Post-Processing', { key: 'scanlineStr',       label: 'Scanlines',       type: 'float', min: 0,   max: 0.5, step: 0.01, default: 0.05 }),
  ],

  init(gl) {
    titleProg = createProgram(gl, FULLSCREEN_VERT, TITLE_FRAG);
    bounceProg = createProgram(gl, FULLSCREEN_VERT, BOUNCE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    tu = { frame: gl.getUniformLocation(titleProg, 'uFrame') };

    bu = {
      checkerTex: gl.getUniformLocation(bounceProg, 'uCheckerTex'),
      bounceY1:   gl.getUniformLocation(bounceProg, 'uBounceY1'),
      bounceY2:   gl.getUniformLocation(bounceProg, 'uBounceY2'),
      edgeHeight: gl.getUniformLocation(bounceProg, 'uEdgeHeight'),
      hue:        gl.getUniformLocation(bounceProg, 'uHue'),
      saturation: gl.getUniformLocation(bounceProg, 'uSaturation'),
      brightness: gl.getUniformLocation(bounceProg, 'uBrightness'),
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

    const titleRaw = b64ToUint8(SRTITLE_B64);
    const decoded = decodeReadp(titleRaw);
    titlePixels = decoded.pix;
    titlePal = decoded.pal;
    titleRGBA = new Uint8Array(W * H_TITLE * 4);

    titleTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, titleTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H_TITLE, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    checkerTex = loadCheckerTexture(gl);
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;

    if (sw !== fboW || sh !== fboH) {
      if (sceneFBO) { gl.deleteFramebuffer(sceneFBO.fb); gl.deleteTexture(sceneFBO.tex); }
      if (bloomFBO1) { gl.deleteFramebuffer(bloomFBO1.fb); gl.deleteTexture(bloomFBO1.tex); }
      if (bloomFBO2) { gl.deleteFramebuffer(bloomFBO2.fb); gl.deleteTexture(bloomFBO2.tex); }
      if (bloomWideFBO1) { gl.deleteFramebuffer(bloomWideFBO1.fb); gl.deleteTexture(bloomWideFBO1.tex); }
      if (bloomWideFBO2) { gl.deleteFramebuffer(bloomWideFBO2.fb); gl.deleteTexture(bloomWideFBO2.tex); }
      sceneFBO = createFBO(gl, sw, sh);
      bloomFBO1 = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2 = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    const frame = Math.floor(t * FRAME_RATE);

    // ── Render scene to FBO ──────────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (frame <= ZOOMER_FRAMES) {
      renderZoomer(titlePixels, titlePal, frame, titleRGBA);
      gl.bindTexture(gl.TEXTURE_2D, titleTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H_TITLE, gl.RGBA, gl.UNSIGNED_BYTE, titleRGBA);

      gl.useProgram(titleProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, titleTex);
      gl.uniform1i(tu.frame, 0);
      quad.draw();
    } else {
      const bounceFrame = frame - ZOOMER_FRAMES;
      const { pos } = simulateBounce(bounceFrame);

      const y = Math.floor(pos / 16);
      const y1 = Math.floor(130 + y / 2) / H_CHECKER;
      const y2 = Math.floor(130 + y * 3 / 2) / H_CHECKER;
      const edgeHeight = 8 / H_CHECKER;

      gl.useProgram(bounceProg);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, checkerTex);
      gl.uniform1i(bu.checkerTex, 0);
      gl.uniform1f(bu.bounceY1, y1);
      gl.uniform1f(bu.bounceY2, y2);
      gl.uniform1f(bu.edgeHeight, edgeHeight);
      gl.uniform1f(bu.hue, p('checkerHue', 0));
      gl.uniform1f(bu.saturation, p('checkerSaturation', 1));
      gl.uniform1f(bu.brightness, p('checkerBrightness', 1));
      quad.draw();
    }

    // ── Bloom pipeline (dual-tier) ───────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.2));
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
    gl.uniform1f(cu.bloomTightStr, p('bloomTightStr', 0.5));
    gl.uniform1f(cu.bloomWideStr, p('bloomWideStr', 0.35));
    gl.uniform1f(cu.beatBloom, p('beatBloom', 0.25));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.05));
    quad.draw();
  },

  destroy(gl) {
    if (titleProg) gl.deleteProgram(titleProg);
    if (bounceProg) gl.deleteProgram(bounceProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (titleTex) gl.deleteTexture(titleTex);
    if (checkerTex) gl.deleteTexture(checkerTex);
    if (sceneFBO) { gl.deleteFramebuffer(sceneFBO.fb); gl.deleteTexture(sceneFBO.tex); }
    if (bloomFBO1) { gl.deleteFramebuffer(bloomFBO1.fb); gl.deleteTexture(bloomFBO1.tex); }
    if (bloomFBO2) { gl.deleteFramebuffer(bloomFBO2.fb); gl.deleteTexture(bloomFBO2.tex); }
    if (bloomWideFBO1) { gl.deleteFramebuffer(bloomWideFBO1.fb); gl.deleteTexture(bloomWideFBO1.tex); }
    if (bloomWideFBO2) { gl.deleteFramebuffer(bloomWideFBO2.fb); gl.deleteTexture(bloomWideFBO2.tex); }
    titleProg = bounceProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    titleTex = checkerTex = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    titlePixels = titlePal = titleRGBA = null;
  },
};
