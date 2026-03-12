/**
 * Music sync — approximate mapping between absolute demo time (seconds)
 * and S3M player position (musicIndex, position, row).
 *
 * Used for SEEKING only — scrubbing to a time and finding the approximate
 * S3M position. During live playback the authoritative time source is the
 * S3M engine's actual sample count (see ModPlayer.currentTime), so the
 * constant-BPM approximation here doesn't cause audible drift.
 *
 * The original Second Reality uses two S3M files played back-to-back:
 *   MUSIC0: positions 0–13  (intro → beglogo)
 *   MUSIC1: positions 0–84  (glenz → jplogo)
 *   MUSIC0: positions 14–39 (u2e → end)
 *
 * Approximate time per row: msPerRow = (2500 / (bpm * speedGain)) * speed
 */

const ROWS_PER_PATTERN = 64;

/**
 * Speed correction factors the S3M engine applies to BPM during playback.
 * Exported so modplayer.js can set them on the raw player instances.
 */
export const SPEED_GAIN = [1.00370, 1.00231];

/**
 * Position boundaries for automatic music switching during playback.
 * When the S3M player's position reaches endPos for the current music,
 * the tick switches to the next music file.
 */
export const REGION_SWITCH = [
  { music: 0, endPos: 14, nextMusic: 1, nextPos: 0 },
  { music: 1, endPos: 85, nextMusic: 0, nextPos: 14 },
];

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
    const effectiveBpm = r.bpm * SPEED_GAIN[r.music];
    const msPerRow = (2500 / effectiveBpm) * r.speed;
    const totalRows = (r.endPos - r.startPos) * ROWS_PER_PATTERN;
    const duration = (totalRows * msPerRow) / 1000;

    regions.push({
      music: r.music,
      startPos: r.startPos,
      endPos: r.endPos,
      bpm: r.bpm,
      speed: r.speed,
      effectiveBpm,
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
 * This is an approximation (assumes constant BPM); used for seeking.
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
 * Approximation — used for seek offset estimation.
 */
export function musicPosToTime(music, position, row = 0) {
  const regions = buildRegions();

  for (const r of regions) {
    if (r.music === music && position >= r.startPos && position < r.endPos) {
      const rowsFromRegionStart = (position - r.startPos) * ROWS_PER_PATTERN + row;
      return r.absStart + (rowsFromRegionStart * r.msPerRow) / 1000;
    }
  }

  // Position overshot — find the closest matching region and clamp
  let best = null;
  for (const r of regions) {
    if (r.music === music && position >= r.startPos) {
      if (!best || r.startPos > best.startPos) best = r;
    }
  }
  if (best) {
    const rowsFromRegionStart = (position - best.startPos) * ROWS_PER_PATTERN + row;
    const extrapolated = best.absStart + (rowsFromRegionStart * best.msPerRow) / 1000;
    return Math.min(extrapolated, best.absEnd);
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
 * Get the music region active at a given absolute time, or null if past end.
 */
export function getRegionAtTime(seconds) {
  const regions = buildRegions();
  for (const r of regions) {
    if (seconds >= r.absStart && seconds < r.absEnd) return r;
  }
  return null;
}
