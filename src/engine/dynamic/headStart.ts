/**
 * The dynamic already underway (P15, plan R21, spec §15.14): the head start of P11b can say that the weeks before day 1 were also weeks of probing. By default it
 * does not (hold 0, no reading, no probe moment: the player sees the first gestures on day 1). With `SetupResult.headStart.dynamicUnderway` (true, or a list of
 * cards) every eligible soldier who already knew the commander gets `round(days x her daily probe chance)` answers behind her: each answer's response and each axis
 * is hashed (`headStartHash`, never the rng) over the neutral spread, moves her hold and her reading as a live answer would (hold inside *testing* at most: the
 * `equal` frame's ceiling), she joins the probe queue, and the back-off does not count these answers (`answerProbe` with `retro`). A seeded unit with a starting
 * frame keeps her frame and her hold; the option adds the probing history only.
 *
 * The recap: each such unit gets at most one probe-like moment (a `headStartMoments` row tagged `probe`, hashed over the rows whose axis she probed), appended to her
 * stored moments, so `recapPairs`, the `head_start_recap` call and the `head_start/recap` action write it under the existing `head_start_moment` rule. Nothing new is
 * remembered. No rng draw at any N.
 */
import type { Entry, Registries } from '../../content/types';
import type { ResponseType } from '../blocking/types';
import type { EngineEvent } from '../dispatch';
import { headStartHash, headStartRaw } from '../headStart/hash';
import type { SetupResult } from '../setup';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { canHold, dynamicOn } from './gate';
import { bandIndex } from './hold';
import { answerProbe, probeChance, probeQueueRoom } from './probes';
import { dynamicOf } from './state';
import type { ProbeAxisEntry } from './types';

/** Which of the head start's units it covers: every one for `true`, the listed cards for a list, none for `false` or nothing. Returns unit ids, in squad order. */
function covered(draft: CampaignState, r: SetupResult): string[] {
  const want = r.headStart?.dynamicUnderway;
  if (want === undefined || want === false) return [];
  const known = new Set((draft.headStart?.units ?? []).map((u) => u.unitId));
  return r.units
    .map((u, i) => ({ card: u.cardRef, id: draft.squad[i]?.id }))
    .filter((x): x is { card: string; id: string } => x.id !== undefined && known.has(x.id) && (want === true || want.includes(x.card)))
    .map((x) => x.id);
}

/** The response of the i-th answer: her hash over the neutral spread (yielded, returned, deflected, resisted). */
function responseOf(seed: number, unitId: string, i: number): ResponseType {
  const S = TUNING.probes.underway;
  const u = headStartHash(seed, unitId, `probe:${i}`);
  return u < S.yielded ? 'yielded' : u < S.yielded + S.returned ? 'returned' : u < S.yielded + S.returned + S.deflected ? 'deflected' : 'resisted';
}

/** The axis of the i-th probe: hashed over the axes of the band's tier or below, leaving out the last few (all of them when that leaves none), like a live probe. */
function axisOf(draft: CampaignState, reg: Registries, seed: number, unitId: string, i: number, recent: readonly string[]): ProbeAxisEntry {
  const tier: 1 | 2 = bandIndex(reg, dynamicOf(draft, unitId)?.hold ?? 0) === 0 ? 1 : 2;
  const axes = [...reg.probeAxes.values()].map((a) => a as unknown as ProbeAxisEntry).filter((a) => a.tier <= tier);
  const fresh = axes.filter((a) => !recent.slice(-TUNING.probes.skipRecent).includes(a.id));
  const pool = fresh.length > 0 ? fresh : axes;
  return pool[headStartRaw(seed, unitId, `axis:${i}`) % pool.length];
}

/**
 * The probe-like moment of her recap (R21): of the `probe` rows whose axis is one of `axes` (default: any) and whose tier is at most `maxTier` (default: 2), the one
 * with the lowest hash `<seed>|<unit>|head_start|probe_moment:<id>`. `null` when there is none. Deterministic; draws nothing.
 */
export function pickProbeMoment(reg: Registries, unit: Pick<Unit, 'id'>, seed: number, opts: { maxTier?: 1 | 2; axes?: readonly string[] } = {}): Entry | null {
  const maxTier = opts.maxTier ?? 2;
  const rows = [...reg.headStartMoments.values()].filter((m) => {
    if (!((m.tags as string[] | undefined) ?? []).includes('probe')) return false;
    const axis = reg.probeAxes.get(String(m.axis)) as unknown as ProbeAxisEntry | undefined;
    return axis !== undefined && axis.tier <= maxTier && (opts.axes === undefined || opts.axes.includes(axis.id));
  });
  if (rows.length === 0) return null;
  const keyed = rows.map((m) => ({ m, h: headStartHash(seed, unit.id, `probe_moment:${String(m.id)}`) }));
  keyed.sort((a, b) => a.h - b.h || String(a.m.id).localeCompare(String(b.m.id)));
  return keyed[0].m;
}

/**
 * Applies the option once at the build, after the head start and the seeds. Needs `state.headStart` (a head start of more than 0 days), the dynamic on and the option;
 * otherwise nothing is touched. Returns the events of what it wrote (`dynamic_started`, `hold_changed`, ... as live answers would; the build discards them).
 */
export function applyDynamicHeadStart(draft: CampaignState, reg: Registries, r: SetupResult): EngineEvent[] {
  const hs = draft.headStart;
  if (hs === undefined || draft.dynamic === undefined || !dynamicOn(draft, reg)) return [];
  const events: EngineEvent[] = [];
  const seed = draft.dynamic.salt; // the setup seed
  for (const unitId of covered(draft, r)) {
    const unit = draft.squad.find((u) => u.id === unitId);
    const mine = hs.units.find((u) => u.unitId === unitId);
    if (unit === undefined || mine === undefined) continue;
    // a unit who already holds (a seed) is eligible as she is; anyone else must be eligible to hold, and the cap still counts
    if (canHold(draft, reg, unitId) !== null) continue;
    const n = Math.round(hs.days * probeChance(draft, reg, unitId));
    if (n <= 0) continue;
    const probed: string[] = [];
    for (let i = 0; i < n; i++) {
      const before = dynamicOf(draft, unitId);
      const axis = axisOf(draft, reg, seed, unitId, i, before?.recent ?? []);
      events.push(...answerProbe(draft, { registries: reg }, unitId, responseOf(seed, unitId, i), undefined, 1, false, { retro: true }));
      const dyn = dynamicOf(draft, unitId);
      if (dyn === undefined) break; // she could not start a dynamic after all
      dyn.probes.issued += 1;
      dyn.recent.push(axis.id);
      while (dyn.recent.length > TUNING.probes.recentMax) dyn.recent.shift();
      probed.push(axis.id);
    }
    const dyn = dynamicOf(draft, unitId);
    if (dyn === undefined) continue;
    dyn.probes.lastDay = draft.day - 1; // she has probed lately, so the queue keeps her; nothing was issued today
    if (!draft.dynamic.queue.includes(unitId) && probeQueueRoom(draft) > 0) draft.dynamic.queue.push(unitId);
    const moment = pickProbeMoment(reg, unit, seed, { axes: probed }); // a moment of an axis she really probed
    if (moment !== null && !mine.moments.includes(String(moment.id))) mine.moments.push(String(moment.id));
  }
  return events;
}
