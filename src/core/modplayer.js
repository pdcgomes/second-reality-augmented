/**
 * MOD/S3M player — wraps webaudio-mod-player for S3M playback.
 *
 * Manages two S3M songs (MUSIC0 + MUSIC1) matching the original demo's
 * dual-music architecture.
 *
 * Time tracking: uses the S3M engine's actual sample count for elapsed time,
 * not the constant-BPM formula from musicsync. This means playback time
 * stays perfectly accurate even when the S3M files contain Axx (speed)
 * or Txx (tempo) changes mid-song.
 *
 * Delegates audio setup entirely to the vendored library's own
 * createContext() and play() methods to avoid subtle mismatches.
 */

import { Modplayer as RawModplayer } from '../../lib/webaudio-mod-player/index.js';
import { musicPosToTime, timeToMusicPos, SPEED_GAIN, REGION_SWITCH } from './musicsync.js';

export class ModPlayer {
  constructor() {
    this._players = [null, null];
    this._activeIndex = -1;
    this._loaded = false;
    this._timeOffset = 0;
  }

  get audioContext() {
    const p = this._activePlayer;
    return p ? p.context : null;
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

  /**
   * Authoritative elapsed time — derived from actual audio samples processed,
   * not from the constant-BPM formula. Immune to tempo/speed changes in the
   * S3M pattern data.
   */
  currentTime() {
    if (this._activeIndex < 0) return this._timeOffset;
    const mp = this._activePlayer;
    if (!mp) return this._timeOffset;
    return this._timeOffset + mp._samplesProcessed / mp.samplerate;
  }

  /**
   * Legacy position-based time (approximate). Used only for offset estimation
   * when the sample counter isn't available (e.g. right after a seek).
   */
  currentTimeFromPosition() {
    if (this._activeIndex < 0) return 0;
    const p = this._activePlayer;
    if (!p || !p.player) return 0;
    return musicPosToTime(this._activeIndex, p.player.position, p.player.row);
  }

  /**
   * Check whether the player has crossed a region boundary (e.g. MUSIC0
   * position reaching 14). Returns the REGION_SWITCH entry if a switch
   * is needed, or null.
   */
  checkBoundary() {
    if (this._activeIndex < 0) return null;
    const p = this._activePlayer;
    if (!p || !p.player) return null;
    const pos = p.player.position;
    for (const b of REGION_SWITCH) {
      if (this._activeIndex === b.music && pos >= b.endPos) return b;
    }
    return null;
  }

  /**
   * Seek the player to the S3M position/row that corresponds to the given
   * absolute demo time. The time offset is set to the requested time so
   * that currentTime() continues accurately from that point.
   */
  seekToTime(seconds) {
    const target = timeToMusicPos(seconds);

    if (this._activeIndex !== target.music) {
      this._stopAll();
      this._activeIndex = target.music;
      const mp = this._players[target.music];
      if (!mp) return;
      mp.play();
      if (mp.context && mp.context.state === 'suspended') {
        mp.context.resume().catch(() => {});
      }
    }

    const mp = this._players[target.music];
    if (mp) mp.seek(target.position, target.row);
    this._timeOffset = seconds;
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
    this._stopAll();
    this._activeIndex = musicIndex;
    const mp = this._players[musicIndex];
    if (!mp) return;

    this._timeOffset = musicPosToTime(musicIndex, position, row);
    mp.play();

    if (mp.context && mp.context.state === 'suspended') {
      mp.context.resume().catch(() => {});
    }

    if (position > 0 || row > 0) {
      mp.seek(position, row);
    }
  }

  /**
   * Switch to a different music file at the given position. Preserves the
   * current elapsed time as the new offset so currentTime() is continuous.
   */
  changeMusic(musicIndex, position = 0, row = 0) {
    const t = this.currentTime();
    this._stopAll();
    this._activeIndex = musicIndex;
    const mp = this._players[musicIndex];
    if (!mp) return;

    this._timeOffset = t;
    mp.play();

    if (mp.context && mp.context.state === 'suspended') {
      mp.context.resume().catch(() => {});
    }

    if (position > 0 || row > 0) {
      mp.seek(position, row);
    }
  }

  pause() {
    const p = this._activePlayer;
    if (p && p.player && !p.player.paused) {
      p.player.paused = true;
    }
  }

  resume() {
    const p = this._activePlayer;
    if (!p || !p.player) return;

    p.player.paused = false;
    p.playing = true;

    if (p.context && p.context.state === 'suspended') {
      p.context.resume().catch(() => {});
    }
  }

  stop() {
    this._stopAll();
    this._activeIndex = -1;
    this._timeOffset = 0;
  }

  seek(position, row = 0) {
    const p = this._activePlayer;
    if (p) p.seek(position, row);
  }

  _stopAll() {
    for (const mp of this._players) {
      if (mp && mp.playing) {
        mp.stop();
      }
    }
  }

  destroy() {
    this._stopAll();
    for (const mp of this._players) {
      if (mp && mp.context) {
        mp.context.close().catch(() => {});
      }
    }
    this._players = [null, null];
    this._activeIndex = -1;
    this._loaded = false;
    this._timeOffset = 0;
  }
}
