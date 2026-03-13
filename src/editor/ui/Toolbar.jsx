import { useEditorStore } from '../store/editorStore';

export default function Toolbar() {
  const {
    isPlaying,
    playheadSeconds,
    snapToBeat,
    variant,
    linked,
    project,
    musicLoaded,
    musicError,
    modPlayer,
    loopEffect,
    togglePlayback,
    stopPlayback,
    toggleSnap,
    toggleLoop,
    setVariant,
    toggleLinked,
    zoomLevel,
    setZoom,
  } = useEditorStore();

  const bpm = project?.beatMap?.track0BPM ?? project?.beatMap?.bpm ?? '—';
  const musicPos = musicLoaded && modPlayer ? `P${modPlayer.position}:R${modPlayer.row}` : null;
  const timecode = formatTimecode(playheadSeconds);

  return (
    <div className="bg-surface-800 border-b border-border px-4 py-2 flex items-center gap-4 text-sm font-mono">
      <div className="flex items-center gap-1">
        <button
          onClick={togglePlayback}
          className="px-3 py-1 rounded bg-surface-600 hover:bg-accent-blue/30 text-text-primary transition-colors"
          title="Play/Pause (Space)"
        >
          {isPlaying ? '⏸' : '▶'}
        </button>
        <button
          onClick={stopPlayback}
          className="px-3 py-1 rounded bg-surface-600 hover:bg-accent-blue/30 text-text-primary transition-colors"
          title="Stop (Home)"
        >
          ⏹
        </button>
        <button
          onClick={toggleLoop}
          className={`px-3 py-1 rounded text-xs transition-colors ${
            loopEffect ? 'bg-accent-cyan/30 text-accent-cyan' : 'bg-surface-600 text-text-dim'
          }`}
          title="Loop Effect (L)"
        >
          ⟳ LOOP
        </button>
      </div>

      <div className="text-accent-cyan tabular-nums w-28">{timecode}</div>

      <div className="text-text-secondary">BPM: {bpm}</div>
      {musicPos && <div className="text-accent-green text-xs tabular-nums">{musicPos}</div>}
      {musicLoaded && <div className="text-accent-green text-xs">♫ S3M</div>}
      {!musicLoaded && !musicError && <div className="text-text-dim text-xs">S3M loading...</div>}
      {musicError && <div className="text-red-400 text-xs" title={musicError}>♫ S3M error</div>}

      <button
        onClick={toggleSnap}
        className={`px-2 py-1 rounded text-xs transition-colors ${
          snapToBeat ? 'bg-accent-purple/30 text-accent-purple' : 'bg-surface-600 text-text-dim'
        }`}
        title="Beat Snap"
      >
        ♩ SNAP
      </button>

      {/* Zoom slider */}
      <div className="flex items-center gap-1 text-text-dim text-xs">
        <span>ZOOM</span>
        <input
          type="range"
          min="0.25"
          max="16"
          step="0.25"
          value={zoomLevel}
          onChange={(e) => setZoom(parseFloat(e.target.value))}
          className="w-20 accent-accent-blue"
        />
        <span className="w-8 text-right">{zoomLevel.toFixed(1)}×</span>
      </div>

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <button
          onClick={() => { if (linked) toggleLinked(); setVariant('classic'); }}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            variant === 'classic' || linked
              ? 'bg-accent-blue/30 text-accent-blue'
              : 'bg-surface-600 text-text-dim'
          }`}
        >
          CLASSIC
        </button>
        <button
          onClick={toggleLinked}
          className={`px-1.5 py-1 rounded text-xs transition-colors ${
            linked
              ? 'bg-gradient-to-r from-accent-blue/30 to-accent-purple/30 text-text-primary'
              : 'bg-surface-600 text-text-dim'
          }`}
          title="Compare Classic & Remastered side-by-side"
        >
          ⟷
        </button>
        <button
          onClick={() => { if (linked) toggleLinked(); setVariant('remastered'); }}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            variant === 'remastered' || linked
              ? 'bg-accent-purple/30 text-accent-purple'
              : 'bg-surface-600 text-text-dim'
          }`}
        >
          REMASTERED
        </button>
      </div>

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
