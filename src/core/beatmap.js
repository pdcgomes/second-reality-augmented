/**
 * Beat map query utilities.
 * Pure functions — no side effects, no dependencies.
 */

/**
 * Returns the 0.0–1.0 position within the current bar at time t.
 */
export function getBeatPosition(t, beatMap) {
  if (!beatMap?.beats?.length) return 0;
  const bpm = beatMap.track0BPM ?? beatMap.bpm ?? 125;
  const beatDuration = 60 / bpm;
  const barDuration = beatDuration * 4;
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
