/**
 * Bouncing Bitmap — Classic variant
 *
 * Bouncing logo/shape that stretches and squashes on impact.
 * A procedural "bitmap" (FC logo shape) bounces around the screen
 * with physics-like motion and deformation. Classic PICS section.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)) - r;
}

// Procedural "FC" logo shape
float logo(vec2 p) {
  // F shape
  float f1 = sdRoundedBox(p - vec2(-0.15, 0.0), vec2(0.02, 0.12), 0.005);
  float f2 = sdRoundedBox(p - vec2(-0.08, 0.1), vec2(0.09, 0.02), 0.005);
  float f3 = sdRoundedBox(p - vec2(-0.1, 0.0), vec2(0.07, 0.02), 0.005);
  float fShape = min(min(f1, f2), f3);

  // C shape (approximated as thick arc)
  float cOuter = length(p - vec2(0.1, 0.0)) - 0.12;
  float cInner = length(p - vec2(0.1, 0.0)) - 0.08;
  float cRing = max(cOuter, -cInner);
  float cCut = sdRoundedBox(p - vec2(0.18, 0.0), vec2(0.06, 0.06), 0.0);
  float cShape = max(cRing, -cCut);

  return min(fShape, cShape);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 centered = (uv - 0.5) * aspect;

  float beatPulse = pow(1.0 - uBeat, 4.0);

  // Bounce physics
  float period = 2.0;
  float bounceT = mod(uTime, period) / period;
  float bounceY = abs(sin(bounceT * 3.14159)) * 0.3;
  float bounceX = sin(uTime * 0.7) * 0.3;

  // Squash & stretch at bottom of bounce
  float squash = 1.0 - (1.0 - abs(sin(bounceT * 3.14159))) * 0.3;
  float stretch = 1.0 / squash;

  vec2 logoPos = centered - vec2(bounceX, bounceY - 0.15);
  logoPos.x *= squash;
  logoPos.y *= stretch;

  // Scale up the logo
  logoPos *= 2.5;

  float d = logo(logoPos);

  // Logo color with gradient
  vec3 logoColor = mix(
    vec3(1.0, 0.3, 0.1),
    vec3(1.0, 0.8, 0.0),
    logoPos.y * 2.0 + 0.5
  );
  logoColor += vec3(0.3) * beatPulse;

  // Shadow
  vec2 shadowPos = logoPos + vec2(0.02, -0.03);
  float shadowD = logo(shadowPos);
  float shadow = smoothstep(0.02, -0.01, shadowD) * 0.3;

  // Background: tiled checker
  vec2 bgUV = centered * 8.0;
  float checker = mod(floor(bgUV.x) + floor(bgUV.y), 2.0);
  vec3 bgColor = mix(vec3(0.05, 0.05, 0.15), vec3(0.08, 0.08, 0.2), checker);

  // Compose
  vec3 color = bgColor;
  color *= 1.0 - shadow;
  float logoMask = smoothstep(0.01, -0.01, d);
  color = mix(color, logoColor, logoMask);

  // Border glow on logo
  float glow = exp(-abs(d) * 60.0) * 0.5;
  color += logoColor * glow;

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'bouncingBitmap',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uTime = gl.getUniformLocation(program, 'uTime');
    uBeat = gl.getUniformLocation(program, 'uBeat');
    uResolution = gl.getUniformLocation(program, 'uResolution');
  },

  render(gl, t, beat, _params) {
    gl.useProgram(program);
    gl.uniform1f(uTime, t);
    gl.uniform1f(uBeat, beat);
    gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    program = null;
    quad = null;
  },
};
