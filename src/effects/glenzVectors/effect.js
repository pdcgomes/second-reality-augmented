/**
 * GLENZ_3D — Classic variant (Part 6)
 *
 * Two translucent Tetrakis hexahedra rendered via a software polygon
 * rasterizer into a 320×200 indexed framebuffer. Transparency is
 * achieved by OR-ing pixel color indices — the palette is carefully
 * constructed so OR-combined indices map to correct mixed colors.
 *
 * Phase 1 (frames 0–~800): Blue/white Glenz1 bounces on the
 *   checkerboard background from Part 5, with jelly deformation.
 * Phase 2 (frames ~800–end): Checkerboard fades, dark/bright red
 *   Glenz2 appears behind Glenz1. Both orbit with sinusoidal paths.
 *   Eventually both shrink and exit, final fade to black.
 *
 * Original code: GLENZ/MAIN.C (by PSI).
 */

import { createProgram, createFullscreenQuad, FULLSCREEN_VERT } from '../../core/webgl.js';
import { CHECKERBOARD_B64 } from '../glenzTransition/data.js';
import { G1_VERTS, G2_VERTS, G1_FACES, G2_FACES } from './data.js';

const W = 320, H = 200;
const FRAME_RATE = 70;
const PROJ_XMUL = 256, PROJ_YMUL = 213;
const PROJ_XADD = 160, PROJ_YADD = 130;
const DEG = Math.PI / 1800; // 1/10-degree to radians

const FRAG = `#version 300 es
precision highp float;
in vec2 vUV;
out vec4 fragColor;
uniform sampler2D uFrame;
void main() {
  fragColor = vec4(texture(uFrame, vec2(vUV.x, 1.0 - vUV.y)).rgb, 1.0);
}
`;

// ── Helpers ──────────────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── Polygon clipping (Sutherland-Hodgman) ───────────────────────

function clipTop(verts, yMin) {
  const n = verts.length;
  if (n === 0) return verts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const aIn = a.y >= yMin, bIn = b.y >= yMin;
    if (aIn && bIn) { out.push(b); }
    else if (aIn && !bIn) {
      const t = (yMin - a.y) / (b.y - a.y);
      out.push({ x: a.x + t * (b.x - a.x), y: yMin });
    } else if (!aIn && bIn) {
      const t = (yMin - a.y) / (b.y - a.y);
      out.push({ x: a.x + t * (b.x - a.x), y: yMin });
      out.push(b);
    }
  }
  return out;
}

function clipLeft(verts, xMin) {
  const n = verts.length;
  if (n === 0) return verts;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i], b = verts[(i + 1) % n];
    const aIn = a.x >= xMin, bIn = b.x >= xMin;
    if (aIn && bIn) { out.push(b); }
    else if (aIn && !bIn) {
      const t = (xMin - a.x) / (b.x - a.x);
      out.push({ x: xMin, y: a.y + t * (b.y - a.y) });
    } else if (!aIn && bIn) {
      const t = (xMin - a.x) / (b.x - a.x);
      out.push({ x: xMin, y: a.y + t * (b.y - a.y) });
      out.push(b);
    }
  }
  return out;
}

// ── Convex polygon scanline fill (OR mode) ──────────────────────

function fillConvexOR(fb, verts, color) {
  const n = verts.length;
  if (n < 3) return;

  let yMin = Infinity, yMax = -Infinity;
  for (let i = 0; i < n; i++) {
    if (verts[i].y < yMin) yMin = verts[i].y;
    if (verts[i].y > yMax) yMax = verts[i].y;
  }

  const yStart = Math.max(0, Math.ceil(yMin));
  const yEnd = Math.min(H - 1, Math.floor(yMax));

  for (let y = yStart; y <= yEnd; y++) {
    let xMin = W, xMax = -1;
    for (let i = 0; i < n; i++) {
      const a = verts[i], b = verts[(i + 1) % n];
      if ((a.y <= y && b.y >= y) || (b.y <= y && a.y >= y)) {
        const dy = b.y - a.y;
        if (dy === 0) {
          if (a.x < xMin) xMin = a.x;
          if (a.x > xMax) xMax = a.x;
          if (b.x < xMin) xMin = b.x;
          if (b.x > xMax) xMax = b.x;
        } else {
          const x = a.x + (y - a.y) * (b.x - a.x) / dy;
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
        }
      }
    }
    const x0 = Math.max(0, Math.round(xMin));
    const x1 = Math.min(W - 1, Math.round(xMax));
    const base = y * W;
    for (let x = x0; x < x1; x++) fb[base + x] |= color;
  }
}

// ── 3D Math ─────────────────────────────────────────────────────

function computeRotationMatrix(roty, rotx, rotz) {
  const rxs = Math.sin(rotx * DEG), rxc = Math.cos(rotx * DEG);
  const rys = Math.sin(roty * DEG), ryc = Math.cos(roty * DEG);
  const rzs = Math.sin(rotz * DEG), rzc = Math.cos(rotz * DEG);

  return [
    ryc * rzc - rxs * rys * rzs,    rxs * rys * rzc + ryc * rzs,    -rxc * rys,
    -rxc * rzs,                       rxc * rzc,                       rxs,
    rxs * ryc * rzs + rys * rzc,     rys * rzs - rxs * ryc * rzc,     rxc * ryc,
  ];
}

function transformVerts(srcVerts, mat, tx, ty, tz) {
  return srcVerts.map(([vx, vy, vz]) => ({
    x: mat[0] * vx + mat[1] * vy + mat[2] * vz + tx,
    y: mat[3] * vx + mat[4] * vy + mat[5] * vz + ty,
    z: mat[6] * vx + mat[7] * vy + mat[8] * vz + tz,
  }));
}

function project(v) {
  return { x: v.x * PROJ_XMUL / v.z + PROJ_XADD, y: v.y * PROJ_YMUL / v.z + PROJ_YADD };
}

function faceNormalZ(p0, p1, p2) {
  return (p0.x - p1.x) * (p0.y - p2.y) - (p0.y - p1.y) * (p0.x - p2.x);
}

// ── Animation state ─────────────────────────────────────────────

function createState() {
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

function initState(s, checkerPal) {
  for (let i = 0; i < 24; i++) s.bgPal[i] = checkerPal[i];
  s.vgaPal.fill(0);
  for (let i = 0; i < 24; i++) s.vgaPal[i] = s.bgPal[i];
}

function stepFrame(s, frame) {
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
  // Clear checkerboard from background
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

// ── Rendering ───────────────────────────────────────────────────

function renderGlenz1Face(fb, s, faceColor, projVerts, vi0, vi1, vi2) {
  const p0 = projVerts[vi0], p1 = projVerts[vi1], p2 = projVerts[vi2];
  const normal = faceNormalZ(p0, p1, p2);
  let color;

  if (normal < 0) {
    // Back face
    if (faceColor & 1) color = 4; // blue backside
    else return; // white backside = transparent
  } else {
    // Front face: compute shading and update palette
    let shade = s.lightshift === 9 ? normal / 128 : normal / 170;
    shade = clamp(shade, 0, 63);

    color = faceColor * 8;
    let r, g, b;
    if ((faceColor & 1) === 0) { r = g = b = shade; } // white
    else { r = 7; g = shade / 2; b = shade; } // blue

    for (let i = 0; i < 8; i++) {
      const idx = (color + i) * 3;
      s.vgaPal[idx]     = clamp(Math.floor(r + s.bgPal[i * 3] / 4), 0, 63);
      s.vgaPal[idx + 1] = clamp(Math.floor(g + s.bgPal[i * 3 + 1] / 4), 0, 63);
      s.vgaPal[idx + 2] = clamp(Math.floor(b + s.bgPal[i * 3 + 2] / 4), 0, 63);
    }
  }

  let verts = [
    { x: Math.floor(p0.x), y: Math.floor(p0.y) },
    { x: Math.floor(p1.x), y: Math.floor(p1.y) },
    { x: Math.floor(p2.x), y: Math.floor(p2.y) },
  ];
  verts = clipTop(verts, 0);
  if (verts.length < 3) return;
  fillConvexOR(fb, verts, color);
}

function renderGlenz2Face(fb, faceColor, projVerts, vi0, vi1, vi2) {
  const p0 = projVerts[vi0], p1 = projVerts[vi1], p2 = projVerts[vi2];
  const normal = faceNormalZ(p0, p1, p2);
  let color;

  if (normal >= 0) color = (faceColor >> 1) & 1;
  else color = faceColor;
  if (color === 0) return;

  let verts = [
    { x: Math.floor(p0.x), y: Math.floor(p0.y) },
    { x: Math.floor(p1.x), y: Math.floor(p1.y) },
    { x: Math.floor(p2.x), y: Math.floor(p2.y) },
  ];
  verts = clipTop(verts, 0);
  verts = clipLeft(verts, 0);
  if (verts.length < 3) return;
  fillConvexOR(fb, verts, color);
}

// ── Background (final checkerboard from Part 5) ─────────────────

function buildBackground(checkerRaw) {
  const bg = new Uint8Array(W * H);
  // Simulate bounce to settled state
  let vel = 0, pos = 0;
  for (;;) {
    vel++;
    pos += vel;
    if (pos > 48 * 16) {
      pos -= vel;
      vel = Math.trunc(-vel * 2 / 3);
      if (vel > -4 && vel < 4) break;
    }
  }
  const y = Math.floor(pos / 16);
  const y1 = Math.floor(130 + y / 2);
  const y2 = Math.floor(130 + y * 3 / 2);
  const b = y2 !== y1 ? 100 / (y2 - y1) : 0;
  for (let c = 0, ry = y1; ry < y2 && ry < H; ry++, c += b) {
    const srcRow = Math.floor(c);
    if (srcRow >= H) break;
    const s = 768 + 16 + srcRow * W;
    const d = ry * W;
    for (let x = 0; x < W; x++) bg[d + x] = checkerRaw[s + x];
  }
  return bg;
}

// ── WebGL plumbing ──────────────────────────────────────────────

let program = null, quad = null, uFrameLoc;
let frameTex = null;
let fb = null, rgba = null;
let checkerBg = null, checkerPal8 = null;

export default {
  label: 'glenzVectors',

  init(gl) {
    program = createProgram(gl, FULLSCREEN_VERT, FRAG);
    quad = createFullscreenQuad(gl);
    uFrameLoc = gl.getUniformLocation(program, 'uFrame');

    fb = new Uint8Array(W * H);
    rgba = new Uint8Array(W * H * 4);

    const checkerRaw = b64ToUint8(CHECKERBOARD_B64);
    checkerBg = buildBackground(checkerRaw);
    checkerPal8 = new Float64Array(24);
    for (let i = 0; i < 24; i++) checkerPal8[i] = checkerRaw[16 + i];

    frameTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  },

  render(gl, t, _beat, _params) {
    const floatFrame = t * FRAME_RATE;
    const intFrame = Math.floor(floatFrame);

    // Replay animation state from frame 0
    const s = createState();
    initState(s, checkerPal8);
    for (let f = 0; f <= intFrame; f++) stepFrame(s, f);

    const rx = (32 * floatFrame) % (3 * 3600);
    const ry = (7 * floatFrame) % (3 * 3600);

    // Draw background
    if (s.bgCleared) {
      fb.fill(0);
    } else {
      fb.set(checkerBg);
    }

    const zpos = 7500;

    // Render Glenz1
    if (s.g1sx > 4) {
      const mat1 = computeRotationMatrix(rx, ry, 0);
      const rotated1 = transformVerts(G1_VERTS, mat1, 0, 0, 0);

      const scaleMat1 = [s.g1sx * 64 / 32768, 0, 0, 0, s.g1sy * 64 / 32768, 0, 0, 0, s.g1sz * 64 / 32768];
      const world1 = transformVerts(
        rotated1.map(v => [v.x, v.y, v.z]),
        scaleMat1,
        s.g1tx, s.ypos + 1500 + s.g1ty, zpos + s.g1tz
      );

      if (intFrame < 800) {
        for (const v of world1) if (v.y > 1500) v.y = 1500;
      }

      const proj1 = world1.map(project);
      for (const [col, a, b, c] of G1_FACES) {
        renderGlenz1Face(fb, s, col, proj1, a, b, c);
      }
    }

    // Render Glenz2
    if (intFrame > 800 && s.g2s > 4) {
      const mat2 = computeRotationMatrix(
        (3600 - rx / 3) % (3 * 3600),
        (3600 - ry / 3) % (3 * 3600),
        0
      );
      const rotated2 = transformVerts(G2_VERTS, mat2, 0, 0, 0);

      const sf = s.g2s * 64 / 32768;
      const scaleMat2 = [sf, 0, 0, 0, sf, 0, 0, 0, sf];
      const world2 = transformVerts(
        rotated2.map(v => [v.x, v.y, v.z]),
        scaleMat2,
        s.g2tx, s.ypos + 1500 + s.g2ty, zpos + s.g2tz
      );

      const proj2 = world2.map(project);
      for (const [col, a, b, c] of G2_FACES) {
        renderGlenz2Face(fb, col, proj2, a, b, c);
      }
    }

    // Convert indexed framebuffer to RGBA via palette
    const k = 255 / 63;
    const rgba32 = new Uint32Array(rgba.buffer);
    for (let i = 0; i < W * H; i++) {
      const idx = fb[i];
      const r = Math.round(clamp(s.vgaPal[idx * 3], 0, 63) * k);
      const g = Math.round(clamp(s.vgaPal[idx * 3 + 1], 0, 63) * k);
      const b = Math.round(clamp(s.vgaPal[idx * 3 + 2], 0, 63) * k);
      rgba32[i] = (255 << 24) | (b << 16) | (g << 8) | r;
    }

    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, rgba);

    gl.useProgram(program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, frameTex);
    gl.uniform1i(uFrameLoc, 0);
    quad.draw();
  },

  destroy(gl) {
    if (program) gl.deleteProgram(program);
    if (quad) quad.destroy();
    if (frameTex) gl.deleteTexture(frameTex);
    program = null;
    quad = null;
    frameTex = null;
    fb = null;
    rgba = null;
    checkerBg = null;
    checkerPal8 = null;
  },
};
