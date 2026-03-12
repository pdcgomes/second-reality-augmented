/**
 * Grid — Classic variant
 *
 * Morphing/deforming grid rendered in the fragment shader.
 * A perspective grid floor with sine wave deformation,
 * typical of early 90s demo intros.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;
  float beatPulse = pow(1.0 - uBeat, 6.0);

  // Perspective projection of grid plane
  float horizon = 0.1;
  float depth = 1.0 / max(uv.y - horizon, 0.005);
  float x = uv.x * depth;
  float z = depth;

  // Deformation
  float deformX = sin(z * 0.3 + uTime * 1.5) * 0.5 * (1.0 + beatPulse);
  float deformZ = sin(x * 0.5 + uTime) * 0.3;
  x += deformX;
  z += deformZ;

  // Grid lines
  float gridX = abs(fract(x * 0.5) - 0.5) * 2.0;
  float gridZ = abs(fract(z * 0.1) - 0.5) * 2.0;

  float lineWidth = 0.06 / (1.0 + depth * 0.02);
  float lineX = smoothstep(lineWidth, 0.0, gridX);
  float lineZ = smoothstep(lineWidth, 0.0, gridZ);
  float grid = max(lineX, lineZ);

  // Color: neon cyan grid on dark background
  vec3 gridColor = vec3(0.0, 0.8, 1.0) * grid;
  gridColor *= exp(-depth * 0.04);

  // Horizon glow
  float horizonGlow = exp(-abs(uv.y - horizon) * 20.0);
  gridColor += vec3(1.0, 0.3, 0.5) * horizonGlow * 0.3;

  // Only render below horizon
  if (uv.y <= horizon) {
    // Sky: simple gradient
    float skyGrad = (horizon - uv.y) * 3.0;
    gridColor = mix(vec3(0.05, 0.0, 0.1), vec3(0.1, 0.0, 0.3), skyGrad);
    // Stars
    vec2 starUV = uv * 30.0;
    float star = step(0.98, fract(sin(dot(floor(starUV), vec2(127.1, 311.7))) * 43758.5453));
    gridColor += vec3(0.5, 0.5, 0.7) * star;
  }

  // Scanlines
  float scan = 0.9 + 0.1 * sin(gl_FragCoord.y * 3.14159);
  gridColor *= scan;

  fragColor = vec4(gridColor, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'grid',

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
