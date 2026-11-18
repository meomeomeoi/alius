import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { flickersOf, hidesInjury, vitalsOf } from '../../src/engine/vitals';
import { addSecret } from '../../src/engine/personal/secrets';
import { personalOf } from '../../src/engine/personal/state';
import type { CampaignState } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore } from '../helpers/world';
import { setRelation, withDefect } from '../helpers/loyalty';
import { withBond } from '../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** Four named units with no defects, day 5, morning, so only what a test sets matters. */
function world(): CampaignState {
  const s = campaign(reg, 4);
  s.day = 5;
  s.slot = 'afternoon';
  for (const u of s.squad) u.defects = [];
  return s;
}
const unit = (s: CampaignState, id = ANN) => s.squad.find((u) => u.id === id)!;
const ledger = (s: CampaignState, key: string, delta: number, action = 'activity/do', at: { day?: number; slot?: CampaignState['slot'] } = {}) => {
  (s.ledger ??= []).push({ day: at.day ?? s.day, slot: at.slot ?? s.slot, action, key, delta });
};

describe('vitalsOf patterns', () => {
  it('steady at low stress', () => {
    const s = world();
    unit(s).stress = 10;
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ unitId: ANN, pattern: 'steady', heart: 'resting', temp: 'normal', spikes: [], flicker: false });
  });

  it('elevated when stress band is strained (its floor), not just below it', () => {
    const s = world();
    unit(s).stress = 49;
    expect(vitalsOf(s, reg, ANN)!.pattern).toBe('steady');
    unit(s).stress = 50;
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'elevated', heart: 'raised' });
  });

  it('erratic in a breakdown and at the breaking band, racing heart', () => {
    const s = world();
    unit(s).breakdown = { defectId: 'echo_bleed', day: s.day };
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'erratic', heart: 'racing' });
    const t = world();
    unit(t).stress = 80;
    expect(vitalsOf(t, reg, ANN)).toMatchObject({ pattern: 'erratic', heart: 'racing' });
  });
});

describe('spike causes', () => {
  it('combat spike from a combat/ or expedition/ ledger entry today, none from an activity or an older day', () => {
    const s = world();
    ledger(s, `stress:${ANN}`, 4, 'activity/do');
    expect(vitalsOf(s, reg, ANN)!.spikes).toEqual([]);
    ledger(s, `stress:${ANN}`, 6, 'combat/act', { day: s.day - 1 });
    expect(vitalsOf(s, reg, ANN)!.spikes).toEqual([]);
    ledger(s, `stress:${ANN}`, 6, 'combat/act');
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'spiking', spikes: ['combat'], heart: 'racing' });
    const t = world();
    ledger(t, `stress:${BEA}`, 3, 'expedition/choose');
    expect(vitalsOf(t, reg, BEA)!.spikes).toEqual(['combat']);
  });

  it('conflict spike from a trust drop of 3 this slot, not of 2, not in another slot', () => {
    const s = world();
    ledger(s, `axis:${ANN}:trust`, -2);
    expect(vitalsOf(s, reg, ANN)!.spikes).toEqual([]);
    ledger(s, `axis:${ANN}:trust`, -3, 'scene/exchange', { slot: 'morning' });
    expect(vitalsOf(s, reg, ANN)!.spikes).toEqual([]);
    ledger(s, `axis:${ANN}:affinity`, -TUNING.vitals.conflictDelta, 'scene/exchange');
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'spiking', spikes: ['conflict'] });
  });

  it('commander_near while she is in the open scene', () => {
    const s = world();
    s.scene = { id: 'sc1', locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'activity' } as unknown as CampaignState['scene'];
    expect(vitalsOf(s, reg, ANN)!.spikes).toEqual(['commander_near']);
    expect(vitalsOf(s, reg, BEA)!.spikes).toEqual([]);
  });

  it('want spike only from aching (70), not restless', () => {
    const s = world();
    withBond(s, ANN, { desire: 'high', attachment: 'steady' });
    setRelation(s, ANN, { stateId: 'lover' });
    s.relations[ANN].want = 69;
    expect(vitalsOf(s, reg, ANN)!.spikes).toEqual([]);
    s.relations[ANN].want = 70;
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'spiking', spikes: ['want'], temp: 'warm' });
  });

  it('warm while spiking with the commander near; fever only while injured', () => {
    const s = world();
    s.scene = { id: 'sc1', locationId: 'quarters_commander', participants: [ANN], mode: 'private', origin: 'activity' } as unknown as CampaignState['scene'];
    expect(vitalsOf(s, reg, ANN)!.temp).toBe('warm');
    unit(s).injuryDays = 2;
    expect(vitalsOf(s, reg, ANN)!.temp).toBe('fever');
  });
});

describe('the affect dampener', () => {
  it('is flat with its spikes still listed, and a flat unit stays low and cool', () => {
    const s = world();
    withDefect(s, ANN, 'affect_dampener');
    ledger(s, `stress:${ANN}`, 5, 'combat/act');
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'flat', heart: 'low', temp: 'cool', spikes: ['combat'] });
  });

  it('a flicker from an affinity gain of 3 in the previous slot is logged by flickersOf; an attraction gain too; 2 is not', () => {
    const s = world();
    withDefect(s, ANN, 'affect_dampener');
    ledger(s, `axis:${ANN}:affinity`, 2, 'scene/exchange', { slot: 'morning' });
    expect(vitalsOf(s, reg, ANN)!.flicker).toBe(false);
    ledger(s, `axis:${ANN}:affinity`, TUNING.vitals.flickerDelta, 'scene/exchange', { slot: 'morning' });
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'flat', flicker: true });
    ledger(s, `axis:${ANN}:attraction`, 3, 'scene/exchange', { day: 4, slot: 'evening' });
    expect(flickersOf(s, ANN)).toEqual([{ day: 5, slot: 'morning' }, { day: 4, slot: 'evening' }]);
  });

  it('a flicker older than the previous slot is logged but not live; the log is capped at 5, one per slot, newest first', () => {
    const s = world();
    withDefect(s, ANN, 'affect_dampener');
    s.day = 8;
    s.slot = 'evening';
    for (let d = 2; d <= 7; d++) ledger(s, `axis:${ANN}:affinity`, 4, 'scene/exchange', { day: d, slot: 'morning' });
    ledger(s, `axis:${ANN}:attraction`, 4, 'scene/exchange', { day: 7, slot: 'morning' }); // same slot: one moment
    expect(vitalsOf(s, reg, ANN)!.flicker).toBe(false);
    const log = flickersOf(s, ANN);
    expect(log).toHaveLength(TUNING.vitals.flickerLog);
    expect(log[0]).toEqual({ day: 7, slot: 'morning' });
    expect(log.at(-1)).toEqual({ day: 3, slot: 'morning' });
  });

  it('a flicker never moves a unit without the dampener', () => {
    const s = world();
    ledger(s, `axis:${ANN}:affinity`, 5, 'scene/exchange');
    expect(vitalsOf(s, reg, ANN)).toMatchObject({ pattern: 'steady', flicker: false });
  });
});

describe('hidden injury', () => {
  function injured(): CampaignState {
    const s = world();
    unit(s).injuryDays = 3;
    return s;
  }

  it('shows no fever while a kept hidden_injury secret names her; without the secret, fever', () => {
    const s = injured();
    expect(vitalsOf(s, reg, ANN)!.temp).toBe('fever');
    addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [BEA, ANN], subjectId: ANN, vars: { name: 'Ann' } });
    expect(personalOf(s).secrets).toHaveLength(1);
    expect(hidesInjury(s, reg, ANN)).toBe(true);
    expect(hidesInjury(s, reg, BEA)).toBe(false);
    expect(vitalsOf(s, reg, ANN)!.temp).toBe('normal');
  });

  it('an erratic pattern is never caused by a hidden injury either (injury is not a pattern cause at all)', () => {
    const s = injured();
    addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [BEA, ANN], subjectId: ANN });
    expect(vitalsOf(s, reg, ANN)!.pattern).toBe('steady');
  });

  it('a secret that was found or answered no longer hides it', () => {
    const s = injured();
    addSecret(s, reg, { kindId: 'hidden_injury', knownBy: [BEA, ANN], subjectId: ANN });
    personalOf(s).secrets![0].status = 'found';
    expect(vitalsOf(s, reg, ANN)!.temp).toBe('fever');
  });
});

describe('who gets vitals, and purity', () => {
  it('grunt, dead, deserted and absent units give null', () => {
    const s = world();
    expect(vitalsOf(s, reg, 'nobody')).toBeNull();
    unit(s, BEA).status = 'dead';
    expect(vitalsOf(s, reg, BEA)).toBeNull();
    const g = campaign(reg, 4);
    g.squad[0].kind = 'grunt';
    expect(vitalsOf(g, reg, g.squad[0].id)).toBeNull();
  });

  it('draws no rng and does not touch the state', () => {
    const s = world();
    ledger(s, `stress:${ANN}`, 5, 'combat/act');
    withBond(s, ANN, { desire: 'high', attachment: 'steady' });
    const before = structuredClone(s);
    vitalsOf(s, reg, ANN);
    flickersOf(s, ANN);
    hidesInjury(s, reg, ANN);
    expect(s.rng).toEqual(before.rng);
    expect(s).toEqual(before);
  });
});
