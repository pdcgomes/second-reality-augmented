/**
 * Beat map query utilities.
 * Pure functions — no side effects, no dependencies.
 */

/**
 * Returns the 0.0–1.0 position within the current 4-beat bar at time t.
 * When populated beats[] exist, computes exact phase from beat timestamps.
 * Otherwise falls back to constant-BPM modulo.
 */
export function getBeatPosition(t, beatMap) {
  if (!beatMap) return 0;

  if (beatMap.beats?.length) {
    const idx = getCurrentBeatIndex(t, beatMap);
    const cur = beatMap.beats[idx];
    const next = beatMap.beats[idx + 1];
    if (next != null && next > cur) {
      const frac = Math.min(1, (t - cur) / (next - cur));
      return ((idx % 4) + frac) / 4;
    }
    return (idx % 4) / 4;
  }

  const bpm = beatMap.track0BPM ?? beatMap.bpm ?? 0;
  if (!bpm) return 0;
  const barDuration = (60 / bpm) * 4;
  return (t % barDuration) / barDuration;
}

/**
 * Returns the index of the current beat at time t.
 */
export function getCurrentBeatIndex(t, beatMap) {
  if (!beatMap?.beats?.length) return 0;
  let idx = 0;
  for (let i = 0; i < beatMap.beats.length; i++) {
    if (beatMap.beats[i] <= t) idx = i;
    else break;
  }
  return idx;
}

/**
 * Returns the index of the current bar at time t.
 */
export function getCurrentBarIndex(t, beatMap) {
  if (!beatMap?.bars?.length) return 0;
  let idx = 0;
  for (let i = 0; i < beatMap.bars.length; i++) {
    if (beatMap.bars[i] <= t) idx = i;
    else break;
  }
  return idx;
}

/**
 * Returns the nearest beat timestamp to time t.
 */
export function nearestBeat(t, beatMap) {
  if (!beatMap?.beats?.length) return 0;
  let best = beatMap.beats[0];
  let bestDist = Math.abs(t - best);
  for (const beat of beatMap.beats) {
    const dist = Math.abs(t - beat);
    if (dist < bestDist) {
      best = beat;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Returns the name of the active cue at time t, or null.
 * A cue is "active" if t is within `window` seconds after the cue timestamp.
 */
export function getActiveCue(t, cues, window = 0.1) {
  if (!cues) return null;
  for (const [name, timestamp] of Object.entries(cues)) {
    if (t >= timestamp && t < timestamp + window) {
      return name;
    }
  }
  return null;
}

/**
 * Generate beat and bar timestamps from S3M time-map data.
 *
 * Walks the rowTimes at the musical beat interval for each region
 * (4 rows/beat for speed 6, 8 rows/beat for speed 3) and converts
 * S3M-local row times to absolute demo seconds.
 *
 * @param {Array} timeMaps  [map0, map1] from buildTimeMap()
 * @param {Array} regions   from getRegions(), each with:
 *   { music, startPos, startRow, endPos, endRow, bpm, speed,
 *     absStart, s3mStart, msPerRow }
 * @returns {{ beats: number[], bars: number[] }}
 */
export function generateBeatsFromTimeMaps(timeMaps, regions) {
  const beats = [];
  const bars = [];

  for (const region of regions) {
    const tm = timeMaps[region.music];
    if (!tm) continue;

    const { rowTimes } = tm;
    const beatDurationMs = 60000 / region.bpm;
    const rowsPerBeat = Math.round(beatDurationMs / region.msPerRow);

    const startAbsRow = region.startPos * 64 + region.startRow;
    const endAbsRow = region.endPos * 64 + region.endRow;

    let beatIdx = 0;
    for (let absRow = startAbsRow; absRow < endAbsRow; absRow += rowsPerBeat) {
      const pos = Math.floor(absRow / 64);
      const row = absRow % 64;
      const s3mTime = rowTimes[pos * 64 + row];
      if (s3mTime < 0) continue;

      const absTime = region.absStart + (s3mTime - region.s3mStart);
      if (absTime < region.absStart || absTime > region.absEnd) continue;

      beats.push(absTime);
      if (beatIdx % 4 === 0) bars.push(absTime);
      beatIdx++;
    }
  }

  return { beats, bars };
}
