/**
 * The intent plumbing of the dynamic (P15, plan R22): what the intent model may report about it, built from the state each time and offered only
 * while its subject exists (a pending probe, an open milestone, claim or offer, a holder at role in company), and the router for what it reported
 * after `validateIntents` kept only what was offered. The model reports closed-vocabulary events and ids; the engine decides every number. A scene
 * or a DM with no such subject offers nothing and the prompt is byte-identical to before the package. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { bondOf, leadRank } from '../bonds/profile';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { EventIntent } from '../relations/intents';
import { DYNAMIC_INTENT_TYPES } from '../relations/vocab';
import type { CampaignState } from '../state/types';
import { compromatOf, mentionCompromat } from './compromat';
import { canHold, dynamicOn, herPracticeLive } from './gate';
import { slipSeen } from './knowledge';
import { confirmOffer } from './offer';
import { answerMilestone } from './milestones';
import { answerProbe, HYPOTHETICAL_AXIS, hypotheticalOpen, pendingProbe, sceneProbe } from './probes';
import { threatNear } from './reading';
import { markQuirkVoiced, quirksDue } from './quirks';
import { slipsOpen } from './struggle';
import { dynamicOf } from './state';
import type { DynamicMilestoneEntry, DynamicOffer, ProbeAxisEntry } from './types';

export type { DynamicOffer };

/** The model-reported types of the dynamic: their own rows are zero, so `applyIntents` leaves them to `applyDynamicIntent` (like her life's conditional rows). */
export const DYNAMIC_ROW_IS_CONDITIONAL: readonly string[] = DYNAMIC_INTENT_TYPES;

/** What the prompt carries: the offer, her axes as words, the open milestones' labels and the words of the quirks that are due (keyed `<unitId>:<when>`; hers, the author's, never a number). */
export type DynamicIntentInput = DynamicOffer & { probeAxes: Record<string, string>; milestoneLabels: Record<string, string>; quirkTexts?: Record<string, string> };

/**
 * The offer for the units in `participants` (named, living, who practise something that is switched on). `{}` while the dynamic is off or nothing
 * is offered. At most one probe a scene. `probe_observed` is offered for a unit who could start to hold (eligible, at `equal` or with no block yet)
 * with a lead style of assertive or more and no probe of hers pending; `protocol_slip` for a unit at `role` or beyond (or in a `habits` aftermath)
 * when another unit is present. An open negotiated exit (`compromise_reached { exitId }`) is offered while she is present; `compromat_mentioned` while a present unit holds some (named by holder only, never by content).
 */
export function dynamicIntentInput(
  state: CampaignState, reg: Registries, participants: readonly string[], _channel: 'scene' | 'dm',
): { dynamic?: DynamicIntentInput } {
  if (!dynamicOn(state, reg) || state.dynamic === undefined) return {};
  const present = participants.filter((id) => {
    const unit = state.squad.find((u) => u.id === id);
    return unit !== undefined && unit.kind === 'named' && isLiving(unit) && herPracticeLive(state, id);
  });
  if (present.length === 0) return {};
  const open = state.dynamic.open;
  const probe = sceneProbe(state, present);
  const probes = probe === undefined ? [] : [probe.unitId];
  const probeAxes: Record<string, string> = {};
  if (probe !== undefined) probeAxes[probe.unitId] = String((reg.probeAxes.get(probe.probe.axis) as unknown as ProbeAxisEntry | undefined)?.promptHint ?? probe.probe.axis);
  const observed = present.filter((id) => {
    const dyn = dynamicOf(state, id);
    if (pendingProbe(state, id) !== undefined || (dyn !== undefined && frameRank(dyn.frame) >= frameRank('play'))) return false;
    const unit = state.squad.find((u) => u.id === id)!;
    return leadRank(bondOf(unit)?.leadStyle ?? 'balanced') >= leadRank('assertive') && canHold(state, reg, id) === null;
  });
  const milestoneRows = open.milestones.filter((m) => present.includes(m.unitId));
  const milestoneLabels: Record<string, string> = {};
  for (const m of milestoneRows) milestoneLabels[m.id] = String((reg.dynamicMilestones.get(m.milestoneId) as unknown as DynamicMilestoneEntry | undefined)?.promptHint ?? m.milestoneId);
  const claims = open.claims.filter((c) => present.includes(c.unitId)).map((c) => c.id);
  const offers = open.offers.filter((o) => present.includes(o.unitId) && o.confirmed !== true).map((o) => o.id);
  const exits = (open.exits ?? []).filter((e) => present.includes(e.unitId)).map((e) => e.id);
  const slips = participants.length >= 2
    ? present.filter((id) => {
      const dyn = dynamicOf(state, id);
      return dyn !== undefined && (frameRank(dyn.frame) >= frameRank('role') || slipsOpen(state, reg, id)); // a stage with `protocol_slips` (habits) lets it slip for its days
    })
    : [];
  const compromat = present.filter((id) => compromatOf(state, id).length > 0);
  // P15b: her small ways that are due now (only in a scene with her); the model reports one it saw voiced
  const due = _channel === 'scene' ? quirksDue(state, reg).filter((q) => present.includes(q.unitId)) : [];
  const hypothetical = probe !== undefined && probe.probe.axis === HYPOTHETICAL_AXIS ? [probe.unitId] : []; // P15b: her what-if, the one probe of the scene
  const types = [
    ...(probes.length > 0 ? ['probe_answered'] : []), ...(hypothetical.length > 0 ? ['hypothetical_answered'] : []), ...(observed.length > 0 ? ['probe_observed'] : []),
    ...(milestoneRows.length > 0 ? ['milestone_accepted', 'milestone_refused'] : []), ...(claims.length > 0 || exits.length > 0 ? ['compromise_reached'] : []),
    ...(offers.length > 0 ? ['offer_answered'] : []), ...(compromat.length > 0 ? ['compromat_mentioned'] : []), ...(slips.length > 0 ? ['protocol_slip'] : []),
    ...(due.length > 0 ? ['quirk_voiced'] : []),
  ];
  if (types.length === 0) return {};
  return {
    dynamic: {
      types, probes, observed, milestones: milestoneRows.map((m) => m.id), claims, exits, offers, compromat, slips, probeAxes, milestoneLabels,
      ...(hypothetical.length > 0 ? { hypothetical } : {}),
      ...(due.length > 0 ? { quirks: due.map((q) => ({ unitId: q.unitId, when: q.when })), quirkTexts: Object.fromEntries(due.map((q) => [`${q.unitId}:${q.when}`, q.text])) } : {}),
    },
  };
}

/**
 * Routes one validated event of the dynamic to its effect on the unit it is about. The offer is rebuilt from the state (an answer to a probe that
 * is no longer pending, or a gesture the unit may no longer make, does nothing). The probe, milestone, compromat and slip types are handled here; the offer
 * answer only confirms what the engine decided (`confirmOffer`). `batch`: the events of the same applied batch so far (a threat to the commander in it makes a probe answer read as fear). Returns the engine events.
 */
export function applyDynamicIntent(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, ev: EventIntent, batch: readonly EngineEvent[] = []): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) return [];
  switch (ev.type) {
    case 'probe_answered':
      return ev.response === undefined || pendingProbe(draft, unitId) === undefined ? [] : answerProbe(draft, ctx, unitId, ev.response, ev.tone, 1, threatNear(draft, batch, unitId));
    case 'probe_observed':
      return ev.response === undefined || dynamicIntentInput(draft, reg, [unitId], 'scene').dynamic?.observed?.includes(unitId) !== true ? [] : answerProbe(draft, ctx, unitId, ev.response, ev.tone, 0.5, threatNear(draft, batch, unitId));
    case 'milestone_accepted':
    case 'milestone_refused': {
      // only the milestone that is open for this unit (the offer was built from the same state): a stale or foreign id does nothing
      const open = ev.milestoneId === undefined ? undefined : draft.dynamic?.open.milestones.find((m) => m.id === ev.milestoneId && m.unitId === unitId);
      return open === undefined ? [] : answerMilestone(draft, ctx, open.id, ev.type === 'milestone_accepted' ? 'accept' : 'refuse', 'text');
    }
    case 'compromat_mentioned':
      // she holds some and is in the room (the offer was built from the same state); the commander learns the fact she named, or what she said
      return dynamicIntentInput(draft, reg, [unitId], 'scene').dynamic?.compromat.includes(unitId) === true ? mentionCompromat(draft, ctx, unitId, ev.factId, ev.summary) : [];
    case 'offer_answered':
      // the engine decided her answer when the offer was made; the report only confirms it (a mismatch, a stale id or another woman's is dropped)
      return confirmOffer(draft, unitId, ev.offerId, ev.answer, ev.correction);
    case 'hypothetical_answered':
      // her what-if, answered (the offer was built from the same state, but `probe_answered` may have closed the probe earlier in this batch): the engine event carries the extractor's paraphrase; the rule remembers it
      return ev.summary === undefined || !hypotheticalOpen(draft, unitId) ? [] : [{ type: 'hypothetical_answered', unitId, answer: ev.summary }];
    case 'quirk_voiced':
      // one of her small ways, seen voiced (the offer was built from the same state: a stale or unknown one writes nothing); only the note of the scene changes
      markQuirkVoiced(draft, reg, unitId, ev.when);
      return [];
    case 'protocol_slip':
      // the habit slips out with others in the room: each of them sees it (R14); in a DM, or alone, nobody does
      return slipSeen(draft, ctx, unitId);
    default:
      return [];
  }
}
