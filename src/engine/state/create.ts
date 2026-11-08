import { seedRng } from '../rng';
import type { CampaignState } from './types';

export function createCampaign(opts: { seed: number; commanderName: string }): CampaignState {
  return {
    version: 1,
    rng: seedRng(opts.seed),
    day: 1,
    slot: 'morning',
    difficulty: 'normal',
    settings: {},
    commander: {
      name: opts.commanderName,
      corporationId: null,
      crimeId: null,
      socialStats: { authority: 0, insight: 0, empathy: 0, cunning: 0 },
      flags: [],
    },
    squad: [],
    roster: { activeIds: [], capacity: 6 },
    relations: {},
    resources: { credits: 0, supplies: 0, plyx: 0 },
    base: { facilities: {} },
    inventory: [],
    world: { regions: {}, clocks: [], threads: [], factions: {}, flags: [], spineProgress: 0 },
    missions: { offered: [], active: [], completed: [] },
    rumors: [],
    dms: {},
    memory: { facts: [], chronicle: [] },
    calendar: { scheduled: [], nightEventsQueue: [] },
    leash: { authorizationsLeft: 0, refreshDay: 1, log: [] },
  };
}
