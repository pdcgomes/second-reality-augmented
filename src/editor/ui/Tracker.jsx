import { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { timeToMusicPos } from '../../core/musicsync.js';

const NOTE_NAMES = ['C-','C#','D-','D#','E-','F-','F#','G-','G#','A-','A#','B-'];

const COL_NOTE   = '#66ddff';
const COL_INST   = '#ccaa44';
const COL_VOL    = '#44cc66';
const COL_FX     = '#cc55aa';
const COL_EMPTY  = '#333355';
const COL_ROW    = '#555577';
const COL_CURROW = '#4a7cff';
const COL_BG     = '#0d0d1a';
const COL_HEADBG = '#13132b';
const COL_CURBG  = '#252560';
const COL_SEP    = '#2a2a4a';
const COL_TEXT   = '#8888aa';
const COL_TITLE  = '#e8e8f0';

const INFO_H = 24;
const CHAN_HEADER_H = 22;
const CHAR_W = 7;
const ROW_H = 14;
const ROW_NUM_CHARS = 3;
const CELL_CHARS = 14; // "NNN II VV EDD" + separator

function noteStr(raw) {
  if (raw === 255) return '\u00B7\u00B7\u00B7';
  if (raw === 254) return '^^^';
  const semi = raw & 0x0F;
  const oct = raw >> 4;
  if (semi > 11) return '\u00B7\u00B7\u00B7';
  return NOTE_NAMES[semi] + oct;
}

function instStr(raw) {
  if (raw === 0) return '\u00B7\u00B7';
  return raw.toString(16).toUpperCase().padStart(2, '0');
}

function volStr(raw) {
  if (raw === 255) return '\u00B7\u00B7';
  return raw.toString(16).toUpperCase().padStart(2, '0');
}

function fxStr(cmd, data) {
  if (cmd === 255 || cmd === 0) {
    if (data === 0) return '\u00B7\u00B7\u00B7';
    return '\u00B7' + data.toString(16).toUpperCase().padStart(2, '0');
  }
  const letter = String.fromCharCode(0x40 + cmd);
  return letter + data.toString(16).toUpperCase().padStart(2, '0');
}

function getPlayerData(modPlayer) {
  if (!modPlayer || modPlayer.activeIndex < 0) return null;
  const mp = modPlayer._players[modPlayer.activeIndex];
  if (!mp || !mp.player) return null;
  const p = mp.player;
  return {
    player: p,
    wrapper: mp,
    title: mp.title || `MUSIC${modPlayer.activeIndex}.S3M`,
    position: p.position,
    row: p.row,
    speed: p.speed,
    bpm: p.bpm,
    channels: p.channels,
    patternNum: p.patterntable[p.position],
    patternData: p.pattern[p.patterntable[p.position]],
    chvu: mp.chvu,
    samples: p.sample,
  };
}

function readCell(patData, row, ch, channels) {
  if (!patData) return null;
  const off = row * channels * 5 + ch * 5;
  return {
    note: patData[off],
    inst: patData[off + 1],
    vol:  patData[off + 2],
    cmd:  patData[off + 3],
    data: patData[off + 4],
  };
}

export default function Tracker() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [channelScroll, setChannelScroll] = useState(0);
  const channelScrollRef = useRef(0);
  channelScrollRef.current = channelScroll;
  const pageStartRef = useRef(0);
  const prevPatternRef = useRef(-1);

  const modPlayer = useEditorStore((s) => s.modPlayer);
  const musicLoaded = useEditorStore((s) => s.musicLoaded);
  const playheadSeconds = useEditorStore((s) => s.playheadSeconds);
  const isPlaying = useEditorStore((s) => s.isPlaying);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const ctx = canvas.getContext('2d');
    const dpr = devicePixelRatio;
    let raf;
    let mounted = true;

    function resize() {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }

    function draw() {
      if (!mounted) return;
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctx.fillStyle = COL_BG;
      ctx.fillRect(0, 0, w, h);

      if (!musicLoaded) {
        ctx.fillStyle = COL_TEXT;
        ctx.font = '11px monospace';
        ctx.fillText('Loading S3M\u2026', 12, h / 2);
        return;
      }

      const data = getPlayerData(modPlayer);
      if (!data) {
        ctx.fillStyle = COL_TEXT;
        ctx.font = '11px monospace';
        ctx.fillText('No active music', 12, h / 2);
        return;
      }

      const { title, position, row: curRow, speed, bpm, channels,
              patternNum, patternData, chvu } = data;

      const rowNumW = ROW_NUM_CHARS * CHAR_W + 4;
      const chanW = CELL_CHARS * CHAR_W;
      const visibleChans = Math.max(1, Math.floor((w - rowNumW) / chanW));
      const chScroll = Math.min(channelScrollRef.current,
                                Math.max(0, channels - visibleChans));

      // --- Info bar ---
      ctx.fillStyle = COL_HEADBG;
      ctx.fillRect(0, 0, w, INFO_H);
      ctx.fillStyle = COL_SEP;
      ctx.fillRect(0, INFO_H - 1, w, 1);

      ctx.font = '11px monospace';
      const posHex = position.toString(16).toUpperCase().padStart(2, '0');
      const patHex = patternNum.toString(16).toUpperCase().padStart(2, '0');
      const rowHex = curRow.toString(16).toUpperCase().padStart(2, '0');
      const spdDec = speed.toString().padStart(2, '0');
      const bpmDec = bpm.toString().padStart(3, ' ');

      ctx.fillStyle = COL_TITLE;
      ctx.fillText(title, 8, INFO_H - 7);

      const info = `Pos:${posHex} Pat:${patHex} Row:${rowHex}  Spd:${spdDec} BPM:${bpmDec}`;
      const infoW = ctx.measureText(info).width;
      ctx.fillStyle = COL_TEXT;
      ctx.fillText(info, w - infoW - 8, INFO_H - 7);

      // --- Channel headers + VU ---
      const headerY = INFO_H;
      ctx.fillStyle = COL_HEADBG;
      ctx.fillRect(0, headerY, w, CHAN_HEADER_H);
      ctx.fillStyle = COL_SEP;
      ctx.fillRect(0, headerY + CHAN_HEADER_H - 1, w, 1);

      ctx.font = '10px monospace';
      for (let i = 0; i < visibleChans && (chScroll + i) < channels; i++) {
        const ch = chScroll + i;
        const x = rowNumW + i * chanW;

        // Separator
        ctx.fillStyle = COL_SEP;
        ctx.fillRect(x - 1, headerY, 1, CHAN_HEADER_H);

        // Channel number
        ctx.fillStyle = COL_TEXT;
        const label = `Ch ${(ch + 1).toString().padStart(2, ' ')}`;
        ctx.fillText(label, x + 3, headerY + 13);

        // VU meter bar
        if (chvu) {
          const vu = Math.min(1, (chvu[ch] || 0) * 1.5);
          const vuBarW = chanW - 50;
          const vuX = x + 46;
          const vuY = headerY + 5;
          const vuH = 10;

          ctx.fillStyle = '#1a1a3e';
          ctx.fillRect(vuX, vuY, vuBarW, vuH);

          if (vu > 0) {
            const filledW = vu * vuBarW;
            const grad = ctx.createLinearGradient(vuX, 0, vuX + vuBarW, 0);
            grad.addColorStop(0, '#22cc44');
            grad.addColorStop(0.6, '#cccc22');
            grad.addColorStop(1, '#cc3322');
            ctx.fillStyle = grad;
            ctx.fillRect(vuX, vuY, filledW, vuH);
          }
        }
      }

      // Row number column header
      ctx.fillStyle = COL_SEP;
      ctx.fillRect(rowNumW - 1, headerY, 1, CHAN_HEADER_H);

      // --- Pattern rows (page-style: highlight walks down, view scrolls at edges) ---
      const patternY = headerY + CHAN_HEADER_H;
      const patternH = h - patternY;
      const visibleRows = Math.max(1, Math.floor(patternH / ROW_H));

      // Reset page to top on pattern change (new order position or wrap)
      if (patternNum !== prevPatternRef.current) {
        pageStartRef.current = 0;
        prevPatternRef.current = patternNum;
      }

      // If cursor went past bottom edge, scroll so it sits at the last visible row
      if (curRow >= pageStartRef.current + visibleRows) {
        pageStartRef.current = curRow - visibleRows + 1;
      }
      // If cursor went above top edge (e.g. seek backwards), snap page to cursor
      if (curRow < pageStartRef.current) {
        pageStartRef.current = curRow;
      }

      const pageStart = pageStartRef.current;

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, patternY, w, patternH);
      ctx.clip();

      for (let i = 0; i < visibleRows; i++) {
        const displayRow = pageStart + i;
        const y = patternY + i * ROW_H;
        const isCurrent = displayRow === curRow;

        if (displayRow > 63) break;

        // Current row highlight
        if (isCurrent) {
          ctx.fillStyle = COL_CURBG;
          ctx.fillRect(0, y, w, ROW_H);
        }

        // Row number
        const rowHexStr = displayRow.toString(16).toUpperCase().padStart(2, '0');
        ctx.font = '11px monospace';
        if (isCurrent) {
          ctx.fillStyle = COL_CURROW;
          ctx.fillText('\u25B6', 1, y + ROW_H - 3);
          ctx.fillStyle = COL_TITLE;
        } else {
          ctx.fillStyle = COL_ROW;
        }
        ctx.fillText(rowHexStr, 10, y + ROW_H - 3);

        // Channel data
        for (let ci = 0; ci < visibleChans && (chScroll + ci) < channels; ci++) {
          const ch = chScroll + ci;
          const cellX = rowNumW + ci * chanW;
          const cell = readCell(patternData, displayRow, ch, channels);

          // Channel separator
          ctx.fillStyle = COL_SEP;
          ctx.fillRect(cellX - 1, y, 1, ROW_H);

          if (!cell) continue;

          let xOff = cellX + 2;
          const textY = y + ROW_H - 3;

          // Note
          const nStr = noteStr(cell.note);
          const noteIsEmpty = cell.note === 255;
          ctx.fillStyle = noteIsEmpty ? COL_EMPTY : COL_NOTE;
          ctx.fillText(nStr, xOff, textY);
          xOff += 4 * CHAR_W;

          // Instrument
          const iStr = instStr(cell.inst);
          const instIsEmpty = cell.inst === 0;
          ctx.fillStyle = instIsEmpty ? COL_EMPTY : COL_INST;
          ctx.fillText(iStr, xOff, textY);
          xOff += 3 * CHAR_W;

          // Volume
          const vStr = volStr(cell.vol);
          const volIsEmpty = cell.vol === 255;
          ctx.fillStyle = volIsEmpty ? COL_EMPTY : COL_VOL;
          ctx.fillText(vStr, xOff, textY);
          xOff += 3 * CHAR_W;

          // Effect + param
          const eStr = fxStr(cell.cmd, cell.data);
          const fxIsEmpty = (cell.cmd === 255 || cell.cmd === 0) && cell.data === 0;
          ctx.fillStyle = fxIsEmpty ? COL_EMPTY : COL_FX;
          ctx.fillText(eStr, xOff, textY);
        }

        // Horizontal line between rows (subtle)
        if (!isCurrent) {
          ctx.fillStyle = COL_SEP + '40';
          ctx.fillRect(0, y + ROW_H - 1, w, 1);
        }
      }

      ctx.restore();

      // Scroll indicators
      if (chScroll > 0) {
        ctx.fillStyle = COL_TEXT;
        ctx.font = '10px monospace';
        ctx.fillText('\u25C0', 2, patternY + patternH - 6);
      }
      if (chScroll + visibleChans < channels) {
        ctx.fillStyle = COL_TEXT;
        ctx.font = '10px monospace';
        const arrowW = ctx.measureText('\u25B6').width;
        ctx.fillText('\u25B6', w - arrowW - 4, patternY + patternH - 6);
      }
    }

    resize();
    draw();

    const observer = new ResizeObserver(() => { resize(); draw(); });
    observer.observe(container);

    return () => {
      mounted = false;
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [musicLoaded, modPlayer, playheadSeconds, isPlaying, channelScroll]);

  // Wheel: horizontal or shift+vertical scrolls channels
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const onWheel = (e) => {
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
        e.preventDefault();
        const delta = e.shiftKey ? e.deltaY : e.deltaX;
        setChannelScroll((prev) => {
          const data = getPlayerData(modPlayer);
          if (!data) return prev;
          const max = Math.max(0, data.channels - 1);
          return Math.max(0, Math.min(max, prev + (delta > 0 ? 1 : -1)));
        });
      }
    };

    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [modPlayer]);

  return (
    <div ref={containerRef} className="bg-surface-900 w-full h-full relative select-none">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
