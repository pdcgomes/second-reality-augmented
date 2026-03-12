/**
 * Master clock — wraps AudioContext.currentTime.
 * Handles play, pause, and seek state.
 * All times are in seconds.
 */
export class Clock {
  constructor(audioCtx = null) {
    this._audioCtx = audioCtx;
    this._playing = false;
    this._startOffset = 0;
    this._pausedAt = 0;
  }

  get playing() {
    return this._playing;
  }

  /** Current demo time in seconds. */
  currentTime() {
    if (!this._playing) return this._pausedAt;
    if (!this._audioCtx) return this._pausedAt;
    return this._audioCtx.currentTime - this._startOffset;
  }

  play() {
    if (this._playing) return;
    if (this._audioCtx) {
      this._startOffset = this._audioCtx.currentTime - this._pausedAt;
    }
    this._playing = true;
  }

  pause() {
    if (!this._playing) return;
    this._pausedAt = this.currentTime();
    this._playing = false;
  }

  seek(seconds) {
    this._pausedAt = Math.max(0, seconds);
    if (this._playing && this._audioCtx) {
      this._startOffset = this._audioCtx.currentTime - this._pausedAt;
    }
  }

  setAudioContext(audioCtx) {
    this._audioCtx = audioCtx;
  }
}
