/**
 * Starfield — Classic variant
 *
 * Two-layer parallax starfield with depth-based brightness.
 * Stars warp toward the viewer on beat hits.
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

  float beatPulse = pow(1.0 - uBeat, 8.0);
  float warpSpeed = 1.0 + beatPulse * 3.0;

  vec3 color = vec3(0.0);

  // Two star layers at different depths
  for (int layer = 0; layer < 2; layer++) {
    float depth = float(layer) * 0.5 + 0.5;
    float speed = (0.3 + depth * 0.7) * warpSpeed;
    float starSize = 0.8 + depth * 0.4;

    vec2 st = uv * (20.0 + float(layer) * 15.0);
    st.y += uTime * speed;

    vec2 cell = floor(st);
    vec2 frac_ = fract(st) - 0.5;

    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        vec2 neighbor = vec2(float(dx), float(dy));
        vec2 id = cell + neighbor;
        float h = hash(id);
        if (h > 0.92) {
          vec2 starPos = neighbor + vec2(hash(id + 1.0), hash(id + 2.0)) - 0.5 - frac_;
          float d = length(starPos);
          float brightness = smoothstep(0.05 * starSize, 0.0, d);

          // Twinkle
          brightness *= 0.6 + 0.4 * sin(uTime * 3.0 + h * 40.0);

          // Depth-based color: far stars are blue, near are white
          vec3 starColor = mix(vec3(0.5, 0.6, 1.0), vec3(1.0), depth);
          color += starColor * brightness;
        }
      }
    }
  }

  // Subtle blue fog at edges
  float vignette = 1.0 - length(uv) * 0.5;
  color *= vignette;

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'starfield',

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
