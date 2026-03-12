import { useCallback, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { getEffectParams } from '@effects/index.js';

export default function ClipProperties() {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const project = useEditorStore((s) => s.project);
  const variant = useEditorStore((s) => s.variant);
  const setClipParam = useEditorStore((s) => s.setClipParam);
  const resetClipParam = useEditorStore((s) => s.resetClipParam);

  const clip = project?.clips?.find((c) => c.id === selectedClipId) ?? null;

  if (!clip) {
    return (
      <div className="p-3">
        <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">CLIP PROPERTIES</h2>
        <p className="text-text-dim text-sm italic">Click a clip on the timeline to inspect it</p>
      </div>
    );
  }

  const duration = clip.end - clip.start;
  const paramDefs = getEffectParams(clip.effect, variant);
  const clipParams = clip.params ?? {};

  return (
    <div className="p-3 overflow-y-auto h-full">
      <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">CLIP PROPERTIES</h2>
      <dl className="space-y-2 text-sm font-mono">
        <Row label="Effect" value={clip.effect} accent />
        <Row label="ID" value={clip.id} />
        <Row label="Start" value={`${clip.start.toFixed(3)}s`} />
        <Row label="End" value={`${clip.end.toFixed(3)}s`} />
        <Row label="Duration" value={`${duration.toFixed(3)}s`} />
      </dl>

      {paramDefs.length > 0 && (
        <>
          <div className="flex items-center gap-3 mt-4 mb-2">
            <h3 className="text-text-dim text-xs font-bold tracking-widest">EFFECT PARAMS</h3>
            <CopyParamsButton paramDefs={paramDefs} clipParams={clipParams} />
          </div>
          <div className="space-y-3">
            {paramDefs.map((def) => (
              <ParamControl
                key={def.key}
                def={def}
                value={clipParams[def.key]}
                clipId={clip.id}
                onChange={setClipParam}
                onReset={resetClipParam}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ParamControl({ def, value, clipId, onChange, onReset }) {
  const current = value ?? def.default;
  const isOverridden = value !== undefined;

  const handleChange = useCallback(
    (e) => onChange(clipId, def.key, parseFloat(e.target.value)),
    [clipId, def.key, onChange],
  );

  const handleReset = useCallback(
    () => onReset(clipId, def.key),
    [clipId, def.key, onReset],
  );

  if (def.type === 'float') {
    return (
      <div className="font-mono">
        <div className="flex items-center justify-between mb-0.5">
          <label className="text-text-dim text-xs">{def.label}</label>
          <div className="flex items-center gap-1">
            <span className={`text-xs tabular-nums ${isOverridden ? 'text-accent-cyan' : 'text-text-secondary'}`}>
              {current.toFixed(def.step < 0.1 ? 2 : def.step < 1 ? 1 : 0)}
            </span>
            {isOverridden && (
              <button
                onClick={handleReset}
                className="text-[9px] text-text-dim hover:text-accent-magenta px-1"
                title={`Reset to ${def.default}`}
              >
                ↺
              </button>
            )}
          </div>
        </div>
        <input
          type="range"
          min={def.min}
          max={def.max}
          step={def.step}
          value={current}
          onChange={handleChange}
          className="w-full h-1.5 accent-accent-cyan cursor-pointer"
        />
      </div>
    );
  }

  return null;
}

function CopyParamsButton({ paramDefs, clipParams }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const lines = paramDefs.map((def) => {
      const val = clipParams[def.key] ?? def.default;
      const formatted = def.type === 'float'
        ? (def.step < 0.01 ? val.toFixed(3) : def.step < 0.1 ? val.toFixed(2) : def.step < 1 ? val.toFixed(1) : String(val))
        : String(val);
      return `- ${def.label}: ${formatted}`;
    });
    navigator.clipboard.writeText(lines.join('\n')).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [paramDefs, clipParams]);

  return (
    <button
      onClick={handleCopy}
      className={`px-2 py-1 rounded text-xs transition-colors ${
        copied ? 'bg-accent-purple/30 text-accent-purple' : 'bg-surface-600 text-text-dim'
      }`}
      title="Copy all parameter values to clipboard"
    >
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  );
}

function Row({ label, value, accent }) {
  return (
    <div className="flex gap-2">
      <dt className="text-text-dim w-20 shrink-0">{label}:</dt>
      <dd className={accent ? 'text-accent-cyan' : 'text-text-primary'}>{value}</dd>
    </div>
  );
}
