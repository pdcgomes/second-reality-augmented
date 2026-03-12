import { describe, it, expect } from 'vitest';
import { validateProject } from '../core/project.js';

const VALID_PROJECT = {
  clips: [
    { id: 'c1', effect: 'plasma', start: 0, end: 10, params: {} },
    { id: 'c2', effect: 'tunnel', start: 10, end: 20, params: {} },
  ],
  beatMap: {
    beats: [0, 0.5, 1.0, 1.5],
    bars: [0, 2.0],
  },
};

describe('validateProject', () => {
  it('accepts a valid project', () => {
    expect(validateProject(VALID_PROJECT)).toEqual([]);
  });

  it('rejects null', () => {
    const errors = validateProject(null);
    expect(errors).toContain('Project must be a JSON object');
  });

  it('rejects missing clips', () => {
    const errors = validateProject({ beatMap: { beats: [], bars: [] } });
    expect(errors).toContain('Missing required field: clips');
  });

  it('rejects missing beatMap', () => {
    const errors = validateProject({ clips: [] });
    expect(errors).toContain('Missing required field: beatMap');
  });

  it('rejects non-array clips', () => {
    const errors = validateProject({ clips: 'not-array', beatMap: { beats: [], bars: [] } });
    expect(errors).toContain('clips must be an array');
  });

  it('rejects clip missing required fields', () => {
    const errors = validateProject({
      clips: [{ id: 'c1' }],
      beatMap: { beats: [], bars: [] },
    });
    expect(errors.some((e) => e.includes('missing required field "effect"'))).toBe(true);
    expect(errors.some((e) => e.includes('missing required field "start"'))).toBe(true);
    expect(errors.some((e) => e.includes('missing required field "end"'))).toBe(true);
  });

  it('rejects clip with end <= start', () => {
    const errors = validateProject({
      clips: [{ id: 'c1', effect: 'x', start: 10, end: 5 }],
      beatMap: { beats: [], bars: [] },
    });
    expect(errors.some((e) => e.includes('end must be greater than start'))).toBe(true);
  });

  it('rejects beatMap with non-array beats', () => {
    const errors = validateProject({
      clips: [],
      beatMap: { beats: 'nope', bars: [] },
    });
    expect(errors).toContain('beatMap.beats must be an array');
  });
});
