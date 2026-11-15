import type { CampaignState, Hierarchy } from '../../src/engine/state/types';

export * from './discipline';

/** Writes world options on a state (in place; the other options keep their stored or default choice) and returns it. */
export function withOptions(state: CampaignState, options: { squad_assertiveness?: 'low' | 'normal' | 'high'; voting?: 'on' | 'off' }): CampaignState {
  state.world.options = { ...(state.world.options ?? {}), ...options };
  return state;
}

/**
 * Makes one named unit the squad leader by writing the hierarchy directly (the weekly computation is Task 7's). A later
 * `computedDay` keeps the day step from recomputing it during the test.
 */
export function withLeader(state: CampaignState, unitId: string, opts: { endorsed?: boolean } = {}): CampaignState {
  if (!state.squad.some((u) => u.id === unitId && u.kind === 'named')) throw new Error(`no named unit ${unitId}`);
  const power = (state.power ??= { votes: { log: [], seq: 0 } });
  const h: Hierarchy = { standings: { [unitId]: 100 }, leaderId: unitId, endorsed: opts.endorsed === true, computedDay: state.day };
  power.hierarchy = h;
  return state;
}

// Importing this registers the P9b actions, gates and the day step under test (the other actions come with ./world).
import '../../src/engine/actions/power';
