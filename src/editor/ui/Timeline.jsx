import { useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';

export default function Timeline() {
  const canvasRef = useRef(null);
  const { playheadSeconds, zoomLevel } = useEditorStore();

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    function resize() {
      const rect = canvas.parentElement.getBoundingClientRect();
      canvas.width = rect.width * devicePixelRatio;
      canvas.height = rect.height * devicePixelRatio;
      canvas.style.width = rect.width + 'px';
      canvas.style.height = rect.height + 'px';
      ctx.scale(devicePixelRatio, devicePixelRatio);
    }

    function draw() {
      const w = canvas.width / devicePixelRatio;
      const h = canvas.height / devicePixelRatio;

      ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx.fillStyle = '#0d0d1a';
      ctx.fillRect(0, 0, w, h);

      const rowHeight = h / 4;
      const labels = ['CLIPS', 'AUDIO', 'BEATS', 'CUES'];

      labels.forEach((label, i) => {
        const y = i * rowHeight;

        ctx.strokeStyle = '#2a2a4a';
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();

        ctx.fillStyle = '#555577';
        ctx.font = '10px monospace';
        ctx.fillText(label, 8, y + 16);
      });

      // Playhead
      const pxPerSecond = 8 * zoomLevel;
      const playheadX = 60 + playheadSeconds * pxPerSecond;
      if (playheadX >= 0 && playheadX <= w) {
        ctx.strokeStyle = '#4a7cff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(playheadX, 0);
        ctx.lineTo(playheadX, h);
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }

    resize();
    draw();

    const observer = new ResizeObserver(() => {
      resize();
      draw();
    });
    observer.observe(canvas.parentElement);

    return () => observer.disconnect();
  }, [playheadSeconds, zoomLevel]);

  return (
    <div className="bg-surface-900 w-full h-full relative">
      <canvas ref={canvasRef} className="absolute inset-0" />
    </div>
  );
}
