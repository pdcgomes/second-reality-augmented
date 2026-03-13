/**
 * TUNNELI (Dottitunneli) — Remastered variant (Part 7)
 *
 * The classic dot tunnel rebuilt at native resolution with anti-aliased
 * Gaussian-splat dots, depth-based neon color gradients, additive blending
 * for natural glow overlap, and a dual-pass bloom pipeline. Dot density per
 * ring is configurable (up to 512 vs the classic's 64) for smoother circles.
 * Beat reactivity pulses dot size and bloom intensity.
 *
 * Same tunneli animation math: sinusoidal position tables with growing
 * amplitude, 100 active circles shifting each frame, perspective
 * foreshortening via sade[] lookup. All state derives from the frame number
 * for O(1) scrubbing.
 *
 * Original code: TUNNELI/ folder (Turbo Pascal by TRUG).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';

// ── Palette presets ──────────────────────────────────────────────
// Each preset defines the near/far hue gradient for the tunnel rings.

const PALETTES = [
  { name: 'Classic',     hueNear: 190, hueFar: 190 },
  { name: 'Gruvbox',     hueNear: 35,  hueFar: 140 },
  { name: 'Monokai',     hueNear: 55,  hueFar: 325 },
  { name: 'Dracula',     hueNear: 270, hueFar: 180 },
  { name: 'Solarized',   hueNear: 175, hueFar: 45  },
  { name: 'Nord',        hueNear: 200, hueFar: 220 },
  { name: 'One Dark',    hueNear: 215, hueFar: 285 },
  { name: 'Catppuccin',  hueNear: 225, hueFar: 340 },
  { name: 'Tokyo Night', hueNear: 230, hueFar: 350 },
  { name: 'Synthwave',   hueNear: 170, hueFar: 310 },
  { name: 'Kanagawa',    hueNear: 220, hueFar: 30  },
  { name: 'Everforest',  hueNear: 145, hueFar: 85  },
  { name: 'Rose Pine',   hueNear: 285, hueFar: 195 },
];

const FRAME_RATE = 70;
const VEKE = 1060;
const PI = Math.PI;
const MAX_DOTS_PER_RING = 512;
const MAX_RINGS = 77;
const MAX_DOTS = MAX_RINGS * MAX_DOTS_PER_RING;

// ── Precomputed tables (identical to classic) ────────────────────

const sinit = new Float64Array(4096);
const cosit = new Float64Array(2048);
for (let x = 0; x < 4096; x++) sinit[x] = Math.sin(PI * x / 128) * (x * 3 / 128);
for (let x = 0; x < 2048; x++) cosit[x] = Math.cos(PI * x / 128) * (x * 4 / 64);

const sade = new Int32Array(101);
for (let z = 0; z <= 100; z++) sade[z] = Math.trunc(16384 / (z * 7 + 95));

// ── Shaders ──────────────────────────────────────────────────────

const DOT_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aPosition;
layout(location = 1) in float aBrightness;
layout(location = 2) in float aDepth;

uniform vec2 uResolution;
uniform float uDotSize;
uniform float uBeat;
uniform float uBeatReactivity;

out float vBrightness;
out float vDepth;

void main() {
  vec2 ndc = (aPosition / vec2(160.0, 100.0)) - 1.0;
  ndc.y = -ndc.y;
  gl_Position = vec4(ndc, 0.0, 1.0);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  float baseSz = uDotSize * (1.0 - aDepth * 0.6);
  float scale = uResolution.y / 200.0;
  gl_PointSize = clamp(baseSz * scale * (1.0 + beatPulse * 0.3), 1.0, 128.0);

  vBrightness = aBrightness;
  vDepth = aDepth;
}
`;

const DOT_FRAG = `#version 300 es
precision highp float;

in float vBrightness;
in float vDepth;

out vec4 fragColor;

uniform float uHueNear;
uniform float uHueFar;
uniform float uBeat;
uniform float uBeatReactivity;
uniform float uFade;

vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = mod(h / 60.0, 6.0);
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
  vec2 pc = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(pc, pc);
  if (r2 > 1.0) discard;
  float alpha = exp(-r2 * 3.5);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;

  float hueDiff = uHueFar - uHueNear;
  if (hueDiff > 180.0) hueDiff -= 360.0;
  if (hueDiff < -180.0) hueDiff += 360.0;
  float hue = mod(uHueNear + hueDiff * vDepth, 360.0);
  if (hue < 0.0) hue += 360.0;
  float lightness = vBrightness * (0.55 + beatPulse * 0.15);
  float saturation = 0.85 - vDepth * 0.25;

  vec3 color = hsl2rgb(hue, saturation, lightness);

  alpha *= mix(1.0, 0.3, vDepth);

  color *= uFade;
  alpha *= uFade;

  fragColor = vec4(color, alpha);
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
    + tight * (uBloomStr + beatPulse * 0.3)
    + wide  * (uBloomStr * 0.6 + beatPulse * 0.2);
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
  gl.texImage2D(gl.TEXTURE_2D, 0, fboInternalFmt, w, h, 0, gl.RGBA, fboType, null);
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

let dotProg, bloomExtractProg, blurProg, compositeProg;
let quad, dotVAO, dotVBO;
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;
let fboInternalFmt, fboType;

let du = {}, beu = {}, blu = {}, cou = {};
let dotData;

export default {
  label: 'tunneli (remastered)',

  params: [
    gp('Palette',  { key: 'palette',  label: 'Theme',     type: 'select', options: PALETTES.map((p, i) => ({ value: i, label: p.name })), default: 7 }),
    gp('Palette',  { key: 'hueShift', label: 'Hue Shift', type: 'float', min: -180, max: 180, step: 1, default: 1 }),
    gp('Tunnel',  { key: 'dotsPerRing',    label: 'Dots per Ring',    type: 'float', min: 64,  max: 512, step: 16,   default: 144 }),
    gp('Tunnel',  { key: 'dotSize',        label: 'Dot Size',         type: 'float', min: 0.5, max: 8,   step: 0.1,  default: 2.9 }),
    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1, step: 0.01, default: 0.24 }),
    gp('Post-Processing', { key: 'bloomStrength',  label: 'Bloom Strength',  type: 'float', min: 0, max: 2, step: 0.01, default: 0.69 }),
    gp('Post-Processing', { key: 'beatReactivity', label: 'Beat Reactivity', type: 'float', min: 0, max: 1, step: 0.01, default: 0.5 }),
    gp('Post-Processing', { key: 'scanlineStr',    label: 'Scanlines',       type: 'float', min: 0, max: 0.5, step: 0.01, default: 0.07 }),
  ],

  init(gl) {
    const hasHDR = !!gl.getExtension('EXT_color_buffer_float');
    fboInternalFmt = hasHDR ? gl.RGBA16F : gl.RGBA8;
    fboType = hasHDR ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;

    dotProg = createProgram(gl, DOT_VERT, DOT_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    du = {
      resolution: gl.getUniformLocation(dotProg, 'uResolution'),
      dotSize:    gl.getUniformLocation(dotProg, 'uDotSize'),
      beat:       gl.getUniformLocation(dotProg, 'uBeat'),
      beatReact:  gl.getUniformLocation(dotProg, 'uBeatReactivity'),
      hueNear:    gl.getUniformLocation(dotProg, 'uHueNear'),
      hueFar:     gl.getUniformLocation(dotProg, 'uHueFar'),
      fade:       gl.getUniformLocation(dotProg, 'uFade'),
    };
    beu = {
      scene:     gl.getUniformLocation(bloomExtractProg, 'uScene'),
      threshold: gl.getUniformLocation(bloomExtractProg, 'uThreshold'),
    };
    blu = {
      tex:       gl.getUniformLocation(blurProg, 'uTex'),
      direction: gl.getUniformLocation(blurProg, 'uDirection'),
      resolution: gl.getUniformLocation(blurProg, 'uResolution'),
    };
    cou = {
      scene:      gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight: gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:  gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:   gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:       gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReact:  gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
      scanlineStr: gl.getUniformLocation(compositeProg, 'uScanlineStr'),
    };

    dotData = new Float32Array(MAX_DOTS * 4);

    dotVAO = gl.createVertexArray();
    gl.bindVertexArray(dotVAO);

    dotVBO = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, dotVBO);
    gl.bufferData(gl.ARRAY_BUFFER, dotData.byteLength, gl.DYNAMIC_DRAW);

    const STRIDE = 4 * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, STRIDE, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, STRIDE, 8);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 1, gl.FLOAT, false, STRIDE, 12);

    gl.bindVertexArray(null);
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

    const frame = Math.floor(t * FRAME_RATE);
    const dotsPerRing = Math.min(MAX_DOTS_PER_RING, Math.round(p('dotsPerRing', 256)));

    // Reference circle (putki[5]) for viewport tracking
    const birth5 = frame - 94;
    let refX = 0, refY = 0;
    if (birth5 >= 0) {
      refX = -sinit[(birth5 * 3) & 4095];
      refY = sinit[(birth5 * 2) & 4095] - cosit[birth5 & 2047] + sinit[birth5 & 4095];
    }

    // Build dot buffer (back-to-front, same order as classic)
    let dotCount = 0;
    for (let x = 80; x >= 4; x--) {
      const birthFrame = frame - 99 + x;
      if (birthFrame < 0) continue;

      const px = -sinit[(birthFrame * 3) & 4095];
      const py = sinit[(birthFrame * 2) & 4095]
               - cosit[birthFrame & 2047]
               + sinit[birthFrame & 4095];

      let baseColor;
      if (birthFrame >= VEKE - 102) baseColor = 0;
      else if ((birthFrame & 15) > 7) baseColor = 128;
      else baseColor = 64;

      const depthFade = x / 1.3;
      const bbc = baseColor + Math.trunc(depthFade);
      if (bbc < 64) continue;

      const bx = px - refX;
      const by = py - refY;
      const br = sade[x];
      if (br < 0 || br >= 138) continue;

      const radius = br + 10;
      const depth = (x - 4) / 76;

      let brightness;
      if (baseColor === 64) {
        brightness = Math.max(0, 1.0 - depthFade / 64);
      } else {
        brightness = Math.max(0, 0.75 * (1.0 - depthFade / 64));
      }

      const angleStep = PI * 2 / dotsPerRing;
      for (let a = 0; a < dotsPerRing; a++) {
        const angle = a * angleStep;
        const dx = 160 + Math.sin(angle) * 1.7 * radius + bx;
        const dy = 100 + Math.cos(angle) * radius + by;

        if (dx < -20 || dx > 340 || dy < -20 || dy > 220) continue;
        if (dotCount >= MAX_DOTS) break;

        const off = dotCount * 4;
        dotData[off]     = dx;
        dotData[off + 1] = dy;
        dotData[off + 2] = brightness;
        dotData[off + 3] = depth;
        dotCount++;
      }
      if (dotCount >= MAX_DOTS) break;
    }

    // Upload dot data
    gl.bindBuffer(gl.ARRAY_BUFFER, dotVBO);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, dotData, 0, dotCount * 4);

    // Fade-in: bloom amplifies faint early dots that are invisible as
    // single pixels in the classic. Ramp output over the first ~0.7s
    // so the remastered's visual onset matches the classic.
    const fade = frame < 20 ? 0 : Math.min(1, (frame - 20) / 50);

    // ── Pass 1: Dots → scene FBO (additive blending) ─────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    if (dotCount > 0 && fade > 0) {
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

      gl.useProgram(dotProg);
      gl.uniform2f(du.resolution, sw, sh);
      gl.uniform1f(du.dotSize, p('dotSize', 3.0));
      gl.uniform1f(du.beat, beat);
      gl.uniform1f(du.beatReact, p('beatReactivity', 0.5));
      const pal = PALETTES[p('palette', 0)];
      const hueShift = p('hueShift', 0);
      gl.uniform1f(du.hueNear, pal.hueNear + hueShift);
      gl.uniform1f(du.hueFar, pal.hueFar + hueShift);
      gl.uniform1f(du.fade, fade);

      gl.bindVertexArray(dotVAO);
      gl.drawArrays(gl.POINTS, 0, dotCount);
      gl.bindVertexArray(null);

      gl.disable(gl.BLEND);
    }

    // ── Bloom pipeline ───────────────────────────────────────────

    const hw = sw >> 1, hh = sh >> 1;
    const qw = sw >> 2, qh = sh >> 2;

    // Tight bloom: extract
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomFBO1.fb);
    gl.viewport(0, 0, hw, hh);
    gl.useProgram(bloomExtractProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneFBO.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, p('bloomThreshold', 0.15));
    quad.draw();

    // Tight bloom: blur
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

    // Wide bloom: extract from tight
    gl.bindFramebuffer(gl.FRAMEBUFFER, bloomWideFBO1.fb);
    gl.viewport(0, 0, qw, qh);
    gl.useProgram(bloomExtractProg);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(beu.scene, 0);
    gl.uniform1f(beu.threshold, 0.0);
    quad.draw();

    // Wide bloom: blur
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
    gl.uniform1f(cou.bloomStr, p('bloomStrength', 0.6));
    gl.uniform1f(cou.beat, beat);
    gl.uniform1f(cou.beatReact, p('beatReactivity', 0.5));
    gl.uniform1f(cou.scanlineStr, p('scanlineStr', 0));
    quad.draw();
  },

  destroy(gl) {
    if (dotProg) gl.deleteProgram(dotProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (dotVAO) gl.deleteVertexArray(dotVAO);
    if (dotVBO) gl.deleteBuffer(dotVBO);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    dotProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    dotVAO = dotVBO = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    fboInternalFmt = fboType = null;
    dotData = null;
  },
};
