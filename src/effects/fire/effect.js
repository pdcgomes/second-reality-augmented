/**
 * Fire — Classic variant
 *
 * Classic demoscene fire effect using a feedback loop. Since we can't
 * do ping-pong framebuffers in a single-pass effect, we simulate the
 * fire propagation using layered procedural noise with upward motion.
 * Original source: TECHNO/ folder in SecondReality repo.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

vec3 fireColor(float t) {
  // Black -> red -> orange -> yellow -> white
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.5, 0.0, 0.0), smoothstep(0.0, 0.2, t));
  c = mix(c, vec3(1.0, 0.3, 0.0), smoothstep(0.2, 0.45, t));
  c = mix(c, vec3(1.0, 0.7, 0.0), smoothstep(0.45, 0.65, t));
  c = mix(c, vec3(1.0, 1.0, 0.6), smoothstep(0.65, 0.85, t));
  c = mix(c, vec3(1.0, 1.0, 1.0), smoothstep(0.85, 1.0, t));
  return c;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Fire rises from the bottom
  float y = 1.0 - uv.y;

  // Turbulent noise moving upward
  float beatHeat = pow(1.0 - uBeat, 4.0) * 0.3;
  vec2 noiseUV = vec2(uv.x * 4.0, y * 3.0 - uTime * 1.5);
  float n = fbm(noiseUV);
  n += fbm(noiseUV * 2.0 + vec2(uTime * 0.3, 0.0)) * 0.5;

  // Heat intensity: strongest at bottom, fading upward
  float heat = n * pow(y, 0.6) * (1.3 + beatHeat);
  heat = clamp(heat, 0.0, 1.0);

  // Narrower flame shape toward the top
  float centerDist = abs(uv.x - 0.5) * 2.0;
  float shape = smoothstep(1.0, 0.2, centerDist + (1.0 - y) * 0.5);
  heat *= shape;

  vec3 color = fireColor(heat);

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'fire',

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
