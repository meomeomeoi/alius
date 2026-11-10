import { beforeAll, describe, expect, it } from 'vitest';
import type { CombatResult } from '../../../src/engine/combat/types';
import type { Registries } from '../../../src/content/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { reportLines, resolveCombat } from '../../../src/engine/world/expedition';
import type { NodeMap, QueuedIntent } from '../../../src/engine/world/types';
import { depart, withMission } from '../../helpers/expedition';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
});

const act = (s: CampaignState, type: string, payload: unknown = {}, regs: Registries = reg) => run(s, regs, { type, payload });
const ret = (s: CampaignState) => act(s, 'expedition/return');
const retreat = (s: CampaignState) => act(s, 'expedition/retreat');

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
const go = (s: CampaignState, nodeId: string) => {
  const r = act(s, 'expedition/move', { nodeId });
  expect(errors(r.events), nodeId).toEqual([]);
  return r.state;
};

interface Scenario { mission?: Parameters<typeof withMission>[2]; mutate?: (s: CampaignState) => void; slot?: CampaignState['slot']; supplies?: number; first?: string }
/** An expedition (cache → objective cache, `reach`) that has not reached the objective yet. */
function underway(o: Scenario = {}): CampaignState {
  const { state, mission } = withMission(reg, base, o.mission, (s) => { if (o.slot) s.slot = o.slot; o.mutate?.(s); });
  const s = structuredClone(depart(reg, state, mission.id, { supplies: o.supplies ?? 4 }));
  s.expedition!.map = shortMap(o.first ?? 'cache');
  return s;
}
/** …and one that has: ready to return. */
const atObjective = (o: Scenario = {}): CampaignState => go(go(underway(o), 'n0_0'), 'obj');

const sumLoot = (drops: Array<{ kind: string; amount?: number }>, kind: string): number =>
  drops.filter((d) => d.kind === kind).reduce((n, d) => n + (d.amount ?? 0), 0);

describe('return', () => {
  it('success banks cache and combat loot, returns unused supplies and pays the mission rewards once', () => {
    const s = atObjective({ supplies: 6 });
    s.expedition!.loot.push({ kind: 'credits', amount: 12 }, { kind: 'supplies', amount: 3 }); // what a won fight left
    const loot = s.expedition!.loot;
    expect(loot.length).toBeGreaterThan(2);
    const r = ret(s);
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    const done = after.missions.completed.at(-1)!;
    expect(done).toMatchObject({ status: 'completed', outcomeDay: s.day });
    expect(after.missions.completed).toHaveLength(1);
    expect(after.missions.active).toEqual([]);
    const rewards = done.rewards!;
    // loot of the run + rewards (+ tier drops, which only add)
    expect(after.resources.credits).toBeGreaterThanOrEqual(s.resources.credits + sumLoot(loot, 'credits') + rewards.credits);
    expect(after.resources.supplies).toBeGreaterThanOrEqual(s.resources.supplies + s.expedition!.supplies + sumLoot(loot, 'supplies'));
    expect(after.resources.plyx).toBeGreaterThanOrEqual(s.resources.plyx + sumLoot(loot, 'plyx') + rewards.plyx);
    expect(after.expedition).toBeUndefined();
    expect(after.lastExpedition).toMatchObject({ outcome: 'success', missionId: done.id, acknowledged: false, debriefed: false, regionId: 'quarantine_d7' });
    const ended = ofType(r.events, 'expedition_ended');
    expect(ended).toEqual([{ type: 'expedition_ended', outcome: 'success', reportId: after.lastExpedition!.id }]);
    expect(ofType(r.events, 'mission_completed')).toHaveLength(1);
    // no second payout
    expect(errors(ret(after).events)).toHaveLength(1);
  });

  it('return before the objective is refused', () => {
    const s = go(underway(), 'n0_0');
    const r = ret(s);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
    expect(errors(ret(underway()).events)).toHaveLength(1);
    expect(errors(ret(base).events)).toHaveLength(1);
  });

  it('return spends the region\'s 2 slots, or 3', () => {
    const near = ret(atObjective()).state;
    expect([near.day, near.slot]).toEqual([base.day, 'evening']);
    const afternoon = ret(atObjective({ slot: 'afternoon' })).state;
    expect([afternoon.day, afternoon.slot]).toEqual([base.day + 1, 'morning']);
    const far = ret(atObjective({ mission: { regionId: 'drowned_market' }, mutate: (x) => { x.world.clearanceTier = 1; } })).state;
    expect([far.day, far.slot]).toEqual([base.day + 1, 'morning']);
  });

  it('returning through the Evening runs the day end exactly once and the completed mission is not failed by the deadline step', () => {
    const s = atObjective({ slot: 'afternoon' });
    s.missions.active[0].deadlineDay = s.day; // tonight's deadline step would fail it if it were still on the board
    const r = ret(s);
    expect(ofType(r.events, 'day_end_step').filter((e) => e.step === 'upkeep')).toHaveLength(1);
    expect(ofType(r.events, 'day_started')).toHaveLength(1);
    expect(ofType(r.events, 'mission_failed')).toEqual([]);
    expect(r.state.missions.completed.at(-1)!.status).toBe('completed');
    expect(r.state.missions.offered).toEqual([]);
    expect(r.state.lastExpedition!.outcome).toBe('success');
  });

  it('records the visit, the chronicle line and the last region', () => {
    const s = atObjective();
    const r = ret(s);
    expect(r.state.world.regions.quarantine_d7.lastVisitedDay).toBe(s.day);
    expect(r.state.world.lastExpeditionRegionId).toBe('quarantine_d7');
    const line = r.state.memory.chronicle.at(-1)!;
    expect(line).toMatchObject({ kind: 'scene', day: s.day });
    expect(line.text).toContain('Expedition to District 7 Quarantine: objective secured.');
  });
});

describe('retreat', () => {
  it('retreat drops the unbanked loot, keeps XP and injuries, and puts the mission back on the board', () => {
    const s = go(underway(), 'n0_0');
    s.squad[0].xp = 17;
    s.squad[1].status = 'injured';
    s.squad[1].injuryDays = 3;
    expect(s.expedition!.loot.length).toBeGreaterThan(0);
    const r = retreat(s);
    expect(errors(r.events)).toEqual([]);
    const after = r.state;
    const mission = s.missions.active[0];
    expect(after.missions.active).toEqual([]);
    expect(after.missions.offered).toEqual([{ ...mission, status: 'offered' }]);
    expect(after.missions.completed).toEqual([]);
    expect(after.resources.credits).toBe(s.resources.credits);
    expect(after.resources.plyx).toBe(s.resources.plyx);
    expect(after.resources.supplies).toBe(s.resources.supplies + s.expedition!.supplies);
    expect(after.inventory).toEqual(s.inventory);
    expect(after.squad[0].xp).toBe(17);
    expect(after.squad[1]).toMatchObject({ status: 'injured', injuryDays: 3 });
    expect(after.lastExpedition).toMatchObject({ outcome: 'retreated', loot: s.expedition!.loot });
    expect(after.expedition).toBeUndefined();
    expect([after.day, after.slot]).toEqual([s.day, 'evening']); // the slots are spent all the same
    expect(ofType(r.events, 'expedition_ended')[0]).toMatchObject({ outcome: 'retreated' });
  });

  it('a retreated POI run leaves no mission behind', () => {
    const s = structuredClone(base);
    for (const u of s.squad) u.defects = [];
    const ids = s.roster.activeIds;
    const started = act(s, 'expedition/start', { poi: { regionId: 'quarantine_d7', poiId: 'scavenge' }, unitIds: ids, formation: { front: ids.slice(0, 2), back: ids.slice(2) }, supplies: 2 });
    expect(errors(started.events)).toEqual([]);
    const r = retreat(started.state);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.missions).toEqual({ offered: [], active: [], completed: [] });
  });

  it('retreat is allowed while travelling, at an event and at an unfought combat, but not during a fight', () => {
    const travel = underway();
    expect(errors(retreat(travel).events)).toEqual([]);
    const event = structuredClone(travel);
    event.expedition!.phase = 'event';
    expect(errors(retreat(event).events)).toEqual([]);
    const pending = structuredClone(travel);
    pending.expedition!.phase = 'combat';
    expect(errors(retreat(pending).events)).toEqual([]);
    const fighting = structuredClone(pending);
    fighting.combat = { id: 'cmb_open' } as never;
    const refused = act(fighting, 'expedition/retreat');
    expect(errors(refused.events)).toHaveLength(1);
    expect(refused.state).toBe(fighting);
    expect(errors(retreat(base).events)).toHaveLength(1);
  });
});

describe('what comes back', () => {
  it('breakdowns are released and a named unit gets a night entry', () => {
    const s = atObjective();
    const [a, b] = s.expedition!.party;
    s.squad.find((u) => u.id === a)!.breakdown = { defectId: 'echo_bleed', day: s.day };
    const grunt = s.squad.find((u) => u.id === b)!;
    grunt.kind = 'grunt';
    grunt.breakdown = { defectId: 'echo_bleed', day: s.day };
    const r = ret(s);
    expect(r.state.squad.find((u) => u.id === a)!.breakdown).toBeUndefined();
    expect(r.state.squad.find((u) => u.id === b)!.breakdown).toBeUndefined();
    expect(ofType(r.events, 'breakdown_released').map((e) => e.unitId).sort()).toEqual([a, b].sort());
    const name = s.squad.find((u) => u.id === a)!.displayName;
    const queue = r.state.calendar.nightEventsQueue;
    expect(queue).toHaveLength(1);
    expect(queue[0]).toMatchObject({
      unitId: a, kind: 'after_breakdown', priority: TUNING.expedition.breakdownNight.priority,
      framing: `${name} is at your door. She has not slept since the breakdown.`,
      ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: s.day + TUNING.expedition.breakdownNight.expiresInDays,
    });
  });

  const hint = (s: CampaignState, over: Partial<QueuedIntent>): QueuedIntent => ({
    type: 'protected', actor: s.expedition!.party[0], targets: ['commander'], severity: 'moderate', evidence: 'Took the hits.', ...over,
  });
  const trustOf = (s: CampaignState, id: string) => s.relations[id].trust;

  it('protected and endangered hints change trust through applyIntents and are deduplicated by highest severity', () => {
    const s = atObjective();
    const a = s.expedition!.party[0];
    const withHints = (hints: QueuedIntent[]) => { const t = structuredClone(s); t.expedition!.hints = hints; return ret(t).state; };
    const dupes = withHints([hint(s, { severity: 'minor' }), hint(s, { severity: 'major' }), hint(s, { severity: 'moderate' })]);
    const single = withHints([hint(s, { severity: 'major' })]);
    expect(trustOf(dupes, a)).toBe(trustOf(single, a));
    expect(trustOf(single, a)).toBeGreaterThan(trustOf(s, a));
    expect(dupes.relations[a]).toEqual(single.relations[a]);
    // endangered lowers it
    const worse = withHints([hint(s, { type: 'endangered', severity: 'major' })]);
    expect(trustOf(worse, a)).toBeLessThan(trustOf(s, a));
    // hints of different actors are different events
    const b = s.expedition!.party[1];
    const two = withHints([hint(s, {}), hint(s, { actor: b })]);
    expect(trustOf(two, b)).toBeGreaterThan(trustOf(s, b));
    expect(trustOf(two, a)).toBeGreaterThan(trustOf(s, a));
  });

  it('fourteen hints are applied in three batches', () => {
    const s = atObjective();
    const party = s.expedition!.party;
    const hints: QueuedIntent[] = [];
    for (const u of party) {
      hints.push(hint(s, { actor: u }), hint(s, { type: 'endangered', actor: u }), hint(s, { type: 'sided_with', actor: 'commander', targets: [u], severity: 'minor' }));
    }
    hints.push(hint(s, { type: 'praised', actor: 'commander', targets: [party[0]], severity: 'minor' }), hint(s, { type: 'praised', actor: 'commander', targets: [party[1]], severity: 'minor' }));
    expect(hints).toHaveLength(14);
    s.expedition!.hints = hints;
    const r = ret(s);
    expect(ofType(r.events, 'intents_applied')).toHaveLength(Math.ceil(14 / TUNING.relations.maxEventsPerExchange));
    expect(Math.ceil(14 / TUNING.relations.maxEventsPerExchange)).toBe(3);
    // every unit was touched by its events, none was cut off by the per-call cap
    for (const u of party) expect(r.state.relations[u].history.length).toBeGreaterThan(s.relations[u].history.length);
  });

  it('event unit_event intents with value axes move units with opposite values in opposite directions', () => {
    const s = atObjective();
    const [a, b] = s.expedition!.party;
    s.squad.find((u) => u.id === a)!.values.mercy = 3;
    s.squad.find((u) => u.id === b)!.values.mercy = -3;
    s.expedition!.hints = [hint(s, { type: 'decision_aligned', actor: 'commander', targets: [a, b], valueAxes: [{ axis: 'mercy', direction: 1 }], evidence: 'Shared the rations.' })];
    const r = ret(s);
    expect(trustOf(r.state, a)).toBeGreaterThan(trustOf(s, a));
    expect(trustOf(r.state, b)).toBeLessThan(trustOf(s, b));
  });

  it('a failing intent does not stop the return', () => {
    const s = atObjective();
    s.expedition!.hints = [hint(s, { actor: 'ghost' }), hint(s, { type: 'nonsense' as never })];
    const r = ret(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.lastExpedition!.outcome).toBe('success');
  });
});

describe('forced endings', () => {
  const lastCombat = (s: CampaignState, over: Partial<CombatResult> = {}): CombatResult => ({
    id: 'cmb_x', day: s.day, outcome: 'won', rounds: 3, formation: s.expedition!.formation, participants: s.expedition!.party,
    enemies: [{ enemyId: 'husk', level: 1, affixes: [], name: 'Husk', downed: true }], log: [], xp: {}, levelUps: [],
    loot: [{ kind: 'credits', amount: 5 }], banked: false, injuries: [], deaths: [], breakdowns: [], stressDelta: {}, relationHints: [],
    commanderInjured: false, ...over,
  });
  const fightNode = (): CampaignState => {
    const s = underway({ first: 'combat' });
    return go(s, 'n0_0');
  };

  it('a forced retreat with an empty party runs the same ending', () => {
    const s = fightNode();
    s.lastCombat = lastCombat(s);
    for (const id of s.expedition!.party) s.squad.find((u) => u.id === id)!.status = 'injured';
    const r = act(s, 'expedition/resolve_combat');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.expedition).toBeUndefined();
    expect(r.state.lastExpedition).toMatchObject({ outcome: 'retreated' });
    expect(r.state.missions.offered).toHaveLength(1);
    expect(r.state.missions.active).toEqual([]);
    expect(r.state.resources.credits).toBe(s.resources.credits); // the won loot is dropped with the retreat
    expect(ofType(r.events, 'expedition_ended')).toHaveLength(1);
  });

  it('a lost fight ends the run as failed and a retreated fight as retreated', () => {
    const s = fightNode();
    const lost = structuredClone(s);
    lost.lastCombat = lastCombat(lost, { outcome: 'lost', loot: [] });
    const a = act(lost, 'expedition/resolve_combat');
    expect(errors(a.events)).toEqual([]);
    expect(a.state.lastExpedition!.outcome).toBe('failed');
    expect(a.state.expedition).toBeUndefined();
    expect(a.state.missions.offered).toHaveLength(1); // retried until its deadline
    const fled = structuredClone(s);
    fled.lastCombat = lastCombat(fled, { outcome: 'retreated', loot: [] });
    const b = act(fled, 'expedition/resolve_combat');
    expect(b.state.lastExpedition!.outcome).toBe('retreated');
    // called directly the same ending happens inside the draft
    const draft = structuredClone(lost);
    resolveCombat(draft, ctxOf(draft, reg));
    expect(draft.lastExpedition!.outcome).toBe('failed');
  });

  it('after the end other actions run again', () => {
    const r = ret(atObjective());
    expect(r.state.expedition).toBeUndefined();
    const s = structuredClone(r.state);
    s.resources.credits = 100;
    const req = act(s, 'base/requisition', { supplies: 1 });
    expect(errors(req.events)).toEqual([]);
    expect(req.state.resources.supplies).toBe(s.resources.supplies + 1);
  });
});

describe('the report', () => {
  it('the report lists the path, fights, loot, injuries and deaths', () => {
    let s = underway({ first: 'combat' });
    s = go(s, 'n0_0');
    const [a, b, c] = s.expedition!.party;
    const name = (id: string) => s.squad.find((u) => u.id === id)!.displayName;
    s.squad.find((u) => u.id === b)!.status = 'injured';
    s.squad.find((u) => u.id === c)!.status = 'dead';
    s.lastCombat = {
      id: 'cmb_r', day: s.day, outcome: 'won', rounds: 5, formation: s.expedition!.formation, participants: s.expedition!.party,
      enemies: [{ enemyId: 'husk', level: 1, affixes: [], name: 'Husk', downed: true }, { enemyId: 'husk', level: 1, affixes: [], name: 'Armored Husk', downed: true }],
      log: [], xp: {}, levelUps: [], loot: [{ kind: 'credits', amount: 21 }], banked: false, injuries: [b], deaths: [c], breakdowns: [a],
      stressDelta: {}, relationHints: [], commanderInjured: false,
    };
    s = act(s, 'expedition/resolve_combat').state;
    s = go(s, 'obj');
    const r = ret(s);
    expect(errors(r.events)).toEqual([]);
    const report = r.state.lastExpedition!;
    expect(report).toMatchObject({ outcome: 'success', party: s.expedition!.party, injuries: [b], deaths: [c], breakdowns: [a] });
    expect(report.nodes).toEqual(['combat', 'cache']);
    const text = reportLines(report, r.state, reg).join('\n');
    expect(text).toContain('AFTER-ACTION REPORT');
    expect(text).toContain(report.missionTitle);
    expect(text).toContain('District 7 Quarantine');
    expect(text).toMatch(/OBJECTIVE SECURED/i);
    expect(text).toContain('Husk');
    expect(text).toContain('Armored Husk');
    expect(text).toContain('21 credits');
    expect(text).toMatch(new RegExp(`Injured.*${name(b)}`));
    expect(text).toMatch(new RegExp(`(Fallen|Dead).*${name(c)}`));
    expect(text).toMatch(new RegExp(`Breakdown.*${name(a)}`));
    expect(text).toMatch(/Rewards.*credits/i);
    // one line per log entry
    for (const entry of report.log) expect(text).toContain(entry.text);
  });

  it('a retreat report says the loot was lost', () => {
    const s = go(underway(), 'n0_0');
    const r = retreat(s);
    const text = reportLines(r.state.lastExpedition!, r.state, reg).join('\n');
    expect(text).toMatch(/RETREAT/i);
    expect(text).toMatch(/lost/i);
    expect(text).not.toMatch(/Rewards/);
  });

  it('ack_report and mark_debriefed set their flags and need a report', () => {
    expect(errors(act(base, 'expedition/ack_report').events)).toHaveLength(1);
    expect(errors(act(base, 'expedition/mark_debriefed').events)).toHaveLength(1);
    const done = ret(atObjective()).state;
    const acked = act(done, 'expedition/ack_report').state;
    expect(acked.lastExpedition).toMatchObject({ acknowledged: true, debriefed: false });
    expect(act(acked, 'expedition/mark_debriefed').state.lastExpedition).toMatchObject({ acknowledged: true, debriefed: true });
  });
});

describe('recap text', () => {
  const done = () => ret(atObjective()).state;
  const setRecap = (s: CampaignState, text: unknown, reportId: string = s.lastExpedition!.id) => act(s, 'expedition/set_recap', { reportId, text });

  it('set_recap with a stale report id is refused', () => {
    const s = done();
    const r = setRecap(s, 'A recap.', 'rep_other');
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(s);
    expect(errors(act(base, 'expedition/set_recap', { reportId: 'x', text: 'y' }).events)).toHaveLength(1);
  });

  it('set_recap stores plain text', () => {
    const s = done();
    const r = setRecap(s, 'The squad came back.');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.lastExpedition!.recap).toBe('The squad came back.');
    expect(ofType(r.events, 'expedition_recap_set')).toEqual([{ type: 'expedition_recap_set', reportId: s.lastExpedition!.id }]);
  });

  it('set_recap strips markup and cuts at 1200 characters', () => {
    const s = done();
    const marked = setRecap(s, '<b>Bold</b> <img src=x onerror=alert(1)> and <script>steal()</script> end').state.lastExpedition!.recap!;
    expect(marked).not.toMatch(/[<>]/);
    expect(marked).toContain('Bold');
    expect(marked).toContain('end');
    expect(marked).not.toContain('onerror');
    const long = setRecap(s, 'a'.repeat(3000)).state.lastExpedition!.recap!;
    expect(long).toHaveLength(TUNING.expedition.recapMax);
    expect(TUNING.expedition.recapMax).toBe(1200);
    // empty, whitespace-only, markup-only and non-string text are refused
    for (const bad of ['', '   ', '<br><hr>', 42, null, undefined]) expect(errors(setRecap(s, bad).events), String(bad)).toHaveLength(1);
  });
});
