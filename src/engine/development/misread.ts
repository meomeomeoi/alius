import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { fnv1a } from '../hub';
import type { Appraisal, CampaignState, Reading, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { accumulate, matchRules } from './rules';
import { developmentMode, developmentOf } from './state';

/**
 * Misreading and revision (P14b). A witness sees an event from the side and may take consent for force or the reverse; the chance is a
 * hash of her id and the appraisal's id (never a draw), so a run is the same twice and `state.rng` is untouched. When the truth reaches
 * her, the reading is revised and its pushes partly taken back.
 */

/** The chance a witness misreads: by her insight, raised when the subject's relationship with the commander is secret, capped. */
export function misreadChance(state: Pick<CampaignState, 'relations'>, unit: Pick<Unit, 'insight'>, subject: string): number {
  const base = TUNING.development.misread[unit.insight ?? 'mid'];
  const secret = subject !== 'commander' && state.relations[subject]?.publicity?.level === 'secret';
  return Math.min(TUNING.development.misreadCap, secret ? base * TUNING.development.secretMult : base);
}

/** Does this witness misread this appraisal? A hash below the chance, nothing more. */
export function misreads(state: Pick<CampaignState, 'relations'>, unit: Pick<Unit, 'id' | 'insight'>, appraisalId: string, subject: string): boolean {
  return fnv1a(`${unit.id}|appraisal|${appraisalId}`) / 2 ** 32 < misreadChance(state, unit, subject);
}

/** The other reading: wanted and initiator turn over (`unclear` and `mutual` stay), harm and outcome stay. */
export function flipReading(r: Reading): Reading {
  return {
    wanted: r.wanted === 'yes' ? 'no' : r.wanted === 'no' ? 'yes' : 'unclear',
    initiator: r.initiator === 'target' ? 'actor' : r.initiator === 'actor' ? 'target' : 'mutual',
    harm: r.harm, outcome: r.outcome,
  };
}

export const readingOf = (a: Appraisal): Reading => ({ wanted: a.wanted, initiator: a.initiator, harm: a.harm, outcome: a.outcome });

function knowsAbout(state: CampaignState, unitId: string, subject: string, after: number): boolean {
  return state.memory.facts.some((f) => f.day > after && f.about.includes(subject) && f.about.length <= TUNING.development.reviseAboutMax
    && (f.knownBy.includes(unitId) || f.knownBy.includes('*') || f.heard?.[unitId] !== undefined));
}

/** Merges adjustments into an appraisal's stored pushes (kept as applied, so UNDO takes back exactly the net). */
function mergePushes(into: Array<{ axis: string; amount: number }>, add: Array<{ axis: string; amount: number }>): void {
  for (const p of add) {
    const hit = into.find((x) => x.axis === p.axis);
    if (hit) hit.amount = Math.round((hit.amount + p.amount) * 1e6) / 1e6;
    else into.push({ ...p });
  }
  for (let i = into.length - 1; i >= 0; i--) if (into[i].amount === 0) into.splice(i, 1);
}

/**
 * She now knows a newer fact about the subject: `acc -= revertShare × (what the misreading pushed)`, then
 * `acc += revertShare × (what the true reading pushes)`. The appraisal leaves `misread`; if it is still pending it now says what is true.
 */
function revise(draft: CampaignState, reg: EngineCtx['registries'], unit: Unit, a: Appraisal): EngineEvent {
  const share = TUNING.development.revertShare;
  const truth = a.truth!;
  const dev = unit.development!;
  const trueView: Appraisal = { ...a, ...truth, pushes: [] };
  delete trueView.misread;
  delete trueView.truth;
  const back = a.pushes.map((p) => ({ axis: p.axis, amount: -p.amount * share }));
  const forward = matchRules(draft, reg, unit, trueView, []).map((p) => ({ axis: p.axis, amount: p.amount * share }));
  const applied = accumulate(unit, [...back, ...forward]);
  const pend = dev.pending.find((p) => p.id === a.id);
  if (pend) {
    Object.assign(pend, truth);
    delete pend.misread;
    delete pend.truth;
    mergePushes(pend.pushes, applied);
  }
  dev.misread = (dev.misread ?? []).filter((m) => m.id !== a.id);
  return { type: 'appraisal_revised', unitId: unit.id, appraisalId: a.id };
}

/**
 * Day end (after the rumors spread): a misread appraisal is revised once she knows a fact about its subject that is newer than the
 * appraisal, and dropped unrevised after `misreadDays`. Draws nothing. Nothing happens while development is off.
 */
export function developmentDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (developmentMode(draft) === 'off') return [];
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    if (unit.kind !== 'named' || !isLiving(unit) || (developmentOf(unit).misread?.length ?? 0) === 0) continue;
    for (const a of [...(unit.development!.misread ?? [])]) {
      if (a.truth !== undefined && knowsAbout(draft, unit.id, a.subject, a.day)) events.push(revise(draft, ctx.registries, unit, a));
      else if (draft.day - a.day > TUNING.development.misreadDays) unit.development!.misread = unit.development!.misread!.filter((m) => m.id !== a.id);
    }
    if (unit.development!.misread?.length === 0) delete unit.development!.misread;
  }
  return events;
}

