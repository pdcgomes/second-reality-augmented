import { useEditorStore } from '../store/editorStore';

export default function ClipProperties() {
  const clip = useEditorStore((s) => s.getSelectedClip());

  if (!clip) {
    return (
      <div className="p-3">
        <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">CLIP PROPERTIES</h2>
        <p className="text-text-dim text-sm">No clip selected</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">CLIP PROPERTIES</h2>
      <dl className="space-y-2 text-sm font-mono">
        <div className="flex gap-2">
          <dt className="text-text-dim w-20">Effect:</dt>
          <dd className="text-text-primary">{clip.effect}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-text-dim w-20">Start:</dt>
          <dd className="text-text-primary">{clip.start.toFixed(3)}s</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-text-dim w-20">End:</dt>
          <dd className="text-text-primary">{clip.end.toFixed(3)}s</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-text-dim w-20">Duration:</dt>
          <dd className="text-text-primary">{(clip.end - clip.start).toFixed(3)}s</dd>
        </div>
      </dl>
    </div>
  );
}
