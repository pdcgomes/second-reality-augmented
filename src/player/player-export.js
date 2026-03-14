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
const isMobile = matchMedia('(pointer: coarse)').matches;

const modPlayer = new ModPlayer();
const project = window.__DEMO_PROJECT__;

// ── DOM ──────────────────────────────────────────────────────────────

const overlay = document.getElementById('overlay');
const canvas1 = document.getElementById('c1');
const hud = document.getElementById('hud');
const soundBtn = document.getElementById('sound-btn');
const scrubBar = document.getElementById('scrub-bar');
const scrubFill = document.getElementById('scrub-fill');
const scrubTimeEl = document.getElementById('scrub-time');

// ── GL context & effect cache ────────────────────────────────────────

let gl1 = null;
const cache1 = {};

// ── HUD ──────────────────────────────────────────────────────────────

function updateHUD() {
  const pause = !playing && started ? '  \u23F8' : '';
  if (isMobile) {
    hud.innerHTML = `<span>${variant.toUpperCase()}${pause}</span>`;
  } else {
    hud.innerHTML = `<span>${variant.toUpperCase()}${pause}</span><kbd>X</kbd><span style="color:rgba(255,255,255,.25);font-size:11px">TO TOGGLE</span>`;
  }
}

// ── Sound button (mobile) ────────────────────────────────────────────

const ICON_ON = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/><path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63z"/><path d="M19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.87 8.87 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/><path d="M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4l-2.1 2.1L12 8.2V4z"/></svg>';

let audioUnlocked = false;
let muted = false;

function updateSoundBtn() {
  if (!soundBtn) return;
  soundBtn.innerHTML = muted ? ICON_OFF : ICON_ON;
}

function onSoundBtnTap(e) {
  e.stopPropagation();
  if (!audioUnlocked) {
    modPlayer.unlockAudio();
    audioUnlocked = true;
    muted = false;
  } else {
    muted = !muted;
    modPlayer.setMuted(muted);
  }
  updateSoundBtn();
}

// ── Touch scrub (mobile) ─────────────────────────────────────────────

const SCRUB_DEADZONE = 12;
const SCRUB_SPEED = 0.15;

let scrubbing = false;
let wasPlayingBeforeScrub = false;
let touchStartX = 0;
let touchStartTime = 0;
let scrubTime = 0;

function getDuration() {
  const clips = project.clips;
  return clips.length ? clips[clips.length - 1].end : 300;
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

function updateScrubProgress(t) {
  const d = getDuration();
  if (scrubFill) scrubFill.style.width = `${(t / d) * 100}%`;
  if (scrubTimeEl) scrubTimeEl.textContent = `${fmtTime(t)} / ${fmtTime(d)}`;
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

const ASPECT = W / H;

function sizeCanvas(canvas, gl, v) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let dw, dh;
  if (vw / vh > ASPECT) {
    dh = vh;
    dw = Math.round(vh * ASPECT);
  } else {
    dw = vw;
    dh = Math.round(vw / ASPECT);
  }

  const s = canvas.style;
  const sw = dw + 'px';
  const sh = dh + 'px';
  if (s.width !== sw || s.height !== sh) {
    s.position = 'absolute';
    s.left = ((vw - dw) >> 1) + 'px';
    s.top = ((vh - dh) >> 1) + 'px';
    s.width = sw;
    s.height = sh;
  }

  if (v === 'remastered') {
    const dpr = devicePixelRatio || 1;
    const w = Math.round(dw * dpr);
    const h = Math.round(dh * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    s.imageRendering = 'auto';
  } else {
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    s.imageRendering = 'pixelated';
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

// ── Render a single frame ────────────────────────────────────────────

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
  const t = scrubbing ? scrubTime : modPlayer.currentTime();

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

  sizeCanvas(canvas1, gl1, variant);
  renderFrame(gl1, cache1, variant, t);

  if (isMobile && scrubFill && started && !scrubbing) {
    scrubFill.style.width = `${(t / getDuration()) * 100}%`;
  }

  requestAnimationFrame(tick);
}

// ── Controls ─────────────────────────────────────────────────────────

async function startDemo() {
  if (started) return;

  // Create and resume AudioContext synchronously inside the user gesture
  // so mobile browsers permit audio output.
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const ctx = new AudioCtx();
  if (ctx.state === 'suspended') ctx.resume();

  overlay.textContent = '';

  const m0 = b64ToArrayBuffer(window.__MUSIC0_B64__);
  const m1 = b64ToArrayBuffer(window.__MUSIC1_B64__);
  await modPlayer.loadBoth(m0, m1);

  modPlayer.setAudioContext(ctx);
  gl1 = initGL(canvas1);

  modPlayer.play(0, 0, 0, 0);
  started = true;
  playing = true;
  overlay.remove();
  updateHUD();
  if (isMobile) {
    if (soundBtn) { soundBtn.style.display = 'flex'; updateSoundBtn(); }
    if (scrubBar) scrubBar.style.display = 'block';
  }
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
  if (!started) return;
  variant = variant === 'classic' ? 'remastered' : 'classic';
  updateHUD();
}

// Show the HUD immediately (before demo starts)
updateHUD();

// ── Mobile overlay ──────────────────────────────────────────────────

if (isMobile) {
  overlay.innerHTML =
    '<span>Tap to play</span>' +
    '<span class="hint">tap during playback to switch variant<br>swipe left/right to scrub</span>';
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
  }
});

if (isMobile) {
  document.addEventListener('click', (e) => {
    if (e.target.closest('#gh-link')) return;
    if (e.target.closest('#sound-btn')) return;
    if (!started) {
      startDemo();
    } else {
      toggleVariant();
    }
  });
  if (soundBtn) soundBtn.addEventListener('click', onSoundBtnTap);

  document.addEventListener('touchstart', (e) => {
    if (!started) return;
    if (e.target.closest('#sound-btn') || e.target.closest('#gh-link')) return;
    touchStartX = e.touches[0].clientX;
    touchStartTime = scrubbing ? scrubTime : modPlayer.currentTime();
    scrubbing = false;
  }, { passive: true });

  document.addEventListener('touchmove', (e) => {
    if (!started) return;
    const dx = e.touches[0].clientX - touchStartX;

    if (!scrubbing && Math.abs(dx) > SCRUB_DEADZONE) {
      scrubbing = true;
      wasPlayingBeforeScrub = playing;
      if (playing) { modPlayer.pause(); playing = false; }
      if (scrubBar) scrubBar.classList.add('active');
      if (scrubTimeEl) scrubTimeEl.style.display = 'block';
    }

    if (scrubbing) {
      e.preventDefault();
      scrubTime = Math.max(0, Math.min(getDuration() - 0.1, touchStartTime + dx * SCRUB_SPEED));
      updateScrubProgress(scrubTime);
    }
  }, { passive: false });

  document.addEventListener('touchend', (e) => {
    if (scrubbing) {
      e.preventDefault();
      scrubbing = false;
      modPlayer.seekToTime(scrubTime);
      if (wasPlayingBeforeScrub) {
        modPlayer.resume();
        playing = true;
      }
      if (scrubBar) scrubBar.classList.remove('active');
      if (scrubTimeEl) scrubTimeEl.style.display = 'none';
      updateHUD();
    }
  });

  document.addEventListener('touchcancel', () => {
    if (scrubbing) {
      scrubbing = false;
      modPlayer.seekToTime(scrubTime);
      if (wasPlayingBeforeScrub) {
        modPlayer.resume();
        playing = true;
      }
      if (scrubBar) scrubBar.classList.remove('active');
      if (scrubTimeEl) scrubTimeEl.style.display = 'none';
      updateHUD();
    }
  });
}
