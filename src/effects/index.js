/**
 * Effect registry — maps effect names to their classic and remastered modules.
 *
 * File layout per effect:
 *   effects/<name>/effect.js              — Classic (1:1 faithful to original)
 *   effects/<name>/effect.remastered.js   — Remastered (4K, enhanced) — optional
 *
 * Interface contract for every variant:
 *   export default {
 *     init(gl) { },
 *     render(gl, t, beat, params) { },
 *     destroy(gl) { }
 *   }
 */

import copperBarsClassic from './copperBars/effect.js';
import starfieldClassic from './starfield/effect.js';
import scrolltextClassic from './scrolltext/effect.js';
import plasmaClassic from './plasma/effect.js';
import rotozoomClassic from './rotozoom/effect.js';
import fireClassic from './fire/effect.js';
import tunnelClassic from './tunnel/effect.js';
import wireframe3dClassic from './wireframe3d/effect.js';
import vectorBallsClassic from './vectorBalls/effect.js';
import dotsClassic from './dots/effect.js';
import lensClassic from './lens/effect.js';

const registry = {};

registerEffect('copperBars', copperBarsClassic);
registerEffect('starfield', starfieldClassic);
registerEffect('scrolltext', scrolltextClassic);
registerEffect('plasma', plasmaClassic);
registerEffect('rotozoom', rotozoomClassic);
registerEffect('fire', fireClassic);
registerEffect('tunnel', tunnelClassic);
registerEffect('wireframe3d', wireframe3dClassic);
registerEffect('vectorBalls', vectorBallsClassic);
registerEffect('dots', dotsClassic);
registerEffect('lens', lensClassic);

export function registerEffect(name, classic, remastered = null) {
  registry[name] = { classic, remastered };
}

export function getEffect(name, variant = 'classic') {
  const entry = registry[name];
  if (!entry) return null;
  if (variant === 'remastered' && entry.remastered) return entry.remastered;
  return entry.classic;
}

export function listEffects() {
  return Object.entries(registry).map(([name, { remastered }]) => ({
    name,
    hasRemastered: !!remastered,
  }));
}

export function hasEffect(name) {
  return name in registry;
}
