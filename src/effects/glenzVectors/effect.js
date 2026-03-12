/**
 * Glenz Vectors — Classic variant
 *
 * Transparent/glassy 3D objects with additive blending.
 * Classic Amiga demo technique where overlapping faces create
 * a stained-glass / X-ray look. Raymarched with translucency.
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

float sdBox(vec3 p, vec3 b) {
  vec3 d = abs(p) - b;
  return min(max(d.x, max(d.y, d.z)), 0.0) + length(max(d, 0.0));
}

float sdOctahedron(vec3 p, float s) {
  p = abs(p);
  return (p.x + p.y + p.z - s) * 0.57735;
}

float scene(vec3 p) {
  p.xz *= rot(uTime * 0.6);
  p.yz *= rot(uTime * 0.4);

  float beatPulse = pow(1.0 - uBeat, 4.0);

  // Two interpenetrating shapes
  float box = sdBox(p, vec3(0.6 + beatPulse * 0.1));
  float oct = sdOctahedron(p, 1.0 + beatPulse * 0.15);

  return min(box, oct);
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

  vec3 ro = vec3(0.0, 0.0, 3.0);
  vec3 rd = normalize(vec3(uv, -1.5));

  // Accumulate color through transparent surfaces (glenz effect)
  vec3 color = vec3(0.0);
  float alpha = 1.0;
  float t = 0.0;

  for (int pass = 0; pass < 4; pass++) {
    // March to next surface
    bool found = false;
    for (int i = 0; i < 60; i++) {
      vec3 p = ro + rd * t;
      float d = scene(p);
      if (d < 0.002) {
        found = true;
        break;
      }
      if (t > 10.0) break;
      t += d;
    }

    if (!found || t > 10.0) break;

    vec3 p = ro + rd * t;
    vec3 n = getNormal(p);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 0.5));

    float diff = abs(dot(n, lightDir));
    float fresnel = pow(1.0 - abs(dot(n, -rd)), 2.0);

    // Each surface gets a different tinted color
    float hue = float(pass) * 0.25 + uTime * 0.1;
    vec3 surfColor = 0.5 + 0.5 * cos(6.28318 * (hue + vec3(0.0, 0.33, 0.67)));
    surfColor *= 0.3 + 0.4 * diff + 0.3 * fresnel;

    // Additive blending — the glenz look
    color += surfColor * alpha * 0.4;
    alpha *= 0.6;

    // Step through the surface
    t += 0.05;
  }

  // Background
  color += vec3(0.02, 0.01, 0.04) * alpha;

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'glenzVectors',

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
