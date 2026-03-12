import { useRef, useEffect, useCallback } from 'react';
import { useEditorStore } from '../store/editorStore';

const LABEL_WIDTH = 56;
const ROW_LABELS = ['CLIPS', 'AUDIO', 'BEATS', 'CUES'];

const CLIP_COLORS = [
  '#4a7cff', '#8855ff', '#00ccaa', '#ff6b4a', '#ffaa00',
  '#ff55aa', '#55aaff', '#aaff55', '#ff5555', '#55ffcc',
];

export default function Timeline() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const draggingRef = useRef(false);

  const project = useEditorStore((s) => s.project);
  const playheadSeconds = useEditorStore((s) => s.playheadSeconds);
  const zoomLevel = useEditorStore((s) => s.zoomLevel);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const setPlayheadRaw = useEditorStore((s) => s.setPlayheadRaw);
  const selectClip = useEditorStore((s) => s.selectClip);
  const setZoom = useEditorStore((s) => s.setZoom);

  const pxPerSecond = 8 * zoomLevel;

  const xToTime = useCallback(
    (x) => Math.max(0, (x - LABEL_WIDTH) / pxPerSecond),
    [pxPerSecond],
  );

  const timeToX = useCallback(
    (t) => LABEL_WIDTH + t * pxPerSecond,
    [pxPerSecond],
  );

  // Draw
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const ctx = canvas.getContext('2d');
    const dpr = devicePixelRatio;

    function resize() {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
    }

    function draw() {
      const w = canvas.width / dpr;
      const h = canvas.height / dpr;
      const rowH = h / ROW_LABELS.length;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Background
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(0, 0, w, h);

      // Row dividers and labels
      ROW_LABELS.forEach((label, i) => {
        const y = i * rowH;
        ctx.strokeStyle = '#2a2a4a';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        ctx.fillStyle = '#1a1a3e';
        ctx.fillRect(0, y, LABEL_WIDTH, rowH);

        ctx.fillStyle = '#555577';
        ctx.font = '10px monospace';
        ctx.fillText(label, 6, y + rowH / 2 + 4);
      });

      // Time ruler ticks
      const clipsRowY = 0;
      const startTime = xToTime(0);
      const endTime = xToTime(w);
      const tickInterval = zoomLevel < 1 ? 10 : zoomLevel < 4 ? 5 : 1;

      ctx.fillStyle = '#333355';
      ctx.font = '9px monospace';
      for (let t = Math.floor(startTime / tickInterval) * tickInterval; t <= endTime; t += tickInterval) {
        const x = timeToX(t);
        if (x < LABEL_WIDTH) continue;
        ctx.strokeStyle = '#1a1a3e';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.fillText(`${t}s`, x + 2, 10);
      }

      // Clips row
      if (project?.clips) {
        project.clips.forEach((clip, i) => {
          const x1 = timeToX(clip.start);
          const x2 = timeToX(clip.end);
          const cw = x2 - x1;
          if (x2 < LABEL_WIDTH || x1 > w) return;

          const color = CLIP_COLORS[i % CLIP_COLORS.length];
          const selected = clip.id === selectedClipId;

          ctx.fillStyle = selected ? color : color + '88';
          ctx.fillRect(Math.max(LABEL_WIDTH, x1), clipsRowY + 4, cw, rowH - 8);

          if (selected) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.strokeRect(Math.max(LABEL_WIDTH, x1), clipsRowY + 4, cw, rowH - 8);
            ctx.lineWidth = 1;
          }

          // Clip label
          if (cw > 30) {
            ctx.fillStyle = '#fff';
            ctx.font = '10px monospace';
            const textX = Math.max(LABEL_WIDTH + 4, x1 + 4);
            ctx.fillText(clip.effect, textX, clipsRowY + rowH / 2 + 3);
          }
        });
      }

      // Audio row — show music regions from cues
      const audioRowY = rowH * 1;
      if (project?.cues) {
        const regions = [];
        const { music0Start, music0Stop, music1Start, music1Stop, music0Resume, musicFadeOut } = project.cues;
        if (music0Start != null && music0Stop != null) {
          regions.push({ label: 'MUSIC0.S3M', start: music0Start, end: music0Stop, color: '#4a7cff' });
        }
        if (music1Start != null && music1Stop != null) {
          regions.push({ label: 'MUSIC1.S3M', start: music1Start, end: music1Stop, color: '#8855ff' });
        }
        if (music0Resume != null && musicFadeOut != null) {
          regions.push({ label: 'MUSIC0.S3M (resume)', start: music0Resume, end: musicFadeOut, color: '#4a7cff' });
        }
        for (const r of regions) {
          const x1 = timeToX(r.start);
          const x2 = timeToX(r.end);
          if (x2 < LABEL_WIDTH || x1 > w) continue;
          ctx.fillStyle = r.color + '44';
          ctx.fillRect(Math.max(LABEL_WIDTH, x1), audioRowY + 4, x2 - Math.max(LABEL_WIDTH, x1), rowH - 8);
          ctx.strokeStyle = r.color + '88';
          ctx.strokeRect(Math.max(LABEL_WIDTH, x1), audioRowY + 4, x2 - Math.max(LABEL_WIDTH, x1), rowH - 8);
          if (x2 - x1 > 60) {
            ctx.fillStyle = r.color;
            ctx.font = '9px monospace';
            ctx.fillText(r.label, Math.max(LABEL_WIDTH + 4, x1 + 4), audioRowY + rowH / 2 + 3);
          }
        }
      }
      if (!project?.cues) {
        ctx.fillStyle = '#333355';
        ctx.font = '9px monospace';
        ctx.fillText('no music cues', LABEL_WIDTH + 8, audioRowY + rowH / 2 + 3);
      }

      // Beat grid
      const beatsRowY = rowH * 2;
      if (project?.beatMap?.beats) {
        project.beatMap.beats.forEach((t) => {
          const x = timeToX(t);
          if (x < LABEL_WIDTH || x > w) return;
          ctx.fillStyle = '#555577';
          ctx.fillRect(x, beatsRowY + rowH / 2 - 2, 1, 4);
        });
      }
      if (project?.beatMap?.bars) {
        project.beatMap.bars.forEach((t) => {
          const x = timeToX(t);
          if (x < LABEL_WIDTH || x > w) return;
          ctx.strokeStyle = '#4a4a6a';
          ctx.beginPath();
          ctx.moveTo(x, beatsRowY + 2);
          ctx.lineTo(x, beatsRowY + rowH - 2);
          ctx.stroke();
        });
      }

      // Cues row
      const cuesRowY = rowH * 3;
      if (project?.cues) {
        Object.entries(project.cues).forEach(([name, t]) => {
          const x = timeToX(t);
          if (x < LABEL_WIDTH || x > w) return;
          ctx.fillStyle = '#ffaa00';
          ctx.beginPath();
          ctx.moveTo(x, cuesRowY + 4);
          ctx.lineTo(x + 5, cuesRowY + rowH / 2);
          ctx.lineTo(x, cuesRowY + rowH - 4);
          ctx.fill();
          ctx.fillStyle = '#ffaa00';
          ctx.font = '9px monospace';
          ctx.fillText(name, x + 8, cuesRowY + rowH / 2 + 3);
        });
      }

      // Playhead
      const phX = timeToX(playheadSeconds);
      if (phX >= LABEL_WIDTH && phX <= w) {
        ctx.strokeStyle = '#4a7cff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(phX, 0);
        ctx.lineTo(phX, h);
        ctx.stroke();
        ctx.lineWidth = 1;

        // Playhead handle
        ctx.fillStyle = '#4a7cff';
        ctx.beginPath();
        ctx.moveTo(phX - 6, 0);
        ctx.lineTo(phX + 6, 0);
        ctx.lineTo(phX, 10);
        ctx.fill();
      }
    }

    resize();
    draw();
    const observer = new ResizeObserver(() => { resize(); draw(); });
    observer.observe(container);
    return () => observer.disconnect();
  }, [project, playheadSeconds, zoomLevel, selectedClipId, xToTime, timeToX]);

  // Mouse interaction
  const handleMouseDown = useCallback(
    (e) => {
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const h = rect.height;
      const rowH = h / ROW_LABELS.length;

      // Click in clips row → select clip
      if (y < rowH && project?.clips) {
        const t = xToTime(x);
        const clicked = project.clips.find((c) => t >= c.start && t < c.end);
        selectClip(clicked?.id ?? null);
      }

      // Any click → move playhead
      if (x > LABEL_WIDTH) {
        setPlayheadRaw(xToTime(x));
        draggingRef.current = true;
      }
    },
    [project, xToTime, selectClip, setPlayheadRaw],
  );

  const handleMouseMove = useCallback(
    (e) => {
      if (!draggingRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      setPlayheadRaw(xToTime(e.clientX - rect.left));
    },
    [xToTime, setPlayheadRaw],
  );

  const handleMouseUp = useCallback(() => {
    draggingRef.current = false;
  }, []);

  // Zoom with scroll wheel
  const handleWheel = useCallback(
    (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.8 : 1.25;
        setZoom(zoomLevel * delta);
      }
    },
    [zoomLevel, setZoom],
  );

  return (
    <div ref={containerRef} className="bg-surface-900 w-full h-full relative select-none">
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      />
    </div>
  );
}
