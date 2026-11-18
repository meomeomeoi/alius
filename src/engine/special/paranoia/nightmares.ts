import type { EngineCtx, EngineEvent } from '../../dispatch';
import { hasTraitEffect } from '../../commander/traits';
import { isLiving } from '../../economy';
import { fnv1a } from '../../hub';
import { queueNightSpec } from '../../night';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { addCommanderStress, commanderStress } from '../commanderStress';
import { paranoiaOf } from './premonitions';

/** The kind of the night entry of a soldier who heard the commander through the wall. */
export const NIGHTMARE_KNOCK_KIND = 'nightmare_heard';

/** The text of the morning after a nightmare: a line of `TUNING.special.paranoia.nightmare.lines`, by a hash of the day (no draw). */
export function nightmareLine(day: number): string {
  const lines = TUNING.special.paranoia.nightmare.lines;
  return lines[fnv1a(`nightmare|${day}`) % lines.length].replace(/^AUTHOR TO WRITE:\s*/, ''); // the draft marker is for authors
}

/** The fondest named living unit (Affinity at the threshold or more; ties go to the earlier one in the squad). */
function fondestUnit(draft: CampaignState): string | null {
  const min = TUNING.special.paranoia.nightmare.affinityMin;
  let best: { id: string; affinity: number } | null = null;
  for (const u of draft.squad) {
    const a = draft.relations[u.id]?.affinity;
    if (u.kind !== 'named' || !isLiving(u) || a === undefined || a < min) continue;
    if (best === null || a > best.affinity) best = { id: u.id, affinity: a };
  }
  return best?.id ?? null;
}

/**
 * The Bloom dreams of the night after this day (a `dm_rumors` step, so its knock is queued before `night_check`): one draw at 0.12
 * (×1.5 while the commander's stress is 50 or more). A hit adds 15 stress, remembers the day, may cost tomorrow's morning (one draw
 * at 0.5, P7's exhaustion path) and may bring the fondest soldier to the door (one draw at 0.35, only when someone is fond enough).
 * Nothing is drawn without the trait.
 */
export function rollNightmare(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  if (!hasTraitEffect(draft, ctx.registries, 'paranoia')) return [];
  const T = TUNING.special.paranoia.nightmare;
  const chance = T.chance * (commanderStress(draft) >= T.stressAt ? T.stressMult : 1);
  if (!ctx.rng.chance(chance)) return [];
  const events: EngineEvent[] = addCommanderStress(draft, TUNING.special.commanderStress.nightmare, 'nightmare');
  paranoiaOf(draft).lastNightmareDay = draft.day;
  const lostMorning = ctx.rng.chance(T.loseMorning);
  if (lostMorning) draft.calendar.loseMorning = true;
  const visitorId = fondestUnit(draft);
  let visitor: string | undefined;
  if (visitorId !== null && ctx.rng.chance(T.visitor)) {
    const unit = draft.squad.find((u) => u.id === visitorId)!;
    const queued = queueNightSpec(draft, unit, {
      id: NIGHTMARE_KNOCK_KIND, kind: NIGHTMARE_KNOCK_KIND, chance: 1, priority: T.priority, trigger: 'daily', framing: T.framing,
      ignore: { event: 'dismissed', severity: 'minor' }, contentTags: [],
    } as never);
    if (queued.length > 0) visitor = visitorId;
    events.push(...queued);
  }
  events.push({ type: 'bloom_nightmare', day: draft.day, lostMorning, ...(visitor !== undefined ? { visitorId: visitor } : {}) });
  return events;
}
