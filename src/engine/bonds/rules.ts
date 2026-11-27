import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { dynamicOn } from '../dynamic/gate';
import { dynamicOf } from '../dynamic/state';
import { styleOf } from '../dynamic/profile';
import type { Frame } from '../dynamic/types';
import { isLiving } from '../economy';
import { pushMessage } from '../dms';
import { addFact, nextId } from '../memory';
import { applyRelationDelta } from '../relationGain';
import { applyEventToUnit, landEvent } from '../relations/effects';
import { evaluateAutomatic, pushHistory } from '../relations/graph';
import { intimacyOf } from '../relations/gain';
import type { CampaignState, Rule } from '../state/types';
import { TUNING } from '../tuning';
import { frameRank } from '../blocking/state';
import { contentAllowed, tagsOf } from './content';
import { bondOf, bondTierOf, leadRank } from './profile';

const R = TUNING.bonds.rules;
/** The content tags of the rules a holder may set only with `relation_rules` (spec §5). */
const RELATION_RULE_TAGS: readonly string[] = ['jealousy_games', 'service', 'denial'];
/** The tags of the rules about the commander's other relations: the ones P15's aftermath prefers (the protocol and denial rows are a holder's practices, not these). */
const AIMED_TAGS: readonly string[] = ['jealousy_games'];

export const rulesOf = (state: Pick<CampaignState, 'bonds'>): Rule[] => state.bonds?.rules ?? [];
/** The rules she lives by now (suspended ones are hidden and not tracked). */
export const activeRules = (state: Pick<CampaignState, 'bonds'>, unitId: string): Rule[] => rulesOf(state).filter((r) => r.unitId === unitId && r.status === 'active');
/** Types of the rule events the mechanic model may report. */
export const RULE_EVENT_TYPES: readonly string[] = ['rule_kept', 'rule_broken', 'compromise_reached'];

export type RuleTemplate = { id: string; practice?: true; asks?: string; contentTags?: string[]; check: string; text: string; keepDeltas: { trust: number; affinity: number }; breakDeltas: { trust: number; affinity: number; stress: number }; conditions?: { minLead?: string; tiers?: string[]; minFrame?: string }; weight: number; styles?: string[]; echo?: string };
type Template = RuleTemplate;
const templateOf = (reg: Registries, rule: Pick<Rule, 'templateId'>): Template | undefined => reg.relationshipRuleTemplates.get(rule.templateId) as unknown as Template | undefined;
const clean = (t: string, max: number): string => t.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
const ensureBonds = (draft: CampaignState): NonNullable<CampaignState['bonds']> => (draft.bonds ??= { rules: [] });

/** May she be offered this template now: its conditions hold, the content gate and her own limits allow it, and she has no rule of it. */
function offerable(state: CampaignState, reg: Registries, unitId: string, tpl: Template): boolean {
  const bond = bondOf(state.squad.find((u) => u.id === unitId)!);
  const tier = bondTierOf(state, reg, unitId);
  const c = tpl.conditions ?? {};
  if (!bond || (c.minLead !== undefined && leadRank(bond.leadStyle) < leadRank(c.minLead as 'assertive' | 'dominant'))) return false;
  if (c.tiers !== undefined && (tier === null || !c.tiers.includes(tier))) return false;
  if (rulesOf(state).some((r) => r.unitId === unitId && r.templateId === tpl.id)) return false;
  // P16b: a rule that asks for a frame, and one only a style is offered (the daily praise is a `regal` holder's; her style is read through `styleOf`, a turn of it counts)
  if (c.minFrame !== undefined && frameRank(dynamicOf(state, unitId)?.frame ?? 'equal') < frameRank(c.minFrame as Frame)) return false;
  if (tpl.styles !== undefined) {
    const unit = state.squad.find((u) => u.id === unitId);
    const style = unit === undefined ? undefined : styleOf(unit);
    if (style === undefined || !tpl.styles.some((x) => x === style.primary || x === style.secondary)) return false;
  }
  // P15: a holder (at play or beyond) sets rules about the commander's other relations only with that domain (`relation_rules`)
  const held = dynamicOf(state, unitId);
  if (tpl.echo === undefined && held !== undefined && frameRank(held.frame) >= frameRank('play') && dynamicOn(state, reg) && tagsOf(tpl).some((t) => RELATION_RULE_TAGS.includes(t)) && !hasCapability(state, reg, unitId, 'relation_rules')) return false;
  return contentAllowed(state, reg, tpl, unitId);
}

/**
 * The templates she may be offered now, or `[]` when she may not be offered one at all: a named living unit, lead style at least assertive, a
 * relationship state of the romantic or close tier, no proposal or negotiation open and fewer than three active rules. A template marked `practice` (a holder's protocol or denial rule)
 * is offered only to a caller that says so (`opts.practice`: P16), and that caller is offered only those; `opts.filter` narrows the pool further (P16: only the `service` rows, only the one that asks for permission). Pure.
 */
function proposalPool(draft: CampaignState, reg: Registries, unit: CampaignState['squad'][number], opts: { practice?: boolean; echo?: string; filter?: (template: RuleTemplate) => boolean } = {}): Template[] {
  const bond = unit.kind === 'named' && isLiving(unit) ? bondOf(unit) : null;
  if (!bond || leadRank(bond.leadStyle) < leadRank('assertive') || bondTierOf(draft, reg, unit.id) === null) return [];
  const mine = rulesOf(draft).filter((r) => r.unitId === unit.id);
  if (mine.some((r) => r.status === 'proposed' || r.status === 'negotiating') || mine.filter((r) => r.status === 'active').length >= R.maxActive) return [];
  return [...reg.relationshipRuleTemplates.values()].map((t) => t as unknown as Template).filter((t) => (opts.practice === true ? t.practice === true : t.practice !== true) && t.echo === opts.echo && (opts.filter === undefined || opts.filter(t)) && offerable(draft, reg, unit.id, t));
}

/**
 * Could `proposeRuleHashed` propose something to her now (same options)? Reads only: romance on and a non-empty pool. P16 asks before it requests a denial, and before it
 * writes a protocol rule, so that a request the engine cannot write as a rule is turned into something else instead.
 */
export function canProposeRule(draft: CampaignState, reg: Registries, unitId: string, opts: { practice?: boolean; echo?: string; filter?: (template: RuleTemplate) => boolean } = {}): boolean {
  const unit = draft.squad.find((u) => u.id === unitId);
  return unit !== undefined && intimacyOf(draft).romance && proposalPool(draft, reg, unit, opts).length > 0;
}

/** Writes a rule of a template as proposed by her, and says so. */
function propose(draft: CampaignState, unit: CampaignState['squad'][number], tpl: Template): EngineEvent {
  const rule: Rule = { id: nextId(draft, 'r'), unitId: unit.id, templateId: tpl.id, text: clean(tpl.text.replaceAll('{name}', unit.displayName), R.textMax), status: 'proposed', day: draft.day, brokenCount: 0 };
  ensureBonds(draft).rules.push(rule);
  return { type: 'rule_proposed', ruleId: rule.id, unitId: unit.id };
}

/**
 * The daily roll of a leading partner proposing a rule. Eligible: a named living unit, romance on, lead style at least
 * assertive, a relationship state of the romantic or close tier, no proposal or negotiation open, fewer than three active rules
 * and some template she may be offered. Each eligible unit rolls `chance × (dominant 1.5 | assertive 1)`; a hit is a seeded
 * weighted pick. Nothing is drawn while nobody is eligible.
 */
export function rollRules(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  if (!intimacyOf(draft).romance) return [];
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    const pool = proposalPool(draft, reg, unit);
    if (pool.length === 0) continue;
    if (!ctx.rng.chance(R.chance * R.leadMult[bondOf(unit)!.leadStyle as 'assertive' | 'dominant'])) continue;
    let r = ctx.rng.float() * pool.reduce((s, t) => s + Number(t.weight), 0);
    const tpl = pool.find((t) => (r -= Number(t.weight)) < 0) ?? pool[pool.length - 1];
    events.push(propose(draft, unit, tpl));
  }
  return events;
}

/**
 * P15 (an aftermath that still sets rules, `rule_interfere`): proposes one rule in her name, with no roll of the campaign's rng: the pick among the
 * templates she may be offered is the hashed number `roll` (0 to under 1), the ones about the commander's other relations first (P16 passes `{ practice: true }` to be offered its own rows, and only those). Nothing when she
 * may not be offered one (romance off, not a leading partner, no bond tier, a proposal already open, no template left).
 */
export function proposeRuleHashed(draft: CampaignState, reg: Registries, unitId: string, roll: number, opts: { practice?: boolean; echo?: string; filter?: (template: RuleTemplate) => boolean } = {}): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !intimacyOf(draft).romance) return [];
  const pool = proposalPool(draft, reg, unit, opts);
  const aimed = pool.filter((t) => tagsOf(t).some((tag) => AIMED_TAGS.includes(tag)));
  const from = aimed.length > 0 ? aimed : pool;
  if (from.length === 0) return [];
  let r = roll * from.reduce((n, t) => n + Number(t.weight), 0);
  const tpl = from.find((t) => (r -= Number(t.weight)) < 0) ?? from[from.length - 1];
  return [propose(draft, unit, tpl)];
}

/**
 * Makes a proposal reach the commander: with the worded text (cleaned, at most 160) or the template's, as a DM from her unless
 * she is in the room. Once; a rule that is not a proposal cannot be delivered.
 */
export function deliverRule(draft: CampaignState, ruleId: string, text?: string): EngineEvent[] {
  const rule = rulesOf(draft).find((r) => r.id === ruleId);
  if (!rule || rule.status !== 'proposed') throw new Error('There is no proposal to deliver.');
  if (rule.delivered) throw new Error('That proposal was already delivered.');
  const worded = text === undefined ? '' : clean(text, R.textMax);
  if (worded !== '') rule.text = worded;
  rule.delivered = true;
  const viaDm = draft.scene?.participants.includes(rule.unitId) !== true;
  if (viaDm) rule.dmId = pushMessage(draft, rule.unitId, { from: rule.unitId, text: rule.text, day: draft.day, slot: draft.slot, read: false, initiated: true }).id;
  return [{ type: 'rule_delivered', ruleId, unitId: rule.unitId, viaDm }];
}

/**
 * P14: a new wording of a rule proposal that was delivered and has not been answered (RETRY of the template text, REROLL). Cleaned like
 * the first one; the DM that carried it shows the new words. Draws nothing.
 */
export function rewordRule(draft: CampaignState, ruleId: string, text: string): EngineEvent[] {
  const rule = rulesOf(draft).find((r) => r.id === ruleId);
  if (!rule || rule.status !== 'proposed' || !rule.delivered) throw new Error('Only a delivered proposal that waits for an answer can be reworded.');
  const worded = clean(text, R.textMax);
  if (worded === '') throw new Error('The wording is empty.');
  rule.text = worded;
  const carrier = rule.dmId === undefined ? undefined : draft.dms[rule.unitId]?.find((m) => m.id === rule.dmId);
  if (carrier) carrier.text = worded;
  return [{ type: 'rule_reworded', ruleId, unitId: rule.unitId }];
}

/**
 * The commander answers a delivered proposal. Accept: it is active (`rule_accepted`, draft Affinity +3). Refuse: it is gone
 * (`rule_refused`, draft Trust −1, Affinity −3, stress +3). Negotiate: it becomes `negotiating`; the app opens a scene with her
 * and an extracted `compromise_reached` settles the text. A fourth active rule is refused.
 */
export function answerRule(draft: CampaignState, ctx: EngineCtx, ruleId: string, answer: 'accept' | 'negotiate' | 'refuse'): EngineEvent[] {
  const reg = ctx.registries;
  const rule = rulesOf(draft).find((r) => r.id === ruleId);
  if (!rule || rule.status !== 'proposed' || !rule.delivered) throw new Error('There is no delivered proposal to answer.');
  const unit = draft.squad.find((u) => u.id === rule.unitId);
  if (!unit || !isLiving(unit)) throw new Error('She is not available.');
  const event = (type: 'rule_accepted' | 'rule_refused') => applyEventToUnit(draft, reg, unit.id, {
    type, actor: 'commander', targets: [unit.id], severity: 'minor', evidence: `a rule was ${type === 'rule_accepted' ? 'accepted' : 'refused'}`, confidence: 1,
  });
  const events: EngineEvent[] = [];
  if (answer === 'accept') {
    if (activeRules(draft, unit.id).length >= R.maxActive) throw new Error(`She has ${R.maxActive} rules already.`);
    rule.status = 'active';
    events.push(...event('rule_accepted'), { type: 'rule_accepted', ruleId, unitId: unit.id });
  } else if (answer === 'refuse') {
    draft.bonds!.rules = draft.bonds!.rules.filter((r) => r.id !== ruleId);
    events.push(...event('rule_refused'), { type: 'rule_refused', ruleId, unitId: unit.id });
  } else if (answer === 'negotiate') {
    rule.status = 'negotiating';
    events.push({ type: 'rule_negotiating', ruleId, unitId: unit.id });
  } else throw new Error('Answer a rule with accept, negotiate or refuse.');
  events.push(...evaluateAutomatic(draft, reg, unit.id));
  return events;
}

/** A proposal the app did not deliver (a chat switch, the setting off, a failed call) is delivered with the template's text at the next day end. */
export function deliverStaleRules(draft: CampaignState): EngineEvent[] {
  return rulesOf(draft).filter((r) => r.status === 'proposed' && !r.delivered && r.day < draft.day).flatMap((r) => deliverRule(draft, r.id));
}

/** A scene with her that ends while her rule is still being negotiated puts it back as a proposal. */
export function returnNegotiations(draft: CampaignState, participants: string[]): EngineEvent[] {
  const back = rulesOf(draft).filter((r) => r.status === 'negotiating' && participants.includes(r.unitId));
  for (const r of back) r.status = 'proposed';
  return back.map((r) => ({ type: 'rule_negotiation_open', ruleId: r.id, unitId: r.unitId }));
}

/**
 * A rule event landed on her (a reading, or an engine check at confidence 1): `rule_kept` applies the template's `keepDeltas`;
 * `rule_broken` its `breakDeltas`, counts the break and, with others present, writes a public fact; `compromise_reached` sets
 * the agreed text of a rule under negotiation and activates it. The event's own `eventDeltas` row has already been applied.
 */
export function applyRuleEvent(draft: CampaignState, ctx: EngineCtx, unitId: string, ev: { type: string; ruleId?: string; text?: string }, present: string[] = []): EngineEvent[] {
  const reg = ctx.registries;
  const rule = rulesOf(draft).find((r) => r.id === ev.ruleId && r.unitId === unitId);
  const unit = draft.squad.find((u) => u.id === unitId);
  const rel = draft.relations[unitId];
  if (!rule || !unit || !rel) return [];
  const events: EngineEvent[] = [];
  if (ev.type === 'compromise_reached') {
    const text = clean(ev.text ?? '', R.textMax);
    if (rule.status !== 'negotiating' || text === '') return [];
    rule.status = 'active';
    rule.text = text;
    return [{ type: 'rule_active', ruleId: rule.id, unitId }];
  }
  const tpl = templateOf(reg, rule);
  if (rule.status !== 'active' || !tpl) return [];
  const move = (axis: 'trust' | 'affinity', amount: number, cause: string) => {
    if (amount === 0) return;
    const applied = applyRelationDelta(draft, unitId, axis, amount, cause);
    if (applied !== 0) events.push({ type: 'relation_changed', unitId, axis, delta: applied, applied });
  };
  if (ev.type === 'rule_kept') {
    move('trust', tpl.keepDeltas.trust, 'rule_kept');
    move('affinity', tpl.keepDeltas.affinity, 'rule_kept');
    events.push({ type: 'rule_kept', ruleId: rule.id, unitId });
    return events;
  }
  if (ev.type !== 'rule_broken') return [];
  move('trust', tpl.breakDeltas.trust, 'rule_broken');
  move('affinity', tpl.breakDeltas.affinity, 'rule_broken');
  if (tpl.breakDeltas.stress !== 0) {
    const next = Math.min(100, Math.max(0, unit.stress + tpl.breakDeltas.stress));
    if (next !== unit.stress) events.push({ type: 'stress_changed', unitId, delta: next - unit.stress });
    unit.stress = next;
  }
  rule.brokenCount += 1;
  rule.lastBrokenDay = draft.day;
  events.push({ type: 'rule_broken', ruleId: rule.id, unitId });
  if (present.some((id) => id !== unitId)) {
    addFact(draft, { about: [unitId, 'commander'], text: `${unit.displayName}'s rule was broken: ${rule.text}.`, tags: ['rule', 'broken_rule'], importance: 3, day: draft.day, knownBy: [...new Set([...present, unitId])] });
  }
  return events;
}

/** An engine check found the commander broke her rule: the same consequences as a reading at confidence 1, with the history line. */
function breakByCheck(draft: CampaignState, ctx: EngineCtx, rule: Rule, present: string[]): EngineEvent[] {
  pushHistory(draft, rule.unitId, { day: draft.day, kind: 'event', type: 'rule_broken', severity: 'minor' });
  // P15: a rule broken by check feeds hold like a reported one (it never passed `applyEventToUnit`); before `applyRuleEvent` counts the break
  const landed = landEvent(draft, ctx.registries, rule.unitId, { type: 'rule_broken', actor: 'commander', targets: [rule.unitId], severity: 'minor', evidence: 'an engine check', confidence: 1, ruleId: rule.id }, 'minor');
  return [{ type: 'rule_broken_by_check', ruleId: rule.id, unitId: rule.unitId }, ...landed, ...applyRuleEvent(draft, ctx, rule.unitId, { type: 'rule_broken', ruleId: rule.id }, present)];
}

/** Day end: `daily_contact` rules are broken when the commander neither shared a scene with her nor wrote to her today (once a day). */
export function checkDailyContact(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const rule of rulesOf(draft)) {
    if (rule.status !== 'active' || templateOf(ctx.registries, rule)?.check !== 'daily_contact') continue;
    const unit = draft.squad.find((u) => u.id === rule.unitId);
    if (!unit || !isLiving(unit) || draft.relations[rule.unitId]?.contactDay === draft.day || rule.lastBrokenDay === draft.day) continue;
    events.push(...breakByCheck(draft, ctx, rule, []));
  }
  return events;
}

/** `expedition/start`: a `run_without_asking` rule is broken when a romantic partner of someone else goes and she does not. The party saw it. */
export function checkRunRoster(draft: CampaignState, ctx: EngineCtx, party: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const rule of rulesOf(draft)) {
    if (rule.status !== 'active' || templateOf(ctx.registries, rule)?.check !== 'run_without_asking' || party.includes(rule.unitId)) continue;
    if (!party.some((id) => id !== rule.unitId && bondTierOf(draft, ctx.registries, id) === 'romantic')) continue;
    events.push(...breakByCheck(draft, ctx, rule, party));
  }
  return events;
}

/** P9c: the commander wears a token of `giverId`: every active `token_wear` rule of another soldier is broken (the rule is suspended while jealousy games are off). */
export function checkTokenWear(draft: CampaignState, ctx: EngineCtx, giverId: string): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const rule of rulesOf(draft)) {
    if (rule.status !== 'active' || rule.unitId === giverId || templateOf(ctx.registries, rule)?.check !== 'token_wear') continue;
    const unit = draft.squad.find((u) => u.id === rule.unitId);
    if (!unit || !isLiving(unit)) continue;
    events.push(...breakByCheck(draft, ctx, rule, []));
  }
  return events;
}

/** Category changes: what is tagged with a category that went off is withdrawn (a proposal) or suspended (an active rule); a suspended rule whose tags are all allowed again returns. */
export function syncRulesWithContent(draft: CampaignState, reg: Registries): void {
  const bonds = draft.bonds;
  if (!bonds) return;
  const next: Rule[] = [];
  for (const rule of bonds.rules) {
    const tpl = reg.relationshipRuleTemplates.get(rule.templateId);
    const allowed = tpl === undefined || contentAllowed(draft, reg, tpl, rule.unitId);
    if (allowed) next.push(rule.status === 'suspended' && rule.source !== 'item' ? { ...rule, status: 'active' } : rule); // a rule an item put in force (P16) comes back only with the item
    else if (rule.status === 'active' || rule.status === 'suspended') next.push({ ...rule, status: 'suspended' });
    // proposed / negotiating: withdrawn quietly
  }
  bonds.rules = next;
}
