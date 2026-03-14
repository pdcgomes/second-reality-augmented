/**
 * webaudio-mod-player — ES module build
 *
 * Combined from: utils.js + st3.js + player.js
 * Original (c) 2012-2021 Noora Halme et al. — MIT License
 * https://github.com/electronoora/webaudio-mod-player
 *
 * Modifications:
 *  - Converted to ES module (export Modplayer)
 *  - Removed GLOBAL_MUSIC_SPEED_GAIN global; replaced with instance property
 *  - Added seek() from second-reality-js customisations
 *  - Added loadBuffer() for loading from ArrayBuffer
 */

// ── utils ────────────────────────────────────────────────────────────

function le_word(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}
function le_dword(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16) | (buffer[offset + 3] << 24);
}
function s_byte(buffer, offset) {
  return buffer[offset] < 128 ? buffer[offset] : buffer[offset] - 256;
}
function s_le_word(buffer, offset) {
  return le_word(buffer, offset) < 32768 ? le_word(buffer, offset) : le_word(buffer, offset) - 65536;
}

function dos2utf(c) {
  if (c < 128) return String.fromCharCode(c);
  const cs = [
    0x00c7,0x00fc,0x00e9,0x00e2,0x00e4,0x00e0,0x00e5,0x00e7,0x00ea,0x00eb,0x00e8,0x00ef,0x00ee,0x00ec,0x00c4,0x00c5,
    0x00c9,0x00e6,0x00c6,0x00f4,0x00f6,0x00f2,0x00fb,0x00f9,0x00ff,0x00d6,0x00dc,0x00f8,0x00a3,0x00d8,0x00d7,0x0192,
    0x00e1,0x00ed,0x00f3,0x00fa,0x00f1,0x00d1,0x00aa,0x00ba,0x00bf,0x00ae,0x00ac,0x00bd,0x00bc,0x00a1,0x00ab,0x00bb,
    0x2591,0x2592,0x2593,0x2502,0x2524,0x00c1,0x00c2,0x00c0,0x00a9,0x2563,0x2551,0x2557,0x255d,0x00a2,0x00a5,0x2510,
    0x2514,0x2534,0x252c,0x251c,0x2500,0x253c,0x00e3,0x00c3,0x255a,0x2554,0x2569,0x2566,0x2560,0x2550,0x256c,0x00a4,
    0x00f0,0x00d0,0x00ca,0x00cb,0x00c8,0x0131,0x00cd,0x00ce,0x00cf,0x2518,0x250c,0x2588,0x2584,0x00a6,0x00cc,0x2580,
    0x00d3,0x00df,0x00d4,0x00d2,0x00f5,0x00d5,0x00b5,0x00fe,0x00de,0x00da,0x00db,0x00d9,0x00fd,0x00dd,0x00af,0x00b4,
    0x00ad,0x00b1,0x2017,0x00be,0x00b6,0x00a7,0x00f7,0x00b8,0x00b0,0x00a8,0x00b7,0x00b9,0x00b3,0x00b2,0x25a0,0x00a0,
  ];
  return String.fromCharCode(cs[c - 128]);
}

// ── Screamtracker (S3M player engine) ────────────────────────────────

function Screamtracker() {
  var i, t;
  this.clearsong();
  this.initialize();
  this.playing = false;
  this.paused = false;
  this.repeat = false;
  this.filter = false;
  this.syncqueue = [];
  this.samplerate = 44100;
  this.speedGain = 1.0;

  this.periodtable = new Float32Array([
    27392,25856,24384,23040,21696,20480,19328,18240,17216,16256,15360,14496,
    13696,12928,12192,11520,10848,10240,9664,9120,8608,8128,7680,7248,
    6848,6464,6096,5760,5424,5120,4832,4560,4304,4064,3840,3624,
    3424,3232,3048,2880,2712,2560,2416,2280,2152,2032,1920,1812,
    1712,1616,1524,1440,1356,1280,1208,1140,1076,1016,960,906,
    856,808,762,720,678,640,604,570,538,508,480,453,
    428,404,381,360,339,320,302,285,269,254,240,226,
    214,202,190,180,170,160,151,143,135,127,120,113,
    107,101,95,90,85,80,75,71,67,63,60,56,
  ]);
  this.retrigvoltab = new Float32Array([0,-1,-2,-4,-8,-16,0.66,0.5,0,1,2,4,8,16,1.5,2.0]);
  this.pan_r = new Float32Array(32);
  this.pan_l = new Float32Array(32);
  for (i = 0; i < 32; i++) { this.pan_r[i] = 0.5; this.pan_l[i] = 0.5; }
  this.vibratotable = [];
  for (t = 0; t < 4; t++) {
    this.vibratotable[t] = new Float32Array(256);
    for (i = 0; i < 256; i++) {
      switch (t) {
        case 0: this.vibratotable[t][i] = 127 * Math.sin(Math.PI * 2 * (i / 256)); break;
        case 1: this.vibratotable[t][i] = 127 - i; break;
        case 2: this.vibratotable[t][i] = i < 128 ? 127 : -128; break;
        case 3: this.vibratotable[t][i] = Math.random() * 255 - 128; break;
      }
    }
  }
  this.effects_t0 = [
    function(){},
    this.effect_t0_a,this.effect_t0_b,this.effect_t0_c,this.effect_t0_d,this.effect_t0_e,
    this.effect_t0_f,this.effect_t0_g,this.effect_t0_h,this.effect_t0_i,this.effect_t0_j,
    this.effect_t0_k,this.effect_t0_l,this.effect_t0_m,this.effect_t0_n,this.effect_t0_o,
    this.effect_t0_p,this.effect_t0_q,this.effect_t0_r,this.effect_t0_s,this.effect_t0_t,
    this.effect_t0_u,this.effect_t0_v,this.effect_t0_w,this.effect_t0_x,this.effect_t0_y,
    this.effect_t0_z,
  ];
  this.effects_t0_s = [
    this.effect_t0_s0,this.effect_t0_s1,this.effect_t0_s2,this.effect_t0_s3,this.effect_t0_s4,
    this.effect_t0_s5,this.effect_t0_s6,this.effect_t0_s7,this.effect_t0_s8,this.effect_t0_s9,
    this.effect_t0_sa,this.effect_t0_sb,this.effect_t0_sc,this.effect_t0_sd,this.effect_t0_se,
    this.effect_t0_sf,
  ];
  this.effects_t1 = [
    function(){},
    this.effect_t1_a,this.effect_t1_b,this.effect_t1_c,this.effect_t1_d,this.effect_t1_e,
    this.effect_t1_f,this.effect_t1_g,this.effect_t1_h,this.effect_t1_i,this.effect_t1_j,
    this.effect_t1_k,this.effect_t1_l,this.effect_t1_m,this.effect_t1_n,this.effect_t1_o,
    this.effect_t1_p,this.effect_t1_q,this.effect_t1_r,this.effect_t1_s,this.effect_t1_t,
    this.effect_t1_u,this.effect_t1_v,this.effect_t1_w,this.effect_t1_x,this.effect_t1_y,
    this.effect_t1_z,
  ];
  this.effects_t1_s = [
    this.effect_t1_s0,this.effect_t1_s1,this.effect_t1_s2,this.effect_t1_s3,this.effect_t1_s4,
    this.effect_t1_s5,this.effect_t1_s6,this.effect_t1_s7,this.effect_t1_s8,this.effect_t1_s9,
    this.effect_t1_sa,this.effect_t1_sb,this.effect_t1_sc,this.effect_t1_sd,this.effect_t1_se,
    this.effect_t1_sf,
  ];
}

Screamtracker.prototype.clearsong = function () {
  this.title = ''; this.signature = '';
  this.songlen = 1; this.repeatpos = 0;
  this.patterntable = new ArrayBuffer(256);
  for (var i = 0; i < 256; i++) this.patterntable[i] = 0;
  this.channels = 0; this.ordNum = 0; this.insNum = 0; this.patNum = 0;
  this.globalVol = 64; this.initSpeed = 6; this.initBPM = 125;
  this.fastslide = 0; this.mixval = 8.0;
  this.sample = [];
  for (var i = 0; i < 255; i++) {
    this.sample[i] = { length: 0, loopstart: 0, loopend: 0, looplength: 0, volume: 64, loop: 0, c2spd: 8363, name: '', data: 0 };
  }
  this.pattern = [];
  this.looprow = 0; this.loopstart = 0; this.loopcount = 0;
  this.patterndelay = 0; this.patternwait = 0;
};

Screamtracker.prototype.initialize = function () {
  this.syncqueue = [];
  this.tick = -1; this.position = 0; this.row = 0; this.flags = 0;
  this.volume = this.globalVol;
  this.speed = this.initSpeed; this.bpm = this.initBPM;
  this.stt = 0; this.breakrow = 0; this.patternjump = 0;
  this.patterndelay = 0; this.patternwait = 0; this.endofsong = false;
  this.stopBoundary = null; this.reachedStop = false;
  this.channel = [];
  for (var i = 0; i < this.channels; i++) {
    this.channel[i] = {
      sample:0,note:24,command:0,data:0,samplepos:0,samplespeed:0,flags:0,noteon:0,
      slidespeed:0,slideto:0,slidetospeed:0,arpeggio:0,
      period:0,volume:64,voiceperiod:0,voicevolume:0,oldvoicevolume:0,
      semitone:12,vibratospeed:0,vibratodepth:0,vibratopos:0,vibratowave:0,
      lastoffset:0,lastretrig:0,volramp:0,volrampfrom:0,
      trigramp:0,trigrampfrom:0,currentsample:0,lastsample:0,
    };
  }
};

Screamtracker.prototype.parse = function (buffer) {
  var i, j, c;
  if (!buffer) return false;
  this.signature = '';
  for (i = 0; i < 4; i++) this.signature += String.fromCharCode(buffer[0x002c + i]);
  if (this.signature !== 'SCRM') return false;
  if (buffer[0x001d] !== 0x10) return false;
  for (this.channels = 0, i = 0; i < 32; i++, this.channels++) if (buffer[0x0040 + i] & 0x80) break;
  for (i = 0; i < 32; i++) {
    if (!(buffer[0x0040 + i] & 0x80)) {
      c = buffer[0x0040 + i] & 15;
      if (c < 8) { this.pan_r[i] = 0.2; this.pan_l[i] = 0.8; }
      else { this.pan_r[i] = 0.8; this.pan_l[i] = 0.2; }
    }
  }
  this.title = ''; i = 0;
  while (buffer[i] && i < 0x1c) this.title += dos2utf(buffer[i++]);
  this.ordNum = buffer[0x0020] | (buffer[0x0021] << 8);
  this.insNum = buffer[0x0022] | (buffer[0x0023] << 8);
  this.patNum = buffer[0x0024] | (buffer[0x0025] << 8);
  this.globalVol = buffer[0x0030]; this.initSpeed = buffer[0x0031]; this.initBPM = buffer[0x0032];
  this.fastslide = (buffer[0x0026] & 64) ? 1 : 0;
  this.speed = this.initSpeed; this.bpm = this.initBPM;
  if (buffer[0x0035] === 0xfc) {
    for (i = 0; i < 32; i++) {
      c = buffer[0x0070 + this.ordNum + this.insNum * 2 + this.patNum * 2 + i];
      if (c & 0x10) { c &= 0x0f; this.pan_r[i] = c / 15.0; this.pan_l[i] = 1.0 - this.pan_r[i]; }
    }
  }
  this.mixval = buffer[0x0033];
  if ((this.mixval & 0x80) === 0x80) { for (i = 0; i < 32; i++) { this.pan_r[i] = 0.5; this.pan_l[i] = 0.5; } }
  this.mixval = 128.0 / Math.max(0x10, this.mixval & 0x7f);
  for (i = 0; i < this.ordNum; i++) this.patterntable[i] = buffer[0x0060 + i];
  for (this.songlen = 0, i = 0; i < this.ordNum; i++) if (this.patterntable[i] !== 255) this.songlen++;
  this.sample = new Array(this.insNum);
  for (i = 0; i < this.insNum; i++) {
    this.sample[i] = {};
    var offset = (buffer[0x0060 + this.ordNum + i * 2] | buffer[0x0060 + this.ordNum + i * 2 + 1] << 8) * 16;
    j = 0; this.sample[i].name = '';
    while (buffer[offset + 0x0030 + j] && j < 28) { this.sample[i].name += dos2utf(buffer[offset + 0x0030 + j]); j++; }
    this.sample[i].length = buffer[offset + 0x10] | buffer[offset + 0x11] << 8;
    this.sample[i].loopstart = buffer[offset + 0x14] | buffer[offset + 0x15] << 8;
    this.sample[i].loopend = buffer[offset + 0x18] | buffer[offset + 0x19] << 8;
    this.sample[i].looplength = this.sample[i].loopend - this.sample[i].loopstart;
    this.sample[i].volume = buffer[offset + 0x1c];
    this.sample[i].loop = buffer[offset + 0x1f] & 1;
    this.sample[i].stereo = (buffer[offset + 0x1f] & 2) >> 1;
    this.sample[i].bits = (buffer[offset + 0x1f] & 4) ? 16 : 8;
    this.sample[i].c2spd = buffer[offset + 0x20] | buffer[offset + 0x21] << 8;
    var smpoffset = (buffer[offset + 0x0d] << 16 | buffer[offset + 0x0e] | buffer[offset + 0x0f] << 8) * 16;
    this.sample[i].data = new Float32Array(this.sample[i].length);
    for (j = 0; j < this.sample[i].length; j++) this.sample[i].data[j] = (buffer[smpoffset + j] - 128) / 128.0;
  }
  var max_ch = 0;
  this.pattern = [];
  for (i = 0; i < this.patNum; i++) {
    var offset = (buffer[0x0060 + this.ordNum + this.insNum * 2 + i * 2] | buffer[0x0060 + this.ordNum + this.insNum * 2 + i * 2 + 1] << 8) * 16;
    var row = 0, pos = 0;
    this.pattern[i] = new Uint8Array(this.channels * 64 * 5);
    for (row = 0; row < 64; row++) for (var ch = 0; ch < this.channels; ch++) {
      this.pattern[i][row * this.channels * 5 + ch * 5 + 0] = 255;
      this.pattern[i][row * this.channels * 5 + ch * 5 + 1] = 0;
      this.pattern[i][row * this.channels * 5 + ch * 5 + 2] = 255;
      this.pattern[i][row * this.channels * 5 + ch * 5 + 3] = 255;
      this.pattern[i][row * this.channels * 5 + ch * 5 + 4] = 0;
    }
    if (!offset) continue;
    row = 0;
    offset += 2;
    while (row < 64) {
      if ((c = buffer[offset + pos++])) {
        var ch = c & 31;
        if (ch < this.channels) {
          if (ch > max_ch) { for (j = 0; j < this.songlen; j++) if (this.patterntable[j] === i) max_ch = ch; }
          if (c & 32) { this.pattern[i][row * this.channels * 5 + ch * 5 + 0] = buffer[offset + pos++]; this.pattern[i][row * this.channels * 5 + ch * 5 + 1] = buffer[offset + pos++]; }
          if (c & 64) this.pattern[i][row * this.channels * 5 + ch * 5 + 2] = buffer[offset + pos++];
          if (c & 128) {
            this.pattern[i][row * this.channels * 5 + ch * 5 + 3] = buffer[offset + pos++];
            this.pattern[i][row * this.channels * 5 + ch * 5 + 4] = buffer[offset + pos++];
            if (!this.pattern[i][row * this.channels * 5 + ch * 5 + 3] || this.pattern[i][row * this.channels * 5 + ch * 5 + 3] > 26) {
              this.pattern[i][row * this.channels * 5 + ch * 5 + 3] = 255;
            }
          }
        } else { if (c & 32) pos += 2; if (c & 64) pos++; if (c & 128) pos += 2; }
      } else row++;
    }
  }
  this.patterns = this.patNum;
  var oldch = this.channels;
  this.channels = max_ch + 1;
  for (i = 0; i < this.patNum; i++) {
    var oldpat = new Uint8Array(this.pattern[i]);
    this.pattern[i] = new Uint8Array(this.channels * 64 * 5);
    for (j = 0; j < 64; j++) for (c = 0; c < this.channels; c++) {
      this.pattern[i][j * this.channels * 5 + c * 5 + 0] = oldpat[j * oldch * 5 + c * 5 + 0];
      this.pattern[i][j * this.channels * 5 + c * 5 + 1] = oldpat[j * oldch * 5 + c * 5 + 1];
      this.pattern[i][j * this.channels * 5 + c * 5 + 2] = oldpat[j * oldch * 5 + c * 5 + 2];
      this.pattern[i][j * this.channels * 5 + c * 5 + 3] = oldpat[j * oldch * 5 + c * 5 + 3];
      this.pattern[i][j * this.channels * 5 + c * 5 + 4] = oldpat[j * oldch * 5 + c * 5 + 4];
    }
  }
  this.chvu = new Float32Array(this.channels);
  for (i = 0; i < this.channels; i++) this.chvu[i] = 0;
  return true;
};

Screamtracker.prototype.advance = function (mod) {
  var bpm = mod.bpm * mod.speedGain;
  mod.stt = (((mod.samplerate * 60) / bpm) / 4) / 6;
  mod.tick++;
  mod.flags |= 1;
  if (mod.tick >= mod.speed) {
    if (mod.patterndelay) {
      if (mod.tick < ((mod.patternwait + 1) * mod.speed)) mod.patternwait++;
      else { mod.row++; mod.tick = 0; mod.flags |= 2; mod.patterndelay = 0; }
    } else {
      if (mod.flags & (16 + 32 + 64)) {
        if (mod.flags & 64) { mod.row = mod.looprow; mod.flags &= 0xa1; mod.flags |= 2; }
        else if (mod.flags & 16) { mod.position = mod.patternjump; mod.row = mod.breakrow; mod.patternjump = 0; mod.breakrow = 0; mod.flags &= 0xe1; mod.flags |= 2; }
        mod.tick = 0;
      } else { mod.row++; mod.tick = 0; mod.flags |= 2; }
    }
  }
  if (mod.row >= 64) { mod.position++; mod.row = 0; mod.flags |= 4; while (mod.patterntable[mod.position] === 254) mod.position++; }
  if (mod.position >= mod.songlen || mod.patterntable[mod.position] === 255) {
    if (mod.repeat) mod.position = 0; else this.endofsong = true;
  }
};

Screamtracker.prototype.process_note = function (mod, p, ch) {
  var pp = mod.row * 5 * this.channels + ch * 5;
  var n = mod.pattern[p][pp], s = mod.pattern[p][pp + 1];
  if (s && mod.sample[s - 1]) {
    mod.channel[ch].sample = s - 1;
    mod.channel[ch].volume = mod.sample[s - 1].volume;
    mod.channel[ch].voicevolume = mod.channel[ch].volume;
    if (n === 255 && mod.channel[ch].samplepos > mod.sample[s - 1].length) {
      mod.channel[ch].trigramp = 0; mod.channel[ch].trigrampfrom = mod.channel[ch].currentsample; mod.channel[ch].samplepos = 0;
    }
  }
  if (n < 254) {
    n = (n & 0x0f) + (n >> 4) * 12;
    var si = mod.channel[ch].sample;
    if (!mod.sample[si]) return;
    var pv = (8363.0 * mod.periodtable[n]) / mod.sample[si].c2spd;
    if (mod.channel[ch].command !== 0x07 && mod.channel[ch].command !== 0x0c) {
      mod.channel[ch].note = n; mod.channel[ch].period = pv; mod.channel[ch].voiceperiod = pv;
      mod.channel[ch].samplepos = 0;
      if (mod.channel[ch].vibratowave > 3) mod.channel[ch].vibratopos = 0;
      mod.channel[ch].trigramp = 0; mod.channel[ch].trigrampfrom = mod.channel[ch].currentsample;
      mod.channel[ch].flags |= 3; mod.channel[ch].noteon = 1;
    }
    mod.channel[ch].slideto = pv;
  } else if (n === 254) { mod.channel[ch].noteon = 0; mod.channel[ch].voicevolume = 0; }
  if (mod.pattern[p][pp + 2] <= 64) { mod.channel[ch].volume = mod.pattern[p][pp + 2]; mod.channel[ch].voicevolume = mod.channel[ch].volume; }
};

Screamtracker.prototype.process_tick = function (mod) {
  mod.advance(mod);
  if (this.endofsong) return;
  for (var ch = 0; ch < mod.channels; ch++) {
    var p = mod.patterntable[mod.position];
    var pp = mod.row * 5 * mod.channels + ch * 5;
    mod.channel[ch].oldvoicevolume = mod.channel[ch].voicevolume;
    if (mod.flags & 2) {
      mod.channel[ch].command = mod.pattern[p][pp + 3]; mod.channel[ch].data = mod.pattern[p][pp + 4];
      if (!(mod.channel[ch].command === 0x13 && (mod.channel[ch].data & 0xf0) === 0xd0)) mod.process_note(mod, p, ch);
    }
    if (!mod.sample[mod.channel[ch].sample] || !mod.sample[mod.channel[ch].sample].length) mod.channel[ch].noteon = 0;
    if (mod.channel[ch].command < 27) {
      if (!mod.tick) mod.effects_t0[mod.channel[ch].command](mod, ch);
      else mod.effects_t1[mod.channel[ch].command](mod, ch);
    }
    mod.channel[ch].vibratopos += mod.channel[ch].vibratospeed * 2; mod.channel[ch].vibratopos &= 0xff;
    if (mod.channel[ch].oldvoicevolume !== mod.channel[ch].voicevolume) { mod.channel[ch].volrampfrom = mod.channel[ch].oldvoicevolume; mod.channel[ch].volramp = 0; }
    if ((mod.channel[ch].flags & 1 || mod.flags & 2) && mod.channel[ch].voiceperiod)
      mod.channel[ch].samplespeed = (14317056.0 / mod.channel[ch].voiceperiod) / mod.samplerate;
    mod.channel[ch].flags = 0;
  }
  mod.flags &= 0x70;
};

Screamtracker.prototype.mix = function (mod, bufs, buflen) {
  if (mod.paused || mod.endofsong || !mod.playing) {
    for (var s = 0; s < buflen; s++) { bufs[0][s] = 0; bufs[1][s] = 0; }
    for (var ch = 0; ch < mod.chvu.length; ch++) mod.chvu[ch] = 0;
    return;
  }
  for (var s = 0; s < buflen; s++) {
    var outL = 0, outR = 0;
    if (mod.stt <= 0) {
      mod.process_tick(mod);
      // Sample-accurate region boundary: zero-fill the rest of the buffer
      if (mod.stopBoundary &&
          (mod.position > mod.stopBoundary.position ||
           (mod.position === mod.stopBoundary.position && mod.row >= mod.stopBoundary.row))) {
        for (var z = s; z < buflen; z++) { bufs[0][z] = 0; bufs[1][z] = 0; }
        mod.reachedStop = true;
        return;
      }
    }
    for (var ch = 0; ch < mod.channels; ch++) {
      var fl = 0, fr = 0, fs = 0, si = mod.channel[ch].sample;
      mod.channel[ch].currentsample = 0;
      if (!mod.sample[si]) continue;
      if (mod.channel[ch].noteon || (!mod.channel[ch].noteon && mod.channel[ch].volramp < 1.0)) {
        if (mod.sample[si].length > mod.channel[ch].samplepos) {
          fl = mod.channel[ch].lastsample;
          var f = mod.channel[ch].samplepos - Math.floor(mod.channel[ch].samplepos);
          fs = mod.sample[si].data[Math.floor(mod.channel[ch].samplepos)];
          fl = f * fs + (1.0 - f) * fl;
          f = mod.channel[ch].trigramp; fl = f * fl + (1.0 - f) * mod.channel[ch].trigrampfrom;
          f += 1 / 128; mod.channel[ch].trigramp = Math.min(1, f);
          mod.channel[ch].currentsample = fl;
          fr = fl * (mod.channel[ch].voicevolume / 64.0);
          f = mod.channel[ch].volramp; fl = f * fr + (1.0 - f) * (fl * (mod.channel[ch].volrampfrom / 64.0));
          f += 1 / 64; mod.channel[ch].volramp = Math.min(1, f);
          fr = fl * mod.pan_r[ch]; fl *= mod.pan_l[ch];
        }
        outL += fl; outR += fr;
        var oldpos = mod.channel[ch].samplepos;
        mod.channel[ch].samplepos += mod.channel[ch].samplespeed;
        if (Math.floor(mod.channel[ch].samplepos) > Math.floor(oldpos)) mod.channel[ch].lastsample = fs;
        if (mod.sample[mod.channel[ch].sample].loop) {
          if (mod.channel[ch].samplepos >= mod.sample[mod.channel[ch].sample].loopend)
            { mod.channel[ch].samplepos -= mod.sample[mod.channel[ch].sample].looplength; mod.channel[ch].lastsample = mod.channel[ch].currentsample; }
        } else if (mod.channel[ch].samplepos >= mod.sample[mod.channel[ch].sample].length) mod.channel[ch].noteon = 0;
      }
      mod.chvu[ch] = Math.max(mod.chvu[ch], Math.abs(fl + fr));
    }
    var t = mod.volume / 64.0;
    bufs[0][s] = outL * t; bufs[1][s] = outR * t;
    mod.stt--;
  }
};

// Effects (tick 0)
Screamtracker.prototype.effect_t0_a = function (mod, ch) { if (mod.channel[ch].data > 0) mod.speed = mod.channel[ch].data; };
Screamtracker.prototype.effect_t0_b = function (mod, ch) { mod.breakrow = 0; mod.patternjump = mod.channel[ch].data; mod.flags |= 16; };
Screamtracker.prototype.effect_t0_c = function (mod, ch) { mod.breakrow = ((mod.channel[ch].data & 0xf0) >> 4) * 10 + (mod.channel[ch].data & 0x0f); if (!(mod.flags & 16)) mod.patternjump = mod.position + 1; mod.flags |= 16; };
Screamtracker.prototype.effect_t0_d = function (mod, ch) {
  if (mod.channel[ch].data) mod.channel[ch].volslide = mod.channel[ch].data;
  if ((mod.channel[ch].volslide & 0x0f) === 0x0f) mod.channel[ch].voicevolume += mod.channel[ch].volslide >> 4;
  else if ((mod.channel[ch].volslide >> 4) === 0x0f) mod.channel[ch].voicevolume -= mod.channel[ch].volslide & 0x0f;
  else if (mod.fastslide) mod.effect_t1_d(mod, ch);
  if (mod.channel[ch].voicevolume < 0) mod.channel[ch].voicevolume = 0;
  if (mod.channel[ch].voicevolume > 64) mod.channel[ch].voicevolume = 64;
};
Screamtracker.prototype.effect_t0_e = function (mod, ch) {
  if (mod.channel[ch].data) mod.channel[ch].slidespeed = mod.channel[ch].data;
  if ((mod.channel[ch].slidespeed & 0xf0) === 0xf0) mod.channel[ch].voiceperiod += (mod.channel[ch].slidespeed & 0x0f) << 2;
  if ((mod.channel[ch].slidespeed & 0xf0) === 0xe0) mod.channel[ch].voiceperiod += mod.channel[ch].slidespeed & 0x0f;
  if (mod.channel[ch].voiceperiod > 27392) mod.channel[ch].noteon = 0;
  mod.channel[ch].flags |= 3;
};
Screamtracker.prototype.effect_t0_f = function (mod, ch) {
  if (mod.channel[ch].data) mod.channel[ch].slidespeed = mod.channel[ch].data;
  if ((mod.channel[ch].slidespeed & 0xf0) === 0xf0) mod.channel[ch].voiceperiod -= (mod.channel[ch].slidespeed & 0x0f) << 2;
  if ((mod.channel[ch].slidespeed & 0xf0) === 0xe0) mod.channel[ch].voiceperiod -= mod.channel[ch].slidespeed & 0x0f;
  if (mod.channel[ch].voiceperiod < 56) mod.channel[ch].noteon = 0;
  mod.channel[ch].flags |= 3;
};
Screamtracker.prototype.effect_t0_g = function (mod, ch) { if (mod.channel[ch].data) mod.channel[ch].slidespeed = mod.channel[ch].data; };
Screamtracker.prototype.effect_t0_h = function (mod, ch) {
  if (mod.channel[ch].data & 0x0f && mod.channel[ch].data & 0xf0) {
    mod.channel[ch].vibratodepth = mod.channel[ch].data & 0x0f;
    mod.channel[ch].vibratospeed = (mod.channel[ch].data & 0xf0) >> 4;
  }
};
Screamtracker.prototype.effect_t0_i = function () {};
Screamtracker.prototype.effect_t0_j = function (mod, ch) { if (mod.channel[ch].data) mod.channel[ch].arpeggio = mod.channel[ch].data; mod.channel[ch].voiceperiod = mod.channel[ch].period; mod.channel[ch].flags |= 3; };
Screamtracker.prototype.effect_t0_k = function (mod, ch) { mod.effect_t0_d(mod, ch); };
Screamtracker.prototype.effect_t0_l = function (mod, ch) { mod.effect_t0_d(mod, ch); };
Screamtracker.prototype.effect_t0_m = function () {};
Screamtracker.prototype.effect_t0_n = function () {};
Screamtracker.prototype.effect_t0_o = function (mod, ch) {
  if (mod.channel[ch].data) mod.channel[ch].lastoffset = mod.channel[ch].data;
  if (mod.channel[ch].lastoffset * 256 < mod.sample[mod.channel[ch].sample].length) {
    mod.channel[ch].samplepos = mod.channel[ch].lastoffset * 256;
    mod.channel[ch].trigramp = 0; mod.channel[ch].trigrampfrom = mod.channel[ch].currentsample;
  }
};
Screamtracker.prototype.effect_t0_p = function () {};
Screamtracker.prototype.effect_t0_q = function (mod, ch) { if (mod.channel[ch].data) mod.channel[ch].lastretrig = mod.channel[ch].data; mod.effect_t1_q(mod, ch); };
Screamtracker.prototype.effect_t0_r = function () {};
Screamtracker.prototype.effect_t0_s = function (mod, ch) { mod.effects_t0_s[(mod.channel[ch].data & 0xf0) >> 4](mod, ch); };
Screamtracker.prototype.effect_t0_t = function (mod, ch) { if (mod.channel[ch].data > 32) mod.bpm = mod.channel[ch].data; };
Screamtracker.prototype.effect_t0_u = function () {};
Screamtracker.prototype.effect_t0_v = function (mod, ch) { mod.volume = mod.channel[ch].data; };
Screamtracker.prototype.effect_t0_w = function () {};
Screamtracker.prototype.effect_t0_x = function () {};
Screamtracker.prototype.effect_t0_y = function () {};
Screamtracker.prototype.effect_t0_z = function (mod, ch) { mod.syncqueue.unshift(mod.channel[ch].data & 0x0f); };

// Sxy tick 0
Screamtracker.prototype.effect_t0_s0 = function () {};
Screamtracker.prototype.effect_t0_s1 = function () {};
Screamtracker.prototype.effect_t0_s2 = function (mod, ch) { mod.syncqueue.unshift(mod.channel[ch].data & 0x0f); };
Screamtracker.prototype.effect_t0_s3 = function (mod, ch) { mod.channel[ch].vibratowave = mod.channel[ch].data & 0x07; };
Screamtracker.prototype.effect_t0_s4 = function () {};
Screamtracker.prototype.effect_t0_s5 = function () {};
Screamtracker.prototype.effect_t0_s6 = function () {};
Screamtracker.prototype.effect_t0_s7 = function () {};
Screamtracker.prototype.effect_t0_s8 = function (mod, ch) { mod.pan_r[ch] = (mod.channel[ch].data & 0x0f) / 15.0; mod.pan_l[ch] = 1.0 - mod.pan_r[ch]; };
Screamtracker.prototype.effect_t0_s9 = function () {};
Screamtracker.prototype.effect_t0_sa = function () {};
Screamtracker.prototype.effect_t0_sb = function (mod, ch) {
  if (mod.channel[ch].data & 0x0f) { if (mod.loopcount) mod.loopcount--; else mod.loopcount = mod.channel[ch].data & 0x0f; if (mod.loopcount) mod.flags |= 64; }
  else mod.looprow = mod.row;
};
Screamtracker.prototype.effect_t0_sc = function () {};
Screamtracker.prototype.effect_t0_sd = function (mod, ch) { if (mod.tick === (mod.channel[ch].data & 0x0f)) mod.process_note(mod, mod.patterntable[mod.position], ch); };
Screamtracker.prototype.effect_t0_se = function (mod, ch) { mod.patterndelay = mod.channel[ch].data & 0x0f; mod.patternwait = 0; };
Screamtracker.prototype.effect_t0_sf = function () {};

// Effects (tick 1+)
Screamtracker.prototype.effect_t1_a = function () {};
Screamtracker.prototype.effect_t1_b = function () {};
Screamtracker.prototype.effect_t1_c = function () {};
Screamtracker.prototype.effect_t1_d = function (mod, ch) {
  if ((mod.channel[ch].volslide & 0x0f) === 0) mod.channel[ch].voicevolume += mod.channel[ch].volslide >> 4;
  else if ((mod.channel[ch].volslide >> 4) === 0) mod.channel[ch].voicevolume -= mod.channel[ch].volslide & 0x0f;
  if (mod.channel[ch].voicevolume < 0) mod.channel[ch].voicevolume = 0;
  if (mod.channel[ch].voicevolume > 64) mod.channel[ch].voicevolume = 64;
};
Screamtracker.prototype.effect_t1_e = function (mod, ch) { if (mod.channel[ch].slidespeed < 0xe0) mod.channel[ch].voiceperiod += mod.channel[ch].slidespeed * 4; if (mod.channel[ch].voiceperiod > 27392) mod.channel[ch].noteon = 0; mod.channel[ch].flags |= 3; };
Screamtracker.prototype.effect_t1_f = function (mod, ch) { if (mod.channel[ch].slidespeed < 0xe0) mod.channel[ch].voiceperiod -= mod.channel[ch].slidespeed * 4; if (mod.channel[ch].voiceperiod < 56) mod.channel[ch].noteon = 0; mod.channel[ch].flags |= 3; };
Screamtracker.prototype.effect_t1_g = function (mod, ch) {
  if (mod.channel[ch].voiceperiod < mod.channel[ch].slideto) { mod.channel[ch].voiceperiod += 4 * mod.channel[ch].slidespeed; if (mod.channel[ch].voiceperiod > mod.channel[ch].slideto) mod.channel[ch].voiceperiod = mod.channel[ch].slideto; }
  else if (mod.channel[ch].voiceperiod > mod.channel[ch].slideto) { mod.channel[ch].voiceperiod -= 4 * mod.channel[ch].slidespeed; if (mod.channel[ch].voiceperiod < mod.channel[ch].slideto) mod.channel[ch].voiceperiod = mod.channel[ch].slideto; }
  mod.channel[ch].flags |= 3;
};
Screamtracker.prototype.effect_t1_h = function (mod, ch) {
  mod.channel[ch].voiceperiod += mod.vibratotable[mod.channel[ch].vibratowave & 3][mod.channel[ch].vibratopos] * mod.channel[ch].vibratodepth / 128;
  if (mod.channel[ch].voiceperiod > 27392) mod.channel[ch].voiceperiod = 27392;
  if (mod.channel[ch].voiceperiod < 56) mod.channel[ch].voiceperiod = 56;
  mod.channel[ch].flags |= 1;
};
Screamtracker.prototype.effect_t1_i = function () {};
Screamtracker.prototype.effect_t1_j = function (mod, ch) {
  var n = mod.channel[ch].note;
  if ((mod.tick & 3) === 1) n += mod.channel[ch].arpeggio >> 4;
  if ((mod.tick & 3) === 2) n += mod.channel[ch].arpeggio & 0x0f;
  mod.channel[ch].voiceperiod = (8363.0 * mod.periodtable[n]) / mod.sample[mod.channel[ch].sample].c2spd;
  mod.channel[ch].flags |= 3;
};
Screamtracker.prototype.effect_t1_k = function (mod, ch) { mod.effect_t1_h(mod, ch); mod.effect_t1_d(mod, ch); };
Screamtracker.prototype.effect_t1_l = function (mod, ch) { mod.effect_t1_g(mod, ch); mod.effect_t1_d(mod, ch); };
Screamtracker.prototype.effect_t1_m = function () {};
Screamtracker.prototype.effect_t1_n = function () {};
Screamtracker.prototype.effect_t1_o = function () {};
Screamtracker.prototype.effect_t1_p = function () {};
Screamtracker.prototype.effect_t1_q = function (mod, ch) {
  if ((mod.tick % (mod.channel[ch].lastretrig & 0x0f)) === 0) {
    mod.channel[ch].samplepos = 0; mod.channel[ch].trigramp = 0; mod.channel[ch].trigrampfrom = mod.channel[ch].currentsample;
    var v = mod.channel[ch].lastretrig >> 4;
    if ((v & 7) >= 6) mod.channel[ch].voicevolume = Math.floor(mod.channel[ch].voicevolume * mod.retrigvoltab[v]);
    else mod.channel[ch].voicevolume += mod.retrigvoltab[v];
    if (mod.channel[ch].voicevolume < 0) mod.channel[ch].voicevolume = 0;
    if (mod.channel[ch].voicevolume > 64) mod.channel[ch].voicevolume = 64;
  }
};
Screamtracker.prototype.effect_t1_r = function () {};
Screamtracker.prototype.effect_t1_s = function (mod, ch) { mod.effects_t1_s[(mod.channel[ch].data & 0xf0) >> 4](mod, ch); };
Screamtracker.prototype.effect_t1_t = function () {};
Screamtracker.prototype.effect_t1_u = function () {};
Screamtracker.prototype.effect_t1_v = function () {};
Screamtracker.prototype.effect_t1_w = function () {};
Screamtracker.prototype.effect_t1_x = function () {};
Screamtracker.prototype.effect_t1_y = function () {};
Screamtracker.prototype.effect_t1_z = function () {};

// Sxy tick 1+
Screamtracker.prototype.effect_t1_s0 = function () {};
Screamtracker.prototype.effect_t1_s1 = function () {};
Screamtracker.prototype.effect_t1_s2 = function () {};
Screamtracker.prototype.effect_t1_s3 = function () {};
Screamtracker.prototype.effect_t1_s4 = function () {};
Screamtracker.prototype.effect_t1_s5 = function () {};
Screamtracker.prototype.effect_t1_s6 = function () {};
Screamtracker.prototype.effect_t1_s7 = function () {};
Screamtracker.prototype.effect_t1_s8 = function () {};
Screamtracker.prototype.effect_t1_s9 = function () {};
Screamtracker.prototype.effect_t1_sa = function () {};
Screamtracker.prototype.effect_t1_sb = function () {};
Screamtracker.prototype.effect_t1_sc = function (mod, ch) { if (mod.tick === (mod.channel[ch].data & 0x0f)) { mod.channel[ch].volume = 0; mod.channel[ch].voicevolume = 0; } };
Screamtracker.prototype.effect_t1_sd = function (mod, ch) { mod.effect_t0_sd(mod, ch); };
Screamtracker.prototype.effect_t1_se = function () {};
Screamtracker.prototype.effect_t1_sf = function () {};


// ── Time map builder (offline dry-run) ────────────────────────────────

/**
 * Dry-run the S3M engine without audio output to build an exact
 * position/row → wall-clock-seconds lookup table. Accounts for every
 * Axx (speed), Txx (tempo), Bxx (jump), Cxx (break), SEe (pattern
 * delay), and SBx (loop) effect in the pattern data.
 *
 * Returns { rowTimes, syncs, totalDuration, songLen } where:
 *   rowTimes  – Float64Array[position * 64 + row] → seconds (-1 = unvisited)
 *   syncs     – Array of { time, mark, position, row } from Zxx/S2x effects
 *   totalDuration – total song length in seconds
 *   songLen   – number of order-list entries
 */
export function buildTimeMap(arrayBuffer, speedGain) {
  if (speedGain === undefined) speedGain = 1.0;
  var buffer = new Uint8Array(arrayBuffer);
  var player = new Screamtracker();
  if (!player.parse(buffer)) return null;

  player.initialize();
  player.samplerate = 44100;
  player.speedGain = speedGain;
  player.playing = true;
  player.flags = 1 + 2;

  var rowTimes = new Float64Array(256 * 64);
  for (var i = 0; i < rowTimes.length; i++) rowTimes[i] = -1;
  var syncs = [];
  var totalSamples = 0;
  var maxSamples = 44100 * 900; // 15-minute safety limit
  var prevPos = -1, prevRow = -1;

  // Record the start of the song
  rowTimes[0] = 0;

  while (totalSamples < maxSamples) {
    player.process_tick(player);
    if (player.endofsong) {
      var endKey = player.position * 64 + player.row;
      if (rowTimes[endKey] < 0) {
        rowTimes[endKey] = totalSamples / 44100;
      }
      break;
    }

    var pos = player.position;
    var row = player.row;

    if (pos !== prevPos || row !== prevRow) {
      var key = pos * 64 + row;
      if (rowTimes[key] < 0) {
        rowTimes[key] = totalSamples / 44100;
      }
      prevPos = pos;
      prevRow = row;
    }

    while (player.syncqueue.length > 0) {
      syncs.push({
        time: totalSamples / 44100,
        mark: player.syncqueue.pop(),
        position: pos,
        row: row,
      });
    }

    totalSamples += player.stt;
  }

  return {
    rowTimes: rowTimes,
    syncs: syncs,
    totalDuration: totalSamples / 44100,
    songLen: player.songlen,
  };
}

// ── Modplayer (front-end wrapper) ────────────────────────────────────

export function Modplayer() {
  this.format = 's3m';
  this.state = 'initializing..';
  this.loading = false;
  this.playing = false;
  this.paused = false;
  this.repeat = false;
  this.separation = 1;
  this.mixval = 8.0;
  this.filter = false;
  this.endofsong = false;
  this.autostart = false;
  this.bufferstodelay = 4;
  this.delayfirst = 0;
  this.delayload = 0;
  this.onReady = function () {};
  this.onPlay = function () {};
  this.onStop = function () {};
  this.buffer = 0;
  this.mixerNode = 0;
  this.context = null;
  this.samplerate = 44100;
  this.bufferlen = 4096;
  this._samplesProcessed = 0;
  this.chvu = new Float32Array(32);
  this.player = null;
  this.title = '';
  this.signature = '....';
  this.songlen = 0;
  this.channels = 0;
  this.patterns = 0;
  this.samplenames = [];
  this.position = 0;
  this.row = 0;
  this.speed = 6;
  this.bpm = 125;
  this.speedGain = 1.0;
  this.stopAtPosition = null; // { position, row } — zero-fill past this point
  this.reachedBoundary = false;
}

Modplayer.prototype.loadBuffer = function (arrayBuffer) {
  var buffer = new Uint8Array(arrayBuffer);
  this.player = new Screamtracker();
  this.loading = true;
  this.state = 'parsing..';
  if (this.player.parse(buffer)) {
    this.title = this.player.title;
    this.signature = this.player.signature;
    this.songlen = this.player.songlen;
    this.channels = this.player.channels;
    this.patterns = this.player.patterns;
    this.filter = this.player.filter;
    this.mixval = this.player.mixval;
    this.samplenames = [];
    for (var i = 0; i < this.player.sample.length; i++) this.samplenames[i] = this.player.sample[i].name;
    this.state = 'ready.';
    this.loading = false;
    this.onReady();
    return true;
  }
  this.state = 'error!';
  this.loading = false;
  return false;
};

Modplayer.prototype.play = function () {
  if (this.loading || !this.player) return false;
  if (!this.mixerNode) this.createContext();
  this.player.samplerate = this.samplerate;
  this.player.speedGain = this.speedGain;
  if (this.player.paused) { this.player.paused = false; return true; }
  this.endofsong = false;
  this.player.endofsong = false;
  this.player.paused = false;
  this.player.initialize();
  this.player.flags = 1 + 2;
  this.player.playing = true;
  this.playing = true;
  this._samplesProcessed = 0;
  this.chvu = new Float32Array(this.player.channels);
  this.onPlay();
  this.player.delayfirst = this.bufferstodelay;
  return true;
};

Modplayer.prototype.pause = function () {
  if (this.player) this.player.paused = !this.player.paused;
};

Modplayer.prototype.resume = function () {
  if (this.player && this.player.paused) this.player.paused = false;
};

Modplayer.prototype.stop = function () {
  this.paused = false;
  this.playing = false;
  if (this.player) { this.player.paused = false; this.player.playing = false; this.player.delayload = 1; }
  this.onStop();
};

Modplayer.prototype.seek = function (position, row) {
  if (this.player) {
    this.player.tick = 0;
    this.player.row = row;
    this.player.position = position;
    this.player.flags = 1 + 2;
    this._samplesProcessed = 0;
    this.player.reachedStop = false;
    this.reachedBoundary = false;
    if (this.player.position < 0) this.player.position = 0;
    if (this.player.position >= this.player.songlen) this.stop();
  }
};

Modplayer.prototype.setStopBoundary = function (boundary) {
  this.stopAtPosition = boundary;
  this.reachedBoundary = false;
  if (this.player) {
    this.player.stopBoundary = boundary;
    this.player.reachedStop = false;
  }
};

Modplayer.prototype.setrepeat = function (rep) { this.repeat = rep; if (this.player) this.player.repeat = rep; };

Modplayer.prototype.createContext = function () {
  if (!this.context) {
    this.context = new (window.AudioContext || window.webkitAudioContext)();
  }
  this.samplerate = this.context.sampleRate;
  this.bufferlen = this.samplerate > 44100 ? 4096 / 2 : 2048 / 2;
  this.mixerNode = this.context.createScriptProcessor(this.bufferlen, 1, 2);
  this.mixerNode.module = this;
  this.mixerNode.onaudioprocess = Modplayer.prototype.mix;
  this.mixerNode.connect(this.context.destination);
};

Modplayer.prototype.mix = function (ape) {
  var mod = ape.srcElement ? ape.srcElement.module : this.module;
  if (mod.player && mod.delayfirst === 0) {
    mod.player.repeat = mod.repeat;
    var bufs = [ape.outputBuffer.getChannelData(0), ape.outputBuffer.getChannelData(1)];
    var buflen = ape.outputBuffer.length;
    mod.player.mix(mod.player, bufs, buflen);
    var outp = new Float32Array(2);
    for (var s = 0; s < buflen; s++) {
      outp[0] = bufs[0][s]; outp[1] = bufs[1][s];
      if (mod.separation) {
        var t = outp[0];
        if (mod.separation === 2) { outp[0] = outp[0] * 0.5 + outp[1] * 0.5; outp[1] = outp[1] * 0.5 + t * 0.5; }
        else { outp[0] = outp[0] * 0.65 + outp[1] * 0.35; outp[1] = outp[1] * 0.65 + t * 0.35; }
      }
      outp[0] /= mod.mixval; outp[0] = 0.5 * (Math.abs(outp[0] + 0.975) - Math.abs(outp[0] - 0.975));
      outp[1] /= mod.mixval; outp[1] = 0.5 * (Math.abs(outp[1] + 0.975) - Math.abs(outp[1] - 0.975));
      bufs[0][s] = outp[0]; bufs[1][s] = outp[1];
    }
    mod._samplesProcessed += buflen;
    mod.row = mod.player.row;
    mod.position = mod.player.position;
    mod.speed = mod.player.speed;
    mod.bpm = mod.player.bpm;
    mod.endofsong = mod.player.endofsong;
    mod.reachedBoundary = mod.player.reachedStop || false;
    if (mod.endofsong && mod.playing) mod.stop();
    if (mod.delayfirst > 0) mod.delayfirst--;
    mod.delayload = 0;
    for (var i = 0; i < mod.player.channels; i++) {
      mod.chvu[i] = mod.chvu[i] * 0.25 + mod.player.chvu[i] * 0.75;
      mod.player.chvu[i] = 0;
    }
  }
};
