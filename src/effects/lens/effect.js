/**
 * Lens — Classic variant
 *
 * Magnification/distortion lens effect applied over a procedural
 * background pattern. The lens follows a Lissajous path across
 * the screen. Classic Amiga distortion effect.
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
  return 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.33, 0.67)));
}

float pattern(vec2 p) {
  float v = sin(p.x * 10.0) * sin(p.y * 10.0);
  v += sin(length(p) * 8.0 - uTime * 2.0) * 0.5;
  v += sin((p.x + p.y) * 6.0 + uTime) * 0.3;
  return v * 0.5 + 0.5;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 centered = (gl_FragCoord.xy - uResolution * 0.5) / uResolution.y;

  // Lens center follows Lissajous path
  float beatPulse = pow(1.0 - uBeat, 6.0);
  vec2 lensCenter = vec2(
    sin(uTime * 0.7) * 0.35,
    cos(uTime * 0.5) * 0.25
  );

  float lensRadius = 0.22 + beatPulse * 0.05;
  float magnification = 2.5 + beatPulse * 0.5;

  // Distance from lens center
  vec2 delta = centered - lensCenter;
  float dist = length(delta);

  // Apply lens distortion
  vec2 sampleUV = centered;
  float lensEdge = 0.0;

  if (dist < lensRadius) {
    // Barrel distortion inside lens
    float normalizedDist = dist / lensRadius;
    float distortion = 1.0 - pow(normalizedDist, 2.0);
    sampleUV = lensCenter + delta / magnification * (1.0 + distortion * (magnification - 1.0));

    // Lens edge highlight
    lensEdge = smoothstep(lensRadius, lensRadius * 0.85, dist);
  }

  // Background pattern
  float p = pattern(sampleUV * 2.0);
  vec3 color = palette(p + uTime * 0.1);

  // Lens border glow
  float ring = abs(dist - lensRadius);
  float borderGlow = smoothstep(0.02, 0.0, ring) * 0.5;
  color += vec3(0.4, 0.7, 1.0) * borderGlow;

  // Slight brightness boost inside lens
  if (dist < lensRadius) {
    color *= 1.0 + lensEdge * 0.3;
  }

  // Chromatic aberration at lens edge
  if (dist < lensRadius && dist > lensRadius * 0.8) {
    float ca = (dist - lensRadius * 0.8) / (lensRadius * 0.2);
    color.r *= 1.0 + ca * 0.2;
    color.b *= 1.0 - ca * 0.1;
  }

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'lens',

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
