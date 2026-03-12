/**
 * Tunnel — Classic variant
 *
 * Classic tunnel/vortex effect: atan2 for angle, 1/length for depth,
 * mapped to a procedural texture that scrolls with time.
 * Original source: PANIC/ folder in SecondReality repo.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 0.7, 0.4);
  vec3 d = vec3(0.0, 0.15, 0.2);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;

  // Slight wobble on beat
  float beatPulse = pow(1.0 - uBeat, 6.0);
  uv.x += sin(uTime * 1.5) * 0.05 * (1.0 + beatPulse);
  uv.y += cos(uTime * 1.2) * 0.05 * (1.0 + beatPulse);

  // Tunnel coordinates
  float angle = atan(uv.y, uv.x) / 6.28318 + 0.5;
  float depth = 1.0 / (length(uv) + 0.001);

  // Scrolling texture coordinates
  float texU = angle + uTime * 0.1;
  float texV = depth * 0.5 - uTime * 0.8;

  // Procedural tunnel texture: checker + rings
  float rings = sin(texV * 20.0) * 0.5 + 0.5;
  float checker = step(0.5, fract(texU * 8.0)) + step(0.5, fract(texV * 4.0));
  checker = mod(checker, 2.0);

  float pattern = mix(rings, checker, 0.5);

  // Color from depth
  vec3 color = palette(pattern * 0.5 + depth * 0.02 + uTime * 0.05);

  // Distance fog
  float fog = exp(-length(uv) * 0.3);
  color *= 0.3 + 0.7 * (1.0 - fog);

  // Depth shading — darker far away (center), brighter near (edges)
  float shade = clamp(depth * 0.15, 0.0, 1.0);
  color *= shade;

  // Bright center glow
  float glow = exp(-length(uv) * 8.0);
  color += vec3(0.4, 0.6, 1.0) * glow * 0.3;

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'tunnel',

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
