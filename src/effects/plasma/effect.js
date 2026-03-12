/**
 * Plasma — Classic variant
 *
 * Classic demoscene plasma: sum of sine functions mapped through a
 * rotating color palette. Palette snaps to new hue on bar boundaries.
 * Original source: PAM/ folder in SecondReality repo.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

vec3 palette(float t, float shift) {
  vec3 a = vec3(0.5);
  vec3 b = vec3(0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(shift, shift + 0.33, shift + 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 p = uv * 8.0;
  float t = uTime * 0.8;

  // Classic plasma: sum of sines
  float v = sin(p.x + t);
  v += sin(p.y + t * 0.7);
  v += sin((p.x + p.y) * 0.7 + t * 1.3);
  v += sin(length(p - vec2(4.0)) + t * 0.5);

  // Normalize to 0-1
  v = v * 0.25 + 0.5;

  // Palette rotation — shifts on beat
  float paletteShift = uTime * 0.1 + floor(uBeat * 4.0) * 0.125;

  vec3 color = palette(v, paletteShift);

  // Beat pulse: boost contrast
  float beatPulse = pow(1.0 - uBeat, 6.0);
  color = mix(color, color * color * 2.0, beatPulse * 0.5);

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'plasma',

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
