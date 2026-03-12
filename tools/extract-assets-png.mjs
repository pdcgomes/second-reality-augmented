#!/usr/bin/env node
/**
 * Extracts visual assets from implemented effects into PNG files.
 * These can be inspected, AI-upscaled, or edited for remastered variants.
 *
 * Output goes to assets/effects/{effect}/{resource}.png
 *
 * Usage: node tools/extract-assets-png.mjs
 */

import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { deflateSync } from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const EFFECTS_OUT = resolve(ROOT, 'assets/effects');

function effectDir(name) {
  const d = resolve(EFFECTS_OUT, name);
  mkdirSync(d, { recursive: true });
  return d;
}

// ── Minimal PNG writer (Node built-ins only) ────────────────────

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeB = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeB, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function writePNG(path, w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 2;  // color type: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const rowLen = w * 3 + 1;
  const raw = Buffer.alloc(h * rowLen);
  for (let y = 0; y < h; y++) {
    raw[y * rowLen] = 0; // filter: none
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * rowLen + 1 + x * 3;
      raw[di] = rgba[si];
      raw[di + 1] = rgba[si + 1];
      raw[di + 2] = rgba[si + 2];
    }
  }
  const compressed = deflateSync(raw, { level: 9 });

  const iend = Buffer.alloc(0);
  const png = Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', iend),
  ]);

  writeFileSync(path, png);
  console.log(`  ${path.replace(ROOT + '/', '')} (${w}×${h}, ${(png.length / 1024).toFixed(1)} KB)`);
}

function b64ToUint8(b64) {
  return Uint8Array.from(Buffer.from(b64, 'base64'));
}

function signed8(buf, i) {
  const v = buf[i];
  return v < 128 ? v : v - 256;
}

// ── ALKU assets ─────────────────────────────────────────────────

async function extractAlku() {
  console.log('\nALKU:');
  const out = effectDir('alku');
  const { LANDSCAPE_B64, LANDSCAPE_PAL, LANDSCAPE_W, LANDSCAPE_H,
          FONT_B64, FONT_W, FONT_H } = await import('../src/effects/alku/data.js');

  // Landscape — full 640×200 image with 63-color palette applied
  {
    const pix = b64ToUint8(LANDSCAPE_B64);
    const k = 255 / 63;
    const rgba = new Uint8Array(LANDSCAPE_W * LANDSCAPE_H * 4);
    for (let i = 0; i < LANDSCAPE_W * LANDSCAPE_H; i++) {
      const idx = pix[i];
      rgba[i * 4]     = Math.round(LANDSCAPE_PAL[idx * 3] * k);
      rgba[i * 4 + 1] = Math.round(LANDSCAPE_PAL[idx * 3 + 1] * k);
      rgba[i * 4 + 2] = Math.round(LANDSCAPE_PAL[idx * 3 + 2] * k);
      rgba[i * 4 + 3] = 255;
    }
    writePNG(resolve(out, 'landscape.png'), LANDSCAPE_W, LANDSCAPE_H, rgba);
  }

  // Font bitmap — 1500×30, grayscale
  {
    const fontData = b64ToUint8(FONT_B64);
    const rgba = new Uint8Array(FONT_W * FONT_H * 4);
    for (let i = 0; i < FONT_W * FONT_H; i++) {
      const v = fontData[i];
      const lum = Math.round((v / 3) * 255);
      rgba[i * 4]     = lum;
      rgba[i * 4 + 1] = lum;
      rgba[i * 4 + 2] = lum;
      rgba[i * 4 + 3] = 255;
    }
    writePNG(resolve(out, 'font.png'), FONT_W, FONT_H, rgba);
  }
}

// ── PAM assets ──────────────────────────────────────────────────

async function extractPam() {
  console.log('\nPAM:');
  const out = effectDir('pam');
  const { ANI_B64, PALETTE } = await import('../src/effects/pam/data.js');

  const W = 320, H = 200;
  const MAX_FRAMES = 41;
  const aniData = b64ToUint8(ANI_B64);
  const k = 255 / 63;

  // Build RGBA palette (normal, no fade)
  const palRGBA = new Array(256);
  for (let i = 0; i < 256; i++) {
    palRGBA[i] = [
      Math.round(PALETTE[i * 3] * k),
      Math.round(PALETTE[i * 3 + 1] * k),
      Math.round(PALETTE[i * 3 + 2] * k),
    ];
  }

  // Decode all frames via RLE
  const fb = new Uint8Array(W * H);
  let ptr = 0;

  for (let f = 0; f < MAX_FRAMES; f++) {
    while ((ptr & 0x0f) !== 0) ptr++;
    if (ptr >= aniData.length - 1) break;

    let p = 0;
    while (true) {
      const b = signed8(aniData, ptr++);
      if (b > 0) {
        const c = aniData[ptr++];
        for (let i = 0; i < b; i++) fb[p++] = c;
      } else if (b < 0) {
        p -= b;
      } else {
        break;
      }
    }

    const rgba = new Uint8Array(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const [r, g, b] = palRGBA[fb[i]];
      rgba[i * 4]     = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 255;
    }
    const num = String(f).padStart(2, '0');
    writePNG(resolve(out, `frame-${num}.png`), W, H, rgba);
  }
}

// ── U2A assets ──────────────────────────────────────────────────

async function extractU2a() {
  console.log('\nU2A:');
  const out = effectDir('u2a');
  const { SCENE_B64, MAT_B64 } = await import('../src/effects/u2a/data.js');
  const { LANDSCAPE_PAL } = await import('../src/effects/alku/data.js');

  // Scene palette — 256-color swatch strip (256×32, each color is a 1×32 column)
  {
    const scene = b64ToUint8(SCENE_B64);
    const BG_OFFSET = 192;
    const pal768 = new Uint8Array(768);
    for (let i = 0; i < 768; i++) pal768[i] = scene[16 + i];
    for (let i = 0; i < 63 * 3; i++) pal768[BG_OFFSET * 3 + i] = LANDSCAPE_PAL[i];

    const k = 255 / 63;
    const sw = 256, sh = 32;
    const rgba = new Uint8Array(sw * sh * 4);
    for (let x = 0; x < 256; x++) {
      const r = Math.round(pal768[x * 3] * k);
      const g = Math.round(pal768[x * 3 + 1] * k);
      const b = Math.round(pal768[x * 3 + 2] * k);
      for (let y = 0; y < sh; y++) {
        const idx = (y * sw + x) * 4;
        rgba[idx] = r;
        rgba[idx + 1] = g;
        rgba[idx + 2] = b;
        rgba[idx + 3] = 255;
      }
    }
    writePNG(resolve(out, 'palette.png'), sw, sh, rgba);
  }

  // Materials file decoded as text for reference
  {
    const matData = b64ToUint8(MAT_B64);
    const matText = new TextDecoder().decode(matData);
    const matPath = resolve(out, 'materials.txt');
    writeFileSync(matPath, matText, 'utf8');
    console.log(`  ${matPath.replace(ROOT + '/', '')} (${matText.length} bytes)`);
  }
}

// ── Run all ─────────────────────────────────────────────────────

console.log('Extracting visual assets from implemented effects...');
await extractAlku();
await extractPam();
await extractU2a();
console.log('\nDone.');
