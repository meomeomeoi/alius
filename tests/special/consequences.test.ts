import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { Rng, seedRng } from '../../src/engine/rng';
import { ambushFor, oversightGain, runConsequences } from '../../src/engine/special/debts/consequences';
import type { IntelAnswer, IntelItem } from '../../src/engine/special/state';
import type { CampaignState } from '../../src/engine/state/types';
import { depart, withMission } from '../helpers/expedition';
import { endDay } from '../helpers/loyalty';
import { loadCore, run } from '../helpers/world';
import { ANN, specialCampaign } from '../helpers/special';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ctxOf = (s: CampaignState) => ({ registries: reg, rng: new Rng(s.rng) });
const debts = (s: CampaignState) => s.special!.debts!;
const item = (kind: IntelItem['kind'], refId: string): IntelItem => ({ id: `${kind}:${refId}`, kind, refId, label: `${kind} ${refId}` });

/** A campaign at night with a visit offering these items; `answer` sells them. */
function sell(s: CampaignState, items: IntelItem[], answers: IntelAnswer): CampaignState {
  debts(s).visit = { id: 'hv1', day: s.day, items };
  debts(s).visitSeq = 1;
  const r = run(s, reg, { type: 'debts/answer_visit', payload: { visitId: 'hv1', answers: Object.fromEntries(items.map((i) => [i.id, answers])) } });
  if (r.events.some((e) => e.type === 'error')) throw new Error(JSON.stringify(r.events));
  return r.state;
}
/** Lets every scheduled consequence fall due now and runs them. */
function land(s: CampaignState): { state: CampaignState; events: ReturnType<typeof runConsequences> } {
  const t = structuredClone(s);
  for (const x of debts(t).scheduled) x.dueDay = t.day;
  return { state: t, events: runConsequences(t, ctxOf(t)) };
}
const base = (): CampaignState => specialCampaign(reg, 'web_of_debts');

describe('scheduling', () => {
  it('truthful and partial items schedule a consequence 2–5 days out; false ones a check; withheld ones nothing', () => {
    const items = [item('plan', 'm1'), item('base', 'medbay'), item('squad', ANN), item('spine', 'b1'), item('mission_done', 'm2')];
    const s = sell(base(), items, 'truth');
    const d = debts(s);
    expect(d.scheduled.map((x) => x.itemId).sort()).toEqual(items.map((i) => i.id).sort());
    for (const x of d.scheduled) { expect(x.dueDay).toBeGreaterThanOrEqual(s.day + 2); expect(x.dueDay).toBeLessThanOrEqual(s.day + 5); expect(x.strength).toBe(1); expect(x.falsified).toBeUndefined(); }
    const half = sell(base(), [item('plan', 'm1')], 'partial');
    expect(debts(half).scheduled[0].strength).toBe(0.5);
    const lie = sell(base(), [item('plan', 'm1')], 'false');
    expect(debts(lie).scheduled).toMatchObject([{ itemId: 'plan:m1', falsified: true }]);
    const none = sell(base(), items, 'withhold');
    expect(debts(none).scheduled).toEqual([]);
  });
});

describe('the consequences', () => {
  it('a plan truth becomes an ambush exposure on its mission\'s region for 10 days; partial is weaker; false lands nothing', () => {
    const s = base();
    s.missions.offered.push({ id: 'm1', regionId: 'ashway', status: 'offered', title: 'Hold the road' } as never);
    const full = land(sell(structuredClone(s), [item('plan', 'm1')], 'truth')).state;
    expect(debts(full).exposures).toEqual([{ regionId: 'ashway', untilDay: full.day + 10, strength: 1 }]);
    expect(ambushFor(full, 'ashway')).toBe(2);
    expect(ambushFor(full, 'quarantine_d7')).toBe(0);
    const half = land(sell(structuredClone(s), [item('plan', 'm1')], 'partial')).state;
    expect(ambushFor(half, 'ashway')).toBe(1);
    const lie = land(sell(structuredClone(s), [item('plan', 'm1')], 'false')).state;
    expect(debts(lie).exposures).toEqual([]);
    full.day += 11;
    expect(ambushFor(full, 'ashway')).toBe(0);
  });

  it('a base truth delays an upgrade by 2 days (1 at half), else costs supplies', () => {
    const s = base();
    s.base.upgrades = [{ facilityId: 'medbay', toLevel: 2, daysLeft: 3 }];
    expect(land(sell(structuredClone(s), [item('base', 'medbay')], 'truth')).state.base.upgrades![0].daysLeft).toBe(5);
    expect(land(sell(structuredClone(s), [item('base', 'medbay')], 'partial')).state.base.upgrades![0].daysLeft).toBe(4);
    const idle = base();
    const before = sell(structuredClone(idle), [item('base', 'medbay')], 'truth');
    const supplies = before.resources.supplies;
    expect(land(before).state.resources.supplies).toBe(supplies - 10);
  });

  it('mission_done, spine and squad truths move the rival up 10 and the own corporation down 5', () => {
    for (const kind of ['mission_done', 'spine', 'squad'] as const) {
      const s = sell(base(), [item(kind, 'x')], 'truth');
      const own = s.commander.corporationId!;
      const rival = debts(s).corporationId;
      const ownBefore = s.world.factions[own] ?? 0;
      const rivalBefore = s.world.factions[rival] ?? 0;
      const t = land(s).state;
      expect(t.world.factions[rival] ?? 0, kind).toBe(rivalBefore + 10);
      expect(t.world.factions[own] ?? 0, kind).toBe(ownBefore - 5);
      const half = land(sell(base(), [item(kind, 'x')], 'partial')).state;
      expect(half.world.factions[rival] ?? 0, `${kind} partial`).toBe(rivalBefore + 5);
    }
  });

  it('each landing consequence emits debts_consequence {kind} and feeds oversight; a false item does neither', () => {
    const s = sell(base(), [item('squad', ANN)], 'truth');
    const { state, events } = land(s);
    expect(events.find((e) => e.type === 'debts_consequence')).toEqual({ type: 'debts_consequence', kind: 'squad' });
    expect(debts(state).oversightSuspicion).toBe(10);
    expect(debts(state).scheduled).toEqual([]);
    const lie = land(sell(base(), [item('squad', ANN)], 'false'));
    expect(lie.events.some((e) => e.type === 'debts_consequence')).toBe(false);
    expect(debts(lie.state).oversightSuspicion).toBe(0);
  });

  it('a consequence that is not due yet waits; a day end runs the due ones', () => {
    const s = sell(base(), [item('squad', ANN)], 'truth');
    expect(runConsequences(s, ctxOf(s))).toEqual([]);
    expect(debts(s).scheduled).toHaveLength(1);
    s.slot = 'morning';
    debts(s).scheduled[0].dueDay = s.day;
    const t = endDay(s, reg);
    expect(debts(t).scheduled).toEqual([]);
    expect(debts(t).oversightSuspicion).toBeGreaterThanOrEqual(10);
  });

  it('a false item found out raises the handler\'s suspicion by 15 on one draw at 0.5', () => {
    let found = 0;
    let missed = 0;
    for (let seed = 1; seed < 80 && !(found && missed); seed++) {
      const s = sell(base(), [item('plan', 'm1')], 'false');
      const t = structuredClone(s);
      t.rng = seedRng(seed);
      for (const x of debts(t).scheduled) x.dueDay = t.day;
      runConsequences(t, ctxOf(t));
      if (debts(t).handlerSuspicion === 15) found += 1; else { missed += 1; expect(debts(t).handlerSuspicion).toBe(0); }
      expect(debts(t).scheduled).toEqual([]);
    }
    expect(found && missed).toBeTruthy();
  });
});

describe('oversight gain', () => {
  it('uses Cunning and the world option: Cunning 3 and brutal give 10 × 0.8 × 1.5 = 12', () => {
    const s = base();
    expect(oversightGain(s, reg, 1)).toBe(10);
    expect(oversightGain(s, reg, 0.5)).toBe(5);
    s.commander.socialStats.cunning = 3;
    expect(oversightGain(s, reg, 1)).toBe(8);
    s.world.options = { ...s.world.options, oversight: 'brutal' };
    expect(oversightGain(s, reg, 1)).toBe(12);
    s.commander.socialStats.cunning = 1;
    s.world.options = { ...s.world.options, oversight: 'lenient' };
    expect(oversightGain(s, reg, 1)).toBe(8); // 7.5 rounds up
  });
});

describe('the ambush on a run', () => {
  const open = (exposure?: { regionId: string; strength: 1 | 0.5 }) => {
    const { state, mission } = withMission(reg, specialCampaign(reg, 'web_of_debts'), {}, (s) => {
      if (exposure) debts(s).exposures.push({ ...exposure, untilDay: s.day + 10 });
    });
    const s = structuredClone(depart(reg, state, mission.id));
    s.expedition!.map.nodes.n0_0.type = 'combat';
    s.expedition!.map.nodes.n0_1.type = 'combat';
    return s;
  };
  const dangerOf = (s: CampaignState, node: string) => {
    const r = run(s, reg, { type: 'expedition/move', payload: { nodeId: node } });
    const exp = r.state.expedition!;
    return { danger: (exp.pending as { encounter: { danger: number } }).encounter.danger, state: r.state, events: r.events };
  };

  it('a run to an exposed region is ambushed: danger +1 on its first two combats (one at half), with the log line', () => {
    const plain = open();
    expect(plain.expedition!.ambushed).toBeUndefined();
    const base1 = dangerOf(plain, 'n0_0').danger;
    const hit = open({ regionId: 'quarantine_d7', strength: 1 });
    expect(hit.expedition!.ambushed).toBe(2);
    const first = dangerOf(hit, 'n0_0');
    expect(first.danger).toBe(base1 + 1);
    expect(first.state.expedition!.ambushed).toBe(1);
    expect(first.state.expedition!.log.some((l) => l.text === 'They were waiting for you.')).toBe(true);
    const half = open({ regionId: 'quarantine_d7', strength: 0.5 });
    expect(half.expedition!.ambushed).toBe(1);
  });

  it('an exposure on another region changes nothing: the run is byte-identical', () => {
    const a = open();
    const b = open({ regionId: 'ashway', strength: 1 });
    expect(JSON.stringify(b.expedition)).toBe(JSON.stringify(a.expedition));
    expect(JSON.stringify(dangerOf(b, 'n0_0').state.expedition)).toBe(JSON.stringify(dangerOf(a, 'n0_0').state.expedition));
  });
});
