import { useRef, useEffect, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffect, listEffects, hasVariant } from '@effects/index.js';
import { getBeatPosition } from '@core/beatmap.js';
import { getTransitionProgress, renderTransitionOverlay, destroyTransitions } from '@core/transitions.js';

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 256;

function resizeCanvasToDisplay(canvas, variant, fit) {
  if (variant === 'remastered' && fit === 'fill') {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.round(rect.width * dpr);
    const h = Math.round(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  } else {
    if (canvas.width !== INTERNAL_WIDTH || canvas.height !== INTERNAL_HEIGHT) {
      canvas.width = INTERNAL_WIDTH;
      canvas.height = INTERNAL_HEIGHT;
    }
  }
}

export default function Preview({ variantOverride }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const effectsRef = useRef({});
  const fpsRef = useRef({ frames: 0, lastTime: performance.now() });
  const lastScreenshotTokenRef = useRef(0);
  const variantOverrideRef = useRef(variantOverride);
  variantOverrideRef.current = variantOverride;
  const [status, setStatus] = useState('Initializing...');
  const [fps, setFps] = useState(0);

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
    setStatus(effects.length ? null : 'no effects registered');

    const variant = variantOverrideRef.current ?? useEditorStore.getState().variant;
    for (const { name } of effects) {
      if (variantOverrideRef.current === 'remastered' && !hasVariant(name, 'remastered')) continue;
      const mod = getEffect(name, variant);
      if (mod) {
        try {
          mod.init(gl);
          effectsRef.current[`${name}:${variant}`] = mod;
        } catch (e) {
          console.error(`Failed to init effect "${name}" (${variant}):`, e);
          setStatus(`Error: ${name} — ${e.message}`);
        }
      }
    }

    function resolveEffect(name, v) {
      if (variantOverrideRef.current === 'remastered' && !hasVariant(name, 'remastered')) {
        return null;
      }
      const key = `${name}:${v}`;
      if (effectsRef.current[key]) return effectsRef.current[key];

      const mod = getEffect(name, v);
      if (!mod) return null;
      try {
        mod.init(gl);
        effectsRef.current[key] = mod;
        return mod;
      } catch (e) {
        console.error(`Failed to init effect "${name}" (${v}):`, e);
        return null;
      }
    }

    function frame() {
      fpsRef.current.frames++;
      const now = performance.now();
      const elapsed = now - fpsRef.current.lastTime;
      if (elapsed >= 1000) {
        setFps(Math.round((fpsRef.current.frames * 1000) / elapsed));
        fpsRef.current.frames = 0;
        fpsRef.current.lastTime = now;
      }

      const { project, playheadSeconds, variant: storeVariant, previewFit: currentFit, screenshotToken } = useEditorStore.getState();
      const currentVariant = variantOverrideRef.current ?? storeVariant;
      resizeCanvasToDisplay(canvas, currentVariant, currentFit);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
      gl.clear(gl.COLOR_BUFFER_BIT);

      let activeClip = null;
      if (project?.clips) {
        activeClip = project.clips.find(
          (c) => playheadSeconds >= c.start && playheadSeconds < c.end,
        ) ?? null;
        if (activeClip) {
          const mod = resolveEffect(activeClip.effect, currentVariant);
          if (mod) {
            const localT = playheadSeconds - activeClip.start;
            const beat = getBeatPosition(playheadSeconds, project.beatMap);
            mod.render(gl, localT, beat, activeClip.params ?? {});
          }

          const { inProgress, outProgress } = getTransitionProgress(activeClip, playheadSeconds);
          if (activeClip.transitionIn && inProgress !== null) {
            renderTransitionOverlay(gl, activeClip.transitionIn.type, inProgress);
          }
          if (activeClip.transitionOut && outProgress !== null) {
            renderTransitionOverlay(gl, activeClip.transitionOut.type, outProgress);
          }
        }
      }

      if (screenshotToken > lastScreenshotTokenRef.current) {
        lastScreenshotTokenRef.current = screenshotToken;
        if (activeClip) {
          const data = canvas.toDataURL('image/png');
          const effectName = activeClip.effect.toLowerCase();
          const filename = `screenshot-${effectName}-${currentVariant}.png`;
          fetch('/api/screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filename, data }),
          })
            .then((r) => r.json())
            .then((res) => console.log('Screenshot saved:', res.path))
            .catch((err) => console.error('Screenshot save failed:', err));
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
      destroyTransitions(gl);
    };
  }, []);

  const isFill = previewFit === 'fill';
  const storeVariant = useEditorStore((s) => s.variant);
  const effectiveVariant = variantOverride ?? storeVariant;
  const isHiRes = effectiveVariant === 'remastered' && isFill;

  return (
    <div className="w-full h-full relative bg-black overflow-hidden">
      <canvas
        ref={canvasRef}
        data-preview-variant={effectiveVariant}
        width={INTERNAL_WIDTH}
        height={INTERNAL_HEIGHT}
        className={isFill ? '' : 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 border border-border'}
        style={{
          imageRendering: isHiRes ? 'auto' : 'pixelated',
          ...(isFill
            ? { width: '100%', height: '100%', objectFit: 'contain' }
            : { width: INTERNAL_WIDTH, height: INTERNAL_HEIGHT }),
        }}
      />
      <span className="absolute top-1 left-1 text-[10px] font-mono text-green-400/80 pointer-events-none select-none">
        {fps} fps
      </span>
      {variantOverride && (
        <span className={`absolute top-1 right-1 text-[10px] font-mono pointer-events-none select-none ${
          variantOverride === 'classic' ? 'text-accent-blue/80' : 'text-accent-purple/80'
        }`}>
          {variantOverride.toUpperCase()}
        </span>
      )}
      <div className="absolute bottom-1 right-1 flex items-center gap-2">
        {status && <span className="text-text-dim text-[10px] font-mono opacity-60">{status}</span>}
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
