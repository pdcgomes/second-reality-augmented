import { create } from 'zustand';
import { Clock } from '@core/clock.js';
import { nearestBeat } from '@core/beatmap.js';

const clock = new Clock();

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

  setProject: (project) => set({ project }),

  setPlayhead: (seconds) => {
    const { project, snapToBeat } = get();
    let t = Math.max(0, seconds);
    if (snapToBeat && project?.beatMap) {
      t = nearestBeat(t, project.beatMap);
    }
    clock.seek(t);
    set({ playheadSeconds: t });
  },

  setPlayheadRaw: (seconds) => {
    const t = Math.max(0, seconds);
    clock.seek(t);
    set({ playheadSeconds: t });
  },

  togglePlayback: () => {
    const { isPlaying } = get();
    if (isPlaying) {
      clock.pause();
      set({ isPlaying: false, playheadSeconds: clock.currentTime() });
    } else {
      clock.play();
      set({ isPlaying: true });
    }
  },

  stopPlayback: () => {
    clock.pause();
    clock.seek(0);
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
    const { project, playheadSeconds } = get();
    const bpm = project?.beatMap?.track0BPM ?? project?.beatMap?.bpm ?? 125;
    const beatDuration = 60 / bpm;
    const t = Math.max(0, playheadSeconds + beats * beatDuration);
    clock.seek(t);
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
