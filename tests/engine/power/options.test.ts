import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { demandChance } from '../../../src/engine/discipline/demands';
import { assertiveness, powerOf, votingOn } from '../../../src/engine/power';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, endDay, errors, loadCore } from '../../helpers/loyalty';
import { withOptions } from '../../helpers/power';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const fresh = (): CampaignState => campaign(reg, 4);

describe('reading the P9b world options', () => {
  it('no option stored reads normal and voting off', () => {
    const s = fresh();
    delete s.world.options;
    expect(assertiveness(s, reg)).toEqual({ privilegeMult: 1, demandMult: 1, commanderVoteMult: 1, soldierVoteMult: 1 });
    expect(votingOn(s, reg)).toBe(false);
  });

  it('low and high read their multipliers; high reads commanderVoteMult 0.75', () => {
    expect(assertiveness(withOptions(fresh(), { squad_assertiveness: 'high' }), reg)).toEqual({ privilegeMult: 1.5, demandMult: 1.25, commanderVoteMult: 0.75, soldierVoteMult: 1.25 });
    expect(assertiveness(withOptions(fresh(), { squad_assertiveness: 'low' }), reg)).toEqual({ privilegeMult: 0.75, demandMult: 0.75, commanderVoteMult: 1, soldierVoteMult: 1 });
  });

  it('voting on reads true', () => {
    expect(votingOn(withOptions(fresh(), { voting: 'on' }), reg)).toBe(true);
  });

  it('a pack without the options reads the neutral values', () => {
    const bare: Registries = { ...reg, worldOptions: new Map([...reg.worldOptions].filter(([id]) => id !== 'squad_assertiveness' && id !== 'voting')) };
    const s = fresh();
    expect(assertiveness(s, bare)).toEqual({ privilegeMult: 1, demandMult: 1, commanderVoteMult: 1, soldierVoteMult: 1 });
    expect(votingOn(s, bare)).toBe(false);
  });

  it('demandChance scales by demandMult', () => {
    const normal = withOptions(fresh(), { squad_assertiveness: 'normal' });
    const high = withOptions(fresh(), { squad_assertiveness: 'high' });
    normal.relations.unit_ann.impunityRecord = 20;
    high.relations.unit_ann.impunityRecord = 20;
    const a = demandChance(normal, reg, 'unit_ann');
    const b = demandChance(high, reg, 'unit_ann');
    expect(a).toBeGreaterThan(0);
    expect(b / a).toBeCloseTo(1.25, 5);
  });
});

describe('power state', () => {
  it('powerOf creates the object on the first write and returns the same one after', () => {
    const s = fresh();
    expect(s.power).toBeUndefined();
    const p = powerOf(s);
    expect(p).toEqual({ votes: { log: [], seq: 0 } });
    expect(powerOf(s)).toBe(p);
    expect(s.power).toBe(p);
  });

  it('an old save without power runs a day end', () => {
    const s = fresh();
    s.resources.supplies = 100;
    expect(s.power).toBeUndefined();
    const after = endDay(s, reg);
    expect(after.day).toBe(s.day + 1);
    expect(errors([])).toEqual([]);
  });
});
