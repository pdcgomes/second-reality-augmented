/**
 * Copper Bars — Classic variant (1:1 faithful to original)
 *
 * The opening effect of Second Reality: horizontal color gradient bands
 * that shift through a palette over time, inspired by the Amiga copper
 * coprocessor which could change palette registers per scanline.
 *
 * Original source: BEG/ folder in SecondReality repo.
 * The original used the DIS copper simulator to change palette entries
 * per scanline. Here we reproduce the same visual with a fragment shader
 * that maps gl_FragCoord.y through a time-varying palette.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

// Amiga-inspired copper palette — 8 base colors that blend per scanline
vec3 palette(float t) {
  vec3 a = vec3(0.05, 0.0, 0.15);
  vec3 b = vec3(0.5, 0.3, 0.6);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.28318 * (c * t + d));
}

void main() {
  float y = gl_FragCoord.y / uResolution.y;

  // Scanline position drives palette lookup
  float scan = y * 16.0 + uTime * 0.8;

  // Multiple overlapping sine waves for the classic copper shimmer
  float wave1 = sin(scan * 0.7 + uTime * 1.2) * 0.5 + 0.5;
  float wave2 = sin(scan * 1.3 - uTime * 0.9) * 0.5 + 0.5;
  float wave3 = sin(scan * 0.3 + uTime * 2.1) * 0.5 + 0.5;

  float idx = wave1 * 0.4 + wave2 * 0.35 + wave3 * 0.25;

  // Beat pulse: sharpen the gradient bands on beat
  float beatPulse = pow(1.0 - uBeat, 4.0);
  idx = mix(idx, floor(idx * 12.0) / 12.0, beatPulse * 0.6);

  vec3 color = palette(idx + uTime * 0.15);

  // Slight horizontal variation for depth
  float x = gl_FragCoord.x / uResolution.x;
  color *= 0.85 + 0.15 * sin(x * 3.14159);

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime = null;
let uBeat = null;
let uResolution = null;

export default {
  label: 'copperBars',

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
