import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { countDeed, deedsOf } from '../../../src/engine/discipline/deeds';
import { disciplineOf, holdDefiance, settleDefiance } from '../../../src/engine/discipline';
import { settleCompels } from '../../../src/engine/leash/use';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation, startFight } from '../../helpers/loyalty';
import { noPresence, withStance } from '../../helpers/discipline';
import { openDemand } from '../../../src/engine/discipline/demands';
import { finalizeCombat } from '../../../src/engine/combat/outcome';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 20;
  s.resources = { credits: 200, supplies: 30, plyx: 10 };
  s.leash.authorizationsLeft = 5;
  for (const u of s.squad) { u.defects = []; u.likes = []; u.dislikes = []; u.triggers = []; s.relations[u.id].metDay = -50; s.relations[u.id].trust = 50; }
  return s;
};
const ev = (type: string, over: Record<string, unknown> = {}) => ({
  type, actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.9, measure: 'verbal', ...over,
});
const read = (s: CampaignState, events: unknown[]) => {
  const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events } } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const deeds = (s: CampaignState) => deedsOf(s);

describe('countDeed and deedsOf', () => {
  it('counts, reads zeros for the rest, drops a counter that is back at 0 and the object when empty', () => {
    const s = fresh();
    expect(deeds(s).leash_compel).toBe(0);
    expect('deeds' in s.commander).toBe(false);
    countDeed(s, 'leash_compel');
    countDeed(s, 'leash_compel', 2);
    expect(deeds(s).leash_compel).toBe(3);
    expect(Object.keys(deeds(s))).toHaveLength(16);
    countDeed(s, 'leash_compel', -3);
    expect(s.commander.deeds).toBeUndefined();
    countDeed(s, 'protected', -2); // never below 0
    expect(s.commander.deeds).toBeUndefined();
  });
  it('a save with an unknown counter in it reads on', () => {
    const s = fresh();
    s.commander.deeds = { bogus: 4 } as never;
    expect(deeds(s).protected).toBe(0);
  });
});

describe('Leash', () => {
  const scene = (s: CampaignState): CampaignState => {
    const open = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    open.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    return open;
  };
  it('a done compel counts, a failed burst does not', () => {
    const r = run(scene(fresh()), reg, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } });
    expect(errors(r.events)).toEqual([]);
    expect(deeds(r.state).leash_compel).toBe(1);
    const failing: Registries = { ...reg, defects: new Map([...reg.defects, ['echo_bleed', { ...(reg.defects.get('echo_bleed') as object), id: 'echo_bleed', leash: { costMult: 1, failChance: 1 } } as never]]) };
    const s = scene(fresh());
    s.squad[0].defects = [{ id: 'echo_bleed' }];
    const f = run(s, failing, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } });
    expect(ofType(f.events, 'scene_compelled')[0].forced).toBe(false);
    expect(deeds(f.state).leash_compel).toBe(0);
  });
  it('a suppress counts', () => {
    const s = fresh();
    s.disloyalty = { units: {}, open: { kind: 'desertion', unitId: ANN, day: s.day, at: 'mission_start' } };
    expect(deeds(run(s, reg, { type: 'leash/suppress', payload: { unitId: ANN } }).state).leash_suppress).toBe(1);
  });
  it('an approved terminate counts, a denied one does not', () => {
    const s = fresh();
    s.disloyalty = { units: { [ANN]: { signs: [], attempts: 2, cause: { kind: 'desertion', day: s.day } } } };
    const sure: Registries = { ...reg, corporations: new Map([...reg.corporations].map(([id, c]) => [id, { ...c, leash: { approval: 1 } }])) };
    const never: Registries = { ...reg, corporations: new Map([...reg.corporations].map(([id, c]) => [id, { ...c, leash: { approval: 0 } }])) };
    expect(deeds(run(s, sure, { type: 'leash/terminate', payload: { unitId: ANN } }).state).leash_terminate).toBe(1);
    expect(deeds(run(s, never, { type: 'leash/terminate', payload: { unitId: ANN } }).state).leash_terminate).toBe(0);
  });
  it('a combat compel counts when the fight is settled', () => {
    const d = fresh();
    settleCompels(d, { registries: reg, rng: new Rng(seedRng(3)) }, [ANN]);
    expect(deeds(d).leash_compel).toBe(1);
  });
});

describe('losses, protection and promises', () => {
  it('a grunt killed in combat counts grunts_lost, a named unit does not', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[3]), id: 'grunt_1', kind: 'grunt', displayName: 'Mara', status: 'active' });
    s.relations.grunt_1 = structuredClone(s.relations[ANN]);
    s.roster.activeIds = [ANN, BEA, CAT, 'grunt_1'];
    const fight = startFight(s, reg);
    const cs = fight.combat!;
    for (const c of cs.combatants.filter((x) => x.side === 'squad')) c.downed = c.unitId === 'grunt_1' || c.unitId === ANN;
    const draft = structuredClone(fight);
    finalizeCombat(draft, reg, new Rng(seedRng(1)), 'lost');
    expect(draft.squad.find((u) => u.id === 'grunt_1')!.status).toBe('dead');
    expect(draft.squad.find((u) => u.id === ANN)!.status).not.toBe('dead');
    expect(deeds(draft).grunts_lost).toBe(1);
  });
  it('a commander protected / major counts once per unit it lands on, a moderate one does not', () => {
    const s = fresh();
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'dm', unitId: ANN, intents: { events: [ev('protected', { severity: 'major' })] } } });
    expect(deeds(r.state).protected).toBe(1);
    expect(deeds(read(s, [ev('protected', { severity: 'moderate' })])).protected).toBe(0);
    const group = run(run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN, BEA], origin: 'event', startIndex: 0 } }).state, reg,
      { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev('protected', { severity: 'extreme', targets: [ANN, BEA] })] } } });
    expect(deeds(group.state).protected).toBe(2);
    // a unit protecting the commander is not the commander's deed
    expect(deeds(read(s, [{ ...ev('protected', { severity: 'major' }), actor: ANN, targets: [] }])).protected).toBe(0);
  });
  it('kept_promise and broke_promise of the commander count', () => {
    const s = fresh();
    expect(deeds(read(s, [ev('kept_promise')])).promises_kept).toBe(1);
    expect(deeds(read(s, [ev('broke_promise')])).promises_broken).toBe(1);
    expect(deeds(read(s, [{ ...ev('kept_promise'), actor: ANN, targets: [] }])).promises_kept).toBe(0);
  });
});

describe('defiance, punishments, threats and demands', () => {
  it('a settled defiance counts defiance_tolerated, a cancelled one does not', () => {
    const s = fresh();
    holdDefiance(s, ANN, 'minor', 'intent');
    settleDefiance(s, { registries: reg, rng: new Rng(s.rng) }, { all: true });
    expect(deeds(s).defiance_tolerated).toBe(1);
    const t = fresh();
    holdDefiance(t, ANN, 'minor', 'intent');
    const punished = run(t, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } }).state;
    expect(deeds(punished).defiance_tolerated).toBe(0);
  });
  it('a brig counts punish_4 and its undo takes it back, with every other counter it moved', () => {
    const s = run(fresh(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    const before = structuredClone(s);
    const applied = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [ev('commander_enforced', { measure: 'brig' })] } } }).state;
    expect(deeds(applied).punish_4).toBe(1);
    const app = applied.discipline!.applications[0];
    const undone = run(applied, reg, { type: 'discipline/undo', payload: { id: app.id } }).state;
    expect(deeds(undone).punish_4).toBe(0);
    expect(undone.commander.deeds).toBeUndefined();
    const strip = (x: CampaignState) => { const c = structuredClone(x); delete c.ledger; delete c.memory.nextId; return c; };
    expect(strip(undone)).toEqual(strip(before));
  });
  it('every rung counts as its own severity', () => {
    for (const [measure, key] of [['verbal', 'punish_1'], ['revoke_rations', 'punish_2'], ['bench', 'punish_3']] as const) {
      expect(deeds(run(fresh(), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure } }).state)[key], measure).toBe(1);
    }
  });
  it('a threat kept counts threats_kept, a lapsed one threats_empty, in both ways it can lapse', () => {
    const kept = read(read(fresh(), [ev('threatened', { measure: 'verbal' })]), [ev('commander_enforced', { measure: 'verbal' })]);
    expect(deeds(kept).threats_kept).toBe(1);
    const t = read(fresh(), [ev('threatened', { measure: 'verbal' })]);
    expect(deeds(endDay(endDay(t, reg), reg)).threats_empty).toBe(1);
    const yielded = read(read(fresh(), [ev('threatened', { measure: 'verbal' })]), [ev('commander_yielded')]);
    expect(deeds(yielded).threats_empty).toBe(1);
    expect(deeds(kept).threats_empty).toBe(0);
  });
  it('a Leash use keeps a threat and counts it too', () => {
    const s = run(fresh(), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    s.scene!.refusals = [{ unitId: ANN, exchange: 0 }];
    disciplineOf(s).threats.push({ id: 'th9', unitId: ANN, measure: 'brig', day: s.day, deadlineDay: s.day + 1, believed: true, channel: 'scene', inverse: {} });
    const r = run(s, reg, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } });
    expect(deeds(r.state).threats_kept).toBe(1);
  });
  it('a demand granted and refused count', () => {
    const open = (s: CampaignState, tpl: string): string => {
      const only: Registries = { ...reg, demandTemplates: new Map([[tpl, reg.demandTemplates.get(tpl)!]]) };
      const draft = structuredClone(s);
      const id = openDemand(draft, { registries: only, rng: new Rng(draft.rng) }, ANN)!.demand.id;
      s.discipline = draft.discipline;
      return id;
    };
    const s = withStance(fresh(), reg, ANN, 'disciplined');
    const id = open(s, 'double_ration');
    const delivered = run(s, reg, { type: 'demand/deliver', payload: { demandId: id } }).state;
    expect(deeds(run(delivered, reg, { type: 'demand/answer', payload: { demandId: id, answer: 'grant' } }).state).demands_granted).toBe(1);
    expect(deeds(run(delivered, reg, { type: 'demand/answer', payload: { demandId: id, answer: 'refuse' } }).state).demands_refused).toBe(1);
  });
  it('an expired demand counts as refused', () => {
    const s = withStance(fresh(), reg, ANN, 'disciplined');
    const only: Registries = { ...reg, demandTemplates: new Map([['double_ration', reg.demandTemplates.get('double_ration')!]]) };
    const draft = structuredClone(s);
    openDemand(draft, { registries: only, rng: new Rng(draft.rng) }, ANN);
    expect(deeds(endDay(endDay(draft, reg), reg)).demands_refused).toBe(1);
  });
});
