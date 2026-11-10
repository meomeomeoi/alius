import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { offerMission, type MissionOffer } from '../../src/engine/world/missions';
import type { StartExpedition } from '../../src/engine/world/expedition';
import { ctxOf, errors, run } from './world';

/** A campaign with one offered mission and no unit that carries a map-reveal defect. */
export function withMission(reg: Registries, base: CampaignState, o: Partial<MissionOffer> = {}, mutate: (s: CampaignState) => void = () => {}) {
  const state = structuredClone(base);
  for (const u of state.squad) u.defects = u.defects.filter((d) => d.id !== 'echo_bleed');
  mutate(state);
  const offer: MissionOffer = { templateId: 'tpl_recover', regionId: 'quarantine_d7', source: 'command', ...o };
  const mission = offerMission(state, ctxOf(state, reg), offer).mission;
  if (!mission) throw new Error(`test setup: offer refused ${JSON.stringify(offer)}`);
  return { state, mission };
}

export function payload(state: CampaignState, missionId: string, over: Partial<StartExpedition> = {}): StartExpedition {
  const ids = over.unitIds ?? state.roster.activeIds.slice(0, 4);
  return {
    missionId, unitIds: ids, formation: { front: ids.slice(0, 2), back: ids.slice(2) }, supplies: 4, ...over,
  };
}

/** Starts an expedition through the action; throws when it is refused. */
export function depart(reg: Registries, state: CampaignState, missionId: string, over: Partial<StartExpedition> = {}): CampaignState {
  const r = run(state, reg, { type: 'expedition/start', payload: payload(state, missionId, over) });
  if (errors(r.events).length > 0) throw new Error(`test setup: start refused ${JSON.stringify(errors(r.events))}`);
  return r.state;
}
