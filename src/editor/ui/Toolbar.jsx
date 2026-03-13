import { useState } from 'react';
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

  const [exportStatus, setExportStatus] = useState(null);

  async function handleExport() {
    setExportStatus('exporting');
    try {
      const res = await fetch('/api/export', { method: 'POST' });
      const data = await res.json();
      if (data.ok) {
        setExportStatus(`done (${data.size} MB)`);
        setTimeout(() => setExportStatus(null), 4000);
      } else {
        console.error('Export error:', data.error);
        setExportStatus('error');
        setTimeout(() => setExportStatus(null), 5000);
      }
    } catch (e) {
      console.error('Export failed:', e);
      setExportStatus('error');
      setTimeout(() => setExportStatus(null), 5000);
    }
  }

  const bpm = project?.beatMap?.track0BPM ?? project?.beatMap?.bpm ?? '—';
  const musicPos = musicLoaded && modPlayer ? `P${modPlayer.position}:R${modPlayer.row}` : null;
  const timecode = formatTimecode(playheadSeconds);

  return (
    <div className="bg-surface-800 border-b border-border px-4 py-2 flex items-center gap-4 text-sm font-mono">
      <div className="flex items-center gap-1">
        <button
          onClick={togglePlayback}
          className="h-7 px-3 inline-flex items-center rounded text-xs bg-surface-600 hover:bg-accent-blue/30 text-text-primary transition-colors"
          title="Play/Pause (Space)"
        >
          {isPlaying ? '⏸' : '▶'}<Kbd>␣</Kbd>
        </button>
        <button
          onClick={stopPlayback}
          className="h-7 px-3 inline-flex items-center rounded text-xs bg-surface-600 hover:bg-accent-blue/30 text-text-primary transition-colors"
          title="Stop (Home)"
        >
          ⏹<Kbd>⇱</Kbd>
        </button>
        <button
          onClick={toggleLoop}
          className={`h-7 px-3 inline-flex items-center rounded text-xs transition-colors ${
            loopEffect ? 'bg-accent-cyan/30 text-accent-cyan' : 'bg-surface-600 text-text-dim'
          }`}
          title="Loop Effect (L)"
        >
          ⟳ LOOP<Kbd>L</Kbd>
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
        className={`h-7 px-2 inline-flex items-center rounded text-xs transition-colors ${
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
          className={`h-7 px-2 inline-flex items-center rounded text-xs transition-colors ${
            variant === 'classic' || linked
              ? 'bg-accent-blue/30 text-accent-blue'
              : 'bg-surface-600 text-text-dim'
          }`}
        >
          CLASSIC<Kbd>X</Kbd>
        </button>
        <button
          onClick={toggleLinked}
          className={`h-7 px-1.5 inline-flex items-center rounded text-xs transition-colors ${
            linked
              ? 'bg-gradient-to-r from-accent-blue/30 to-accent-purple/30 text-text-primary'
              : 'bg-surface-600 text-text-dim'
          }`}
          title="Compare Classic & Remastered side-by-side"
        >
          ⟷<Kbd>V</Kbd>
        </button>
        <button
          onClick={() => { if (linked) toggleLinked(); setVariant('remastered'); }}
          className={`h-7 px-2 inline-flex items-center rounded text-xs transition-colors ${
            variant === 'remastered' || linked
              ? 'bg-accent-purple/30 text-accent-purple'
              : 'bg-surface-600 text-text-dim'
          }`}
        >
          REMASTERED<Kbd>X</Kbd>
        </button>
      </div>

      <button className="h-7 px-3 inline-flex items-center rounded bg-surface-600 hover:bg-accent-blue/30 text-text-secondary text-xs transition-colors">
        SAVE
      </button>
      <button
        onClick={handleExport}
        disabled={exportStatus === 'exporting'}
        className={`h-7 px-3 inline-flex items-center rounded text-xs font-bold transition-colors ${
          exportStatus === 'done' ? 'bg-accent-green/20 text-accent-green'
            : exportStatus === 'error' ? 'bg-red-500/20 text-red-400'
            : exportStatus === 'exporting' ? 'bg-surface-600 text-text-dim cursor-wait'
            : 'bg-accent-blue/20 hover:bg-accent-blue/40 text-accent-blue'
        }`}
      >
        {exportStatus === 'exporting' ? 'EXPORTING\u2026'
          : exportStatus?.startsWith('done') ? `\u2713 ${exportStatus.replace('done ', '')}`
          : exportStatus === 'error' ? 'EXPORT FAILED'
          : 'EXPORT DEMO'}
      </button>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] px-1.5 py-0.5 text-[9px] leading-none rounded border border-white/20 bg-white/10 text-white/40 font-mono">
      {children}
    </kbd>
  );
}

function formatTimecode(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, '0')}:${secs.toFixed(3).padStart(6, '0')}`;
}
