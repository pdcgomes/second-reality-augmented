/**
 * Vector Balls — Classic variant
 *
 * Array of shiny spheres arranged in Lissajous / spherical formations,
 * rendered via raymarching. Classic Amiga demoscene technique.
 * Original source: JUDI/ folder in SecondReality repo.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float scene(vec3 p) {
  float d = 1e10;
  float beatScale = 1.0 + pow(1.0 - uBeat, 4.0) * 0.3;

  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    float phase = fi * 0.3927; // golden angle-ish
    float t = uTime * 0.8;

    // Lissajous formation
    vec3 center = vec3(
      sin(t + phase) * 1.2,
      cos(t * 0.7 + phase * 1.3) * 0.9,
      sin(t * 0.5 + phase * 0.7) * 1.0
    ) * beatScale;

    float sphere = sdSphere(p - center, 0.12 + 0.02 * sin(t + fi));
    d = min(d, sphere);
  }

  return d;
}

vec3 getNormal(vec3 p) {
  vec2 e = vec2(0.001, 0.0);
  return normalize(vec3(
    scene(p + e.xyy) - scene(p - e.xyy),
    scene(p + e.yxy) - scene(p - e.yxy),
    scene(p + e.yyx) - scene(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;

  vec3 ro = vec3(0.0, 0.0, 4.0);
  vec3 rd = normalize(vec3(uv, -1.5));

  // Camera orbit
  ro.xz *= rot(uTime * 0.2);
  rd.xz *= rot(uTime * 0.2);

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 64; i++) {
    vec3 p = ro + rd * t;
    float d = scene(p);
    if (d < 0.002) { hit = 1.0; break; }
    if (t > 15.0) break;
    t += d;
  }

  vec3 color = vec3(0.02, 0.01, 0.05);

  if (hit > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = getNormal(p);
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.3));

    // Chrome/metallic look
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 32.0);
    float fresnel = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

    vec3 sphereColor = mix(
      vec3(0.6, 0.2, 0.8),
      vec3(0.2, 0.7, 1.0),
      fresnel
    );

    color = sphereColor * (0.15 + 0.5 * diff) + vec3(1.0) * spec * 0.8;
    color += sphereColor * fresnel * 0.3;
    color *= exp(-t * 0.08);
  }

  // Background gradient
  color += vec3(0.03, 0.0, 0.06) * (1.0 - uv.y * 0.5);

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'vectorBalls',

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
