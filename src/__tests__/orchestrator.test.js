import { describe, it, expect, vi } from 'vitest';
import { Orchestrator } from '../core/orchestrator.js';

const PROJECT = {
  clips: [
    { id: 'c1', effect: 'alpha', start: 0, end: 10, params: {} },
    { id: 'c2', effect: 'beta', start: 10, end: 20, params: {} },
    { id: 'c3', effect: 'gamma', start: 20, end: 30, params: {} },
  ],
  beatMap: { bpm: 120, beats: [0, 0.5, 1.0], bars: [0, 2.0] },
  cues: {},
};

function mockClock(time = 0) {
  return {
    currentTime: () => time,
    play: vi.fn(),
    pause: vi.fn(),
  };
}

function mockGl() {
  return {};
}

describe('Orchestrator', () => {
  it('finds the correct clip at a given time', () => {
    const orch = new Orchestrator(PROJECT, mockGl(), mockClock());
    expect(orch.findClipAtTime(0)).toBe(PROJECT.clips[0]);
    expect(orch.findClipAtTime(5)).toBe(PROJECT.clips[0]);
    expect(orch.findClipAtTime(10)).toBe(PROJECT.clips[1]);
    expect(orch.findClipAtTime(15)).toBe(PROJECT.clips[1]);
    expect(orch.findClipAtTime(25)).toBe(PROJECT.clips[2]);
  });

  it('returns null for time outside all clips', () => {
    const orch = new Orchestrator(PROJECT, mockGl(), mockClock());
    expect(orch.findClipAtTime(-1)).toBeNull();
    expect(orch.findClipAtTime(30)).toBeNull();
    expect(orch.findClipAtTime(100)).toBeNull();
  });

  it('gets the next clip', () => {
    const orch = new Orchestrator(PROJECT, mockGl(), mockClock());
    expect(orch.getNextClip(PROJECT.clips[0])).toBe(PROJECT.clips[1]);
    expect(orch.getNextClip(PROJECT.clips[1])).toBe(PROJECT.clips[2]);
    expect(orch.getNextClip(PROJECT.clips[2])).toBeNull();
  });

  it('pre-warms an effect by calling init()', () => {
    const gl = mockGl();
    const orch = new Orchestrator(PROJECT, gl, mockClock());
    const mockEffect = { init: vi.fn(), render: vi.fn(), destroy: vi.fn() };

    orch.registerEffect('alpha', mockEffect);
    expect(orch.effects['alpha'].initialized).toBe(false);

    orch.preWarm('alpha');
    expect(mockEffect.init).toHaveBeenCalledWith(gl);
    expect(orch.effects['alpha'].initialized).toBe(true);
  });

  it('does not re-init an already warmed effect', () => {
    const orch = new Orchestrator(PROJECT, mockGl(), mockClock());
    const mockEffect = { init: vi.fn(), render: vi.fn(), destroy: vi.fn() };

    orch.registerEffect('alpha', mockEffect);
    orch.preWarm('alpha');
    orch.preWarm('alpha');
    expect(mockEffect.init).toHaveBeenCalledTimes(1);
  });

  it('destroy cleans up all initialized effects', () => {
    const gl = mockGl();
    const orch = new Orchestrator(PROJECT, gl, mockClock());
    const mockA = { init: vi.fn(), render: vi.fn(), destroy: vi.fn() };
    const mockB = { init: vi.fn(), render: vi.fn(), destroy: vi.fn() };

    orch.registerEffect('alpha', mockA);
    orch.registerEffect('beta', mockB);
    orch.preWarm('alpha');

    orch.destroy();
    expect(mockA.destroy).toHaveBeenCalledWith(gl);
    expect(mockB.destroy).not.toHaveBeenCalled();
  });
});
