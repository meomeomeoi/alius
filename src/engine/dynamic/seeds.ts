/**
 * Seeds (P15, plan R3, R8): a unit the player picked to start with a head start in the dynamic. At the build a seed gets `seedHold`, and a
 * starting frame sets the frame directly with the floor of that frame (no milestone is played). A seed added mid-campaign gets the hold once
 * and never a frame. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { leadRank } from '../bonds/profile';
import type { EngineEvent } from '../dispatch';
import type { SetupResult, UnitSetup } from '../setup';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ensureDynamic } from './gate';
import { practiceCategories } from './profile';
import type { MayHold, StartFrame } from './types';

/**
 * Why a unit the player means to seed cannot hold, or `null`. The profile rules of `canHold` minus the cap, the dynamic being on and the
 * Impunity route: she has no Impunity on day 0, so a seed needs a lead style of at least `assertive` (spec §7: a seeded unit whose profile cannot hold is
 * warned about and not seeded). `enabled` is the content
 * switched on (default: every practice category).
 */
export function seedProblem(reg: Registries, unit: Pick<UnitSetup, 'bond'>, opts: { enabled?: readonly string[]; mayHold?: MayHold } = {}): string | null {
  const practice = unit.bond?.practice;
  if (practice === undefined) return 'she has no practice profile';
  if (opts.mayHold === 'no') return 'the setup says she may not hold';
  const on = opts.enabled ?? practiceCategories(reg);
  const limits = unit.bond?.ownLimits.categories ?? [];
  const lead = unit.bond?.leadStyle ?? 'balanced'; // P14b: raw profile (a seed is checked before any development exists)
  const leads = Object.entries(practice.categories).some(([id, c]) => on.includes(id) && !limits.includes(id)
    && (c.as === 'craves' || c.as === 'enjoys' || (c.as === 'tolerates' && leadRank(lead) === leadRank('dominant'))));
  if (!leads) return 'no enabled practice she would lead in';
  return leadRank(lead) < leadRank('assertive') ? 'her lead style is too weak to hold from the first day' : null;
}

/** A seed's hold, once: `seedHold`, or the floor of a starting frame if that is higher. Returns the events of what changed. */
export function seedHold(draft: CampaignState, reg: Registries, unitId: string, floor = 0): EngineEvent[] {
  const events = ensureDynamic(draft, reg, unitId);
  const dyn = draft.relations[unitId]?.dynamic;
  if (dyn === undefined) return events;
  const to = Math.max(dyn.hold, TUNING.dynamic.seedHold, floor);
  if (to !== dyn.hold) {
    events.push({ type: 'hold_changed', unitId, from: dyn.hold, to, cause: 'seed' });
    dyn.hold = to;
  }
  return events;
}

/**
 * Applies the seeds of the setup to the built campaign (after the head start): every seeded unit gets `seedHold`; a `startFrame` sets the
 * frame, lifts the hold to that frame's floor and records `seeded:<frame>`. The unit of `r.units[i]` is `draft.squad[i]`.
 */
export function applySeeds(draft: CampaignState, reg: Registries, r: SetupResult): EngineEvent[] {
  const events: EngineEvent[] = [];
  if (draft.dynamic === undefined || r.dynamic === undefined) return events;
  r.units.forEach((u, i) => {
    const setup = r.dynamic!.units[u.cardRef];
    const id = draft.squad[i]?.id;
    if (setup?.seeded !== true || id === undefined) return;
    const frame: StartFrame | undefined = setup.startFrame;
    const floor = frame === undefined ? 0 : Number(reg.dynamicFrames.get(frame)?.holdFloor ?? 0);
    events.push(...seedHold(draft, reg, id, floor));
    const dyn = draft.relations[id]?.dynamic;
    if (dyn !== undefined && frame !== undefined) {
      dyn.frame = frame;
      dyn.milestones.push(`seeded:${frame}`);
    }
  });
  return events;
}
