import { describe, it, expect } from 'vitest';
import {
  getBeatPosition,
  getCurrentBeatIndex,
  getCurrentBarIndex,
  nearestBeat,
  getActiveCue,
  generateBeatsFromTimeMaps,
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
    // beat index 2 at t=1.0, fraction ~0 → (2 + 0) / 4 = 0.5
    expect(getBeatPosition(1.0, BEAT_MAP)).toBeCloseTo(0.5, 5);
  });

  it('wraps around at bar boundaries', () => {
    // beat index 4 at t=2.0 → 4 % 4 = 0 → 0/4 = 0
    expect(getBeatPosition(2.0, BEAT_MAP)).toBeCloseTo(0, 5);
  });

  it('returns 0 for null beatMap', () => {
    expect(getBeatPosition(5, null)).toBe(0);
  });

  it('uses BPM fallback when beats array is empty', () => {
    const bpmOnly = { track0BPM: 120, beats: [], bars: [] };
    // 120 BPM → bar = 2.0s → at t=1.0s position should be 0.5
    expect(getBeatPosition(1.0, bpmOnly)).toBeCloseTo(0.5, 5);
  });

  it('returns 0 when no BPM and no beats', () => {
    expect(getBeatPosition(5, { beats: [] })).toBe(0);
  });

  it('interpolates between beats', () => {
    // At t=0.25, between beat 0 (0.0) and beat 1 (0.5):
    // idx=0, frac=0.5, result = (0 + 0.5) / 4 = 0.125
    expect(getBeatPosition(0.25, BEAT_MAP)).toBeCloseTo(0.125, 5);
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

describe('generateBeatsFromTimeMaps', () => {
  function makeTimeMap(bpm, speed, numPatterns) {
    const rowTimes = new Float64Array(256 * 64);
    for (let i = 0; i < rowTimes.length; i++) rowTimes[i] = -1;
    const msPerRow = (2500 / bpm) * speed;
    for (let p = 0; p < numPatterns; p++) {
      for (let r = 0; r < 64; r++) {
        rowTimes[p * 64 + r] = (p * 64 + r) * msPerRow / 1000;
      }
    }
    return { rowTimes, syncs: [], totalDuration: numPatterns * 64 * msPerRow / 1000 };
  }

  it('generates beats at correct row intervals for speed 6', () => {
    const tm = makeTimeMap(120, 6, 4);
    const regions = [{
      music: 0, startPos: 0, startRow: 0, endPos: 4, endRow: 0,
      bpm: 120, speed: 6, absStart: 0, absEnd: tm.totalDuration,
      s3mStart: 0, msPerRow: (2500 / 120) * 6,
    }];
    const { beats, bars } = generateBeatsFromTimeMaps([tm, null], regions);
    expect(beats.length).toBeGreaterThan(0);

    // 120 BPM at speed 6 → 4 rows/beat → beat spacing ≈ 0.5s
    const spacing = beats[1] - beats[0];
    expect(spacing).toBeCloseTo(0.5, 1);
  });

  it('generates beats at correct row intervals for speed 3', () => {
    const tm = makeTimeMap(130, 3, 8);
    const regions = [{
      music: 1, startPos: 0, startRow: 0, endPos: 8, endRow: 0,
      bpm: 130, speed: 3, absStart: 0, absEnd: tm.totalDuration,
      s3mStart: 0, msPerRow: (2500 / 130) * 3,
    }];
    const { beats, bars } = generateBeatsFromTimeMaps([null, tm], regions);
    expect(beats.length).toBeGreaterThan(0);

    // 130 BPM at speed 3 → 8 rows/beat → spacing ≈ 60/130 ≈ 0.4615s
    const spacing = beats[1] - beats[0];
    expect(spacing).toBeCloseTo(60 / 130, 2);
  });

  it('generates bars every 4 beats', () => {
    const tm = makeTimeMap(120, 6, 4);
    const regions = [{
      music: 0, startPos: 0, startRow: 0, endPos: 4, endRow: 0,
      bpm: 120, speed: 6, absStart: 0, absEnd: tm.totalDuration,
      s3mStart: 0, msPerRow: (2500 / 120) * 6,
    }];
    const { beats, bars } = generateBeatsFromTimeMaps([tm, null], regions);
    expect(bars.length).toBeGreaterThan(0);
    expect(bars[0]).toBe(beats[0]);
    if (beats.length >= 5) {
      expect(bars[1]).toBe(beats[4]);
    }
  });

  it('applies absStart offset for non-zero region starts', () => {
    const tm = makeTimeMap(120, 6, 4);
    const offset = 100;
    const regions = [{
      music: 0, startPos: 0, startRow: 0, endPos: 4, endRow: 0,
      bpm: 120, speed: 6, absStart: offset, absEnd: offset + tm.totalDuration,
      s3mStart: 0, msPerRow: (2500 / 120) * 6,
    }];
    const { beats } = generateBeatsFromTimeMaps([tm, null], regions);
    expect(beats[0]).toBeCloseTo(offset, 5);
  });

  it('returns empty arrays when no time maps available', () => {
    const regions = [{
      music: 0, startPos: 0, startRow: 0, endPos: 4, endRow: 0,
      bpm: 120, speed: 6, absStart: 0, absEnd: 10,
      s3mStart: 0, msPerRow: (2500 / 120) * 6,
    }];
    const { beats, bars } = generateBeatsFromTimeMaps([null, null], regions);
    expect(beats).toEqual([]);
    expect(bars).toEqual([]);
  });
});
