import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { forgetDynamic, holdsDynamic } from '../../../src/engine/dynamic/forget';
import { blankDynamic, newDynamicCampaign, type DynamicRelation } from '../../../src/engine/dynamic/state';
import { removeFromService } from '../../../src/engine/leash/use';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];

/** Ann holds at `role` with a domain, an aftermath-free dynamic; Bea and Cat are bystanders with their own rows. Everything of Ann's is open. */
function world(): CampaignState {
  const s = campaign(reg, 3);
  s.content = { enabled: ['restraint'] };
  const d = (over: Partial<DynamicRelation>): DynamicRelation => ({ ...blankDynamic(1), ...over });
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = d({
    hold: 55, frame: 'role', domains: [{ id: 'booking', since: 3 }, { id: 'command', since: 5 }], milestones: ['first_protocol'], sworn: { day: 6 },
    probes: { answers: ['yielded'], issued: 2, pending: { axis: 'a', tier: 1, day: 4 } }, leashBlock: { since: 4, held: 1 },
    aftermath: { id: 'da0', kind: 'grief', stage: 0, untilDay: 20 },
  });
  s.relations[BEA].dynamic = d({ hold: 30, frame: 'play', domains: [{ id: 'booking', since: 3 }], aftermath: { id: 'da1', kind: 'pursuit', stage: 1, untilDay: 30 } });
  s.relations[CAT].dynamic = d({ hold: 10 });
  const x = s.dynamic;
  x.open.claims.push({ id: 'dc0', unitId: ANN, domainId: 'x', day: 4 }, { id: 'dc1', unitId: BEA, domainId: 'x', day: 4 });
  x.open.milestones.push({ id: 'dm0', unitId: ANN, milestoneId: 'm', day: 4, form: 'demand' }, { id: 'dm1', unitId: BEA, milestoneId: 'm', day: 4, form: 'demand' });
  x.open.offers.push({ id: 'do0', unitId: ANN, day: 4, composition: [] }, { id: 'do1', unitId: CAT, day: 4, composition: [] });
  x.open.returnOffer = { id: 'dr0', unitId: ANN, terms: 'lower_band', day: 4 };
  x.knowledge = {
    [BEA]: { [ANN]: { suspicion: 70, level: 'suspects_dynamic' }, [CAT]: { suspicion: 20 } },
    [CAT]: { [ANN]: { suspicion: 100, level: 'knows_dynamic' } },
    [ANN]: { [CAT]: { suspicion: 40 } },
  };
  x.queue = [BEA, ANN, CAT];
  x.override = { unitId: ANN, id: 'o1' } as never;
  return s;
}

describe('forgetDynamic', () => {
  it('forgetDynamic clears every trace', () => {
    const s = world();
    expect(holdsDynamic(s, ANN)).toBe(true);
    const events = forgetDynamic(s, ANN);
    const x = s.dynamic!;
    expect(x.open.claims.map((c) => c.id)).toEqual(['dc1']);
    expect(x.open.milestones.map((c) => c.id)).toEqual(['dm1']);
    expect(x.open.offers.map((c) => c.id)).toEqual(['do1']);
    expect(x.open.returnOffer).toBeUndefined();
    expect(x.knowledge).toEqual({ [BEA]: { [CAT]: { suspicion: 20 } } }); // as holder and as observer; an emptied observer goes
    expect(x.queue).toEqual([BEA, CAT]);
    expect(x.override).toBeUndefined();
    const rel = s.relations[ANN].dynamic!;
    expect(rel.domains).toEqual([]); // her history stays, her domains do not
    expect(rel).toMatchObject({ hold: 55, frame: 'role', milestones: ['first_protocol'], sworn: { day: 6 } });
    expect(rel.aftermath).toBeUndefined();
    expect(rel.probes.pending).toBeUndefined();
    expect(rel.leashBlock).toBeUndefined();
    expect(events).toEqual([{ type: 'aftermath_ended', unitId: ANN, id: 'da0', kind: 'grief', reason: 'gone' }]);
    expect(holdsDynamic(s, ANN)).toBe(false);
    expect(forgetDynamic(s, ANN)).toEqual([]); // twice changes nothing
  });

  it('leaves everyone else alone, and an override that is not hers', () => {
    const s = world();
    s.dynamic!.override = { unitId: BEA, id: 'o2' } as never;
    const before = structuredClone(s);
    forgetDynamic(s, ANN);
    expect(s.dynamic!.override).toEqual({ unitId: BEA, id: 'o2' });
    expect(s.relations[BEA]).toEqual(before.relations[BEA]);
    expect(s.relations[CAT]).toEqual(before.relations[CAT]);
  });

  it('with no dynamic it does nothing', () => {
    const s = campaign(reg, 2);
    const before = structuredClone(s);
    expect(forgetDynamic(s, ANN)).toEqual([]);
    expect(s).toEqual(before);
  });

  it('removeFromService calls it', () => {
    const s = world();
    removeFromService(s, ANN, 'deserted');
    expect(s.dynamic!.queue).toEqual([BEA, CAT]);
    expect(s.dynamic!.open.returnOffer).toBeUndefined();
    expect(s.relations[ANN].dynamic!.domains).toEqual([]);
    expect(s.relations[ANN].dynamic!.aftermath).toBeUndefined();
  });

  it('the dead-unit sweep calls it too, once', () => {
    const s = world();
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    const events = personalDayStep(s, { registries: reg, rng: new Rng(s.rng) });
    expect(events.filter((e) => e.type === 'aftermath_ended')).toEqual([{ type: 'aftermath_ended', unitId: ANN, id: 'da0', kind: 'grief', reason: 'gone' }]);
    expect(s.dynamic!.queue).toEqual([BEA, CAT]);
    expect(s.relations[ANN].dynamic!.domains).toEqual([]);
    expect(personalDayStep(s, { registries: reg, rng: new Rng(s.rng) }).filter((e) => e.type === 'aftermath_ended')).toEqual([]);
  });
});
