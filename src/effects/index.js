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
import u2aClassic from './u2a/effect.js';
import pamClassic from './pam/effect.js';
import beglogoClassic from './beglogo/effect.js';
import glenzTransitionClassic from './glenzTransition/effect.js';
import glenzVectorsClassic from './glenzVectors/effect.js';
import tunneliClassic from './tunneli/effect.js';
import technoCirclesClassic from './technoCircles/effect.js';
import technoBarsTransitionClassic from './technoBarsTransition/effect.js';
import technoBarsClassic from './technoBars/effect.js';
import technoTrollClassic from './technoTroll/effect.js';
import forestClassic from './forest/effect.js';
import lensTransitionClassic from './lensTransition/effect.js';
import lensClassic from './lens/effect.js';
import rotozoomClassic from './rotozoom/effect.js';
import plasmaClassic from './plasma/effect.js';
import plzCubeClassic from './plzCube/effect.js';
import dotsClassic from './dots/effect.js';
import waterClassic from './water/effect.js';
import voxelLandscapeClassic from './voxelLandscape/effect.js';
import jplogoClassic from './jplogo/effect.js';
import u2eClassic from './u2e/effect.js';
import endlogoClassic from './endlogo/effect.js';
import creditsClassic from './credits/effect.js';
import scrolltextClassic from './scrolltext/effect.js';

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

// Original demo sequence
registerEffect('alku', alkuClassic);
registerEffect('u2a', u2aClassic);
registerEffect('pam', pamClassic);
registerEffect('beglogo', beglogoClassic);
registerEffect('glenzTransition', glenzTransitionClassic);
registerEffect('glenzVectors', glenzVectorsClassic);
registerEffect('tunneli', tunneliClassic);
registerEffect('technoCircles', technoCirclesClassic);
registerEffect('technoBarsTransition', technoBarsTransitionClassic);
registerEffect('technoBars', technoBarsClassic);
registerEffect('technoTroll', technoTrollClassic);
registerEffect('forest', forestClassic);
registerEffect('lensTransition', lensTransitionClassic);
registerEffect('lens', lensClassic);
registerEffect('rotozoom', rotozoomClassic);
registerEffect('plasma', plasmaClassic);
registerEffect('plzCube', plzCubeClassic);
registerEffect('dots', dotsClassic);
registerEffect('water', waterClassic);
registerEffect('voxelLandscape', voxelLandscapeClassic);
registerEffect('jplogo', jplogoClassic);
registerEffect('u2e', u2eClassic);
registerEffect('endlogo', endlogoClassic);
registerEffect('credits', creditsClassic);
registerEffect('scrolltext', scrolltextClassic);

// Bonus / hidden effects
registerEffect('starfield', starfieldClassic, null, { bonus: true, hidden: true });
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

export function hasEffect(name) {
  return name in registry;
}
