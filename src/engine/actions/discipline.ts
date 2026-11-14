import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { disciplineDayStep } from '../discipline/dayStep';
import { answerDemand, deliverDemand, rollDemands } from '../discipline/demands';
import { applyPunishment } from '../discipline/punish';
import { introduceNickname } from '../discipline/reputation';
import { undoApplication, undoThreat } from '../discipline/undo';

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

/** UNDO — not what I meant: an application read from dialogue (`ap…`) or a threat (`th…`), on its own day and while its scene is open. */
registerAction('discipline/undo', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.id !== 'string') throw new Error('discipline/undo needs { id }');
  return payload.id.startsWith('th') ? undoThreat(draft, ctx, payload.id) : undoApplication(draft, ctx, payload.id);
});

// ---------------------------------------------------------------------------------------------
// Demands

/** The app rolls after a slot change (never during an expedition: the dispatcher refuses the family then). */
registerAction('demand/roll', (draft, _payload, ctx) => rollDemands(draft, ctx));

registerAction('demand/deliver', (draft, payload) => {
  if (!isObj(payload) || typeof payload.demandId !== 'string') throw new Error('demand/deliver needs { demandId }');
  return deliverDemand(draft, payload.demandId, typeof payload.text === 'string' ? payload.text : undefined);
});

registerAction('demand/answer', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.demandId !== 'string' || (payload.answer !== 'grant' && payload.answer !== 'refuse')) throw new Error('demand/answer needs { demandId, answer: "grant" | "refuse" }');
  return answerDemand(draft, ctx, payload.demandId, payload.answer);
});

// ---------------------------------------------------------------------------------------------
// Reputation

/** The first time a unit calls the commander by a new nickname, in a private scene with her. */
registerAction('reputation/introduce', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string') throw new Error('reputation/introduce needs { unitId }');
  return introduceNickname(draft, ctx, payload.unitId);
});
