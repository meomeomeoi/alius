/**
 * The style pair (P15, plan R10, spec §15.4): which of her two styles decides now, and what she expects of a moment when her profile says
 * nothing. A secondary style comes through while one of its `surfacesWhen` conditions holds (or, for the styles of `TUNING.dynamic.style.peakLeads`,
 * at the peak of a hold); otherwise the primary decides. Every condition is one pure check on the state; nothing here writes or draws.
 * Numbers blend and preferences do not (§15.4 rule 3): the blend is P15a's (`blendedStyle`), the preferences come from her profile.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { dynamicOn } from './gate';
import { styleOf } from './profile';
import type { Expectation } from '../moments/answer';
import type { OpenMoment } from '../moments/state';
import type { StyleKey } from '../physics/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { axisStep, distanceToPoint } from './reading';
import { dynamicOf } from './state';
import { OFFER_TABS, type PracticeStyleEntry, type SurfaceCondition } from './types';

/** The keys of a frame's three options (the others, `lock` `look` `ally`, are additions). */
const FRAME_KEYS: readonly string[] = ['0', '1', '2'];

const entryOf = (reg: Registries, key: string): PracticeStyleEntry | undefined => reg.practiceStyles.get(key) as unknown as PracticeStyleEntry | undefined;

/** Is she in the open scene? (A condition that is about the scene is false without one.) */
const inScene = (state: CampaignState, unitId: string): boolean => state.scene?.participants.includes(unitId) === true;

/** Her own hold in this scene is at its peak: the commander's reserve is down to the warning gauge. */
function atPeak(state: CampaignState, unitId: string): boolean {
  const run = state.scene?.physics;
  return run !== undefined && run.holderId === unitId && run.gauge <= (run.capacity * TUNING.physics.warning) / 100;
}

/** Does this activity drill someone (an effect of the tuned types)? */
const trains = (reg: Registries, activityId: string | undefined): boolean =>
  activityId !== undefined && ((reg.activities.get(activityId)?.effects as Array<{ type: string }> | undefined) ?? []).some((e) => TUNING.dynamic.style.trainingEffects.includes(e.type));

/**
 * One surfacing condition (§15.4, plan task 16), true or false. The sources, where the spec leaves them open, are the state's own records
 * (`AUTHOR TO TUNE`): the peak is the physics gauge at its warning level; the scene's edges its first and last exchanges; before others a second
 * soul in the room; satisfaction is not built yet, so favour's sign stands in for it; `after_peak_or_wound` is a hold that has ended in this scene or
 * an injured commander; a new practice is the newest entry of `recent` that is no probe axis, offer kind or repeat; an endurance gain and the crime
 * revealed come from `noted`; ignored is three days without contact.
 */
export function surfaceHolds(state: CampaignState, reg: Registries, unitId: string, cond: SurfaceCondition): boolean {
  const scene = state.scene;
  const rel = dynamicOf(state, unitId);
  const S = TUNING.dynamic.style;
  switch (cond) {
    case 'peak':
      return atPeak(state, unitId);
    case 'scene_edges':
      return scene !== undefined && inScene(state, unitId) && (scene.exchanges <= S.edgeStart || scene.exchanges >= S.edgeEnd);
    case 'before_others':
      return scene !== undefined && inScene(state, unitId) && scene.participants.length >= 2;
    case 'third_person':
      return scene !== undefined && inScene(state, unitId) && (scene.participants.length >= 2 || scene.moments?.open?.visitorId !== undefined);
    case 'displeased':
      return rel !== undefined && rel.favour <= -S.favourMood;
    case 'low_stakes_good_mood':
      return rel !== undefined && rel.favour >= S.favourMood && scene?.physics === undefined && scene?.tone !== 'intimate';
    case 'threat':
      return scene !== undefined && inScene(state, unitId) && scene.participants.some((id) => id !== unitId && (dynamicOf(state, id) !== undefined && frameRank(dynamicOf(state, id)!.frame) >= frameRank('play')));
    case 'after_defiance':
      return (rel !== undefined && (rel.refusals.includes(state.day) || rel.contest.includes(state.day))) || scene?.refusals?.some((r) => r.unitId === unitId) === true;
    case 'after_peak_or_wound': {
      const ended = scene !== undefined && inScene(state, unitId) && (scene.physicsCount ?? 0) > 0 && scene.physics === undefined;
      const hurt = state.commander.injuredUntilDay !== undefined && state.day < state.commander.injuredUntilDay;
      return ended || hurt;
    }
    case 'new_practice': {
      const recent = rel?.recent ?? [];
      const last = recent[recent.length - 1];
      return last !== undefined && !reg.probeAxes.has(last) && !(OFFER_TABS as readonly string[]).includes(last) && recent.filter((r) => r === last).length === 1;
    }
    case 'stagnation': {
      const day = state.dynamic?.noted?.enduranceDay;
      return day !== undefined && state.day - day >= S.stagnationDays;
    }
    case 'training_start':
      return scene !== undefined && inScene(state, unitId) && trains(reg, scene.activityId);
    case 'praised_or_ignored': {
      const contact = state.relations[unitId]?.contactDay;
      return state.dynamic?.noted?.praisedDay === state.day || (contact !== undefined && state.day - contact >= S.ignoredDays);
    }
    case 'crime_mentioned':
      return state.dynamic?.noted?.crimeDay === state.day;
    case 'failed_run': {
      const e = state.lastExpedition;
      return e !== undefined && e.outcome === 'failed' && state.day - e.day <= S.failedRunDays;
    }
    case 'arrival_anniversary':
      return state.day > 0 && state.day % S.anniversaryDays === 0;
  }
}

/**
 * Which of her two styles decides now: the secondary while one of its conditions holds (and, for the tuned peak leaders, at the peak of a hold),
 * else the primary. `key` is the one that leads; a unit with no practice is `neutral`.
 */
export function leadingStyle(state: CampaignState, reg: Registries, unitId: string): { key: StyleKey; phaseLead: 'primary' | 'secondary' } {
  const unit = state.squad.find((u) => u.id === unitId);
  const style = unit === undefined ? undefined : styleOf(unit);
  if (style === undefined) return { key: 'neutral', phaseLead: 'primary' };
  const secondary = style.secondary;
  if (secondary === undefined) return { key: style.primary, phaseLead: 'primary' };
  const conditions = entryOf(reg, secondary)?.surfacesWhen ?? [];
  const surfaces = conditions.some((c) => surfaceHolds(state, reg, unitId, c)) || (TUNING.dynamic.style.peakLeads.includes(secondary) && atPeak(state, unitId));
  return surfaces ? { key: secondary, phaseLead: 'secondary' } : { key: style.primary, phaseLead: 'primary' };
}

/**
 * The option she expects of a moment when her profile has no value (§15.3): the frame option whose response type moves the commander's position
 * (her reading) closest to her style's point (her own offset added); a tie goes to `yielded` once she holds at `play` or beyond and to `returned`
 * between equals. A style with no point (`clinical`) is a tie. Strength 1. Pure.
 */
export function defaultExpectation(state: CampaignState, reg: Registries, moment: Pick<OpenMoment, 'unitId' | 'options'>): Expectation {
  const rel = dynamicOf(state, moment.unitId);
  const unit = state.squad.find((u) => u.id === moment.unitId);
  const primary = unit === undefined ? undefined : styleOf(unit)?.primary;
  const entry = primary === undefined ? undefined : entryOf(reg, primary);
  const offset = unit?.kind === 'named' ? unit.expectations?.offset : undefined;
  const point = entry?.point == null ? undefined : { r: entry.point.r + (offset?.r ?? 0), f: entry.point.f + (offset?.f ?? 0) };
  const frame = moment.options.filter((o) => FRAME_KEYS.includes(o.key));
  const options = frame.length > 0 ? frame : [...moment.options];
  const prefer = rel !== undefined && frameRank(rel.frame) >= frameRank('play') ? 'yielded' : 'returned';
  const score = (type: string): number => {
    if (point === undefined || rel === undefined) return 0;
    const next = axisStep(rel.readOf, type as Parameters<typeof axisStep>[1], TUNING.position.alpha.moment);
    return Math.round(distanceToPoint(next, point) * 1e6) / 1e6;
  };
  const best = Math.min(...options.map((o) => score(o.type)));
  const tied = options.filter((o) => score(o.type) === best);
  const pick = tied.find((o) => o.type === prefer) ?? tied.find((o) => o.type === (prefer === 'yielded' ? 'returned' : 'yielded')) ?? tied[0];
  return { key: pick?.key ?? '0', strength: 1 };
}

/**
 * After every action: notes what the surfacing reads and no state keeps, from the events (the commander's endurance gained, the crime revealed
 * or the commander praised, or agreed with, in an intents report). Writes only while the dynamic is on; draws nothing.
 */
export function noteEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  if (draft.dynamic === undefined || !dynamicOn(draft, ctx.registries)) return [];
  const noted = (): NonNullable<typeof draft.dynamic>['noted'] => (draft.dynamic!.noted ??= {});
  for (const e of events) {
    if (e.type === 'endurance_gained') noted()!.enduranceDay = draft.day;
    if (e.type === 'intents_applied' && Array.isArray(e.landed) && e.landed.includes('crime_revealed')) noted()!.crimeDay = draft.day;
    if (e.type === 'intents_applied' && Array.isArray(e.landed) && (e.landed.includes('praised') || e.landed.includes('opinion_agreed'))) noted()!.praisedDay = draft.day;
  }
  return [];
}
