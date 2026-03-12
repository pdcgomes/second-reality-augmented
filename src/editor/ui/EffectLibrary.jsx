const EFFECT_NAMES = [
  'copperBars',
  'starfield',
  'scrolltext',
  'plasma',
  'rotozoom',
  'fire',
  'tunnel',
  'glenzVectors',
  'dots',
  'grid',
  'lens',
  'voxelLandscape',
  'creature',
  'spacecraft3d',
  'wireframe3d',
  'vectorBalls',
  'jpLogo',
  'credits',
  'endScroll',
];

export default function EffectLibrary() {
  return (
    <div className="p-3">
      <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">EFFECT LIBRARY</h2>
      <ul className="space-y-1">
        {EFFECT_NAMES.map((name) => (
          <li
            key={name}
            className="px-2 py-1 rounded text-sm font-mono text-text-secondary hover:bg-surface-600 hover:text-text-primary cursor-pointer transition-colors"
          >
            {name}
          </li>
        ))}
      </ul>
    </div>
  );
}
