import type { Registries } from '../../../content/types';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { worldEffects } from '../../worldOptions';
import { socialRank } from '../../social';
import { applyWorldEffects } from '../../world/effects';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { coverMult } from '../../dynamic/cover';
import type { IntelAnswer, IntelItem, Scheduled } from '../state';

const T = () => TUNING.special.debts;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/**
 * What the commander's answers will bring back. A truthful item is scheduled with strength 1, a partial one 0.5, each due 2 to 5 days
 * out (one draw per item); a false item is scheduled only to find out whether it was caught; a withheld one brings nothing. The draws
 * happen only for items that were answered with something.
 */
export function scheduleConsequences(draft: CampaignState, ctx: EngineCtx, visit: { id: string; items: IntelItem[] }, answers: Record<string, IntelAnswer>): void {
  const d = draft.special?.debts;
  if (!d) return;
  for (const item of visit.items) {
    const a = answers[item.id];
    if (a === undefined || a === 'withhold') continue;
    const x: Scheduled = {
      id: `${visit.id}:${item.id}`, itemId: item.id, kind: item.kind, refId: item.refId, dueDay: draft.day + ctx.rng.int(T().dueMin, T().dueMax),
      strength: a === 'partial' ? 0.5 : 1, ...(a === 'false' ? { falsified: true as const } : {}),
    };
    d.scheduled.push(x);
  }
}

/** The region a mission is in, wherever the mission now sits. */
function regionOfMission(state: CampaignState, missionId: string): string | undefined {
  const all = [...state.missions.offered, ...state.missions.active, ...state.missions.completed];
  return all.find((m) => m.id === missionId)?.regionId;
}

/**
 * How many combats of a run to this region are ambushed: 2 for a full exposure, 1 for a half one (the stronger counts), 0 without
 * one that is still running. Reads state only.
 */
export function ambushFor(state: CampaignState, regionId: string): 0 | 1 | 2 {
  const live = (state.special?.debts?.exposures ?? []).filter((e) => e.regionId === regionId && e.untilDay >= state.day);
  if (live.length === 0) return 0;
  return live.some((e) => e.strength === 1) ? 2 : 1;
}

/**
 * How far one consequence moves oversight's suspicion: `10 × strength × (1 − 0.1 × (Cunning − 1)) × Π oversight_scrutiny`, rounded.
 * Cunning slows it, a brutal oversight speeds it.
 */
export function oversightGain(state: CampaignState, reg: Registries, strength: number): number {
  const scrutiny = worldEffects(state, reg, 'oversight_scrutiny').reduce((m, e) => m * e.mult, 1);
  return Math.round(T().oversightBase * strength * (1 - 0.1 * (socialRank(state, 'cunning') - 1)) * scrutiny * coverMult(state, reg)); // P15: a holder's cover
}

function sabotage(draft: CampaignState, x: Scheduled): void {
  const upgrade = draft.base.upgrades?.find((u) => u.facilityId === x.refId);
  if (upgrade) upgrade.daysLeft += x.strength === 1 ? 2 : 1;
  else draft.resources.supplies = Math.max(0, draft.resources.supplies - (x.strength === 1 ? 10 : 5));
}

/**
 * The day step's part: every due consequence lands and is dropped. A plan becomes an ambush exposure on its mission's region for 10
 * days; a base report delays the upgrade it names by 2 days (1 at half), or costs supplies when nothing is being built; a mission,
 * a story step or a soldier moves the rival's standing up 10 and the commander's own down 5 (× strength). Each landing emits
 * `debts_consequence { kind }` and adds to oversight's suspicion. A false item lands nothing: one draw at 0.5 decides whether the
 * handler found out (suspicion +15). Nothing without a debts block.
 */
export function runConsequences(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d) return [];
  const due = d.scheduled.filter((x) => x.dueDay <= draft.day);
  if (due.length === 0) return [];
  d.scheduled = d.scheduled.filter((x) => x.dueDay > draft.day);
  const events: EngineEvent[] = [];
  for (const x of due) {
    if (x.falsified) {
      if (ctx.rng.chance(T().foundOut)) d.handlerSuspicion = clamp(d.handlerSuspicion + T().foundOutGain, 0, 100);
      continue;
    }
    if (x.kind === 'plan') {
      const regionId = regionOfMission(draft, x.refId);
      if (regionId === undefined) continue;
      d.exposures.push({ regionId, untilDay: draft.day + T().exposureDays, strength: x.strength });
    } else if (x.kind === 'base') {
      sabotage(draft, x);
    } else {
      events.push(...applyWorldEffects(draft, ctx, [
        { type: 'faction', factionId: d.corporationId, amount: Math.round(T().rivalGain * x.strength) },
        { type: 'faction', factionId: 'own', amount: -Math.round(T().ownLoss * x.strength) },
      ], { kind: 'event', id: 'debts' }));
    }
    d.oversightSuspicion = clamp(d.oversightSuspicion + oversightGain(draft, ctx.registries, x.strength), 0, 100);
    events.push({ type: 'debts_consequence', kind: x.kind });
  }
  d.exposures = d.exposures.filter((e) => e.untilDay >= draft.day);
  return events;
}
