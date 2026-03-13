/**
 * DOTS — Remastered variant (Part 18)
 *
 * GPU-rendered sphere impostors via instancing, planar reflections on a
 * glossy mirror floor, HSL-parameterised palette, dual-tier bloom, and
 * beat-reactive enhancements.
 *
 * Uses the same deterministic physics simulation as the classic variant
 * (via animation.js) to guarantee frame-perfect choreography sync.
 *
 * Position mapping: the classic's exact projection math (screen_x, screen_y,
 * depth) is computed on CPU and converted to NDC. The vertex shader receives
 * NDC positions directly — no view/projection matrices needed.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
import { FRAME_RATE, MAXDOTS, simulateDots } from './animation.js';

// ── Palette presets ──────────────────────────────────────────────
// Each preset defines the depth hue gradient, saturation, and ground grid tint.

const PALETTES = [
  { name: 'Classic',     hueNear: 185, hueFar: 185, sat: 0.73, ground: [0.3, 0.5, 0.6] },
  { name: 'Gruvbox',     hueNear: 40,  hueFar: 140, sat: 0.60, ground: [0.6, 0.5, 0.2] },
  { name: 'Monokai',     hueNear: 325, hueFar: 55,  sat: 0.85, ground: [0.7, 0.2, 0.5] },
  { name: 'Dracula',     hueNear: 265, hueFar: 185, sat: 0.75, ground: [0.5, 0.3, 0.7] },
  { name: 'Solarized',   hueNear: 195, hueFar: 45,  sat: 0.65, ground: [0.2, 0.5, 0.6] },
  { name: 'Nord',        hueNear: 195, hueFar: 215, sat: 0.50, ground: [0.35, 0.5, 0.6] },
  { name: 'One Dark',    hueNear: 210, hueFar: 290, sat: 0.70, ground: [0.3, 0.5, 0.7] },
  { name: 'Catppuccin',  hueNear: 220, hueFar: 340, sat: 0.72, ground: [0.4, 0.4, 0.7] },
  { name: 'Tokyo Night', hueNear: 225, hueFar: 350, sat: 0.78, ground: [0.35, 0.45, 0.7] },
  { name: 'Synthwave',   hueNear: 310, hueFar: 170, sat: 0.90, ground: [0.6, 0.2, 0.7] },
  { name: 'Kanagawa',    hueNear: 225, hueFar: 30,  sat: 0.55, ground: [0.35, 0.45, 0.6] },
  { name: 'Everforest',  hueNear: 140, hueFar: 90,  sat: 0.50, ground: [0.4, 0.55, 0.35] },
  { name: 'Rose Pine',   hueNear: 280, hueFar: 195, sat: 0.60, ground: [0.45, 0.4, 0.6] },
];

// ── Shaders ──────────────────────────────────────────────────────

const SPHERE_VERT = `#version 300 es
precision highp float;

layout(location = 0) in vec2 aQuadPos;
layout(location = 1) in vec3 aInstancePos;   // x=ndcX, y=ndcY, z=depth(bp)

uniform float uDotScale;
uniform float uAspect;

out vec2 vLocalUV;
out float vDepth;

void main() {
  float depth = aInstancePos.z;
  if (depth <= 0.0) {
    gl_Position = vec4(0.0, 0.0, -2.0, 1.0);
    vLocalUV = vec2(0.0);
    vDepth = 0.0;
    return;
  }

  float radius = uDotScale * 450.0 / depth;
  vec2 offset;
  offset.x = aQuadPos.x * radius / uAspect;
  offset.y = aQuadPos.y * radius;

  vec2 center = aInstancePos.xy;
  float zNdc = 2.0 * clamp((depth - 2000.0) / 18000.0, 0.0, 1.0) - 1.0;

  gl_Position = vec4(center + offset, zNdc, 1.0);
  vLocalUV = aQuadPos;
  vDepth = depth;
}
`;

const SPHERE_FRAG = `#version 300 es
precision highp float;

in vec2 vLocalUV;
in float vDepth;

uniform float uHueNear;
uniform float uHueFar;
uniform float uSaturation;
uniform float uSpecularPower;
uniform float uBeat;
uniform float uFade;
uniform float uIsReflection;
uniform float uDepthRange;

out vec4 fragColor;

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
  float dist2 = dot(vLocalUV, vLocalUV);
  if (dist2 > 1.0) discard;

  vec3 N = vec3(vLocalUV, sqrt(1.0 - dist2));

  vec3 L = normalize(vec3(0.4, 0.8, 0.5));
  vec3 V = vec3(0.0, 0.0, 1.0);

  float diff = max(dot(N, L), 0.0);
  vec3 H = normalize(L + V);
  float beatPulse = pow(1.0 - uBeat, 6.0);
  float specPow = uSpecularPower + beatPulse * 16.0;
  float spec = pow(max(dot(N, H), 0.0), specPow);

  float depthFactor = clamp(1.0 - vDepth / uDepthRange, 0.15, 1.0);
  float lightness = mix(0.15, 0.65, depthFactor);
  float hue = mix(uHueFar, uHueNear, depthFactor);
  vec3 baseColor = hsl2rgb(hue, uSaturation, lightness);

  vec3 ambient = baseColor * 0.2;
  vec3 diffuse = baseColor * diff * 0.7;
  vec3 specular = vec3(1.0) * spec * (0.5 + beatPulse * 0.3);

  vec3 color = ambient + diffuse + specular;

  float alpha = 1.0;
  if (uIsReflection > 0.5) {
    color *= 0.6;
    alpha *= 0.7;
  }

  float edgeSoft = 1.0 - smoothstep(0.85, 1.0, dist2);
  fragColor = vec4(color * uFade, alpha * uFade * edgeSoft);
}
`;

const GROUND_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uReflectionTex;
uniform float uReflectivity;
uniform float uGroundRoughness;
uniform float uGroundBrightness;
uniform float uFade;
uniform vec2 uResolution;
uniform vec3 uGroundTint;

void main() {
  if (vUV.y > 0.5) discard;

  float t = (0.5 - vUV.y) / 0.5;

  vec3 refl = vec3(0.0);
  if (uGroundRoughness > 0.001) {
    vec2 texel = 1.0 / uResolution;
    float r = uGroundRoughness * 12.0;
    refl += texture(uReflectionTex, vUV + vec2(-r, -r) * texel).rgb * 0.0625;
    refl += texture(uReflectionTex, vUV + vec2( r, -r) * texel).rgb * 0.0625;
    refl += texture(uReflectionTex, vUV + vec2(-r,  r) * texel).rgb * 0.0625;
    refl += texture(uReflectionTex, vUV + vec2( r,  r) * texel).rgb * 0.0625;
    refl += texture(uReflectionTex, vUV + vec2( 0.0, -r) * texel).rgb * 0.125;
    refl += texture(uReflectionTex, vUV + vec2( 0.0,  r) * texel).rgb * 0.125;
    refl += texture(uReflectionTex, vUV + vec2(-r, 0.0) * texel).rgb * 0.125;
    refl += texture(uReflectionTex, vUV + vec2( r, 0.0) * texel).rgb * 0.125;
    refl += texture(uReflectionTex, vUV).rgb * 0.25;
  } else {
    refl = texture(uReflectionTex, vUV).rgb;
  }

  float viewAngle = 1.0 - t;
  float fresnel = mix(uReflectivity * 0.4, uReflectivity, pow(viewAngle, 2.0));

  vec3 baseGround = vec3(0.02, 0.02, 0.025) * uGroundBrightness;

  float gridX = abs(fract(vUV.x * 40.0) - 0.5);
  float gridZ = abs(fract(t * 20.0 / (t + 0.1)) - 0.5);
  float lineX = 1.0 - smoothstep(0.0, 0.02, gridX);
  float lineZ = 1.0 - smoothstep(0.0, 0.03, gridZ);
  float gridLine = max(lineX, lineZ) * 0.08 * uGroundBrightness * (1.0 - t * 0.8);
  baseGround += vec3(gridLine) * uGroundTint;

  vec3 color = mix(baseGround, refl, fresnel);
  float edgeFade = smoothstep(0.0, 0.05, t);
  fragColor = vec4(color * uFade, uFade * edgeFade);
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
uniform float uScanlineStr;
uniform float uWhiteFlash;
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 6.0);
  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.2)
    + wide  * (uBloomStr * 0.6 + beatPulse * 0.12);
  float scanline = (1.0 - uScanlineStr) + uScanlineStr * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;
  color = mix(color, vec3(1.0), uWhiteFlash);
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
  const rb = gl.createRenderbuffer();
  gl.bindRenderbuffer(gl.RENDERBUFFER, rb);
  gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, w, h);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  return { fb, rb };
}

function deleteFBO(gl, fbo) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  if (fbo.tex) gl.deleteTexture(fbo.tex);
  if (fbo.rb) gl.deleteRenderbuffer(fbo.rb);
}

// ── Module state ─────────────────────────────────────────────────

let sphereProg, groundProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let sphereVAO, quadBuf, instanceBuf;
let msaaFBO, sceneFBO, reflectionFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0, msaaSamples = 4;

let su = {}, gu = {}, beu = {}, blu = {}, cu = {};

const positionData = new Float32Array(MAXDOTS * 3);
const reflectionPosData = new Float32Array(MAXDOTS * 3);

const DEPTH_RANGE = 20000;

export default {
  label: 'dots (remastered)',

  params: [
    gp('Palette',          { key: 'palette',          label: 'Theme',             type: 'select', options: PALETTES.map((p, i) => ({ value: i, label: p.name })), default: 9 }),
    gp('Palette',          { key: 'hueShift',         label: 'Hue Shift',         type: 'float', min: -180, max: 180, step: 1,    default: 26 }),
    gp('Palette',          { key: 'satBoost',         label: 'Saturation Adjust', type: 'float', min: -0.5, max: 0.5, step: 0.01, default: -0.12 }),
    gp('Lighting',         { key: 'specularPower',    label: 'Specular',          type: 'float', min: 8,   max: 128, step: 1,     default: 32 }),
    gp('Ground',           { key: 'reflectivity',     label: 'Reflectivity',      type: 'float', min: 0,   max: 1,   step: 0.01,  default: 0.79 }),
    gp('Ground',           { key: 'groundBrightness', label: 'Ground Brightness', type: 'float', min: 0,   max: 5,   step: 0.1,   default: 1.5 }),
    gp('Ground',           { key: 'groundRoughness',  label: 'Ground Roughness',  type: 'float', min: 0,   max: 0.5, step: 0.01,  default: 0.05 }),
    gp('Effect',           { key: 'dotScale',         label: 'Dot Scale',         type: 'float', min: 0.5, max: 3,   step: 0.05,  default: 0.50 }),
    gp('Post-Processing',  { key: 'bloomThreshold',   label: 'Bloom Threshold',   type: 'float', min: 0,   max: 1,   step: 0.01,  default: 0.3 }),
    gp('Post-Processing',  { key: 'bloomStrength',    label: 'Bloom Strength',    type: 'float', min: 0,   max: 2,   step: 0.01,  default: 0.5 }),
    gp('Post-Processing',  { key: 'beatBounce',       label: 'Beat Bounce',       type: 'float', min: 0,   max: 1,   step: 0.01,  default: 0.3 }),
    gp('Post-Processing',  { key: 'scanlineStr',      label: 'Scanlines',         type: 'float', min: 0,   max: 0.5, step: 0.01,  default: 0.03 }),
  ],

  init(gl) {
    sphereProg = createProgram(gl, SPHERE_VERT, SPHERE_FRAG);
    groundProg = createProgram(gl, FULLSCREEN_VERT, GROUND_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    su = {
      dotScale:       gl.getUniformLocation(sphereProg, 'uDotScale'),
      aspect:         gl.getUniformLocation(sphereProg, 'uAspect'),
      hueNear:        gl.getUniformLocation(sphereProg, 'uHueNear'),
      hueFar:         gl.getUniformLocation(sphereProg, 'uHueFar'),
      saturation:     gl.getUniformLocation(sphereProg, 'uSaturation'),
      specularPower:  gl.getUniformLocation(sphereProg, 'uSpecularPower'),
      beat:           gl.getUniformLocation(sphereProg, 'uBeat'),
      fade:           gl.getUniformLocation(sphereProg, 'uFade'),
      isReflection:   gl.getUniformLocation(sphereProg, 'uIsReflection'),
      depthRange:     gl.getUniformLocation(sphereProg, 'uDepthRange'),
    };

    gu = {
      reflectionTex:   gl.getUniformLocation(groundProg, 'uReflectionTex'),
      reflectivity:     gl.getUniformLocation(groundProg, 'uReflectivity'),
      groundBrightness: gl.getUniformLocation(groundProg, 'uGroundBrightness'),
      groundRoughness:  gl.getUniformLocation(groundProg, 'uGroundRoughness'),
      fade:             gl.getUniformLocation(groundProg, 'uFade'),
      resolution:      gl.getUniformLocation(groundProg, 'uResolution'),
      groundTint:      gl.getUniformLocation(groundProg, 'uGroundTint'),
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
      scene:      gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight: gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:  gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:   gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:       gl.getUniformLocation(compositeProg, 'uBeat'),
      scanlineStr:gl.getUniformLocation(compositeProg, 'uScanlineStr'),
      whiteFlash: gl.getUniformLocation(compositeProg, 'uWhiteFlash'),
    };

    sphereVAO = gl.createVertexArray();
    gl.bindVertexArray(sphereVAO);

    quadBuf = gl.createBuffer();
    const quadVerts = new Float32Array([-1,-1, 1,-1, -1,1, 1,1]);
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, quadVerts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    instanceBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferData(gl.ARRAY_BUFFER, MAXDOTS * 3 * 4, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(1, 1);

    gl.bindVertexArray(null);

    msaaSamples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES));
  },

  render(gl, t, beat, params) {
    const p = (k, d) => params[k] ?? d;
    const sw = gl.drawingBufferWidth;
    const sh = gl.drawingBufferHeight;
    const aspect = sw / sh;

    if (sw !== fboW || sh !== fboH) {
      deleteFBO(gl, msaaFBO);
      deleteFBO(gl, sceneFBO);
      deleteFBO(gl, reflectionFBO);
      deleteFBO(gl, bloomFBO1);
      deleteFBO(gl, bloomFBO2);
      deleteFBO(gl, bloomWideFBO1);
      deleteFBO(gl, bloomWideFBO2);
      msaaFBO       = createMSAAFBO(gl, sw, sh, msaaSamples);
      sceneFBO      = createFBO(gl, sw, sh);
      reflectionFBO = createFBO(gl, sw, sh);
      bloomFBO1     = createFBO(gl, sw >> 1, sh >> 1);
      bloomFBO2     = createFBO(gl, sw >> 1, sh >> 1);
      bloomWideFBO1 = createFBO(gl, sw >> 2, sh >> 2);
      bloomWideFBO2 = createFBO(gl, sw >> 2, sh >> 2);
      fboW = sw;
      fboH = sh;
    }

    const targetFrame = Math.floor(t * FRAME_RATE);
    const sim = simulateDots(targetFrame);
    const fade = sim.fade;
    const whiteFlash = sim.whiteFlash;
    const rotcos = sim.rotCos;
    const rotsin = sim.rotSin;

    // Compute screen-space NDC positions using exact classic projection math
    for (let i = 0; i < MAXDOTS; i++) {
      const d = sim.dots[i];
      const bp = Math.floor(((d.z * rotcos - d.x * rotsin) / 0x10000) + 9000);
      if (bp <= 0) {
        positionData[i * 3] = 0;
        positionData[i * 3 + 1] = 0;
        positionData[i * 3 + 2] = -1;
        reflectionPosData[i * 3] = 0;
        reflectionPosData[i * 3 + 1] = 0;
        reflectionPosData[i * 3 + 2] = -1;
        continue;
      }

      const a = (d.z * rotsin + d.x * rotcos) / 0x100;
      const screenX = (a + a / 8) / bp + 160;   // 0..319
      const screenY = (d.y * 64) / bp + 100;     // 0..199
      const groundScreenY = 0x80000 / bp + 100;  // shadow/ground Y for this depth
      const reflScreenY = 2 * groundScreenY - screenY;

      const ndcX = (screenX - 160) / 160;
      const ndcY = -(screenY - 100) / 100;
      const reflNdcY = -(reflScreenY - 100) / 100;

      positionData[i * 3]     = ndcX;
      positionData[i * 3 + 1] = ndcY;
      positionData[i * 3 + 2] = bp;

      reflectionPosData[i * 3]     = ndcX;
      reflectionPosData[i * 3 + 1] = reflNdcY;
      reflectionPosData[i * 3 + 2] = bp;
    }

    const dotScale = p('dotScale', 1.0);
    const pal = PALETTES[p('palette', 0)];
    const hueShift = p('hueShift', 0);
    const hueNear = pal.hueNear + hueShift;
    const hueFar = pal.hueFar + hueShift;
    const saturation = Math.max(0, Math.min(1, pal.sat + p('satBoost', 0)));
    const specularPower = p('specularPower', 32);

    function setSphereUniforms(isReflection) {
      gl.useProgram(sphereProg);
      gl.uniform1f(su.dotScale, dotScale);
      gl.uniform1f(su.aspect, aspect);
      gl.uniform1f(su.hueNear, hueNear);
      gl.uniform1f(su.hueFar, hueFar);
      gl.uniform1f(su.saturation, saturation);
      gl.uniform1f(su.specularPower, specularPower);
      gl.uniform1f(su.beat, beat);
      gl.uniform1f(su.fade, fade);
      gl.uniform1f(su.isReflection, isReflection ? 1.0 : 0.0);
      gl.uniform1f(su.depthRange, DEPTH_RANGE);
    }

    // ── Pass 1: Reflection (mirrored dots into reflectionFBO) ────

    gl.bindFramebuffer(gl.FRAMEBUFFER, reflectionFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, reflectionPosData);
    setSphereUniforms(true);
    gl.bindVertexArray(sphereVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAXDOTS);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    // ── Pass 2: Main scene (ground + dots into MSAA FBO) ─────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, msaaFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

    // Ground plane with reflection
    gl.useProgram(groundProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, reflectionFBO.tex);
    gl.uniform1i(gu.reflectionTex, 0);
    gl.uniform1f(gu.reflectivity, p('reflectivity', 0.6));
    gl.uniform1f(gu.groundBrightness, p('groundBrightness', 1.0));
    gl.uniform1f(gu.groundRoughness, p('groundRoughness', 0.05));
    gl.uniform3fv(gu.groundTint, pal.ground);
    gl.uniform1f(gu.fade, fade);
    gl.uniform2f(gu.resolution, sw, sh);
    quad.draw();

    // Normal dots
    gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, positionData);
    setSphereUniforms(false);
    gl.bindVertexArray(sphereVAO);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, MAXDOTS);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);

    // ── Resolve MSAA → scene texture ─────────────────────────────

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, msaaFBO.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, sceneFBO.fb);
    gl.blitFramebuffer(0, 0, sw, sh, 0, 0, sw, sh, gl.COLOR_BUFFER_BIT, gl.NEAREST);

    // ── Bloom pipeline (dual-tier) ───────────────────────────────

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
    gl.uniform1i(cu.scene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomFBO1.tex);
    gl.uniform1i(cu.bloomTight, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, bloomWideFBO1.tex);
    gl.uniform1i(cu.bloomWide, 2);
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.5));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.scanlineStr, p('scanlineStr', 0.03));
    gl.uniform1f(cu.whiteFlash, whiteFlash);
    quad.draw();
  },

  destroy(gl) {
    if (sphereProg) gl.deleteProgram(sphereProg);
    if (groundProg) gl.deleteProgram(groundProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (sphereVAO) gl.deleteVertexArray(sphereVAO);
    if (quadBuf) gl.deleteBuffer(quadBuf);
    if (instanceBuf) gl.deleteBuffer(instanceBuf);
    deleteFBO(gl, msaaFBO);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, reflectionFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sphereProg = groundProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    sphereVAO = quadBuf = instanceBuf = null;
    msaaFBO = sceneFBO = reflectionFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
  },
};
