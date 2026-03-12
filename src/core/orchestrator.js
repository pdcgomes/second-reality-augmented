/**
 * Orchestrator — manages the effect lifecycle, tick loop, and cue dispatch.
 * Shared by both editor and player.
 */
export class Orchestrator {
  constructor(project, gl, clock) {
    this.project = project;
    this.gl = gl;
    this.clock = clock;
    this.effects = {};
    this.activeClip = null;
    this._running = false;
    this._rafId = null;
  }

  /** Register a loaded effect module by name. */
  registerEffect(name, effectModule) {
    this.effects[name] = { module: effectModule, initialized: false };
  }

  start() {
    if (this._running) return;
    this._running = true;
    this.clock.play();
    this._tick();
  }

  stop() {
    this._running = false;
    this.clock.pause();
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
  }

  /** Find the clip active at time t. */
  findClipAtTime(t) {
    return this.project.clips.find((c) => t >= c.start && t < c.end) ?? null;
  }

  /** Get the next clip after the given one. */
  getNextClip(clip) {
    const idx = this.project.clips.indexOf(clip);
    if (idx < 0 || idx >= this.project.clips.length - 1) return null;
    return this.project.clips[idx + 1];
  }

  /** Pre-warm an effect by calling init() if not already initialized. */
  preWarm(effectName) {
    const entry = this.effects[effectName];
    if (!entry || entry.initialized) return;
    entry.module.init(this.gl);
    entry.initialized = true;
  }

  _tick() {
    if (!this._running) return;

    const t = this.clock.currentTime();
    const clip = this.findClipAtTime(t);

    if (clip) {
      const entry = this.effects[clip.effect];

      if (!entry?.initialized) {
        this.preWarm(clip.effect);
      }

      // Pre-warm next clip
      const next = this.getNextClip(clip);
      if (next) this.preWarm(next.effect);

      // Render
      if (entry?.initialized) {
        const localT = t - clip.start;
        const beat = this._getBeatPosition(t);
        entry.module.render(this.gl, localT, beat, clip.params ?? {});
      }

      this.activeClip = clip;
    }

    this._rafId = requestAnimationFrame(() => this._tick());
  }

  _getBeatPosition(t) {
    const { beatMap } = this.project;
    if (!beatMap?.beats?.length) return 0;

    const bpm = beatMap.track0BPM ?? beatMap.bpm ?? 125;
    const beatDuration = 60 / bpm;
    const barDuration = beatDuration * 4;
    return (t % barDuration) / barDuration;
  }

  destroy() {
    this.stop();
    for (const [, entry] of Object.entries(this.effects)) {
      if (entry.initialized && entry.module.destroy) {
        entry.module.destroy(this.gl);
      }
    }
  }
}
