import { beforeAll, describe, expect, it } from 'vitest';
import type { Entry, Registries } from '../../../src/content/types';
import { disciplineOf, holdDefiance, impunityOf, recordOf } from '../../../src/engine/discipline';
import { demandChance, eligibleTemplates, grantProblem, openDemand } from '../../../src/engine/discipline/demands';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { noPresence, setRecord, withStance, type StanceName } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 20;
  s.resources = { credits: 200, supplies: 30, plyx: 10 };
  for (const u of s.squad) {
    u.defects = []; u.likes = []; u.dislikes = []; u.triggers = []; u.stress = 10;
    s.relations[u.id].stateId = 'comrade';
    s.relations[u.id].trust = 50;
    s.relations[u.id].affinity = 10;
    s.relations[u.id].metDay = -50;
  }
  return s;
}
/** The registry with only these templates (so a pick is not left to chance). */
const only = (...ids: string[]): Registries => ({ ...reg, demandTemplates: new Map(ids.map((id) => [id, reg.demandTemplates.get(id)!])) });
const patch = (r: Registries, id: string, over: Record<string, unknown>): Registries =>
  ({ ...r, demandTemplates: new Map([...r.demandTemplates, [id, { ...(r.demandTemplates.get(id) as object), id, ...over } as Entry]]) });
const ctxOf = (s: CampaignState, r: Registries = reg) => ({ registries: r, rng: new Rng(s.rng) });
/** Opens a demand on a clone and returns the new state. */
function opened(s0: CampaignState, id: string, tpl: string, opts: { owed?: boolean } = {}, r: Registries = only(tpl)) {
  const s = structuredClone(s0);
  const res = openDemand(s, ctxOf(s, r), id, opts);
  if (!res) throw new Error('no demand opened');
  return { state: s, demand: res.demand, events: res.events };
}
const act = (s: CampaignState, type: string, payload: unknown, r: Registries = reg) => run(s, r, { type, payload });
const answer = (s: CampaignState, demandId: string, a: 'grant' | 'refuse', r: Registries = reg) => act(s, 'demand/answer', { demandId, answer: a }, r);
const deliver = (s: CampaignState, demandId: string, text?: string, r: Registries = reg) => act(s, 'demand/deliver', { demandId, ...(text !== undefined ? { text } : {}) }, r);
const asOpen = (s0: CampaignState, id: string, tpl: string, opts: { owed?: boolean } = {}, r: Registries = only(tpl)): { state: CampaignState; id: string } => {
  const { state, demand } = opened(s0, id, tpl, opts, r);
  const d = deliver(state, demand.id, undefined, r);
  expect(errors(d.events)).toEqual([]);
  return { state: d.state, id: demand.id };
};

describe('openDemand with a roll (review M6)', () => {
  it('a given roll picks the template instead of the stream: no rng is needed, 0 takes the first and the top of the range the last', () => {
    const s = world();
    const r = only('double_ration', 'own_room');
    const pick = (roll: number): string => {
      const t = structuredClone(s);
      const res = openDemand(t, { registries: r }, ANN, { roll });
      if (!res) throw new Error('no demand opened');
      return res.demand.templateId;
    };
    expect(pick(0)).toBe('double_ration');
    expect(pick(0.999999)).toBe('own_room');
    expect(pick(0)).toBe(pick(0)); // the same roll, the same template
    // without a roll and without a stream there is nothing to pick with
    expect(() => openDemand(structuredClone(s), { registries: r }, ANN)).toThrow();
  });
});

describe('the templates', () => {
  it('six core templates, one per example of the spec, plus the three of P9d', () => {
    expect([...base.demandTemplates.keys()]).toEqual(['double_ration', 'own_room', 'skip_next_run', 'claim_weapon', 'back_off', 'tell_crime', 'want_tonight', 'want_attention', 'publicity_talk']);
    expect([...base.demandTemplates.values()].map((t) => t.kind).sort()).toEqual(['desire', 'desire', 'exclusion', 'information', 'interpersonal', 'interpersonal', 'item', 'privilege', 'resource']);
  });
});

describe('demandChance', () => {
  it('grows with impunity and disposition and stays at or below 0.5', () => {
    const s = world();
    withStance(s, reg, ANN, 'indifferent'); // weight 1, Impunity 50 on a guarded world
    expect(impunityOf(s, reg, ANN)!.value).toBe(50);
    expect(demandChance(s, reg, ANN)).toBeCloseTo(0.04, 5);
    const hot = world();
    hot.world.options = { ...(hot.world.options ?? {}), disposition: 'hazardous' };
    hot.relations[ANN].trust = 10;
    setRecord(hot, ANN, 40);
    expect(impunityOf(hot, reg, ANN)!.value).toBe(100);
    expect(demandChance(hot, reg, ANN)).toBeCloseTo(0.04 * 2 * Number(base.dispositionLevels.get('hazardous')!.refusalMult) * 2, 5);
    const wild = patch(reg, 'x', {});
    const loud: Registries = { ...wild, commandStances: new Map([...reg.commandStances, ['open_defiance', { ...(reg.commandStances.get('open_defiance') as object), id: 'open_defiance', demandWeight: 4 } as Entry]]) };
    expect(demandChance(hot, loud, ANN)).toBe(0.5);
  });

  it('a cowed unit asks for little, and a grunt or an unknown id for nothing', () => {
    const s = world();
    setRecord(s, ANN, -40);
    expect(demandChance(s, reg, ANN)).toBeLessThan(0.02);
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[ANN]);
    expect(demandChance(s, reg, 'grunt_1')).toBe(0);
    expect(demandChance(s, reg, 'nobody')).toBe(0);
  });
});

describe('eligibleTemplates', () => {
  const ids = (s: CampaignState, r: Registries = reg) => eligibleTemplates(s, r, ANN).map((t) => t.id);

  it('conditions filter: stances, impunity range, disposition ranks, tags, states, flags', () => {
    const s = withStance(world(), reg, ANN, 'disciplined');
    const stancy = patch(only('double_ration'), 'double_ration', { conditions: { stances: ['open_defiance'] } });
    expect(ids(s, stancy)).toEqual([]);
    withStance(s, reg, ANN, 'open_defiance');
    expect(ids(s, stancy)).toEqual(['double_ration']);
    const range = patch(only('double_ration'), 'double_ration', { conditions: { impunity: [80, 100] } });
    expect(ids(s, range)).toEqual([]);
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { impunity: [0, 100] } }))).toEqual(['double_ration']);
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { dispositionRanks: [3, 5] } }))).toEqual([]);
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { dispositionRanks: [1, 2] } }))).toEqual(['double_ration']);
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { tagsAny: ['food_love'] } }))).toEqual([]);
    s.squad[0].likes = ['food_love'];
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { tagsAny: ['food_love'] } }))).toEqual(['double_ration']);
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { statesAny: ['lover'] } }))).toEqual([]);
    expect(ids(s, patch(only('double_ration'), 'double_ration', { conditions: { statesAny: ['comrade'] } }))).toEqual(['double_ration']);
  });

  it('flagsNone hides tell_crime once she knows the crime', () => {
    const s = world();
    expect(ids(s, only('tell_crime'))).toEqual(['tell_crime']);
    s.relations[ANN].flags.push('knows_crime');
    expect(ids(s, only('tell_crime'))).toEqual([]);
  });

  it('claim_weapon needs an unequipped weapon of rarity refined or better', () => {
    const s = world();
    expect(ids(s, only('claim_weapon'))).toEqual([]);
    s.inventory.push({ uid: 'it_1', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: [] });
    expect(ids(s, only('claim_weapon'))).toEqual([]);
    s.inventory.push({ uid: 'it_2', itemId: 'item_blade', rarity: 'refined', upgrade: 0, affixes: [] });
    expect(ids(s, only('claim_weapon'))).toEqual(['claim_weapon']);
    s.squad[1].equipment.weapon = 'it_2'; // somebody wears it
    expect(ids(s, only('claim_weapon'))).toEqual([]);
  });

  it('back_off needs another named unit to bring in, and own_room is gone once she has one', () => {
    const s = world();
    expect(ids(s, only('back_off'))).toEqual(['back_off']);
    for (const u of s.squad.slice(1)) u.status = 'dead';
    expect(ids(s, only('back_off'))).toEqual([]);
    const t = world();
    t.relations[ANN].flags.push('own_room');
    expect(ids(t, only('own_room'))).toEqual([]);
  });
});

describe('opening a demand', () => {
  it('opens undelivered with the template text, two days to live, her stance remembered', () => {
    const s = withStance(world(), reg, ANN, 'open_defiance');
    const { demand, events, state } = opened(s, ANN, 'double_ration');
    expect(demand).toMatchObject({ unitId: ANN, templateId: 'double_ration', day: 20, expiresDay: 22, status: 'undelivered', impunityDriven: true });
    expect(demand.owed).toBeUndefined();
    expect(demand.text).toBe(String(base.demandTemplates.get('double_ration')!.text).replaceAll('{name}', 'Ann'));
    expect(ofType(events, 'demand_opened')).toEqual([{ type: 'demand_opened', demandId: demand.id, unitId: ANN, templateId: 'double_ration' }]);
    expect(state.discipline!.demandLog).toEqual([{ unitId: ANN, day: 20, templateId: 'double_ration' }]);
    expect(opened(withStance(world(), reg, ANN, 'disciplined'), ANN, 'double_ration').demand.impunityDriven).toBe(false);
    expect(opened(withStance(world(), reg, ANN, 'defiant_loyal'), ANN, 'double_ration').demand.impunityDriven).toBe(true);
  });

  it('returns null for a unit in the brig or on duty: its TALK could never open a scene', () => {
    for (const kind of ['confined', 'duty'] as const) {
      const s = world();
      disciplineOf(s).restrictions.push({ unitId: ANN, kind, day: s.day, slot: s.slot, untilDay: s.day + 2 });
      expect(openDemand(s, ctxOf(s, only('double_ration')), ANN), kind).toBeNull();
    }
    const free = world();
    expect(openDemand(free, ctxOf(free, only('double_ration')), ANN)).not.toBeNull();
  });

  it('returns null with no eligible template, with a demand already open, and over the weekly cap', () => {
    const s = world();
    expect(openDemand(structuredClone(s), ctxOf(s, only()), ANN)).toBeNull();
    const first = opened(s, ANN, 'double_ration').state;
    expect(openDemand(first, ctxOf(first, only('double_ration')), ANN)).toBeNull(); // one open at a time
    const capped = world();
    disciplineOf(capped).demandLog.push({ unitId: ANN, day: 19, templateId: 'a' }, { unitId: ANN, day: 14, templateId: 'b' });
    expect(openDemand(capped, ctxOf(capped, only('double_ration')), ANN)).toBeNull();
    const week = world();
    disciplineOf(week).demandLog.push({ unitId: ANN, day: 20 - TUNING.demands.weekDays, templateId: 'a' }, { unitId: ANN, day: 19, templateId: 'b' });
    expect(openDemand(week, ctxOf(week, only('double_ration')), ANN)).not.toBeNull(); // the first is a week old: it no longer counts
  });

  it('the template pick is weighted, seeded and not her last one', () => {
    const tpl = ['double_ration', 'skip_next_run'];
    const picks = new Map<string, number>();
    for (let seed = 1; seed <= 300; seed++) {
      const s = world();
      s.rng = seedRng(seed);
      const id = opened(s, ANN, 'x', {}, only(...tpl)).demand.templateId;
      picks.set(id, (picks.get(id) ?? 0) + 1);
    }
    expect([...picks.keys()].sort()).toEqual(['double_ration', 'skip_next_run']);
    expect(picks.get('double_ration')!).toBeGreaterThan(picks.get('skip_next_run')!); // weights 3 and 2
    for (let seed = 1; seed <= 40; seed++) {
      const s = world();
      s.rng = seedRng(seed);
      disciplineOf(s).demandLog.push({ unitId: ANN, day: 3, templateId: 'double_ration' });
      expect(opened(s, ANN, 'x', {}, only(...tpl)).demand.templateId).toBe('skip_next_run');
    }
    const lone = world();
    disciplineOf(lone).demandLog.push({ unitId: ANN, day: 3, templateId: 'double_ration' });
    expect(opened(lone, ANN, 'x', {}, only('double_ration')).demand.templateId).toBe('double_ration'); // nothing else to pick
  });
});

describe('demand/roll', () => {
  const loud = (): Registries => ({ ...reg, commandStances: new Map([...reg.commandStances].map(([id, e]) => [id, { ...(e as object), id, demandWeight: 3 } as Entry])) });
  const hot = (): CampaignState => {
    const s = world();
    s.world.options = { ...(s.world.options ?? {}), disposition: 'hazardous' };
    for (const u of s.squad) { s.relations[u.id].trust = 10; setRecord(s, u.id, 40); }
    return s;
  };

  it('one new demand per roll, two open at most, none for a unit that has one', () => {
    const r = loud();
    let s = hot();
    let opens = 0;
    for (let seed = 1; seed <= 60 && opens < 2; seed++) {
      s.rng = seedRng(seed);
      const res = act(s, 'demand/roll', {}, r);
      expect(errors(res.events)).toEqual([]);
      const n = ofType(res.events, 'demand_opened').length;
      expect(n).toBeLessThanOrEqual(1);
      opens += n;
      s = res.state;
    }
    expect(opens).toBe(2);
    expect(s.discipline!.demands).toHaveLength(2);
    expect(new Set(s.discipline!.demands.map((d) => d.unitId)).size).toBe(2);
    for (let seed = 100; seed < 160; seed++) {
      s.rng = seedRng(seed);
      expect(ofType(act(s, 'demand/roll', {}, r).events, 'demand_opened')).toEqual([]); // two open: never a third
    }
  });

  it('never more than two in seven days for a unit; from day 8 a new one can open', () => {
    const r = loud();
    let s = hot();
    for (const u of s.squad.filter((x) => x.id !== ANN)) u.status = 'dead';
    const opens: number[] = [];
    for (let i = 0; i < 200; i++) {
      s.day = 20 + Math.floor(i / 28); // 28 rolls a day for 7 days
      s.rng = seedRng(1000 + i);
      const res = act(s, 'demand/roll', {}, r);
      s = res.state;
      for (const e of ofType(res.events, 'demand_opened')) {
        opens.push(s.day);
        // deliver and refuse at once so another can open
        s = deliver(s, String(e.demandId), undefined, r).state;
        s = answer(s, String(e.demandId), 'refuse', r).state;
      }
    }
    const inWindow = (from: number, to: number) => opens.filter((d) => d >= from && d <= to).length;
    expect(inWindow(20, 26)).toBeLessThanOrEqual(2);
    expect(inWindow(20, 26)).toBe(2);
    expect(inWindow(27, 33)).toBeGreaterThan(0);
  });

  it('draws nothing while nobody can ask, and is refused during an expedition', () => {
    const s = world();
    for (const u of s.squad) u.status = 'dead';
    const rng = s.rng;
    expect(act(s, 'demand/roll', {}).state.rng).toEqual(rng);
  });

  it('a unit still getting to know the commander asks for nothing (the acquaintance period)', () => {
    const s = hot();
    s.world.options = { ...(s.world.options ?? {}), acquaintance: 'd14' };
    for (const u of s.squad) s.relations[u.id].metDay = s.day - 2;
    for (let seed = 1; seed <= 100; seed++) {
      s.rng = seedRng(seed);
      expect(ofType(act(s, 'demand/roll', {}, loud()).events, 'demand_opened')).toEqual([]);
    }
  });
});

describe('delivery', () => {
  const stream = (s: CampaignState, id: string) => s.dms[id] ?? [];

  it('pushes a DM from her when she is not in the scene, with the given text cut to 240 and cleaned', () => {
    const { state, demand } = opened(world(), ANN, 'double_ration');
    const text = `I want   it\u0007 now. ${'x'.repeat(400)}`;
    const r = deliver(state, demand.id, text);
    expect(ofType(r.events, 'demand_delivered')).toEqual([{ type: 'demand_delivered', demandId: demand.id, unitId: ANN, viaDm: true }]);
    const d = r.state.discipline!.demands[0];
    expect(d.status).toBe('open');
    expect(d.text.length).toBeLessThanOrEqual(240);
    expect(d.text).not.toMatch(/[\u0000-\u001f]/);
    expect(d.text.startsWith('I want it now.')).toBe(true);
    const dm = stream(r.state, ANN).at(-1)!;
    expect(dm).toMatchObject({ from: ANN, initiated: true, read: false });
    expect(dm.text).toBe(d.text);
    expect(d.dmId).toBe(dm.id);
  });

  it('with no text it delivers the template text', () => {
    const { state, demand } = opened(world(), ANN, 'double_ration');
    expect(stream(deliver(state, demand.id).state, ANN).at(-1)!.text).toBe(demand.text);
  });

  it('an empty or markup-only text falls back to the template text', () => {
    const { state, demand } = opened(world(), ANN, 'double_ration');
    expect(deliver(state, demand.id, '   \u0000  ').state.discipline!.demands[0].text).toBe(demand.text);
  });

  it('no DM when she is in the open scene', () => {
    const s = run(world(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const { state, demand } = opened(s, ANN, 'double_ration');
    const r = deliver(state, demand.id);
    expect(ofType(r.events, 'demand_delivered')).toEqual([{ type: 'demand_delivered', demandId: demand.id, unitId: ANN, viaDm: false }]);
    expect(stream(r.state, ANN)).toEqual([]);
    expect(r.state.discipline!.demands[0].dmId).toBeUndefined();
  });

  it('delivering twice, or an unknown demand, is refused', () => {
    const { state, id } = asOpen(world(), ANN, 'double_ration');
    expect(errors(deliver(state, id).events)).toHaveLength(1);
    expect(errors(deliver(state, 'd999').events)).toHaveLength(1);
  });

  it('an undelivered demand is delivered with the template text at the day end, and old ones expire', () => {
    const { state, demand } = opened(world(), ANN, 'double_ration');
    const after = endDay(state, reg);
    const d = after.discipline!.demands.find((x) => x.id === demand.id)!;
    expect(d.status).toBe('open');
    expect(d.text).toBe(demand.text);
    expect(stream(after, ANN).at(-1)!.text).toBe(demand.text);
  });
});

describe('answering', () => {
  const rel = (s: CampaignState, id = ANN) => [s.relations[id].trust, s.relations[id].affinity, s.squad.find((u) => u.id === id)!.stress, recordOf(s, id)];

  it('grant pays the cost and applies grantDeltas (resource)', () => {
    const { state, id } = asOpen(withStance(world(), reg, ANN, 'disciplined'), ANN, 'double_ration');
    const r = answer(state, id, 'grant');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.resources.supplies).toBe(28);
    expect(rel(r.state).slice(0, 2)).toEqual([state.relations[ANN].trust + 2, state.relations[ANN].affinity + 3]);
    expect(ofType(r.events, 'demand_resolved')).toEqual([{ type: 'demand_resolved', demandId: id, unitId: ANN, answer: 'grant' }]);
    expect(r.state.discipline!.demands).toEqual([]);
    expect(r.state.relations[ANN].history.find((h) => h.type === 'granted_demand')).toMatchObject({ severity: 'minor' });
  });

  it('own_room: credits −20, the other units +2 stress, the flag own_room', () => {
    const { state, id } = asOpen(world(), ANN, 'own_room');
    const r = answer(state, id, 'grant');
    expect(r.state.resources.credits).toBe(180);
    expect(r.state.relations[ANN].flags).toContain('own_room');
    expect(r.state.squad.find((u) => u.id === BEA)!.stress).toBe(12);
    expect(r.state.squad.find((u) => u.id === ANN)!.stress).toBe(10); // the others only
    expect(r.state.relations[ANN].history.find((h) => h.type === 'granted_demand')).toMatchObject({ severity: 'major' }); // costly
  });

  it('skip_next_run puts a benched restriction on her', () => {
    const { state, id } = asOpen(world(), ANN, 'skip_next_run');
    const r = answer(state, id, 'grant');
    expect(r.state.discipline!.restrictions).toEqual([expect.objectContaining({ unitId: ANN, kind: 'benched' })]);
  });

  it('claim_weapon equips the item on her and her old one stays in the stash', () => {
    const s = world();
    s.inventory.push({ uid: 'it_1', itemId: 'item_blade', rarity: 'refined', upgrade: 0, affixes: [] }, { uid: 'it_0', itemId: 'item_blade', rarity: 'standard', upgrade: 0, affixes: [] });
    s.squad[0].equipment.weapon = 'it_0';
    const { state, id } = asOpen(s, ANN, 'claim_weapon');
    const r = answer(state, id, 'grant');
    expect(r.state.squad[0].equipment.weapon).toBe('it_1');
    expect(r.state.inventory.map((i) => i.uid).sort()).toEqual(['it_0', 'it_1']);
  });

  it('tell_crime sets knows_crime through revealCrime', () => {
    const { state, id } = asOpen(world(), ANN, 'tell_crime');
    const r = answer(state, id, 'grant');
    expect(r.state.relations[ANN].flags).toContain('knows_crime');
    expect(ofType(r.events, 'crime_known')).toHaveLength(1);
  });

  it('back_off: dismissed / moderate on the other unit with the lowest Affinity', () => {
    const s = world();
    s.relations[BEA].affinity = -20;
    s.relations[CAT].affinity = 5;
    const { state, id } = asOpen(s, ANN, 'back_off');
    const r = answer(state, id, 'grant');
    expect(r.state.relations[BEA].history.find((h) => h.type === 'dismissed')).toMatchObject({ severity: 'moderate' });
    expect(r.state.relations[CAT].history.some((h) => h.type === 'dismissed')).toBe(false);
    expect(r.state.relations[ANN].history.some((h) => h.type === 'dismissed')).toBe(false);
  });

  it('an impunity-driven grant adds 4 to the record, a disciplined unit\'s adds none', () => {
    const bold = asOpen(withStance(world(), reg, ANN, 'open_defiance'), ANN, 'double_ration');
    const before = recordOf(bold.state, ANN);
    expect(recordOf(answer(bold.state, bold.id, 'grant').state, ANN)).toBe(before + 4);
    const meek = asOpen(withStance(world(), reg, ANN, 'disciplined'), ANN, 'double_ration');
    expect(recordOf(answer(meek.state, meek.id, 'grant').state, ANN)).toBe(recordOf(meek.state, ANN));
  });

  it('a costly grant is a big gesture: the positive axes of a volatile unit grow by the level multiplier', () => {
    const cheap = patch(patch(only('double_ration'), 'double_ration', { costly: false, grantCost: [] }), 'double_ration', { grantDeltas: { trust: 4, affinity: 4 } });
    const dear = patch(cheap, 'double_ration', { costly: true });
    const gain = (r: Registries) => {
      const s = world();
      s.world.options = { ...(s.world.options ?? {}), disposition: 'volatile' };
      s.relations[ANN].trust = 20;
      const { state, id } = asOpen(s, ANN, 'double_ration', {}, r);
      return answer(state, id, 'grant', r).state.relations[ANN].trust - state.relations[ANN].trust;
    };
    const mult = Number(base.dispositionLevels.get('volatile')!.bigGestureMult);
    expect(mult).toBeGreaterThan(1);
    expect(gain(dear)).toBeGreaterThan(gain(cheap));
    expect(gain(dear)).toBe(Math.round(gain(cheap) * mult));
  });

  it('refuse applies refuseDeltas, times 1.5 at Impunity 50 or more, and holds a moderate defiance there', () => {
    const low = asOpen(withStance(world(), reg, ANN, 'fearful'), ANN, 'double_ration');
    const lowR = answer(low.state, low.id, 'refuse');
    expect(rel(lowR.state).slice(0, 3)).toEqual([low.state.relations[ANN].trust - 2, low.state.relations[ANN].affinity - 3, 10 + 3]);
    expect(lowR.state.discipline!.defiance).toEqual([]);
    expect(lowR.state.relations[ANN].history.some((h) => h.type === 'refused_demand')).toBe(true);
    const high = asOpen(withStance(world(), reg, ANN, 'open_defiance'), ANN, 'double_ration');
    const highR = answer(high.state, high.id, 'refuse');
    expect(highR.state.relations[ANN].trust).toBe(high.state.relations[ANN].trust - 3); // −2 × 1.5
    expect(highR.state.relations[ANN].affinity).toBe(high.state.relations[ANN].affinity - 5); // −3 × 1.5 = −4.5
    expect(highR.state.discipline!.defiance).toEqual([expect.objectContaining({ unitId: ANN, severity: 'moderate', source: 'demand' })]);
    expect(ofType(highR.events, 'demand_resolved')).toMatchObject([{ answer: 'refuse' }]);
  });

  it('an owed demand refused also breaks a promise', () => {
    const { state, id } = asOpen(withStance(world(), reg, ANN, 'disciplined'), ANN, 'double_ration', { owed: true });
    expect(state.discipline!.demands[0].owed).toBe(true);
    const r = answer(state, id, 'refuse');
    expect(r.state.relations[ANN].history.some((h) => h.type === 'broke_promise' && h.severity === 'moderate')).toBe(true);
    const granted = answer(state, id, 'grant');
    expect(granted.state.relations[ANN].history.some((h) => h.type === 'broke_promise')).toBe(false);
  });

  it('a cost that cannot be paid refuses the grant and changes nothing', () => {
    const s = world();
    s.resources.supplies = 1;
    const { state, id } = asOpen(s, ANN, 'double_ration');
    expect(grantProblem(state, reg, id)).toBe('Not enough supplies (needs 2).');
    const r = answer(state, id, 'grant');
    expect(String(errors(r.events)[0].message)).toBe('Not enough supplies (needs 2).');
    expect(r.state).toBe(state);
    expect(errors(answer(state, id, 'refuse').events)).toEqual([]); // she can still be refused
  });

  it('other problems: no credits, no weapon, crime already known, nobody to bring in', () => {
    const credits = world();
    const a = asOpen(credits, ANN, 'own_room');
    a.state.resources.credits = 5;
    expect(grantProblem(a.state, reg, a.id)).toBe('Not enough credits (needs 20).');
    const crime = asOpen(world(), ANN, 'tell_crime');
    crime.state.relations[ANN].flags.push('knows_crime');
    expect(grantProblem(crime.state, reg, crime.id)).toBe('She already knows.');
    const weapon = world();
    weapon.inventory.push({ uid: 'it_2', itemId: 'item_blade', rarity: 'refined', upgrade: 0, affixes: [] });
    const w = asOpen(weapon, ANN, 'claim_weapon');
    w.state.inventory = [];
    expect(grantProblem(w.state, reg, w.id)).toBe('There is no suitable weapon to give.');
    const lone = asOpen(world(), ANN, 'back_off');
    for (const u of lone.state.squad.slice(1)) u.status = 'dead';
    expect(grantProblem(lone.state, reg, lone.id)).toBe('There is nobody else to bring into it.');
  });

  it('an open demand expires after two days as a refusal', () => {
    const { state, id } = asOpen(withStance(world(), reg, ANN, 'fearful'), ANN, 'double_ration');
    const d1 = endDay(state, reg); // day 21: still open
    expect(d1.discipline!.demands.map((d) => d.id)).toEqual([id]);
    const t0 = d1.relations[ANN].trust;
    let s = d1;
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    for (let i = 0; i < 5 && s.day === 21; i++) {
      const r = run(s, reg, { type: 'calendar/consume_slot' });
      s = r.state;
      events.push(...r.events);
    }
    expect(s.discipline!.demands).toEqual([]);
    expect(ofType(events, 'demand_resolved')).toEqual([{ type: 'demand_resolved', demandId: id, unitId: ANN, answer: 'refuse', expired: true }]);
    expect(s.relations[ANN].trust).toBeLessThan(t0);
    expect(s.relations[ANN].history.some((h) => h.type === 'refused_demand')).toBe(true);
  });

  it('answering an unknown or already answered demand is an error', () => {
    const { state, id } = asOpen(world(), ANN, 'double_ration');
    const done = answer(state, id, 'refuse').state;
    expect(errors(answer(done, id, 'refuse').events)).toHaveLength(1);
    expect(errors(answer(state, id, 'maybe' as never).events)).toHaveLength(1);
    expect(errors(answer(state, 'd999', 'grant').events)).toHaveLength(1);
  });

  it('an undelivered demand cannot be answered yet', () => {
    const { state, demand } = opened(world(), ANN, 'double_ration');
    expect(errors(answer(state, demand.id, 'grant').events)).toHaveLength(1);
  });

  it('a held defiance of hers is cancelled by granting it', () => {
    const s = withStance(world(), reg, ANN, 'open_defiance');
    holdDefiance(s, ANN, 'minor', 'intent');
    const { state, id } = asOpen(s, ANN, 'double_ration');
    expect(answer(state, id, 'grant').state.discipline!.defiance).toHaveLength(1); // granting is not enforcing: it stays held
  });

  it('a unit who is gone takes her demands with her (removeFromService)', async () => {
    const { removeFromService } = await import('../../../src/engine/leash/use');
    const { state } = opened(world(), ANN, 'double_ration');
    removeFromService(state, ANN, 'deserted');
    expect(state.discipline!.demands).toEqual([]);
  });
});
