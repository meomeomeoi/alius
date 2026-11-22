/**
 * Probes (P15, plan R9, spec §15.1, §15.12): the soft entry. Before any frame an eligible soldier tests, small and deniable, whether the
 * commander yields; the engine decides when and on which axis (a daily chance, a hashed axis, a queue so that not every woman probes), the
 * main model invents the gesture from a directive, and `intent_extract` reports the answer. An answer moves hold (R8) and her reading of the
 * commander's position (R10). Backing off is the way a refusal works: consistent deflection and she leaves it alone for a long time.
 *
 * Draws: one `ctx.rng.chance` per unit that is eligible and has room, and nothing else (the axis and the order are hashed, `dynamicRoll`). A day with
 * nobody eligible draws nothing. At most one probe is issued a day.
 */
import type { Registries } from '../../content/types';
import type { ResponseType } from '../blocking/types';
import { frameRank } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { impunityOf } from '../discipline/impunity';
import { isLiving } from '../economy';
import { physicsStyleOf } from '../physics/style';
import { assertiveness } from '../power/options';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { canHold, dynamicOn, effectiveInclination, ensureDynamic, holderCap } from './gate';
import { addHold, bandIndex } from './hold';
import { practiceOf } from './profile';
import { updateReading } from './reading';
import { dynamicOf, type DynamicRelation } from './state';
import { dynamicRoll } from './witness';
import type { ProbeAxisEntry, Tone } from './types';

const livingNamed = (draft: Pick<CampaignState, 'squad'>) => draft.squad.filter((u) => u.kind === 'named' && isLiving(u));

/** Her pending probe (the axis she is testing and when it came), or `undefined`: none, or the dynamic is off. */
export function pendingProbe(state: Pick<CampaignState, 'relations' | 'dynamic'>, unitId: string): NonNullable<DynamicRelation['probes']['pending']> | undefined {
  if (state.dynamic === undefined || state.dynamic.setup.holders === 0) return undefined;
  return dynamicOf(state, unitId)?.probes.pending;
}

/**
 * The one probe a scene carries (spec: one a day, one a scene): of the present units, the first with a pending probe, in the order given.
 * The directive and the intent offer both read this, so a second pending probe waits for another scene.
 */
export function sceneProbe(state: Pick<CampaignState, 'relations' | 'dynamic'>, present: readonly string[]): { unitId: string; probe: NonNullable<DynamicRelation['probes']['pending']> } | undefined {
  for (const unitId of present) {
    const probe = pendingProbe(state, unitId);
    if (probe !== undefined) return { unitId, probe };
  }
  return undefined;
}

/** How many more units may start probing: the cap (`any` is 3) less those in the queue. */
export function probeQueueRoom(state: Pick<CampaignState, 'dynamic'>): number {
  const cap = holderCap(state);
  const n = Number.isFinite(cap) ? cap : TUNING.probes.queueMax;
  return Math.max(0, n - (state.dynamic?.queue.length ?? 0));
}

/** Has she a cause to probe although she is only `latent`: a high Impunity, or she knows a dynamic and is drawn to seeing one (R9). */
function latentCause(state: CampaignState, reg: Registries, unitId: string): boolean {
  if ((impunityOf(state, reg, unitId)?.value ?? 0) >= TUNING.dynamic.impunityRoute) return true;
  const known = Object.values(state.dynamic?.knowledge[unitId] ?? {}).some((k) => k.level === 'knows_dynamic');
  if (!known) return false;
  const view = practiceOf(state, reg, unitId);
  return view !== null && Object.values(view.categories).some((c) => c.witness === 'drawn');
}

/** Her daily chance of a probe, before the roll (0 when she does not probe at all). */
export function probeChance(state: CampaignState, reg: Registries, unitId: string): number {
  const inclination = effectiveInclination(state, unitId);
  if (inclination === 'none') return 0;
  if (inclination === 'latent' && !latentCause(state, reg, unitId)) return 0;
  const base = TUNING.probes.chance[inclination];
  const p = base * TUNING.dynamic.frequency[state.dynamic!.setup.frequency] * assertiveness(state, reg).demandMult;
  return Math.min(1, Math.max(0, p));
}

/** The axis of the probe: hashed over the axes of the band's tier or below, leaving out the last few she used (all of them when that leaves none). */
function pickAxis(draft: CampaignState, reg: Registries, unitId: string, tier: 1 | 2, recent: readonly string[]): ProbeAxisEntry {
  const axes = [...reg.probeAxes.values()].map((a) => a as unknown as ProbeAxisEntry).filter((a) => a.tier <= tier);
  const skip = recent.slice(-TUNING.probes.skipRecent);
  const fresh = axes.filter((a) => !skip.includes(a.id));
  const pool = fresh.length > 0 ? fresh : axes;
  return pool[Math.min(pool.length - 1, Math.floor(dynamicRoll(draft, unitId, 'probe_axis') * pool.length))];
}

/** She stays in the queue while she can still be probing: not at `play`, not backed off, probed within the idle days or pending. */
function staysInQueue(draft: CampaignState, id: string): boolean {
  const dyn = dynamicOf(draft, id);
  const unit = draft.squad.find((u) => u.id === id);
  if (dyn === undefined || unit === undefined || !isLiving(unit)) return false;
  if (frameRank(dyn.frame) >= frameRank('play')) return false;
  if (dyn.probes.backoffUntil !== undefined && draft.day < dyn.probes.backoffUntil) return false;
  if (dyn.probes.pending !== undefined) return true;
  return dyn.probes.lastDay !== undefined && draft.day - dyn.probes.lastDay <= TUNING.probes.queueIdleDays;
}

/**
 * The probe step of the day (sub-step 5 of `dynamicDayStep`): a pending probe lapses after `lapseDays`; the queue sheds those who backed
 * off, reached `play` or went quiet; then at most one unit, eligible and in `equal` on interest or testing, rolls her daily chance. A unit
 * outside the queue rolls only while it has room. Returns `probe_issued` (and `dynamic_started` for a unit's first probe).
 */
export function probeDayStep(draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) return [];
  const campaign = draft.dynamic!;
  for (const u of livingNamed(draft)) {
    const p = dynamicOf(draft, u.id)?.probes;
    if (p?.pending !== undefined && draft.day - p.pending.day >= TUNING.probes.lapseDays) delete p.pending;
  }
  campaign.queue = campaign.queue.filter((id) => staysInQueue(draft, id));
  // one a day: nothing more is issued once a probe came today
  if (draft.squad.some((u) => dynamicOf(draft, u.id)?.probes.lastDay === draft.day)) return [];
  const candidates = livingNamed(draft)
    .map((u) => u.id)
    .filter((id) => {
      const dyn = dynamicOf(draft, id);
      if (dyn !== undefined && (frameRank(dyn.frame) >= frameRank('play') || dyn.probes.pending !== undefined)) return false;
      if (dyn?.probes.backoffUntil !== undefined && draft.day < dyn.probes.backoffUntil) return false;
      return canHold(draft, reg, id) === null;
    })
    .sort((a, b) => dynamicRoll(draft, a, 'probe_order') - dynamicRoll(draft, b, 'probe_order'));
  for (const id of candidates) {
    if (!campaign.queue.includes(id) && probeQueueRoom(draft) <= 0) continue;
    const p = probeChance(draft, reg, id);
    if (p <= 0 || !ctx.rng.chance(p)) continue;
    const events = ensureDynamic(draft, reg, id);
    const dyn = dynamicOf(draft, id);
    if (dyn === undefined) continue;
    const tier: 1 | 2 = bandIndex(reg, dyn.hold) === 0 ? 1 : 2;
    const axis = pickAxis(draft, reg, id, tier, dyn.recent);
    dyn.probes.pending = { axis: axis.id, tier, day: draft.day };
    dyn.probes.lastDay = draft.day;
    dyn.probes.issued += 1;
    dyn.recent.push(axis.id);
    while (dyn.recent.length > TUNING.probes.recentMax) dyn.recent.shift();
    if (!campaign.queue.includes(id)) campaign.queue.push(id);
    events.push({ type: 'probe_issued', unitId: id, axis: axis.id, tier });
    return events;
  }
  return [];
}

/** The hold an answer is worth before the pace, her compatibility and her sensitivity: the gain table by response (`playful` / `cruel` like a return more). */
function answerCause(state: CampaignState, unitId: string, response: ResponseType): keyof typeof TUNING.dynamic.gains {
  if (response === 'returned') {
    const primary = state.squad.find((u) => u.id === unitId)?.bond?.practice?.style.primary;
    return primary === 'playful' || primary === 'cruel' ? 'probe_returned_playful' : 'probe_returned';
  }
  return `probe_${response}` as keyof typeof TUNING.dynamic.gains;
}

/**
 * The commander's answer to a probe (or, at weight 0.5, to a gesture the model made on its own: `probe_observed`). Moves hold by the gain
 * table, scaled by her sensitivity and by the weight, and then feeds her reading (alpha 0.10, halved at weight 0.5). At weight 1 it closes her pending probe, records the answer
 * and checks the back-off (a pending probe is required: without one nothing happens); at 0.5 it closes nothing and records nothing, and
 * a unit with no dynamic yet starts one if she may hold. Draws nothing. `tone` is the intent's tone, already validated; `afterThreat`: the batch held a threat to the commander (`threatIn`), so a yield reads as fear.
 */
export function answerProbe(
  draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, unitId: string, response: ResponseType, tone: Tone | undefined, weight: 1 | 0.5, afterThreat = false,
  opts: { retro?: boolean } = {},
): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) return [];
  const events: EngineEvent[] = [];
  let dyn = dynamicOf(draft, unitId);
  // `retro` (the head start's answers, R21): an answer from the weeks before day 1. It needs no pending probe, is never recorded as an answer and starts no back-off,
  // and it moves no hold of a woman who is already past `equal` (a seed with a starting frame keeps hers); the reading takes it as it takes any answer.
  const retro = opts.retro === true;
  if (weight === 1 && !retro && dyn?.probes.pending === undefined) return [];
  if (dyn === undefined) {
    if (canHold(draft, reg, unitId) !== null) return [];
    events.push(...ensureDynamic(draft, reg, unitId));
    dyn = dynamicOf(draft, unitId);
    if (dyn === undefined) return events;
  }
  const sensitivity = TUNING.dynamic.sensitivity[draft.dynamic!.setup.units[unitId]?.sensitivity ?? 'normal'];
  const cause = answerCause(draft, unitId, response);
  const base = TUNING.dynamic.gains[cause] * sensitivity * (weight === 1 ? 1 : TUNING.dynamic.observedFactor);
  if (!(retro && frameRank(dyn.frame) >= frameRank('play'))) events.push(...addHold(draft, ctx, unitId, base, cause));
  // her reading takes the answer after the hold: a gain is scaled by how she read the commander until now
  const unit = draft.squad.find((u) => u.id === unitId)!;
  const alpha = TUNING.position.alpha.probe * (weight === 1 ? 1 : TUNING.dynamic.observedFactor);
  const shift = updateReading(dyn, { response, ...(tone !== undefined ? { tone } : {}), ...(afterThreat ? { afterThreat } : {}) }, alpha, physicsStyleOf(draft, unitId, reg), unit.insight ?? 'mid').region;
  if (shift !== undefined) events.push({ type: 'position_shifted', unitId, from: shift.from, to: shift.to });
  if (weight === 1 && !retro) {
    delete dyn.probes.pending;
    dyn.probes.answers.push(response);
    while (dyn.probes.answers.length > TUNING.probes.backoffWindow) dyn.probes.answers.shift();
    const refused = dyn.probes.answers.filter((a) => a === 'deflected' || a === 'resisted').length;
    if (refused >= TUNING.probes.backoffCount) {
      dyn.probes.backoffUntil = draft.day + TUNING.dynamic.backoffDays;
      dyn.probes.answers = [];
      draft.dynamic!.queue = draft.dynamic!.queue.filter((id) => id !== unitId);
      events.push({ type: 'probe_backoff', unitId, until: dyn.probes.backoffUntil });
    }
  }
  return events;
}
