/**
 * MOD/S3M player — wraps webaudio-mod-player for S3M playback.
 *
 * Manages two S3M songs (MUSIC0 + MUSIC1) matching the original demo's
 * dual-music architecture. Exposes position/row for sync point queries.
 *
 * AudioContext.currentTime is the master clock.
 */

import { Modplayer as RawModplayer } from '../../lib/webaudio-mod-player/index.js';

const SPEED_GAIN = [1.00370, 1.00231];

export class ModPlayer {
  constructor() {
    this._players = [null, null];
    this._activeIndex = -1;
    this._audioCtx = null;
    this._loaded = false;
  }

  get audioContext() {
    return this._audioCtx;
  }

  get loaded() {
    return this._loaded;
  }

  get position() {
    const p = this._activePlayer;
    return p ? p.position : 0;
  }

  get row() {
    const p = this._activePlayer;
    return p ? p.row : 0;
  }

  get bpm() {
    const p = this._activePlayer;
    return p ? p.bpm : 125;
  }

  get speed() {
    const p = this._activePlayer;
    return p ? p.speed : 6;
  }

  get activeIndex() {
    return this._activeIndex;
  }

  get _activePlayer() {
    return this._activeIndex >= 0 ? this._players[this._activeIndex] : null;
  }

  async loadBoth(music0ArrayBuffer, music1ArrayBuffer) {
    for (let i = 0; i < 2; i++) {
      const mp = new RawModplayer();
      mp.speedGain = SPEED_GAIN[i];
      const buf = i === 0 ? music0ArrayBuffer : music1ArrayBuffer;

      if (i === 0) {
        const data = new Uint8Array(buf);
        data[50] = 0x78; // match original: reduce tempo 125→120
      }

      const ok = mp.loadBuffer(buf);
      if (!ok) throw new Error(`Failed to parse MUSIC${i}.S3M`);
      this._players[i] = mp;
    }
    this._loaded = true;
  }

  async load(s3mArrayBuffer, index = 0) {
    const mp = new RawModplayer();
    mp.speedGain = SPEED_GAIN[index];
    if (!mp.loadBuffer(s3mArrayBuffer)) throw new Error('Failed to parse S3M');
    this._players[index] = mp;
    this._loaded = true;
  }

  play(musicIndex = 0, position = 0, row = 0) {
    this._pauseAll();
    this._activeIndex = musicIndex;
    const mp = this._players[musicIndex];
    if (!mp) return;

    if (!mp.context) {
      if (!this._audioCtx) {
        this._audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      mp.context = this._audioCtx;
      mp.samplerate = this._audioCtx.sampleRate;
      mp.bufferlen = mp.samplerate > 44100 ? 2048 : 1024;
      mp.mixerNode = this._audioCtx.createScriptProcessor(mp.bufferlen, 1, 2);
      mp.mixerNode.module = mp;
      mp.mixerNode.onaudioprocess = RawModplayer.prototype.mix;
      mp.mixerNode.connect(this._audioCtx.destination);
    }

    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
    }

    mp.player.samplerate = mp.samplerate;
    mp.player.speedGain = mp.speedGain;
    mp.endofsong = false;
    mp.player.endofsong = false;
    mp.player.paused = false;
    mp.player.initialize();
    mp.player.flags = 1 + 2;
    mp.player.playing = true;
    mp.playing = true;
    mp.chvu = new Float32Array(mp.player.channels);
    mp.player.delayfirst = mp.bufferstodelay;

    if (position > 0 || row > 0) {
      mp.seek(position, row);
    }
  }

  changeMusic(musicIndex, position = 0, row = 0) {
    this._pauseAll();
    this.play(musicIndex, position, row);
  }

  pause() {
    const p = this._activePlayer;
    if (p && p.player && !p.player.paused) p.player.paused = true;
  }

  resume() {
    const p = this._activePlayer;
    if (p && p.player && p.player.paused) {
      p.player.paused = false;
      if (this._audioCtx && this._audioCtx.state === 'suspended') {
        this._audioCtx.resume();
      }
    }
  }

  stop() {
    this._pauseAll();
    this._activeIndex = -1;
  }

  seek(position, row = 0) {
    const p = this._activePlayer;
    if (p) p.seek(position, row);
  }

  _pauseAll() {
    for (const mp of this._players) {
      if (mp && mp.player) {
        mp.player.paused = true;
      }
    }
  }

  destroy() {
    for (const mp of this._players) {
      if (mp) mp.stop();
    }
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }
    this._players = [null, null];
    this._activeIndex = -1;
    this._loaded = false;
  }
}
