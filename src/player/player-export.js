/**
 * Player runtime for the exported U2.html demo.
 * Bundled by esbuild into a self-contained IIFE.
 *
 * Globals injected by the export pipeline (before this script):
 *   window.__DEMO_PROJECT__   — parsed project.json
 *   window.__MUSIC0_B64__     — base64-encoded MUSIC0.S3M
 *   window.__MUSIC1_B64__     — base64-encoded MUSIC1.S3M
 */

import { ModPlayer } from '../core/modplayer.js';
import { getEffect, resolveParams } from '../effects/index.js';
import { getBeatPosition } from '../core/beatmap.js';
import {
  getTransitionProgress,
  renderTransitionOverlay,
} from '../core/transitions.js';
import { getRegionAtTime, timeToMusicPos } from '../core/musicsync.js';

const W = 320, H = 256;

// ── State ────────────────────────────────────────────────────────────

let started = false;
let playing = false;
let variant = 'classic';
let sideBySide = false;

const modPlayer = new ModPlayer();
const project = window.__DEMO_PROJECT__;

// ── DOM ──────────────────────────────────────────────────────────────

const overlay = document.getElementById('overlay');
const canvas1 = document.getElementById('c1');
const canvas2 = document.getElementById('c2');
const hud = document.getElementById('hud');

// ── GL contexts & effect caches ──────────────────────────────────────

let gl1 = null, gl2 = null;
const cache1 = {}, cache2 = {};

// ── HUD ──────────────────────────────────────────────────────────────

let hudTimer = null;

function showHUD(persist) {
  hud.style.opacity = '1';
  clearTimeout(hudTimer);
  if (!persist) {
    hudTimer = setTimeout(() => { hud.style.opacity = '0'; }, 2500);
  }
}

function updateHUD() {
  let text = sideBySide ? 'CLASSIC | REMASTERED' : variant.toUpperCase();
  if (!playing && started) text += '  \u23F8';
  hud.textContent = text;
  showHUD(!playing && started);
}

// ── Helpers ──────────────────────────────────────────────────────────

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

function initGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false });
  if (!gl) {
    document.body.textContent = 'WebGL2 is required.';
    throw new Error('WebGL2 required');
  }
  gl.clearColor(0, 0, 0, 1);
  return gl;
}

function sizeCanvas(canvas, gl, v) {
  if (v === 'remastered') {
    const dpr = devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    canvas.style.imageRendering = 'auto';
  } else {
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    canvas.style.imageRendering = 'pixelated';
  }
  gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
}

/**
 * Lazily resolve and init an effect variant on a given GL context.
 * Handles the case where getEffect('FOO','remastered') falls back to
 * the classic module — avoids double-init on the same module object.
 */
function resolve(name, v, gl, cache) {
  const key = `${name}:${v}`;
  if (cache[key]) return cache[key];

  const mod = getEffect(name, v);
  if (!mod) return null;

  const altKey = `${name}:${v === 'classic' ? 'remastered' : 'classic'}`;
  if (cache[altKey] === mod) {
    cache[key] = mod;
    return mod;
  }

  try {
    mod.init(gl);
    cache[key] = mod;
    return mod;
  } catch (e) {
    console.error(`Init ${name} (${v}):`, e);
    return null;
  }
}

// ── Render a single frame on one canvas ──────────────────────────────

function renderFrame(gl, cache, v, t) {
  gl.clear(gl.COLOR_BUFFER_BIT);

  const clip = project.clips.find((c) => t >= c.start && t < c.end);
  if (!clip) return;

  const idx = project.clips.indexOf(clip);
  if (idx < project.clips.length - 1) {
    resolve(project.clips[idx + 1].effect, v, gl, cache);
  }

  const mod = resolve(clip.effect, v, gl, cache);
  if (mod) {
    mod.render(
      gl,
      t - clip.start,
      getBeatPosition(t, project.beatMap),
      resolveParams(clip.effect, v, clip.params),
    );
  }

  const { inProgress, outProgress } = getTransitionProgress(clip, t);
  if (clip.transitionIn && inProgress !== null) {
    renderTransitionOverlay(gl, clip.transitionIn.type, inProgress);
  }
  if (clip.transitionOut && outProgress !== null) {
    renderTransitionOverlay(gl, clip.transitionOut.type, outProgress);
  }
}

// ── Tick loop ────────────────────────────────────────────────────────

function tick() {
  const t = modPlayer.currentTime();

  if (playing) {
    const region = getRegionAtTime(t);
    if (
      modPlayer.reachedBoundary ||
      (region && region.music !== modPlayer.activeIndex)
    ) {
      const target = timeToMusicPos(t);
      if (target.music !== modPlayer.activeIndex || modPlayer.reachedBoundary) {
        modPlayer.changeMusic(target.music, target.position, target.row);
      }
    }
  }

  if (sideBySide) {
    sizeCanvas(canvas1, gl1, 'classic');
    renderFrame(gl1, cache1, 'classic', t);

    if (!gl2) gl2 = initGL(canvas2);
    sizeCanvas(canvas2, gl2, 'remastered');
    renderFrame(gl2, cache2, 'remastered', t);
  } else {
    sizeCanvas(canvas1, gl1, variant);
    renderFrame(gl1, cache1, variant, t);
  }

  requestAnimationFrame(tick);
}

// ── Controls ─────────────────────────────────────────────────────────

async function startDemo() {
  if (started) return;

  overlay.textContent = '';

  const m0 = b64ToArrayBuffer(window.__MUSIC0_B64__);
  const m1 = b64ToArrayBuffer(window.__MUSIC1_B64__);
  await modPlayer.loadBoth(m0, m1);

  gl1 = initGL(canvas1);

  modPlayer.play(0, 0, 0, 0);
  started = true;
  playing = true;
  overlay.remove();
  updateHUD();
  requestAnimationFrame(tick);
}

function togglePause() {
  if (!started) return;
  if (playing) {
    modPlayer.pause();
    playing = false;
  } else {
    modPlayer.resume();
    playing = true;
  }
  updateHUD();
}

function toggleVariant() {
  if (!started || sideBySide) return;
  variant = variant === 'classic' ? 'remastered' : 'classic';
  updateHUD();
}

function toggleSBS() {
  if (!started) return;
  sideBySide = !sideBySide;
  canvas2.style.display = sideBySide ? 'block' : 'none';
  updateHUD();
}

// ── Input ────────────────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  switch (e.code) {
    case 'Space':
      e.preventDefault();
      started ? togglePause() : startDemo();
      break;
    case 'KeyX':
      e.preventDefault();
      toggleVariant();
      break;
    case 'KeyV':
      e.preventDefault();
      toggleSBS();
      break;
  }
});
