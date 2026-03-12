/**
 * Transition system — renders overlay effects between demo parts.
 *
 * The original Second Reality uses white flashes, fades, CRT shutdown,
 * and checkerboard wipes between self-contained parts. Transitions are
 * rendered as a post-process pass over the effect's output.
 */

import { createProgram, createFullscreenQuad } from './webgl.js';

const VERT = `#version 300 es
layout(location = 0) in vec2 aPosition;
out vec2 vUV;
void main() {
  vUV = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FADE_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform vec3 uColor;
uniform float uAlpha;
void main() {
  fragColor = vec4(uColor, uAlpha);
}
`;

const CRT_SHUTDOWN_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uProgress;
void main() {
  vec2 center = vec2(0.5);
  float dist = abs(vUV.y - center.y);
  float barHeight = mix(0.5, 0.0, uProgress);
  float mask = smoothstep(barHeight, barHeight + 0.005, dist);
  fragColor = vec4(0.0, 0.0, 0.0, mask);
}
`;

const CHECKER_FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform float uProgress;
uniform vec2 uResolution;
void main() {
  vec2 cellSize = vec2(16.0) / uResolution;
  vec2 cell = floor(vUV / cellSize);
  float cellId = cell.x + cell.y;
  float delay = fract(sin(cellId * 12.9898 + cell.y * 78.233) * 43758.5453) * 0.6;
  float t = clamp((uProgress - delay) / 0.4, 0.0, 1.0);
  fragColor = vec4(0.0, 0.0, 0.0, t);
}
`;

const TRANSITION_TYPES = {
  fadeToBlack: { color: [0, 0, 0], dir: 'out' },
  fadeFromBlack: { color: [0, 0, 0], dir: 'in' },
  fadeToWhite: { color: [1, 1, 1], dir: 'out' },
  fadeFromWhite: { color: [1, 1, 1], dir: 'in' },
  flash: { color: [1, 1, 1], dir: 'flash' },
};

let fadeProgram = null;
let crtProgram = null;
let checkerProgram = null;
let quad = null;

function ensureResources(gl) {
  if (quad) return;
  quad = createFullscreenQuad(gl);
  fadeProgram = createProgram(gl, VERT, FADE_FRAG);
  crtProgram = createProgram(gl, VERT, CRT_SHUTDOWN_FRAG);
  checkerProgram = createProgram(gl, VERT, CHECKER_FRAG);
}

/**
 * Compute transition progress for a clip at a given time.
 * Returns { inProgress: 0-1 | null, outProgress: 0-1 | null }
 */
export function getTransitionProgress(clip, currentTime) {
  let inProgress = null;
  let outProgress = null;

  if (clip.transitionIn && clip.transitionIn.type !== 'none') {
    const dur = clip.transitionIn.duration || 1.0;
    const elapsed = currentTime - clip.start;
    if (elapsed < dur) {
      inProgress = elapsed / dur;
    }
  }

  if (clip.transitionOut && clip.transitionOut.type !== 'none') {
    const dur = clip.transitionOut.duration || 1.0;
    const remaining = clip.end - currentTime;
    if (remaining < dur) {
      outProgress = 1.0 - remaining / dur;
    }
  }

  return { inProgress, outProgress };
}

/**
 * Render a transition overlay. Call after the effect has rendered.
 * Uses alpha blending to overlay the transition on top of the scene.
 */
export function renderTransitionOverlay(gl, type, progress) {
  if (!type || type === 'none' || progress === null) return;

  ensureResources(gl);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  if (type === 'crtShutdown') {
    gl.useProgram(crtProgram);
    gl.uniform1f(gl.getUniformLocation(crtProgram, 'uProgress'), progress);
    quad.draw();
  } else if (type === 'checkerboardWipe') {
    gl.useProgram(checkerProgram);
    gl.uniform1f(gl.getUniformLocation(checkerProgram, 'uProgress'), progress);
    gl.uniform2f(
      gl.getUniformLocation(checkerProgram, 'uResolution'),
      gl.drawingBufferWidth,
      gl.drawingBufferHeight,
    );
    quad.draw();
  } else {
    const info = TRANSITION_TYPES[type];
    if (!info) { gl.disable(gl.BLEND); return; }

    let alpha;
    if (info.dir === 'in') {
      alpha = 1.0 - progress;
    } else if (info.dir === 'out') {
      alpha = progress;
    } else if (info.dir === 'flash') {
      alpha = progress < 0.15 ? 1.0 : Math.max(0, 1.0 - (progress - 0.15) / 0.85);
    }

    gl.useProgram(fadeProgram);
    gl.uniform3f(gl.getUniformLocation(fadeProgram, 'uColor'), ...info.color);
    gl.uniform1f(gl.getUniformLocation(fadeProgram, 'uAlpha'), alpha);
    quad.draw();
  }

  gl.disable(gl.BLEND);
}

export function destroyTransitions(gl) {
  if (fadeProgram) gl.deleteProgram(fadeProgram);
  if (crtProgram) gl.deleteProgram(crtProgram);
  if (checkerProgram) gl.deleteProgram(checkerProgram);
  if (quad) quad.destroy();
  fadeProgram = crtProgram = checkerProgram = quad = null;
}
