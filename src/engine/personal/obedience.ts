import type { Registries } from '../../content/types';
import { addRecord } from '../discipline/record';
import { dilemmaOptions } from '../dilemma/flow';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { computeDeltas } from '../relations/deltas';
import type { CampaignState, Vote } from '../state/types';
import { TUNING } from '../tuning';
import { hitHer } from './events';
import { obedienceOf } from './state';

export { commanderObeys, obedienceOf, unitObeys } from './state';

/**
 * The commander chose against her on a day the commander obeys her: `overrode_her` (moderate, × her `pressureMult`) and the
 * record an override costs (the same as a REVERT).
 */
export function overrideHer(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, evidence: string): EngineEvent[] {
  return [
    ...hitHer(draft, ctx.registries, unitId, 'overrode_her', 'moderate', evidence, { amplified: true }),
    ...addRecord(draft, unitId, TUNING.personal.overrideRecord, 'override'),
  ];
}

/**
 * The option of the open dilemma she would pick: among the options that are not greyed out, the one whose `unit_event` effects
 * on her sum the highest Trust + Affinity through `computeDeltas`. An option that does not touch her does not count; with none
 * touching her there is no pick (`null`). A tie goes to the earlier option.
 */
export function herPick(state: CampaignState, reg: Registries, unitId: string): number | null {
  const open = state.dilemmas?.open;
  if (!open || open.status !== 'presented' || !open.options) return null;
  const enabled = dilemmaOptions(state, reg);
  let best: { index: number; score: number } | null = null;
  open.options.forEach((option, index) => {
    if (enabled[index]?.disabled !== null) return;
    let touched = false;
    let score = 0;
    for (const fx of option.effects) {
      if (fx.type !== 'unit_event') continue;
      const reached = fx.targets === 'subject' ? open.subjectId === unitId : fx.targets === 'witnesses' ? (open.witnessIds ?? []).includes(unitId) : open.units.includes(unitId);
      if (!reached) continue;
      touched = true;
      const d = computeDeltas(state, reg, unitId, {
        type: fx.event, actor: 'commander', targets: [unitId], severity: fx.severity, evidence: 'her pick', confidence: 1,
        ...(fx.valueAxes ? { valueAxes: fx.valueAxes.map((a) => ({ axis: a.axis as never, direction: a.direction })) } : {}),
      });
      score += d.trust + d.affinity;
    }
    if (touched && (best === null || score > best.score)) best = { index, score };
  });
  return best === null ? null : (best as { index: number }).index;
}

/** How the soldier of today's obedience voted on this vote: `for`, `against`, or `null` (no ballot of hers, or she abstained). */
export function herVote(state: CampaignState, _reg: Registries, vote: Vote): 'for' | 'against' | null {
  const o = obedienceOf(state);
  const ballot = o === null ? undefined : vote.ballots.find((b) => b.unitId === o.unitId);
  return ballot !== undefined && ballot.vote !== 'abstain' ? ballot.vote : null;
}
