import Toolbar from './ui/Toolbar';
import Preview from './ui/Preview';
import Timeline from './ui/Timeline';
import EffectLibrary from './ui/EffectLibrary';
import ClipProperties from './ui/ClipProperties';

export default function App() {
  return (
    <div className="h-screen w-screen grid grid-rows-[auto_1fr_240px_1fr] grid-cols-[1fr_1fr] gap-px bg-border">
      {/* Row 1: Toolbar — spans full width */}
      <div className="col-span-2">
        <Toolbar />
      </div>

      {/* Row 2: Preview + Tracker placeholder */}
      <div className="bg-surface-900 flex items-center justify-center">
        <Preview />
      </div>
      <div className="bg-surface-900 flex items-center justify-center">
        <span className="text-text-dim text-sm font-mono">TRACKER (Phase 1f)</span>
      </div>

      {/* Row 3: Timeline — spans full width */}
      <div className="col-span-2">
        <Timeline />
      </div>

      {/* Row 4: Effect Library + Clip Properties */}
      <div className="bg-surface-900 overflow-y-auto">
        <EffectLibrary />
      </div>
      <div className="bg-surface-900 overflow-y-auto">
        <ClipProperties />
      </div>
    </div>
  );
}
