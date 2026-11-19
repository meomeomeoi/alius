import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../bonds/content';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState, DevFact } from '../state/types';
import { TUNING } from '../tuning';
import { developmentMode, developmentOf, ensureDevelopment, nextDevId } from './state';
import type { HabitEntry } from './types';

/**
 * Counters and habits (P14b §6). What a soldier does again and again is counted; past a registry threshold the habit is hers: a development
 * fact (`source: 'habit'`) and, for a few, a small effect on the activity it comes from. Counters run for named units and grunts; no
 * appraisal, no rng draw, nothing while development is off. Habits are read by `counter.kind`, never by id.
 */

/** The habits the content gate lets through: one tagged with a category that is switched off (or among her own limits, with `unitId`) never forms. Registry order. */
export function allowedHabits(state: ContentHolder, reg: Registries, unitId?: string): HabitEntry[] {
  return [...reg.habits.values()].filter((h) => contentAllowed(state, reg, h, unitId)) as unknown as HabitEntry[];
}

const D = TUNING.development;

const bump = (draft: CampaignState, unitId: string, key: string): boolean => {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !isLiving(unit)) return false;
  const dev = ensureDevelopment(unit);
  dev.counters[key] = (dev.counters[key] ?? 0) + 1;
  return true;
};

/** The key that carries a habit over its threshold: the named activity, any region, or the companion who reached it (the first, in key order). */
function reached(counters: Record<string, number>, h: HabitEntry): string | null {
  if (h.counter.kind === 'activity' && h.counter.id !== undefined) return (counters[`activity:${h.counter.id}`] ?? 0) >= h.threshold ? `activity:${h.counter.id}` : null;
  const prefix = `${h.counter.kind}:`;
  return Object.keys(counters).find((k) => k.startsWith(prefix) && (h.counter.id === undefined || k === `${prefix}${h.counter.id}`) && counters[k] >= h.threshold) ?? null;
}

/** Forms each habit whose counter reached its threshold and that she does not have yet: the id, a fact with the registry text, `habit_formed`. */
export function checkHabits(draft: CampaignState, reg: Registries, unitId: string): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  if (!unit || !isLiving(unit) || developmentMode(draft) === 'off') return [];
  const events: EngineEvent[] = [];
  for (const h of allowedHabits(draft, reg, unit.kind === 'named' ? unitId : undefined)) {
    const dev = ensureDevelopment(unit);
    if (dev.habits.includes(h.id)) continue;
    const key = reached(dev.counters, h);
    if (key === null) continue;
    const other = h.counter.kind === 'companion' ? (draft.squad.find((u) => u.id === key.slice('companion:'.length))?.displayName ?? 'someone') : '';
    const text = h.fallback.replace(/\{name\}/g, unit.displayName).replace(/\{other\}/g, other).replace(/\s+/g, ' ').trim().slice(0, D.factTextMax).trim();
    const fact: DevFact = { id: nextDevId(dev, 'df'), text, kind: 'habit', day: draft.day, source: 'habit' };
    dev.habits.push(h.id);
    dev.facts.push(fact);
    while (dev.facts.length > D.factsMax) {
      const i = dev.facts.findIndex((f) => f.edited !== true && f.id !== fact.id);
      if (i < 0) break;
      dev.facts.splice(i, 1);
    }
    events.push({ type: 'habit_formed', unitId, habitId: h.id, factId: fact.id });
  }
  return events;
}

/** `activity:<id>` +1 for the companion of an activity. */
export function countActivity(draft: CampaignState, reg: Registries, unitId: string, activityId: string): EngineEvent[] {
  if (developmentMode(draft) === 'off' || !bump(draft, unitId, `activity:${activityId}`)) return [];
  return checkHabits(draft, reg, unitId);
}

/** `companion:<other>` +1 for each pair of named, living ones in the list (a scene's participants, an expedition's party), both ways. */
export function countCompanions(draft: CampaignState, reg: Registries, ids: string[]): EngineEvent[] {
  if (developmentMode(draft) === 'off') return [];
  const named = [...new Set(ids)].filter((id) => draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));
  const events: EngineEvent[] = [];
  for (const a of named) {
    for (const b of named) if (a !== b) bump(draft, a, `companion:${b}`);
    events.push(...checkHabits(draft, reg, a));
  }
  return events;
}

/** An ended expedition: `region:<id>` +1 for each party member (grunts too), and the companion pairs of the party. */
export function countRun(draft: CampaignState, reg: Registries, ids: string[], regionId: string): EngineEvent[] {
  if (developmentMode(draft) === 'off') return [];
  const events: EngineEvent[] = [];
  for (const id of ids) if (bump(draft, id, `region:${regionId}`)) events.push(...checkHabits(draft, reg, id));
  events.push(...countCompanions(draft, reg, ids));
  return events;
}

/** What her formed habits do on this activity (as its companion): the registry effects, by `effect.activityId`. */
export function habitEffect(state: CampaignState, reg: Registries, unitId: string, activityId: string): Array<{ type: 'unit_stress' | 'unit_xp'; amount: number }> {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || developmentMode(state) === 'off') return [];
  const have = developmentOf(unit).habits;
  return [...reg.habits.values()]
    .filter((h) => have.includes(h.id) && (h.effect as HabitEntry['effect'])?.activityId === activityId)
    .map((h) => ({ type: (h.effect as NonNullable<HabitEntry['effect']>).type, amount: (h.effect as NonNullable<HabitEntry['effect']>).amount }));
}
