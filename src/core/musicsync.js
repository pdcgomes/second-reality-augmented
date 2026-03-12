/**
 * Music sync — mapping between absolute demo time (seconds) and S3M player
 * position (musicIndex, position, row).
 *
 * Region boundaries are set from the original demo's music cue points —
 * the demo stops each S3M file partway through (it does NOT play all
 * patterns). Gaps between regions are silent transitions (BEGLOGO, JPLOGO).
 *
 * During live playback the authoritative time source is the S3M engine's
 * sample counter (ModPlayer.currentTime). The constant-BPM formula here
 * is only used for SEEKING (scrubbing to a time → approximate position).
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
 * Cue-aligned regions with absolute time boundaries from the original demo.
 * Gaps between regions represent silent transitions.
 *
 *   0.0–85.0   MUSIC0 positions 0–~10  (intro → beglogo)
 *   85.0–93.0   silence                 (BEGLOGO transition)
 *   93.0–600.0  MUSIC1 positions 0–~66  (glenz → jplogo)
 *   600.0–605.0 silence                 (JPLOGO transition)
 *   605.0–750.0 MUSIC0 positions 14–~32 (u2e → end)
 */
const MUSIC_REGIONS = [
  { music: 0, startPos: 0,  absStart: 0.0,   absEnd: 85.0,  bpm: 120, speed: 6 },
  { music: 1, startPos: 0,  absStart: 93.0,  absEnd: 600.0, bpm: 125, speed: 6 },
  { music: 0, startPos: 14, absStart: 605.0, absEnd: 750.0, bpm: 120, speed: 6 },
];

let _regionCache = null;

function buildRegions() {
  if (_regionCache) return _regionCache;

  const regions = MUSIC_REGIONS.map((r) => {
    const effectiveBpm = r.bpm * SPEED_GAIN[r.music];
    const msPerRow = (2500 / effectiveBpm) * r.speed;
    const durationMs = (r.absEnd - r.absStart) * 1000;
    const totalRows = Math.round(durationMs / msPerRow);
    const endPos = r.startPos + Math.ceil(totalRows / ROWS_PER_PATTERN);

    return {
      music: r.music,
      startPos: r.startPos,
      endPos,
      bpm: r.bpm,
      speed: r.speed,
      effectiveBpm,
      msPerRow,
      absStart: r.absStart,
      absEnd: r.absEnd,
      totalRows,
    };
  });

  _regionCache = regions;
  return regions;
}

/**
 * Convert absolute demo time (seconds) to { music, position, row, silent }.
 * `silent` is true when the time falls in a gap between music regions.
 * This is an approximation (assumes constant BPM); used for seeking.
 */
export function timeToMusicPos(seconds) {
  const regions = buildRegions();
  const t = Math.max(0, seconds);

  for (const r of regions) {
    if (t >= r.absStart && t < r.absEnd) {
      const elapsedMs = (t - r.absStart) * 1000;
      const totalRows = Math.round(elapsedMs / r.msPerRow);
      const position = r.startPos + Math.floor(totalRows / ROWS_PER_PATTERN);
      const row = totalRows % ROWS_PER_PATTERN;
      return { music: r.music, position, row, silent: false };
    }
  }

  // Gap between regions — no music plays
  for (let i = 0; i < regions.length - 1; i++) {
    if (t >= regions[i].absEnd && t < regions[i + 1].absStart) {
      return { music: -1, position: 0, row: 0, silent: true };
    }
  }

  // Past all regions — clamp to end of last region
  const last = regions[regions.length - 1];
  return { music: last.music, position: last.endPos - 1, row: ROWS_PER_PATTERN - 1, silent: false };
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
 * Get the music region active at a given absolute time, or null for gaps
 * and past-end times.
 */
export function getRegionAtTime(seconds) {
  const regions = buildRegions();
  for (const r of regions) {
    if (seconds >= r.absStart && seconds < r.absEnd) return r;
  }
  return null;
}
