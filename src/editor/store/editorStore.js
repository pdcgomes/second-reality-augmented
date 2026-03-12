import { create } from 'zustand';
import { Clock } from '@core/clock.js';
import { nearestBeat } from '@core/beatmap.js';
import { ModPlayer } from '@core/modplayer.js';
import { timeToMusicPos } from '@core/musicsync.js';

const clock = new Clock();
const modPlayer = new ModPlayer();

export const useEditorStore = create((set, get) => ({
  project: null,
  playheadSeconds: 0,
  isPlaying: false,
  selectedClipId: null,
  zoomLevel: 1,
  snapToBeat: true,
  variant: 'classic',
  previewFit: 'fill',
  clock,
  modPlayer,
  musicLoaded: false,

  setProject: (project) => set({ project }),

  musicError: null,
  setMusicLoaded: (loaded) => set({ musicLoaded: loaded }),
  setMusicError: (err) => set({ musicError: err }),

  setPlayhead: (seconds) => {
    const { project, snapToBeat, isPlaying, musicLoaded } = get();
    let t = Math.max(0, seconds);
    if (snapToBeat && project?.beatMap) {
      t = nearestBeat(t, project.beatMap);
    }
    clock.seek(t);
    if (isPlaying && musicLoaded) {
      modPlayer.seekToTime(t);
    }
    set({ playheadSeconds: t });
  },

  setPlayheadRaw: (seconds) => {
    const { isPlaying, musicLoaded } = get();
    const t = Math.max(0, seconds);
    clock.seek(t);
    if (isPlaying && musicLoaded) {
      modPlayer.seekToTime(t);
    }
    set({ playheadSeconds: t });
  },

  togglePlayback: () => {
    const { isPlaying, musicLoaded, playheadSeconds } = get();
    if (isPlaying) {
      clock.pause();
      if (musicLoaded) modPlayer.pause();
      const t = musicLoaded ? modPlayer.currentTime() : clock.currentTime();
      set({ isPlaying: false, playheadSeconds: t });
    } else {
      clock.seek(playheadSeconds);
      clock.play();
      if (musicLoaded) {
        const target = timeToMusicPos(playheadSeconds);
        modPlayer.play(target.music, target.position, target.row);
      }
      set({ isPlaying: true });
    }
  },

  stopPlayback: () => {
    clock.pause();
    clock.seek(0);
    if (get().musicLoaded) modPlayer.stop();
    set({ isPlaying: false, playheadSeconds: 0 });
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setZoom: (zoomLevel) => set({ zoomLevel: Math.max(0.25, Math.min(16, zoomLevel)) }),
  toggleSnap: () => set((s) => ({ snapToBeat: !s.snapToBeat })),
  setVariant: (variant) => set({ variant }),
  togglePreviewFit: () => set((s) => ({ previewFit: s.previewFit === 'fill' ? 'native' : 'fill' })),

  getSelectedClip: () => {
    const { project, selectedClipId } = get();
    if (!project || !selectedClipId) return null;
    return project.clips.find((c) => c.id === selectedClipId) ?? null;
  },

  getDuration: () => {
    const { project } = get();
    if (!project?.clips?.length) return 60;
    return Math.max(...project.clips.map((c) => c.end));
  },

  nudgePlayhead: (beats) => {
    const { project, playheadSeconds, isPlaying, musicLoaded } = get();
    const bpm = project?.beatMap?.track0BPM ?? project?.beatMap?.bpm ?? 125;
    const beatDuration = 60 / bpm;
    const t = Math.max(0, playheadSeconds + beats * beatDuration);
    clock.seek(t);
    if (isPlaying && musicLoaded) {
      modPlayer.seekToTime(t);
    }
    set({ playheadSeconds: t });
  },

  jumpToClip: (direction) => {
    const { project, playheadSeconds } = get();
    if (!project?.clips?.length) return;
    const sorted = [...project.clips].sort((a, b) => a.start - b.start);
    if (direction > 0) {
      const next = sorted.find((c) => c.start > playheadSeconds + 0.01);
      if (next) get().setPlayheadRaw(next.start);
    } else {
      const prev = [...sorted].reverse().find((c) => c.start < playheadSeconds - 0.01);
      if (prev) get().setPlayheadRaw(prev.start);
    }
  },
}));
