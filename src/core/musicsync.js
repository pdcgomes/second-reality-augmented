/**
 * Music sync — bidirectional mapping between absolute demo time (seconds)
 * and S3M player position (musicIndex, position, row).
 *
 * The original Second Reality uses two S3M files:
 *   MUSIC0: plays positions 0–13 (intro through beglogo)
 *   MUSIC1: plays positions 0–84 (glenz through jplogo)
 *   MUSIC0: resumes at position 14 (u2e through end)
 *
 * Time calculation: msPerRow = (2500 / bpm) * speed
 * At constant speed/tempo (which is approximate but close enough):
 *   MUSIC0 at 120 BPM, speed 6 → 125ms/row, 8.0s/pattern
 *   MUSIC1 at 125 BPM, speed 6 → 120ms/row, 7.68s/pattern
 */

const ROWS_PER_PATTERN = 64;

const MUSIC_REGIONS = [
  { music: 0, startPos: 0,  endPos: 14, bpm: 120, speed: 6 },
  { music: 1, startPos: 0,  endPos: 85, bpm: 125, speed: 6 },
  { music: 0, startPos: 14, endPos: 40, bpm: 120, speed: 6 },
];

let _regionCache = null;

function buildRegions() {
  if (_regionCache) return _regionCache;

  const regions = [];
  let absTime = 0;

  for (const r of MUSIC_REGIONS) {
    const msPerRow = (2500 / r.bpm) * r.speed;
    const totalRows = (r.endPos - r.startPos) * ROWS_PER_PATTERN;
    const duration = (totalRows * msPerRow) / 1000;

    regions.push({
      music: r.music,
      startPos: r.startPos,
      endPos: r.endPos,
      bpm: r.bpm,
      speed: r.speed,
      msPerRow,
      absStart: absTime,
      absEnd: absTime + duration,
      totalRows,
    });

    absTime += duration;
  }

  _regionCache = regions;
  return regions;
}

/**
 * Convert absolute demo time (seconds) to { music, position, row }.
 */
export function timeToMusicPos(seconds) {
  const regions = buildRegions();
  const t = Math.max(0, seconds);

  for (const r of regions) {
    if (t >= r.absStart && t < r.absEnd) {
      const elapsed = t - r.absStart;
      const totalRows = Math.round((elapsed * 1000) / r.msPerRow);
      const position = r.startPos + Math.floor(totalRows / ROWS_PER_PATTERN);
      const row = totalRows % ROWS_PER_PATTERN;
      return { music: r.music, position, row };
    }
  }

  // Past all regions — clamp to end of last region
  const last = regions[regions.length - 1];
  return { music: last.music, position: last.endPos - 1, row: ROWS_PER_PATTERN - 1 };
}

/**
 * Convert { music, position, row } to absolute demo time (seconds).
 */
export function musicPosToTime(music, position, row = 0) {
  const regions = buildRegions();

  for (const r of regions) {
    if (r.music === music && position >= r.startPos && position < r.endPos) {
      const rowsFromRegionStart = (position - r.startPos) * ROWS_PER_PATTERN + row;
      return r.absStart + (rowsFromRegionStart * r.msPerRow) / 1000;
    }
  }

  return 0;
}

/**
 * Get the total demo duration in seconds based on all music regions.
 */
export function getTotalDuration() {
  const regions = buildRegions();
  return regions[regions.length - 1].absEnd;
}

/**
 * Get the music region active at a given absolute time.
 */
export function getRegionAtTime(seconds) {
  const regions = buildRegions();
  for (const r of regions) {
    if (seconds >= r.absStart && seconds < r.absEnd) return r;
  }
  return regions[regions.length - 1];
}
