import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { applyWorldEffects } from '../../../src/engine/world/effects';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import type { WorldEffect } from '../../../src/engine/world/types';
import { campaign, ctxOf, loadCore, ofType } from '../../helpers/loyalty';

let reg: Registries;
let base: CampaignState;
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 4);
  for (const u of base.squad) {
    u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    Object.assign(base.relations[u.id], { trust: 50, affinity: 20, stateId: 'comrade', loyaltyBand: 'steady' });
  }
  base.squad[0].values.mercy = 3;
  base.squad[1].values.mercy = -3;
});

const apply = (s: CampaignState, effects: WorldEffect[], src: Partial<Parameters<typeof applyWorldEffects>[3]> = {}) => {
  const draft = structuredClone(s);
  const events = applyWorldEffects(draft, ctxOf(draft, reg), effects, { kind: 'event', id: 'evt_x', ...src });
  return { draft, events };
};
const mercy: WorldEffect = {
  type: 'unit_event', event: 'decision_aligned', severity: 'moderate', targets: 'named', valueAxes: [{ axis: 'mercy', direction: 1 }],
};

describe('unit_event outside an expedition', () => {
  it('unit_event outside a run applies at once to the active named units', () => {
    const r = apply(base, [mercy]);
    expect(r.draft.relations[ANN].trust).toBeGreaterThan(50); // mercy +3 agrees
    expect(r.draft.relations[BEA].trust).toBeLessThan(50); // mercy −3 does not
    expect(ofType(r.events, 'relation_changed').map((e) => e.unitId)).toEqual(expect.arrayContaining([ANN, BEA]));
    expect(r.draft.relations[ANN].history.at(-1)).toMatchObject({ type: 'decision_aligned', severity: 'moderate' });
  });

  it('only named units for targets named, every active unit for party', () => {
    const s = structuredClone(base);
    s.squad.find((u) => u.id === 'unit_dee')!.kind = 'grunt';
    const named = apply(s, [mercy]);
    expect(named.draft.relations.unit_dee.history).toEqual(base.relations.unit_dee.history);
    const party = apply(s, [{ ...mercy, targets: 'party' }]);
    expect(party.draft.relations.unit_dee.history.at(-1)).toMatchObject({ type: 'decision_aligned' });
  });

  it('src.units limits who is touched; reserve and dead units never are', () => {
    const only = apply(base, [mercy], { units: [ANN] });
    expect(only.draft.relations[BEA].trust).toBe(50);
    expect(only.draft.relations[ANN].trust).toBeGreaterThan(50);
    const s = structuredClone(base);
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    expect(apply(s, [mercy], { units: [ANN, BEA] }).draft.relations[BEA].trust).toBe(50);
    const reserve = structuredClone(base);
    reserve.roster.activeIds = reserve.roster.activeIds.filter((id) => id !== BEA);
    expect(apply(reserve, [mercy]).draft.relations[BEA].trust).toBe(50);
  });

  it('the units are re-evaluated: a big enough loss moves the state', () => {
    const s = structuredClone(base);
    s.relations[BEA].trust = 12;
    s.relations[BEA].loyaltyBand = 'steady';
    const r = apply(s, [{ ...mercy, severity: 'extreme' }]);
    expect(r.draft.relations[BEA].loyaltyBand).not.toBe('steady');
  });
});

describe('thread_flag', () => {
  const withThread = (n = 0): CampaignState => {
    const s = structuredClone(base);
    s.world.threads.push({
      id: 't1', title: 'T', status: 'open', relatedUnits: [], relatedRegions: [], createdDay: 1,
      flags: Array.from({ length: n }, (_, i) => ({ id: `thread:t1:f${i}`, description: 'd' })),
    });
    return s;
  };
  const fx = (slug: string): WorldEffect => ({ type: 'thread_flag', threadId: 't1', flagId: `thread:t1:${slug}`, description: 'Saw it happen.' });

  it('thread_flag is stored in its thread with a description and respects the 12-flag cap', () => {
    const r = apply(withThread(), [fx('saw_it')]);
    expect(r.draft.world.threads[0].flags).toEqual([{ id: 'thread:t1:saw_it', description: 'Saw it happen.' }]);
    expect(ofType(r.events, 'thread_flag_set')).toEqual([{ type: 'thread_flag_set', threadId: 't1', flagId: 'thread:t1:saw_it' }]);
    const full = apply(withThread(TUNING.world.threadFlagsMax), [fx('one_too_many')]);
    expect(full.draft.world.threads[0].flags).toHaveLength(TUNING.world.threadFlagsMax);
    expect(ofType(full.events, 'thread_flag_set')).toEqual([]);
  });

  it('a repeat, a missing thread and a flag of another thread change nothing', () => {
    const once = apply(withThread(), [fx('saw_it'), fx('saw_it')]);
    expect(once.draft.world.threads[0].flags).toHaveLength(1);
    expect(apply(base, [fx('saw_it')]).events).toEqual([]);
    expect(apply(withThread(), [{ ...fx('x'), threadId: 'ghost' } as WorldEffect]).draft.world.threads[0].flags).toEqual([]);
  });
});
