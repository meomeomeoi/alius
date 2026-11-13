import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/base';
import '../../../src/engine/actions/squad';
import { buildCampaign, makeNamedUnit, validateSetup, validateUnitProfile, type SetupResult, type UnitSetup } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { bandShift, dispositionById, dispositionFor, worldDispositionLevel } from '../../../src/engine/worldOptions';
import { campaign, errors, loadCore, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const LEVELS = ['kind', 'guarded', 'prickly', 'volatile', 'hazardous'] as const;
const withLevel = (s: CampaignState, level: string): CampaignState => {
  const d = structuredClone(s);
  d.world.options = { ...(d.world.options ?? {}), disposition: level };
  return d;
};
const build = (level: string, over: Partial<SetupResult> = {}, units: UnitSetup[] = [unitSetup('Ann', { baseline: { trust: 40, affinity: 0, attraction: 0 } })]): CampaignState => {
  const r = buildCampaign({ commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units, world: { options: { disposition: level } }, ...over }, reg, { desireBondDefects: false, seed: 11 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};

describe('the world level and a unit\'s effective level', () => {
  it('a P7 save reads guarded with offset 0', () => {
    const s = campaign(reg, 2);
    delete s.world.options;
    for (const u of s.squad) delete u.dispositionOffset;
    expect(worldDispositionLevel(s, reg).id).toBe('guarded');
    expect(dispositionById(s, reg, s.squad[0].id).id).toBe('guarded');
    expect(dispositionFor(s, reg, s.squad[0]).id).toBe('guarded');
  });

  it.each(LEVELS)('the world level %s is read from the disposition option', (level) => {
    expect(worldDispositionLevel(withLevel(campaign(reg, 1), level), reg).id).toBe(level);
  });

  it('offset clamps at both ends and grunts ignore it', () => {
    const named = (offset: number) => ({ kind: 'named' as const, dispositionOffset: offset });
    const s = campaign(reg, 1);
    expect(dispositionFor(withLevel(s, 'kind'), reg, named(-2)).id).toBe('kind');
    expect(dispositionFor(withLevel(s, 'hazardous'), reg, named(2)).id).toBe('hazardous');
    expect(dispositionFor(withLevel(s, 'guarded'), reg, named(1)).id).toBe('prickly');
    expect(dispositionFor(withLevel(s, 'guarded'), reg, named(-1)).id).toBe('kind');
    expect(dispositionFor(withLevel(s, 'kind'), reg, named(2)).id).toBe('prickly');
    // out-of-range data is clamped to ±2 first
    expect(dispositionFor(withLevel(s, 'guarded'), reg, named(9)).id).toBe('volatile');
    // a grunt (or a bare object) uses the world level whatever the data says
    expect(dispositionFor(withLevel(s, 'guarded'), reg, { kind: 'grunt', dispositionOffset: 2 }).id).toBe('guarded');
    expect(dispositionFor(withLevel(s, 'hazardous'), reg, {} as never).id).toBe('hazardous');
  });

  it('per-unit offset changes only that unit\'s effective level', () => {
    const s = campaign(reg, 2);
    s.squad[0].dispositionOffset = 1;
    expect(dispositionById(s, reg, s.squad[0].id).id).toBe('prickly');
    expect(dispositionById(s, reg, s.squad[1].id).id).toBe('guarded');
    expect(dispositionById(s, reg, 'nobody').id).toBe('guarded');
  });

  it('bandShift composes the level shift and its exit extra', () => {
    const lv = (id: string) => reg.dispositionLevels.get(id)!;
    expect(bandShift(lv('kind') as never)).toEqual({ enter: -5, exit: -5 });
    expect(bandShift(lv('guarded') as never)).toEqual({ enter: 0, exit: 0 });
    expect(bandShift(lv('hazardous') as never)).toEqual({ enter: 10, exit: 18 });
  });
});

describe('join offsets at the three join sites', () => {
  it('kind starts +10/+10 and hazardous −30/−20 on the same baseline: buildCampaign', () => {
    const g = build('guarded').relations.unit_ann;
    const k = build('kind').relations.unit_ann;
    const h = build('hazardous').relations.unit_ann;
    expect([k.trust - g.trust, k.affinity - g.affinity]).toEqual([10, 10]);
    expect([h.trust - g.trust, h.affinity - g.affinity]).toEqual([-30, -20]);
  });

  it('kind starts +10/+10 and hazardous −30/−20: squad/add_named', () => {
    const at = (level: string) => {
      const s = withLevel(campaign(reg, 2), level);
      s.world.incomingUnits = 1;
      const r = run(s, reg, { type: 'squad/add_named', payload: { unit: unitSetup('Zed', { baseline: { trust: 40, affinity: 0, attraction: 0 } }) } });
      expect(errors(r.events)).toEqual([]);
      return r.state.relations.unit_zed;
    };
    const g = at('guarded');
    expect([at('kind').trust - g.trust, at('kind').affinity - g.affinity]).toEqual([10, 10]);
    expect([at('hazardous').trust - g.trust, at('hazardous').affinity - g.affinity]).toEqual([-30, -20]);
  });

  it('kind starts +10/+10 and hazardous −30/−20: a recruited grunt (the world level, no offset)', () => {
    const at = (level: string) => {
      const s = withLevel(campaign(reg, 2), level);
      s.resources.credits = 500;
      const r = run(s, reg, { type: 'base/recruit_grunt', payload: {} });
      expect(errors(r.events)).toEqual([]);
      return r.state.relations[r.state.squad.at(-1)!.id];
    };
    const g = at('guarded');
    expect([at('kind').trust - g.trust, at('kind').affinity - g.affinity]).toEqual([10, 10]);
    expect(at('hazardous').affinity - g.affinity).toBe(-20);
    expect(at('hazardous').trust).toBe(Math.max(0, g.trust - 30));
  });

  it('a decline-incoming grunt also gets the world offsets', () => {
    const at = (level: string) => {
      const s = withLevel(campaign(reg, 2), level);
      s.world.incomingUnits = 1;
      const r = run(s, reg, { type: 'squad/decline_incoming', payload: {} });
      return r.state.relations[r.state.squad.at(-1)!.id];
    };
    expect(at('kind').affinity - at('guarded').affinity).toBe(10);
  });

  it('the unit\'s own offset moves only her start', () => {
    const units = [unitSetup('Ann', { baseline: { trust: 40, affinity: 0, attraction: 0 }, dispositionOffset: -1 }),
      unitSetup('Bea', { baseline: { trust: 40, affinity: 0, attraction: 0 } })];
    const s = build('guarded', {}, units);
    expect(s.relations.unit_ann.affinity - s.relations.unit_bea.affinity).toBe(10); // Ann reads as kind
    expect(s.relations.unit_ann.trust - s.relations.unit_bea.trust).toBe(10);
    expect(s.squad[0].dispositionOffset).toBe(-1);
    expect(s.squad[1].dispositionOffset).toBeUndefined();
  });

  it('the loyalty band at join uses the unit\'s shift', () => {
    // baseline trust 40 + presence/crime ≈ 40; hazardous offset −30 leaves ~10 → breaking; kind and guarded stay steady
    const units = [unitSetup('Ann', { baseline: { trust: 40, affinity: 0, attraction: 0 } })];
    expect(build('guarded', {}, units).relations.unit_ann.loyaltyBand).toBe('steady');
    expect(build('hazardous', {}, units).relations.unit_ann.loyaltyBand).toBe('breaking');
  });
});

describe('disposition fields in a setup', () => {
  const profile = (over: Record<string, unknown>) => {
    const { baseline: _b, ...u } = unitSetup('Ann', over as Partial<UnitSetup>);
    return validateUnitProfile(u, 'Ann', reg, { desireBondDefects: false });
  };

  it('makeNamedUnit copies offset, reason and stances', () => {
    const stances = { gender_norms: { stance: 'shares' as const, strength: 2 as const, reason: 'Raised in the machine.' } };
    const u = makeNamedUnit(unitSetup('Ann', { dispositionOffset: -1, dispositionReason: 'Eager.', worldStances: stances }), reg, new Set());
    expect(u.dispositionOffset).toBe(-1);
    expect(u.dispositionReason).toBe('Eager.');
    expect(u.worldStances).toEqual(stances);
    expect(u.worldStances).not.toBe(stances);
    const plain = makeNamedUnit(unitSetup('Bea'), reg, new Set());
    expect('dispositionOffset' in plain || 'worldStances' in plain).toBe(false);
  });

  it('an offset is an integer from −2 to 2', () => {
    expect(profile({ dispositionOffset: 2 })).toEqual([]);
    expect(profile({ dispositionOffset: -2 })).toEqual([]);
    expect(profile({ dispositionOffset: 3 })).toEqual([expect.stringContaining('disposition offset')]);
    expect(profile({ dispositionOffset: 0.5 })).toEqual([expect.stringContaining('disposition offset')]);
  });

  it('stance keys must be squadStance options, strength 1 or 2, reason at most 160 characters', () => {
    const ok = { gender_norms: { stance: 'opposes', strength: 1, reason: 'Hates the old ways.' } };
    expect(profile({ worldStances: ok })).toEqual([]);
    expect(profile({ worldStances: { tone: { stance: 'shares', strength: 1, reason: '' } } })).toEqual([expect.stringContaining('"tone"')]);
    expect(profile({ worldStances: { gender_norms: { stance: 'loves', strength: 1, reason: '' } } })).toEqual([expect.stringContaining('stance')]);
    expect(profile({ worldStances: { gender_norms: { stance: 'shares', strength: 3, reason: '' } } })).toEqual([expect.stringContaining('strength')]);
    expect(profile({ worldStances: { gender_norms: { stance: 'shares', strength: 1, reason: 'x'.repeat(161) } } })).toEqual([expect.stringContaining('reason')]);
    expect(profile({ dispositionReason: 'x'.repeat(161) })).toEqual([expect.stringContaining('reason')]);
  });

  it('validateSetup reports them per unit', () => {
    const r: SetupResult = { commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann', { dispositionOffset: 5 })] };
    expect(validateSetup(r, reg, { desireBondDefects: false }).some((e) => /disposition offset/.test(e))).toBe(true);
  });
});
