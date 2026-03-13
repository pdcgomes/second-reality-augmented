/**
 * Shared animation / physics for DOTS (Part 18).
 *
 * Both the classic (software renderer) and remastered (GPU shader)
 * variants import from here to guarantee frame-perfect choreography sync.
 *
 * The simulation replays from frame 0 on every call so that arbitrary
 * scrubbing works with no persistent state.
 */

export const FRAME_RATE = 70;
export const MAXDOTS = 512;

function isin(deg) { return Math.sin(Math.PI * deg / 512) * 255; }
function icos(deg) { return Math.cos(Math.PI * deg / 512) * 255; }

/**
 * Replay the full dot simulation up to `targetFrame` and return the
 * resulting dot positions, rotation state, and simulation frame counter.
 *
 * Returns:
 *   positions  — Float32Array(MAXDOTS * 3)  world-space (x, y, z)
 *   rotSin     — current rotation sine   (pre-scaled by 64)
 *   rotCos     — current rotation cosine  (pre-scaled by 64)
 *   frame      — clamped simulation frame (0–2450)
 *   fade       — 0..1 overall brightness  (handles fade-in, flash, fade-out)
 */
export function simulateDots(targetFrame) {
  const dots = new Array(MAXDOTS);
  for (let i = 0; i < MAXDOTS; i++) dots[i] = { x: 0, y: 2560 - 22000, z: 0, yadd: 0 };

  let dropper = 22000, rot = 0, rots = 0, rota = -64, j = 0, f = 0, frame = 0;
  let grav = 3, gravd = 13, gravitybottom = 8105;
  let rotsin = 0, rotcos = 0;

  let seed = 12345;
  function rand() { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed >> 16) & 0x7fff; }

  const replayFrames = Math.min(targetFrame - 128, 2450);
  for (let fr = 0; fr < replayFrames; fr++) {
    if (frame < 2450) frame++;
    if (frame === 500) f = 0;
    j++; j %= MAXDOTS;

    if (frame < 500) {
      dots[j].x = isin(f * 11) * 40;
      dots[j].y = icos(f * 13) * 10 - dropper;
      dots[j].z = isin(f * 17) * 40;
      dots[j].yadd = 0;
    } else if (frame < 900) {
      dots[j].x = icos(f * 15) * 55;
      dots[j].y = dropper;
      dots[j].z = isin(f * 15) * 55;
      dots[j].yadd = -260;
    } else if (frame < 1700) {
      const a = Math.floor(256 * Math.sin(frame / 1024 * 2 * Math.PI) / 8);
      dots[j].x = icos(f * 66) * a;
      dots[j].y = 8000;
      dots[j].z = isin(f * 66) * a;
      dots[j].yadd = -300;
    } else if (frame < 2360) {
      dots[j].x = (rand() % 0x7fff) - 16384;
      dots[j].y = 8000 - (rand() % 0x7fff) / 2;
      dots[j].z = (rand() % 0x7fff) - 16384;
      dots[j].yadd = 0;
      if (frame > 1900 && !(frame & 31) && grav > 0) grav--;
    }

    if (dropper > 4000) dropper -= 100;
    rotcos = icos(rot) * 64; rotsin = isin(rot) * 64;
    rots += 2;
    if (frame > 1900) { rot += rota / 64; rota--; }
    else rot = isin(rots);
    f++;

    const gravity = grav;
    for (let i = 0; i < MAXDOTS; i++) {
      const d = dots[i];
      const bp = ((d.z * rotcos - d.x * rotsin) / 0x10000) + 9000;
      const a2 = (d.z * rotsin + d.x * rotcos) / 0x100;
      const x = (a2 + a2 / 8) / bp + 160;
      if (x <= 319) {
        const sy = (0x80000 / bp) + 100;
        if (sy <= 199) {
          d.yadd += gravity;
          let b = d.y + d.yadd;
          if (b >= gravitybottom) {
            d.yadd = Math.floor((-d.yadd * gravd) / 0x10);
            b += d.yadd;
          }
          d.y = b;
        }
      }
    }
  }

  rotcos = icos(rot) * 64;
  rotsin = isin(rot) * 64;

  const positions = new Float32Array(MAXDOTS * 3);
  for (let i = 0; i < MAXDOTS; i++) {
    positions[i * 3] = dots[i].x;
    positions[i * 3 + 1] = dots[i].y;
    positions[i * 3 + 2] = dots[i].z;
  }

  let fade = 1.0;
  if (targetFrame < 128) {
    fade = targetFrame / 128;
  } else if (frame >= 2360 && frame < 2400) {
    fade = 1.0; // flash-in handled per-frame by palette in classic; remastered uses uniform
  } else if (frame >= 2400) {
    const a = frame - 2400;
    fade = Math.max(0, 1.0 - a / 32);
  }

  let whiteFlash = 0;
  if (frame >= 2360 && frame < 2400) {
    whiteFlash = (frame - 2360) / 40;
  } else if (frame >= 2400) {
    whiteFlash = Math.max(0, 1.0 - (frame - 2400) / 32);
  }

  return { dots, positions, rotSin: rotsin, rotCos: rotcos, frame, fade, whiteFlash };
}
