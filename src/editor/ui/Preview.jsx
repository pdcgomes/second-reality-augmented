import { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffect, listEffects } from '@effects/index.js';
import { getBeatPosition } from '@core/beatmap.js';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;

export default function Preview() {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const effectsRef = useRef({});
  const [status, setStatus] = useState('Initializing...');

  const previewFit = useEditorStore((s) => s.previewFit);
  const togglePreviewFit = useEditorStore((s) => s.togglePreviewFit);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
      setStatus('WebGL2 not supported');
      return;
    }

    gl.viewport(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    gl.clearColor(0, 0, 0, 1);

    const effects = listEffects();
    setStatus(effects.length ? `${effects.map((e) => e.name).join(', ')}` : 'no effects registered');

    for (const { name } of effects) {
      const variant = useEditorStore.getState().variant;
      const mod = getEffect(name, variant);
      if (mod) {
        try {
          mod.init(gl);
          effectsRef.current[name] = mod;
        } catch (e) {
          console.error(`Failed to init effect "${name}":`, e);
          setStatus(`Error: ${name} — ${e.message}`);
        }
      }
    }

    function frame() {
      const { project, playheadSeconds } = useEditorStore.getState();
      gl.clear(gl.COLOR_BUFFER_BIT);

      if (project?.clips) {
        const clip = project.clips.find(
          (c) => playheadSeconds >= c.start && playheadSeconds < c.end,
        );
        if (clip) {
          const mod = effectsRef.current[clip.effect];
          if (mod) {
            const localT = playheadSeconds - clip.start;
            const beat = getBeatPosition(playheadSeconds, project.beatMap);
            mod.render(gl, localT, beat, clip.params ?? {});
          }
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }
    rafRef.current = requestAnimationFrame(frame);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      for (const [, mod] of Object.entries(effectsRef.current)) {
        if (mod.destroy) mod.destroy(gl);
      }
      effectsRef.current = {};
    };
  }, []);

  const isFill = previewFit === 'fill';

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        width={INTERNAL_WIDTH}
        height={INTERNAL_HEIGHT}
        style={{
          imageRendering: 'pixelated',
          ...(isFill
            ? { width: '100%', height: '100%', objectFit: 'contain' }
            : {
                position: 'absolute',
                top: '50%',
                left: '50%',
                transform: 'translate(-50%, -50%)',
                width: INTERNAL_WIDTH * 3,
                height: INTERNAL_HEIGHT * 3,
              }),
        }}
      />
      {/* Overlay controls */}
      <div className="absolute bottom-1 right-1 flex items-center gap-2">
        <span className="text-text-dim text-[10px] font-mono opacity-60">{status}</span>
        <button
          onClick={togglePreviewFit}
          className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-surface-800/80 text-text-secondary hover:text-text-primary transition-colors"
          title={isFill ? 'Switch to native 320×256 (3× pixel)' : 'Switch to fill pane'}
        >
          {isFill ? '320×256' : 'FILL'}
        </button>
      </div>
    </div>
  );
}
