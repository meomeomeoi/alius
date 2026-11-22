/**
 * The practice day step (P16, plan R7): what a day does to the practices, in a fixed order. It runs from the `dm_rumors` hook (registered by
 * `actions/practice.ts`, after the dynamic's own step). The sub-steps are numbered as in the plan; the ones whose task is not built yet are no-ops:
 *  1 deadlines, 2 routine, 3 requests fall back, 4 false reports, 5 favour kindnesses, 6 unfairness, 7 handovers, 8 new practices, 9 expiry.
 * For nobody live it returns `[]` and writes nothing (`state.practices` stays absent). Draws nothing: every chance is `practiceRoll`.
 */
import type { Registries } from '../../content/types';
import { wantBandOf } from '../bonds/want';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { practiceOf } from '../dynamic/profile';
import { assertiveness } from '../power/options';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { demonstrationGate, expireDemonstrations } from './demonstration';
import { denialPossible, permissionRuleOf } from './denial';
import { deadlineSweep, falseReportSweep } from './checks';
import { practiceHolders, practiceLive } from './gate';
import { closePunishments, coldShoulderWants, orderCandidate, orderPunishment } from './punish';
import { issuePractice, requestPractice, WRITERS } from './issue';
import { pickSeeds } from './seeds';
import { kindnessSweep, protocolPossible, routineSweep } from './service';
import { PRACTICE_KINDS, practiceRoll, type PracticeKind } from './state';
import { frameOf, taskRoom } from './tasks';

/** The highest appetite she has among the practice categories that stand (`craves` 1.4, `enjoys` 1, `tolerates` 0.6); 1 when none is read. */
function appetiteOf(state: CampaignState, reg: Registries, holderId: string): number {
  const view = practiceOf(state, reg, holderId);
  const T = TUNING.practice.frequency.appetite;
  const rows = Object.values(view?.categories ?? {}).flatMap((c) => (c.as === 'none' ? [] : [T[c.as]]));
  return rows.length === 0 ? 1 : Math.max(...rows);
}

/**
 * Her chance of asking for a practice today: `base[frame] × frequency[setting] × demandMult × want[band] × appetite` (R7), at most 1. The hit is
 * `practiceRoll(holderId, 'new') < chance`. 0 for a unit that is not live.
 */
export function newPracticeChance(state: CampaignState, reg: Registries, holderId: string): number {
  if (!practiceLive(state, reg, holderId)) return 0;
  const T = TUNING.practice.frequency;
  const setting = state.dynamic?.setup.frequency ?? 'normal';
  const p = T.base[frameOf(state, holderId)] * TUNING.dynamic.frequency[setting] * assertiveness(state, reg).demandMult * T.want[wantBandOf(state, reg, holderId)] * appetiteOf(state, reg, holderId);
  return Math.min(1, Math.max(0, p));
}

/**
 * The kinds she may ask for today, in the order of `PRACTICE_KINDS`: a kind that has a writer, with a seed that stands, and for a task the cap of her frame
 * (one open task at `role` or beyond unless she holds the household protocol).
 */
export function kindsToday(state: CampaignState, reg: Registries, holderId: string): PracticeKind[] {
  return PRACTICE_KINDS.filter((kind) => {
    if (WRITERS[kind] === undefined || kind === 'punishment') return false; // her discipline comes from an offence, never from the day's roll
    if (kind === 'task' && !taskRoom(state, reg, holderId)) return false;
    // a denial is a permission rule: only while she has none and one could be proposed (R13)
    if (kind === 'denial' && (permissionRuleOf(state, reg, holderId) !== undefined || !denialPossible(state, reg, holderId))) return false;
    // a protocol becomes a task when no rule can be proposed (R10): with no room for either, there is nothing to ask for
    if (kind === 'protocol' && !protocolPossible(state, reg, holderId) && !taskRoom(state, reg, holderId)) return false;
    // one demonstration at a time, and only when she may stage one and someone would watch (R9)
    if (kind === 'demonstration' && (demonstrationGate(state, reg, holderId) !== null || (state.practices?.demonstrations ?? []).some((d) => d.holderId === holderId && (d.status === 'offered' || d.status === 'open')))) return false;
    return pickSeeds(state, reg, holderId, kind).length > 0;
  });
}

/** 3. A request older than a day gets the fallback line (a closed app or a call that never came never blocks a practice). Only for a live holder. */
function requestsFallBack(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const r of [...(draft.practices?.requests ?? [])]) {
    if (r.day >= draft.day || !practiceLive(draft, ctx.registries, r.holderId)) continue;
    if (WRITERS[r.kind] === undefined) { draft.practices!.requests = draft.practices!.requests.filter((x) => x.id !== r.id); continue; }
    events.push(...issuePractice(draft, ctx, r.id, 'fallback'));
  }
  return events;
}

/**
 * 8a. A task kept yesterday may continue its chain (B1): a kept task that has a chain, or came from a seed (the first of a seed starts one of its own id), asks for the next step
 * the day after with the chance `chainChance` (`practiceRoll(holderId, 'chain:' + id)`), if there is room for another task. The request carries `chainOf`; its seeds start at the
 * last tier. At most one request a holder a day.
 */
function chainRequests(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const task of [...(draft.practices?.tasks ?? [])]) {
    if (task.kind !== 'task' || task.status !== 'kept' || task.settledDay !== draft.day - 1 || (task.chainId === undefined && task.seedId === undefined)) continue;
    if (!practiceLive(draft, ctx.registries, task.holderId) || draft.practices!.requests.some((r) => r.holderId === task.holderId) || !taskRoom(draft, ctx.registries, task.holderId)) continue;
    if (practiceRoll(draft, task.holderId, `chain:${task.id}`) >= TUNING.practice.chainChance) continue;
    task.chainId ??= task.id;
    task.step ??= 1;
    events.push(...requestPractice(draft, ctx, task.holderId, 'task', { chainOf: task.chainId }));
  }
  return events;
}

/** 8. Per live holder, at most one request a day: by her chance, then the kind by `kindWeights` over the kinds she may ask for (`practiceRoll(holderId, 'kind')`). */
function newPractices(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const holderId of practiceHolders(draft, ctx.registries)) {
    if ((draft.practices?.requests ?? []).some((r) => r.holderId === holderId)) continue;
    if (practiceRoll(draft, holderId, 'new') >= newPracticeChance(draft, ctx.registries, holderId)) continue;
    // with the countermand and a soldier who earned it she may order a punishment through the commander instead (TAKE IT INSTEAD, R8)
    const soldier = practiceRoll(draft, holderId, 'order') < TUNING.practice.punish.order.share ? orderCandidate(draft, ctx.registries, holderId) : null;
    if (soldier !== null) {
      const ordered = orderPunishment(draft, ctx, holderId, soldier);
      if (ordered.length > 0) { events.push(...ordered); continue; }
    }
    const kinds = kindsToday(draft, ctx.registries, holderId);
    if (kinds.length === 0) continue;
    const weights = kinds.map((k) => TUNING.practice.kindWeights[k as keyof typeof TUNING.practice.kindWeights] ?? 0);
    const total = weights.reduce((a, b) => a + b, 0);
    if (total <= 0) continue;
    let at = practiceRoll(draft, holderId, 'kind') * total;
    let index = weights.findIndex((w) => (at -= w) < 0);
    if (index < 0) index = kinds.length - 1;
    events.push(...requestPractice(draft, ctx, holderId, kinds[index]));
  }
  return events;
}

/** 9. Expiry: restrictions and cold shoulders past their last day go, and the closed practices are trimmed to the newest `keep` (open ones always stay). */
function expiry(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined) return [];
  const events = [...coldShoulderWants(draft), ...expireDemonstrations(draft, ctx)]; // her Want rises each day of her cold shoulder (it is read before the shoulder's last day expires)
  closePunishments(draft);
  if (p.call !== undefined && p.call.sceneId !== draft.scene?.id) delete p.call; // a call of a scene that never ended
  if (p.service !== undefined) { for (const [id, rec] of Object.entries(p.service)) if (rec.sceneId !== draft.scene?.id) delete p.service[id]; if (Object.keys(p.service).length === 0) delete p.service; } // what she saw of a scene that never ended
  p.restrictions = p.restrictions.filter((r) => r.untilDay >= draft.day);
  for (const [id, until] of Object.entries(p.cold)) if (until < draft.day) delete p.cold[id];
  const trim = <T extends { status: string }>(rows: T[], open: (r: T) => boolean): T[] => {
    let closed = rows.filter((r) => !open(r)).length;
    return rows.filter((r) => open(r) || closed-- <= TUNING.practice.keep);
  };
  const live = (s: string): boolean => s === 'offered' || s === 'open' || s === 'negotiating' || s === 'accepted';
  p.tasks = trim(p.tasks, (t) => live(t.status));
  p.punishments = trim(p.punishments, (x) => live(x.status));
  p.demonstrations = trim(p.demonstrations, (x) => x.status === 'offered' || x.status === 'open');
  return events;
}

/** The day-end step of the practices (registered on `dm_rumors`): nothing happens, and nothing is written, while nobody is live. */
export function practiceDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (practiceHolders(draft, ctx.registries).length === 0) return [];
  const events: EngineEvent[] = [];
  events.push(...deadlineSweep(draft, ctx)); // 1
  events.push(...routineSweep(draft, ctx)); // 2
  events.push(...requestsFallBack(draft, ctx)); // 3
  events.push(...falseReportSweep(draft, ctx)); // 4
  events.push(...kindnessSweep(draft, ctx)); // 5
  // 6 unfairness, 7 handovers: no-ops until their tasks
  events.push(...chainRequests(draft, ctx)); // 8a
  events.push(...newPractices(draft, ctx)); // 8
  events.push(...expiry(draft, ctx)); // 9
  return events;
}
