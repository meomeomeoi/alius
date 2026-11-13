import { seedRng } from '../rng';
import type { CampaignState } from './types';
import { applyCommanderSetup, defaultCommanderSetup } from '../commander/profile';

export function createCampaign(opts: { seed: number; commanderName: string }): CampaignState {
  const state: CampaignState = {
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
  // P7: a new campaign is complete; `commander/seed` is for older saves only.
  applyCommanderSetup(state.commander, defaultCommanderSetup());
  state.commander.fileReviewed = true;
  return state;
}
