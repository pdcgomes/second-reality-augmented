import { useRef, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffect, listEffects } from '@effects/index.js';
import { getBeatPosition } from '@core/beatmap.js';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;

export default function Preview() {
  const canvasRef = useRef(null);
  const glRef = useRef(null);
  const rafRef = useRef(null);
  const effectsRef = useRef({});

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas.getContext('webgl2', { antialias: false });
    if (!gl) {
      console.error('WebGL2 not supported');
      return;
    }
    glRef.current = gl;
    console.log('WebGL2 context initialized (editor preview)');

    gl.viewport(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);
    gl.clearColor(0, 0, 0, 1);

    // Initialize all registered effects
    const effects = listEffects();
    for (const { name } of effects) {
      const variant = useEditorStore.getState().variant;
      const mod = getEffect(name, variant);
      if (mod) {
        try {
          mod.init(gl);
          effectsRef.current[name] = mod;
          console.log(`Effect initialized: ${name}`);
        } catch (e) {
          console.error(`Failed to init effect "${name}":`, e);
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
      const ext = gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={INTERNAL_WIDTH}
      height={INTERNAL_HEIGHT}
      className="border border-border"
      style={{
        width: INTERNAL_WIDTH * 3,
        height: INTERNAL_HEIGHT * 3,
        imageRendering: 'pixelated',
      }}
    />
  );
}
