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

import { Modplayer as RawModplayer, buildTimeMap } from '../../lib/webaudio-mod-player/index.js';
import { musicPosToTime, timeToMusicPos, SPEED_GAIN, setTimeMaps, getRegionStopBoundary, findRegionIndex } from './musicsync.js';

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
   * True when the audio engine has reached the region's stop boundary.
   * The tick loop in App.jsx polls this to trigger the music switch.
   */
  get reachedBoundary() {
    const p = this._activePlayer;
    return p ? p.reachedBoundary : false;
  }

  /**
   * Authoritative elapsed time — derived from actual audio samples processed,
   * not from the constant-BPM formula. Immune to tempo/speed changes in the
   * S3M pattern data. During silent gaps, returns the frozen offset.
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
   * Seek the player to the S3M position/row that corresponds to the given
   * absolute demo time. Handles silent gaps by stopping music. The time
   * offset is set to the requested time so currentTime() continues
   * accurately from that point.
   */
  seekToTime(seconds) {
    const target = timeToMusicPos(seconds);

    if (target.silent) {
      this.enterSilence(seconds);
      return;
    }

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
    this._setStopBoundary(target.music, target.position, target.row);
  }

  /**
   * Stop all music and freeze time at the given offset — used during
   * silent gaps between music regions (BEGLOGO, JPLOGO transitions).
   */
  enterSilence(atTime = null) {
    if (atTime === null) atTime = this.currentTime();
    this._stopAll();
    this._activeIndex = -1;
    this._timeOffset = atTime;
  }

  async loadBoth(music0ArrayBuffer, music1ArrayBuffer) {
    const bufs = [music0ArrayBuffer, music1ArrayBuffer];

    // Patch MUSIC0 BPM from 125→120 to match original demo timing.
    // Confirmed in second-reality-js MusicPlayer.js: MusicData[0][50]=0x78
    const data0 = new Uint8Array(bufs[0]);
    data0[50] = 0x78;

    for (let i = 0; i < 2; i++) {
      const mp = new RawModplayer();
      mp.speedGain = SPEED_GAIN[i];
      const ok = mp.loadBuffer(bufs[i]);
      if (!ok) throw new Error(`Failed to parse MUSIC${i}.S3M`);
      this._players[i] = mp;
    }

    // Build exact position→time lookup tables by dry-running the engine
    const maps = [
      buildTimeMap(bufs[0], SPEED_GAIN[0]),
      buildTimeMap(bufs[1], SPEED_GAIN[1]),
    ];
    setTimeMaps(maps);

    if (maps[0]) console.log(`MUSIC0 time map: ${maps[0].totalDuration.toFixed(1)}s, ${maps[0].syncs.length} sync marks`);
    if (maps[1]) console.log(`MUSIC1 time map: ${maps[1].totalDuration.toFixed(1)}s, ${maps[1].syncs.length} sync marks`);

    this._loaded = true;
  }

  async load(s3mArrayBuffer, index = 0) {
    const mp = new RawModplayer();
    mp.speedGain = SPEED_GAIN[index];
    if (!mp.loadBuffer(s3mArrayBuffer)) throw new Error('Failed to parse S3M');
    this._players[index] = mp;
    this._loaded = true;
  }

  /**
   * Start playback of the given music at position/row. Uses the musicsync
   * formula for the initial time offset (approximate). Pass `timeOffset`
   * to override with an exact value (e.g. from the clock during gap exit).
   */
  play(musicIndex = 0, position = 0, row = 0, timeOffset = null) {
    this._stopAll();
    this._activeIndex = musicIndex;
    const mp = this._players[musicIndex];
    if (!mp) return;

    this._timeOffset = timeOffset !== null
      ? timeOffset
      : musicPosToTime(musicIndex, position, row);
    mp.play();

    if (mp.context && mp.context.state === 'suspended') {
      mp.context.resume().catch(() => {});
    }

    if (position > 0 || row > 0) {
      mp.seek(position, row);
    }

    this._setStopBoundary(musicIndex, position, row);
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

    this._setStopBoundary(musicIndex, position, row);
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

  _setStopBoundary(musicIndex, position, row) {
    const ri = findRegionIndex(musicIndex, position, row);
    const mp = this._players[musicIndex];
    if (ri >= 0 && mp) {
      mp.setStopBoundary(getRegionStopBoundary(ri));
    } else if (mp) {
      mp.setStopBoundary(null);
    }
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
