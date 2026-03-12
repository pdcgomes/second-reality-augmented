/**
 * Master clock — wraps AudioContext.currentTime.
 * Handles play, pause, and seek state.
 * All times are in seconds.
 *
 * If no AudioContext is provided, one is auto-created on first play().
 * AudioContext.currentTime ticks even without audio output, so this
 * gives us a hardware-accurate clock in all cases.
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

  get audioContext() {
    return this._audioCtx;
  }

  currentTime() {
    if (!this._playing) return this._pausedAt;
    if (!this._audioCtx) return this._pausedAt;
    return this._audioCtx.currentTime - this._startOffset;
  }

  play() {
    if (this._playing) return;
    this._ensureAudioContext();
    this._startOffset = this._audioCtx.currentTime - this._pausedAt;
    if (this._audioCtx.state === 'suspended') {
      this._audioCtx.resume();
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
    const wasPlaying = this._playing;
    if (wasPlaying) this.pause();
    this._audioCtx = audioCtx;
    if (wasPlaying) this.play();
  }

  _ensureAudioContext() {
    if (!this._audioCtx) {
      this._audioCtx = new AudioContext();
    }
  }
}
