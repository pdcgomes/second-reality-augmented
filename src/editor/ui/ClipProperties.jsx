import { useEditorStore } from '../store/editorStore';

export default function ClipProperties() {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const project = useEditorStore((s) => s.project);

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
  const params = clip.params ?? {};
  const paramEntries = Object.entries(params);

  return (
    <div className="p-3">
      <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">CLIP PROPERTIES</h2>
      <dl className="space-y-2 text-sm font-mono">
        <Row label="Effect" value={clip.effect} accent />
        <Row label="ID" value={clip.id} />
        <Row label="Start" value={`${clip.start.toFixed(3)}s`} />
        <Row label="End" value={`${clip.end.toFixed(3)}s`} />
        <Row label="Duration" value={`${duration.toFixed(3)}s`} />
      </dl>

      {paramEntries.length > 0 && (
        <>
          <h3 className="text-text-dim text-xs font-bold tracking-widest mt-4 mb-2">PARAMS</h3>
          <dl className="space-y-1 text-sm font-mono">
            {paramEntries.map(([key, val]) => (
              <Row key={key} label={key} value={String(val)} />
            ))}
          </dl>
        </>
      )}
    </div>
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
