/**
 * U2 3D Engine — self-contained port of Future Crew's VISU engine.
 *
 * Renders flat-shaded and Gouraud-shaded polygons into a 320×200 indexed
 * framebuffer using painter's algorithm, matching the original VGA Mode 13h
 * output pixel-for-pixel.
 *
 * Based on the JS port by covalichou and the original x86 ASM/C source
 * in the SecondReality repository (VISU/ folder, coded by PSI).
 */

const W = 320;
const H = 200;

const F_VISIBLE = 0x0001;
const F_2SIDE   = 0x0200;
const F_GOURAUD = 0x1000;
const F_SHADE32 = 0x0C00;
const F_DEFAULT = 0xf001;

const VF_UP    = 1;
const VF_DOWN  = 2;
const VF_LEFT  = 4;
const VF_RIGHT = 8;
const VF_NEAR  = 16;
const VF_FAR   = 32;

const LIGHT = [12118 / 16384, 10603 / 16384, 3030 / 16834];

// ── Byte helpers ─────────────────────────────────────────────────────

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function u16(buf, i) { return (buf[i]) | (buf[i + 1] << 8); }
function s16(buf, i) { let v = u16(buf, i); return v > 0x7fff ? v - 0x10000 : v; }
function u32(buf, i) { return (buf[i]) | (buf[i + 1] << 8) | (buf[i + 2] << 16) | ((buf[i + 3] << 24) >>> 0); }
function s32(buf, i) { return (buf[i]) | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24); }
function u24(buf, i) { return (buf[i]) | (buf[i + 1] << 8) | (buf[i + 2] << 16); }
function s8(buf, i) { let v = buf[i]; return v > 127 ? v - 256 : v; }

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ── FC object format loader ──────────────────────────────────────────

function loadObject(raw) {
  const str = new TextDecoder('ascii').decode(raw);
  const mapOff = new Map();
  const o = {
    flags: F_DEFAULT,
    r: new Float64Array(12),
    r0: new Float64Array(12),
    pl: [],
    name: '',
  };

  let d = 0;
  while (d < raw.length) {
    const d0 = d;
    d += 8;
    const chunk = str.substring(d0, d0 + 4);
    const len = u32(raw, d0 + 4);

    if (chunk === 'NAME') {
      o.name = str.substring(d, d + len);
    } else if (chunk === 'VERT') {
      const vnum = u16(raw, d); d += 4;
      o.v0 = new Array(vnum);
      o.v  = new Array(vnum);
      o.pv = new Array(vnum);
      for (let i = 0; i < vnum; i++) {
        o.v0[i] = {
          x: s32(raw, d) / 16384,
          y: s32(raw, d + 4) / 16384,
          z: s32(raw, d + 8) / 16384,
          NormalIndex: s16(raw, d + 12),
        };
        o.v[i] = {};
        o.pv[i] = {};
        d += 16;
      }
    } else if (chunk === 'NORM') {
      o.nnum  = u16(raw, d); d += 2;
      o.nnum1 = u16(raw, d); d += 2;
      o.n0 = new Array(o.nnum);
      o.n  = new Array(o.nnum);
      for (let i = 0; i < o.nnum; i++) {
        o.n0[i] = {
          x: s16(raw, d) / 16384,
          y: s16(raw, d + 2) / 16384,
          z: s16(raw, d + 4) / 16384,
        };
        o.n[i] = {};
        d += 8;
      }
    } else if (chunk === 'POLY') {
      d += 2;
      o.pd = [];
      while (d < d0 + len + 8) {
        const polyD0 = d - (d0 + 8);
        mapOff.set(polyD0, o.pd.length);
        const sides = raw[d]; d++;
        if (sides === 0) break;
        const flags = raw[d]; d++;
        const color = raw[d]; d += 2;
        const ni = u16(raw, d); d += 2;
        const verts = [];
        for (let s = 0; s < sides; s++) { verts.push(u16(raw, d)); d += 2; }
        o.pd.push({ flags, color, NormalIndex: ni, vertex: verts });
      }
    } else if (chunk === 'ORD0' || chunk === 'ORDE') {
      const plSize = u16(raw, d) - 2; d += 2;
      const pl = [];
      for (let i = 0; i < plSize; i++) { pl.push(u16(raw, d)); d += 2; }
      o.pl.push(pl);
    }
    d = d0 + len + 8;
  }

  for (const pl of o.pl) {
    for (let i = 1; i < pl.length; i++) {
      pl[i] = mapOff.get(pl[i]);
    }
  }
  return o;
}

// ── Engine factory ───────────────────────────────────────────────────

export function createU2Engine() {
  let co, order, cam;
  let animData, animPtr, animEnd;
  let fov = 40;
  let clipX = [0, 319], clipY = [25, 174], clipZ = [512, 9999999];
  let projXF, projYF;
  const projXO = 159, projYO = 99, aspect = 172 / 200;
  const fb = new Uint8Array(W * H);

  function setFov(f) {
    fov = f;
    let half = f / 2;
    if (half < 3) half = 3;
    if (half > 90) half = 90;
    projXF = (clipX[1] - projXO) / Math.tan(half * Math.PI / 180);
    projYF = projXF * aspect;
  }

  function init(sceneB64, objB64s, animB64) {
    animPtr = 0;
    animEnd = false;
    const scene = b64ToUint8(sceneB64);
    const objRaws = objB64s.map(b => b64ToUint8(b));
    animData = b64ToUint8(animB64);

    setFov(fov);

    let ip = u16(scene, 4);
    const conum = u16(scene, ip); ip += 2;
    co = new Array(conum);
    for (let c = 1; c < conum; c++) {
      const e = u16(scene, ip); ip += 2;
      co[c] = { o: loadObject(objRaws[e - 1]), index: e, on: 0 };
    }
    co[0] = { o: { r0: new Float64Array(12) } };
    cam = co[0].o.r0;

    return scene;
  }

  // ── Animation decoder ────────────────────────────────────────────

  function lsget(f) {
    switch (f & 3) {
      case 0: return 0;
      case 1: { const v = s8(animData, animPtr); animPtr++; return v; }
      case 2: { const v = s16(animData, animPtr); animPtr += 2; return v; }
      case 3: { const v = s32(animData, animPtr); animPtr += 4; return v; }
    }
    return 0;
  }

  function stepAnimation() {
    let onum = 0;
    while (true) {
      let a = animData[animPtr]; animPtr++;
      if (a === 0xff) {
        a = animData[animPtr]; animPtr++;
        if (a <= 0x7f) { setFov(a / 256 * 360); return; }
        if (a === 0xff) { animEnd = true; return; }
      }
      if ((a & 0xc0) === 0xc0) {
        onum = (a & 0x3f) << 4;
        a = animData[animPtr]; animPtr++;
      }
      onum = (onum & 0xff0) | (a & 0xf);
      switch (a & 0xc0) {
        case 0x80: co[onum].on = 1; break;
        case 0x40: co[onum].on = 0; break;
      }
      const r = co[onum].o.r0;
      let pf = 0;
      switch (a & 0x30) {
        case 0x10: pf = animData[animPtr]; animPtr++; break;
        case 0x20: pf = u16(animData, animPtr); animPtr += 2; break;
        case 0x30: pf = u24(animData, animPtr); animPtr += 3; break;
      }
      const factor = onum === 0 ? 1 : 128;
      r[9]  += lsget(pf) / factor;
      r[10] += lsget(pf >> 2) / factor;
      r[11] += lsget(pf >> 4) / factor;
      if (pf & 0x40) {
        for (let b = 0; b < 9; b++) if (pf & (0x80 << b)) r[b] += lsget(2) / 128;
      } else {
        for (let b = 0; b < 9; b++) if (pf & (0x80 << b)) r[b] += lsget(1) / 128;
      }
    }
  }

  // ── 3D math ──────────────────────────────────────────────────────

  function applyMatrix(dest, src, apply) {
    dest[0] = apply[0]*src[0] + apply[1]*src[3] + apply[2]*src[6];
    dest[1] = apply[0]*src[1] + apply[1]*src[4] + apply[2]*src[7];
    dest[2] = apply[0]*src[2] + apply[1]*src[5] + apply[2]*src[8];
    dest[3] = apply[3]*src[0] + apply[4]*src[3] + apply[5]*src[6];
    dest[4] = apply[3]*src[1] + apply[4]*src[4] + apply[5]*src[7];
    dest[5] = apply[3]*src[2] + apply[4]*src[5] + apply[5]*src[8];
    dest[6] = apply[6]*src[0] + apply[7]*src[3] + apply[8]*src[6];
    dest[7] = apply[6]*src[1] + apply[7]*src[4] + apply[8]*src[7];
    dest[8] = apply[6]*src[2] + apply[7]*src[5] + apply[8]*src[8];
    const tx = src[9]*apply[0] + src[10]*apply[1] + src[11]*apply[2];
    const ty = src[9]*apply[3] + src[10]*apply[4] + src[11]*apply[5];
    const tz = src[9]*apply[6] + src[10]*apply[7] + src[11]*apply[8];
    dest[9]  = tx + apply[9];
    dest[10] = ty + apply[10];
    dest[11] = tz + apply[11];
  }

  function singleZ(vi, vl, r) {
    return vl[vi].x * r[6] + vl[vi].y * r[7] + vl[vi].z * r[8] + r[11];
  }

  function rotateTranslate(dst, src, r) {
    for (let i = 0; i < src.length; i++) {
      const s = src[i];
      const d = dst[i];
      d.x = Math.round(s.x*r[0] + s.y*r[1] + s.z*r[2] + r[9]);
      d.y = Math.round(s.x*r[3] + s.y*r[4] + s.z*r[5] + r[10]);
      d.z = Math.round(s.x*r[6] + s.y*r[7] + s.z*r[8] + r[11]);
      d.NormalIndex = s.NormalIndex;
    }
  }

  function nrotate(num, dst, src, r) {
    for (let i = 0; i < num; i++) {
      const s = src[i], d = dst[i];
      d.x = s.x*r[0] + s.y*r[1] + s.z*r[2];
      d.y = s.x*r[3] + s.y*r[4] + s.z*r[5];
      d.z = s.x*r[6] + s.y*r[7] + s.z*r[8];
    }
  }

  function project(pv, v) {
    for (let i = 0; i < v.length; i++) {
      let cf = 0;
      const { x, y, z } = v[i];
      if (z < clipZ[0]) cf |= VF_NEAR;
      if (z > clipZ[1]) cf |= VF_FAR;
      const yp = (y * projYF / z) + projYO;
      if (yp < clipY[0]) cf |= VF_UP;
      if (yp > clipY[1]) cf |= VF_DOWN;
      const xp = (x * projXF / z) + projXO;
      if (xp < clipX[0]) cf |= VF_LEFT;
      if (xp > clipX[1]) cf |= VF_RIGHT;
      pv[i].x = Math.round(xp);
      pv[i].y = Math.round(yp);
      pv[i].clipping_flags = cf;
    }
  }

  // ── Lighting ─────────────────────────────────────────────────────

  function normalLight(n) {
    let d = (n.x * LIGHT[0] + n.y * LIGHT[1] + n.z * LIGHT[2]) / 16384 * 128;
    return clamp(d + 128, 0, 255);
  }

  function calcLight(flags, n) {
    let light = normalLight(n);
    let div = 16;
    const f = (flags & F_SHADE32) >> 10;
    if (f === 1) div = 32;
    else if (f === 2) div = 16;
    else if (f === 3) div = 8;
    light = light / div;
    light = clamp(light, 2, 256 / div - 1);
    return Math.floor(light);
  }

  // ── Polygon clipping ─────────────────────────────────────────────

  function clipPolyZ(pin) {
    const sides = pin.v2d.length;
    const out = { flags: pin.flags, color: pin.color, v2d: [] };
    let pu1 = pin.v3d[0], pv1 = pin.v2d[0];
    const zl = clipZ[0];
    let col1 = (pin.flags & F_GOURAUD) ? pv1.color : 0;
    let idx = 0;
    for (let i = 0; i < sides; i++) {
      idx++; if (idx === sides) idx = 0;
      const pu2 = pin.v3d[idx], pv2 = pin.v2d[idx];
      const z1 = pu1.z, z2 = pu2.z;
      const col2 = (pin.flags & F_GOURAUD) ? pv2.color : 0;
      if (z1 >= zl && z2 >= zl) {
        const nv = { x: pv2.x, y: pv2.y };
        if (pin.flags & F_GOURAUD) nv.color = col2;
        out.v2d.push(nv);
      } else if (z1 >= zl && z2 < zl) {
        const nx = pu1.x + (zl - z1) * (pu2.x - pu1.x) / (z2 - z1);
        const ny = pu1.y + (zl - z1) * (pu2.y - pu1.y) / (z2 - z1);
        const nv = { x: Math.round(nx * projXF / zl + projXO), y: Math.round(ny * projYF / zl + projYO) };
        if (pin.flags & F_GOURAUD) nv.color = Math.round(col1 + (zl - z1) * (col2 - col1) / (z2 - z1));
        out.v2d.push(nv);
      } else if (z1 < zl && z2 >= zl) {
        const nx = pu1.x + (zl - z1) * (pu2.x - pu1.x) / (z2 - z1);
        const ny = pu1.y + (zl - z1) * (pu2.y - pu1.y) / (z2 - z1);
        const nv = { x: Math.round(nx * projXF / zl) + projXO, y: Math.round(ny * projYF / zl) + projYO };
        if (pin.flags & F_GOURAUD) nv.color = Math.round(col1 + (zl - z1) * (col2 - col1) / (z2 - z1));
        out.v2d.push(nv);
        const nv2 = { x: pv2.x, y: pv2.y };
        if (pin.flags & F_GOURAUD) nv2.color = col2;
        out.v2d.push(nv2);
      }
      pu1 = pu2; pv1 = pv2;
      if (pin.flags & F_GOURAUD) col1 = col2;
    }
    return out;
  }

  function clipEdge(pin, axis, limit, lessOp) {
    const sides = pin.v2d.length;
    if (sides === 0) return pin;
    const out = { flags: pin.flags, color: pin.color, v2d: [] };
    let pv1 = pin.v2d[0];
    let col1 = (pin.flags & F_GOURAUD) ? pv1.color : 0;
    let idx = 0;
    for (let i = 0; i < sides; i++) {
      idx++; if (idx === sides) idx = 0;
      const pv2 = pin.v2d[idx];
      const a1 = pv1[axis], a2 = pv2[axis];
      const col2 = (pin.flags & F_GOURAUD) ? pv2.color : 0;
      const inside1 = lessOp ? a1 >= limit : a1 <= limit;
      const inside2 = lessOp ? a2 >= limit : a2 <= limit;
      if (inside1 && inside2) {
        const nv = { x: pv2.x, y: pv2.y };
        if (pin.flags & F_GOURAUD) nv.color = col2;
        out.v2d.push(nv);
      } else if (inside1 && !inside2) {
        const other = axis === 'y' ? 'x' : 'y';
        const nv = {};
        nv[axis] = limit;
        nv[other] = Math.round(pv1[other] + (limit - a1) * (pv2[other] - pv1[other]) / (a2 - a1));
        if (pin.flags & F_GOURAUD) nv.color = Math.round(col1 + (limit - a1) * (col2 - col1) / (a2 - a1));
        out.v2d.push(nv);
      } else if (!inside1 && inside2) {
        const other = axis === 'y' ? 'x' : 'y';
        const nv = {};
        nv[axis] = limit;
        nv[other] = Math.round(pv1[other] + (limit - a1) * (pv2[other] - pv1[other]) / (a2 - a1));
        if (pin.flags & F_GOURAUD) nv.color = Math.round(col1 + (limit - a1) * (col2 - col1) / (a2 - a1));
        out.v2d.push(nv);
        const nv2 = { x: pv2.x, y: pv2.y };
        if (pin.flags & F_GOURAUD) nv2.color = col2;
        out.v2d.push(nv2);
      }
      pv1 = pv2;
      if (pin.flags & F_GOURAUD) col1 = col2;
    }
    return out;
  }

  function clip2DFlags(poly) {
    let f = 0;
    for (const v of poly.v2d) {
      if (v.y < clipY[0]) f |= VF_UP;
      if (v.y > clipY[1]) f |= VF_DOWN;
      if (v.x < clipX[0]) f |= VF_LEFT;
      if (v.x > clipX[1]) f |= VF_RIGHT;
    }
    return f;
  }

  // ── Polygon rasterizer ───────────────────────────────────────────

  function findTopBottom(coords) {
    let topY = coords[0].y, topI = 0, botY = coords[0].y;
    for (let i = 1; i < coords.length; i++) {
      if (coords[i].y < topY) { topY = coords[i].y; topI = i; }
      else if (coords[i].y > botY) { botY = coords[i].y; }
    }
    return { topY, topI, botY };
  }

  function segCalc(coords, from, to, curY, dY) {
    const x1 = coords[from].x, x2 = coords[to].x, y2 = coords[to].y;
    const slope = (x2 - x1) / dY;
    return { slope, xStart: x2 - slope * (y2 - curY) };
  }

  function segCalcG(coords, from, to, curY, dY) {
    const s = segCalc(coords, from, to, curY, dY);
    const c1 = coords[from].color, c2 = coords[to].color, y2 = coords[to].y;
    s.cSlope = (c2 - c1) / dY;
    s.cStart = c2 - s.cSlope * (y2 - curY);
    return s;
  }

  function nextI(coords, i) { return (i + 1) % coords.length; }
  function prevI(coords, i) { return (i - 1 + coords.length) % coords.length; }

  function fillFlat(poly) {
    const coords = poly.v2d;
    if (coords.length === 0) return;
    const tb = findTopBottom(coords);
    if (tb.topY === tb.botY) return;

    const color = poly.color;
    let li = tb.topI, ri = tb.topI, curY = tb.topY;
    let dYL, dYR, prevLI, prevRI;

    while (true) {
      if (coords[li].y === curY) {
        do { prevLI = li; li = prevI(coords, li); } while (coords[li].y === coords[prevLI].y);
        dYL = coords[li].y - coords[prevLI].y;
      }
      if (dYL < 0) break;
      const remL = coords[li].y - curY;
      const sL = segCalc(coords, prevLI, li, curY, dYL);

      if (coords[ri].y === curY) {
        do { prevRI = ri; ri = nextI(coords, ri); } while (coords[ri].y === coords[prevRI].y);
        dYR = coords[ri].y - coords[prevRI].y;
      }
      if (dYR < 0) break;
      const remR = coords[ri].y - curY;
      const sR = segCalc(coords, prevRI, ri, curY, dYR);

      const h = Math.min(remL, remR);
      let x1 = sL.xStart, x2 = sR.xStart;
      let ym = curY * W;
      for (let y = 0; y < h; y++) {
        const xl = Math.round(Math.min(x1, x2));
        const xr = Math.round(Math.max(x1, x2));
        for (let x = xl; x <= xr; x++) fb[x + ym] = color;
        x1 += sL.slope; x2 += sR.slope; ym += W;
      }
      curY += h;
    }
  }

  function fillGouraud(poly) {
    const coords = poly.v2d;
    if (coords.length === 0) return;
    const tb = findTopBottom(coords);
    if (tb.topY === tb.botY) return;

    let li = tb.topI, ri = tb.topI, curY = tb.topY;
    let dYL, dYR, prevLI, prevRI;

    while (true) {
      if (coords[li].y === curY) {
        do { prevLI = li; li = prevI(coords, li); } while (coords[li].y === coords[prevLI].y);
        dYL = coords[li].y - coords[prevLI].y;
      }
      if (dYL < 0) break;
      const remL = coords[li].y - curY;
      const sL = segCalcG(coords, prevLI, li, curY, dYL);

      if (coords[ri].y === curY) {
        do { prevRI = ri; ri = nextI(coords, ri); } while (coords[ri].y === coords[prevRI].y);
        dYR = coords[ri].y - coords[prevRI].y;
      }
      if (dYR < 0) break;
      const remR = coords[ri].y - curY;
      const sR = segCalcG(coords, prevRI, ri, curY, dYR);

      const h = Math.min(remL, remR);
      let x1 = sL.xStart, x2 = sR.xStart;
      let c1 = sL.cStart, c2 = sR.cStart;
      let ym = curY * W;
      for (let y = 0; y < h; y++) {
        const xl = Math.round(Math.min(x1, x2));
        const xr = Math.round(Math.max(x1, x2));
        const chs = xl !== xr ? (c2 - c1) / (x2 - x1) : 0;
        let c = x2 < x1 ? c2 : c1;
        for (let x = xl; x < xr; x++) { fb[x + ym] = Math.round(c); c += chs; }
        x1 += sL.slope; x2 += sR.slope;
        c1 += sL.cSlope; c2 += sR.cSlope;
        ym += W;
      }
      curY += h;
    }
  }

  // ── Object rendering ─────────────────────────────────────────────

  function drawPolylist(l, d, v, pv, n, f) {
    if (!(f & F_VISIBLE)) return;
    for (let pi = 1; pi < l.length; pi++) {
      const si = d[l[pi]];
      if (!si) continue;
      const sides = si.vertex.length;
      let flags = (si.flags << 8) & (f | 0x0f00);
      const point = si.vertex;
      let color = si.color;
      const np = n[si.NormalIndex];
      const vp = v[point[0]];

      if (!(flags & F_2SIDE)) {
        if (np.x * vp.x + np.y * vp.y + np.z * vp.z >= 0) continue;
      }

      let cfAND = 0xff, cfOR = 0;
      for (let i = 0; i < sides; i++) {
        cfAND &= pv[point[i]].clipping_flags;
        cfOR  |= pv[point[i]].clipping_flags;
      }
      if (cfOR & VF_FAR) continue;

      if (!(flags & F_GOURAUD)) color += calcLight(flags, np);

      let poly = { flags, color, v2d: [] };
      for (let i = 0; i < sides; i++) {
        const pp = pv[point[i]];
        const nv = { x: pp.x, y: pp.y };
        if (flags & F_GOURAUD) {
          nv.color = color + calcLight(flags, n[v[point[i]].NormalIndex]);
        }
        poly.v2d.push(nv);
      }

      if (cfOR !== 0) {
        if (cfOR & VF_NEAR) {
          poly.v3d = [];
          for (let i = 0; i < sides; i++) {
            const pu = v[point[i]];
            poly.v3d.push({ x: pu.x, y: pu.y, z: pu.z });
          }
          poly = clipPolyZ(poly);
        }
        let f2 = clip2DFlags(poly);
        if (f2 & VF_DOWN)  poly = clipEdge(poly, 'y', clipY[1], false);
        if (f2 & VF_UP)    poly = clipEdge(poly, 'y', clipY[0], true);
        f2 = clip2DFlags(poly);
        if (f2 & VF_LEFT)  poly = clipEdge(poly, 'x', clipX[0], true);
        if (f2 & VF_RIGHT) poly = clipEdge(poly, 'x', clipX[1], false);
      }

      if (flags & F_GOURAUD) fillGouraud(poly);
      else fillFlat(poly);
    }
  }

  function drawObject(obj) {
    if (!(obj.flags & F_VISIBLE)) return;
    rotateTranslate(obj.v, obj.v0, obj.r);
    if (obj.flags & F_GOURAUD) nrotate(obj.nnum, obj.n, obj.n0, obj.r);
    else nrotate(obj.nnum1, obj.n, obj.n0, obj.r);
    project(obj.pv, obj.v);

    let bestOrd = 1, bestZ = obj.v[obj.pl[1][0]].z;
    for (let oi = 2; oi < obj.pl.length; oi++) {
      const z = obj.v[obj.pl[oi][0]].z;
      if (z < bestZ) { bestZ = z; bestOrd = oi; }
    }
    drawPolylist(obj.pl[bestOrd], obj.pd, obj.v, obj.pv, obj.n, obj.flags);
  }

  // ── Public interface ─────────────────────────────────────────────

  function calcMatrices() {
    order = [];
    for (let a = 1; a < co.length; a++) {
      if (!co[a].on) continue;
      order.push(a);
      const o = co[a].o;
      applyMatrix(o.r, o.r0, cam);
      co[a].dist = singleZ(o.pl[0][0], o.v0, o.r);
    }
  }

  function sortAndDraw() {
    // Painter's algorithm: draw farthest objects first
    order.sort((a, b) => co[b].dist - co[a].dist);
    for (const idx of order) drawObject(co[idx].o);
  }

  function renderFrame() {
    calcMatrices();
    sortAndDraw();
  }

  // ── Pre-baked animation snapshots ────────────────────────────────

  let snapshots = null;

  function snapshot() {
    const s = { fov, on: new Uint8Array(co.length), r0: [] };
    for (let c = 0; c < co.length; c++) {
      s.on[c] = c === 0 ? 0 : co[c].on;
      s.r0[c] = Float64Array.from(co[c].o.r0);
    }
    return s;
  }

  function restoreSnapshot(s) {
    setFov(s.fov);
    for (let c = 0; c < co.length; c++) {
      if (c > 0) co[c].on = s.on[c];
      co[c].o.r0.set(s.r0[c]);
    }
    cam = co[0].o.r0;
  }

  function bakeAnimation() {
    animPtr = 0;
    animEnd = false;
    setFov(40);
    for (let c = 0; c < co.length; c++) {
      co[c].o.r0.fill(0);
      if (c > 0) co[c].on = 0;
    }
    cam = co[0].o.r0;

    snapshots = [snapshot()];
    while (!animEnd) {
      stepAnimation();
      snapshots.push(snapshot());
    }
  }

  function seekFrame(n) {
    const idx = Math.max(0, Math.min(n, snapshots.length - 1));
    restoreSnapshot(snapshots[idx]);
  }

  return {
    init,
    bakeAnimation,
    seekFrame,
    renderFrame,
    get framebuffer() { return fb; },
    get totalFrames() { return snapshots ? snapshots.length : 0; },
    get width() { return W; },
    get height() { return H; },
    clipY,
  };
}
