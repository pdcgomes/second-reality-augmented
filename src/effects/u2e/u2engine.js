/**
 * U2 3D Engine — self-contained port of the Future Crew U2 engine.
 *
 * Provides scene loading, animation decoding, 3D transform pipeline,
 * polygon clipping, flat and Gouraud shaded polygon filling,
 * all rendering into a supplied indexed framebuffer.
 */

const W = 320;

const F_DEFAULT  = 0xf001;
const F_VISIBLE  = 0x0001;
const F_2SIDE    = 0x0200;
const F_GOURAUD  = 0x1000;
const F_SHADE32  = 0x0C00;

const VF_UP    = 1;
const VF_DOWN  = 2;
const VF_LEFT  = 4;
const VF_RIGHT = 8;
const VF_NEAR  = 16;
const VF_FAR   = 32;

const SCENE_LIGHT = [12118 / 16384, 10603 / 16384, 3030 / 16834];

// --- Binary helpers ---

function u8(buf, i) { return buf[i]; }
function s8(buf, i) { const v = buf[i]; return v & 0x80 ? -((~v) & 0xFF) - 1 : v; }
function u16(buf, i) { return buf[i] | (buf[i + 1] << 8); }
function s16(buf, i) { const v = buf[i] | (buf[i + 1] << 8); return v & 0x8000 ? -((~v) & 0xFFFF) - 1 : v; }
function u24(buf, i) { return buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16); }
function u32(buf, i) { return (buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24)) >>> 0; }
function s32(buf, i) { const v = buf[i] | (buf[i + 1] << 8) | (buf[i + 2] << 16) | (buf[i + 3] << 24); return v; }

function b64ToUint8(b64) {
  const bin = atob(b64);
  const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return a;
}

function clip(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// --- Engine state ---

export function createU2Engine() {
  let co = {};
  let order = [];
  let camera, cam;
  let anim_pointer = 0;
  let animation_end = false;
  let SceneAnimData;
  let fb;

  let ClippingX = [0, 319];
  let ClippingY = [25, 175];
  let ClippingZ = [512, 9999999];

  let Projection2DXFactor, Projection2DYFactor;
  const Projection2DXOffset = 159;
  const Projection2DYOffset = 99;
  const Projection2DXYAspectRatio = 172 / 200;

  let fov = 40.0;

  function vid_cameraangle(fov_deg) {
    let half = fov_deg / 2;
    if (half < 3) half = 3;
    if (half > 90) half = 90;
    Projection2DXFactor = (ClippingX[1] - Projection2DXOffset) / Math.tan(half * Math.PI / 180);
    Projection2DYFactor = Projection2DXFactor * Projection2DXYAspectRatio;
  }

  function reset() {
    anim_pointer = 0;
    animation_end = false;
    co = {};
    order = [];
    cam = null;
    camera = null;
  }

  // --- Object loader ---

  function vis_loadobject(raw) {
    const str = new TextDecoder('ascii').decode(raw);
    const map_offset_index = new Map();
    const o = {
      flags: F_DEFAULT,
      r: new Array(12).fill(0),
      r0: new Array(12).fill(0),
      pl: [],
    };

    let d = 0;
    let polylist_size = 0;
    while (d < raw.length) {
      const d0 = d;
      d += 8;
      const chunkname = str.substring(d0, d0 + 4);
      const chunklength = u32(raw, d0 + 4);

      if (chunkname === 'NAME') {
        o.name = str.substring(d, d + chunklength);
      } else if (chunkname === 'VERT') {
        const vnum = u16(raw, d); d += 4;
        o.v0 = new Array(vnum);
        o.v = new Array(vnum);
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
      } else if (chunkname === 'NORM') {
        o.nnum = u16(raw, d); d += 2;
        o.nnum1 = u16(raw, d); d += 2;
        o.n0 = new Array(o.nnum);
        o.n = new Array(o.nnum);
        for (let i = 0; i < o.nnum; i++) {
          o.n0[i] = {
            x: s16(raw, d) / 16384,
            y: s16(raw, d + 2) / 16384,
            z: s16(raw, d + 4) / 16384,
          };
          o.n[i] = {};
          d += 8;
        }
      } else if (chunkname === 'POLY') {
        d += 2;
        o.pd = [];
        while (d < d0 + chunklength + 8) {
          const poly = {};
          map_offset_index.set(d - (d0 + 8), o.pd.length);
          const sides = raw[d]; d++;
          if (sides === 0) break;
          poly.flags = raw[d]; d++;
          poly.color = raw[d]; d += 2;
          poly.NormalIndex = u16(raw, d); d += 2;
          poly.vertex = [];
          for (let s = 0; s < sides; s++) {
            poly.vertex.push(u16(raw, d)); d += 2;
          }
          o.pd.push(poly);
        }
      } else if (chunkname === 'ORD0' || chunkname === 'ORDE') {
        polylist_size = u16(raw, d) - 2; d += 2;
        const polylist = [];
        for (let i = 0; i < polylist_size; i++) {
          polylist.push(u16(raw, d)); d += 2;
        }
        o.pl.push(polylist);
      }
      d = d0 + chunklength + 8;
    }

    for (let plindex = 0; plindex < o.pl.length; plindex++) {
      const polylist = o.pl[plindex];
      for (let i = 1; i < polylist_size; i++) {
        polylist[i] = map_offset_index.get(polylist[i]);
      }
    }
    return o;
  }

  // --- Data loading ---

  function loadData(sceneB64, objectB64Array, animB64) {
    vid_cameraangle(fov);

    const scene0 = b64ToUint8(sceneB64);
    const objectRawData = objectB64Array.map(b => b64ToUint8(b));
    SceneAnimData = b64ToUint8(animB64);

    let ip = u16(scene0, 4);
    const conum = u16(scene0, ip); ip += 2;
    co = new Array(conum);
    for (let c = 1; c < conum; c++) {
      const e = u16(scene0, ip); ip += 2;
      co[c] = {};
      co[c].o = vis_loadobject(objectRawData[e - 1]);
      co[c].index = e;
      co[c].on = 0;
    }

    co[0] = { o: { r0: new Array(12).fill(0) } };
    camera = co[0].o;
    cam = co[0].o.r0;

    const palette = new Uint8Array(768);
    for (let i = 0; i < 768; i++) palette[i] = scene0[16 + i];
    palette[255 * 3] = palette[255 * 3 + 1] = palette[255 * 3 + 2] = 0;
    palette[252 * 3] = palette[252 * 3 + 1] = palette[252 * 3 + 2] = 0;
    palette[253 * 3] = palette[253 * 3 + 1] = palette[253 * 3 + 2] = 63;
    palette[254 * 3] = palette[254 * 3 + 1] = palette[254 * 3 + 2] = 63;

    return palette;
  }

  // --- Animation decoder ---

  function lsget(f) {
    switch (f & 3) {
      case 0: return 0;
      case 1: { const l = s8(SceneAnimData, anim_pointer); anim_pointer += 1; return l; }
      case 2: { const l = s16(SceneAnimData, anim_pointer); anim_pointer += 2; return l; }
      case 3: { const l = s32(SceneAnimData, anim_pointer); anim_pointer += 4; return l; }
    }
    return 0;
  }

  function stepOneAnimationFrame() {
    let onum = 0;
    while (true) {
      let a = SceneAnimData[anim_pointer]; anim_pointer++;
      if (a === 0xff) {
        a = SceneAnimData[anim_pointer]; anim_pointer++;
        if (a <= 0x7f) {
          fov = a / 256 * 360;
          return;
        } else if (a === 0xff) {
          animation_end = true;
          return;
        }
      }
      if ((a & 0xc0) === 0xc0) {
        onum = (a & 0x3f) << 4;
        a = SceneAnimData[anim_pointer]; anim_pointer++;
      }
      onum = (onum & 0xff0) | (a & 0xf);
      switch (a & 0xc0) {
        case 0x80: co[onum].on = 1; break;
        case 0x40: co[onum].on = 0; break;
      }

      const r = co[onum].o.r0;
      let pflag = 0;
      switch (a & 0x30) {
        case 0x00: break;
        case 0x10: pflag = SceneAnimData[anim_pointer]; anim_pointer++; break;
        case 0x20: pflag = u16(SceneAnimData, anim_pointer); anim_pointer += 2; break;
        case 0x30: pflag = u24(SceneAnimData, anim_pointer); anim_pointer += 3; break;
      }

      const factor = onum === 0 ? 1 : 128;
      r[9] += lsget(pflag) / factor;
      r[10] += lsget(pflag >> 2) / factor;
      r[11] += lsget(pflag >> 4) / factor;

      if (pflag & 0x40) {
        for (let b = 0; b < 9; b++)
          if (pflag & (0x80 << b)) r[b] += lsget(2) / 128;
      } else {
        for (let b = 0; b < 9; b++)
          if (pflag & (0x80 << b)) r[b] += lsget(1) / 128;
      }
    }
  }

  // --- 3D Math ---

  function normallight(n) {
    let dotp = (n.x * SCENE_LIGHT[0] + n.y * SCENE_LIGHT[1] + n.z * SCENE_LIGHT[2]) / 16384 * 128;
    dotp += 128;
    return clip(dotp, 0, 255);
  }

  function checkculling(n, v) {
    return (n.x * v.x + n.y * v.y + n.z * v.z) >= 0;
  }

  function calclight(flags, np) {
    let light = normallight(np);
    let divider = 16;
    const f = (flags & F_SHADE32) >> 10;
    if (f === 1) divider = 32;
    else if (f === 2) divider = 16;
    else if (f === 3) divider = 8;
    light = light / divider;
    light = clip(light, 2, 256 / divider - 1);
    return Math.floor(light);
  }

  function calc_rotate_translate(vdst, vsrc, r) {
    for (let i = 0; i < vsrc.length; i++) {
      const s = vsrc[i], d = vdst[i];
      d.x = Math.round(s.x * r[0] + s.y * r[1] + s.z * r[2] + r[9]);
      d.y = Math.round(s.x * r[3] + s.y * r[4] + s.z * r[5] + r[10]);
      d.z = Math.round(s.x * r[6] + s.y * r[7] + s.z * r[8] + r[11]);
      d.NormalIndex = s.NormalIndex;
    }
  }

  function calc_nrotate(num, ndst, nsrc, r) {
    for (let i = 0; i < num; i++) {
      const s = nsrc[i], d = ndst[i];
      d.x = s.x * r[0] + s.y * r[1] + s.z * r[2];
      d.y = s.x * r[3] + s.y * r[4] + s.z * r[5];
      d.z = s.x * r[6] + s.y * r[7] + s.z * r[8];
    }
  }

  function calc_projection(pvdst, vsrc) {
    for (let i = 0; i < vsrc.length; i++) {
      let cf = 0;
      const { x, y, z } = vsrc[i];
      if (z < ClippingZ[0]) cf |= VF_NEAR;
      if (z > ClippingZ[1]) cf |= VF_FAR;
      const yp = (y * Projection2DYFactor / z) + Projection2DYOffset;
      if (yp < ClippingY[0]) cf |= VF_UP;
      if (yp > ClippingY[1]) cf |= VF_DOWN;
      const xp = (x * Projection2DXFactor / z) + Projection2DXOffset;
      if (xp < ClippingX[0]) cf |= VF_LEFT;
      if (xp > ClippingX[1]) cf |= VF_RIGHT;
      pvdst[i].x = Math.round(xp);
      pvdst[i].y = Math.round(yp);
      pvdst[i].clipping_flags = cf;
    }
  }

  function calc_applyrmatrix(dest, src, apply) {
    dest[0] = apply[0] * src[0] + apply[1] * src[3] + apply[2] * src[6];
    dest[1] = apply[0] * src[1] + apply[1] * src[4] + apply[2] * src[7];
    dest[2] = apply[0] * src[2] + apply[1] * src[5] + apply[2] * src[8];
    dest[3] = apply[3] * src[0] + apply[4] * src[3] + apply[5] * src[6];
    dest[4] = apply[3] * src[1] + apply[4] * src[4] + apply[5] * src[7];
    dest[5] = apply[3] * src[2] + apply[4] * src[5] + apply[5] * src[8];
    dest[6] = apply[6] * src[0] + apply[7] * src[3] + apply[8] * src[6];
    dest[7] = apply[6] * src[1] + apply[7] * src[4] + apply[8] * src[7];
    dest[8] = apply[6] * src[2] + apply[7] * src[5] + apply[8] * src[8];
    const tx = src[9] * apply[0] + src[10] * apply[1] + src[11] * apply[2];
    const ty = src[9] * apply[3] + src[10] * apply[4] + src[11] * apply[5];
    const tz = src[9] * apply[6] + src[10] * apply[7] + src[11] * apply[8];
    dest[9] = tx + apply[9];
    dest[10] = ty + apply[10];
    dest[11] = tz + apply[11];
  }

  function calc_singlez(vertex, vlist, r) {
    return vlist[vertex].x * r[6] + vlist[vertex].y * r[7] + vlist[vertex].z * r[8] + r[11];
  }

  function calc_matrix(currentFrame) {
    order = [];
    for (let a = 1; a < co.length; a++) {
      if (co[a].on) {
        order.push(a);
        const o = co[a].o;
        calc_applyrmatrix(o.r, o.r0, cam);
        const b = o.pl[0][0];
        co[a].dist = calc_singlez(b, o.v0, o.r);
        if (o.name && o.name[1] === '_') co[a].dist = 1000000000;
        if (currentFrame > 900 && currentFrame < 1100) {
          if (o.name && o.name[1] === 's' && o.name[2] === '0' && o.name[3] === '1')
            co[a].dist = 1;
        }
      }
    }
  }

  // --- Polygon clipping ---

  function clipPolyZ(pi) {
    const sides = pi.vertices2D.length;
    const po = { flags: pi.flags, color: pi.color, vertices2D: [] };
    let pu1 = pi.vertices3D[0], pv1 = pi.vertices2D[0];
    const zl = ClippingZ[0];
    let col1, col2;
    if (pi.flags & F_GOURAUD) col1 = pv1.color;
    let idx = 0;
    for (let i = 0; i < sides; i++) {
      idx++; if (idx === sides) idx = 0;
      const pu2 = pi.vertices3D[idx], pv2 = pi.vertices2D[idx];
      const z1 = pu1.z, z2 = pu2.z;
      if (pi.flags & F_GOURAUD) col2 = pv2.color;
      if (z1 >= zl && z2 >= zl) {
        const nv = { x: pv2.x, y: pv2.y };
        if (pi.flags & F_GOURAUD) nv.color = col2;
        po.vertices2D.push(nv);
      } else if (z1 >= zl && z2 < zl) {
        const nx = pu1.x + (zl - z1) * (pu2.x - pu1.x) / (z2 - z1);
        const ny = pu1.y + (zl - z1) * (pu2.y - pu1.y) / (z2 - z1);
        const nv = {
          x: Math.round(nx * Projection2DXFactor / zl + Projection2DXOffset),
          y: Math.round(ny * Projection2DYFactor / zl + Projection2DYOffset),
        };
        if (pi.flags & F_GOURAUD) nv.color = Math.round(col1 + (zl - z1) * (col2 - col1) / (z2 - z1));
        po.vertices2D.push(nv);
      } else if (z1 < zl && z2 >= zl) {
        const nx = pu1.x + (zl - z1) * (pu2.x - pu1.x) / (z2 - z1);
        const ny = pu1.y + (zl - z1) * (pu2.y - pu1.y) / (z2 - z1);
        const nv = {
          x: Math.round(nx * Projection2DXFactor / zl) + Projection2DXOffset,
          y: Math.round(ny * Projection2DYFactor / zl) + Projection2DYOffset,
        };
        if (pi.flags & F_GOURAUD) nv.color = Math.round(col1 + (zl - z1) * (col2 - col1) / (z2 - z1));
        po.vertices2D.push(nv);
        const nv2 = { x: pv2.x, y: pv2.y };
        if (pi.flags & F_GOURAUD) nv2.color = col2;
        po.vertices2D.push(nv2);
      }
      pu1 = pu2; pv1 = pv2;
      if (pi.flags & F_GOURAUD) col1 = col2;
    }
    return po;
  }

  function clipEdge(pi, testFn, limitFn, interpFn) {
    const sides = pi.vertices2D.length;
    if (sides === 0) return pi;
    const po = { flags: pi.flags, color: pi.color, vertices2D: [] };
    let pv1 = pi.vertices2D[0];
    let col1, col2;
    if (pi.flags & F_GOURAUD) col1 = pv1.color;
    let idx = 0;
    for (let i = 0; i < sides; i++) {
      idx++; if (idx === sides) idx = 0;
      const pv2 = pi.vertices2D[idx];
      if (pi.flags & F_GOURAUD) col2 = pv2.color;
      const in1 = testFn(pv1), in2 = testFn(pv2);
      if (in1 && in2) {
        const nv = { x: pv2.x, y: pv2.y };
        if (pi.flags & F_GOURAUD) nv.color = col2;
        po.vertices2D.push(nv);
      } else if (in1 && !in2) {
        po.vertices2D.push(interpFn(pv1, pv2, col1, col2, pi.flags));
      } else if (!in1 && in2) {
        po.vertices2D.push(interpFn(pv1, pv2, col1, col2, pi.flags));
        const nv2 = { x: pv2.x, y: pv2.y };
        if (pi.flags & F_GOURAUD) nv2.color = col2;
        po.vertices2D.push(nv2);
      }
      pv1 = pv2;
      if (pi.flags & F_GOURAUD) col1 = col2;
    }
    return po;
  }

  function clipUp(pi) {
    const yl = ClippingY[0];
    return clipEdge(pi, v => v.y >= yl, null, (a, b, c1, c2, flags) => {
      const t = (yl - a.y) / (b.y - a.y);
      const nv = { x: Math.round(a.x + t * (b.x - a.x)), y: yl };
      if (flags & F_GOURAUD) nv.color = Math.round(c1 + t * (c2 - c1));
      return nv;
    });
  }

  function clipDown(pi) {
    const yl = ClippingY[1];
    return clipEdge(pi, v => v.y <= yl, null, (a, b, c1, c2, flags) => {
      const t = (yl - a.y) / (b.y - a.y);
      const nv = { x: Math.round(a.x + t * (b.x - a.x)), y: yl };
      if (flags & F_GOURAUD) nv.color = Math.round(c1 + t * (c2 - c1));
      return nv;
    });
  }

  function clipLeft(pi) {
    const xl = ClippingX[0];
    return clipEdge(pi, v => v.x >= xl, null, (a, b, c1, c2, flags) => {
      const t = (xl - a.x) / (b.x - a.x);
      const nv = { x: xl, y: Math.round(a.y + t * (b.y - a.y)) };
      if (flags & F_GOURAUD) nv.color = Math.round(c1 + t * (c2 - c1));
      return nv;
    });
  }

  function clipRight(pi) {
    const xl = ClippingX[1];
    return clipEdge(pi, v => v.x <= xl, null, (a, b, c1, c2, flags) => {
      const t = (xl - a.x) / (b.x - a.x);
      const nv = { x: Math.round(a.x + t * (b.x - a.x)), y: Math.round(a.y + t * (b.y - a.y)) };
      if (flags & F_GOURAUD) nv.color = Math.round(c1 + t * (c2 - c1));
      return nv;
    });
  }

  function getPolyFlags2D(poly) {
    let or = 0;
    for (let i = 0; i < poly.vertices2D.length; i++) {
      if (poly.vertices2D[i].y < ClippingY[0]) or |= VF_UP;
      if (poly.vertices2D[i].y > ClippingY[1]) or |= VF_DOWN;
      if (poly.vertices2D[i].x < ClippingX[0]) or |= VF_LEFT;
      if (poly.vertices2D[i].x > ClippingX[1]) or |= VF_RIGHT;
    }
    return or;
  }

  // --- Polygon filling ---

  function findTopBottom(coords) {
    let topY = coords[0].y, botY = coords[0].y, topI = 0, botI = 0;
    for (let i = 1; i < coords.length; i++) {
      if (coords[i].y < topY) { topY = coords[topI = i].y; }
      else if (coords[i].y > botY) { botY = coords[botI = i].y; }
    }
    return { topY, topI, botY };
  }

  function nextIdx(poly, i) { return (i + 1) % poly.vertices2D.length; }
  function prevIdx(poly, i) { return (i - 1 + poly.vertices2D.length) % poly.vertices2D.length; }

  function computeSegment(coords, from, to, curY, deltaY) {
    const x1 = coords[from].x, x2 = coords[to].x, y2 = coords[to].y;
    const invSlope = (x2 - x1) / deltaY;
    return { invSlope, xStart: x2 - invSlope * (y2 - curY) };
  }

  function computeSegmentGouraud(coords, from, to, curY, deltaY) {
    const x1 = coords[from].x, x2 = coords[to].x, y2 = coords[to].y;
    const c1 = coords[from].color, c2 = coords[to].color;
    const invSlope = (x2 - x1) / deltaY;
    const colorSlope = (c2 - c1) / deltaY;
    return {
      invSlope,
      xStart: x2 - invSlope * (y2 - curY),
      colorSlope,
      colorStart: c2 - colorSlope * (y2 - curY),
    };
  }

  function fillFlat(poly) {
    const coords = poly.vertices2D;
    if (coords.length === 0) return;
    const { topY, topI, botY } = findTopBottom(coords);
    if (topY === botY) return;

    const color = poly.color;
    let curLI = topI, curRI = topI, curY = topY;
    let prevLI, prevRI, dyL, dyR;
    let ymul = topY * W;

    while (true) {
      if (coords[curLI].y === curY) {
        do { prevLI = curLI; curLI = prevIdx(poly, curLI); }
        while (coords[curLI].y === coords[prevLI].y);
        dyL = coords[curLI].y - coords[prevLI].y;
      }
      if (dyL < 0) break;
      const remL = coords[curLI].y - curY;
      const segL = computeSegment(coords, prevLI, curLI, curY, dyL);

      if (coords[curRI].y === curY) {
        do { prevRI = curRI; curRI = nextIdx(poly, curRI); }
        while (coords[curRI].y === coords[prevRI].y);
        dyR = coords[curRI].y - coords[prevRI].y;
      }
      if (dyR < 0) break;
      const remR = coords[curRI].y - curY;
      const segR = computeSegment(coords, prevRI, curRI, curY, dyR);

      const h = Math.min(remL, remR);
      let x1 = segL.xStart, x2 = segR.xStart;
      for (let y = 0; y < h; y++) {
        const xl = Math.round(Math.min(x1, x2));
        const xr = Math.round(Math.max(x1, x2));
        for (let x = xl; x <= xr; x++) fb[x + ymul] = color;
        x1 += segL.invSlope;
        x2 += segR.invSlope;
        ymul += W;
      }
      curY += h;
    }
  }

  function fillGouraud(poly) {
    const coords = poly.vertices2D;
    if (coords.length === 0) return;
    const { topY, topI, botY } = findTopBottom(coords);
    if (topY === botY) return;

    let curLI = topI, curRI = topI, curY = topY;
    let prevLI, prevRI, dyL, dyR;
    let ymul = topY * W;

    while (true) {
      if (coords[curLI].y === curY) {
        do { prevLI = curLI; curLI = prevIdx(poly, curLI); }
        while (coords[curLI].y === coords[prevLI].y);
        dyL = coords[curLI].y - coords[prevLI].y;
      }
      if (dyL < 0) break;
      const remL = coords[curLI].y - curY;
      const segL = computeSegmentGouraud(coords, prevLI, curLI, curY, dyL);

      if (coords[curRI].y === curY) {
        do { prevRI = curRI; curRI = nextIdx(poly, curRI); }
        while (coords[curRI].y === coords[prevRI].y);
        dyR = coords[curRI].y - coords[prevRI].y;
      }
      if (dyR < 0) break;
      const remR = coords[curRI].y - curY;
      const segR = computeSegmentGouraud(coords, prevRI, curRI, curY, dyR);

      const h = Math.min(remL, remR);
      let x1 = segL.xStart, x2 = segR.xStart;
      let c1 = segL.colorStart, c2 = segR.colorStart;
      for (let y = 0; y < h; y++) {
        const xl = Math.round(Math.min(x1, x2));
        const xr = Math.round(Math.max(x1, x2));
        let cSlope = xl !== xr ? (c2 - c1) / (x2 - x1) : 0;
        let c = x2 < x1 ? c2 : c1;
        for (let x = xl; x < xr; x++) {
          fb[x + ymul] = Math.round(c);
          c += cSlope;
        }
        x1 += segL.invSlope; x2 += segR.invSlope;
        c1 += segL.colorSlope; c2 += segR.colorSlope;
        ymul += W;
      }
      curY += h;
    }
  }

  // --- Draw object ---

  function vis_drawobject(obj) {
    if (!(obj.flags & F_VISIBLE)) return;
    calc_rotate_translate(obj.v, obj.v0, obj.r);
    if (obj.flags & F_GOURAUD) calc_nrotate(obj.nnum, obj.n, obj.n0, obj.r);
    else calc_nrotate(obj.nnum1, obj.n, obj.n0, obj.r);
    calc_projection(obj.pv, obj.v);

    let orderIdxMin = 1;
    let minZ = obj.v[obj.pl[1][0]].z;
    for (let oi = 2; oi < obj.pl.length; oi++) {
      const z = obj.v[obj.pl[oi][0]].z;
      if (z < minZ) { minZ = z; orderIdxMin = oi; }
    }
    draw_polylist(obj.pl[orderIdxMin], obj.pd, obj.v, obj.pv, obj.n, obj.flags);
  }

  function draw_polylist(l, d, v, pv, n, f) {
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
      if (flags & F_2SIDE) { /* no cull */ }
      else if (checkculling(np, vp)) continue;

      let cfAND = 0xFF, cfOR = 0x00;
      for (let i = 0; i < sides; i++) {
        cfAND &= pv[point[i]].clipping_flags;
        cfOR |= pv[point[i]].clipping_flags;
      }
      if (cfOR & VF_FAR) continue;

      if (!(flags & F_GOURAUD)) color += calclight(flags, np);

      let mypoly = { flags, color, vertices2D: [] };
      for (let i = 0; i < sides; i++) {
        const pp = pv[point[i]];
        const nv = { x: pp.x, y: pp.y };
        if (flags & F_GOURAUD) {
          const ff = v[point[i]];
          const nn = n[ff.NormalIndex];
          nv.color = color + calclight(flags, nn);
        }
        mypoly.vertices2D.push(nv);
      }

      if (cfOR !== 0) {
        const needZ = cfOR & VF_NEAR;
        if (needZ) {
          mypoly.vertices3D = [];
          for (let i = 0; i < sides; i++) {
            const pu = v[point[i]];
            mypoly.vertices3D.push({ x: pu.x, y: pu.y, z: pu.z });
          }
          mypoly = clipPolyZ(mypoly);
        }
        cfOR = getPolyFlags2D(mypoly);
        if (cfOR & VF_DOWN) mypoly = clipDown(mypoly);
        if (cfOR & VF_UP) mypoly = clipUp(mypoly);
        if (cfOR & VF_LEFT) mypoly = clipLeft(mypoly);
        if (cfOR & VF_RIGHT) mypoly = clipRight(mypoly);
      }

      if (flags & F_GOURAUD) fillGouraud(mypoly);
      else fillFlat(mypoly);
    }
  }

  // --- Frame rendering ---

  function renderFrame(framebuffer, currentFrame) {
    fb = framebuffer;
    calc_matrix(currentFrame);

    for (let a = 0; a < order.length; a++) {
      let dis = co[order[a]].dist;
      let c = order[a];
      let b;
      for (b = a - 1; b >= 0 && dis > co[order[b]].dist; b--)
        order[b + 1] = order[b];
      order[b + 1] = c;
    }

    for (let a = 0; a < order.length; a++) {
      vis_drawobject(co[order[a]].o);
    }
  }

  // --- Snapshot helpers (for bakeAnimation / seekFrame) ---

  let snapshots = null;

  function snapshot() {
    const s = { anim_pointer, animation_end, fov, on: new Uint8Array(co.length), r0: [] };
    for (let i = 0; i < co.length; i++) {
      if (!co[i]) { s.on[i] = 0; s.r0[i] = new Float64Array(12); continue; }
      s.on[i] = i === 0 ? 0 : co[i].on;
      s.r0[i] = Float64Array.from(co[i].o.r0);
    }
    return s;
  }

  function restoreSnapshot(s) {
    anim_pointer = s.anim_pointer;
    animation_end = s.animation_end;
    fov = s.fov;
    vid_cameraangle(fov);
    for (let i = 0; i < co.length; i++) {
      if (!co[i]) continue;
      if (i > 0) co[i].on = s.on[i];
      for (let j = 0; j < 12; j++) co[i].o.r0[j] = s.r0[i][j];
    }
    cam = co[0].o.r0;
  }

  function resetAnimationState() {
    anim_pointer = 0;
    animation_end = false;
    fov = 40;
    vid_cameraangle(fov);
    for (let c = 0; c < co.length; c++) {
      if (!co[c]) continue;
      if (c > 0) co[c].on = 0;
      co[c].o.r0.fill(0);
    }
    cam = co[0].o.r0;
  }

  function bakeAnimation() {
    resetAnimationState();
    snapshots = [snapshot()];
    while (!animation_end) {
      stepOneAnimationFrame();
      snapshots.push(snapshot());
    }
  }

  function seekFrame(n) {
    if (!snapshots) bakeAnimation();
    const idx = Math.max(0, Math.min(n, snapshots.length - 1));
    restoreSnapshot(snapshots[idx]);
  }

  // --- Public API ---

  return {
    reset,
    loadData,
    stepOneAnimationFrame,
    renderFrame,
    setClippingY(ymin, ymax) { ClippingY = [ymin, ymax]; },
    isAnimationEnd() { return animation_end; },
    getAnimPointer() { return anim_pointer; },
    setAnimPointer(v) { anim_pointer = v; },
    saveState() {
      const coState = [];
      for (let i = 0; i < co.length; i++) {
        if (!co[i]) { coState.push(null); continue; }
        coState.push({
          on: co[i].on,
          r0: co[i].o.r0.slice(),
        });
      }
      return { anim_pointer, animation_end, fov, coState, cam: cam ? cam.slice() : null };
    },
    restoreState(s) {
      anim_pointer = s.anim_pointer;
      animation_end = s.animation_end;
      fov = s.fov;
      vid_cameraangle(fov);
      for (let i = 0; i < co.length; i++) {
        if (!co[i] || !s.coState[i]) continue;
        co[i].on = s.coState[i].on;
        for (let j = 0; j < 12; j++) co[i].o.r0[j] = s.coState[i].r0[j];
      }
      if (s.cam && cam) {
        for (let j = 0; j < 12; j++) cam[j] = s.cam[j];
      }
    },

    bakeAnimation,
    seekFrame,
    get baked() { return !!snapshots; },
    get ended() { return animation_end; },
    get totalFrames() { return snapshots ? snapshots.length : 0; },
    get camera() { return cam; },
    get fov() { return fov; },
    get objectCount() { return co.length; },
    getObject(i) { return co[i]; },
  };
}
