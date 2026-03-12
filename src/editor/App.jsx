import { useEffect, useRef } from 'react';
import Toolbar from './ui/Toolbar';
import Preview from './ui/Preview';
import Tracker from './ui/Tracker';
import Timeline from './ui/Timeline';
import EffectLibrary from './ui/EffectLibrary';
import ClipProperties from './ui/ClipProperties';
import { useEditorStore } from './store/editorStore';
import { getRegionAtTime, timeToMusicPos } from '../core/musicsync.js';

export default function App() {
  const { setProject, setMusicLoaded, setMusicError, togglePlayback, stopPlayback, nudgePlayhead, jumpToClip, toggleVariant, toggleLoop, isPlaying, clock, modPlayer } =
    useEditorStore();
  const loopClipRef = useRef(null);
  const prevLoopTimeRef = useRef(null);

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

  // Playback tick — sample-counted time drives the playhead. Automatically
  // switches music at region boundaries (no silence gaps in the original demo).
  useEffect(() => {
    if (!isPlaying) return;
    let raf;
    function tick() {
      const { musicLoaded, loopEffect, project } = useEditorStore.getState();

      if (!musicLoaded) {
        let t = clock.currentTime();
        if (loopEffect && project?.clips) {
          t = applyLoop(t, project.clips, musicLoaded);
        }
        useEditorStore.setState({ playheadSeconds: t });
        raf = requestAnimationFrame(tick);
        return;
      }

      let t = modPlayer.currentTime();

      if (loopEffect && project?.clips) {
        t = applyLoop(t, project.clips, musicLoaded);
      }

      const region = getRegionAtTime(t);

      // The audio engine sets reachedBoundary when the S3M player crosses
      // the region's stop position. This is sample-accurate and happens
      // before the rAF loop would normally detect the region mismatch.
      if (!loopEffect && (modPlayer.reachedBoundary || (region && region.music !== modPlayer.activeIndex))) {
        const target = timeToMusicPos(t);
        if (target.music !== modPlayer.activeIndex ||
            modPlayer.reachedBoundary) {
          modPlayer.changeMusic(target.music, target.position, target.row);
          clock.seek(t);
        }
      }

      useEditorStore.setState({ playheadSeconds: t });
      raf = requestAnimationFrame(tick);
    }

    function applyLoop(t, clips, musicLoaded) {
      const lc = loopClipRef.current;
      const prevT = prevLoopTimeRef.current;
      const jumped = prevT !== null && Math.abs(t - prevT) > 0.25;

      if (lc && t >= lc.end && !jumped) {
        clock.seek(lc.start);
        if (musicLoaded) modPlayer.seekToTime(lc.start);
        prevLoopTimeRef.current = lc.start;
        return lc.start;
      }

      const clip = clips.find((c) => t >= c.start && t < c.end);
      if (clip) loopClipRef.current = clip;
      prevLoopTimeRef.current = t;
      return t;
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
        case 'KeyX':
          e.preventDefault();
          toggleVariant();
          break;
        case 'KeyL':
          e.preventDefault();
          toggleLoop();
          break;
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [togglePlayback, stopPlayback, nudgePlayhead, jumpToClip, toggleVariant, toggleLoop]);

  return (
    <div className="h-screen w-screen grid grid-rows-[auto_1fr_240px_1fr] grid-cols-[1fr_1fr] gap-px bg-border">
      <div className="col-span-2">
        <Toolbar />
      </div>

      <div className="bg-surface-900 flex items-center justify-center">
        <Preview />
      </div>
      <div className="bg-surface-900">
        <Tracker />
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
