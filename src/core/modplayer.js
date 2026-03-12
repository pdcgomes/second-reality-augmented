/**
 * MOD/S3M player — libxmp-wasm + AudioWorklet pipeline.
 * Stub for Phase 1e implementation.
 *
 * Architecture:
 *   libxmp-wasm → AudioWorklet (sample generation off main thread) → AudioContext output
 *
 * AudioContext.currentTime is the master clock. All time queries go through it —
 * never Date.now() or performance.now().
 */

export class ModPlayer {
  constructor() {
    this._audioCtx = null;
    this._loaded = false;
  }

  get audioContext() {
    return this._audioCtx;
  }

  get loaded() {
    return this._loaded;
  }

  // TODO: Phase 1e — implement these methods
  async init() {
    this._audioCtx = new AudioContext();
    return this._audioCtx;
  }

  async load(_s3mData) {
    // Will load S3M data into libxmp-wasm
    this._loaded = true;
  }

  play() {
    // Will resume AudioContext and start playback
  }

  pause() {
    // Will suspend AudioContext
  }

  seek(_seconds) {
    // Will seek to position in the module
  }

  destroy() {
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }
    this._loaded = false;
  }
}
