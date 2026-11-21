/**
 * Milestones and frame changes (P15, plan R11, spec §4): a frame moves only through a milestone, never by a number. `milestonesDue` runs
 * after every hold change and at day end: an `automatic` milestone applies at once, any other one opens (one open per unit) in its form,
 * a booking, a demand in her voice or a line in her next scene. `applyMilestone` is the only writer of `frame` apart from seeds.
 * `refusalCost` is what refusing her costs by the frame. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { bondTierOf } from '../bonds/profile';
import { contentAllowed } from '../bonds/content';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { pushMessage } from '../dms';
import { isLiving } from '../economy';
import { book, bookingKindsFor } from '../personal/bookings';
import type { CampaignState, Slot } from '../state/types';
import { TUNING } from '../tuning';
import { canHold, dynamicOn } from './gate';
import { addHold, frameEntry, holdBandOf } from './hold';
import { practiceOf } from './profile';
import { dynamicOf, type DynamicRelation } from './state';
import { trackCap } from './tracks';
import type { Capability, DynamicDomainEntry, DynamicMilestoneEntry } from './types';

type Ctx = Pick<EngineCtx, 'registries'>;

const milestoneRows = (reg: Registries): DynamicMilestoneEntry[] => [...reg.dynamicMilestones.values()] as unknown as DynamicMilestoneEntry[];
const milestoneEntry = (reg: Registries, id: string): DynamicMilestoneEntry | undefined => reg.dynamicMilestones.get(id) as unknown as DynamicMilestoneEntry | undefined;

/** What her domains grant, by capability (a domain id is never read). Chunk (f)'s `capabilitiesOf` is the same thing with skip rules. */
function capabilitiesHeld(dyn: DynamicRelation, reg: Registries): Set<Capability> {
  const held = new Set<Capability>();
  for (const d of dyn.domains) for (const c of (reg.dynamicDomains.get(d.id) as unknown as DynamicDomainEntry | undefined)?.grants ?? []) held.add(c);
  return held;
}

/**
 * Whether every `requires` of the milestone holds right now for her: the hold band (at least), track levels (a closed track reads 0),
 * the capabilities her domains grant, the practice categories she does and that are on, her primary style, the romantic tier, the days
 * since her last practice, a former holder, and a capability she must lack. Also false while the milestone's content tags are off. It does
 * not look at her frame or at a cooldown (the caller does). Pure.
 */
export function requiresMet(state: CampaignState, reg: Registries, unitId: string, m: DynamicMilestoneEntry): boolean {
  const dyn = dynamicOf(state, unitId);
  if (dyn === undefined || !contentAllowed(state, reg, m, unitId)) return false;
  const r = m.requires;
  if (r.holdBand !== undefined) {
    const band = reg.holdBands.get(r.holdBand);
    if (band === undefined || dyn.hold < Number(band.min)) return false;
  }
  if (r.tracks !== undefined && Object.entries(r.tracks).some(([id, level]) => trackCap(state, reg, unitId, id) < level)) return false;
  const caps = capabilitiesHeld(dyn, reg);
  if (r.capabilities !== undefined && !r.capabilities.every((c) => caps.has(c))) return false;
  if (r.noCapability !== undefined && caps.has(r.noCapability)) return false;
  if (r.categories !== undefined) {
    const view = practiceOf(state, reg, unitId);
    if (view === null || !r.categories.every((c) => view.allowed.includes(c) && view.categories[c]?.as !== 'none')) return false;
  }
  if (r.styles !== undefined) {
    const primary = state.squad.find((u) => u.id === unitId)?.bond?.practice?.style.primary;
    if (primary === undefined || !r.styles.includes(primary)) return false;
  }
  if (r.romantic === true && bondTierOf(state, reg, unitId) !== 'romantic') return false;
  if (r.coolingDays !== undefined && state.day - dyn.lastPracticeDay < r.coolingDays) return false;
  if (r.formerHolder === true && dyn.formerHolder === undefined) return false;
  return true;
}

/**
 * A down-transition (`noCapability`) does not apply while she still holds the frame by another road: an entering milestone of that frame
 * (from another frame) that carries no capability claim (a claim ties it to the command) and whose requirements are met right now.
 */
function holdsFrameWithoutIt(state: CampaignState, reg: Registries, unitId: string, m: DynamicMilestoneEntry): boolean {
  if (m.requires.noCapability === undefined) return false;
  return milestoneRows(reg).some((e) => e.to === m.from && e.from !== e.to && e.offer !== 'automatic' && !e.effects.some((x) => x.type === 'claim') && requiresMet(state, reg, unitId, e));
}

/** Can this milestone come now: her frame is its `from`, no cooldown, not a passed mark, its requirements met, and (out of `equal`) she may hold. */
function eligible(state: CampaignState, reg: Registries, unitId: string, dyn: DynamicRelation, m: DynamicMilestoneEntry): boolean {
  if (m.from !== dyn.frame || state.day < (dyn.cooldowns[m.id] ?? -Infinity)) return false;
  if (m.from === m.to && dyn.milestones.includes(m.id)) return false; // a mark is made once
  if (!requiresMet(state, reg, unitId, m) || holdsFrameWithoutIt(state, reg, unitId, m)) return false;
  return m.from !== 'equal' || canHold(state, reg, unitId) === null;
}

/** The first evening from now (today's counts while it is still ahead) that nobody has booked. `null` when none within the search days. */
function nextFreeEvening(state: CampaignState): number | null {
  const taken = (state.personal?.bookings ?? []).filter((b) => b.status === 'booked' && b.slot === 'evening').map((b) => b.day);
  const from = state.slot === 'evening' || state.slot === 'night' ? state.day + 1 : state.day;
  for (let d = from; d <= from + TUNING.dynamic.milestones.bookingSearchDays; d++) if (!taken.includes(d)) return d;
  return null;
}

/** Opens a milestone in its form: the offer row, `milestone_offered`, and for a booking or a demand her message (a booking also books her next free evening). */
function openMilestone(draft: CampaignState, ctx: Ctx, unitId: string, m: DynamicMilestoneEntry): EngineEvent[] {
  const x = draft.dynamic!;
  const id = `dm${x.seq++}`;
  x.open.milestones.push({ id, unitId, milestoneId: m.id, day: draft.day, form: m.offer });
  const events: EngineEvent[] = [{ type: 'milestone_offered', unitId, id, milestoneId: m.id, form: m.offer }];
  if (m.offer === 'booking') {
    const day = nextFreeEvening(draft);
    const kind = bookingKindsFor(draft, ctx.registries, unitId).find((k) => k.slot === 'evening');
    if (day !== null && kind !== undefined) events.push(...book(draft, ctx, { unitId, kindId: String(kind.id), day, slot: 'evening' as Slot, source: 'milestone' }));
  }
  if (m.offer === 'booking' || m.offer === 'demand') {
    const name = draft.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
    pushMessage(draft, unitId, { from: unitId, text: m.text.replaceAll('{name}', name), day: draft.day, slot: draft.slot, read: false, initiated: true });
  }
  return events;
}

/**
 * What a milestone does once it applies (accepted, or automatic): the frame moves to `to` (with `frame_changed`; her hold is lifted to the
 * new frame's floor but never raised otherwise, so accepting moves no hold), the vow sets `sworn`, a `claim` hands her the first domain that
 * grants the capability, and any open milestone that no longer starts from her frame is dropped. A down-transition keeps the milestones that
 * lead back into the frame she left from coming for `afterDownDays`. The milestone id is recorded as passed. `drop_romance` is reserved (no
 * row uses it yet). The only writer of `frame` apart from the seeds.
 */
export function applyMilestone(draft: CampaignState, ctx: Ctx, unitId: string, milestoneId: string): EngineEvent[] {
  const reg = ctx.registries;
  const m = milestoneEntry(reg, milestoneId);
  const dyn = dynamicOf(draft, unitId);
  if (m === undefined || dyn === undefined || !dynamicOn(draft, reg)) return [];
  const events: EngineEvent[] = [];
  for (const effect of m.effects) {
    if (effect.type === 'frame') {
      const from = dyn.frame;
      dyn.frame = m.to;
      events.push({ type: 'frame_changed', unitId, from, to: m.to, milestoneId: m.id });
      const floor = frameEntry(reg, m.to)?.holdFloor ?? 0;
      if (dyn.hold < floor) {
        const was = dyn.hold;
        dyn.hold = floor;
        events.push({ type: 'hold_changed', unitId, from: was, to: floor, cause: 'frame' });
        if (holdBandOf(reg, was) !== holdBandOf(reg, floor)) events.push({ type: 'hold_band_changed', unitId, from: holdBandOf(reg, was), to: holdBandOf(reg, floor) });
      }
      if (frameRank(m.to) < frameRank(from)) {
        for (const e of milestoneRows(reg)) if (e.to === from && e.from !== e.to) dyn.cooldowns[e.id] = Math.max(dyn.cooldowns[e.id] ?? 0, draft.day + TUNING.dynamic.milestones.afterDownDays);
      }
    } else if (effect.type === 'sworn') {
      dyn.sworn = { day: draft.day };
      events.push({ type: 'sworn', unitId, day: draft.day });
    } else if (effect.type === 'claim') {
      if (!capabilitiesHeld(dyn, reg).has(effect.capability)) {
        const domain = [...reg.dynamicDomains.values()].find((d) => (d as unknown as DynamicDomainEntry).grants.includes(effect.capability));
        if (domain !== undefined) dyn.domains.push({ id: String(domain.id), since: draft.day });
      }
    }
  }
  dyn.milestones.push(m.id);
  const x = draft.dynamic!;
  x.open.milestones = x.open.milestones.filter((o) => o.unitId !== unitId || (milestoneEntry(reg, o.milestoneId)?.from ?? dyn.frame) === dyn.frame);
  return events;
}

/**
 * The commander's answer to her open milestone, from the card (`via: 'card'`) or from words (`via: 'text'`, the intent `milestone_accepted` /
 * `milestone_refused`): the two paths make the same events, `via` aside. `milestoneId` is the open one (`dm<n>`). Accepting applies the
 * milestone (no hold gain: it changes the frame, not hold). Refusing is not leaving: hold drops `refuseDrop` (one band; the frame's floor and
 * the pace apply, as in `addHold`), the milestone waits `refuseCooldownDays`, and the refusal is noted (`refusalCost`, which moves no hold
 * for a milestone). Throws when it is not open (a stale id), so a card or an action that names one changes nothing.
 */
export function answerMilestone(draft: CampaignState, ctx: Ctx, milestoneId: string, answer: 'accept' | 'refuse', via: 'card' | 'text'): EngineEvent[] {
  const reg = ctx.registries;
  const row = draft.dynamic?.open.milestones.find((m) => m.id === milestoneId);
  const unit = row === undefined ? undefined : draft.squad.find((u) => u.id === row.unitId);
  const m = row === undefined ? undefined : milestoneEntry(reg, row.milestoneId);
  const dyn = row === undefined ? undefined : dynamicOf(draft, row.unitId);
  if (!dynamicOn(draft, reg) || row === undefined || unit === undefined || m === undefined || dyn === undefined || !isLiving(unit)) throw new Error('That milestone is not open.');
  draft.dynamic!.open.milestones = draft.dynamic!.open.milestones.filter((o) => o.id !== row.id);
  const base = { unitId: row.unitId, id: row.id, milestoneId: m.id, via };
  if (answer === 'accept') return [{ type: 'milestone_accepted', ...base }, ...applyMilestone(draft, ctx, row.unitId, m.id)];
  dyn.cooldowns[m.id] = draft.day + TUNING.dynamic.milestones.refuseCooldownDays; // before the hold moves: the check that follows must not offer it again
  return [
    { type: 'milestone_refused', ...base },
    ...addHold(draft, ctx, row.unitId, -TUNING.dynamic.milestones.refuseDrop, 'milestone_refused'),
    ...refusalCost(draft, ctx, row.unitId, 'milestone'),
  ];
}

/**
 * Checks one unit's milestones (after her hold changed, and at day end): automatic ones that are due apply at once (a down-transition, in
 * registry order, until none is due); an open milestone whose frame she has left is dropped; and if none is open, the first due non-automatic
 * one opens. `rekindle` (a return offer accepted) is never due here: the answer to the return applies it. Nothing while the dynamic is off.
 */
export function milestonesDue(draft: CampaignState, ctx: Ctx, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!dynamicOn(draft, reg) || draft.dynamic === undefined || unit === undefined || unit.kind !== 'named' || !isLiving(unit)) return [];
  const events: EngineEvent[] = [];
  for (let again = true, guard = 0; again && guard < 4; guard++) {
    const dyn = dynamicOf(draft, unitId);
    const auto = dyn === undefined ? undefined : milestoneRows(reg).find((m) => m.offer === 'automatic' && m.requires.formerHolder !== true && eligible(draft, reg, unitId, dyn, m));
    again = auto !== undefined;
    if (auto !== undefined) events.push(...applyMilestone(draft, ctx, unitId, auto.id));
  }
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined) return events;
  const x = draft.dynamic;
  x.open.milestones = x.open.milestones.filter((o) => o.unitId !== unitId || (milestoneEntry(reg, o.milestoneId)?.from ?? dyn.frame) === dyn.frame);
  if (x.open.milestones.some((o) => o.unitId === unitId)) return events;
  const next = milestoneRows(reg).find((m) => m.offer !== 'automatic' && eligible(draft, reg, unitId, dyn, m));
  if (next !== undefined) events.push(...openMilestone(draft, ctx, unitId, next));
  return events;
}

/**
 * What refusing her costs (R11, R1): by the frame's `refusal` column, hold falls by `TUNING.dynamic.refusalCost[kind]`; from `moderate` up the
 * refusal is noted (`refusal_noted`, her day list, which her directive reads), and at `rule` it also counts into the contest: the
 * `contestAt`-th within `contestWindowDays` opens her submit claim (one claim open at a time). A refused milestone pays the band drop of its
 * own answer instead of the frame cost, so `what: 'milestone'` is noted but moves no hold here. Nothing for a unit with no dynamic.
 */
export function refusalCost(draft: CampaignState, ctx: Ctx, unitId: string, what: 'claim' | 'milestone' | 'demand'): EngineEvent[] {
  const reg = ctx.registries;
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined || !dynamicOn(draft, reg)) return [];
  const kind = frameEntry(reg, dyn.frame)?.refusal ?? 'minor';
  const events: EngineEvent[] = what === 'milestone' ? [] : addHold(draft, ctx, unitId, TUNING.dynamic.refusalCost[kind], 'refusal');
  if (kind === 'minor') return events;
  const days = TUNING.dynamic.contestWindowDays;
  dyn.refusals = [...dyn.refusals.filter((d) => draft.day - d <= days), draft.day];
  events.push({ type: 'refusal_noted', unitId, what });
  if (kind === 'contest') {
    dyn.contest = [...dyn.contest.filter((d) => draft.day - d <= days), draft.day];
    const x = draft.dynamic!;
    if (dyn.contest.length >= TUNING.dynamic.contestAt && !x.open.claims.some((c) => c.unitId === unitId)) {
      const claimId = `dc${x.seq++}`;
      x.open.claims.push({ id: claimId, unitId, submit: true, day: draft.day });
      events.push({ type: 'domain_claimed', unitId, claimId, submit: true });
    }
  }
  return events;
}
