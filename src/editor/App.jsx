import { useEffect } from 'react';
import Toolbar from './ui/Toolbar';
import Preview from './ui/Preview';
import Timeline from './ui/Timeline';
import EffectLibrary from './ui/EffectLibrary';
import ClipProperties from './ui/ClipProperties';
import { useEditorStore } from './store/editorStore';
import { getRegionAtTime, timeToMusicPos } from '../core/musicsync.js';

export default function App() {
  const { setProject, setMusicLoaded, setMusicError, togglePlayback, stopPlayback, nudgePlayhead, jumpToClip, isPlaying, clock, modPlayer } =
    useEditorStore();

  useEffect(() => {
    fetch('/project.json')
      .then((r) => r.json())
      .then((data) => {
        setProject(data);
        console.log(`Project loaded: ${data.clips?.length} clips`);
      })
      .catch((e) => console.warn('Could not load project.json:', e.message));
  }, [setProject]);

  useEffect(() => {
    Promise.all([
      fetch('/MUSIC0.S3M').then((r) => r.arrayBuffer()),
      fetch('/MUSIC1.S3M').then((r) => r.arrayBuffer()),
    ])
      .then(([m0, m1]) => modPlayer.loadBoth(m0, m1))
      .then(() => {
        setMusicLoaded(true);
        console.log('S3M music loaded (MUSIC0 + MUSIC1)');
      })
      .catch((e) => {
        console.warn('Could not load S3M music:', e.message);
        setMusicError(e.message);
      });
  }, [modPlayer, setMusicLoaded, setMusicError]);

  // Playback tick — sample-counted time when music is active, clock during
  // silent gaps. Automatically stops/starts music at cue boundaries.
  useEffect(() => {
    if (!isPlaying) return;
    let raf;
    function tick() {
      const { musicLoaded } = useEditorStore.getState();

      if (!musicLoaded) {
        useEditorStore.setState({ playheadSeconds: clock.currentTime() });
        raf = requestAnimationFrame(tick);
        return;
      }

      // During silence the sample counter is frozen — use the clock instead
      const t = modPlayer.activeIndex >= 0
        ? modPlayer.currentTime()
        : clock.currentTime();

      const region = getRegionAtTime(t);

      if (!region && modPlayer.activeIndex >= 0) {
        // Crossed into a silent gap — sync clock, then stop music
        clock.seek(t);
        modPlayer.enterSilence(t);
      } else if (region && modPlayer.activeIndex < 0) {
        // Exiting a gap — start the next music region
        const target = timeToMusicPos(t);
        if (!target.silent) {
          modPlayer.play(target.music, target.position, target.row, t);
          clock.seek(t);
        }
      } else if (region && modPlayer.activeIndex >= 0 && region.music !== modPlayer.activeIndex) {
        // Direct region switch (different music index)
        const target = timeToMusicPos(t);
        if (!target.silent) {
          modPlayer.changeMusic(target.music, target.position, target.row);
          clock.seek(t);
        }
      }

      useEditorStore.setState({ playheadSeconds: t });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, clock, modPlayer]);

  // Keyboard shortcuts
  useEffect(() => {
    function onKey(e) {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlayback();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          nudgePlayhead(e.shiftKey ? -4 : -1);
          break;
        case 'ArrowRight':
          e.preventDefault();
          nudgePlayhead(e.shiftKey ? 4 : 1);
          break;
        case 'BracketLeft':
          e.preventDefault();
          jumpToClip(-1);
          break;
        case 'BracketRight':
          e.preventDefault();
          jumpToClip(1);
          break;
        case 'Home':
          e.preventDefault();
          stopPlayback();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlayback, stopPlayback, nudgePlayhead, jumpToClip]);

  return (
    <div className="h-screen w-screen grid grid-rows-[auto_1fr_240px_1fr] grid-cols-[1fr_1fr] gap-px bg-border">
      <div className="col-span-2">
        <Toolbar />
      </div>

      <div className="bg-surface-900 flex items-center justify-center">
        <Preview />
      </div>
      <div className="bg-surface-900 flex items-center justify-center">
        <span className="text-text-dim text-sm font-mono">TRACKER (Phase 1f)</span>
      </div>

      <div className="col-span-2">
        <Timeline />
      </div>

      <div className="bg-surface-900 overflow-y-auto">
        <EffectLibrary />
      </div>
      <div className="bg-surface-900 overflow-y-auto">
        <ClipProperties />
      </div>
    </div>
  );
}
