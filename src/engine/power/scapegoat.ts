import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { currentBeat } from '../world/spine';
import type { DilemmaOption } from '../dilemma/types';
import type { CampaignState, Vote } from '../state/types';
import { failureEffectsOf } from '../world/missions';
import { applyWorldEffects } from '../world/effects';
import type { Mission } from '../world/types';
import { TUNING } from '../tuning';
import { powerOf } from './state';

/**
 * The scapegoat (P9b §5): when a decision the squad took (a mission it voted for) ends in a failure oversight punishes, the
 * commander answers for it or shifts it onto the unit who carried the vote. The case is a presented dilemma of the authored
 * template `scapegoat_mission`: no model is asked.
 */


/** The unit who answers for a passed vote: the FOR voter with the largest `weight × score` (named, in the vote's order); null when nobody voted for it. */
export function responsibleFor(vote: Vote, isNamed: (unitId: string) => boolean = () => true): string | null {
  let best: { id: string; value: number } | null = null;
  for (const b of vote.ballots) {
    if (b.vote !== 'for' || b.weight <= 0 || !isNamed(b.unitId)) continue;
    const value = b.weight * b.score;
    if (best === null || value > best.value) best = { id: b.unitId, value };
  }
  return best?.id ?? null;
}

/** `take_blame` / `shift_blame`: the answer an authored option stands for, read from its `id`. */
export function scapegoatOptionId(option: Pick<DilemmaOption, 'id'> | undefined): 'take_blame' | 'shift_blame' | null {
  return option?.id === 'take_blame' || option?.id === 'shift_blame' ? option.id : null;
}

const named = (state: CampaignState, id: string): boolean => state.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u));

/**
 * A mission started on a vote that passed (not an overruled one) remembers who answers for it: the strongest FOR voter, and the
 * other FOR voters as witnesses. Anything else clears the mark. Called by `expedition/start` before the vote is spent.
 */
export function markDecidedBy(draft: CampaignState, missionId: string, voteId: unknown): void {
  const m = draft.missions.active.find((x) => x.id === missionId);
  if (!m) return;
  delete m.decidedBy;
  const vote = draft.power?.votes.open;
  if (m.source !== 'command' || !vote || vote.id !== voteId || vote.kind !== 'mission' || vote.subject !== missionId || vote.status !== 'passed') return;
  const unitId = responsibleFor(vote, (id) => named(draft, id));
  if (unitId === null) return;
  m.decidedBy = {
    voteId: vote.id, unitId,
    witnessIds: vote.ballots.filter((b) => b.vote === 'for' && b.weight > 0 && b.unitId !== unitId && named(draft, b.unitId)).map((b) => b.unitId),
  };
}

const fill = (text: string, vars: Record<string, string>): string => Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), text);

/**
 * Opens the case as a presented dilemma (context `scapegoat`, about `unitId`, witnessed by the others who backed it). With a
 * dilemma already open it waits in `power.scapegoatQueue` and opens at a later day end; a subject who is gone opens nothing.
 */
export function openScapegoat(draft: CampaignState, ctx: EngineCtx, p: { missionId: string; unitId: string; witnessIds: string[] }): EngineEvent[] {
  const reg = ctx.registries;
  // the case is the authored template of the `scapegoat` context (read by context, never by id)
  const template = [...reg.dilemmaTemplates.values()].find((t) => (t.contexts as string[]).includes('scapegoat') && t.fixed !== undefined);
  const fixed = template?.fixed as { title: string; setup: string; options: Array<Record<string, unknown>> } | undefined;
  if (!template || !fixed || !named(draft, p.unitId)) return [];
  if (draft.dilemmas?.open) {
    const power = powerOf(draft);
    (power.scapegoatQueue ??= []).push({ missionId: p.missionId, unitId: p.unitId, witnessIds: [...p.witnessIds] });
    return [];
  }
  const witnessIds = p.witnessIds.filter((id) => id !== p.unitId && named(draft, id));
  const mission = [...draft.missions.offered, ...draft.missions.active, ...draft.missions.completed].find((m) => m.id === p.missionId);
  const subject = draft.squad.find((u) => u.id === p.unitId)!;
  const d = (draft.dilemmas ??= { seq: 0 });
  d.seq += 1;
  const vars = { name: subject.displayName, mission: mission?.title ?? 'The mission' };
  d.open = {
    id: `dl${d.seq}`, templateId: String(template.id), scale: template.scale as 'major', context: 'scapegoat', day: draft.day, status: 'presented', attempts: 0,
    units: [p.unitId, ...witnessIds], beatId: currentBeat(draft, reg)?.id ?? 'open', source: 'fallback',
    title: fill(fixed.title, vars), setup: fill(fixed.setup, vars),
    options: (fixed.options as unknown as DilemmaOption[]).map((o) => ({ ...structuredClone(o), label: fill(o.label, vars), magnitudes: [] })),
    subjectId: p.unitId, witnessIds,
  };
  return [{ type: 'dilemma_presented', id: d.open.id, templateId: String(template.id), title: d.open.title, source: 'fallback' }];
}

/** The case a failed command mission leaves, and the mark spent on the mission itself (so it can never open a second one). */
export function takeScapegoatCase(m: Mission): { missionId: string; unitId: string; witnessIds: string[] } | null {
  if (m.source !== 'command' || !m.decidedBy) return null;
  const { unitId, witnessIds } = m.decidedBy;
  delete m.decidedBy;
  return { missionId: m.id, unitId, witnessIds: witnessIds ?? [] };
}

/** After a failure the squad chose: a command mission with a `decidedBy` opens the case once, and the mark is spent. */
export function scapegoatAfterFailure(draft: CampaignState, ctx: EngineCtx, m: Mission): EngineEvent[] {
  const c = takeScapegoatCase(m);
  return c ? openScapegoat(draft, ctx, c) : [];
}

/** A run that ended `failed` costs oversight standing on top of the mission's own effects (× the world's `command_failure_mult`). */
export function failedRunPenalty(draft: CampaignState, ctx: EngineCtx, m: Mission): EngineEvent[] {
  if (m.source !== 'command' || !m.decidedBy) return [];
  const penalty = { type: 'faction' as const, factionId: 'own', amount: -TUNING.power.scapegoat.failedRunStanding };
  return applyWorldEffects(draft, ctx, failureEffectsOf(draft, ctx.registries, { ...m, failureEffects: [penalty] }), { kind: 'mission', id: m.id, label: m.title });
}

/** Day end: the first queued case opens when nothing else waits; a case whose subject is gone is dropped with no effects. */
export function openQueuedScapegoat(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const queue = draft.power?.scapegoatQueue;
  if (!queue || queue.length === 0) return [];
  const live = queue.filter((c) => named(draft, c.unitId));
  if (live.length === 0 || draft.dilemmas?.open) {
    draft.power!.scapegoatQueue = live;
    if (live.length === 0) delete draft.power!.scapegoatQueue;
    return [];
  }
  const [first, ...rest] = live;
  if (rest.length > 0) draft.power!.scapegoatQueue = rest;
  else delete draft.power!.scapegoatQueue;
  return openScapegoat(draft, ctx, first);
}
