/**
 * The `regal` holder's daily praise (P16b, plan Task 20; spec section 11, ruling 5). She sets a protocol rule at frame `role` (the `daily_praise` template: a P16 rule of `check: 'praise'`, offered by
 * style and frame); while it is active the commander praises her in the commander's own words, once a day, and never the same way twice. A praise is compared locally (`text/similarity`, no model)
 * with her last `TUNING.craft.praise.keep`: one over `repeat` of any is a repeat, and a repeat or a day with no fresh praise is `praise_missed`, her offence (`protocol_slip`). A fresh one is kept in
 * `Relation.craft.praise` (for P17g, which adds weight by facts on top; the text never leaves it) and raises Regard, doubled for `regal`. The kiss of her hand and the audiences are P17g's.
 * Nothing is written for a holder who is not a live `regal` holder with the rule, and nothing here draws.
 */
import type { Registries } from '../../../content/types';
import { rulesOf } from '../../bonds/rules';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { regardRise } from '../../dynamic/regard';
import { noteOffence } from '../../practice/offences';
import type { CampaignState } from '../../state/types';
import { similarityOfWords, wordsOf } from '../../text/similarity';
import { TUNING } from '../../tuning';
import { craftHolders, craftLive } from '../gate';
import { registerPraiseGiven, registerPraiseOpen } from '../intents';
import { hasStyle } from './slots';

const P = TUNING.craft.praise;
export const REGAL_STYLE = 'regal';

/** Her praise rule that stands (active), by the template's `check` field, never its id. */
export function praiseRuleOf(state: CampaignState, reg: Registries, unitId: string) {
  return rulesOf(state).find((r) => r.unitId === unitId && r.status === 'active' && reg.relationshipRuleTemplates.get(r.templateId)?.check === 'praise');
}

/** Does she take praise now: a live `regal` holder whose praise rule is active? */
export const praiseOpen = (state: CampaignState, reg: Registries, unitId: string): boolean =>
  craftLive(state, reg, unitId) && hasStyle(state, unitId, REGAL_STYLE) && praiseRuleOf(state, reg, unitId) !== undefined;

/** A repeat or a missed day is a slip of hers to punish: one trivial `protocol_slip` offence, once a day. */
function slip(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, reason: 'repeat' | 'missed'): EngineEvent[] {
  const craft = ((draft.relations[unitId]!.craft) ??= {});
  craft.praiseSlipDay = draft.day;
  return [
    { type: 'praise_missed', unitId, holderId: unitId, reason },
    ...noteOffence(draft, ctx, unitId, { kind: 'protocol_slip', ref: `praise:${draft.day}`, stakes: 'trivial', day: draft.day }),
  ];
}

/**
 * The commander praised her in words (`said`, cleaned and at most 400): a fresh one is kept (one a day, the last `keep`) and raises Regard (`praise.regard`, `regal.mult` times); one too much like
 * an earlier one is a repeat (`praise_missed`, nothing kept, no rise). A second praise on a day that already has a fresh one counts for nothing. Nothing unless she takes praise now.
 */
export function givePraise(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, said: string): EngineEvent[] {
  const reg = ctx.registries;
  if (!praiseOpen(draft, reg, unitId)) return [];
  const text = said.slice(0, P.textMax).trim();
  const words = [...wordsOf(text)];
  if (text === '' || words.length === 0) return [];
  const have = draft.relations[unitId]?.craft?.praise ?? [];
  if (have.some((p) => p.day === draft.day)) return [];
  if (have.slice(-P.keep).some((p) => similarityOfWords(p.words, words) > P.repeat)) return slip(draft, ctx, unitId, 'repeat');
  const craft = ((draft.relations[unitId]!.craft) ??= {});
  craft.praise = [...have, { day: draft.day, text, words }].slice(-P.keep);
  return [
    { type: 'praise_given', unitId, holderId: unitId },
    ...regardRise(draft, reg, unitId, 'value', P.regard * TUNING.regard.regal.mult),
  ];
}

/**
 * The day step (at the end of `draft.day`): a live `regal` holder whose rule has stood since an earlier day and who was given no fresh praise today (and no repeat was told today) has a slip to
 * punish: `praise_missed`. Nothing for a holder who is not a regal holder with the rule.
 */
export function praiseDayStep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const unitId of craftHolders(draft, reg)) {
    if (!hasStyle(draft, unitId, REGAL_STYLE)) continue;
    const rule = praiseRuleOf(draft, reg, unitId);
    const craft = draft.relations[unitId]?.craft;
    if (rule === undefined || rule.day >= draft.day || craft?.praise?.some((p) => p.day === draft.day) === true || craft?.praiseSlipDay === draft.day) continue;
    events.push(...slip(draft, ctx, unitId, 'missed'));
  }
  return events;
}

/** Plugs the praise into the intents (what is offered, what the commander's words do). Idempotent; `resetPraiseHooks` forgets them. */
export function installPraiseHooks(): void {
  registerPraiseOpen((state, reg, unitId) => praiseOpen(state, reg, unitId), 'regal');
  registerPraiseGiven((draft, ctx, unitId, said) => givePraise(draft, ctx, unitId, said), 'regal');
}
