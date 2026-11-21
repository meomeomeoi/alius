import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { rollRules } from '../../../src/engine/bonds/rules';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { whereabouts } from '../../../src/engine/hub';
import { deviceAccess } from '../../../src/engine/personal/access';
import { consentProblem, rollBookings } from '../../../src/engine/personal/bookings';
import { personalOf } from '../../../src/engine/personal/state';
import { computeHierarchy, standingOf } from '../../../src/engine/power/standing';
import { Rng } from '../../../src/engine/rng';
import type { Booking, CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, atImpunity, BEA, ctxFrom, enable, loadCore, ofType, partner, plain, seeded, withBond } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Domain = 'private_time' | 'body' | 'device' | 'household' | 'others' | 'command';
const practice = (primary: ProfileStyle) => ({
  categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const,
  fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const,
});

/** Turns the dynamic on and gives a unit a holder's block with some domains. */
function holder(s: CampaignState, id: string, domains: Domain[], opts: { frame?: Frame; hold?: number; style?: ProfileStyle } = {}): CampaignState {
  s.dynamic ??= newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'restraint'])] };
  s.relations[id].dynamic = { ...blankDynamic(s.day), frame: opts.frame ?? 'role', hold: opts.hold ?? 70, domains: domains.map((d) => ({ id: d, since: 1 })) };
  if (s.squad.find((u) => u.id === id)!.bond === undefined) withBond(s, id, {});
  const unit = s.squad.find((u) => u.id === id)!;
  unit.bond = { ...unit.bond!, practice: practice(opts.style ?? 'cold') };
  return s;
}
/** Ann: an assertive lover (device level 3), Affinity 90, Want 50, Impunity 55. */
const eager = (): CampaignState => atImpunity(partner(plain(reg), ANN, { lead: 'assertive', stateId: 'lover', affinity: 90, want: 50 }), reg, ANN, 55);
const bk = (id: string, unitId: string, over: Partial<Booking> = {}): Booking => ({ id, unitId, kindId: 'evening_with_me', day: 5, slot: 'evening', status: 'booked', source: 'roll', made: 4, ...over });
/** A rng that always books, and the first kind. */
const sure = (s: CampaignState) => ({ registries: reg, rng: { chance: () => true, int: (min: number) => min, float: () => 0 } as unknown as Rng, state: s });

describe('bookings', () => {
  it('a holder with booking_uncapped books a third time in a week', () => {
    const s = eager();
    personalOf(s).bookings = [bk('b1', ANN, { status: 'played', made: s.day - 3 }), bk('b2', ANN, { status: 'cancelled', made: s.day - 1 })];
    // two this week: capped (and no draw) without the domain
    const capped = seeded(s, 1);
    expect(ofType(rollBookings(capped, sure(capped)), 'booking_made')).toEqual([]);
    holder(s, ANN, ['private_time']);
    const free = seeded(s, 1);
    expect(ofType(rollBookings(free, sure(free)), 'booking_made')).toHaveLength(1);
    // losing the domain puts the cap back
    dynamicOf(s, ANN)!.domains = [];
    const back = seeded(s, 1);
    expect(ofType(rollBookings(back, sure(back)), 'booking_made')).toEqual([]);
  });

  it('book_ahead books day + 2 (the offset is a hash of 1 to 3 days; without it always tomorrow)', () => {
    const offsets = new Set<number>();
    for (let salt = 1; salt <= 60; salt++) {
      const s = holder(eager(), ANN, ['private_time']);
      s.dynamic!.salt = salt;
      const made = ofType(rollBookings(s, sure(s)), 'booking_made')[0];
      offsets.add(Number(made.day) - s.day);
    }
    expect([...offsets].sort()).toEqual([1, 2, 3]);
    expect(TUNING.dynamic.bookAhead).toBe(3);
    const plainCase = eager();
    const made = ofType(rollBookings(plainCase, sure(plainCase)), 'booking_made')[0];
    expect(Number(made.day) - plainCase.day).toBe(1);
    // a hash, not a draw: the same state books the same day
    const a = holder(eager(), ANN, ['private_time']);
    const b = structuredClone(a);
    expect(ofType(rollBookings(a, sure(a)), 'booking_made')[0].day).toBe(ofType(rollBookings(b, sure(b)), 'booking_made')[0].day);
  });

  it('possessive booking_consent refuses another holder\'s booking with a fact for both; cold grants it', () => {
    const world = (style: ProfileStyle): CampaignState => {
      const s = atImpunity(partner(plain(reg), BEA, { lead: 'assertive', stateId: 'lover', affinity: 90, want: 50 }), reg, BEA, 55);
      withBond(s, ANN, { leadStyle: 'yielding' }); // Ann does not book herself
      holder(s, ANN, ['others'], { style });
      holder(s, BEA, [], { frame: 'play', hold: 45 });
      return s;
    };
    const refused = world('possessive');
    expect(consentProblem(refused, reg, { unitId: BEA })).toEqual(expect.any(String));
    expect(consentProblem(refused, reg, { unitId: ANN })).toBeNull();
    const events = rollBookings(refused, sure(refused));
    expect(ofType(events, 'booking_made')).toEqual([]);
    expect(refused.personal?.bookings ?? []).toEqual([]);
    const fact = refused.memory.facts.find((f) => f.tags.includes('booking_consent'));
    expect(fact).toBeDefined();
    expect(fact!.about).toEqual(expect.arrayContaining([ANN, BEA]));
    expect(fact!.knownBy).toEqual(expect.arrayContaining([ANN, BEA]));
    expect(fact!.text).not.toMatch(/\b(he|she|his|hers?|him)\b/i);
    const granted = world('cold');
    expect(consentProblem(granted, reg, { unitId: BEA })).toBeNull();
    expect(ofType(rollBookings(granted, sure(granted)), 'booking_made')).toHaveLength(1);
    // obsessive refuses as well; a booker who is no holder is not held
    const obsessive = world('obsessive');
    expect(consentProblem(obsessive, reg, { unitId: BEA })).toEqual(expect.any(String));
    dynamicOf(obsessive, BEA)!.frame = 'equal';
    expect(consentProblem(obsessive, reg, { unitId: BEA })).toBeNull();
  });
});

describe('device, hub, rules and standing', () => {
  it('deviceAccess is 4 for a device_floor holder whose rules give 2, and back to 2 when she loses the domain', () => {
    const s = atImpunity(partner(plain(reg), ANN, { lead: 'balanced', stateId: 'lover', affinity: 95, want: 90 }), reg, ANN, 55);
    expect(deviceAccess(s, reg, ANN)).toBe(2);
    holder(s, ANN, ['device']);
    expect(deviceAccess(s, reg, ANN)).toBe(4);
    dynamicOf(s, ANN)!.domains = [];
    expect(deviceAccess(s, reg, ANN)).toBe(2);
    // the gate is still needed: no imported bond, no access
    const bare = plain(reg);
    holder(bare, ANN, ['device']);
    bare.squad.find((u) => u.id === ANN)!.bond = undefined;
    expect(deviceAccess(bare, reg, ANN)).toBe(0);
  });

  it('the hub places the commander in her quarters on her booked evening (and nowhere new without the capability)', () => {
    const s = partner(plain(reg), ANN, { lead: 'assertive', stateId: 'lover', affinity: 90 });
    s.day = 5;
    s.slot = 'evening';
    personalOf(s).bookings = [bk('b1', ANN, { kindId: 'roof_walk', day: 5 })];
    const room = (st: CampaignState) => whereabouts(st, reg).find((w) => w.unitId === ANN)!.roomId!;
    const at = (id: string) => String(reg.locations.get(String(reg.hubRooms.get(id)!.sceneLocationId))?.id);
    const roofRoom = room(s);
    expect(at(roofRoom)).toBe('roof');
    holder(s, ANN, ['household']);
    const second = room(s);
    expect(reg.locations.get(String(reg.hubRooms.get(second)!.sceneLocationId))?.perUnit).toBe(true);
    // no booking, no change; another unit's slot is unchanged
    const idle = structuredClone(s);
    personalOf(idle).bookings = [];
    expect(whereabouts(idle, reg).find((w) => w.unitId === ANN)).toEqual(whereabouts({ ...idle, dynamic: undefined }, reg).find((w) => w.unitId === ANN));
    // an afternoon booking is not an evening: the place does not move
    const afternoon = structuredClone(s);
    afternoon.slot = 'afternoon';
    personalOf(afternoon).bookings = [bk('b2', ANN, { kindId: 'train_together', day: 5, slot: 'afternoon' })];
    expect(at(room(afternoon))).toBe('training_yard');
  });

  it('relation_rules unlocks jealousy_games templates for her only', () => {
    const offered = (build: () => CampaignState): Set<string> => {
      const seen = new Set<string>();
      for (let f = 0; f < 1; f += 0.05) { // the roll always hits; the weighted pick sweeps the whole pool
        const d = build();
        rollRules(d, { registries: reg, rng: { chance: () => true, float: () => f } as unknown as Rng });
        for (const r of d.bonds?.rules ?? []) seen.add(r.templateId);
      }
      return seen;
    };
    const base = (id: string): CampaignState => {
      const s = enable(partner(plain(reg), id, { lead: 'dominant', stateId: 'lover' }), 'jealousy_games', 'restraint');
      return s;
    };
    const off = offered(() => base(ANN)); // the dynamic is off: the pool is P9d's
    expect(off.has('no_other_tokens')).toBe(true);
    const noBlock = offered(() => { const s = base(ANN); s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} }); s.content = { enabled: ['jealousy_games', 'restraint'] }; return s; });
    expect(noBlock.has('no_other_tokens')).toBe(true); // the dynamic is on but she is no holder: P9d's pool
    const without = offered(() => holder(base(ANN), ANN, ['private_time'])); // a holder without the say over the commander's other relations
    expect(without.has('no_other_tokens')).toBe(false);
    expect(without.has('report_evening')).toBe(true);
    const withDomain = offered(() => holder(base(ANN), ANN, ['others']));
    expect(withDomain.has('no_other_tokens')).toBe(true);
    // Bea holds the domain, Ann does not: Ann still gets none
    const other = offered(() => { const s = holder(base(ANN), ANN, ['private_time']); return holder(s, BEA, ['others']); });
    expect(other.has('no_other_tokens')).toBe(false);
  });

  it('co_leader adds 15 standing and marks coLeaderId', () => {
    const s = atImpunity(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'comrade' }), reg, ANN, 50);
    const before = standingOf(s, reg, ANN)!;
    holder(s, ANN, ['command']);
    expect(TUNING.dynamic.coLeaderStanding).toBe(15);
    expect(standingOf(s, reg, ANN)).toBe(before + 15);
    computeHierarchy(s, reg);
    expect(s.power!.hierarchy!.coLeaderId).toBe(ANN);
    dynamicOf(s, ANN)!.domains = [];
    expect(standingOf(s, reg, ANN)).toBe(before);
    computeHierarchy(s, reg);
    expect(s.power!.hierarchy!.coLeaderId).toBeUndefined();
  });
});

describe('with no domain', () => {
  it('every reader is unchanged: a holder without a domain moves nothing (the rule pool aside: see the rules test)', () => {
    const base = eager();
    enable(base, 'restraint', 'jealousy_games');
    base.day = 5;
    base.slot = 'evening';
    personalOf(base).bookings = [bk('b1', ANN, { kindId: 'roof_walk', day: 5 })];
    const on = structuredClone(base);
    on.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
    on.relations[ANN].dynamic = { ...blankDynamic(on.day), frame: 'role', hold: 70 };
    expect(whereabouts(on, reg)).toEqual(whereabouts(base, reg));
    expect(deviceAccess(on, reg, ANN)).toBe(deviceAccess(base, reg, ANN));
    expect(standingOf(on, reg, ANN)).toBe(standingOf(base, reg, ANN));
    for (let seed = 1; seed <= 12; seed++) {
      const a = seeded(base, seed);
      const b = seeded(on, seed);
      expect(rollBookings(b, ctxFrom(b, reg))).toEqual(rollBookings(a, ctxFrom(a, reg)));
      expect(b.rng).toEqual(a.rng);
    }
  });
});
