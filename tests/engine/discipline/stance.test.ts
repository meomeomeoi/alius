import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { commandStance, stanceEntry } from '../../../src/engine/discipline/stance';
import { impunityOf } from '../../../src/engine/discipline';
import { seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import { noPresence, setRecord, withStance } from '../../helpers/discipline';

let base: Registries;
let reg: Registries;
beforeAll(async () => {
  base = await loadCore();
  reg = noPresence(base);
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.leash.authorizationsLeft = 3;
  return s;
};

/** Puts her at exactly this Trust and Impunity (the record absorbs the difference). */
function at(trust: number, impunity: number, id = ANN): CampaignState {
  const s = fresh();
  setRelation(s, id, { trust });
  setRecord(s, id, 0);
  setRecord(s, id, impunity - impunityOf(s, reg, id)!.value);
  expect(impunityOf(s, reg, id)!.value).toBe(impunity);
  return s;
}

describe('commandStance', () => {
  it('Trust × Impunity gives the four quadrants', () => {
    expect(commandStance(at(60, 20), reg, ANN)).toBe('disciplined');
    expect(commandStance(at(60, 70), reg, ANN)).toBe('defiant_loyal');
    expect(commandStance(at(20, 20), reg, ANN)).toBe('fearful');
    expect(commandStance(at(20, 70), reg, ANN)).toBe('open_defiance');
  });

  it('the edges: Trust 45 and Impunity 50 are high, 44 and 49 are low', () => {
    expect(commandStance(at(45, 50), reg, ANN)).toBe('defiant_loyal');
    expect(commandStance(at(44, 49), reg, ANN)).toBe('fearful');
    expect(commandStance(at(45, 49), reg, ANN)).toBe('disciplined');
    expect(commandStance(at(44, 50), reg, ANN)).toBe('open_defiance');
  });

  it('a grunt, a dead unit and an unknown id have no stance', () => {
    const s = fresh();
    s.squad.push({ ...structuredClone(s.squad[0]), id: 'grunt_1', kind: 'grunt' });
    s.relations.grunt_1 = structuredClone(s.relations[ANN]);
    expect(commandStance(s, reg, 'grunt_1')).toBeNull();
    s.squad[1].status = 'dead';
    expect(commandStance(s, reg, BEA)).toBeNull();
    expect(commandStance(s, reg, 'nobody')).toBeNull();
  });

  it('withStance puts a unit in each quadrant', () => {
    for (const stance of ['disciplined', 'defiant_loyal', 'fearful', 'open_defiance'] as const) {
      expect(commandStance(withStance(fresh(), reg, ANN, stance), reg, ANN), stance).toBe(stance);
    }
  });

  it('stanceEntry reads the registry', () => {
    expect(stanceEntry(reg, 'fearful')?.covert).toBe(true);
    expect(stanceEntry(reg, 'disciplined')?.covert).toBeUndefined();
    expect(stanceEntry({ ...reg, commandStances: new Map() }, 'fearful')).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------------------------------------------------

/** She is in a scene and unsteady enough to refuse about a third of her orders (band breaking = 0.35). */
function sceneWith(stance: 'disciplined' | 'defiant_loyal' | 'fearful' | 'open_defiance'): CampaignState {
  const s = withStance(fresh(), reg, ANN, stance);
  s.relations[ANN].loyaltyBand = 'breaking';
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const order = (s: CampaignState, seed: number) => run({ ...s, rng: seedRng(seed) }, reg, { type: 'scene/order', payload: { unitId: ANN } });
/** The first seed whose order roll gives `refused`. */
function seedFor(s: CampaignState, refused: boolean): number {
  for (let seed = 1; seed < 500; seed++) {
    const r = order(s, seed);
    const e = ofType(r.events, 'scene_order')[0];
    if (e && (e.refused === true || e.covert === true) === refused) return seed;
  }
  throw new Error('no seed');
}

describe('refused orders and the stance', () => {
  it('a refused order holds a moderate defiance and the scene end settles it (+5)', () => {
    const s = sceneWith('disciplined');
    const r = order(s, seedFor(s, true));
    expect(ofType(r.events, 'scene_order')).toMatchObject([{ unitId: ANN, refused: true }]);
    expect(r.state.scene!.refusals).toEqual([{ unitId: ANN, exchange: 0 }]);
    expect(r.state.discipline!.defiance).toEqual([expect.objectContaining({ unitId: ANN, severity: 'moderate', source: 'order', sceneId: s.scene!.id })]);
    const end = run(r.state, reg, { type: 'scene/end' });
    expect(errors(end.events)).toEqual([]);
    expect(end.state.relations[ANN].impunityRecord).toBe((s.relations[ANN].impunityRecord ?? 0) + 5);
  });

  it('every non-covert stance keeps the visible refusal', () => {
    for (const stance of ['disciplined', 'defiant_loyal', 'open_defiance'] as const) {
      const s = sceneWith(stance);
      const r = order(s, seedFor(s, true));
      expect(r.state.scene!.refusals, stance).toHaveLength(1);
      expect(ofType(r.events, 'scene_order')[0].covert, stance).toBeUndefined();
    }
  });

  it('a compel after the refusal cancels it (record −20 after the scene)', () => {
    const s = sceneWith('defiant_loyal');
    const refused = order(s, seedFor(s, true)).state;
    const before = refused.relations[ANN].impunityRecord ?? 0;
    const c = run(refused, reg, { type: 'leash/compel', payload: { unitId: ANN, context: 'scene' } });
    expect(errors(c.events)).toEqual([]);
    expect(c.state.discipline!.defiance).toEqual([]);
    const end = run(c.state, reg, { type: 'scene/end' });
    expect(end.state.relations[ANN].impunityRecord).toBe(before - 20);
  });

  it('a compliant order holds nothing', () => {
    const s = sceneWith('disciplined');
    const r = order(s, seedFor(s, false));
    expect(ofType(r.events, 'scene_order')[0].refused).toBe(false);
    expect(r.state.discipline?.defiance ?? []).toEqual([]);
  });

  it('a fearful refusal is hidden: accepted on screen, nothing stored, no defiance, one covert sabotage queued', () => {
    const s = sceneWith('fearful');
    const r = order(s, seedFor(s, true));
    expect(ofType(r.events, 'scene_order')).toMatchObject([{ unitId: ANN, refused: false, covert: true }]);
    expect(r.state.scene!.refusals ?? []).toEqual([]);
    expect(r.state.discipline?.defiance ?? []).toEqual([]);
    expect(r.state.discipline!.sabotage!.queued).toEqual([{ unitId: ANN, day: s.day }]);
  });

  it('a fearful compliance queues nothing', () => {
    const s = sceneWith('fearful');
    const r = order(s, seedFor(s, false));
    expect(ofType(r.events, 'scene_order')[0]).toMatchObject({ refused: false });
    expect(ofType(r.events, 'scene_order')[0].covert).toBeUndefined();
    expect(r.state.discipline?.sabotage?.queued ?? []).toEqual([]);
  });

  it('whether a unit is fearful is read from the stance entry (covert), not from its id', () => {
    const s = sceneWith('disciplined');
    const covertDisciplined: Registries = {
      ...reg, commandStances: new Map([...reg.commandStances, ['disciplined', { ...(reg.commandStances.get('disciplined') as object), id: 'disciplined', covert: true } as never]]),
    };
    const seed = seedFor(s, true);
    const r = run({ ...s, rng: seedRng(seed) }, covertDisciplined, { type: 'scene/order', payload: { unitId: ANN } });
    expect(ofType(r.events, 'scene_order')[0]).toMatchObject({ refused: false, covert: true });
  });

  it('a save with no discipline object and no stances registry still refuses visibly', () => {
    const s = sceneWith('disciplined');
    const seed = seedFor(s, true);
    delete s.discipline;
    const r = run({ ...s, rng: seedRng(seed) }, { ...reg, commandStances: new Map() }, { type: 'scene/order', payload: { unitId: ANN } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'scene_order')[0].refused).toBe(true);
  });
});
