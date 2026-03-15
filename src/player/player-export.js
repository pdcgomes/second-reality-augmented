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
const controlsEl = document.getElementById('controls');

// ── GL context & effect cache ────────────────────────────────────────

let gl1 = null;
const cache1 = {};

// ── HUD (desktop only) ──────────────────────────────────────────────

function updateHUD() {
  if (isMobile || !hud) return;
  const pause = !playing && started ? '  \u23F8' : '';
  hud.innerHTML = `<span>${variant.toUpperCase()}${pause}</span><kbd>X</kbd><span style="color:rgba(255,255,255,.25);font-size:11px">TO TOGGLE</span>`;
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

function getDuration() {
  const clips = project.clips;
  return clips.length ? clips[clips.length - 1].end : 300;
}

function fmtTime(s) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
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

// ── Controls panel (mobile) ──────────────────────────────────────────

const CLIP_COLORS = [
  '#4a7cff','#8855ff','#00ccaa','#ff6b4a','#ffaa00',
  '#ff55aa','#55aaff','#aaff55','#ff5555','#55ffcc',
];

let panelOpen = false;
let autoHideTimer = 0;
let audioUnlocked = false;
let muted = false;
let scrubbing = false;
let wasPlayingBeforeScrub = false;

const ctl = {};

function buildControlsPanel() {
  if (!controlsEl) return;
  const dur = getDuration();

  const panel = document.createElement('div');
  panel.className = 'panel';

  // ── Top row: play/pause, variant toggle, mute, time ──
  const row = document.createElement('div');
  row.className = 'row';

  const btnPlay = document.createElement('button');
  btnPlay.className = 'btn';
  btnPlay.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';

  const btnClassic = document.createElement('button');
  btnClassic.className = 'btn act-blue';
  btnClassic.textContent = 'CLASSIC';

  const btnRemaster = document.createElement('button');
  btnRemaster.className = 'btn';
  btnRemaster.textContent = 'REMASTERED';

  const spacer = document.createElement('div');
  spacer.className = 'spacer';

  const btnMute = document.createElement('button');
  btnMute.className = 'btn';
  btnMute.innerHTML = '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';

  const timeEl = document.createElement('span');
  timeEl.className = 'time';
  timeEl.textContent = `0:00/${fmtTime(dur)}`;

  row.append(btnPlay, btnClassic, btnRemaster, spacer, btnMute, timeEl);
  panel.appendChild(row);

  // ── Scrubber track with colored segments ──
  const track = document.createElement('div');
  track.className = 'track';

  const segEls = [];
  const clips = project.clips;
  for (let i = 0; i < clips.length; i++) {
    const seg = document.createElement('div');
    seg.className = 'seg';
    const left = (clips[i].start / dur) * 100;
    const width = ((clips[i].end - clips[i].start) / dur) * 100;
    seg.style.cssText = `left:${left}%;width:${width}%;background:${CLIP_COLORS[i % CLIP_COLORS.length]}`;
    track.appendChild(seg);
    segEls.push(seg);
  }

  const played = document.createElement('div');
  played.className = 'played';
  track.appendChild(played);

  const head = document.createElement('div');
  head.className = 'head';
  track.appendChild(head);

  panel.appendChild(track);

  // ── Effect labels below track ──
  const labels = document.createElement('div');
  labels.className = 'labels';
  for (let i = 0; i < clips.length; i++) {
    const sp = document.createElement('span');
    const widthPct = ((clips[i].end - clips[i].start) / dur) * 100;
    sp.style.width = `${widthPct}%`;
    sp.textContent = widthPct > 3 ? clips[i].effect : '';
    labels.appendChild(sp);
  }
  panel.appendChild(labels);

  controlsEl.appendChild(panel);

  // Store references for updates
  ctl.btnPlay = btnPlay;
  ctl.btnClassic = btnClassic;
  ctl.btnRemaster = btnRemaster;
  ctl.btnMute = btnMute;
  ctl.timeEl = timeEl;
  ctl.track = track;
  ctl.played = played;
  ctl.head = head;
  ctl.segEls = segEls;

  // ── Button handlers ──
  btnPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    resetAutoHide();
    togglePause();
  });

  btnClassic.addEventListener('click', (e) => {
    e.stopPropagation();
    resetAutoHide();
    if (variant !== 'classic') { variant = 'classic'; syncVariantButtons(); }
  });

  btnRemaster.addEventListener('click', (e) => {
    e.stopPropagation();
    resetAutoHide();
    if (variant !== 'remastered') { variant = 'remastered'; syncVariantButtons(); }
  });

  btnMute.addEventListener('click', (e) => {
    e.stopPropagation();
    resetAutoHide();
    if (!audioUnlocked) {
      modPlayer.unlockAudio();
      audioUnlocked = true;
      muted = false;
    } else {
      muted = !muted;
      modPlayer.setMuted(muted);
    }
    syncMuteButton();
  });

  // ── Scrubber pointer interaction ──
  function scrubFromEvent(e) {
    const rect = track.getBoundingClientRect();
    const x = (e.clientX ?? e.touches?.[0]?.clientX ?? 0) - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    return pct * dur;
  }

  track.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    e.preventDefault();
    resetAutoHide();
    scrubbing = true;
    wasPlayingBeforeScrub = playing;
    if (playing) { modPlayer.pause(); playing = false; }
    track.setPointerCapture(e.pointerId);
    const t = scrubFromEvent(e);
    modPlayer.seekToTime(t);
  });

  track.addEventListener('pointermove', (e) => {
    if (!scrubbing) return;
    const t = scrubFromEvent(e);
    modPlayer.seekToTime(t);
  });

  track.addEventListener('pointerup', () => {
    if (!scrubbing) return;
    scrubbing = false;
    if (wasPlayingBeforeScrub) {
      modPlayer.resume();
      playing = true;
    }
  });

  track.addEventListener('pointercancel', () => {
    if (!scrubbing) return;
    scrubbing = false;
    if (wasPlayingBeforeScrub) {
      modPlayer.resume();
      playing = true;
    }
  });
}

function syncVariantButtons() {
  if (!ctl.btnClassic) return;
  ctl.btnClassic.className = variant === 'classic' ? 'btn act-blue' : 'btn';
  ctl.btnRemaster.className = variant === 'remastered' ? 'btn act-purple' : 'btn';
  updateHUD();
}

function syncPlayButton() {
  if (!ctl.btnPlay) return;
  ctl.btnPlay.innerHTML = playing
    ? '<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>';
}

function syncMuteButton() {
  if (!ctl.btnMute) return;
  ctl.btnMute.innerHTML = muted
    ? '<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63z"/><path d="M19 12c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.87 8.87 0 0021 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71z"/><path d="M4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4l-2.1 2.1L12 8.2V4z"/></svg>'
    : '<svg viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/></svg>';
  ctl.btnMute.className = muted ? 'btn' : 'btn act-cyan';
}

function updateControls(t) {
  if (!ctl.played) return;
  const dur = getDuration();
  const pct = (t / dur) * 100;
  ctl.played.style.width = `${pct}%`;
  ctl.head.style.left = `${pct}%`;
  ctl.timeEl.textContent = `${fmtTime(t)}/${fmtTime(dur)}`;

  const clips = project.clips;
  for (let i = 0; i < ctl.segEls.length; i++) {
    const active = t >= clips[i].start && t < clips[i].end;
    if (active && !ctl.segEls[i].classList.contains('active')) {
      ctl.segEls[i].classList.add('active');
    } else if (!active && ctl.segEls[i].classList.contains('active')) {
      ctl.segEls[i].classList.remove('active');
    }
  }

  syncPlayButton();
}

// ── Panel show / hide ────────────────────────────────────────────────

function showPanel() {
  if (!controlsEl) return;
  panelOpen = true;
  controlsEl.classList.add('open');
  resetAutoHide();
}

function hidePanel() {
  if (!controlsEl) return;
  panelOpen = false;
  controlsEl.classList.remove('open');
  clearTimeout(autoHideTimer);
}

function togglePanel() {
  panelOpen ? hidePanel() : showPanel();
}

function resetAutoHide() {
  clearTimeout(autoHideTimer);
  autoHideTimer = setTimeout(hidePanel, 5000);
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

  sizeCanvas(canvas1, gl1, variant);
  renderFrame(gl1, cache1, variant, t);

  if (isMobile) updateControls(t);

  requestAnimationFrame(tick);
}

// ── Controls ─────────────────────────────────────────────────────────

async function startDemo() {
  if (started) return;

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
    buildControlsPanel();
    syncMuteButton();
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
  syncPlayButton();
  updateHUD();
}

function toggleVariant() {
  if (!started) return;
  variant = variant === 'classic' ? 'remastered' : 'classic';
  syncVariantButtons();
  updateHUD();
}

updateHUD();

// ── Mobile overlay ──────────────────────────────────────────────────

if (isMobile) {
  overlay.innerHTML =
    '<span>Tap to play</span>';
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
    if (e.target.closest('#controls')) return;
    if (!started) {
      startDemo();
    } else {
      togglePanel();
    }
  });
}
