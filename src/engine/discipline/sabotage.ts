import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory';
import { inAcquaintance } from './acquaintance';
import { impunityOf } from './impunity';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { disciplineOf } from './record';
import { commandStance, stanceEntry } from './stance';

/** Anonymous on purpose: nobody sees who did it. */
const FACT_TEXT = {
  supplies: 'The supply count came up short. Nobody saw anything.',
  credits: 'Credits are missing from the outpost account. The log shows nothing.',
  gear: 'Someone has been at the gear lockers.',
} as const;
type Kind = keyof typeof FACT_TEXT;

/** The log line of an expedition that left with a faulty pack. */
export const GEAR_FAULT_LOG = 'Gear fault: a sealed pack turned out to be empty.';

/** A hidden refusal queues one covert sabotage for the next day end. */
export function queueSabotage(draft: CampaignState, unitId: string): void {
  const d = disciplineOf(draft);
  d.sabotage ??= { queued: [] };
  d.sabotage.queued.push({ unitId, day: draft.day });
}

/** Does this unit's stance hide her refusals and make her sabotage (the stance entry's `covert` flag)? */
export function isCovert(state: CampaignState, reg: import('../../content/types').Registries, unitId: string): boolean {
  const stance = commandStance(state, reg, unitId);
  return stance !== null && stanceEntry(reg, stance)?.covert === true;
}

/**
 * The day-end part of covert sabotage: every queued sabotage fires, and otherwise each covert unit (`fearful`) rolls
 * `chancePerDay × (50 − Impunity) / 50`: the more afraid she is, the likelier. A unit still in the world's acquaintance
 * period never rolls, and after a sabotage the random roll rests for `cooldownDays` days (a hidden refusal is not held back).
 * At most one sabotage a day, whatever the number of units. The kind is a seeded pick among small resource
 * losses and a gear fault (stored for the next expedition; only one waits). Each writes one anonymous public fact and the
 * event `covert_sabotage { kind }`: nothing says who did it. Draws nothing while nobody is queued or covert.
 */
export function sabotageDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const T = TUNING.impunity.sabotage;
  const queued = draft.discipline?.sabotage?.queued ?? [];
  let fire = queued.length > 0;
  if (draft.discipline?.sabotage) draft.discipline.sabotage.queued = [];
  const last = draft.discipline?.sabotage?.lastDay;
  const resting = last !== undefined && draft.day - last < T.cooldownDays;
  if (!fire && !resting) {
    for (const u of draft.squad) {
      if (u.kind !== 'named' || !isLiving(u) || !isCovert(draft, ctx.registries, u.id) || inAcquaintance(draft, ctx.registries, u.id)) continue;
      const depth = (TUNING.impunity.stance.impunityHigh - (impunityOf(draft, ctx.registries, u.id)?.value ?? TUNING.impunity.stance.impunityHigh)) / TUNING.impunity.stance.impunityHigh;
      if (depth > 0 && ctx.rng.chance(T.chancePerDay * depth)) {
        fire = true;
        break; // one a day
      }
    }
  }
  if (!fire) return [];
  const waiting = draft.discipline?.sabotage?.gear !== undefined;
  const kinds: Kind[] = waiting ? ['supplies', 'credits'] : ['supplies', 'credits', 'gear'];
  const kind = ctx.rng.pick(kinds);
  if (kind === 'supplies') draft.resources.supplies = Math.max(0, draft.resources.supplies - T.supplies);
  else if (kind === 'credits') draft.resources.credits = Math.max(0, draft.resources.credits - T.credits);
  else {
    // who did it stays in the state (and out of every reading): the first unit that was queued, else the first covert one
    const by = queued[0]?.unitId ?? draft.squad.find((u) => u.kind === 'named' && isLiving(u) && isCovert(draft, ctx.registries, u.id))?.id ?? '';
    const d = disciplineOf(draft);
    d.sabotage ??= { queued: [] };
    d.sabotage.gear = { unitId: by, day: draft.day };
  }
  const d = disciplineOf(draft);
  d.sabotage ??= { queued: [] };
  d.sabotage.lastDay = draft.day;
  addFact(draft, { about: ['world'], text: FACT_TEXT[kind], tags: ['sabotage'], importance: 2, day: draft.day, knownBy: ['*'] });
  return [{ type: 'covert_sabotage', kind }];
}

/**
 * Called by `expedition/start` once the party is accepted and the run exists: a waiting gear fault bites half the time
 * (the run leaves with `gearSupplies` fewer carried supplies, floor 0) and is cleared either way. Returns a
 * `covert_sabotage { kind: 'gear', fired: true }` event only when it bit; the caller writes the log line.
 */
export function gearFault(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const sab = draft.discipline?.sabotage;
  if (!sab?.gear) return [];
  delete sab.gear;
  const exp = draft.expedition;
  if (!exp || !ctx.rng.chance(TUNING.impunity.sabotage.gearChance)) return [];
  exp.supplies = Math.max(0, exp.supplies - TUNING.impunity.sabotage.gearSupplies);
  return [{ type: 'covert_sabotage', kind: 'gear', fired: true }];
}
