/**
 * PAM — Remastered variant (Part 3)
 *
 * The original PAM plays a 41-frame pre-rendered explosion (FLI from 3D Studio)
 * over the ALKU landscape. This remaster uses frames 00-06 as the base core
 * shape (bilinear-upscaled), overlays a procedural lava/ember texture on the
 * core, and replaces the rasterized shockwave with a volumetric shader-driven
 * blast that expands with perspective depth.
 *
 * Three visual layers on top of the background:
 *   Phase 1 — Lava core (frames 00-06 + procedural cracks/embers) + volumetric blast
 *   Phase 2 — Pulsing purple horizon gradient
 *   Phase 3 — Twinkling star overlay
 *
 * Post-processing: dual-tier bloom + beat reactivity.
 *
 * Original code: PAM/ folder in SecondReality repo (TRUG animation, WILDFIRE code).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { gp } from '../index.js';
import { ANI_B64, PALETTE } from './data.js';

const W = 320;
const H = 200;
const FRAME_RATE = 70 / 4;
const CORE_FRAMES = 7; // frames 0-6 used as core shape

const PALETTE_FADE = [
  63, 32, 16, 8, 4, 2, 1, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  1, 2, 4, 6, 9, 14, 20, 28, 37, 46,
  56, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63, 63,
];

// ── Shaders ──────────────────────────────────────────────────────

const SCENE_FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform sampler2D uBgTex;
uniform sampler2D uCoreTex;
uniform float uTime;
uniform float uBeat;
uniform float uWhiteFlash;
uniform float uCoreAlpha;
uniform vec2 uResolution;

uniform float uExplosionSpeed;
uniform float uCoreIntensity;
uniform float uSmokeDetail;
uniform float uShockwaveWidth;
uniform float uBeatReactivity;

uniform float uSmokeHue;
uniform float uSmokeWarmth;

uniform float uPlasmaIntensity;
uniform float uPlasmaSpeed;
uniform float uEmberIntensity;
uniform float uEmberHue;
uniform float uEmberSmSize;
uniform float uEmberSmDensity;
uniform float uEmberSmScatter;
uniform float uEmberSmSpeed;
uniform float uEmberLgSize;
uniform float uEmberLgDensity;
uniform float uEmberLgScatter;
uniform float uEmberLgSpeed;

uniform float uHorizonGlow;
uniform float uHorizonPulseSpeed;

uniform float uStarDensity;
uniform float uStarTwinkleSpeed;
uniform float uStarBrightness;

uniform vec2 uCenter;

#define PI  3.14159265359
#define TAU 6.28318530718

// ── Noise primitives ─────────────────────────────────────────────

vec2 hash22(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

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
  float z = p.z;
  float zi = floor(z);
  float zf = fract(z);
  zf = zf * zf * (3.0 - 2.0 * zf);
  float a = noise(p.xy + zi * 17.17);
  float b = noise(p.xy + (zi + 1.0) * 17.17);
  return mix(a, b, zf);
}

float fbm(vec2 p, int octaves) {
  float val = 0.0;
  float amp = 0.5;
  float freq = 1.0;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    val += amp * noise(p * freq);
    freq *= 2.1;
    amp *= 0.48;
  }
  return val;
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

// Voronoi distance for lava crack patterns
float voronoi(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float minDist = 1.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 point = hash22(i + neighbor);
      float d = length(neighbor + point - f);
      minDist = min(minDist, d);
    }
  }
  return minDist;
}

// Rodrigues rotation around the (1,1,1) gray axis in RGB space
vec3 hueShift(vec3 col, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  vec3 k = vec3(0.57735);
  return col * c + cross(k, col) * s + k * dot(k, col) * (1.0 - c);
}

// ── Core plasma (swirling FBM vortex) ────────────────────────────

float corePlasma(vec2 p, float t) {
  float s = uPlasmaSpeed;
  float r = length(p);

  // Vortex swirl: rotation increases toward center (molten churning)
  float swirl = t * s * 0.4 / (r + 0.4);
  float cs = cos(swirl), sn = sin(swirl);
  vec2 sp = vec2(p.x * cs - p.y * sn, p.x * sn + p.y * cs);

  // Multi-scale FBM noise — isotropic, no directional banding
  float n1 = fbm(sp * 2.5 + t * s * vec2(0.2, -0.15), 4);
  float n2 = fbm(sp * 5.0 - t * s * vec2(0.1, 0.2) + 37.0, 3);

  // Radial pulse — brighter at center, expanding outward
  float pulse = 0.5 + 0.5 * sin(r * 8.0 - t * s * 3.0);

  return n1 * 0.5 + n2 * 0.3 + pulse * 0.2;
}

// ── Lava core ────────────────────────────────────────────────────

vec4 lavaCore(vec2 uv, float t) {
  float aspect = uResolution.x / uResolution.y;
  vec2 delta = uv - uCenter;
  delta.x *= aspect;
  float dist = length(delta);

  float coreGrowth = smoothstep(0.0, 0.4, t);
  float coreRadius = 0.04 + coreGrowth * 0.06;
  float coreMask = smoothstep(coreRadius * 1.4, coreRadius * 0.2, dist);

  if (coreMask <= 0.0) return vec4(0.0);

  vec2 sphereUV = delta / max(coreRadius, 0.001);
  float r2 = dot(sphereUV, sphereUV);
  float sphereZ = sqrt(max(0.0, 1.0 - r2 * 0.5));

  // ── Plasma body ──
  float pVal = corePlasma(sphereUV, t);

  // ── Voronoi crack veins ──
  vec2 crackUV = sphereUV * 3.5 + t * vec2(0.12, -0.08);
  float cracks = voronoi(crackUV);
  float crackHeat = 1.0 - smoothstep(0.03, 0.2, cracks);

  float fineCracks = voronoi(crackUV * 2.5 + 7.0);
  float fineHeat = 1.0 - smoothstep(0.02, 0.15, fineCracks);

  // Plasma + cracks fused into a single heat map
  float heat = pVal * 0.5 + crackHeat * 0.35 + fineHeat * 0.15;
  heat = pow(heat, 0.85);

  // ── Fire color ramp: dark ember → deep red → orange → yellow → white-hot ──
  vec3 c1 = vec3(0.08, 0.02, 0.0);
  vec3 c2 = vec3(0.55, 0.08, 0.0);
  vec3 c3 = vec3(1.0, 0.4, 0.0);
  vec3 c4 = vec3(1.0, 0.75, 0.1);
  vec3 c5 = vec3(1.0, 0.97, 0.8);

  vec3 fireColor = c1;
  fireColor = mix(fireColor, c2, smoothstep(0.0, 0.25, heat));
  fireColor = mix(fireColor, c3, smoothstep(0.25, 0.5, heat));
  fireColor = mix(fireColor, c4, smoothstep(0.5, 0.75, heat));
  fireColor = mix(fireColor, c5, smoothstep(0.75, 1.0, heat));

  // Pulsing glow
  float pulse = sin(t * 3.5 + pVal * TAU) * 0.15 + 0.92;
  float deepPulse = sin(t * 1.5 + 2.5) * 0.1 + 0.9;
  fireColor *= pulse * deepPulse;

  fireColor *= mix(0.5, 1.0, sphereZ);

  // ── Tier 1: small orbital embers ──
  float emberBright = 0.0;
  for (int i = 0; i < 24; i++) {
    float fi = float(i);
    if (fi / 24.0 >= uEmberSmDensity) break;

    float tiltA = hash21(vec2(fi, 7.7)) * PI;
    float tiltB = hash21(vec2(fi, 11.3)) * PI;
    float orbitR = (0.35 + hash21(vec2(fi, 23.1)) * 0.55) * uEmberSmScatter;
    float spd = (0.3 + hash21(vec2(fi, 13.3)) * 0.7) * uEmberSmSpeed;
    float phase = hash21(vec2(fi, 17.9)) * TAU;

    float angle = phase + t * spd;
    vec3 lp = vec3(cos(angle) * orbitR, 0.0, sin(angle) * orbitR);

    float ca = cos(tiltA), sa = sin(tiltA);
    lp = vec3(lp.x, lp.y * ca - lp.z * sa, lp.y * sa + lp.z * ca);
    float cb = cos(tiltB), sb = sin(tiltB);
    lp = vec3(lp.x * cb - lp.y * sb, lp.x * sb + lp.y * cb, lp.z);

    vec2 ePos = lp.xy;
    float depth = lp.z;
    float behindFade = smoothstep(-0.15, 0.1, depth);

    float d = length(sphereUV - ePos);
    float eSz = (0.025 + hash21(vec2(fi, 37.7)) * 0.035) * uEmberSmSize;
    eSz *= 0.85 + 0.3 * (depth * 0.5 + 0.5);

    float flicker = sin(t * (4.0 + fi * 0.6) + fi * 3.1) * 0.3 + 0.7;
    emberBright += smoothstep(eSz, 0.0, d) * flicker * behindFade;
  }

  // ── Tier 2: large orbital sparks ──
  float sparkBright = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i) + 100.0;
    if (float(i) / 10.0 >= uEmberLgDensity) break;

    float tiltA = hash21(vec2(fi, 5.3)) * PI;
    float tiltB = hash21(vec2(fi, 9.1)) * PI;
    float orbitR = (0.2 + hash21(vec2(fi, 19.7)) * 0.5) * uEmberLgScatter;
    float spd = (0.2 + hash21(vec2(fi, 31.3)) * 0.5) * uEmberLgSpeed;
    float phase = hash21(vec2(fi, 41.1)) * TAU;

    float angle = phase + t * spd;
    vec3 lp = vec3(cos(angle) * orbitR, 0.0, sin(angle) * orbitR);

    float ca = cos(tiltA), sa = sin(tiltA);
    lp = vec3(lp.x, lp.y * ca - lp.z * sa, lp.y * sa + lp.z * ca);
    float cb = cos(tiltB), sb = sin(tiltB);
    lp = vec3(lp.x * cb - lp.y * sb, lp.x * sb + lp.y * cb, lp.z);

    vec2 ePos = lp.xy;
    float depth = lp.z;
    float behindFade = smoothstep(-0.15, 0.1, depth);

    float d = length(sphereUV - ePos);
    float eSz = (0.05 + hash21(vec2(fi, 53.3)) * 0.05) * uEmberLgSize;
    eSz *= 0.85 + 0.3 * (depth * 0.5 + 0.5);

    float flicker = sin(t * (2.5 + fi * 0.4) + fi * 1.7) * 0.25 + 0.75;
    sparkBright += smoothstep(eSz, 0.0, d) * flicker * behindFade * 1.3;
  }

  vec3 emberColor = hueShift(vec3(1.0, 0.7, 0.15), uEmberHue)
                  * (emberBright + sparkBright) * uEmberIntensity;

  // ── Halo glow ──
  float halo = smoothstep(coreRadius * 2.0, coreRadius * 0.7, dist);
  float haloOnly = halo * (1.0 - coreMask) * 0.6;
  vec3 haloColor = vec3(0.9, 0.3, 0.02) * haloOnly;

  vec3 finalColor = fireColor * uCoreIntensity * uPlasmaIntensity + emberColor + haloColor;
  float alpha = coreMask;

  float explosionT = max(0.0, t - 0.4) * uExplosionSpeed;
  float coreFade = smoothstep(5.0, 1.0, explosionT);
  alpha *= coreFade;

  return vec4(finalColor, alpha);
}

// ── Raymarched volumetric blast ───────────────────────────────────
//
// Proper volumetric rendering: rays march through a 3D density field,
// accumulating color and opacity via Beer-Lambert attenuation. The cloud
// shape emerges from 3D FBM noise — no geometric boundaries exist.
// Light marching toward the core provides self-shadowing.

const int VOL_STEPS = 12;
const int LIGHT_STEPS = 4;
const float ABSORPTION = 9.0;

float smokeDensity(vec3 pos, float explosionT) {
  float coreR = 0.1;
  float growT = explosionT * explosionT;

  // Horizontal reach: expands sideways first, eventually past viewport
  float reach = coreR + growT * 0.3;
  reach = min(reach, 2.5);

  float nt = explosionT * 0.4;

  float hDist = length(pos.xz) / max(reach, 0.01);

  // Minimal upward drift
  float yShifted = pos.y - explosionT * 0.01;
  float vDist = abs(yShifted);

  float radialFade = smoothstep(1.0, 0.1, hDist);

  // Constrained vertical: flat disc that very slowly gets taller
  float vertTight = 55.0 / (1.0 + growT * 0.12);
  float vertFade = exp(-vDist * vDist * vertTight);

  float shape = radialFade * vertFade;
  if (shape < 0.01) return 0.0;

  vec3 noisePos = pos * 4.0 + vec3(nt * 0.6, -nt * 0.2, nt * 0.4);
  float n = fbm3D(noisePos);

  float n2 = fbm3D(pos * 8.0 + vec3(-nt * 0.4, nt * 0.3, -nt * 0.7) + 50.0);

  float density = n * 0.6 + n2 * 0.4;
  density = smoothstep(0.25 - uSmokeDetail * 0.1, 0.6, density);

  return density * shape * smoothstep(0.0, 0.1, explosionT);
}

float lightMarch(vec3 pos, float explosionT) {
  vec3 lightDir = normalize(-pos);
  float stepSize = 0.08;
  float totalDensity = 0.0;

  for (int i = 0; i < LIGHT_STEPS; i++) {
    pos += lightDir * stepSize;
    totalDensity += smokeDensity(pos, explosionT) * stepSize;
  }

  // Beer-Lambert: how much light from the core survives to this point
  return exp(-totalDensity * ABSORPTION * 0.7);
}

vec3 blastWave(vec2 uv, float t) {
  float rawT = max(0.0, t - 0.35) * uExplosionSpeed;
  if (rawT <= 0.0) return vec3(0.0);

  float explosionT = pow(rawT, 0.45) * 1.8;

  float aspect = uResolution.x / uResolution.y;
  vec2 screenPos = (uv - uCenter) * vec2(aspect, 1.0);

  float growT = explosionT * explosionT;
  float cloudReach = 0.1 + growT * 0.3;
  float discDepth = min(cloudReach * 0.4, 0.6);
  float stepSize = (discDepth * 2.0) / float(VOL_STEPS);

  float transmittance = 1.0;
  vec3 accumulated = vec3(0.0);

  for (int i = 0; i < VOL_STEPS; i++) {
    float z = -discDepth + (float(i) + 0.5) * stepSize;
    vec3 pos = vec3(screenPos, z);

    float density = smokeDensity(pos, explosionT);

    if (density > 0.005) {
      float stepAbsorption = density * stepSize * ABSORPTION;
      float stepTrans = exp(-stepAbsorption);

      float lightAmount = lightMarch(pos, explosionT);
      float ambient = 0.2;
      float lighting = lightAmount * 1.5 + ambient;

      vec3 darkSmoke = hueShift(vec3(0.10, 0.09, 0.13), uSmokeHue);
      vec3 litSmoke = hueShift(vec3(0.55, 0.52, 0.60), uSmokeHue);
      vec3 smokeColor = mix(darkSmoke, litSmoke, lightAmount);

      float coreDist = length(pos);
      float warmth = exp(-coreDist * coreDist * 8.0);
      vec3 warmColor = hueShift(vec3(0.7, 0.4, 0.12), uSmokeHue);
      smokeColor = mix(smokeColor, warmColor, warmth * uSmokeWarmth);

      vec3 stepColor = smokeColor * lighting;

      accumulated += stepColor * (1.0 - stepTrans) * transmittance;
      transmittance *= stepTrans;

      if (transmittance < 0.01) break;
    }
  }

  // Quick white burst at explosion onset, concentrated at core
  float burstIntensity = exp(-explosionT * explosionT * 10.0);
  float burstDist = length(screenPos);
  float burstMask = smoothstep(0.12, 0.0, burstDist);
  accumulated += vec3(1.0, 0.95, 0.85) * burstIntensity * burstMask * 1.5;

  accumulated *= max(0.5, 1.0 - explosionT * 0.1);

  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  accumulated *= 1.0 + beatPulse * 0.15;

  return accumulated;
}

// ── Horizon glow ─────────────────────────────────────────────────

vec3 horizonGlow(vec2 uv, float t) {
  if (uHorizonGlow <= 0.0) return vec3(0.0);
  float yFlip = 1.0 - uv.y;

  float band = smoothstep(0.45, 0.62, yFlip) * smoothstep(0.85, 0.65, yFlip);

  float pulse = sin(t * uHorizonPulseSpeed) * 0.5 + 0.5;
  float beatMod = pow(1.0 - uBeat, 6.0) * 0.3;
  pulse = pulse * 0.7 + beatMod;

  vec3 glowColor = vec3(0.3, 0.05, 0.4);
  return glowColor * band * pulse * uHorizonGlow;
}

// ── Stars ────────────────────────────────────────────────────────

vec3 stars(vec2 uv, float t) {
  if (uStarDensity <= 0.0 || uStarBrightness <= 0.0) return vec3(0.0);

  float yFlip = 1.0 - uv.y;
  float skyMask = smoothstep(0.55, 0.35, yFlip);
  if (skyMask <= 0.0) return vec3(0.0);

  vec3 result = vec3(0.0);
  vec2 pixCoord = uv * uResolution;

  float cellSize = mix(40.0, 15.0, uStarDensity);
  vec2 cell = floor(pixCoord / cellSize);
  vec2 cellUV = fract(pixCoord / cellSize);

  float starPresence = hash21(cell * 127.1 + 311.7);
  float threshold = 1.0 - uStarDensity * 0.15;

  if (starPresence > threshold) {
    vec2 starPos = vec2(
      hash21(cell * 269.5 + 183.3),
      hash21(cell * 413.1 + 271.9)
    ) * 0.6 + 0.2;

    float dist = length(cellUV - starPos) * cellSize;
    float starRadius = 0.8 + hash21(cell * 731.1) * 0.7;
    float star = smoothstep(starRadius, 0.0, dist);

    float phase = hash21(cell * 997.3) * TAU;
    float speed = (0.5 + hash21(cell * 571.7) * 1.5) * uStarTwinkleSpeed;
    float twinkle = sin(t * speed + phase) * 0.4 + 0.6;

    float warmth = hash21(cell * 337.9);
    vec3 starColor = mix(vec3(0.8, 0.85, 1.0), vec3(1.0, 0.95, 0.8), warmth);

    result += starColor * star * twinkle * uStarBrightness * skyMask;
  }

  return result;
}

void main() {
  vec2 uv = vUV;
  vec2 bgUV = vec2(uv.x, 1.0 - uv.y);

  // Sample background (frame-00)
  vec3 bg = texture(uBgTex, bgUV).rgb;

  // Overlay core frame — only the broad ambient glow, bright sparks fully suppressed
  vec3 coreFrame = texture(uCoreTex, bgUV).rgb;
  vec3 frameDiff = max(coreFrame - bg, vec3(0.0));
  float diffLuma = dot(frameDiff, vec3(0.299, 0.587, 0.114));
  float frameMix = smoothstep(0.06, 0.2, diffLuma) * uCoreAlpha * 0.35;
  frameMix *= smoothstep(0.4, 0.15, diffLuma);
  bg = mix(bg, coreFrame, frameMix);

  // Phase 2: horizon glow
  bg += horizonGlow(uv, uTime);

  // Phase 3: twinkling stars (only on dark pixels)
  float bgLuma = dot(bg, vec3(0.299, 0.587, 0.114));
  vec3 starLight = stars(uv, uTime) * smoothstep(0.15, 0.02, bgLuma);
  bg += starLight;

  // Phase 1: lava core overlay
  vec4 lava = lavaCore(uv, uTime);
  vec3 color = mix(bg, bg * 0.3 + lava.rgb, lava.a);

  // Phase 1: volumetric blast
  vec3 blast = blastWave(uv, uTime);
  float blastLuma = dot(blast, vec3(0.299, 0.587, 0.114));
  float blastAlpha = smoothstep(0.0, 0.08, blastLuma);
  color = mix(color, blast + color * 0.15, blastAlpha);

  // White flash from PALETTE_FADE curve
  color = mix(color, vec3(1.0), uWhiteFlash);

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
void main() {
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 tight = texture(uBloomTight, vUV).rgb;
  vec3 wide  = texture(uBloomWide, vUV).rgb;
  float beatPulse = pow(1.0 - uBeat, 4.0) * uBeatReactivity;
  vec3 color = scene
    + tight * (uBloomStr + beatPulse * 0.25)
    + wide  * (uBloomStr * 0.5 + beatPulse * 0.15);
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

function deleteFBO(gl, fbo) {
  if (!fbo) return;
  gl.deleteFramebuffer(fbo.fb);
  if (fbo.tex) gl.deleteTexture(fbo.tex);
}

// ── Frame decoding ───────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function signed8(buf, i) {
  const v = buf[i];
  return v < 128 ? v : v - 256;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function decodeFrames(data, count) {
  const fb = new Uint8Array(W * H);
  const frames = [];
  let ptr = 0;

  for (let f = 0; f < count; f++) {
    while ((ptr & 0x0f) !== 0) ptr++;
    if (ptr >= data.length - 1) break;

    let p = 0;
    while (true) {
      const b = signed8(data, ptr++);
      if (b > 0) {
        const c = data[ptr++];
        for (let i = 0; i < b; i++) fb[p++] = c;
      } else if (b < 0) {
        p -= b;
      } else {
        break;
      }
    }
    frames.push(Uint8Array.from(fb));
  }
  return frames;
}

function frameToRGBA(indexedFrame) {
  const k = 255 / 63;
  const rgba = new Uint8Array(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    const ci = indexedFrame[i];
    rgba[i * 4]     = Math.round(PALETTE[ci * 3] * k);
    rgba[i * 4 + 1] = Math.round(PALETTE[ci * 3 + 1] * k);
    rgba[i * 4 + 2] = Math.round(PALETTE[ci * 3 + 2] * k);
    rgba[i * 4 + 3] = 255;
  }
  return rgba;
}

// ── Module state ─────────────────────────────────────────────────

let sceneProg, bloomExtractProg, blurProg, compositeProg;
let quad;
let bgTex, coreTex;
let coreFramesRGBA; // pre-baked RGBA for frames 0-6
let sceneFBO, bloomFBO1, bloomFBO2, bloomWideFBO1, bloomWideFBO2;
let fboW = 0, fboH = 0;
let prevCoreIdx = -1;

let su = {}, beu = {}, blu = {}, cu = {};

export default {
  label: 'pam (remastered)',

  params: [
    gp('Explosion', { key: 'centerX',          label: 'Center X',          type: 'float', min: 0,   max: 1,   step: 0.005, default: 0.5 }),
    gp('Explosion', { key: 'centerY',          label: 'Center Y',          type: 'float', min: 0,   max: 1,   step: 0.005, default: 0.565 }),
    gp('Explosion', { key: 'explosionSpeed',  label: 'Explosion Speed',   type: 'float', min: 0.3, max: 5,   step: 0.01, default: 1.26 }),
    gp('Explosion', { key: 'coreIntensity',   label: 'Core Intensity',    type: 'float', min: 0,   max: 4,   step: 0.01, default: 2.72 }),
    gp('Explosion', { key: 'smokeDetail',     label: 'Smoke Detail',      type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.73 }),
    gp('Explosion', { key: 'shockwaveWidth',  label: 'Shockwave Width',   type: 'float', min: 0.02,max: 0.5, step: 0.01, default: 0.26 }),
    gp('Explosion', { key: 'smokeHue',       label: 'Smoke Hue',         type: 'float', min: -3.14, max: 3.14, step: 0.01, default: -1.80 }),
    gp('Explosion', { key: 'smokeWarmth',    label: 'Smoke Warmth',      type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.48 }),
    gp('Core', { key: 'plasmaIntensity', label: 'Plasma Intensity', type: 'float', min: 0, max: 2,   step: 0.01, default: 1.0 }),
    gp('Core', { key: 'plasmaSpeed',     label: 'Plasma Speed',     type: 'float', min: 0, max: 5,   step: 0.1,  default: 1.5 }),
    gp('Core', { key: 'emberIntensity',  label: 'Ember Intensity',  type: 'float', min: 0, max: 3,   step: 0.01, default: 0.8 }),
    gp('Core', { key: 'emberHue',        label: 'Ember Hue',        type: 'float', min: -3.14, max: 3.14, step: 0.01, default: 0.0 }),
    gp('Embers (Small)', { key: 'emberSmSize',    label: 'Size',      type: 'float', min: 0.1, max: 3, step: 0.01, default: 1.0 }),
    gp('Embers (Small)', { key: 'emberSmDensity', label: 'Density',   type: 'float', min: 0,   max: 1, step: 0.01, default: 1.0 }),
    gp('Embers (Small)', { key: 'emberSmScatter', label: 'Scatter',   type: 'float', min: 0.1, max: 3, step: 0.01, default: 1.0 }),
    gp('Embers (Small)', { key: 'emberSmSpeed',   label: 'Orbit Speed',type: 'float', min: 0,  max: 3, step: 0.01, default: 1.0 }),
    gp('Embers (Large)', { key: 'emberLgSize',    label: 'Size',      type: 'float', min: 0.1, max: 3, step: 0.01, default: 1.0 }),
    gp('Embers (Large)', { key: 'emberLgDensity', label: 'Density',   type: 'float', min: 0,   max: 1, step: 0.01, default: 1.0 }),
    gp('Embers (Large)', { key: 'emberLgScatter', label: 'Scatter',   type: 'float', min: 0.1, max: 3, step: 0.01, default: 1.0 }),
    gp('Embers (Large)', { key: 'emberLgSpeed',   label: 'Orbit Speed',type: 'float', min: 0,  max: 3, step: 0.01, default: 1.0 }),
    gp('Atmosphere', { key: 'horizonGlow',      label: 'Horizon Glow',      type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.15 }),
    gp('Atmosphere', { key: 'horizonPulseSpeed',label: 'Horizon Pulse Speed',type: 'float', min: 0.2, max: 5,   step: 0.1,  default: 1.5 }),
    gp('Atmosphere', { key: 'starDensity',      label: 'Star Density',      type: 'float', min: 0,   max: 1,   step: 0.01, default: 0.0 }),
    gp('Atmosphere', { key: 'starTwinkleSpeed', label: 'Star Twinkle Speed',type: 'float', min: 0,   max: 5,   step: 0.1,  default: 2.0 }),
    gp('Atmosphere', { key: 'starBrightness',   label: 'Star Brightness',   type: 'float', min: 0,   max: 2,   step: 0.01, default: 0.8 }),
    gp('Post-Processing', { key: 'bloomThreshold', label: 'Bloom Threshold', type: 'float', min: 0, max: 1,   step: 0.01, default: 0.25 }),
    gp('Post-Processing', { key: 'bloomStrength',  label: 'Bloom Strength',  type: 'float', min: 0, max: 2,   step: 0.01, default: 0.45 }),
    gp('Post-Processing', { key: 'beatReactivity', label: 'Beat Reactivity', type: 'float', min: 0, max: 1,   step: 0.01, default: 0.3 }),
  ],

  init(gl) {
    sceneProg = createProgram(gl, FULLSCREEN_VERT, SCENE_FRAG);
    bloomExtractProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_EXTRACT_FRAG);
    blurProg = createProgram(gl, FULLSCREEN_VERT, BLUR_FRAG);
    compositeProg = createProgram(gl, FULLSCREEN_VERT, COMPOSITE_FRAG);

    quad = createFullscreenQuad(gl);

    // Bake frames 0-6 to RGBA
    const aniData = b64ToUint8(ANI_B64);
    const indexedFrames = decodeFrames(aniData, CORE_FRAMES);
    coreFramesRGBA = indexedFrames.map(frameToRGBA);

    // Background texture (frame 0, bilinear upscaled)
    bgTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, coreFramesRGBA[0]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Core frame texture (updated each render with the current core frame)
    coreTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, coreTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, coreFramesRGBA[0]);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    prevCoreIdx = 0;

    su = {
      bgTex:            gl.getUniformLocation(sceneProg, 'uBgTex'),
      coreTex:          gl.getUniformLocation(sceneProg, 'uCoreTex'),
      time:             gl.getUniformLocation(sceneProg, 'uTime'),
      beat:             gl.getUniformLocation(sceneProg, 'uBeat'),
      whiteFlash:       gl.getUniformLocation(sceneProg, 'uWhiteFlash'),
      coreAlpha:        gl.getUniformLocation(sceneProg, 'uCoreAlpha'),
      resolution:       gl.getUniformLocation(sceneProg, 'uResolution'),
      explosionSpeed:   gl.getUniformLocation(sceneProg, 'uExplosionSpeed'),
      coreIntensity:    gl.getUniformLocation(sceneProg, 'uCoreIntensity'),
      smokeDetail:      gl.getUniformLocation(sceneProg, 'uSmokeDetail'),
      shockwaveWidth:   gl.getUniformLocation(sceneProg, 'uShockwaveWidth'),
      smokeHue:         gl.getUniformLocation(sceneProg, 'uSmokeHue'),
      smokeWarmth:      gl.getUniformLocation(sceneProg, 'uSmokeWarmth'),
      plasmaIntensity:  gl.getUniformLocation(sceneProg, 'uPlasmaIntensity'),
      plasmaSpeed:      gl.getUniformLocation(sceneProg, 'uPlasmaSpeed'),
      emberIntensity:   gl.getUniformLocation(sceneProg, 'uEmberIntensity'),
      emberHue:         gl.getUniformLocation(sceneProg, 'uEmberHue'),
      emberSmSize:      gl.getUniformLocation(sceneProg, 'uEmberSmSize'),
      emberSmDensity:   gl.getUniformLocation(sceneProg, 'uEmberSmDensity'),
      emberSmScatter:   gl.getUniformLocation(sceneProg, 'uEmberSmScatter'),
      emberSmSpeed:     gl.getUniformLocation(sceneProg, 'uEmberSmSpeed'),
      emberLgSize:      gl.getUniformLocation(sceneProg, 'uEmberLgSize'),
      emberLgDensity:   gl.getUniformLocation(sceneProg, 'uEmberLgDensity'),
      emberLgScatter:   gl.getUniformLocation(sceneProg, 'uEmberLgScatter'),
      emberLgSpeed:     gl.getUniformLocation(sceneProg, 'uEmberLgSpeed'),
      beatReactivity:   gl.getUniformLocation(sceneProg, 'uBeatReactivity'),
      horizonGlow:      gl.getUniformLocation(sceneProg, 'uHorizonGlow'),
      horizonPulseSpeed:gl.getUniformLocation(sceneProg, 'uHorizonPulseSpeed'),
      starDensity:      gl.getUniformLocation(sceneProg, 'uStarDensity'),
      starTwinkleSpeed: gl.getUniformLocation(sceneProg, 'uStarTwinkleSpeed'),
      starBrightness:   gl.getUniformLocation(sceneProg, 'uStarBrightness'),
      center:           gl.getUniformLocation(sceneProg, 'uCenter'),
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

    cu = {
      scene:         gl.getUniformLocation(compositeProg, 'uScene'),
      bloomTight:    gl.getUniformLocation(compositeProg, 'uBloomTight'),
      bloomWide:     gl.getUniformLocation(compositeProg, 'uBloomWide'),
      bloomStr:      gl.getUniformLocation(compositeProg, 'uBloomStr'),
      beat:          gl.getUniformLocation(compositeProg, 'uBeat'),
      beatReactivity:gl.getUniformLocation(compositeProg, 'uBeatReactivity'),
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

    // White flash
    const animFrame = Math.floor(t * FRAME_RATE);
    const fadeIdx = clamp(animFrame, 0, PALETTE_FADE.length - 1);
    const whiteFlash = PALETTE_FADE[fadeIdx] / 63;

    // Update core frame texture (frames 0-6, then hold frame 6)
    const coreIdx = clamp(animFrame, 0, CORE_FRAMES - 1);
    if (coreIdx !== prevCoreIdx) {
      gl.bindTexture(gl.TEXTURE_2D, coreTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, coreFramesRGBA[coreIdx]);
      prevCoreIdx = coreIdx;
    }

    // Core alpha: fade in frames 1-6, then hold
    const coreAlpha = animFrame < 1 ? 0.0 : Math.min((animFrame - 1) / 3, 1.0);

    // ── Pass 1: Scene → sceneFBO ────────────────────────────────

    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneFBO.fb);
    gl.viewport(0, 0, sw, sh);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.useProgram(sceneProg);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, bgTex);
    gl.uniform1i(su.bgTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, coreTex);
    gl.uniform1i(su.coreTex, 1);
    gl.uniform1f(su.time, t);
    gl.uniform1f(su.beat, beat);
    gl.uniform1f(su.whiteFlash, whiteFlash);
    gl.uniform1f(su.coreAlpha, coreAlpha);
    gl.uniform2f(su.resolution, sw, sh);
    gl.uniform2f(su.center, p('centerX', 0.5), p('centerY', 0.565));
    gl.uniform1f(su.explosionSpeed, p('explosionSpeed', 1.26));
    gl.uniform1f(su.coreIntensity, p('coreIntensity', 2.72));
    gl.uniform1f(su.smokeDetail, p('smokeDetail', 0.73));
    gl.uniform1f(su.shockwaveWidth, p('shockwaveWidth', 0.26));
    gl.uniform1f(su.smokeHue, p('smokeHue', -1.80));
    gl.uniform1f(su.smokeWarmth, p('smokeWarmth', 0.48));
    gl.uniform1f(su.plasmaIntensity, p('plasmaIntensity', 1.0));
    gl.uniform1f(su.plasmaSpeed, p('plasmaSpeed', 1.5));
    gl.uniform1f(su.emberIntensity, p('emberIntensity', 0.8));
    gl.uniform1f(su.emberHue, p('emberHue', 0.0));
    gl.uniform1f(su.emberSmSize, p('emberSmSize', 1.0));
    gl.uniform1f(su.emberSmDensity, p('emberSmDensity', 1.0));
    gl.uniform1f(su.emberSmScatter, p('emberSmScatter', 1.0));
    gl.uniform1f(su.emberSmSpeed, p('emberSmSpeed', 1.0));
    gl.uniform1f(su.emberLgSize, p('emberLgSize', 1.0));
    gl.uniform1f(su.emberLgDensity, p('emberLgDensity', 1.0));
    gl.uniform1f(su.emberLgScatter, p('emberLgScatter', 1.0));
    gl.uniform1f(su.emberLgSpeed, p('emberLgSpeed', 1.0));
    gl.uniform1f(su.beatReactivity, p('beatReactivity', 0.3));
    gl.uniform1f(su.horizonGlow, p('horizonGlow', 0.15));
    gl.uniform1f(su.horizonPulseSpeed, p('horizonPulseSpeed', 1.5));
    gl.uniform1f(su.starDensity, p('starDensity', 0.0));
    gl.uniform1f(su.starTwinkleSpeed, p('starTwinkleSpeed', 2.0));
    gl.uniform1f(su.starBrightness, p('starBrightness', 0.8));
    quad.draw();

    // ── Pass 2: Bloom pipeline ───────────────────────────────────

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

    // ── Pass 3: Composite to screen ──────────────────────────────

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
    gl.uniform1f(cu.bloomStr, p('bloomStrength', 0.45));
    gl.uniform1f(cu.beat, beat);
    gl.uniform1f(cu.beatReactivity, p('beatReactivity', 0.3));
    quad.draw();
  },

  destroy(gl) {
    if (sceneProg) gl.deleteProgram(sceneProg);
    if (bloomExtractProg) gl.deleteProgram(bloomExtractProg);
    if (blurProg) gl.deleteProgram(blurProg);
    if (compositeProg) gl.deleteProgram(compositeProg);
    if (quad) quad.destroy();
    if (bgTex) gl.deleteTexture(bgTex);
    if (coreTex) gl.deleteTexture(coreTex);
    deleteFBO(gl, sceneFBO);
    deleteFBO(gl, bloomFBO1);
    deleteFBO(gl, bloomFBO2);
    deleteFBO(gl, bloomWideFBO1);
    deleteFBO(gl, bloomWideFBO2);
    sceneProg = bloomExtractProg = blurProg = compositeProg = null;
    quad = null;
    bgTex = coreTex = null;
    coreFramesRGBA = null;
    sceneFBO = bloomFBO1 = bloomFBO2 = bloomWideFBO1 = bloomWideFBO2 = null;
    fboW = fboH = 0;
    prevCoreIdx = -1;
  },
};
