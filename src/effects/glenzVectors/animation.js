/**
 * Shared animation state machine for GLENZ_3D (Part 6).
 *
 * Both the classic (software rasterizer) and remastered (GPU shader)
 * variants import from here to guarantee frame-perfect choreography sync.
 *
 * The state is replayed from frame 0 on every render call so that
 * arbitrary scrubbing is O(N_frames) with no persistent state.
 */

export const FRAME_RATE = 70;
export const DEG = Math.PI / 1800; // 1/10-degree to radians

export function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export function createState() {
  return {
    rx: 0, ry: 0,
    ypos: -9000, yposa: 0,
    boingm: 6, boingd: 7,
    jello: 0, jelloa: 0,
    g1sx: 120, g1sy: 120, g1sz: 120,
    g2s: 0,
    g1tx: 0, g1ty: 0, g1tz: 0,
    g2tx: 0, g2ty: 0, g2tz: 0,
    lightshift: 9,
    bgPal: new Float64Array(24),
    vgaPal: new Float64Array(768),
    bgCleared: false,
  };
}

export function initState(s, checkerPal) {
  for (let i = 0; i < 24; i++) s.bgPal[i] = checkerPal[i];
  s.vgaPal.fill(0);
  for (let i = 0; i < 24; i++) s.vgaPal[i] = s.bgPal[i];
}

export function stepFrame(s, frame) {
  // Phase 1 bounce (frames 0–799)
  if (frame < 800) {
    if (frame < 710) {
      s.yposa += 31;
      s.ypos += s.yposa / 40;
      if (s.ypos > -300) {
        s.ypos -= s.yposa / 40;
        s.yposa = -s.yposa * s.boingm / s.boingd;
        s.boingm += 2;
        s.boingd++;
      }
      if (s.ypos > -900 && s.yposa > 0) {
        s.jello = (s.ypos + 900) * 5 / 3;
        s.jelloa = 0;
      }
    } else {
      if (s.ypos > -2800) s.ypos -= 16;
      else if (s.ypos < -2800) s.ypos += 16;
    }
    s.g1sy = s.g1sx = 120 + s.jello / 30;
    s.g1sz = 120 - s.jello / 30;
    const prev = s.jello;
    s.jello += s.jelloa;
    if ((prev < 0 && s.jello > 0) || (prev > 0 && s.jello < 0)) s.jelloa = s.jelloa * 5 / 6;
    s.jelloa -= s.jello / 20;
  }

  // Glenz1 translation (frames 900+)
  if (frame > 900) {
    const a = frame - 900;
    let b = Math.min(a, 50);
    s.g1tx = Math.sin(a * 3 / 1024 * 2 * Math.PI) * 255 * b / 10;
    s.g1ty = Math.sin(a * 5 / 1024 * 2 * Math.PI) * 255 * b / 10;
    s.g1tz = (Math.sin(a * 4 / 1024 * 2 * Math.PI) * 255 / 2 + 128) * b / 16;
  }

  // Glenz1 exit (frames 1800+)
  if (frame > 1800) {
    let b = 1800 - frame;
    if (b < -99) b = -99;
    s.g1ty -= b * b / 2;
    if (frame > 2009) {
      if (s.g1sx > 0) s.g1sx -= 1;
      if (s.g1sy > 0) s.g1sy -= 1;
      if (s.g1sz > 0) s.g1sz -= 1;
    }
  }

  // Glenz2 scale
  if (frame > 800 && frame <= 890) s.g2s += 2;
  if (frame > 2009) {
    if (s.g2s > 0) s.g2s -= 1;
  } else if (frame > 2189) {
    if (s.g2s > 0) s.g2s -= 8;
    if (s.g2s < 0) s.g2s = 0;
  }
  if (s.g2s > s.g1sx) s.lightshift = 10;

  // Glenz2 translation
  if (frame > 1800) {
    const a = frame - 1800 + 64;
    s.g2tx = -Math.sin(a * 6 / 1024 * 2 * Math.PI) * 255 * a / 40;
    s.g2ty = -Math.sin(a * 7 / 1024 * 2 * Math.PI) * 255 * a / 40;
    s.g2tz = (Math.sin(a * 8 / 1024 * 2 * Math.PI) * 255 + 128) * a / 40;
  } else if (frame > 900) {
    const a = frame - 900;
    s.g2tx = -Math.sin(a * 6 / 1024 * 2 * Math.PI) * 255;
    s.g2ty = -Math.sin(a * 7 / 1024 * 2 * Math.PI) * 255;
    s.g2tz = Math.sin(a * 8 / 1024 * 2 * Math.PI) * 255 + 128;
  }

  // Palette: checkerboard fade (frames 700–764)
  if (frame > 700 && frame < 765) {
    const b = Math.max(0, 764 - frame);
    for (let i = 0; i < 24; i++) s.vgaPal[i] = Math.floor(s.bgPal[i] * b / 64);
  }
  if (frame === 765) s.bgCleared = true;
  // Palette: prepare for Glenz2 mixing
  if (frame === 790) {
    for (let a = 0; a < 8; a++) {
      let r = 0;
      if (a & 1) r += 10;
      if (a & 2) r += 30;
      if (a & 4) r += 20;
      r = clamp(r, 0, 63);
      s.bgPal[a * 3] = s.vgaPal[a * 3] = r;
      s.bgPal[a * 3 + 1] = s.vgaPal[a * 3 + 1] = 0;
      s.bgPal[a * 3 + 2] = s.vgaPal[a * 3 + 2] = 0;
    }
  }
  // Final fade (frames 2069+)
  if (frame > 2069) {
    const b = Math.max(0, 2069 + 64 - frame);
    for (let i = 0; i < 24; i++) s.vgaPal[i] = Math.floor(s.bgPal[i] * b / 64);
  }
}

export function computeRotationMatrix(roty, rotx, rotz) {
  const rxs = Math.sin(rotx * DEG), rxc = Math.cos(rotx * DEG);
  const rys = Math.sin(roty * DEG), ryc = Math.cos(roty * DEG);
  const rzs = Math.sin(rotz * DEG), rzc = Math.cos(rotz * DEG);

  return [
    ryc * rzc - rxs * rys * rzs,    rxs * rys * rzc + ryc * rzs,    -rxc * rys,
    -rxc * rzs,                       rxc * rzc,                       rxs,
    rxs * ryc * rzs + rys * rzc,     rys * rzs - rxs * ryc * rzc,     rxc * ryc,
  ];
}
