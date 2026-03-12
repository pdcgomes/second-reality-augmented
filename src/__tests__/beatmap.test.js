import { describe, it, expect } from 'vitest';
import {
  getBeatPosition,
  getCurrentBeatIndex,
  getCurrentBarIndex,
  nearestBeat,
  getActiveCue,
} from '../core/beatmap.js';

const BEAT_MAP = {
  bpm: 120,
  beats: [0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0],
  bars: [0.0, 2.0, 4.0],
};

describe('getBeatPosition', () => {
  it('returns 0 at bar boundary', () => {
    expect(getBeatPosition(0, BEAT_MAP)).toBeCloseTo(0, 5);
  });

  it('returns 0.5 at half-bar', () => {
    // 120 BPM → beat = 0.5s → bar = 2.0s → half-bar at 1.0s
    expect(getBeatPosition(1.0, BEAT_MAP)).toBeCloseTo(0.5, 5);
  });

  it('wraps around at bar boundaries', () => {
    // bar = 2.0s, so 2.0s should wrap to ~0
    expect(getBeatPosition(2.0, BEAT_MAP)).toBeCloseTo(0, 5);
  });

  it('returns 0 for empty beatMap', () => {
    expect(getBeatPosition(5, { beats: [] })).toBe(0);
    expect(getBeatPosition(5, null)).toBe(0);
  });
});

describe('getCurrentBeatIndex', () => {
  it('returns 0 at the start', () => {
    expect(getCurrentBeatIndex(0, BEAT_MAP)).toBe(0);
  });

  it('returns correct index mid-song', () => {
    expect(getCurrentBeatIndex(1.2, BEAT_MAP)).toBe(2);
  });

  it('returns last beat for time past all beats', () => {
    expect(getCurrentBeatIndex(100, BEAT_MAP)).toBe(8);
  });
});

describe('getCurrentBarIndex', () => {
  it('returns 0 at the start', () => {
    expect(getCurrentBarIndex(0, BEAT_MAP)).toBe(0);
  });

  it('returns 1 during second bar', () => {
    expect(getCurrentBarIndex(2.5, BEAT_MAP)).toBe(1);
  });
});

describe('nearestBeat', () => {
  it('snaps to exact beat', () => {
    expect(nearestBeat(1.0, BEAT_MAP)).toBe(1.0);
  });

  it('snaps to closest beat', () => {
    expect(nearestBeat(0.3, BEAT_MAP)).toBe(0.5);
  });

  it('snaps to first beat if before all', () => {
    expect(nearestBeat(-1, BEAT_MAP)).toBe(0.0);
  });
});

describe('getActiveCue', () => {
  const cues = { drop: 10.0, buildup: 20.0 };

  it('returns null when no cue active', () => {
    expect(getActiveCue(5, cues)).toBeNull();
  });

  it('returns cue name at exact timestamp', () => {
    expect(getActiveCue(10.0, cues)).toBe('drop');
  });

  it('returns cue name within window', () => {
    expect(getActiveCue(10.05, cues, 0.1)).toBe('drop');
  });

  it('returns null after window passes', () => {
    expect(getActiveCue(10.2, cues, 0.1)).toBeNull();
  });
});
