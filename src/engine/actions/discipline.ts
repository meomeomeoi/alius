import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { disciplineDayStep } from '../discipline/dayStep';
import { applyPunishment } from '../discipline/punish';

// Importing this module registers the P9 discipline actions and its day-end step. The step is registered after the loyalty
// step (`actions/loyalty`), so import this module after it.

registerDayEndStep('director_tick', disciplineDayStep);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The menu path: the commander picks a measure (and the days of a brig) for a unit. Draws no rng. */
registerAction('discipline/punish', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || typeof payload.measure !== 'string') throw new Error('discipline/punish needs { unitId, measure }');
  if (payload.days !== undefined && typeof payload.days !== 'number') throw new Error('discipline/punish: days must be a number');
  const inScene = draft.scene?.participants.includes(payload.unitId) === true;
  return applyPunishment(draft, ctx, {
    unitId: payload.unitId, measure: payload.measure, ...(payload.days !== undefined ? { days: payload.days } : {}), source: 'menu',
    channel: inScene ? 'scene' : 'pda', ...(inScene && draft.scene ? { sceneId: draft.scene.id } : {}),
  });
});
