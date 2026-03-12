import { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffect, listEffects } from '@effects/index.js';
import { getBeatPosition } from '@core/beatmap.js';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;
const ASPECT = INTERNAL_WIDTH / INTERNAL_HEIGHT;

export default function Preview() {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const rafRef = useRef(null);
  const effectsRef = useRef({});
  const [status, setStatus] = useState('Initializing...');

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
      setStatus('WebGL2 not supported');
      return;
    }
    glRef.current = gl;

    gl.viewport(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    gl.clearColor(0, 0, 0, 1);

    const effects = listEffects();
    setStatus(`Registered effects: ${effects.map((e) => e.name).join(', ') || 'none'}`);

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

  return (
    <div ref={containerRef} className="w-full h-full flex flex-col items-center justify-center gap-1">
      <canvas
        ref={canvasRef}
        width={INTERNAL_WIDTH}
        height={INTERNAL_HEIGHT}
        className="border border-border bg-black"
        style={{
          maxWidth: '100%',
          maxHeight: 'calc(100% - 20px)',
          aspectRatio: `${ASPECT}`,
          imageRendering: 'pixelated',
        }}
      />
      <span className="text-text-dim text-[10px] font-mono">{status}</span>
    </div>
  );
}
