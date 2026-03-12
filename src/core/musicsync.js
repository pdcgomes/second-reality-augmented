/**
 * Music sync — mapping between absolute demo time (seconds) and S3M player
 * position (musicIndex, position, row).
 *
 * Sync points and region boundaries are taken from the original
 * second-reality-js MusicPlayer.js dis_sync_table. Regions are defined by
 * S3M positions, NOT fixed wall-clock cues:
 *
 *   MUSIC0  0:0  → 13:42  (MUSIC0_STOP)
 *   MUSIC1  0:0  → 84:0   (MUSIC1_STOP)   — starts immediately after MUSIC0
 *   MUSIC0  14:5 → 39:0   (CREDITS_END)    — resumes immediately after MUSIC1
 *
 * After time maps are loaded (from dry-running the S3M engine), all
 * position↔time conversions are exact. Before that, a constant-BPM
 * fallback is used.
 */

const ROWS_PER_PATTERN = 64;

/**
 * Speed correction factors from second-reality-js MusicPlayer.js:
 *   MUSIC_SPEED_GAIN = [1.00370, 1.00231]
 */
export const SPEED_GAIN = [1.00370, 1.00231];

// ── Authoritative sync table from second-reality-js ────────────────────
// Each entry: [musicIndex, position, row, name]
const SYNC_TABLE = [
  [0,  0,  0, 'DEMO_START'],
  [0,  2,  2, 'ALKU_TEXT1'],
  [0,  3,  2, 'ALKU_TEXT2'],
  [0,  3, 53, 'ALKU_TEXT3'],
  [0,  4, 48, 'ALKU_LANDSCAPE'],
  [0,  6,  2, 'ALKU_TEXT4'],
  [0,  7,  2, 'ALKU_TEXT5'],
  [0,  8,  2, 'ALKU_TEXT6'],
  [0,  9,  2, 'ALKU_TEXT7'],
  [0, 10, 60, 'ALKU_EXIT'],
  [0, 11, 48, 'U2A_START'],
  [0, 13,  1, 'PAM_START'],
  [0, 13, 42, 'MUSIC0_STOP'],
  [1,  2, 46, 'CHECKERBOARD_FALL'],
  [1,  4, 28, 'GLENZ_START'],
  [1, 17,  0, 'TECHNO_CIRCLES2_START'],
  [1, 21, 48, 'TECHNO_CIRCLES2_END'],
  [1, 21, 52, 'TECHNO_BARS_TRANSITION'],
  [1, 22,  0, 'TECHNO_BAR1'],
  [1, 22,  8, 'TECHNO_BAR2'],
  [1, 22, 16, 'TECHNO_BAR3'],
  [1, 22, 24, 'TECHNO_BAR4'],
  [1, 22, 31, 'TECHNO_BAR_FINAL_FLASH'],
  [1, 30, 50, 'TECHNO_TROLL'],
  [1, 32, 56, 'TECHNO_TROLL_CRT'],
  [1, 35,  5, 'FOREST_START'],
  [1, 35, 20, 'FOREST_SCROLL'],
  [1, 38, 50, 'FOREST_FADEOUT'],
  [1, 39,  0, 'LENS_TRANSITION_START'],
  [1, 40, 30, 'LENS_BOUNCE'],
  [1, 44,  2, 'LENS_ROTO'],
  [1, 52,  0, 'PLZ_START'],
  [1, 53, 56, 'PLZ_DROP1'],
  [1, 55, 56, 'PLZ_DROP2'],
  [1, 56, 56, 'PLZ_DROP3'],
  [1, 57, 15, 'PLZ_CUBE_START'],
  [1, 64, 63, 'PLZ_CUBE_END'],
  [1, 74, 63, 'DOTS_END'],
  [1, 75,  5, 'WATER_START'],
  [1, 76, 18, 'WATER_SCROLL'],
  [1, 78, 52, 'WATER_FADEOUT'],
  [1, 79,  0, 'COMAN_START'],
  [1, 82, 32, 'COMAN_SCROLL_DOWN'],
  [1, 84,  0, 'MUSIC1_STOP'],
  [0, 14,  5, 'U2E_START'],
  [0, 15,  0, 'U2E_ANIM'],
  [0, 21, 19, 'U2E_FINALFADE'],
  [0, 21, 27, 'U2E_END'],
  [0, 23,  0, 'CREDITS_START'],
  [0, 39,  0, 'CREDITS_END'],
];

/**
 * Region boundaries defined by S3M positions from the sync table.
 * Music switches are instantaneous — no silence gaps.
 */
const REGION_DEFS = [
  { music: 0, startPos: 0,  startRow: 0,  endPos: 13, endRow: 42, bpm: 120, speed: 6 },
  { music: 1, startPos: 0,  startRow: 0,  endPos: 84, endRow: 0,  bpm: 125, speed: 6 },
  { music: 0, startPos: 14, startRow: 5,  endPos: 39, endRow: 0,  bpm: 120, speed: 6 },
];

// ── Time-map state ─────────────────────────────────────────────────────

let _timeMaps = [null, null];
let _sortedEntries = [null, null];
let _regions = null;
let _syncTimes = null;

function _buildSortedEntries(tm) {
  const entries = [];
  for (let pos = 0; pos < 256; pos++) {
    for (let row = 0; row < 64; row++) {
      const t = tm.rowTimes[pos * 64 + row];
      if (t >= 0) entries.push({ position: pos, row, time: t });
    }
  }
  entries.sort((a, b) => a.time - b.time);
  return entries;
}

function _binarySearchTime(entries, targetTime) {
  if (!entries || entries.length === 0) return null;
  let lo = 0, hi = entries.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (entries[mid].time <= targetTime) lo = mid;
    else hi = mid - 1;
  }
  return entries[lo];
}

function _s3mTime(mi, pos, row) {
  const tm = _timeMaps[mi];
  if (!tm) return -1;
  return tm.rowTimes[pos * 64 + row];
}

function _buildRegions() {
  if (_regions) return;

  let absOffset = 0;
  _regions = [];

  for (const rd of REGION_DEFS) {
    const mi = rd.music;
    const s3mStart = _s3mTime(mi, rd.startPos, rd.startRow);
    const s3mEnd = _s3mTime(mi, rd.endPos, rd.endRow);

    let duration;
    if (s3mStart >= 0 && s3mEnd >= 0) {
      duration = s3mEnd - s3mStart;
    } else {
      const eBpm = rd.bpm * SPEED_GAIN[mi];
      const msPerRow = (2500 / eBpm) * rd.speed;
      const startRows = rd.startPos * 64 + rd.startRow;
      const endRows = rd.endPos * 64 + rd.endRow;
      duration = (endRows - startRows) * msPerRow / 1000;
    }

    _regions.push({
      music: mi,
      startPos: rd.startPos,
      startRow: rd.startRow,
      endPos: rd.endPos,
      endRow: rd.endRow,
      bpm: rd.bpm,
      speed: rd.speed,
      absStart: absOffset,
      absEnd: absOffset + duration,
      s3mStart: s3mStart >= 0 ? s3mStart : 0,
      s3mEnd: s3mEnd >= 0 ? s3mEnd : duration,
      effectiveBpm: rd.bpm * SPEED_GAIN[mi],
      msPerRow: (2500 / (rd.bpm * SPEED_GAIN[mi])) * rd.speed,
    });

    absOffset += duration;
  }

  // Build absolute times for all sync points
  _syncTimes = new Map();
  for (const [mi, pos, row, name] of SYNC_TABLE) {
    const s3mT = _s3mTime(mi, pos, row);
    if (s3mT < 0) continue;

    for (const r of _regions) {
      if (r.music !== mi) continue;
      if (s3mT >= r.s3mStart && s3mT <= r.s3mEnd) {
        _syncTimes.set(name, r.absStart + (s3mT - r.s3mStart));
        break;
      }
    }
  }

  console.log('Music regions (from time maps):');
  for (const r of _regions) {
    console.log(
      `  MUSIC${r.music} [${r.absStart.toFixed(2)}\u2013${r.absEnd.toFixed(2)}s] ` +
      `pos ${r.startPos}:${r.startRow}\u2192${r.endPos}:${r.endRow}`
    );
  }
  console.log('Sync point absolute times:');
  for (const [name, t] of _syncTimes) {
    console.log(`  ${name}: ${t.toFixed(2)}s`);
  }
}

/**
 * Provide exact position↔time lookup tables built by buildTimeMap().
 * Called from modplayer.js after loading both S3M files.
 */
export function setTimeMaps(maps) {
  _timeMaps = [maps[0] || null, maps[1] || null];
  _sortedEntries = [null, null];
  _regions = null;
  _syncTimes = null;

  for (let mi = 0; mi < 2; mi++) {
    if (_timeMaps[mi]) {
      _sortedEntries[mi] = _buildSortedEntries(_timeMaps[mi]);
    }
  }

  _buildRegions();
}

function _getRegions() {
  if (!_regions) _buildRegions();
  return _regions;
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Get the absolute demo time for a named sync point (e.g. 'PAM_START').
 */
export function getSyncTime(name) {
  if (!_syncTimes) _buildRegions();
  return _syncTimes ? (_syncTimes.get(name) ?? null) : null;
}

/**
 * Get all sync point times as a Map<name, seconds>.
 */
export function getAllSyncTimes() {
  if (!_syncTimes) _buildRegions();
  return _syncTimes || new Map();
}

/**
 * Convert absolute demo time (seconds) to { music, position, row, silent }.
 * `silent` is always false (no gaps in the original demo).
 */
export function timeToMusicPos(seconds) {
  const regions = _getRegions();
  const t = Math.max(0, seconds);

  for (const r of regions) {
    if (t >= r.absStart && t < r.absEnd) {
      const localTime = t - r.absStart;
      const mi = r.music;
      const se = _sortedEntries[mi];
      const tm = _timeMaps[mi];

      if (se && tm) {
        const s3mTargetTime = r.s3mStart + localTime;
        const entry = _binarySearchTime(se, s3mTargetTime);
        if (entry) {
          return { music: mi, position: entry.position, row: entry.row, silent: false };
        }
      }

      // Fallback: constant-BPM formula
      const rowsFromStart = Math.round(localTime * 1000 / r.msPerRow);
      const absRow = r.startPos * 64 + r.startRow + rowsFromStart;
      return {
        music: mi,
        position: Math.floor(absRow / ROWS_PER_PATTERN),
        row: absRow % ROWS_PER_PATTERN,
        silent: false,
      };
    }
  }

  // Past all regions
  const last = regions[regions.length - 1];
  if (last) {
    return { music: last.music, position: last.endPos, row: last.endRow, silent: false };
  }
  return { music: 0, position: 0, row: 0, silent: false };
}

/**
 * Convert { music, position, row } to absolute demo time (seconds).
 */
export function musicPosToTime(music, position, row) {
  if (row === undefined) row = 0;
  const regions = _getRegions();
  const s3mT = _s3mTime(music, position, row);

  if (s3mT >= 0) {
    for (const r of regions) {
      if (r.music !== music) continue;
      if (s3mT >= r.s3mStart && s3mT <= r.s3mEnd) {
        return r.absStart + (s3mT - r.s3mStart);
      }
    }
  }

  // Fallback: constant-BPM formula
  for (const r of regions) {
    if (r.music !== music) continue;
    const posRow = position * 64 + row;
    const rStart = r.startPos * 64 + r.startRow;
    const rEnd = r.endPos * 64 + r.endRow;
    if (posRow >= rStart && posRow <= rEnd) {
      return r.absStart + (posRow - rStart) * r.msPerRow / 1000;
    }
  }

  return 0;
}

/**
 * Get the total demo duration in seconds.
 */
export function getTotalDuration() {
  const regions = _getRegions();
  return regions.length > 0 ? regions[regions.length - 1].absEnd : 0;
}

/**
 * Get the music region active at a given absolute time, or null if past end.
 */
export function getRegionAtTime(seconds) {
  const regions = _getRegions();
  for (const r of regions) {
    if (seconds >= r.absStart && seconds < r.absEnd) return r;
  }
  return null;
}
