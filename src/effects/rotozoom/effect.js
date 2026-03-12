/**
 * Rotozoom — Classic variant
 *
 * Rotating and zooming checker/tile pattern. UV rotation matrix applied
 * in fragment shader. Beat hits cause sharp zoom pulses.
 * Original source: PLZPART/ folder in SecondReality repo.
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
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;

  // Rotation angle
  float angle = uTime * 0.5;

  // Zoom with beat pulse
  float beatPulse = pow(1.0 - uBeat, 6.0);
  float zoom = 3.0 + sin(uTime * 0.3) * 1.5 + beatPulse * 2.0;

  // Rotation matrix
  float c = cos(angle);
  float s = sin(angle);
  vec2 rotUV = mat2(c, -s, s, c) * uv * zoom;

  // Tile pattern — concentric rings + checker
  float checker = step(0.5, fract(rotUV.x)) + step(0.5, fract(rotUV.y));
  checker = mod(checker, 2.0);

  float rings = sin(length(rotUV) * 6.0 - uTime * 2.0) * 0.5 + 0.5;

  float pattern = mix(checker, rings, 0.3 + 0.2 * sin(uTime * 0.7));

  vec3 color = palette(pattern + uTime * 0.1);
  color *= 0.4 + 0.6 * pattern;

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'rotozoom',

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
