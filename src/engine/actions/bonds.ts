import { setCategories } from '../bonds/content';
import { bondsDayStep } from '../bonds/dayStep';
import { setPublicity } from '../bonds/publicity';
import { PUBLICITY_LEVELS } from '../bonds/profile';
import { answerRule, deliverRule } from '../bonds/rules';
import { followLead, setSceneLimit } from '../bonds/scene';
import { relieveWant } from '../bonds/want';
import { registerActivityHook } from '../activities';
import { registerDayEndStep } from '../calendar';
import { registerAction } from '../dispatch';
import { TUNING } from '../tuning';

// Importing this module registers the P9d actions, the Want relief of companion activities and the bonds day step. The step is
// registered after the comms night roll (`actions/comms`), so import this module after it.

registerDayEndStep('dm_rumors', bondsDayStep);

/** A companion who shares any activity is a little less hungry; the activity's own `wantRelief` (training: 15) replaces the default 5. */
registerActivityHook((draft, ctx, done) => {
  if (!done.companionId) return [];
  const amount = Number(ctx.registries.activities.get(done.activityId)?.wantRelief ?? TUNING.bonds.want.relief.companion);
  return relieveWant(draft, done.companionId, amount, 'activity');
});

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** FOLLOW: the commander follows her lead (once per scene). Draws no rng. */
registerAction('bonds/follow', (draft, _payload, ctx) => followLead(draft, ctx));

/** SET A LIMIT: a boundary for this scene, in the fiction. Draws no rng. */
registerAction('bonds/limit', (draft, payload) => {
  if (!isObj(payload) || typeof payload.text !== 'string') throw new Error('bonds/limit needs { text }');
  return setSceneLimit(draft, payload.text);
});

/** A proposal reaches the commander (the app words it and delivers it, or the day step's text is used). Draws no rng. */
registerAction('bonds/deliver_rule', (draft, payload) => {
  if (!isObj(payload) || typeof payload.ruleId !== 'string') throw new Error('bonds/deliver_rule needs { ruleId }');
  return deliverRule(draft, payload.ruleId, typeof payload.text === 'string' ? payload.text : undefined);
});

/** ACCEPT / NEGOTIATE / REFUSE on a delivered proposal. Draws no rng. */
registerAction('bonds/answer_rule', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.ruleId !== 'string' || (payload.answer !== 'accept' && payload.answer !== 'negotiate' && payload.answer !== 'refuse')) {
    throw new Error('bonds/answer_rule needs { ruleId, answer: "accept" | "negotiate" | "refuse" }');
  }
  return answerRule(draft, ctx, payload.ruleId, payload.answer);
});

/** The commander sets how open the relationship is (the dossier's [SECRET] [KNOWN] [PUBLIC]). Draws no rng. */
registerAction('bonds/set_publicity', (draft, payload, ctx) => {
  if (!isObj(payload) || typeof payload.unitId !== 'string' || !(PUBLICITY_LEVELS as readonly string[]).includes(payload.level as string)) {
    throw new Error('bonds/set_publicity needs { unitId, level: "secret" | "known" | "public" }');
  }
  const unit = draft.squad.find((u) => u.id === payload.unitId);
  if (!unit || unit.kind !== 'named') throw new Error(`Unknown unit "${payload.unitId}".`);
  return setPublicity(draft, ctx.registries, unit.id, payload.level as (typeof PUBLICITY_LEVELS)[number], { cause: 'commander' });
});

/** The player switches content categories on or off (SYS, setup). Applies from the next generation; draws no rng. */
registerAction('content/set_categories', (draft, payload, ctx) => {
  if (!isObj(payload) || !Array.isArray(payload.enabled) || payload.enabled.some((x) => typeof x !== 'string')) {
    throw new Error('content/set_categories needs { enabled: string[] }');
  }
  return setCategories(draft, ctx.registries, payload.enabled as string[]);
});
