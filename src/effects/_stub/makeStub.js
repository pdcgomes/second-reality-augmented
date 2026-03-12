/**
 * Stub effect factory — creates a placeholder effect that renders
 * the part name and description on a dark background.
 * Used for unimplemented demo parts.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uTime;
uniform vec2 uResolution;
uniform float uCharCount;
uniform float uLabelHash;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Dark animated background with subtle movement
  float n = hash(floor(uv * 40.0) + floor(uTime * 0.5));
  vec3 bg = vec3(0.03 + n * 0.02);

  // Pulsing border
  float border = step(uv.x, 0.01) + step(1.0 - uv.x, 0.01)
               + step(uv.y, 0.01) + step(1.0 - uv.y, 0.01);
  float pulse = 0.3 + 0.15 * sin(uTime * 2.0);
  vec3 borderColor = vec3(pulse * 0.4, pulse * 0.6, pulse);

  // Center crosshair
  float cx = smoothstep(0.003, 0.0, abs(uv.x - 0.5));
  float cy = smoothstep(0.003, 0.0, abs(uv.y - 0.5));
  float cross = max(cx * step(abs(uv.y - 0.5), 0.03), cy * step(abs(uv.x - 0.5), 0.05));

  // Simple bar at center showing label width
  float barW = uCharCount * 0.025;
  float barH = 0.04;
  float bar = step(abs(uv.x - 0.5), barW * 0.5) * step(abs(uv.y - 0.48), barH * 0.5);

  // Unique tint per effect based on label hash
  vec3 tint = 0.5 + 0.5 * cos(6.28318 * (uLabelHash + vec3(0.0, 0.33, 0.67)));

  vec3 color = bg;
  color = mix(color, borderColor, min(border, 1.0));
  color += vec3(0.1, 0.15, 0.2) * cross;
  color = mix(color, tint * 0.3, bar * 0.6);

  fragColor = vec4(color, 1.0);
}
`;

export function makeStub(label, description) {
  let program = null;
  let quad = null;
  let uTime, uResolution, uCharCount, uLabelHash;

  let labelHashValue = 0;
  for (let i = 0; i < label.length; i++) {
    labelHashValue += label.charCodeAt(i) * (i + 1);
  }
  labelHashValue = (labelHashValue % 1000) / 1000;

  return {
    label,
    description,
    stub: true,

    init(gl) {
      program = createProgram(gl, FULLSCREEN_VERT, FRAG);
      quad = createFullscreenQuad(gl);
      uTime = gl.getUniformLocation(program, 'uTime');
      uResolution = gl.getUniformLocation(program, 'uResolution');
      uCharCount = gl.getUniformLocation(program, 'uCharCount');
      uLabelHash = gl.getUniformLocation(program, 'uLabelHash');
    },

    render(gl, t, _beat, _params) {
      gl.useProgram(program);
      gl.uniform1f(uTime, t);
      gl.uniform2f(uResolution, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.uniform1f(uCharCount, label.length);
      gl.uniform1f(uLabelHash, labelHashValue);
      quad.draw();
    },

    destroy(gl) {
      if (program) gl.deleteProgram(program);
      if (quad) quad.destroy();
      program = null;
      quad = null;
    },
  };
}
