import { create } from 'zustand';

export const useEditorStore = create((set, get) => ({
  project: null,
  playheadSeconds: 0,
  isPlaying: false,
  selectedClipId: null,
  zoomLevel: 1,
  snapToBeat: true,
  variant: 'classic',

  setProject: (project) => set({ project }),
  setPlayhead: (seconds) => set({ playheadSeconds: seconds }),
  setPlaying: (isPlaying) => set({ isPlaying }),
  selectClip: (clipId) => set({ selectedClipId: clipId }),
  setZoom: (zoomLevel) => set({ zoomLevel }),
  toggleSnap: () => set((s) => ({ snapToBeat: !s.snapToBeat })),
  setVariant: (variant) => set({ variant }),

  getSelectedClip: () => {
    const { project, selectedClipId } = get();
    if (!project || !selectedClipId) return null;
    return project.clips.find((c) => c.id === selectedClipId) ?? null;
  },
}));
