import { listEffects } from '@effects/index.js';

const effects = listEffects();
const demoEffects = effects.filter((e) => !e.bonus);
const bonusEffects = effects.filter((e) => e.bonus);

export default function EffectLibrary() {
  return (
    <div className="p-3">
      <h2 className="text-text-dim text-xs font-bold tracking-widest mb-3">EFFECT LIBRARY</h2>

      <h3 className="text-accent-cyan text-[10px] font-bold tracking-wider mb-1 mt-2">ORIGINAL DEMO ({demoEffects.length})</h3>
      <ul className="space-y-0.5 mb-3">
        {demoEffects.map(({ name, hasRemastered }) => (
          <li
            key={name}
            className="px-2 py-1 rounded text-sm font-mono text-text-secondary hover:bg-surface-600 hover:text-text-primary cursor-pointer transition-colors flex items-center gap-2"
          >
            <span>{name}</span>
            {hasRemastered && (
              <span className="text-[9px] text-accent-purple bg-accent-purple/15 px-1 rounded">HD</span>
            )}
          </li>
        ))}
      </ul>

      <h3 className="text-accent-green text-[10px] font-bold tracking-wider mb-1">BONUS ({bonusEffects.length})</h3>
      <ul className="space-y-0.5">
        {bonusEffects.map(({ name, hidden }) => (
          <li
            key={name}
            className="px-2 py-1 rounded text-sm font-mono text-text-dim hover:bg-surface-600 hover:text-text-secondary cursor-pointer transition-colors flex items-center gap-2"
          >
            <span>{name}</span>
            {hidden && (
              <span className="text-[9px] text-text-dim bg-surface-600 px-1 rounded">hidden</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
