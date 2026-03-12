/**
 * Wireframe 3D — Classic variant
 *
 * Rotating wireframe objects rendered via raymarched distance fields
 * with edge detection for the wireframe look. Cycles between cube
 * and torus shapes. Gouraud-style shading on edges.
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

float sdTorus(vec3 p, vec2 t) {
  vec2 q = vec2(length(p.xz) - t.x, p.y);
  return length(q) - t.y;
}

// Wireframe: take abs distance to surface, subtract thin shell
float wireBox(vec3 p, vec3 b, float thickness) {
  float d = sdBox(p, b);
  // Edge detection: if near any face intersection, render the wire
  vec3 q = abs(p) - b;
  float edgeX = max(q.y, q.z);
  float edgeY = max(q.x, q.z);
  float edgeZ = max(q.x, q.y);
  float edges = min(min(
    abs(edgeX),
    abs(edgeY)),
    abs(edgeZ));
  return max(abs(d) - thickness * 0.5, edges - thickness);
}

float wireTorus(vec3 p, vec2 t, float thickness) {
  float d = sdTorus(p, t);
  float angle = atan(p.z, p.x);
  float ringAngle = atan(p.y, length(p.xz) - t.x);

  float meridians = abs(fract(angle * 8.0 / 6.28318) - 0.5) * 2.0;
  float parallels = abs(fract(ringAngle * 6.0 / 6.28318) - 0.5) * 2.0;
  float wires = min(meridians, parallels);

  return max(abs(d) - thickness * 0.3, wires * 0.15 - thickness);
}

float scene(vec3 p) {
  p.xz *= rot(uTime * 0.7);
  p.yz *= rot(uTime * 0.5);

  float morph = sin(uTime * 0.3) * 0.5 + 0.5;
  float beatPulse = pow(1.0 - uBeat, 6.0);
  float thickness = 0.015 + beatPulse * 0.01;

  float box = wireBox(p, vec3(0.8), thickness);
  float torus = wireTorus(p, vec2(0.9, 0.35), thickness);

  return mix(box, torus, morph);
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

  float t = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 80; i++) {
    vec3 p = ro + rd * t;
    float d = scene(p);
    if (d < 0.001) { hit = 1.0; break; }
    if (t > 10.0) break;
    t += d;
  }

  vec3 color = vec3(0.0);

  if (hit > 0.0) {
    vec3 p = ro + rd * t;
    vec3 n = getNormal(p);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(n, lightDir), 0.0);
    float spec = pow(max(dot(reflect(-lightDir, n), -rd), 0.0), 16.0);

    // Green phosphor CRT look
    vec3 wireColor = vec3(0.2, 1.0, 0.3);
    color = wireColor * (0.2 + 0.6 * diff + 0.4 * spec);

    // Distance fade
    color *= exp(-t * 0.15);
  }

  // Scanline overlay for retro feel
  float scanline = 0.92 + 0.08 * sin(gl_FragCoord.y * 3.14159);
  color *= scanline;

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'wireframe3d',

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
