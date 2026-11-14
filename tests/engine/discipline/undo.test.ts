import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { canUndo } from '../../../src/engine/discipline/undo';
import { disciplineOf, holdDefiance, recordOf } from '../../../src/engine/discipline';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore, ofType, run } from '../../helpers/loyalty';
import { noPresence, setRecord } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  for (const u of s.squad) {
    u.defects = []; u.likes = []; u.dislikes = []; u.triggers = []; u.stress = 20;
    s.relations[u.id].stateId = 'comrade';
    s.relations[u.id].trust = 50;
    s.relations[u.id].affinity = 10;
    s.relations[u.id].metDay = -50;
    s.relations[u.id].loyaltyBand = 'steady';
  }
  return s;
}
const inScene = (s: CampaignState, ids = [ANN]): CampaignState =>
  run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: ids, origin: 'event', startIndex: 0 } }).state;
const ev = (type: string, over: Record<string, unknown> = {}) => ({
  type, actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.8, measure: 'verbal', ...over,
});
const read = (s: CampaignState, events: unknown[], channel: 'scene' | 'dm' = 'scene') =>
  run(s, reg, { type: 'intents/apply', payload: channel === 'scene' ? { channel, intents: { events } } : { channel, unitId: ANN, intents: { events } } });
const undo = (s: CampaignState, id: string) => run(s, reg, { type: 'discipline/undo', payload: { id } });
const strip = (s: CampaignState) => { const c = structuredClone(s); delete c.ledger; delete c.memory.nextId; return c; };
const lastApp = (s: CampaignState) => s.discipline!.applications.at(-1)!;

describe('UNDO restores the exact previous state', () => {
  const exact = (prepare: (s: CampaignState) => CampaignState, measure: string, channel: 'scene' | 'dm' = 'scene') => {
    const before = prepare(channel === 'scene' ? inScene(world()) : world());
    const applied = read(before, [ev('commander_enforced', { measure })], channel).state;
    expect(lastApp(applied).measure).toBe(measure);
    const r = undo(applied, lastApp(applied).id);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'discipline_undone')).toEqual([{ type: 'discipline_undone', id: lastApp(applied).id, unitId: ANN }]);
    expect(strip(r.state)).toEqual(strip(before));
    return { before, applied, undone: r.state };
  };

  it('revoke_rations (a resource and a relation change)', () => {
    const { undone, before } = exact((s) => s, 'revoke_rations');
    expect(undone.resources).toEqual(before.resources);
    expect('discipline' in undone).toBe(false); // the save looks as if nothing ever happened
  });

  it('brig, which also moves her loyalty band and puts her in the brig', () => {
    const { applied, undone } = exact((s) => { s.relations[ANN].trust = 28; return s; }, 'brig');
    expect(applied.relations[ANN].loyaltyBand).toBe('wavering'); // 28 − 6 = 22
    expect(undone.relations[ANN].loyaltyBand).toBe('steady');
    expect(applied.discipline!.restrictions).toHaveLength(1);
    expect(undone.discipline).toBeUndefined();
  });

  it('extra_duty (a duty restriction and credits) and bench and revoke_leave', () => {
    for (const measure of ['extra_duty', 'bench', 'revoke_leave', 'verbal']) exact((s) => s, measure);
  });

  it('a punishment that cancelled a held defiance and kept a threat: both come back', () => {
    const { applied, undone } = exact((s) => {
      holdDefiance(s, ANN, 'moderate', 'intent', s.scene?.id);
      disciplineOf(s).threats.push({ id: 'th9', unitId: ANN, measure: 'revoke_leave', day: 5, deadlineDay: 6, believed: true, channel: 'scene', inverse: {} });
      return s;
    }, 'brig');
    expect(applied.discipline!.defiance).toEqual([]);
    expect(applied.discipline!.threats).toEqual([]);
    expect(undone.discipline!.defiance).toHaveLength(1);
    expect(undone.discipline!.threats.map((t) => t.id)).toEqual(['th9']);
  });

  it('a DM punishment on its own day', () => {
    exact((s) => s, 'revoke_rations', 'dm');
  });

  it('a record that was already there comes back to the same value, not to zero', () => {
    const { undone } = exact((s) => setRecord(s, ANN, 12), 'brig');
    expect(recordOf(undone, ANN)).toBe(12);
  });
});

describe('what UNDO leaves alone', () => {
  it('leaves no memory entry: facts and chronicle are the same and her history has no commander_enforced', () => {
    const before = inScene(world());
    const applied = read(before, [ev('commander_enforced', { measure: 'revoke_rations' })]).state;
    const undone = undo(applied, lastApp(applied).id).state;
    expect(undone.memory.facts).toEqual(before.memory.facts);
    expect(undone.memory.chronicle).toEqual(before.memory.chronicle);
    expect(undone.relations[ANN].history.some((h) => h.type === 'commander_enforced')).toBe(false);
  });

  it('after a later gain keeps the later gain', () => {
    const before = inScene(world());
    const applied = read(before, [ev('commander_enforced', { measure: 'brig' })]).state; // Trust 50 → 44
    expect(applied.relations[ANN].trust).toBe(44);
    const later = read(applied, [ev('praised', { severity: 'major' })]).state; // another event moves Trust up a little
    const gained = later.relations[ANN].trust - 44;
    expect(gained).toBeGreaterThan(0);
    const undone = undo(later, lastApp(later).id).state;
    expect(undone.relations[ANN].trust).toBe(50 + gained); // only the −6 comes back
    expect(undone.relations[ANN].history.some((h) => h.type === 'praised')).toBe(true);
  });

  it('a state it caused is put back only if she is still in it', () => {
    const before = inScene(world());
    const applied = read(before, [ev('commander_enforced', { measure: 'brig' })]).state;
    applied.discipline!.applications[0].inverse.state = { from: 'comrade', to: 'estranged', sinceFrom: 2 };
    applied.relations[ANN].stateId = 'friend'; // something else moved her on since
    const undone = undo(applied, lastApp(applied).id).state;
    expect(undone.relations[ANN].stateId).toBe('friend');
    applied.relations[ANN].stateId = 'estranged';
    const back = undo(applied, lastApp(applied).id).state;
    expect([back.relations[ANN].stateId, back.relations[ANN].stateSince]).toEqual(['comrade', 2]);
  });

  it('clamps: a Trust already at the ceiling does not go over 100', () => {
    const before = inScene(world());
    const applied = read(before, [ev('commander_enforced', { measure: 'brig' })]).state;
    applied.relations[ANN].trust = 99;
    expect(undo(applied, lastApp(applied).id).state.relations[ANN].trust).toBe(100);
  });
});

describe('what cannot be undone', () => {
  it('a menu punishment', () => {
    const s = run(world(), reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'verbal' } }).state;
    const r = undo(s, lastApp(s).id);
    expect(String(errors(r.events)[0].message)).toBe('Only a punishment read from dialogue can be undone.');
    expect(r.state).toBe(s);
  });

  it('after its scene ended', () => {
    const applied = read(inScene(world()), [ev('commander_enforced')]).state;
    const ended = run(applied, reg, { type: 'scene/end' }).state;
    expect(canUndo(ended, lastApp(ended).id)).toBe('Its scene has ended.');
    expect(errors(undo(ended, lastApp(ended).id).events)).toHaveLength(1);
  });

  it('on a later day', () => {
    const applied = read(world(), [ev('commander_enforced')], 'dm').state;
    expect(canUndo(applied, lastApp(applied).id)).toBeNull();
    const later = { ...applied, day: applied.day + 1 };
    expect(canUndo(later, lastApp(later).id)).toBe('It can only be undone on the day it was logged.');
  });

  it('an id twice, an unknown id and a malformed one', () => {
    const applied = read(inScene(world()), [ev('commander_enforced')]).state;
    const id = lastApp(applied).id;
    const once = undo(applied, id).state;
    expect(String(errors(undo(once, id).events)[0].message)).toBe('There is nothing to undo.');
    expect(errors(undo(applied, 'ap999').events)).toHaveLength(1);
    expect(errors(run(applied, reg, { type: 'discipline/undo', payload: {} }).events)).toHaveLength(1);
    expect(errors(undo(applied, 'f1').events)).toHaveLength(1);
  });
});

describe('UNDO of a threat', () => {
  const threatened = (s: CampaignState, channel: 'scene' | 'dm' = 'scene') => read(s, [ev('threatened', { measure: 'brig' })], channel).state;

  it('removes it and reverts its deltas, exactly', () => {
    const before = inScene(world());
    const t = threatened(before);
    const id = t.discipline!.threats[0].id;
    expect(canUndo(t, id)).toBeNull();
    expect(t.relations[ANN].affinity).toBeLessThan(10);
    const r = undo(t, id);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'discipline_undone')).toEqual([{ type: 'discipline_undone', id, unitId: ANN }]);
    expect(strip(r.state)).toEqual(strip(before));
  });

  it('a lapsed or kept threat cannot be undone', () => {
    const t = threatened(inScene(world()));
    const id = t.discipline!.threats[0].id;
    const kept = read(t, [ev('commander_enforced', { measure: 'brig' })]).state;
    expect(kept.discipline!.threats).toEqual([]);
    expect(canUndo(kept, id)).toBe('That threat is no longer pending.');
    const d = threatened(world(), 'dm');
    const lapsed = endDay(endDay(d, reg), reg);
    expect(lapsed.discipline!.threats).toEqual([]);
    expect(canUndo(lapsed, d.discipline!.threats[0].id)).toBe('That threat is no longer pending.');
  });

  it('not after its scene ended', () => {
    const t = threatened(inScene(world()));
    const ended = run(t, reg, { type: 'scene/end' }).state;
    expect(canUndo(ended, t.discipline!.threats[0].id)).toBe('Its scene has ended.');
  });

  it('a dm threat can be undone the same day', () => {
    const before = world();
    const t = threatened(before, 'dm');
    expect(strip(undo(t, t.discipline!.threats[0].id).state)).toEqual(strip(before));
  });
});

describe('a different unit is untouched', () => {
  it('the others keep every number', () => {
    const before = inScene(world(), [ANN, BEA]);
    const applied = read(before, [ev('commander_enforced', { measure: 'brig' })]).state;
    const undone = undo(applied, lastApp(applied).id).state;
    expect(undone.relations[BEA]).toEqual(before.relations[BEA]);
    expect(undone.squad.find((u) => u.id === BEA)).toEqual(before.squad.find((u) => u.id === BEA));
  });
});
