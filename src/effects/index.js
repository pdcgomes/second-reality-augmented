/**
 * Effect registry — maps effect names to their classic and remastered modules.
 *
 * The main demo sequence follows the original Second Reality part order.
 * Bonus effects (not in the original demo) are flagged separately.
 *
 * Interface contract for every variant:
 *   export default {
 *     init(gl) { },
 *     render(gl, t, beat, params) { },
 *     destroy(gl) { }
 *   }
 */

// ── Original demo sequence (25 visual parts) ──────────────────────
import alkuClassic from './alku/effect.js';
import alkuRemastered from './alku/effect.remastered.js';
import u2aClassic from './u2a/effect.js';
import u2aRemastered from './u2a/effect.remastered.js';
import pamClassic from './pam/effect.js';
import pamRemastered from './pam/effect.remastered.js';
import beglogoClassic from './beglogo/effect.js';
import beglogoRemastered from './beglogo/effect.remastered.js';
import glenzTransitionClassic from './glenzTransition/effect.js';
import glenzTransitionRemastered from './glenzTransition/effect.remastered.js';
import glenzVectorsClassic from './glenzVectors/effect.js';
import glenzVectorsRemastered from './glenzVectors/effect.remastered.js';
import dotsRemastered from './dots/effect.remastered.js';
import tunneliClassic from './tunneli/effect.js';
import tunneliRemastered from './tunneli/effect.remastered.js';
import technoCirclesClassic from './technoCircles/effect.js';
import technoCirclesRemastered from './technoCircles/effect.remastered.js';
import technoBarsTransitionClassic from './technoBarsTransition/effect.js';
import technoBarsClassic from './technoBars/effect.js';
import technoBarsRemastered from './technoBars/effect.remastered.js';
import technoTrollClassic from './technoTroll/effect.js';
import forestClassic from './forest/effect.js';
import lensTransitionClassic from './lensTransition/effect.js';
import lensClassic from './lens/effect.js';
import lensRemastered from './lens/effect.remastered.js';
import rotozoomClassic from './rotozoom/effect.js';
import rotozoomRemastered from './rotozoom/effect.remastered.js';
import plasmaClassic from './plasma/effect.js';
import plasmaRemastered from './plasma/effect.remastered.js';
import plzCubeClassic from './plzCube/effect.js';
import plzCubeRemastered from './plzCube/effect.remastered.js';
import dotsClassic from './dots/effect.js';
import waterClassic from './water/effect.js';
import waterRemastered from './water/effect.remastered.js';
import comanClassic from './coman/effect.js';
import comanRemastered from './coman/effect.remastered.js';
import jplogoClassic from './jplogo/effect.js';
import jplogoRemastered from './jplogo/effect.remastered.js';
import u2eClassic from './u2e/effect.js';
import u2eRemastered from './u2e/effect.remastered.js';
import endlogoClassic from './endlogo/effect.js';
import endlogoRemastered from './endlogo/effect.remastered.js';
import creditsClassic from './credits/effect.js';
import creditsRemastered from './credits/effect.remastered.js';
import endscrlClassic from './endscrl/effect.js';

// ── Bonus effects (not in original demo) ──────────────────────────
import starfieldClassic from './starfield/effect.js';
import copperBarsClassic from './copperBars/effect.js';
import fireClassic from './fire/effect.js';
import wireframe3dClassic from './wireframe3d/effect.js';
import vectorBallsClassic from './vectorBalls/effect.js';
import bouncingBitmapClassic from './bouncingBitmap/effect.js';
import gridClassic from './grid/effect.js';
import tunnelClassic from './tunnel/effect.js';

const registry = {};

// Original demo sequence — names match the original Second Reality part identifiers
registerEffect('ALKU', alkuClassic, alkuRemastered);
registerEffect('U2A', u2aClassic, u2aRemastered);
registerEffect('PAM', pamClassic, pamRemastered);
registerEffect('BEGLOGO', beglogoClassic, beglogoRemastered);
registerEffect('GLENZ_TRANSITION', glenzTransitionClassic, glenzTransitionRemastered);
registerEffect('GLENZ_3D', glenzVectorsClassic, glenzVectorsRemastered);
registerEffect('TUNNELI', tunneliClassic, tunneliRemastered);
registerEffect('TECHNO_CIRCLES', technoCirclesClassic, technoCirclesRemastered);
registerEffect('TECHNO_BARS_TRANSITION', technoBarsTransitionClassic);
registerEffect('TECHNO_BARS', technoBarsClassic, technoBarsRemastered);
registerEffect('TECHNO_TROLL', technoTrollClassic);
registerEffect('FOREST', forestClassic);
registerEffect('LENS_TRANSITION', lensTransitionClassic);
registerEffect('LENS_LENS', lensClassic, lensRemastered);
registerEffect('LENS_ROTO', rotozoomClassic, rotozoomRemastered);
registerEffect('PLZ_PLASMA', plasmaClassic, plasmaRemastered);
registerEffect('PLZ_CUBE', plzCubeClassic, plzCubeRemastered);
registerEffect('DOTS', dotsClassic, dotsRemastered);
registerEffect('WATER', waterClassic, waterRemastered);
registerEffect('COMAN', comanClassic, comanRemastered);
registerEffect('JPLOGO', jplogoClassic, jplogoRemastered);
registerEffect('U2E', u2eClassic, u2eRemastered);
registerEffect('ENDLOGO', endlogoClassic, endlogoRemastered);
registerEffect('CREDITS', creditsClassic, creditsRemastered);
registerEffect('ENDSCRL', endscrlClassic);

// Bonus / hidden effects
registerEffect('DDSTARS', starfieldClassic, null, { bonus: true, hidden: true });
registerEffect('copperBars', copperBarsClassic, null, { bonus: true });
registerEffect('fire', fireClassic, null, { bonus: true });
registerEffect('wireframe3d', wireframe3dClassic, null, { bonus: true });
registerEffect('vectorBalls', vectorBallsClassic, null, { bonus: true });
registerEffect('bouncingBitmap', bouncingBitmapClassic, null, { bonus: true });
registerEffect('grid', gridClassic, null, { bonus: true });
registerEffect('tunnel', tunnelClassic, null, { bonus: true });

export function registerEffect(name, classic, remastered = null, flags = {}) {
  registry[name] = { classic, remastered, ...flags };
}

export function getEffect(name, variant = 'classic') {
  const entry = registry[name];
  if (!entry) return null;
  if (variant === 'remastered' && entry.remastered) return entry.remastered;
  return entry.classic;
}

export function listEffects() {
  return Object.entries(registry).map(([name, entry]) => ({
    name,
    hasRemastered: !!entry.remastered,
    bonus: !!entry.bonus,
    hidden: !!entry.hidden,
  }));
}

export function listDemoEffects() {
  return listEffects().filter((e) => !e.bonus);
}

export function getEffectParams(name, variant = 'classic') {
  const mod = getEffect(name, variant);
  return mod?.params ?? [];
}

/**
 * Merge descriptor defaults with clip-level overrides so render() always
 * receives the fully-resolved values — no reliance on hardcoded fallbacks.
 */
export function resolveParams(name, variant, clipParams = {}) {
  const defs = getEffectParams(name, variant);
  if (!defs.length) return clipParams;
  const resolved = {};
  for (const def of defs) {
    resolved[def.key] = clipParams[def.key] ?? def.default;
  }
  return resolved;
}

export function hasVariant(name, variant) {
  const entry = registry[name];
  if (!entry) return false;
  if (variant === 'remastered') return !!entry.remastered;
  return !!entry.classic;
}

export function hasEffect(name) {
  return name in registry;
}

/**
 * Shorthand for defining a parameter within a named group.
 * Equivalent to { ...def, group }.
 */
export function gp(group, def) {
  return { ...def, group };
}
