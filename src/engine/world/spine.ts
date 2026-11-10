import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addChronicle, addFact } from '../memory';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { applyWorldEffects } from './effects';
import { offerMission } from './missions';
import type { Mission, ThreadStatus, WorldEffect } from './types';

export interface Beat {
  id: string;
  title: string;
  goal: string;
  conditions?: {
    minDay?: number;
    flagsAll?: string[];
    flagsNone?: string[];
    clearanceMin?: number;
    threads?: Array<{ id: string; status: ThreadStatus }>;
  };
  completion?: { kind: 'auto' } | { kind: 'mission'; templateId: string; regionId: string } | { kind: 'flag'; anyOf: string[] };
  onComplete?: WorldEffect[];
}

/** The authored spine of the campaign's start (empty without a start). */
export function spineOf(state: CampaignState, reg: Registries): Beat[] {
  const start = state.world.startId === undefined ? undefined : reg.starts.get(state.world.startId);
  return (start?.spine as Beat[] | undefined) ?? [];
}

/** The next beat to reach, or `null` once the spine is done (the open-ended phase) or there is none. */
export function currentBeat(state: CampaignState, reg: Registries): Beat | null {
  return spineOf(state, reg)[state.world.spineProgress] ?? null;
}

export function isOpenEnded(state: CampaignState, reg: Registries): boolean {
  const spine = spineOf(state, reg);
  return spine.length > 0 && state.world.spineProgress >= spine.length;
}

const hasFlag = (state: CampaignState, id: string): boolean => state.world.flags.includes(id) || state.commander.flags.includes(id);

/** Every condition of the beat holds right now. */
export function beatReady(state: CampaignState, _reg: Registries, beat: Beat): boolean {
  const c = beat.conditions;
  if (!c) return true;
  if (c.minDay !== undefined && state.day < c.minDay) return false;
  if (c.flagsAll?.some((f) => !hasFlag(state, f))) return false;
  if (c.flagsNone?.some((f) => hasFlag(state, f))) return false;
  if (c.clearanceMin !== undefined && (state.world.clearanceTier ?? 0) < c.clearanceMin) return false;
  if (c.threads?.some((t) => state.world.threads.find((x) => x.id === t.id)?.status !== t.status)) return false;
  return true;
}

/** Why the director may not propose this beat now, or `null`. */
export function checkProposal(state: CampaignState, reg: Registries, beatId: string, cooldownDays: number): string | null {
  const beat = currentBeat(state, reg);
  if (!beat || beat.id !== beatId) return `Beat "${beatId}" is not the current beat.`;
  if (state.world.spine?.proposed === beatId) return `Beat "${beatId}" was already proposed.`;
  if (!beatReady(state, reg, beat)) return `The conditions of beat "${beatId}" are not ready.`;
  const last = state.world.spine?.lastProposalDay;
  if (last !== undefined && state.day - last < cooldownDays) return `Cooldown: the last beat was proposed ${state.day - last} day(s) ago (needs ${cooldownDays}).`;
  return null;
}

const cutWords = (text: string, max: number): string => text.trim().split(/\s+/).filter(Boolean).slice(0, max).join(' ');

/**
 * Starts the current beat: stores the framing (fact + chronicle), opens its thread and, for a `mission` completion,
 * offers the story mission. `flag` and `auto` beats may be done at once. Throws when the beat is not the current,
 * ready, unproposed one (callers check the cooldown with `checkProposal`).
 */
export function proposeBeat(draft: CampaignState, ctx: EngineCtx, beatId: string, framing: string): EngineEvent[] {
  const reg = ctx.registries;
  const problem = checkProposal(draft, reg, beatId, 0);
  if (problem) throw new Error(problem);
  const beat = currentBeat(draft, reg)!;
  const text = cutWords(framing, TUNING.director.framingWords) || beat.goal;
  const events: EngineEvent[] = [];

  draft.world.spine = { ...(draft.world.spine ?? {}), proposed: beatId, proposedDay: draft.day, lastProposalDay: draft.day };
  const threadId = `spine:${beatId}`;
  if (!draft.world.threads.some((t) => t.id === threadId)) {
    const completion = beat.completion;
    draft.world.threads.push({
      id: threadId, title: beat.title, status: 'open', flags: [], relatedUnits: [],
      relatedRegions: completion?.kind === 'mission' ? [completion.regionId] : [], createdDay: draft.day,
    });
  }
  addFact(draft, { about: [], text, tags: ['spine'], importance: 4, day: draft.day, knownBy: ['*'] });
  addChronicle(draft, { kind: 'scene', day: draft.day, text });
  events.push({ type: 'beat_proposed', beatId, framing: text });

  const completion = beat.completion ?? { kind: 'auto' as const };
  if (completion.kind === 'mission') {
    const taken = [...draft.missions.offered, ...draft.missions.active].some((m) => m.spineBeat === beatId);
    if (!taken) {
      events.push(...offerMission(draft, ctx, {
        templateId: completion.templateId, regionId: completion.regionId, source: 'story', spineBeat: beatId, threadId,
      }).events);
    }
  } else if (completion.kind === 'auto') {
    events.push(...completeBeat(draft, ctx, beatId));
  } else {
    events.push(...checkBeatFlags(draft, ctx));
  }
  return events;
}

/** Finishes the proposed current beat (never any other): onComplete effects, thread resolved, progress advanced. */
export function completeBeat(draft: CampaignState, ctx: EngineCtx, beatId: string): EngineEvent[] {
  const beat = currentBeat(draft, ctx.registries);
  if (!beat || beat.id !== beatId) throw new Error(`Beat "${beatId}" is not the current beat: beats cannot be skipped.`);
  if (draft.world.spine?.proposed !== beatId) throw new Error(`Beat "${beatId}" was not proposed.`);
  // advance first: effects of onComplete may set flags, which re-checks the (now next) beat
  const thread = draft.world.threads.find((t) => t.id === `spine:${beatId}`);
  if (thread) thread.status = 'resolved';
  draft.world.spineProgress += 1;
  delete draft.world.spine!.proposed;
  delete draft.world.spine!.proposedDay;
  const events: EngineEvent[] = [{ type: 'beat_completed', beatId, progress: draft.world.spineProgress }];
  events.push(...applyWorldEffects(draft, ctx, beat.onComplete ?? [], { kind: 'beat', id: beatId, label: beat.title }));
  return events;
}

/** Hook: a finished story mission completes the beat it was offered for. */
export function onMissionCompleted(draft: CampaignState, ctx: EngineCtx, mission: Mission): EngineEvent[] {
  if (mission.spineBeat === undefined || draft.world.spine?.proposed !== mission.spineBeat) return [];
  const beat = currentBeat(draft, ctx.registries);
  if (!beat || beat.id !== mission.spineBeat || beat.completion?.kind !== 'mission') return [];
  return completeBeat(draft, ctx, beat.id);
}

/** Hook: a proposed `flag` beat completes once one of its flags is set. */
export function checkBeatFlags(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const beat = currentBeat(draft, ctx.registries);
  if (!beat || draft.world.spine?.proposed !== beat.id || beat.completion?.kind !== 'flag') return [];
  if (!beat.completion.anyOf.some((f) => hasFlag(draft, f))) return [];
  return completeBeat(draft, ctx, beat.id);
}
