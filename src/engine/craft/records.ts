/**
 * Records in fiction time (P16b, plan Task 3; spec section 4, ruling 11). A hold is counted in beats, never by the clock: `fictionSeconds` turns the
 * beats a run used into the time they stand for (`TUNING.craft.beatSeconds` of the physics, stretched by the commander's level), so a record is the
 * same at every `marathonPace` and from turn-based or real-time play. The unit of a segment is its real-time beat count, whatever the scene's mode
 * (the physics layer counts a turn-based segment in `turnBeats`, which is a way of playing, not a length of fiction). A marathon's record is its hours.
 *
 * `noteHoldEvents` reads the events of an action (`physics_segment`, `physics_outcome`, `marathon_done`) and pays the xp of a clean segment and sets the
 * pair's records; it writes only for a craft-live holder and draws nothing.
 */
import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addCraftXp, addPairXp, craftLevel } from './book';
import { craftLive } from './gate';
import { noteClean } from './streak';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';

/** How many real-time beats one segment of a physics has (never the turn-based count). */
export function segmentBeats(reg: Registries, physicsId: string): number {
  const seconds = Number(reg.contactPhysics.get(physicsId)?.segmentSeconds);
  return Math.max(1, Math.ceil(((Number.isFinite(seconds) ? seconds : 0) * 1000) / TUNING.physics.beatMs));
}

/** The seconds of fiction `beats` of a physics stand for at a level of the commander's endurance: beats x the physics' seconds a beat x (1 + `beatSkill` a level). Whole seconds. */
export function fictionSeconds(physicsId: string, beats: number, level: number): number {
  const perBeat = TUNING.craft.beatSeconds[physicsId] ?? TUNING.craft.beatSecondsDefault;
  return Math.round(beats * perBeat * (1 + TUNING.craft.beatSkill * level));
}

/** What a run came to, as the craft needs it. */
export interface RunOutcome {
  holderId: string;
  physicsId: string;
  result: string;
  /** Segments played (`physics_outcome.segments`). */
  segments: number;
  /** Slips she perceived (`tally.slips`). */
  slips: number;
  /** Ended by the tap, or a tap was ignored during the run. */
  tapped: boolean;
  /** A marathon's hours (`marathon_done.hours`): its record is `hours x 3600`, not beats. */
  marathonHours?: number;
}

/** The three kinds of record, most specific first. */
export const RECORD_KINDS = ['clean', 'noTap', 'longest'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

/** A run that was ended well enough to be remembered as a hold: not the stop word (it is out of the fiction), not a her-task frame. */
const COUNTS = (reg: Registries, o: RunOutcome): boolean => o.result !== 'stopped' && reg.contactPhysics.get(o.physicsId)?.interaction !== 'passive';

/**
 * Sets the pair's records from a finished run and keeps her settling-in count. The seconds are the run's (a marathon's hours), the longest hold always,
 * the longest without a slip when no slip was perceived and the run did not collapse, the longest without a tap when it was not ended by one. They are equal
 * whenever they are set, so a new best emits ONE `record_set` (the most specific kind that improved, the others listed in `kinds`). Nothing under
 * `record.minSeconds` is kept or said. Nothing is written for a holder who is not craft-live.
 */
export function noteRun(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, o: RunOutcome): EngineEvent[] {
  const reg = ctx.registries;
  if (!craftLive(draft, reg, o.holderId) || !COUNTS(reg, o)) return [];
  const unclean = o.slips > 0 || o.result === 'collapse' || o.result === 'limit_broken' || o.result === 'blackout';
  const level = craftLevel(draft, `endurance:${o.physicsId}`);
  const seconds = o.marathonHours !== undefined ? Math.round(o.marathonHours * 3600) : fictionSeconds(o.physicsId, o.segments * segmentBeats(reg, o.physicsId), level);
  if (o.result === 'released' || o.result === 'checked') noteClean(draft, o.holderId, o.physicsId, !unclean);
  if (seconds < TUNING.craft.record.minSeconds) return [];
  const rel = draft.relations[o.holderId];
  if (rel === undefined) return [];
  const have = rel.craft?.records?.[o.physicsId];
  const improved: RecordKind[] = [];
  const wins = { longest: true, clean: !unclean, noTap: !o.tapped } as const;
  for (const kind of RECORD_KINDS) if (wins[kind] && seconds > (have?.[kind] ?? 0)) improved.push(kind);
  if (improved.length === 0) return [];
  const rec = (((rel.craft ??= {}).records ??= {})[o.physicsId] ??= { longest: 0, clean: 0, noTap: 0, day: draft.day });
  for (const kind of improved) rec[kind] = seconds;
  rec.day = draft.day;
  return [{ type: 'record_set', unitId: o.holderId, key: o.physicsId, seconds, kind: improved[0], kinds: improved }];
}

/**
 * The craft's reading of an action's events: a clean segment of a hold pays `xp.phase` to the endurance of its physics (a marathon's, times its pace
 * scale, so a phase is worth the same at every pace), and a finished run sets records. Only a holder who is craft-live is counted.
 */
export function noteHoldEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type !== 'physics_segment' || e.phase !== 'end' || e.slips !== 0 || typeof e.holderId !== 'string' || typeof e.physicsId !== 'string') continue;
    if (reg.contactPhysics.get(e.physicsId)?.skill !== true || !craftLive(draft, reg, e.holderId)) continue;
    const scale = typeof e.scale === 'number' ? e.scale : 1;
    out.push(...addCraftXp(draft, reg, `endurance:${e.physicsId}`, Math.round(TUNING.craft.xp.phase * scale * 100) / 100, 'phase'));
    if (reg.contactPhysics.get(e.physicsId)?.interaction === 'timing') addPairXp(draft, reg, e.holderId, 'rhythm', TUNING.craft.xp.knowledge); // a clean timing segment: the commander learns her rhythm
  }
  const taps = (id: unknown): boolean => events.some((x) => x.type === 'physics_signal' && x.released === true && x.runId === id);
  for (const e of events) {
    if (e.type !== 'physics_outcome' || typeof e.holderId !== 'string' || typeof e.physicsId !== 'string') continue;
    const done = events.find((x) => x.type === 'marathon_done' && x.unitId === e.holderId && x.physicsId === e.physicsId);
    const tally = (typeof e.tally === 'object' && e.tally !== null ? e.tally : {}) as Record<string, number>;
    out.push(...noteRun(draft, ctx, {
      holderId: e.holderId, physicsId: e.physicsId, result: String(e.result), segments: Number(e.segments) || 0, slips: Number(tally.slips) || 0,
      tapped: taps(e.runId) || Number(e.taps) > 0, ...(done !== undefined && typeof done.hours === 'number' ? { marathonHours: done.hours } : {}),
    }));
  }
  return out;
}
