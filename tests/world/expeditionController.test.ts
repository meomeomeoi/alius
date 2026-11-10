import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CombatResult } from '../../src/engine/combat/types';
import type { CampaignState } from '../../src/engine/state/types';
import { createExpedition } from '../../src/world/expeditionController';
import { depart, payload, withMission } from '../helpers/expedition';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness, type WorldHarness } from '../helpers/worldApp';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const make = (h: WorldHarness) => createExpedition({ ...h.deps, startCombat: h.startCombat as never, startScene: h.startScene as never });
const acts = (h: WorldHarness, prefix = 'expedition/') => h.log.filter((a) => a.type.startsWith(prefix)).map((a) => a.type);
const ids = (s: CampaignState) => s.roster.activeIds.slice(0, 4);
const form = (s: CampaignState) => ({ unitIds: ids(s), formation: { front: ids(s).slice(0, 2), back: ids(s).slice(2) }, supplies: 3 });

/** An expedition standing at a combat node whose fight has not been played. */
function atCombat(over: { mutate?: (s: CampaignState) => void } = {}): CampaignState {
  const { state, mission } = withMission(reg, base, { templateId: 'tpl_sweep' });
  const s = structuredClone(depart(reg, state, mission.id));
  s.expedition!.map.nodes.n0_0.type = 'combat';
  over.mutate?.(s);
  return s;
}
const fought = (s: CampaignState, id = 'cmb_done'): CombatResult => ({
  id, day: s.day, outcome: 'won', rounds: 3, formation: s.expedition!.formation, participants: s.expedition!.party,
  enemies: [{ enemyId: 'husk', level: 1, affixes: [], name: 'Husk', downed: true }], log: [], xp: {}, levelUps: [],
  loot: [{ kind: 'credits', amount: 5 }], banked: false, injuries: [], deaths: [], breakdowns: [], stressDelta: {}, relationHints: [], commanderInjured: false,
});

describe('planning and launch', () => {
  it('plan, planning and cancelPlan keep the target', () => {
    const h = worldHarness(reg, base);
    const exp = make(h);
    expect(exp.planning()).toBeNull();
    exp.plan({ missionId: 'm1' });
    expect(exp.planning()).toEqual({ missionId: 'm1' });
    exp.plan({ poi: { regionId: 'ashway', poiId: 'scavenge' } });
    expect(exp.planning()).toEqual({ poi: { regionId: 'ashway', poiId: 'scavenge' } });
    exp.cancelPlan();
    expect(exp.planning()).toBeNull();
  });

  it('launch dispatches expedition/start and reports a refusal as a toast', () => {
    const { state, mission } = withMission(reg, base);
    const h = worldHarness(reg, state);
    const exp = make(h);
    expect(exp.launch(form(state))).toBe(false); // nothing planned
    expect(h.toasts.at(-1)).toMatchObject({ kind: 'error' });
    exp.plan({ missionId: mission.id });
    expect(exp.launch({ ...form(state), supplies: 99 })).toBe(false);
    expect(h.toasts.at(-1)!.text).toMatch(/supplies/i);
    expect(exp.planning()).toEqual({ missionId: mission.id }); // a refusal keeps the plan
    expect(h.state().expedition).toBeUndefined();
    expect(exp.launch(form(state))).toBe(true);
    expect(h.state().expedition!.missionId).toBe(mission.id);
    expect(h.log.at(-1)).toMatchObject({ type: 'expedition/start', payload: { missionId: mission.id, supplies: 3 } });
    expect(exp.planning()).toBeNull();
  });

  it('a point-of-interest plan launches as a poi run', () => {
    const s = structuredClone(base);
    for (const u of s.squad) u.defects = [];
    const h = worldHarness(reg, s);
    const exp = make(h);
    exp.plan({ poi: { regionId: 'quarantine_d7', poiId: 'scavenge' } });
    expect(exp.launch(form(s))).toBe(true);
    expect(h.state().missions.active[0]).toMatchObject({ poiId: 'scavenge' });
  });

  it('move, choose, treat and setFormation dispatch their actions', () => {
    const { state, mission } = withMission(reg, base);
    const started = structuredClone(depart(reg, state, mission.id));
    started.expedition!.map.nodes.n0_0.type = 'cache';
    const h = worldHarness(reg, started);
    const exp = make(h);
    exp.move('n0_0');
    exp.treat(started.expedition!.party[0], 'patch');
    const party = started.expedition!.party;
    exp.setFormation({ front: [party[0]], back: party.slice(1) });
    exp.choose(0); // nothing pending: refused with a toast
    expect(acts(h)).toEqual(['expedition/move', 'expedition/treat', 'expedition/set_formation', 'expedition/choose']);
    expect(h.state().expedition!.formation.front).toEqual([party[0]]);
    expect(h.toasts.at(-1)!.kind).toBe('error');
  });
});

describe('fights', () => {
  it('fight starts the pending encounter with expedition true and bankLoot false', () => {
    const h = worldHarness(reg, atCombat());
    const exp = make(h);
    exp.move('n0_0');
    const pending = h.state().expedition!.pending as { encounter: unknown };
    expect(exp.fight({})).toBe(true);
    expect(h.startCombat).toHaveBeenCalledTimes(1);
    const p = h.startCombat.mock.calls[0][0];
    expect(p).toMatchObject({ expedition: true, bankLoot: false, formation: h.state().expedition!.formation });
    expect(p.encounter).toEqual(pending.encounter);
    expect(p.coverId).toBeUndefined();
    expect(h.state().combat).toBeDefined();
    // a cover unit is passed along when one is chosen
    const h2 = worldHarness(reg, atCombat());
    const e2 = make(h2);
    e2.move('n0_0');
    e2.fight({ coverId: ids(base)[0] });
    expect(h2.startCombat.mock.calls[0][0].coverId).toBe(ids(base)[0]);
  });

  it('fight needs a pending fight', () => {
    const h = worldHarness(reg, atCombat());
    const exp = make(h);
    expect(exp.fight({})).toBe(false); // still travelling
    expect(h.startCombat).not.toHaveBeenCalled();
    expect(make(worldHarness(reg, base)).fight({})).toBe(false);
  });

  it('afterCombat resolves the node exactly once', () => {
    const h = worldHarness(reg, atCombat());
    const exp = make(h);
    exp.move('n0_0');
    exp.afterCombat(); // not fought yet: nothing
    expect(acts(h)).toEqual(['expedition/move']);
    h.setState((s) => { s.lastCombat = fought(s); });
    exp.afterCombat();
    exp.afterCombat();
    expect(acts(h)).toEqual(['expedition/move', 'expedition/resolve_combat']);
    expect(h.state().expedition!.phase).toBe('travel');
    expect(h.state().expedition!.loot).toHaveLength(1);
    // with a fight still open nothing is resolved either
    const h2 = worldHarness(reg, atCombat());
    const e2 = make(h2);
    e2.move('n0_0');
    e2.fight({});
    e2.afterCombat();
    expect(acts(h2)).toEqual(['expedition/move']);
  });

  it('afterCombat ignores the result of an earlier fight', () => {
    const s = atCombat();
    s.lastCombat = fought(s, 'cmb_old');
    const h = worldHarness(reg, s);
    const exp = make(h);
    exp.move('n0_0');
    exp.afterCombat();
    expect(acts(h)).toEqual(['expedition/move']);
  });

  it('auto is only passed when the fight can be auto-resolved', () => {
    const weak = worldHarness(reg, atCombat({ mutate: (s) => { for (const u of s.squad) u.level = 10; } }));
    const e1 = make(weak);
    e1.move('n0_0');
    weak.setState((s) => { (s.expedition!.pending as { encounter: { enemies: unknown[] } }).encounter.enemies = [{ enemyId: 'husk', level: 1, affixes: [] }]; });
    expect(e1.fight({ auto: true })).toBe(true);
    expect(acts(weak, 'combat/')).toContain('combat/auto');

    const strong = worldHarness(reg, atCombat());
    const e2 = make(strong);
    e2.move('n0_0');
    strong.setState((s) => {
      (s.expedition!.pending as { encounter: { enemies: unknown[] } }).encounter.enemies = Array.from({ length: 6 }, () => ({ enemyId: 'warlord', level: 40, affixes: [] }));
    });
    expect(e2.fight({ auto: true })).toBe(true);
    expect(acts(strong, 'combat/')).toEqual(['combat/start']);
    // without the flag auto is never requested
    const plain = worldHarness(reg, atCombat({ mutate: (s) => { for (const u of s.squad) u.level = 10; } }));
    const e3 = make(plain);
    e3.move('n0_0');
    e3.fight({});
    expect(acts(plain, 'combat/')).toEqual(['combat/start']);
  });
});

describe('ending', () => {
  const finished = (): CampaignState => {
    const { state, mission } = withMission(reg, base);
    let s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.objectiveDone = true;
    s = structuredClone(s);
    return s;
  };

  it('retreat and return dispatch the actions', () => {
    const h = worldHarness(reg, finished());
    const exp = make(h);
    exp.return();
    expect(acts(h)).toEqual(['expedition/return']);
    expect(h.state().lastExpedition!.outcome).toBe('success');
    const g = worldHarness(reg, finished());
    make(g).retreat();
    expect(acts(g)).toEqual(['expedition/retreat']);
    expect(g.state().lastExpedition!.outcome).toBe('retreated');
  });

  it('acknowledge marks the report', () => {
    const h = worldHarness(reg, finished());
    const exp = make(h);
    exp.return();
    exp.acknowledge();
    expect(h.state().lastExpedition!.acknowledged).toBe(true);
  });
});

describe('recap', () => {
  const done = (): CampaignState => {
    const { state, mission } = withMission(reg, base);
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.objectiveDone = true;
    const w = worldHarness(reg, s);
    make(w).return();
    return w.state();
  };

  it('requestRecap stores the text', async () => {
    const h = worldHarness(reg, done());
    h.st.mainReplies = ['The squad went in and came back.'];
    await make(h).requestRecap();
    expect(h.st.calls).toHaveLength(1);
    expect(h.state().lastExpedition!.recap).toBe('The squad went in and came back.');
    expect((h.st.calls[0] as { prompt: string }).prompt).toContain('AFTER-ACTION REPORT');
    // a report that already has a recap is not asked again
    h.st.mainReplies = ['Another one.'];
    await make(h).requestRecap();
    expect(h.st.calls).toHaveLength(1);
  });

  it('requestRecap does nothing when the setting is off, the call fails or the chat changed', async () => {
    const off = worldHarness(reg, done(), { expeditionRecap: false });
    off.st.mainReplies = ['text'];
    await make(off).requestRecap();
    expect(off.st.calls).toHaveLength(0);
    expect(off.state().lastExpedition!.recap).toBeUndefined();

    const failing = worldHarness(reg, done());
    failing.st.mainReplies = [];
    await make(failing).requestRecap();
    expect(failing.state().lastExpedition!.recap).toBeUndefined();
    expect(failing.toasts).toEqual([]);

    const switched = worldHarness(reg, done());
    switched.st.mainReplies = ['A late recap.'];
    const original = switched.st.generateMain.bind(switched.st);
    switched.st.generateMain = async (req) => { switched.switchChat('other'); return original(req); };
    await make(switched).requestRecap();
    expect(switched.state().lastExpedition!.recap).toBeUndefined();
    expect(switched.toasts).toEqual([]);

    // no report at all
    const none = worldHarness(reg, base);
    await make(none).requestRecap();
    expect(none.st.calls).toHaveLength(0);
  });

  it('a recap for an older report is dropped', async () => {
    const h = worldHarness(reg, done());
    h.st.mainReplies = ['Old news.'];
    const original = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.setState((s) => { s.lastExpedition!.id = 'rep_newer'; });
      return original(req);
    };
    await make(h).requestRecap();
    expect(h.state().lastExpedition!.recap).toBeUndefined();
  });
});

describe('debrief', () => {
  const done = (): CampaignState => {
    const { state, mission } = withMission(reg, base);
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.objectiveDone = true;
    const w = worldHarness(reg, s);
    make(w).return();
    return w.state();
  };

  it('debrief opens a free debrief scene in the garage and marks the report', async () => {
    const h = worldHarness(reg, done());
    const unit = ids(base)[0];
    expect(await make(h).debrief([unit])).toBe(true);
    expect(h.startScene).toHaveBeenCalledWith({ locationId: 'garage', participants: [unit], origin: 'debrief', consumesSlot: false });
    expect(h.state().lastExpedition!.debriefed).toBe(true);
  });

  it('debrief is refused at night, with an open scene, or when the scene could not start', async () => {
    const night = done();
    night.slot = 'night';
    const hn = worldHarness(reg, night);
    expect(await make(hn).debrief([ids(base)[0]])).toBe(false);
    expect(hn.startScene).not.toHaveBeenCalled();
    expect(hn.toasts.at(-1)!.text).toMatch(/night/i);

    const open = done();
    open.scene = { id: 's1' } as never;
    const ho = worldHarness(reg, open);
    expect(await make(ho).debrief([ids(base)[0]])).toBe(false);
    expect(ho.startScene).not.toHaveBeenCalled();
    expect(ho.toasts.at(-1)!.text).toMatch(/scene/i);

    const failed = worldHarness(reg, done());
    failed.startScene.mockResolvedValueOnce(false);
    expect(await make(failed).debrief([ids(base)[0]])).toBe(false);
    expect(failed.state().lastExpedition!.debriefed).toBe(false);

    const nobody = worldHarness(reg, done());
    expect(await make(nobody).debrief([])).toBe(false);
    expect(nobody.startScene).not.toHaveBeenCalled();
  });
});
