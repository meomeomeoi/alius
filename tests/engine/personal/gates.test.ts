import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { EVENT_TYPES, ENGINE_EVENT_TYPES } from '../../../src/engine/relations/vocab';
import { pressureGate, pressureMultOf, type PressureMechanic } from '../../../src/engine/personal/gates';
import { forgetPersonal, personalOf } from '../../../src/engine/personal/state';
import { removeFromService } from '../../../src/engine/leash/use';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { withBond } from '../../helpers/bonds';
import { campaign, endDay, loadCore, setRelation, withStance } from '../../helpers/discipline';
import '../../helpers/power';
// Registers the personal day step under test.
import '../../../src/engine/actions/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const MECHANICS: PressureMechanic[] = ['device', 'booking', 'intercept', 'courtship', 'claim', 'token', 'wager'];
const gate = (s: CampaignState, m: PressureMechanic, id = ANN) => pressureGate(s, reg, id, m);

/** Ann has an imported profile with the given lead style, a state and the axes; her defects are cleared. */
function fresh(over: { lead?: 'yielding' | 'balanced' | 'assertive' | 'dominant'; attachment?: 'slow' | 'steady' | 'intense' | 'avoidant'; stateId?: string; affinity?: number } = {}): CampaignState {
  const s = campaign(reg, 4);
  for (const u of s.squad) u.defects = [];
  withBond(s, ANN, { leadStyle: over.lead ?? 'balanced', attachment: over.attachment ?? 'steady' });
  setRelation(s, ANN, { stateId: over.stateId ?? 'lover', affinity: over.affinity ?? 60, trust: 60 });
  return s;
}

describe('who may take part', () => {
  it('a unit without an imported bond passes no gate', () => {
    const s = campaign(reg, 4);
    for (const u of s.squad) u.defects = [];
    setRelation(s, ANN, { stateId: 'lover', affinity: 90, trust: 90 });
    expect(s.squad.find((u) => u.id === ANN)!.bond).toBeUndefined();
    for (const m of MECHANICS) expect(gate(s, m), m).toEqual(expect.any(String));
  });

  it('a grunt passes no gate', () => {
    const s = fresh({ lead: 'dominant', affinity: 90 });
    (s.squad.find((u) => u.id === ANN) as Unit).kind = 'grunt';
    for (const m of MECHANICS) expect(gate(s, m), m).toEqual(expect.any(String));
  });

  it('a unit who is no longer living passes no gate', () => {
    const s = fresh({ lead: 'dominant', affinity: 90 });
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    for (const m of MECHANICS) expect(gate(s, m), m).toEqual(expect.any(String));
  });

  it('the device needs lead rank 1', () => {
    expect(gate(fresh({ lead: 'balanced' }), 'device')).toBeNull();
    expect(gate(fresh({ lead: 'yielding' }), 'device')).toEqual(expect.any(String));
  });

  it('booking needs device access 3', () => {
    expect(gate(fresh({ lead: 'assertive', stateId: 'lover' }), 'booking')).toBeNull();
    expect(gate(fresh({ lead: 'balanced', stateId: 'lover' }), 'booking')).toBe('no device access');
  });

  it('intercept needs device access 4', () => {
    const dominant = fresh({ lead: 'dominant', stateId: 'lover' });
    dominant.content = { enabled: ['jealousy_games'] };
    expect(gate(dominant, 'intercept')).toBeNull();
    expect(gate(fresh({ lead: 'dominant', stateId: 'lover' }), 'intercept')).toEqual(expect.any(String)); // jealousy_games is off
    const assertive = fresh({ lead: 'assertive', stateId: 'lover' });
    assertive.content = { enabled: ['jealousy_games'] };
    expect(gate(assertive, 'intercept')).toBe('no device access');
  });

  it('courtship needs lead rank 2 and romance on', () => {
    expect(gate(fresh({ lead: 'assertive' }), 'courtship')).toBeNull();
    expect(gate(fresh({ lead: 'balanced' }), 'courtship')).toEqual(expect.any(String));
    const off = fresh({ lead: 'assertive' });
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(gate(off, 'courtship')).toEqual(expect.any(String));
    const noRomance = fresh({ lead: 'assertive' });
    noRomance.settings.noRomance = true;
    expect(gate(noRomance, 'courtship')).toEqual(expect.any(String));
  });

  it('courtship needs a romantic tier or a romantic proposal she could make', () => {
    const cold = fresh({ lead: 'assertive', stateId: 'comrade', affinity: 0 });
    setRelation(cold, ANN, { trust: 10 });
    cold.relations[ANN].attraction = 0;
    expect(gate(cold, 'courtship')).toEqual(expect.any(String));
  });

  it('claim also needs the romantic tier and no affair', () => {
    expect(gate(fresh({ lead: 'assertive' }), 'claim')).toBeNull();
    const close = fresh({ lead: 'assertive', stateId: 'confidant' });
    expect(gate(close, 'claim')).toEqual(expect.any(String));
    const hidden = fresh({ lead: 'assertive' });
    hidden.relations[ANN].affair = { as: 'secret_affair', hiddenFrom: [BEA], since: 1 };
    expect(gate(hidden, 'claim')).toEqual(expect.any(String));
    expect(gate(fresh({ lead: 'balanced' }), 'claim')).toEqual(expect.any(String));
  });

  it('token needs a close or romantic tier, no avoidant attachment and Affinity 50', () => {
    expect(gate(fresh({ stateId: 'confidant', affinity: 50 }), 'token')).toBeNull();
    expect(gate(fresh({ stateId: 'lover', affinity: 50 }), 'token')).toBeNull();
    expect(gate(fresh({ stateId: 'confidant', affinity: 49 }), 'token')).toEqual(expect.any(String));
    expect(gate(fresh({ stateId: 'confidant', affinity: 80, attachment: 'avoidant' }), 'token')).toEqual(expect.any(String));
    expect(gate(fresh({ stateId: 'friend', affinity: 80 }), 'token')).toEqual(expect.any(String));
  });

  it('wager needs lead rank 1 and Affinity 20 or Impunity 50', () => {
    const base = (affinity: number, stance: 'disciplined' | 'open_defiance', lead: 'yielding' | 'balanced' = 'balanced') => {
      const s = fresh({ lead, stateId: 'friend', affinity });
      withStance(s, reg, ANN, stance);
      return s;
    };
    expect(gate(base(20, 'disciplined'), 'wager')).toBeNull();
    expect(gate(base(19, 'disciplined'), 'wager')).toEqual(expect.any(String));
    expect(gate(base(0, 'open_defiance'), 'wager')).toBeNull();
    expect(gate(base(60, 'disciplined', 'yielding'), 'wager')).toEqual(expect.any(String));
  });
});

describe('the amplifier', () => {
  it('pressureMult multiplies over defects that carry it and is 1 otherwise', () => {
    const s = fresh();
    expect(pressureMultOf(s, reg, ANN)).toBe(1);
    const unit = s.squad.find((u) => u.id === ANN)!;
    unit.defects = [{ id: 'possessive_protocol', arc: 'manage' }];
    expect(pressureMultOf(s, reg, ANN)).toBe(1.5);
    unit.defects = [{ id: 'possessive_protocol', arc: 'manage' }, { id: 'dominance_drive', arc: 'manage' }];
    expect(pressureMultOf(s, reg, ANN)).toBe(2.25);
    unit.defects = [{ id: 'hunger_loop', arc: 'manage' }];
    expect(pressureMultOf(s, reg, ANN)).toBe(1);
    expect(pressureMultOf(s, reg, 'nobody')).toBe(1);
  });
});

describe('a unit who leaves', () => {
  it('forgetPersonal clears everything she held', () => {
    const s = fresh();
    const day = s.day;
    const p = personalOf(s);
    p.decor = {
      [ANN]: { since: 1, parts: ['sticker', 'wallpaper', 'contact'], contactName: 'a' },
      [BEA]: { since: 1, parts: ['sticker', 'contact'], contactName: 'b' },
    };
    p.bookings = [
      { id: 'b1', unitId: ANN, kindId: 'evening_with_me', day: day + 1, slot: 'evening', status: 'booked', source: 'roll' },
      { id: 'b2', unitId: BEA, kindId: 'evening_with_me', day: day + 1, slot: 'evening', status: 'booked', source: 'roll' },
    ];
    p.noBookUntil = { [ANN]: day + 5, [BEA]: day + 5 };
    p.intercepts = { open: { id: 'i1', unitId: ANN, channel: 'leash', day, status: 'open' }, log: [{ unitId: ANN, day }, { unitId: BEA, day }] };
    p.tokens = {
      owned: [{ id: 't1', giverId: ANN, kindId: 'patch', label: "Ann's patch", worn: true, day: 1 }],
      offer: { id: 'o1', giverId: ANN, kindId: 'patch', label: "Ann's patch", day },
      given: [ANN, BEA],
    };
    p.wagers = {
      open: [
        { id: 'w1', unitId: ANN, by: 'unit', gameId: 'coin', stakeId: 'privilege', day, status: 'offered' },
        { id: 'w2', unitId: BEA, by: 'unit', gameId: 'coin', stakeId: 'privilege', day, status: 'offered' },
      ],
      log: [],
    };
    p.obedience = { unitId: ANN, day, who: 'unit' };
    p.truth = { unitId: ANN, wagerId: 'w1', question: 'q' };
    p.mark = { unitId: ANN, untilDay: day + 3 };
    p.secrets = [
      { id: 's1', kindId: 'k', text: 'alone', knownBy: [ANN], reason: 'self_interest', day, status: 'kept' },
      { id: 's2', kindId: 'k', text: 'shared', knownBy: [ANN, BEA], reason: 'self_interest', day, status: 'kept' },
    ];

    forgetPersonal(s, ANN);

    expect(p.bookings.map((b) => b.id)).toEqual(['b2']);
    expect(p.noBookUntil).toEqual({ [BEA]: day + 5 });
    expect(p.intercepts?.open).toBeUndefined();
    expect(p.tokens?.offer).toBeUndefined();
    expect(p.tokens?.owned.map((t) => t.id)).toEqual(['t1']); // her worn token stays, it does nothing
    expect(p.wagers?.open.map((w) => w.id)).toEqual(['w2']);
    expect(p.obedience).toBeUndefined();
    expect(p.truth).toBeUndefined();
    expect(p.mark).toBeUndefined();
    expect(p.decor?.[ANN].fadedUntil).toBe(day + TUNING.personal.decor.fadeDays);
    expect(p.decor?.[BEA].fadedUntil).toBeUndefined();
    expect(p.secrets?.map((x) => x.id)).toEqual(['s2']);
    expect(p.secrets?.[0].knownBy).toEqual([BEA]);
  });

  it('removeFromService calls forgetPersonal', () => {
    const s = fresh();
    personalOf(s).bookings = [{ id: 'b1', unitId: ANN, kindId: 'evening_with_me', day: s.day + 1, slot: 'evening', status: 'booked', source: 'roll' }];
    removeFromService(s, ANN, 'terminated');
    expect(s.personal!.bookings).toEqual([]);
  });

  it('forgetPersonal on a save without personal state creates nothing', () => {
    const s = fresh();
    forgetPersonal(s, ANN);
    expect(s.personal).toBeUndefined();
  });

  it('the day step forgets a dead unit who still holds a booking', () => {
    const s = fresh();
    personalOf(s).bookings = [{ id: 'b1', unitId: ANN, kindId: 'evening_with_me', day: s.day + 1, slot: 'evening', status: 'booked', source: 'roll' }];
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    const after = endDay(s, reg);
    expect(after.personal?.bookings ?? []).toEqual([]);
  });
});

describe('old saves and squads without imported bonds', () => {
  it('a squad without imported bonds draws nothing and changes nothing over 10 days', () => {
    let s = campaign(reg, 4);
    expect(s.squad.every((u) => u.bond === undefined)).toBe(true);
    for (let i = 0; i < 10; i++) s = endDay(s, reg);
    expect(s.day).toBe(11);
    expect(s.personal).toBeUndefined();
    // captured on the baseline commit fca1105 + docs (bc76b83) with the same script, before any change
    expect(s.rng).toEqual([110228942, 75772926, 1980554629, 1629307246]);
  });
});

describe('vocabulary', () => {
  const SIX = ['overrode_her', 'decor_removed', 'rival_favoured', 'bond_shown', 'token_removed', 'secret_confronted'];
  it('the six new engine event types are not offered to the model and each has an eventDeltas row', () => {
    for (const t of SIX) {
      expect((ENGINE_EVENT_TYPES as readonly string[]).includes(t), t).toBe(true);
      expect((EVENT_TYPES as readonly string[]).includes(t), t).toBe(false);
      const row = reg.eventDeltas.get(t);
      expect(row, t).toBeDefined();
      expect(Object.keys(row!.rows as object).sort()).toEqual(['extreme', 'major', 'minor', 'moderate']);
    }
  });

  it('the rows keep the drafted signs', () => {
    const row = (t: string, sev: string) => (reg.eventDeltas.get(t)!.rows as Record<string, Record<string, number>>)[sev];
    expect(row('overrode_her', 'moderate')).toMatchObject({ trust: -2, affinity: -3, stress: 4 });
    expect(row('decor_removed', 'minor')).toMatchObject({ affinity: -3, stress: 2 });
    expect(row('rival_favoured', 'moderate')).toMatchObject({ affinity: -2, stress: 4 });
    expect(row('bond_shown', 'minor')).toMatchObject({ affinity: 1 });
    expect(row('token_removed', 'moderate')).toMatchObject({ affinity: -4, stress: 3 });
    expect(row('secret_confronted', 'minor')).toMatchObject({ trust: -1, affinity: -2 });
  });
});
