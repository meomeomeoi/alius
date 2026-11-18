import type { Registries } from '../../../content/types';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { consumeSlots } from '../../calendar';
import { isLiving } from '../../economy';
import { fnv1a } from '../../hub';
import { addFact, revealCrime } from '../../memory';
import { postRumor, rumorPostedEvent } from '../../world/missions';
import { spineOf } from '../../world/spine';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { scheduleConsequences } from './consequences';
import {
  HANDLER_UNIT, HANDLER_VISIT_KIND, INTEL_ANSWERS, type DebtsState, type IntelAnswer, type IntelItem,
} from '../state';

const T = () => TUNING.special.debts;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * What the handler could buy now, from recent state, at most one item of each kind (so five at most), none already answered:
 *  - `mission_done`: the newest mission completed in the last 7 days;
 *  - `base`: a facility upgrade under way, else the facility with the highest level above 1;
 *  - `spine`: the newest spine beat that is done;
 *  - `plan`: an active mission, else an offered one;
 *  - `squad`: one named soldier's role and defect (picked from the squad by a hash of the day, no draw).
 * Ids are `kind:refId`, stable. Reads only; draws nothing.
 */
export function intelOf(state: CampaignState, reg: Registries): IntelItem[] {
  const d = state.special?.debts;
  const seen = new Set(d?.answered ?? []);
  const out: IntelItem[] = [];
  const add = (kind: IntelItem['kind'], refId: string, label: string): void => {
    const id = `${kind}:${refId}`;
    if (!seen.has(id)) out.push({ id, kind, refId, label });
  };
  const done = [...state.missions.completed].filter((m) => (m.outcomeDay ?? 0) >= state.day - 7 && !seen.has(`mission_done:${m.id}`))
    .sort((a, b) => (b.outcomeDay ?? 0) - (a.outcomeDay ?? 0))[0];
  if (done) add('mission_done', done.id, `The mission "${done.title}" was completed.`);
  const facilityName = (id: string): string => String(reg.facilities.get(id)?.name ?? id);
  const upgrade = state.base.upgrades?.find((u) => !seen.has(`base:${u.facilityId}`));
  const built = Object.entries(state.base.facilities).filter(([id, lv]) => lv > 1 && !seen.has(`base:${id}`)).sort((a, b) => b[1] - a[1])[0];
  if (upgrade) add('base', upgrade.facilityId, `The ${facilityName(upgrade.facilityId)} is being upgraded.`);
  else if (built) add('base', built[0], `The ${facilityName(built[0])} reached level ${built[1]}.`);
  const beats = spineOf(state, reg).slice(0, state.world.spineProgress).reverse().find((b) => !seen.has(`spine:${b.id}`));
  if (beats) add('spine', beats.id, `A story step was reached: ${String(beats.title ?? beats.id)}.`);
  const plan = state.missions.active.find((m) => !seen.has(`plan:${m.id}`)) ?? state.missions.offered.find((m) => !seen.has(`plan:${m.id}`));
  if (plan) add('plan', plan.id, `The squad plans "${plan.title}".`);
  const named = state.squad.filter((u) => u.kind === 'named' && isLiving(u) && !seen.has(`squad:${u.id}`));
  if (named.length > 0) {
    const u = named[fnv1a(`intel|${state.day}`) % named.length];
    const role = String(reg.roles.get(u.roleId)?.name ?? u.roleId);
    const defect = u.defects[0] ? String(reg.defects.get(u.defects[0].id)?.name ?? u.defects[0].id) : null;
    add('squad', u.id, `${u.displayName} is a ${role.toLowerCase()}${defect ? ` with ${defect}` : ''}.`);
  }
  return out.slice(0, 5);
}

/**
 * What a visit pays: per truth 3 supplies and 20 credits, per partial half (rounded down), per false the full price (the handler
 * does not know yet), and one plyx for every third truth. At pressure 60 or more every figure is halved (rounded down).
 */
export function paymentFor(answers: Record<string, IntelAnswer>, pressure: number): { credits: number; supplies: number; plyx: number } {
  const values = Object.values(answers);
  const truths = values.filter((a) => a === 'truth').length;
  const partials = values.filter((a) => a === 'partial').length;
  const falses = values.filter((a) => a === 'false').length;
  let credits = (truths + falses) * 20 + partials * 10;
  let supplies = (truths + falses) * 3 + partials * 1;
  let plyx = Math.floor(truths / 3);
  if (pressure >= 60) {
    credits = Math.floor(credits / 2);
    supplies = Math.floor(supplies / 2);
    plyx = Math.floor(plyx / 2);
  }
  return { credits, supplies, plyx };
}

/** The handler leaks: everyone learns the crime and the debts, a public fact is written, oversight is alerted, the visits stop. */
function leak(draft: CampaignState, ctx: EngineCtx, d: DebtsState): EngineEvent[] {
  const named = draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);
  const events: EngineEvent[] = [...revealCrime(draft, ctx.registries, named)];
  for (const id of named) {
    const flags = draft.relations[id]?.flags;
    if (flags && !flags.includes('knows_debts')) flags.push('knows_debts');
  }
  addFact(draft, { about: ['commander'], text: 'The commander sold intel to a rival corporation, and the rival has made it public.', tags: ['debts'], importance: 5, day: draft.day, knownBy: ['*'] });
  d.oversightSuspicion = clamp(d.oversightSuspicion + 25, 0, 100);
  d.ended = 'leaked';
  events.push({ type: 'handler_leak' });
  return events;
}

/** Takes the visit off the night: its queue entry and, if it is the open night event, the event itself (the Night slot is spent). */
function closeVisit(draft: CampaignState, ctx: EngineCtx, spendNight: boolean): EngineEvent[] {
  draft.calendar.nightEventsQueue = draft.calendar.nightEventsQueue.filter((e) => e.kind !== HANDLER_VISIT_KIND);
  if (draft.calendar.nightEvent?.kind === HANDLER_VISIT_KIND) {
    delete draft.calendar.nightEvent;
    if (spendNight && draft.slot === 'night') return consumeSlots(draft, 1, ctx);
  }
  return [];
}

/** Settles a visit with these answers (already validated): payment, pressure, the escalation, the rumor and the closing of the night. */
function settle(draft: CampaignState, ctx: EngineCtx, d: DebtsState, answers: Record<string, IntelAnswer>, spendNight: boolean): EngineEvent[] {
  const visit = d.visit!;
  const counts = { truth: 0, partial: 0, false: 0, withhold: 0 };
  for (const a of Object.values(answers)) counts[a] += 1;
  const events: EngineEvent[] = [];
  const pay = paymentFor(answers, Math.max(d.handlerPressure, d.handlerSuspicion));
  for (const k of ['credits', 'supplies', 'plyx'] as const) {
    if (pay[k] > 0) {
      draft.resources[k] += pay[k];
      events.push({ type: 'resource_changed', resource: k, amount: pay[k] });
    }
  }
  d.handlerPressure = clamp(d.handlerPressure + counts.withhold * 10 - counts.truth * 5, 0, 100);
  scheduleConsequences(draft, ctx, visit, answers);
  d.answered.push(...visit.items.map((i) => i.id));
  delete d.visit;
  events.push({ type: 'intel_answered', visitId: visit.id, counts });
  if (counts.truth >= 2) {
    const rumor = postRumor(draft, ctx, { text: 'Word is a rival corporation knows more about the squad than it should.', tags: ['handler'], leadsTo: 'none' });
    if (rumor) events.push(rumorPostedEvent(rumor));
  }
  const heat = Math.max(d.handlerPressure, d.handlerSuspicion);
  if (heat >= 85) events.push(...leak(draft, ctx, d));
  else if (heat >= 40) events.push({ type: 'handler_threat' });
  events.push(...closeVisit(draft, ctx, spendNight));
  return events;
}

/**
 * The commander's answer to the open visit, one for the whole visit: every item needs `truth`, `partial`, `false` or `withhold`, and
 * nothing else is accepted. Pays, moves the handler's pressure (withhold +10, truth −5) and escalates by the larger of pressure and
 * suspicion: a threat from 40, a leak from 85. Throws (nothing changes) for a stale visit or a bad answer. Draws nothing.
 */
export function answerVisit(draft: CampaignState, ctx: EngineCtx, visitId: unknown, raw: unknown): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d?.visit || d.visit.id !== visitId) throw new Error('That visit is over.');
  const ids = d.visit.items.map((i) => i.id);
  const given = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const ok = Object.keys(given).length === ids.length && ids.every((id) => (INTEL_ANSWERS as readonly unknown[]).includes(given[id]));
  if (!ok) throw new Error('Answer each item with truth, partial, false or withhold.');
  return settle(draft, ctx, d, given as Record<string, IntelAnswer>, true);
}

/**
 * A visit still open on a later day lapses as all-withhold (the commander stayed silent at the gate). The queue entry goes; the
 * night is already over, so no slot is spent. Nothing for a visit of today or without a visit.
 */
export function lapseVisit(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d?.visit || d.visit.day >= draft.day) return [];
  const answers = Object.fromEntries(d.visit.items.map((i) => [i.id, 'withhold' as const]));
  return settle(draft, ctx, d, answers, false);
}

export { HANDLER_UNIT };
