import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { letGo, loyaltyDayStep, takeBack, talkDown, turnAway } from '../loyalty/desertion';
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
