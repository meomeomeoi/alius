import type { Entry, Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { TUNING } from '../tuning';
import { familyEnabled } from '../worldOptions';
import type { CampaignState } from '../state/types';
import type { Clock, RegionState } from './types';

type World = CampaignState['world'];

/** Standing with a corporation or faction, −100…100 (0 when never touched). */
export function factionStanding(state: Pick<CampaignState, 'world'>, id: string): number {
  return state.world.factions[id] ?? 0;
}

export function clockById(state: Pick<CampaignState, 'world'>, id: string): Clock | undefined {
  return state.world.clocks.find((c) => c.id === id);
}

export function regionState(state: Pick<CampaignState, 'world'>, id: string): RegionState {
  return state.world.regions[id] ?? { known: false };
}

/** Regions the player can plan to visit: known in state, known from the start, or unlocked by a flag / clearance tier. */
export function knownRegions(state: Pick<CampaignState, 'world'>, reg: Registries): Entry[] {
  const out: Entry[] = [];
  for (const region of reg.regions.values()) {
    const unlock = region.unlockedBy as { flag?: string; clearanceMin?: number } | undefined;
    const unlocked = unlock !== undefined
      && (unlock.flag === undefined || state.world.flags.includes(unlock.flag))
      && (unlock.clearanceMin === undefined || (state.world.clearanceTier ?? 0) >= unlock.clearanceMin);
    if (regionState(state, String(region.id)).known || region.knownFromStart === true || unlocked) out.push(region);
  }
  return out;
}

/**
 * Creates the world the content declares: one clock per `clocks` entry at its start value, faction standing 0
 * (the commander's own corporation at `TUNING.world.ownFactionStart`), the start region and every
 * `knownFromStart` region known. Idempotent. Offers no missions: the first director tick does.
 */
export function seedWorld(draft: CampaignState, reg: Registries): EngineEvent[] {
  const world: World = draft.world;
  if (world.seeded === true) return [];
  for (const def of reg.clocks.values()) {
    if (world.clocks.some((c) => c.id === def.id) || !familyEnabled(draft, reg, def)) continue; // P8: a family clock only in a world that enables it
    const clock: Clock = {
      id: String(def.id), label: String(def.label), segments: def.segments as number, filled: def.startFilled as number,
      visibleToPlayer: def.visibleToPlayer === true,
    };
    if (typeof def.regionId === 'string') clock.regionId = def.regionId;
    world.clocks.push(clock);
  }
  const own = draft.commander.corporationId;
  for (const corp of reg.corporations.values()) {
    const id = String(corp.id);
    if (world.factions[id] === undefined) world.factions[id] = id === own ? TUNING.world.ownFactionStart : 0;
  }
  const startRegion = own === null ? undefined : (reg.corporations.get(own)?.startingRegionId as string | undefined);
  for (const region of reg.regions.values()) {
    const id = String(region.id);
    const known = region.knownFromStart === true || id === startRegion;
    world.regions[id] = { ...(world.regions[id] ?? {}), known: known || (world.regions[id]?.known ?? false) };
  }
  world.seeded = true;
  return [{ type: 'world_seeded' }];
}
