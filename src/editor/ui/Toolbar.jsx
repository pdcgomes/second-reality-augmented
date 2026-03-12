import { useEditorStore } from '../store/editorStore';

export default function Toolbar() {
  const { isPlaying, playheadSeconds, snapToBeat, variant, setPlaying, toggleSnap, setVariant } =
    useEditorStore();

  const timecode = formatTimecode(playheadSeconds);

  return (
    <div className="bg-surface-800 border-b border-border px-4 py-2 flex items-center gap-4 text-sm font-mono">
      {/* Transport controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setPlaying(!isPlaying)}
          className="px-3 py-1 rounded bg-surface-600 hover:bg-accent-blue/30 text-text-primary transition-colors"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={() => setPlaying(false)}
          className="px-3 py-1 rounded bg-surface-600 hover:bg-accent-blue/30 text-text-primary transition-colors"
        >
          ⏹
        </button>
      </div>

      {/* Timecode */}
      <div className="text-accent-cyan tabular-nums">{timecode}</div>

      {/* BPM display */}
      <div className="text-text-secondary">BPM: 125</div>

      {/* Beat snap */}
      <button
        onClick={toggleSnap}
        className={`px-2 py-1 rounded text-xs transition-colors ${
          snapToBeat ? 'bg-accent-purple/30 text-accent-purple' : 'bg-surface-600 text-text-dim'
        }`}
      >
        ♩ SNAP
      </button>

      <div className="flex-1" />

      {/* Variant toggle */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setVariant('classic')}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            variant === 'classic'
              ? 'bg-accent-blue/30 text-accent-blue'
              : 'bg-surface-600 text-text-dim'
          }`}
        >
          CLASSIC
        </button>
        <button
          onClick={() => setVariant('remastered')}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            variant === 'remastered'
              ? 'bg-accent-purple/30 text-accent-purple'
              : 'bg-surface-600 text-text-dim'
          }`}
        >
          REMASTERED
        </button>
      </div>

      {/* File ops */}
      <button className="px-3 py-1 rounded bg-surface-600 hover:bg-accent-blue/30 text-text-secondary text-xs transition-colors">
        SAVE
      </button>
      <button className="px-3 py-1 rounded bg-accent-blue/20 hover:bg-accent-blue/40 text-accent-blue text-xs font-bold transition-colors">
        EXPORT DEMO
      </button>
    </div>
  );
}

function formatTimecode(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}
