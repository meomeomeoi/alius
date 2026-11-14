import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { Rng } from '../../../src/engine/rng';
import { applyIntents } from '../../../src/engine/relations/apply';
import { validateIntents } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { measureList } from '../../../src/engine/discipline';
import { recordOf } from '../../../src/engine/discipline/record';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';
import { setRecord } from '../../helpers/discipline';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const MEASURES = ['verbal', 'brig', 'leash', 'unspecified'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.resources.supplies = 100;
  return s;
};
const ev = (type: string, over: Record<string, unknown> = {}) => {
  const unitActor = type === 'defied';
  return {
    type, actor: unitActor ? ANN : 'commander', targets: unitActor ? [] : [ANN], severity: 'moderate', evidence: 'a quote', confidence: 0.9, ...over,
  };
};
const validate = (events: unknown[], participants = [ANN, BEA]) =>
  validateIntents({ events }, { participants, squad: [{ id: ANN }, { id: BEA }], measures: MEASURES }).events;

describe('validateIntents: the four P9 events', () => {
  it('defied needs a unit actor and no targets', () => {
    expect(validate([ev('defied')])).toHaveLength(1);
    expect(validate([ev('defied', { actor: 'commander', targets: [ANN] })])).toHaveLength(0);
    expect(validate([ev('defied', { targets: [BEA] })])).toHaveLength(0);
  });

  it('commander_enforced, commander_yielded and threatened need the commander and a target', () => {
    for (const type of ['commander_enforced', 'commander_yielded', 'threatened']) {
      expect(validate([ev(type)]), type).toHaveLength(1);
      expect(validate([ev(type, { actor: ANN, targets: [] })]), `${type} by a unit`).toHaveLength(0);
      expect(validate([ev(type, { targets: [] })]), `${type} without a target`).toHaveLength(0);
    }
  });

  it('an unknown measure reads verbal on an enforcement and unspecified on a threat', () => {
    const measureOf = (type: string, m: unknown) => validate([ev(type, m === undefined ? {} : { measure: m })])[0].measure;
    for (const bad of ['guillotine', 42, undefined, { a: 1 }, 'brig, then the Leash']) {
      expect(measureOf('commander_enforced', bad), String(bad)).toBe('verbal');
      expect(measureOf('threatened', bad), String(bad)).toBe('unspecified');
    }
    expect(measureOf('commander_enforced', 'brig')).toBe('brig');
    expect(measureOf('threatened', 'brig')).toBe('brig');
    expect(measureOf('threatened', 'leash')).toBe('leash');
    expect(measureOf('threatened', 'unspecified')).toBe('unspecified');
  });

  it('leash on an enforcement reads verbal (the Leash is only ever filed through its form), and so does unspecified', () => {
    expect(validate([ev('commander_enforced', { measure: 'leash' })])[0].measure).toBe('verbal');
    expect(validate([ev('commander_enforced', { measure: 'unspecified' })])[0].measure).toBe('verbal');
  });

  it('no measure is kept on other events, and without a list only the fallbacks exist', () => {
    expect(validate([ev('praised', { measure: 'brig' })])[0].measure).toBeUndefined();
    expect(validate([ev('commander_yielded', { measure: 'brig' })])[0].measure).toBeUndefined();
    const bare = validateIntents({ events: [ev('commander_enforced', { measure: 'brig' }), ev('threatened', { measure: 'brig' })] }, { participants: [ANN], squad: [{ id: ANN }] }).events;
    expect(bare.map((e) => e.measure)).toEqual(['verbal', 'unspecified']);
  });

  it('granted_demand and refused_demand from the model are dropped', () => {
    expect(validate([ev('granted_demand'), ev('refused_demand', { actor: ANN, targets: [] })])).toHaveLength(0);
  });

  it('measureList is the punishments plus leash and unspecified', () => {
    expect(measureList(reg)).toEqual([...reg.punishments.keys(), 'leash', 'unspecified']);
    expect(measureList({ ...reg, punishments: new Map([['verbal', { id: 'verbal' }]]) })).toEqual(['verbal', 'leash', 'unspecified']);
  });
});

const openScene = (s: CampaignState, participants = [ANN]): CampaignState => {
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};
const apply = (s: CampaignState, events: unknown[], channel: 'scene' | 'dm' = 'scene') => {
  const r = run(s, reg, { type: 'intents/apply', payload: channel === 'scene' ? { channel, intents: { events } } : { channel, unitId: ANN, intents: { events } } });
  expect(errors(r.events)).toEqual([]);
  return r;
};
const endScene = (s: CampaignState) => {
  const r = run(s, reg, { type: 'scene/end' });
  expect(errors(r.events)).toEqual([]);
  return r;
};

describe('held defiance', () => {
  it('a defied changes no record until the scene ends', () => {
    let s = openScene(fresh());
    s = apply(s, [ev('defied', { severity: 'major' })]).state;
    expect(recordOf(s, ANN)).toBe(0);
    expect(s.discipline?.defiance).toEqual([{ unitId: ANN, severity: 'major', day: s.day, source: 'intent', sceneId: s.scene!.id }]);
    expect(s.squad[0].stress).toBeGreaterThan(fresh().squad[0].stress); // the row applies at once (major: stress +2)
    const end = endScene(s);
    expect(recordOf(end.state, ANN)).toBe(TUNING.impunity.defied.major);
    expect(end.state.discipline?.defiance).toEqual([]);
    expect(ofType(end.events, 'defiance_settled')).toEqual([{ type: 'defiance_settled', unitId: ANN, tolerated: true }]);
    expect(ofType(end.events, 'impunity_changed')).toMatchObject([{ unitId: ANN, delta: 8 }]);
  });

  it('moderate gives +5 at the scene end', () => {
    const s = apply(openScene(fresh()), [ev('defied')]).state;
    expect(recordOf(endScene(s).state, ANN)).toBe(5);
  });

  it('an enforcement in the same scene cancels the held defiance', () => {
    let s = openScene(fresh());
    s = apply(s, [ev('defied')]).state;
    const r = apply(s, [ev('commander_enforced', { measure: 'verbal' })]);
    expect(r.state.discipline?.defiance).toEqual([]);
    expect(recordOf(r.state, ANN)).toBe(TUNING.impunity.enforcedFallback);
    const end = endScene(r.state);
    expect(recordOf(end.state, ANN)).toBe(-8); // not −8 + 5
    expect(ofType(end.events, 'defiance_settled')).toEqual([]);
  });

  it('two defied keep the higher severity', () => {
    let s = openScene(fresh());
    s = apply(s, [ev('defied', { severity: 'minor' })]).state;
    s = apply(s, [ev('defied', { severity: 'major' })]).state;
    expect(s.discipline?.defiance).toHaveLength(1);
    expect(recordOf(endScene(s).state, ANN)).toBe(8);
    let t = openScene(fresh());
    t = apply(t, [ev('defied', { severity: 'major' })]).state;
    t = apply(t, [ev('defied', { severity: 'minor' })]).state;
    expect(recordOf(endScene(t).state, ANN)).toBe(8);
  });

  it('scene/abort settles too', () => {
    const s = apply(openScene(fresh()), [ev('defied')]).state;
    const r = run(s, reg, { type: 'scene/abort' });
    expect(errors(r.events)).toEqual([]);
    expect(recordOf(r.state, ANN)).toBe(5);
    expect(r.state.discipline?.defiance).toEqual([]);
  });

  it("another scene's defiance is not settled by this scene's end", () => {
    let s = openScene(fresh(), [ANN, BEA]);
    s = apply(s, [ev('defied', { actor: BEA })]).state;
    s.discipline!.defiance[0].sceneId = 's_elsewhere';
    expect(recordOf(endScene(s).state, BEA)).toBe(0);
  });

  it('a DM defied waits for the day end', () => {
    const r = apply(fresh(), [ev('defied')], 'dm');
    expect(recordOf(r.state, ANN)).toBe(0);
    expect(r.state.discipline?.defiance).toEqual([{ unitId: ANN, severity: 'moderate', day: r.state.day, source: 'intent' }]);
  });

  it('commander_yielded major gives +10 at once, moderate +6, and settles her held defiance as tolerated', () => {
    const s = openScene(fresh());
    expect(recordOf(apply(s, [ev('commander_yielded', { severity: 'major' })]).state, ANN)).toBe(10);
    expect(recordOf(apply(s, [ev('commander_yielded', { severity: 'moderate' })]).state, ANN)).toBe(6);
    expect(recordOf(apply(s, [ev('commander_yielded', { severity: 'extreme' })]).state, ANN)).toBe(10);
    const held = apply(s, [ev('defied', { severity: 'minor' })]).state;
    const r = apply(held, [ev('commander_yielded', { severity: 'minor' })]);
    expect(recordOf(r.state, ANN)).toBe(6 + 3);
    expect(r.state.discipline?.defiance).toEqual([]);
  });

  it('threatened applies its row and changes no record', () => {
    const base = fresh();
    const r = apply(openScene(base), [ev('threatened', { measure: 'brig' })]);
    expect(recordOf(r.state, ANN)).toBe(0);
    expect(r.state.relations[ANN].affinity).toBeLessThan(base.relations[ANN].affinity);
    expect(r.state.relations[ANN].history.at(-1)).toMatchObject({ type: 'threatened', severity: 'moderate' });
  });
});

describe('confidence of enforcements and threats', () => {
  const six = () => Array.from({ length: TUNING.relations.maxEventsPerExchange }, () => ev('praised', { confidence: 0.9 }));
  it('0.59 drops an enforcement and a threat, 0.6 keeps them', () => {
    for (const type of ['commander_enforced', 'threatened']) {
      const low = apply(openScene(fresh()), [ev(type, { confidence: 0.59 })]);
      expect(ofType(low.events, 'intents_applied')[0].landed, `${type} at 0.59`).toEqual([]);
      expect(low.state.relations[ANN].history.some((h) => h.type === type)).toBe(false);
      expect(recordOf(low.state, ANN)).toBe(0);
      const ok = apply(openScene(fresh()), [ev(type, { confidence: 0.6 })]);
      expect(ofType(ok.events, 'intents_applied')[0].landed, `${type} at 0.6`).toEqual([type]);
      expect(ok.state.relations[ANN].history.some((h) => h.type === type)).toBe(true);
    }
  });

  it('a dropped one takes no event slot', () => {
    for (const type of ['commander_enforced', 'threatened']) {
      const r = apply(openScene(fresh()), [ev(type, { confidence: 0.59 }), ...six()]);
      expect(ofType(r.events, 'intents_applied')[0].landed).toHaveLength(6);
    }
  });

  it('the other events keep their own floors (a defied at 0.5 lands)', () => {
    const r = apply(openScene(fresh()), [ev('defied', { confidence: 0.5 })]);
    expect(ofType(r.events, 'intents_applied')[0].landed).toEqual(['defied']);
  });
});

describe('a grunt target', () => {
  it('is ignored', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[ANN]);
    const draft = structuredClone(s);
    const events = applyIntents(draft, { registries: reg, rng: new Rng(draft.rng) }, {
      channel: 'dm', participants: ['grunt_1'], intents: { events: [ev('commander_enforced', { targets: ['grunt_1'], measure: 'verbal' }), ev('defied', { actor: 'grunt_1' })] },
    });
    expect(recordOf(draft, 'grunt_1')).toBe(0);
    expect(draft.discipline?.defiance ?? []).toEqual([]);
    const rel = draft.relations.grunt_1;
    expect([rel.trust, rel.affinity, rel.attraction]).toEqual([s.relations.grunt_1.trust, s.relations.grunt_1.affinity, s.relations.grunt_1.attraction]);
    expect(rel.history.some((h) => h.kind === 'event')).toBe(false);
    expect(draft.squad.find((u) => u.id === 'grunt_1')!.stress).toBe(s.squad.find((u) => u.id === 'grunt_1')!.stress);
    expect(events.some((e) => e.type === 'impunity_changed')).toBe(false);
  });
});

describe('record clamps', () => {
  it('a yield on a record of 38 stops at 40', () => {
    const s = setRecord(openScene(fresh()), ANN, 38);
    expect(recordOf(apply(s, [ev('commander_yielded', { severity: 'major' })]).state, ANN)).toBe(40);
  });
});
