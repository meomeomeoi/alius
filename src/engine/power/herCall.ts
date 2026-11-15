import type { HerCallSpec } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import { bondOf, leadRank } from '../bonds/profile';
import { impunityBand, impunityOf } from '../discipline/impunity';
import { addRecord } from '../discipline/record';
import { commandStance } from '../discipline/stance';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import type { Rng } from '../rng';
import { VALUE_AXES, type CampaignState, type Unit } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveValues } from '../worldOptions/stances';
import { applyWorldEffects } from '../world/effects';
import type { Mission } from '../world/types';
import { assertiveness } from './options';
import { leaderOf, powerOf } from './state';
import { againstHerValues } from './votes';

/**
 * Her call (P9e): at an expedition event node of a her-call template a soldier with a will of her own may act on her own. Who may,
 * how likely she is to be the one and how it turns out are pure functions of her card (values, lead style, defects) and her
 * Impunity; only `rollHerCall` draws from the rng. This module never imports the expedition (the party comes in as ids).
 */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const unitOf = (state: CampaignState, id: string): Unit | undefined => state.squad.find((u) => u.id === id);

/** The her-call block of a template, `null` for an ordinary event. */
export function herCallSpecOf(template: Entry | undefined): HerCallSpec | null {
  return (template?.herCall as HerCallSpec | undefined) ?? null;
}

/** The commander ordered her to ask first: while it holds she never acts on her own. */
export function askFirstHolds(state: Pick<CampaignState, 'power'>, unitId: string): boolean {
  return state.power?.askFirst?.[unitId] !== undefined;
}

/**
 * Who of the party may act on this template, in party order: a named, living, active unit not under the ask-first order whose
 * lead rank reaches `minLeadRank`, or whose command stance is one of `stances` with Impunity at `minImpunity` (default 0).
 * Read from the card, never from an id.
 */
export function herCallCandidates(state: CampaignState, reg: Registries, spec: HerCallSpec, partyIds: string[]): string[] {
  const t = spec.trigger;
  return partyIds.filter((id) => {
    const unit = unitOf(state, id);
    if (!unit || unit.kind !== 'named' || !isLiving(unit) || unit.status !== 'active' || askFirstHolds(state, id)) return false;
    const bond = bondOf(unit);
    if (t.minLeadRank !== undefined && bond !== null && leadRank(bond.leadStyle) >= t.minLeadRank) return true;
    if (!t.stances || t.stances.length === 0) return false;
    const stance = commandStance(state, reg, id);
    const impunity = impunityOf(state, reg, id);
    return stance !== null && impunity !== null && t.stances.includes(stance) && impunity.value >= (t.minImpunity ?? 0);
  });
}

/** `(1 + leadBonus[leadStyle]) × band[Impunity band] × (leader ? leaderMult : 1)`; 0 for a unit that has no card to read. */
export function actorWeight(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = unitOf(state, unitId);
  const bond = unit ? bondOf(unit) : null;
  const impunity = impunityOf(state, reg, unitId);
  if (!bond || !impunity) return 0;
  const T = TUNING.herCall;
  return (1 + T.leadBonus[bond.leadStyle]) * T.band[impunityBand(impunity.value)] * (leaderOf(state)?.id === unitId ? T.leaderMult : 1);
}

/** The chance a her-call node is acted on at all: `min(chanceCap, chance × privilegeMult)`. */
export function herCallChance(state: CampaignState, reg: Registries): number {
  return Math.min(TUNING.herCall.chanceCap, TUNING.herCall.chance * assertiveness(state, reg).privilegeMult);
}

/** The chance the outcome is good: her values against each outcome's lean, plus the tilt of her defects by category. */
export function herCallOdds(state: CampaignState, reg: Registries, unitId: string, spec: HerCallSpec): number {
  const unit = unitOf(state, unitId);
  const T = TUNING.herCall.odds;
  if (!unit) return T.base;
  const values = effectiveValues(state, reg, unit);
  const score = (id: 'good' | 'bad'): number => {
    const lean = spec.outcomes.find((o) => o.id === id)?.lean ?? {};
    return VALUE_AXES.reduce((sum, axis) => sum + values[axis] * (lean[axis] ?? 0), 0);
  };
  const categories = new Set(unit.defects.map((d) => String(reg.defects.get(d.id)?.category)));
  const tilt = (spec.defectTilt ?? []).reduce((sum, t) => sum + (categories.has(t.category) ? t.shift : 0), 0);
  return clamp(T.base + T.perPoint * (score('good') - score('bad')) + tilt, T.min, T.max);
}

/**
 * The roll at a her-call node. No candidate: no draw. A candidate: one draw (does she act). She acts: two more, who (weighted by
 * `actorWeight`, over the candidates in party order) and the outcome (`odds` for good). Returns `null` when she does not.
 */
export function rollHerCall(
  state: CampaignState, reg: Registries, rng: Rng, spec: HerCallSpec, partyIds: string[],
): { unitId: string; outcome: 'good' | 'bad'; odds: number } | null {
  const candidates = herCallCandidates(state, reg, spec, partyIds);
  if (candidates.length === 0) return null;
  if (rng.float() >= herCallChance(state, reg)) return null;
  const weights = candidates.map((id) => actorWeight(state, reg, id));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rng.float() * total;
  const index = weights.findIndex((w) => (r -= w) < 0);
  const unitId = candidates[index === -1 ? candidates.length - 1 : index];
  const odds = herCallOdds(state, reg, unitId, spec);
  return { unitId, outcome: rng.float() < odds ? 'good' : 'bad', odds };
}

/**
 * Marks a run so that P9b's scapegoat case can open on her if it later fails. Only a `command` mission is marked, and the first
 * mark wins: a vote's mark or an earlier her-call is never overwritten. The witnesses are the other named living party members.
 * Returns true when it wrote the mark.
 */
export function markHerCall(draft: CampaignState, mission: Mission, p: { unitId: string; nodeId: string; witnessIds: string[] }): boolean {
  if (mission.source !== 'command' || mission.decidedBy !== undefined) return false;
  mission.decidedBy = { source: 'her_call', unitId: p.unitId, nodeId: p.nodeId, witnessIds: [...p.witnessIds] };
  return true;
}

/**
 * She acted: the outcome's effects apply, then the consequences. Good: merit for her, Impunity record, a fact (never credited to
 * the commander). Bad: Impunity record (she is bolder, not humbler) and, on a command mission that is not a tutorial, the mark.
 * Records the run's `herCalls` entry and returns the `her_call` event. The log line is the caller's (the log lives in the expedition).
 */
export function applyHerCall(
  draft: CampaignState, ctx: EngineCtx,
  p: { templateId: string; nodeId: string; title: string; spec: HerCallSpec; call: { unitId: string; outcome: 'good' | 'bad'; odds: number } },
): EngineEvent[] {
  const exp = draft.expedition!;
  const { call } = p;
  const T = TUNING.herCall;
  const outcome = p.spec.outcomes.find((o) => o.id === call.outcome)!;
  const unit = unitOf(draft, call.unitId)!;
  const events = applyWorldEffects(draft, ctx, outcome.effects, { kind: 'event', id: p.templateId, label: p.title });

  let marked = false;
  if (call.outcome === 'good') {
    (powerOf(draft).merit ??= []).push({ day: draft.day, unitId: call.unitId, points: T.meritGood });
    events.push(...addRecord(draft, call.unitId, T.recordGood, 'her_call'));
    addFact(draft, {
      about: [call.unitId], day: draft.day, knownBy: [...exp.party], tags: ['her_call'], importance: T.factImportance,
      text: `${unit.displayName} took a decision in the field herself, and it went well: ${outcome.text}`,
    });
  } else {
    events.push(...addRecord(draft, call.unitId, T.recordBad, 'her_call'));
    const mission = draft.missions.active.find((m) => m.id === exp.missionId);
    const tutorial = mission !== undefined && ctx.registries.missionTemplates.get(mission.templateId)?.tutorial === true;
    if (mission && !tutorial) {
      const witnessIds = exp.party.filter((id) => id !== call.unitId && draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));
      marked = markHerCall(draft, mission, { unitId: call.unitId, nodeId: p.nodeId, witnessIds });
    }
  }
  (exp.herCalls ??= []).push({ nodeId: p.nodeId, unitId: call.unitId, outcome: call.outcome, templateId: p.templateId, odds: call.odds });
  events.push({ type: 'her_call', nodeId: p.nodeId, templateId: p.templateId, unitId: call.unitId, outcome: call.outcome, missionId: exp.missionId, marked });
  return events;
}

/**
 * The standing order "ask me first" (P9e). Giving it to a named living soldier who is not under it costs Trust now, like an overruled
 * decision: one `decision_violated` (severity `TUNING.herCall.askFirst.severity`) against her own values. Lifting it is free. While it
 * holds she is never a candidate for a her-call. Draws no rng.
 */
export function setAskFirst(draft: CampaignState, ctx: EngineCtx, unitId: string, on: boolean): EngineEvent[] {
  const reg = ctx.registries;
  if (!on) {
    if (!askFirstHolds(draft, unitId)) throw new Error('There is no such order.');
    const power = powerOf(draft);
    delete power.askFirst![unitId];
    if (Object.keys(power.askFirst!).length === 0) delete power.askFirst;
    return [{ type: 'ask_first_set', unitId, on: false }];
  }
  const unit = unitOf(draft, unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) throw new Error('There is no such soldier to give that order to.');
  if (askFirstHolds(draft, unitId)) throw new Error('She is already under that order.');
  (powerOf(draft).askFirst ??= {})[unitId] = draft.day;
  const events = applyEventToUnit(draft, reg, unitId, {
    type: 'decision_violated', actor: 'commander', targets: [unitId], severity: TUNING.herCall.askFirst.severity, evidence: 'ordered to ask first', confidence: 1,
    valueAxes: againstHerValues(draft, reg, unit),
  });
  events.push(...evaluateAutomatic(draft, reg, unitId));
  events.push({ type: 'ask_first_set', unitId, on: true });
  return events;
}
