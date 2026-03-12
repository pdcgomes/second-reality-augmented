/**
 * Scrolltext — Classic variant
 *
 * Horizontally scrolling text with per-column sine wave vertical displacement.
 * A demoscene staple. The text is rendered procedurally as a bitmap font.
 * Original source: START/ folder in SecondReality repo.
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';

const FRAG = `#version 300 es
precision highp float;

in vec2 vUV;
out vec4 fragColor;

uniform float uTime;
uniform float uBeat;
uniform vec2 uResolution;

// Minimal 4x5 bitmap font for uppercase + digits
float char(int c, vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return 0.0;
  int x = int(p.x * 4.0);
  int y = 4 - int(p.y * 5.0);

  // Encode a few recognizable characters as 4x5 bitmaps
  int bits = 0;
  if (c == 83) bits = 0x69961; // S
  else if (c == 69) bits = 0xF99F9; // E (approx)
  else if (c == 67) bits = 0x69996; // C
  else if (c == 79) bits = 0x69996; // O
  else if (c == 78) bits = 0x9DDBB; // N
  else if (c == 68) bits = 0xE9996; // D (approx)
  else if (c == 82) bits = 0xE9E99; // R
  else if (c == 65) bits = 0x69F99; // A
  else if (c == 76) bits = 0x9999F; // L
  else if (c == 73) bits = 0xE444E; // I
  else if (c == 84) bits = 0xF4444; // T
  else if (c == 89) bits = 0x99644; // Y
  else if (c == 70) bits = 0xF9E88; // F
  else if (c == 85) bits = 0x99996; // U
  else if (c == 87) bits = 0x9999F; // W (approx)
  else if (c == 32) bits = 0x00000; // space
  else bits = 0xFFFFF; // fallback filled block

  int idx = y * 4 + x;
  return float((bits >> idx) & 1);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  // Scroll speed and sine wave parameters
  float scrollSpeed = 40.0;
  float waveAmp = 0.08 + 0.04 * pow(1.0 - uBeat, 4.0);
  float waveFreq = 4.0;
  float waveSpeed = 3.0;

  // The scrolling message
  int msg[30];
  msg[0]=83;msg[1]=69;msg[2]=67;msg[3]=79;msg[4]=78;msg[5]=68;
  msg[6]=32;msg[7]=82;msg[8]=69;msg[9]=65;msg[10]=76;msg[11]=73;
  msg[12]=84;msg[13]=89;msg[14]=32;msg[15]=32;msg[16]=70;msg[17]=85;
  msg[18]=84;msg[19]=85;msg[20]=82;msg[21]=69;msg[22]=32;msg[23]=67;
  msg[24]=82;msg[25]=69;msg[26]=87;msg[27]=32;msg[28]=32;msg[29]=32;
  int msgLen = 30;

  // Apply sine displacement per column
  float sineOffset = sin(uv.x * waveFreq * 6.28318 + uTime * waveSpeed) * waveAmp;
  float textY = uv.y - 0.5 + sineOffset;

  // Character grid
  float charW = 0.04;
  float charH = 0.08;
  float scrollX = uv.x + uTime * charW * scrollSpeed;
  float textX = mod(scrollX, charW * float(msgLen));

  int charIdx = int(textX / charW);
  vec2 charUV = vec2(mod(textX, charW) / charW, (textY + charH * 0.5) / charH);

  float pixel = 0.0;
  if (charIdx >= 0 && charIdx < msgLen) {
    pixel = char(msg[charIdx], charUV);
  }

  // Gradient color based on vertical position
  vec3 textColor = mix(vec3(0.2, 0.6, 1.0), vec3(1.0, 0.8, 0.2), uv.y + sineOffset + 0.5);
  vec3 color = textColor * pixel;

  // Subtle background gradient
  vec3 bg = vec3(0.02, 0.01, 0.06) + vec3(0.0, 0.0, 0.03) * uv.y;
  color = mix(bg, color, pixel);

  fragColor = vec4(color, 1.0);
}
`;

let program = null;
let quad = null;
let uTime, uBeat, uResolution;

export default {
  label: 'scrolltext',

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
