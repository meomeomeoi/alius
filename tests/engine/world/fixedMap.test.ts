import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { seedRng } from '../../../src/engine/rng';
import { buildFixedMap, nextNodes, nodePlayType } from '../../../src/engine/world/nodeMap';
import type { CampaignState } from '../../../src/engine/state/types';
import { buildMission } from '../../../src/engine/world/missions';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { payload } from '../../helpers/expedition';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

describe('buildFixedMap', () => {
  it('gives combat → event → obj with eventId on the event node', () => {
    const map = buildFixedMap([[{ type: 'combat' }], [{ type: 'event', eventId: 'evt_tutorial_choice' }]]);
    expect(map.layers).toEqual([['n0_0'], ['n1_0']]);
    expect(map.objectiveId).toBe('obj');
    expect(map.nodes.n0_0).toEqual({ id: 'n0_0', layer: 0, type: 'combat', edges: ['n1_0'], visited: false });
    expect(map.nodes.n1_0).toEqual({ id: 'n1_0', layer: 1, type: 'event', eventId: 'evt_tutorial_choice', edges: ['obj'], visited: false });
    expect(map.nodes.obj).toEqual({ id: 'obj', layer: 2, type: 'objective', edges: [], visited: false });
  });

  it('links every node to every node of the next layer', () => {
    const map = buildFixedMap([[{ type: 'combat' }, { type: 'cache' }], [{ type: 'rest' }, { type: 'combat' }, { type: 'event' }]]);
    expect(map.layers).toEqual([['n0_0', 'n0_1'], ['n1_0', 'n1_1', 'n1_2']]);
    expect(map.nodes.n0_0.edges).toEqual(['n1_0', 'n1_1', 'n1_2']);
    expect(map.nodes.n0_1.edges).toEqual(['n1_0', 'n1_1', 'n1_2']);
    for (const id of map.layers[1]) expect(map.nodes[id].edges).toEqual(['obj']);
    expect(nextNodes(map, null)).toEqual(['n0_0', 'n0_1']);
  });

  it('leaves eventId off nodes that name none', () => {
    const map = buildFixedMap([[{ type: 'combat' }]]);
    expect('eventId' in map.nodes.n0_0).toBe(false);
  });
});

describe('a run of the tutorial patrol', () => {
  /** A prologue campaign with the tutorial mission offered (the way entering the step does it) and nothing else on the board. */
  function offered(seed = 11): { state: CampaignState; missionId: string } {
    const s = campaign(reg, 4, { onboarding: 'prologue' });
    s.rng = seedRng(seed);
    const mission = buildMission(s, ctxOf(s, reg), { templateId: 'tutorial_patrol', regionId: 'quarantine_d7', source: 'command' });
    s.missions.offered.push(mission);
    return { state: s, missionId: mission.id };
  }
  const depart = (s: CampaignState, id: string) => run(s, reg, { type: 'expedition/start', payload: payload(s, id) });

  it('uses the fixed map (no rng draw for the map)', () => {
    const a = depart(offered(1).state, offered(1).missionId);
    const b = depart(offered(77).state, offered(77).missionId);
    expect(errors(a.events)).toEqual([]);
    expect(errors(b.events)).toEqual([]);
    const layers = (reg.missionTemplates.get('tutorial_patrol')!.fixedMap as { layers: Array<Array<{ type: string; eventId?: string }>> }).layers;
    expect(a.state.expedition!.map).toEqual(buildFixedMap(layers));
    expect(b.state.expedition!.map).toEqual(a.state.expedition!.map);
  });

  it('the event node opens evt_tutorial_choice', () => {
    const { state, missionId } = offered();
    const started = depart(state, missionId).state;
    expect(started.expedition!.map.layers).toHaveLength(2);
    // walk past the fight by marking it resolved, as a won combat leaves the run
    const s = structuredClone(started);
    s.expedition!.at = 'n0_0';
    s.expedition!.map.nodes.n0_0.visited = true;
    s.expedition!.path = ['n0_0'];
    const r = run(s, reg, { type: 'expedition/move', payload: { nodeId: 'n1_0' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.pending).toMatchObject({ kind: 'event', nodeId: 'n1_0', templateId: 'evt_tutorial_choice' });
    expect(ofType(r.events, 'expedition_event')).toEqual([{ type: 'expedition_event', nodeId: 'n1_0', templateId: 'evt_tutorial_choice' }]);
  });

  it('the objective plays as the template\'s objective node', () => {
    const { state, missionId } = offered();
    const s = depart(state, missionId).state;
    const mission = s.missions.active.find((m) => m.id === missionId)!;
    expect(nodePlayType(s.expedition!.map, 'obj', mission)).toBe('cache');
  });

  it('an ordinary mission still draws its map from the region', () => {
    const s = campaign(reg, 4);
    const mission = buildMission(s, ctxOf(s, reg), { templateId: 'tpl_recover', regionId: 'quarantine_d7', source: 'command' });
    s.missions.offered.push(mission);
    const r = depart(s, mission.id);
    expect(errors(r.events)).toEqual([]);
    expect(Object.values(r.state.expedition!.map.nodes).every((n) => n.eventId === undefined)).toBe(true);
  });
});
