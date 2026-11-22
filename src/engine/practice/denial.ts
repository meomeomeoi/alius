/**
 * Denial and permission (P16, plan R13, spec §7): the commander lives under a rule that asks for her permission. It comes from a request of kind `denial` (a P9d proposal of the template that
 * asks for permission, worded by her) or from an item the commander wears whose `rule` effect names a template (the `rule` channel P15a left open); `[ ASK PERMISSION ]` is answered by the engine from
 * her style, favour, Want and frame; a slip is her discipline. The template is read by its `asks` field, never by id. Nothing here draws: every pick is by field and every chance is `practiceRoll`.
 */
import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { COMMANDER, personEffects } from '../blocking';
import { canProposeRule, deliverRule, proposeRuleHashed, rulesOf, type RuleTemplate } from '../bonds/rules';
import { relieveWant, wantBandOf } from '../bonds/want';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import { nextId } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import type { EventIntent } from '../relations/intents';
import { evaluateAutomatic } from '../relations/graph';
import type { CampaignState, Rule } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, practiceLive } from './gate';
import { noteOffence } from './offences';
import { requestPractice } from './request';
import { practiceRoll, type PermissionAnswer, type Task } from './state';
import { frameOf, type Writer } from './tasks';

const ASKS_PERMISSION = 'permission';

/** Does this template ask for permission? By its `asks` field. */
export const asksPermission = (t: RuleTemplate): boolean => t.asks === ASKS_PERMISSION;

const templateOf = (reg: Registries, rule: Pick<Rule, 'templateId'>): RuleTemplate | undefined => reg.relationshipRuleTemplates.get(rule.templateId) as unknown as RuleTemplate | undefined;

/**
 * The permission rule of hers that is in force (active): the one the permission record names while it stands, else the first active rule of hers whose template asks for permission.
 * A suspended rule (an item taken off, a category switched off) and a proposal are not in force. `undefined` when none.
 */
export function permissionRuleOf(state: CampaignState, reg: Registries, holderId: string): Rule | undefined {
  const mine = rulesOf(state).filter((r) => r.unitId === holderId && r.status === 'active' && templateOf(reg, r)?.asks === ASKS_PERMISSION);
  const named = state.practices?.permission;
  return mine.find((r) => named !== undefined && named.holderId === holderId && named.ruleId === r.id) ?? mine[0];
}

/** Can she be asked for a denial rule now (so that a request for one can be written)? None while she has one standing or proposed. */
export const denialPossible = (state: CampaignState, reg: Registries, holderId: string): boolean => canProposeRule(state, reg, holderId, { practice: true, filter: asksPermission });

/**
 * Her denial, from a card (R13): a request of kind `denial` becomes a P9d proposal of the template that asks for permission (hashed pick, `practiceRoll`), worded by the card and delivered as P9d does.
 * A plain (fallback) card delivers the template's own line. Nothing is written when no such rule can be proposed (`relation_rules`, the content gate, her limits).
 */
export const writeDenialRule: Writer = (draft, ctx, request, out, plain) => {
  const reg = ctx.registries;
  const proposed = proposeRuleHashed(draft, reg, request.holderId, practiceRoll(draft, request.holderId, `denial:${request.id}`), { practice: true, filter: asksPermission });
  const proposal = proposed.find((e) => e.type === 'rule_proposed');
  if (proposal === undefined) return [];
  const rule = rulesOf(draft).find((r) => r.id === proposal.ruleId)!;
  return [...proposed, ...deliverRule(draft, rule.id, plainDraft(plain ? rule.text : out.text)), { type: 'protocol_set', unitId: request.holderId, holderId: request.holderId, ruleId: rule.id, requestId: request.id, denial: true, ...(plain ? { plain: true } : {}) }];
};

// --- the `rule` channel: what the commander wears ---------------------------------------------------------------------------------------------------------------------------------------------

/**
 * The rules the commander's worn items put in force (the `rule` effect of an item, P15a): the template, and the holder it is in force for: the first living holder in the scene (an item has no
 * record of who put it on). Empty with no scene, no item or nobody holding in the room. Reads only.
 */
export function itemRules(state: CampaignState, reg: Registries): Array<{ templateId: string; holderId: string }> {
  const scene = state.scene;
  if (scene === undefined) return [];
  const holderId = scene.participants.find((id) => practiceLive(state, reg, id));
  if (holderId === undefined) return [];
  const seen = new Set<string>();
  const out: Array<{ templateId: string; holderId: string }> = [];
  for (const e of personEffects(state, reg, COMMANDER)) {
    if (e.type !== 'rule' || seen.has(e.template) || reg.relationshipRuleTemplates.get(e.template) === undefined) continue;
    seen.add(e.template);
    out.push({ templateId: e.template, holderId });
  }
  return out;
}

const clean = (t: string): string => t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.rules.textMax).trim();

/**
 * Brings the rules in line with what the commander wears (R13): a rule an item names is in force (created active at once with `source: 'item'` and the holder's name in its text; a suspended one of the
 * same item comes back), and an item rule that no worn item names any more is suspended (the item taken off, the scene ended). A rule the same holder already has of that template, of any other source,
 * is left alone. `practices.permission` names the rule in force. Draws nothing.
 */
export function syncItemRules(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>): EngineEvent[] {
  const reg = ctx.registries;
  const wanted = itemRules(draft, reg);
  const events: EngineEvent[] = [];
  for (const w of wanted) {
    const own = rulesOf(draft).find((r) => r.unitId === w.holderId && r.templateId === w.templateId);
    if (own === undefined) {
      const tpl = templateOf(reg, { templateId: w.templateId })!;
      const unit = draft.squad.find((u) => u.id === w.holderId)!;
      const rule: Rule = { id: nextId(draft, 'r'), unitId: w.holderId, templateId: w.templateId, text: clean(plainDraft(tpl.text).replaceAll('{name}', unit.displayName)), status: 'active', day: draft.day, brokenCount: 0, delivered: true, source: 'item' };
      (draft.bonds ??= { rules: [] }).rules.push(rule);
      events.push({ type: 'rule_active', ruleId: rule.id, unitId: w.holderId, source: 'item' });
    } else if (own.source === 'item' && own.status === 'suspended') {
      own.status = 'active';
      events.push({ type: 'rule_active', ruleId: own.id, unitId: w.holderId, source: 'item' });
    }
    const inForce = rulesOf(draft).find((r) => r.unitId === w.holderId && r.templateId === w.templateId && r.status === 'active');
    if (inForce !== undefined && templateOf(reg, inForce)?.asks === ASKS_PERMISSION) ensurePractices(draft).permission = { holderId: w.holderId, ruleId: inForce.id, ...(draft.practices?.permission?.ruleId === inForce.id && draft.practices.permission.asked !== undefined ? { asked: draft.practices.permission.asked } : {}) };
  }
  for (const rule of rulesOf(draft)) {
    if (rule.source !== 'item' || rule.status !== 'active' || wanted.some((w) => w.holderId === rule.unitId && w.templateId === rule.templateId)) continue;
    rule.status = 'suspended';
    events.push({ type: 'rule_suspended', ruleId: rule.id, unitId: rule.unitId, source: 'item' });
  }
  return events;
}

/** The after-action of the item rules (registered by `actions/practice.ts`): a change of what the commander wears, or a scene that ended, puts the rules in line. Nothing while no item rule exists or could. */
export function itemRulesFromEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  if (!events.some((e) => e.type === 'blocking_changed' || e.type === 'scene_ended' || e.type === 'scene_aborted')) return [];
  if (itemRules(draft, ctx.registries).length === 0 && !rulesOf(draft).some((r) => r.source === 'item')) return [];
  return syncItemRules(draft, ctx);
}

// --- her answer ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * What she answers to `[ ASK PERMISSION ]` (R13), deterministic: the frame `rule` and a favour at or below `refusalAt` deny; else `grant` when favour is 5 or more and her Want no higher than
 * restless, or her style is `affectionate`; else her style's answer (`TUNING.practice.permission.byStyle`: cruel and cold deny, ritual, drill, regal and clinical make her wait, possessive, playful,
 * vindictive and obsessive say earn it). Reads only.
 */
export function permissionAnswer(state: CampaignState, reg: Registries, holderId: string): PermissionAnswer {
  const T = TUNING.practice.permission;
  const favour = dynamicOf(state, holderId)?.favour ?? 0;
  const style = practiceOf(state, reg, holderId)?.style.primary;
  if (frameOf(state, holderId) === 'rule' || favour <= TUNING.practice.refusalAt) return 'deny';
  const band = wantBandOf(state, reg, holderId);
  if ((favour >= T.grantFavour && (band === 'calm' || band === 'restless')) || style === 'affectionate') return 'grant';
  return (style === undefined ? undefined : T.byStyle[style]) ?? 'wait';
}

/**
 * `[ ASK PERMISSION ]` (`practice/ask_permission { holderId }`): her answer by `permissionAnswer`, remembered on `practices.permission.asked` (`wait` until tomorrow); `deny` and `wait` relieve her Want by
 * `denialRelief`; `earn` asks for a task that earns it (a request chained to the rule). Asking again while an answer stands (a wait that is not over, a grant given today) repeats it and changes nothing.
 * Throws with no rule of hers in force or a holder who is not live. Draws nothing.
 */
export function askPermission(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string): EngineEvent[] {
  const reg = ctx.registries;
  if (!practiceLive(draft, reg, holderId)) throw new Error('She is not holding now.');
  const rule = permissionRuleOf(draft, reg, holderId);
  if (rule === undefined) throw new Error('She has no rule that asks for her permission.');
  const p = ensurePractices(draft);
  const kept = p.permission?.holderId === holderId && p.permission.ruleId === rule.id ? p.permission.asked : undefined;
  const base = { type: 'permission_answered', unitId: holderId, holderId, ruleId: rule.id } as const;
  if (kept !== undefined && ((kept.answer === 'wait' && (kept.untilDay ?? 0) > draft.day) || (kept.answer === 'grant' && kept.day === draft.day))) return [{ ...base, answer: kept.answer, again: true }];
  const answer = permissionAnswer(draft, reg, holderId);
  p.permission = { holderId, ruleId: rule.id, asked: { day: draft.day, answer, ...(answer === 'wait' ? { untilDay: draft.day + 1 } : {}) } };
  const events: EngineEvent[] = [{ ...base, answer }];
  if (answer === 'deny' || answer === 'wait') events.push(...relieveWant(draft, holderId, TUNING.practice.denialRelief, 'denial'));
  if (answer === 'earn') events.push(...requestPractice(draft, ctx, holderId, 'task', { earns: rule.id }));
  return events;
}

/** A task she gave to earn her permission was kept: it is granted for today. Called when the task settles `kept`. */
export function earnedPermission(draft: CampaignState, task: Pick<Task, 'holderId' | 'ruleId'>): void {
  const p = draft.practices;
  if (p?.permission === undefined || task.ruleId === undefined || p.permission.holderId !== task.holderId || p.permission.ruleId !== task.ruleId) return;
  p.permission.asked = { day: draft.day, answer: 'grant' };
}

/**
 * The model reported a slip against her denial (`denial_broken`, offered only while a rule of hers asks for permission and she is present): the relation row lands on her (the row at `minor`, at
 * `major` in the frame `rule`) and it is her offence of that weight. A permission she gave today covers it: nothing. Nothing for a holder who is not live.
 */
export function denialBroken(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  if (!practiceLive(draft, reg, unitId)) return [];
  const asked = draft.practices?.permission?.holderId === unitId ? draft.practices.permission.asked : undefined;
  if (asked?.answer === 'grant' && asked.day === draft.day) return [];
  const stakes = frameOf(draft, unitId) === 'rule' ? 'major' : 'minor';
  const events = applyEventToUnit(draft, reg, unitId, { type: 'denial_broken', actor: 'commander', targets: [unitId], severity: stakes, evidence: 'she broke her denial', confidence: 1 } as EventIntent);
  events.push(...evaluateAutomatic(draft, reg, unitId));
  events.push(...noteOffence(draft, ctx, unitId, { kind: 'denial_broken', ref: `denial:${draft.day}`, stakes, day: draft.day }));
  return events;
}

// --- the moment triggers ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

/**
 * `permission` is live for a holder (R13): her permission rule is in force and the commander's blocking has a contact with her (her touch on the commander, or the commander's on her). False for
 * a soldier who is not live.
 */
export function permissionLive(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!practiceLive(state, reg, unitId) || permissionRuleOf(state, reg, unitId) === undefined) return false;
  return Object.entries(state.scene?.blocking ?? {}).some(([person, rec]) => rec.contact !== undefined && (rec.contact.with === unitId || (person === unitId && rec.contact.with === COMMANDER)));
}

/** `her_demand` is live for a holder (R13): she has a task or a punishment of hers that waits for the commander's answer. False for a soldier who is not live. */
export function herDemandLive(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!practiceLive(state, reg, unitId)) return false;
  const p = state.practices;
  return p !== undefined && (p.tasks.some((t) => t.holderId === unitId && t.kind === 'task' && t.status === 'offered') || p.punishments.some((x) => x.holderId === unitId && x.status === 'offered'));
}
