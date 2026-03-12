/**
 * Dots — Classic variant
 *
 * Particle dot formations moving in 3D sine wave patterns.
 * Rendered as a raymarched field of small spheres for the
 * classic "dot morphing" demoscene look.
 * Original source: DDSTARS/ folder in SecondReality repo.
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

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;
  float beatPulse = pow(1.0 - uBeat, 4.0);

  vec3 color = vec3(0.0);

  // Simulate a grid of dots projected from 3D
  float gridSize = 12.0;
  for (float gy = 0.0; gy < gridSize; gy++) {
    for (float gx = 0.0; gx < gridSize; gx++) {
      // 3D position on a sine-deformed grid
      float nx = (gx / gridSize - 0.5) * 2.0;
      float ny = (gy / gridSize - 0.5) * 2.0;

      float t = uTime * 0.6;
      float z = sin(nx * 3.0 + t) * cos(ny * 3.0 + t * 0.7) * 0.5;
      z += sin(length(vec2(nx, ny)) * 4.0 - t * 1.5) * 0.3;
      z *= 1.0 + beatPulse * 0.5;

      // Perspective project
      float depth = 3.0 - z;
      vec2 projected = vec2(nx, ny) / depth;

      // Dot rendering
      float d = length(uv - projected);
      float radius = 0.015 / depth;
      float dot = smoothstep(radius, radius * 0.3, d);

      // Depth-based color
      float depthFactor = clamp(1.0 - z * 0.5, 0.0, 1.0);
      vec3 dotColor = mix(vec3(0.2, 0.4, 1.0), vec3(1.0, 0.6, 0.2), depthFactor);

      color += dotColor * dot * (0.5 + 0.5 * depthFactor);
    }
  }

  // Clamp to avoid over-saturation
  color = min(color, vec3(1.0));

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'dots',

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
