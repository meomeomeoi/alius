/**
 * The practice day step (P16, plan R7): what a day does to the practices, in a fixed order. It runs from the `dm_rumors` hook (registered by
 * `actions/practice.ts`, after the dynamic's own step). The sub-steps are numbered as in the plan; the ones whose task is not built yet are no-ops:
 *  1 deadlines, 2 routine, 3 requests fall back, 4 false reports, 5 favour kindnesses, 6 unfairness, 7 handovers, 8 new practices, 9 expiry.
 * For nobody live it returns `[]` and writes nothing (`state.practices` stays absent). Draws nothing: every chance is `practiceRoll`.
 */
import type { Registries } from '../../content/types';
import { wantBandOf } from '../bonds/want';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { hasCapability } from '../dynamic/capabilities';
import { practiceOf } from '../dynamic/profile';
import { dynamicOf } from '../dynamic/state';
import { assertiveness } from '../power/options';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { frameRank } from '../blocking/state';
import { practiceHolders, practiceLive } from './gate';
import { issuePractice, requestPractice, WRITERS } from './issue';
import { pickSeeds } from './seeds';
import { PRACTICE_KINDS, practiceRoll, type PracticeKind } from './state';

type Frame3 = 'play' | 'role' | 'rule';
const frameOf = (state: CampaignState, holderId: string): Frame3 => {
  const f = dynamicOf(state, holderId)?.frame;
  return f === 'rule' || f === 'role' ? f : 'play';
};

/** Her open tasks (offered or open): the cap and the one-at-a-time rule count these. */
const openTasks = (state: CampaignState, holderId: string): number => (state.practices?.tasks ?? []).filter((t) => t.holderId === holderId && t.kind === 'task' && (t.status === 'offered' || t.status === 'open')).length;

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
  const frame = frameOf(state, holderId);
  const open = openTasks(state, holderId);
  return PRACTICE_KINDS.filter((kind) => {
    if (WRITERS[kind] === undefined) return false;
    if (kind === 'task') {
      if (open >= TUNING.practice.taskCap[frame]) return false;
      if (frameRank(frame) >= frameRank('role') && open >= 1 && !hasCapability(state, reg, holderId, 'household_protocol')) return false;
    }
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

/** 8. Per live holder, at most one request a day: by her chance, then the kind by `kindWeights` over the kinds she may ask for (`practiceRoll(holderId, 'kind')`). */
function newPractices(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const holderId of practiceHolders(draft, ctx.registries)) {
    if ((draft.practices?.requests ?? []).some((r) => r.holderId === holderId)) continue;
    if (practiceRoll(draft, holderId, 'new') >= newPracticeChance(draft, ctx.registries, holderId)) continue;
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
function expiry(draft: CampaignState): EngineEvent[] {
  const p = draft.practices;
  if (p === undefined) return [];
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
  return [];
}

/** The day-end step of the practices (registered on `dm_rumors`): nothing happens, and nothing is written, while nobody is live. */
export function practiceDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (practiceHolders(draft, ctx.registries).length === 0) return [];
  const events: EngineEvent[] = [];
  // 1 deadlines, 2 routine: no-ops until their tasks (7, 10)
  events.push(...requestsFallBack(draft, ctx)); // 3
  // 4 false reports, 5 favour kindnesses, 6 unfairness, 7 handovers: no-ops until their tasks
  events.push(...newPractices(draft, ctx)); // 8
  events.push(...expiry(draft)); // 9
  return events;
}
