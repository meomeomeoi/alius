import { registerDayEndStep } from '../calendar';
import { startCombat } from './combat';
import { registerAction } from '../dispatch';
import { letGo, loyaltyDayStep, takeBack, talkDown, turnAway } from '../loyalty/desertion';
import { fightPayload, resolveMutiny, yieldToMutiny } from '../loyalty/mutiny';
import { orderInScene } from '../loyalty/refusal';

// Importing this module registers the P6 loyalty actions and the day-end step (more are added by the mutiny module).

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

registerAction('scene/order', (draft, payload, ctx) => {
  const unitId = isObj(payload) ? payload.unitId : undefined;
  if (typeof unitId !== 'string') throw new Error('scene/order needs { unitId }');
  return orderInScene(draft, ctx, unitId);
});

// After P5's director tick (registered first by actions/world): bands, signs, desertion checks and returns.
registerDayEndStep('director_tick', loyaltyDayStep);

registerAction('loyalty/talk_down', (draft, payload, ctx) => {
  const stat = isObj(payload) ? payload.stat : undefined;
  if (stat !== 'authority' && stat !== 'empathy') throw new Error('loyalty/talk_down needs { stat: "authority" | "empathy" }');
  return talkDown(draft, ctx, stat);
});
registerAction('loyalty/let_go', (draft, _payload, ctx) => letGo(draft, ctx));
registerAction('loyalty/take_back', (draft, _payload, ctx) => takeBack(draft, ctx));
registerAction('loyalty/turn_away', (draft, _payload, ctx) => turnAway(draft, ctx));

// ---------------------------------------------------------------------------------------------
// Mutiny: the fight is an ordinary combat whose enemy side is built from squad units

const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

registerAction('loyalty/fight', (draft, payload, ctx) => {
  const p = isObj(payload) ? payload : {};
  const f = isObj(p.formation) ? p.formation : {};
  const front = strList(f.front);
  const back = strList(f.back);
  if (!front || !back) throw new Error('loyalty/fight needs { formation: { front, back }, coverId, allowRetry? }');
  const start = fightPayload(draft, {
    formation: { front, back }, ...(typeof p.coverId === 'string' ? { coverId: p.coverId } : {}), allowRetry: p.allowRetry === true,
  });
  const events = startCombat(draft, ctx, start);
  const id = events.find((e) => e.type === 'combat_started')?.id;
  if (typeof id !== 'string') throw new Error('The fight did not start.');
  draft.disloyalty!.open!.combatId = id;
  return events;
});
registerAction('loyalty/yield', (draft, _payload, ctx) => yieldToMutiny(draft, ctx));
registerAction('loyalty/resolve_mutiny', (draft, _payload, ctx) => resolveMutiny(draft, ctx));
