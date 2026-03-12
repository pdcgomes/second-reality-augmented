import { describe, it, expect } from 'vitest';
import { Clock } from '../core/clock.js';

function mockAudioCtx(time = 0) {
  return { get currentTime() { return time; }, _setTime(t) { time = t; } };
}

describe('Clock', () => {
  it('starts paused at 0', () => {
    const clock = new Clock();
    expect(clock.playing).toBe(false);
    expect(clock.currentTime()).toBe(0);
  });

  it('returns paused time when not playing', () => {
    const clock = new Clock();
    clock.seek(10.5);
    expect(clock.currentTime()).toBe(10.5);
    expect(clock.playing).toBe(false);
  });

  it('seek clamps to 0', () => {
    const clock = new Clock();
    clock.seek(-5);
    expect(clock.currentTime()).toBe(0);
  });

  it('play/pause cycle preserves time', () => {
    let acTime = 0;
    const audioCtx = { currentTime: acTime, state: 'running', resume: () => {} };
    const clock = new Clock(audioCtx);
    clock.seek(5);
    clock.play();
    expect(clock.playing).toBe(true);
    clock.pause();
    expect(clock.playing).toBe(false);
    expect(clock.currentTime()).toBe(5);
  });

  it('computes time relative to AudioContext.currentTime', () => {
    let acTime = 100;
    const audioCtx = { get currentTime() { return acTime; }, state: 'running', resume: () => {} };
    const clock = new Clock(audioCtx);

    clock.seek(0);
    clock.play();
    // At audioCtx.currentTime=100, demo time should be 0
    expect(clock.currentTime()).toBeCloseTo(0, 5);

    // Simulate 5 seconds of audio time passing
    acTime = 105;
    expect(clock.currentTime()).toBeCloseTo(5, 5);
  });

  it('seek while playing recalculates offset', () => {
    let acTime = 50;
    const audioCtx = { get currentTime() { return acTime; }, state: 'running', resume: () => {} };
    const clock = new Clock(audioCtx);

    clock.play();
    acTime = 55;
    expect(clock.currentTime()).toBeCloseTo(5, 5);

    clock.seek(20);
    expect(clock.currentTime()).toBeCloseTo(20, 5);

    acTime = 58;
    expect(clock.currentTime()).toBeCloseTo(23, 5);
  });

  it('pause freezes time', () => {
    let acTime = 0;
    const audioCtx = { get currentTime() { return acTime; }, state: 'running', resume: () => {} };
    const clock = new Clock(audioCtx);

    clock.play();
    acTime = 10;
    clock.pause();
    expect(clock.currentTime()).toBeCloseTo(10, 5);

    acTime = 999;
    expect(clock.currentTime()).toBeCloseTo(10, 5);
  });
});
