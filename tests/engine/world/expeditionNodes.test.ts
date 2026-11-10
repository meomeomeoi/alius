import { beforeAll, describe, expect, it } from 'vitest';
import type { CombatResult } from '../../../src/engine/combat/types';
import type { Registries } from '../../../src/content/types';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { eventOptions, resolveCombat } from '../../../src/engine/world/expedition';
import type { NodeMap } from '../../../src/engine/world/types';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const move = (s: CampaignState, nodeId: string, regs: Registries = reg) => run(s, regs, { type: 'expedition/move', payload: { nodeId } });
const resolve = (s: CampaignState) => run(s, reg, { type: 'expedition/resolve_combat', payload: {} });
const choose = (s: CampaignState, option: number, regs: Registries = reg) => run(s, regs, { type: 'expedition/choose', payload: { option } });
const only = (ids: string[]): Registries => {
  const r = { ...reg } as Registries;
  r.dilemmaTemplates = new Map(ids.map((id) => [id, reg.dilemmaTemplates.get(id)!]));
  return r;
};

/** An open expedition in quarantine_d7 whose first-layer node `n0_0` has the given type. */
function runWith(type: string, o: { mission?: Parameters<typeof withMission>[2]; mutate?: (s: CampaignState) => void; supplies?: number } = {}) {
  const { state, mission } = withMission(reg, base, o.mission);
  const s = structuredClone(depart(reg, state, mission.id, { supplies: o.supplies ?? 4 }));
  s.expedition!.map.nodes.n0_0.type = type;
  o.mutate?.(s);
  return s;
}

/** The map of a single node before the objective, so the objective can be reached in two moves. */
function shortMap(first: string): NodeMap {
  return {
    layers: [['n0_0', 'n0_1']], objectiveId: 'obj',
    nodes: {
      n0_0: { id: 'n0_0', layer: 0, type: first, edges: ['obj'], visited: false },
      n0_1: { id: 'n0_1', layer: 0, type: first, edges: ['obj'], visited: false },
      obj: { id: 'obj', layer: 1, type: 'objective', edges: [], visited: false },
    },
  };
}

/** What P4 leaves behind when a fight is decided. */
function lastCombat(s: CampaignState, over: Partial<CombatResult> = {}): CombatResult {
  const party = s.expedition!.party;
  return {
    id: 'cmb_fought', day: s.day, outcome: 'won', rounds: 4, formation: s.expedition!.formation, participants: party,
    enemies: [{ enemyId: 'husk', level: 1, affixes: [], name: 'Husk', downed: true }], log: [], xp: {}, levelUps: [],
    loot: [{ kind: 'credits', amount: 12 }, { kind: 'supplies', amount: 3 }], banked: false, injuries: [], deaths: [], breakdowns: [],
    stressDelta: {}, relationHints: [{ type: 'protected', actor: party[0], targets: ['commander'], severity: 'moderate' }],
    commanderInjured: false, ...over,
  };
}
const fought = (s: CampaignState, over: Partial<CombatResult> = {}): CampaignState => {
  const t = structuredClone(s);
  t.lastCombat = lastCombat(t, over);
  return t;
};

describe('combat nodes', () => {
  it('a combat node stores the encounter and waits', () => {
    const s = runWith('combat');
    const r = move(s, 'n0_0');
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.phase).toBe('combat');
    expect(exp.at).toBe('n0_0');
    expect(exp.pending).toMatchObject({ kind: 'combat', nodeId: 'n0_0' });
    const pending = exp.pending as Extract<NonNullable<typeof exp.pending>, { kind: 'combat' }>;
    expect(pending.encounter.enemies.length).toBeGreaterThanOrEqual(1);
    expect(pending.encounter.danger).toBe(1);
    expect(pending.encounter.lootTableId).toBe('loot_standard');
    expect(pending.encounter.exposesCommander).toBeFalsy();
    expect(pending.prevCombatId).toBeUndefined();
    expect(ofType(r.events, 'expedition_combat')).toEqual([{ type: 'expedition_combat', nodeId: 'n0_0', encounter: pending.encounter }]);
    // the enemies come from the region's table
    const cats = Object.keys((reg.regions.get('quarantine_d7')!.enemyTable as { categories: Record<string, number> }).categories);
    for (const e of pending.encounter.enemies) expect(cats).toContain(String(reg.enemies.get(e.enemyId)!.categoryId));
    // no other node can be entered meanwhile
    expect(errors(move(r.state, exp.map.nodes.n0_0.edges[0]).events)).toHaveLength(1);
  });

  it('the previous fight is remembered so a stale result is not counted', () => {
    const s = fought(runWith('combat'));
    const r = move(s, 'n0_0');
    expect((r.state.expedition!.pending as { prevCombatId?: string }).prevCombatId).toBe('cmb_fought');
  });

  it('elite raises the danger by one, capped at 5', () => {
    const s = runWith('elite');
    expect((move(s, 'n0_0').state.expedition!.pending as { encounter: { danger: number } }).encounter.danger).toBe(2);
    expect((move(s, 'n0_0').state.expedition!.pending as { encounter: { lootTableId: string } }).encounter.lootTableId).toBe('loot_elite');
    const hot = runWith('elite', { mutate: (x) => { x.missions.active[0].danger = 5; } });
    expect((move(hot, 'n0_0').state.expedition!.pending as { encounter: { danger: number } }).encounter.danger).toBe(5);
  });

  it('a crisis encounter exposes the commander', () => {
    const s = runWith('crisis', { mutate: (x) => { x.missions.active[0].danger = 3; } });
    const enc = (move(s, 'n0_0').state.expedition!.pending as { encounter: { exposesCommander?: boolean; danger: number } }).encounter;
    expect(enc.exposesCommander).toBe(true);
    expect(enc.danger).toBe(4);
  });

  it('a node whose encounter cannot be built resolves as nothing', () => {
    const regs = { ...reg, regions: new Map(reg.regions) } as Registries;
    regs.regions.set('quarantine_d7', { ...reg.regions.get('quarantine_d7')!, enemyTable: { categories: { ghost: 1 } } });
    const r = move(runWith('combat'), 'n0_0', regs);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.phase).toBe('travel');
    expect(r.state.expedition!.pending).toBeUndefined();
    expect(r.state.expedition!.log.at(-1)!.text).toContain('Nothing here.');
  });

  it('resolve before the fight is refused', () => {
    const s = move(runWith('combat'), 'n0_0').state;
    const r = resolve(s);
    expect(String(errors(r.events)[0].message)).toContain('The fight has not been fought yet.');
    expect(r.state).toBe(s);
    // a fight is still open
    const open = structuredClone(s);
    open.combat = { id: 'cmb_open' } as never;
    expect(errors(resolve(open).events)).toHaveLength(1);
    // no fight pending at all
    expect(errors(resolve(runWith('cache')).events)).toHaveLength(1);
    // the fight of an earlier node does not count
    const stale = fought(runWith('combat'));
    const moved = move(stale, 'n0_0').state;
    expect(String(errors(resolve(moved).events)[0].message)).toContain('not been fought');
  });

  it('a won fight moves its loot into the expedition and its hints into the queue', () => {
    const s = fought(move(runWith('combat'), 'n0_0').state);
    const r = resolve(s);
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.loot).toEqual([{ kind: 'credits', amount: 12 }, { kind: 'supplies', amount: 3 }]);
    expect(r.state.resources).toEqual(s.resources); // not banked until the return
    expect(exp.hints).toHaveLength(1);
    expect(exp.hints[0]).toMatchObject({ type: 'protected', actor: s.expedition!.party[0], targets: ['commander'], severity: 'moderate' });
    expect(exp.hints[0].evidence).toMatch(/node 1/);
    expect(exp.phase).toBe('travel');
    expect(exp.pending).toBeUndefined();
    expect(exp.log.at(-1)).toMatchObject({ kind: 'combat', data: { outcome: 'won', rounds: 4, enemies: ['Husk'], injuries: [], deaths: [], breakdowns: [] } });
    expect(ofType(r.events, 'expedition_combat').length).toBe(0);
  });

  it('a combat result is consumed once: a second resolve is refused', () => {
    const s = fought(move(runWith('combat'), 'n0_0').state);
    const once = resolve(s);
    const twice = resolve(once.state);
    expect(errors(twice.events)).toHaveLength(1);
    expect(twice.state).toBe(once.state);
    expect(once.state.expedition!.loot).toHaveLength(2);
    expect(once.state.expedition!.hints).toHaveLength(1);
  });

  it('expedition round-trips through JSON mid-node and resolves identically', () => {
    const mid = move(runWith('combat'), 'n0_0').state;
    const roundTrip = (x: CampaignState): CampaignState => JSON.parse(JSON.stringify(x));
    // after the move, before the fight
    expect(roundTrip(mid)).toEqual(mid);
    // with the finished fight written back
    const done = fought(mid);
    const a = resolve(done).state;
    const b = resolve(roundTrip(done)).state;
    expect(b).toEqual(a);
    // a reload between the two does not count the fight twice
    expect(errors(resolve(roundTrip(a)).events)).toHaveLength(1);
  });

  it('an objective node with win sets objectiveDone when the fight is won', () => {
    const s = runWith('combat', { mission: { templateId: 'tpl_sweep' } });
    s.expedition!.map = shortMap('combat');
    const mid = move(s, 'n0_0').state;
    const atObj = move(fought(resolve(fought(mid)).state, { id: 'cmb_two' }), 'obj').state;
    expect(atObj.expedition!.phase).toBe('combat');
    expect(atObj.expedition!.objectiveDone).toBe(false);
    const won = resolve(fought(atObj, { id: 'cmb_three' })).state;
    expect(won.expedition!.objectiveDone).toBe(true);
    expect(won.expedition!.phase).toBe('travel');
  });

  it('an injured unit leaves the formation', () => {
    const s = fought(move(runWith('combat'), 'n0_0').state, { injuries: [] });
    const [a, b, c, d] = s.expedition!.party;
    s.squad.find((u) => u.id === b)!.status = 'injured';
    const r = resolve(s);
    expect(r.state.expedition!.formation).toEqual({ front: [a], back: [c, d] });
    // the whole front line injured: the back row steps forward
    const t = fought(move(runWith('combat'), 'n0_0').state);
    for (const id of [a, b]) t.squad.find((u) => u.id === id)!.status = 'injured';
    const q = resolve(t);
    expect(q.state.expedition!.formation.front.length).toBeGreaterThan(0);
    expect([...q.state.expedition!.formation.front, ...q.state.expedition!.formation.back].sort()).toEqual([c, d].sort());
  });

  it('a lost fight ends the run as failed and a retreated fight as retreated (Task 11 stub)', () => {
    const base2 = move(runWith('combat'), 'n0_0').state;
    const lost = fought(base2, { outcome: 'lost', loot: [] });
    expect(String(errors(resolve(lost).events)[0].message)).toContain('failed');
    const retreated = fought(base2, { outcome: 'retreated', loot: [] });
    expect(String(errors(resolve(retreated).events)[0].message)).toContain('retreated');
    // directly, so the stub's message is the whole story
    const draft = structuredClone(lost);
    expect(() => resolveCombat(draft, ctxOf(draft, reg))).toThrow(/failed/);
  });

  it('a win with nobody standing forces a retreat', () => {
    const s = fought(move(runWith('combat'), 'n0_0').state);
    for (const id of s.expedition!.party) s.squad.find((u) => u.id === id)!.status = 'injured';
    const draft = structuredClone(s);
    expect(() => resolveCombat(draft, ctxOf(draft, reg))).toThrow(/retreated/);
    // a dead last grunt counts the same
    const t = fought(move(runWith('combat'), 'n0_0').state);
    for (const id of t.expedition!.party) t.squad.find((u) => u.id === id)!.status = 'dead';
    const d2 = structuredClone(t);
    expect(() => resolveCombat(d2, ctxOf(d2, reg))).toThrow(/retreated/);
  });
});

describe('event nodes', () => {
  const EVT = 'evt_wounded_scavenger';

  it('an event node offers the template\'s options and disables one that needs Empathy 3', () => {
    const regs = only([EVT]);
    const r = move(runWith('event'), 'n0_0', regs);
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.phase).toBe('event');
    expect(exp.pending).toEqual({ kind: 'event', nodeId: 'n0_0', templateId: EVT });
    expect(ofType(r.events, 'expedition_event')).toEqual([{ type: 'expedition_event', nodeId: 'n0_0', templateId: EVT }]);
    const options = eventOptions(r.state, regs);
    expect(options.map((o) => o.label)).toEqual(['Share your rations', 'Move on', 'Treat the wound properly']);
    expect(options.map((o) => o.disabled)).toEqual([null, null, 'Needs Empathy 3']);
    expect(options.map((o) => o.index)).toEqual([0, 1, 2]);
    const clever = structuredClone(r.state);
    clever.commander.socialStats.empathy = 3;
    expect(eventOptions(clever, regs)[2].disabled).toBeNull();
    // the gated option is refused while locked
    expect(errors(choose(r.state, 2, regs).events)).toHaveLength(1);
    expect(errors(choose(clever, 2, regs).events)).toEqual([]);
  });

  it('events are drawn from minor expedition events of the region and never from the pinned choices', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed++) {
      const s = runWith('event', { mutate: (x) => { x.rng = seedRng(seed); } });
      const r = move(s, 'n0_0');
      if (r.state.expedition!.pending?.kind === 'event') seen.add(r.state.expedition!.pending.templateId);
    }
    expect(seen.size).toBeGreaterThan(3);
    expect(seen.has('evt_vesper_choice')).toBe(false);
    expect(seen.has('evt_kestrel_choice')).toBe(false);
  });

  it('a region with no matching event resolves the node as nothing', () => {
    const regs = only([]);
    const r = move(runWith('event'), 'n0_0', regs);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition!.phase).toBe('travel');
    expect(r.state.expedition!.pending).toBeUndefined();
    expect(r.state.expedition!.log.at(-1)!.text).toContain('Nothing here.');
    // an event limited to another region is not eligible either
    const regs2 = { ...reg } as Registries;
    regs2.dilemmaTemplates = new Map([[EVT, { ...reg.dilemmaTemplates.get(EVT)!, regions: ['ashway'] }]]);
    expect(move(runWith('event'), 'n0_0', regs2).state.expedition!.pending).toBeUndefined();
    regs2.dilemmaTemplates = new Map([[EVT, { ...reg.dilemmaTemplates.get(EVT)!, regions: ['quarantine_d7'] }]]);
    expect(move(runWith('event'), 'n0_0', regs2).state.expedition!.pending).toBeDefined();
  });

  it('choosing applies the effects, queues unit_event intents and returns to travel', () => {
    const regs = only([EVT]);
    const s = move(runWith('event'), 'n0_0', regs).state;
    const r = choose(s, 0, regs);
    expect(errors(r.events)).toEqual([]);
    const exp = r.state.expedition!;
    expect(exp.supplies).toBe(2); // Share your rations: −2 carried
    expect(exp.hints).toHaveLength(1);
    expect(exp.hints[0]).toMatchObject({ type: 'sided_with', actor: 'commander', severity: 'minor', targets: exp.party, valueAxes: [{ axis: 'mercy', direction: 1 }] });
    expect(exp.hints[0].evidence).toBe('Wounded scavenger');
    expect(exp.phase).toBe('travel');
    expect(exp.pending).toBeUndefined();
    expect(exp.log.at(-1)).toMatchObject({ kind: 'event', data: { templateId: EVT, option: 'Share your rations' } });
    expect(ofType(r.events, 'expedition_choice')).toEqual([{ type: 'expedition_choice', nodeId: 'n0_0', templateId: EVT, option: 0, label: 'Share your rations' }]);
    // choosing again is refused (nothing is pending)
    expect(errors(choose(r.state, 0, regs).events)).toHaveLength(1);
    // unknown option index
    expect(errors(choose(s, 7, regs).events)).toHaveLength(1);
    expect(errors(choose(s, -1, regs).events)).toHaveLength(1);
  });

  it('an option the party cannot pay for is refused and nothing changes', () => {
    const regs = only([EVT]);
    const s = move(runWith('event', { supplies: 1 }), 'n0_0', regs).state;
    expect(eventOptions(s, regs)[0].disabled).toBe('Not enough supplies');
    const r = choose(s, 0, regs);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
    // resources of the stores: a credits cost
    const regs2 = only(['evt_checkpoint']);
    const poor = move(runWith('event', { mutate: (x) => { x.resources.credits = 10; } }), 'n0_0', regs2).state;
    expect(eventOptions(poor, regs2)[0].disabled).toBe('Not enough credits');
    expect(eventOptions(poor, regs2)[1].disabled).toBeNull();
    const rich = structuredClone(poor);
    rich.resources.credits = 30;
    expect(eventOptions(rich, regs2)[0].disabled).toBeNull();
    const paid = choose(rich, 0, regs2).state;
    expect(paid.resources.credits).toBe(0);
  });

  it('eventOptions is empty without a pending event', () => {
    expect(eventOptions(runWith('cache'), reg)).toEqual([]);
    expect(eventOptions(base, reg)).toEqual([]);
  });

  it('the pinned objective event of beat 4 sets exactly one of its three flags', () => {
    const { state, mission } = withMission(reg, base, { templateId: 'tpl_vesper_beat_4', source: 'story', spineBeat: 'beat_4' });
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.map = shortMap('cache');
    const mid = move(s, 'n0_0').state;
    const atObj = move(mid, 'obj').state;
    expect(atObj.expedition!.pending).toEqual({ kind: 'event', nodeId: 'obj', templateId: 'evt_vesper_choice' });
    expect(atObj.expedition!.objectiveDone).toBe(false);
    const options = eventOptions(atObj, reg);
    expect(options).toHaveLength(3);
    expect(options.every((o) => o.disabled === null)).toBe(true);
    const done = choose(atObj, 1, reg).state;
    const flags = ['evidence_delivered_vesper', 'evidence_sold_aurum', 'evidence_buried'].filter((f) => done.world.flags.includes(f));
    expect(flags).toEqual(['evidence_sold_aurum']);
    expect(done.expedition!.objectiveDone).toBe(true);
    expect(done.expedition!.phase).toBe('travel');
    expect(done.resources.credits).toBe(atObj.resources.credits + 100);
  });

  it('every pinned choice option is available whatever the party carries', () => {
    const { state, mission } = withMission(reg, base, { templateId: 'tpl_kestrel_beat_4', source: 'story', spineBeat: 'beat_4', regionId: 'kestrel_corridor' }, (x) => { x.resources.credits = 0; });
    const s = structuredClone(depart(reg, state, mission.id, { supplies: 0 }));
    s.expedition!.map = shortMap('cache');
    const atObj = move(move(s, 'n0_0').state, 'obj').state;
    expect(eventOptions(atObj, reg).map((o) => o.disabled)).toEqual([null, null, null]);
  });
});
