import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { syncAllPublicity } from '../../../src/engine/bonds/publicitySync';
import { initiativeChance } from '../../../src/engine/dms';
import { rollNight } from '../../../src/engine/night';
import { claim, courtshipChips, courtshipMult, refuseClaim, rollClaims } from '../../../src/engine/personal/courtship';
import { personalOf } from '../../../src/engine/personal/state';
import { offerProposal } from '../../../src/engine/relations/proposals';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, BEA, CAT, ctxFrom, enable, errors, loadCore, ofType, partner, plain, run, seeded, setRelation, withBond, withOptions } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const DEE = 'unit_dee';
const history = (s: CampaignState, id: string) => s.relations[id].history.filter((h) => h.kind === 'event');

/** Ann is an assertive friend with a `date` open to her (attraction 40, Affinity 40, Trust 40). */
function suitor(over: { lead?: 'balanced' | 'assertive' | 'dominant'; stateId?: string; affinity?: number } = {}): CampaignState {
  const s = partner(plain(reg), ANN, { lead: over.lead ?? 'assertive', stateId: over.stateId ?? 'friend', affinity: over.affinity ?? 40, trust: 40 });
  s.relations[ANN].attraction = 40;
  return s;
}
/** The state with Ann's proposal open (made by her, over the DM channel). */
function proposed(s: CampaignState, kind = 'date'): { s: CampaignState; id: string } {
  const events = offerProposal(s, reg, { unitId: ANN, kind, channel: 'dm' });
  expect(events, 'the proposal must open').toHaveLength(1);
  return { s, id: s.proposals![0].id };
}
const answer = (s: CampaignState, id: string, answer: string, condition?: string) =>
  run(s, reg, { type: 'proposal/answer', payload: { proposalId: id, answer, ...(condition !== undefined ? { condition } : {}) } });

describe('the multiplier', () => {
  it("a courting unit's DM initiative and night chances double; a balanced one's do not", () => {
    const court = partner(plain(reg), ANN, { lead: 'assertive', stateId: 'lover' });
    const plainUnit = plain(reg);
    setRelation(plainUnit, ANN, { stateId: 'lover', affinity: 70, trust: 60 });
    const base = initiativeChance(plainUnit, reg, ANN);
    expect(base).toBeGreaterThan(0);
    expect(courtshipMult(court, reg, ANN)).toBe(TUNING.personal.courtship.initiativeMult);
    expect(initiativeChance(court, reg, ANN)).toBeCloseTo(Math.min(1, base * 2), 10);
    const balanced = partner(plain(reg), ANN, { lead: 'balanced', stateId: 'lover' });
    expect(courtshipMult(balanced, reg, ANN)).toBe(1);
    expect(initiativeChance(balanced, reg, ANN)).toBeCloseTo(base, 10);
    // the night chance: Ann's daily knock (25 %) doubles
    const hits = (s: CampaignState) => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const t = seeded(s, seed);
        rollNight(t, reg, new Rng(t.rng), 'daily');
        if (t.calendar.nightEventsQueue.some((e) => e.unitId === ANN)) n++;
      }
      return n / 400;
    };
    const plainHits = hits(plainUnit);
    const courtHits = hits(court);
    expect(plainHits).toBeGreaterThan(0.12);
    expect(courtHits).toBeGreaterThan(plainHits * 1.6);
    expect(Math.abs(hits(balanced) - plainHits)).toBeLessThan(0.001);
  });

  it('a unit with no imported bond is never a courting unit', () => {
    const s = plain(reg);
    setRelation(s, ANN, { stateId: 'lover', affinity: 90 });
    expect(courtshipMult(s, reg, ANN)).toBe(1);
  });
});

describe('the chips and the condition', () => {
  it('courtshipChips is true only for her own proposal while she passes the gate', () => {
    const { s } = proposed(suitor());
    expect(courtshipChips(s, reg, s.proposals![0])).toBe(true);
    const bal = proposed(suitor({ lead: 'balanced' }));
    expect(courtshipChips(bal.s, reg, bal.s.proposals![0])).toBe(false);
    expect(courtshipChips(s, reg, { ...s.proposals![0], from: 'commander' })).toBe(false);
    expect(courtshipChips(s, reg, { ...s.proposals![0], needsDisclosure: true })).toBe(false);
  });

  it("deflect and accept_condition are refused for a non-courting unit's proposal", () => {
    const { s, id } = proposed(suitor({ lead: 'balanced' }));
    for (const a of ['deflect', 'accept_condition']) {
      const r = answer(s, id, a, 'Only on Fridays.');
      expect(errors(r.events), a).toHaveLength(1);
      expect(r.state).toBe(s);
    }
  });

  it("deflect is refused for the commander's own proposal", () => {
    const s = suitor();
    s.proposals = [{ id: 'q1', unitId: ANN, kind: 'date', from: 'commander', day: s.day, channel: 'dm', targetState: 'flirting', needsDisclosure: false }];
    expect(errors(answer(s, 'q1', 'deflect').events)).toHaveLength(1);
  });

  it('deflect is not_now: no deltas and the proposal closes', () => {
    const { s, id } = proposed(suitor());
    const r = answer(s, id, 'deflect');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.proposals).toEqual([]);
    expect(ofType(r.events, 'proposal_answered')).toEqual([expect.objectContaining({ unitId: ANN, kind: 'date', answer: 'deflect' })]);
    expect(r.state.relations[ANN]).toEqual({ ...s.relations[ANN] });
  });

  it('a condition becomes her open promise and the proposal is accepted', () => {
    const { s, id } = proposed(suitor());
    const r = answer(s, id, 'accept_condition', '  Tell me   before you ride out. ');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].stateId).toBe('flirting');
    const promise = r.state.memory.promises!.at(-1)!;
    expect(promise).toMatchObject({ by: ANN, to: 'commander', text: 'Tell me before you ride out.', status: 'open', knownBy: [ANN] });
    expect(ofType(r.events, 'proposal_conditioned')).toEqual([{ type: 'proposal_conditioned', unitId: ANN, promiseId: promise.id }]);
    expect(r.state.proposals).toEqual([]);
  });

  it('an empty or too long condition throws, changing nothing', () => {
    const { s, id } = proposed(suitor());
    for (const c of ['', '   ', '\u0007\u0008', 'x'.repeat(161), undefined]) {
      const r = answer(s, id, 'accept_condition', c);
      expect(errors(r.events), String(c)).toHaveLength(1);
      expect(r.state).toBe(s);
    }
    expect(errors(answer(s, id, 'accept_condition', 'x'.repeat(160)).events)).toEqual([]);
  });

  it('P3 answers are untouched: accept, decline, not_now', () => {
    for (const a of ['accept', 'decline', 'not_now']) {
      const { s, id } = proposed(suitor());
      expect(errors(answer(s, id, a).events), a).toEqual([]);
    }
  });
});

/** Ann (a dominant romantic partner), Bea (a rival lover), Cat (a close friend), Dee (a comrade, no ingroup) and a bondless lover. */
function crowd(): CampaignState {
  const s = partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 80 });
  partner(s, BEA, { lead: 'balanced', stateId: 'lover', affinity: 80 });
  partner(s, CAT, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
  partner(s, DEE, { lead: 'balanced', stateId: 'comrade', affinity: 10 });
  for (const u of s.squad) u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
  syncAllPublicity(s, reg);
  return s;
}

describe('claimed', () => {
  it('claimed turns the relationship public with cause claimed and records the claim', () => {
    const s = crowd();
    s.relations[ANN].publicity!.level = 'secret';
    const events = claim(s, ctxFrom(s, reg), ANN);
    expect(s.relations[ANN].publicity!.level).toBe('public');
    expect(ofType(events, 'publicity_changed')).toEqual([expect.objectContaining({ unitId: ANN, to: 'public', cause: 'claimed' })]);
    expect(s.personal!.claims).toEqual([{ unitId: ANN, day: s.day }]);
    expect(ofType(events, 'claimed')).toHaveLength(1);
    expect(s.relations[ANN].history.filter((h) => h.kind === 'event')).toEqual(crowd().relations[ANN].history.filter((h) => h.kind === 'event')); // nothing happens to her
  });

  it('rivals in a romantic tier get rival_favoured major; close or ingroup units bond_shown; others nothing', () => {
    const s = crowd();
    s.squad.find((u) => u.id === DEE)!.values.ingroup = 0;
    const eve = 'unit_eve';
    // a bondless lover: no imported profile, no reaction
    s.squad.push({ ...structuredClone(s.squad[0]), id: eve, displayName: 'Eve', status: 'active', bond: undefined });
    s.relations[eve] = structuredClone(s.relations[BEA]);
    const before = structuredClone(s.relations);
    const events = claim(s, ctxFrom(s, reg), ANN);
    const claimed = ofType(events, 'claimed')[0];
    expect(claimed.reactions).toEqual([{ unitId: BEA, kind: 'rival' }, { unitId: CAT, kind: 'respect' }]);
    expect(history(s, BEA).at(-1)).toMatchObject({ type: 'rival_favoured', severity: 'major' });
    expect(history(s, CAT).at(-1)).toMatchObject({ type: 'bond_shown', severity: 'minor' });
    expect(s.relations[BEA].affinity).toBeLessThan(before[BEA].affinity);
    expect(s.relations[CAT].affinity).toBeGreaterThan(before[CAT].affinity);
    // P9d's own public reaction (a flag, and Trust or the record by values) is a separate layer: the quiet ones get no event of P9c
    for (const quiet of [DEE, eve]) {
      expect(s.relations[quiet].history).toEqual(before[quiet].history);
      expect(s.relations[quiet].affinity).toBe(before[quiet].affinity);
    }
  });

  it('a comrade with ingroup 1 respects it too', () => {
    const s = crowd();
    s.squad.find((u) => u.id === DEE)!.values.ingroup = 1;
    const claimed = ofType(claim(s, ctxFrom(s, reg), ANN), 'claimed')[0];
    expect(claimed.reactions).toContainEqual({ unitId: DEE, kind: 'respect' });
  });

  it("a rival's own pressureMult amplifies rival_favoured toward her", () => {
    const plainRival = crowd();
    const heavy = crowd();
    heavy.squad.find((u) => u.id === BEA)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }];
    claim(plainRival, ctxFrom(plainRival, reg), ANN);
    claim(heavy, ctxFrom(heavy, reg), ANN);
    expect(heavy.relations[BEA].affinity).toBeLessThan(plainRival.relations[BEA].affinity);
  });

  it('no claim within 14 days of the last, none for a unit in a concealed affair, none with romance off', () => {
    const base = crowd();
    withOptions(base, { squad_assertiveness: 'high' });
    const claims = (s: CampaignState) => {
      let n = 0;
      for (let seed = 1; seed <= 300; seed++) {
        const t = seeded(s, seed);
        n += ofType(rollClaims(t, ctxFrom(t, reg)), 'claimed').length;
      }
      return n;
    };
    expect(claims(base)).toBeGreaterThan(0);
    const recent = structuredClone(base);
    personalOf(recent).claims = [{ unitId: ANN, day: recent.day - 13 }];
    expect(claims(recent)).toBe(0);
    personalOf(recent).claims = [{ unitId: ANN, day: recent.day - TUNING.personal.claim.cooldownDays }];
    expect(claims(recent)).toBeGreaterThan(0);
    const hidden = structuredClone(base);
    hidden.relations[ANN].affair = { as: 'lover', hiddenFrom: [BEA], since: 1 };
    expect(claims(hidden)).toBe(0);
    const off = structuredClone(base);
    off.settings.intimacy = { romance: false, initiative: 'med' };
    expect(claims(off)).toBe(0);
  });

  it('the roll draws nothing when nobody is eligible, and one draw per eligible unit', () => {
    const none = plain(reg);
    const t = seeded(none, 4);
    expect(rollClaims(t, ctxFrom(t, reg))).toEqual([]);
    expect(t.rng).toEqual(seeded(none, 4).rng);
    const one = seeded(crowd(), 4);
    const rng = new Rng(one.rng);
    rollClaims(one, { registries: reg, rng });
    const ref = new Rng(seedRng(4));
    ref.float();
    expect(rng.state).toEqual(ref.state);
  });

  it('the chance is 0.04 × demandMult × pressureMult', () => {
    const rate = (s: CampaignState) => {
      let n = 0;
      const N = 1500;
      for (let seed = 1; seed <= N; seed++) {
        const t = seeded(s, seed);
        n += ofType(rollClaims(t, ctxFrom(t, reg)), 'claimed').length;
      }
      return n / N;
    };
    const base = rate(crowd());
    expect(base).toBeGreaterThan(0.02);
    expect(base).toBeLessThan(0.07);
    const heavy = crowd();
    heavy.squad.find((u) => u.id === ANN)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }];
    expect(rate(heavy)).toBeGreaterThan(base * 1.2);
  });

  it('the day step rolls claims', () => {
    const s = crowd();
    withOptions(s, { squad_assertiveness: 'high' });
    let found = false;
    for (let seed = 1; seed <= 400 && !found; seed++) {
      const t = seeded(s, seed);
      const r = run(t, reg, { type: 'calendar/consume_slot', payload: { slots: 3, reason: 'expedition' } });
      expect(errors(r.events)).toEqual([]);
      if (ofType(r.events, 'claimed').length > 0) found = true;
    }
    expect(found).toBe(true);
  });
});

describe('refusing publicly', () => {
  const claimed = (cats: string[]): CampaignState => {
    const s = enable(crowd(), ...cats);
    claim(s, ctxFrom(s, reg), ANN);
    return s;
  };
  const refuse = (s: CampaignState) => run(s, reg, { type: 'courtship/refuse_claim', payload: { unitId: ANN } });

  it('refusing publicly needs public_humiliation; it applies rejected_advance major and stress 8', () => {
    const s = claimed(['public_humiliation']);
    const stress = s.squad.find((u) => u.id === ANN)!.stress;
    const r = refuse(s);
    expect(errors(r.events)).toEqual([]);
    expect(history(r.state, ANN).at(-1)).toMatchObject({ type: 'rejected_advance', severity: 'major' });
    expect(r.state.squad.find((u) => u.id === ANN)!.stress).toBeGreaterThanOrEqual(stress + TUNING.personal.claim.refuseStress);
    expect(r.state.relations[ANN].publicity!.level).toBe('public'); // the relationship stays public
    expect(r.state.personal!.claims).toEqual([{ unitId: ANN, day: s.day, refused: true }]);
    expect(ofType(r.events, 'claim_refused')).toEqual([{ type: 'claim_refused', unitId: ANN }]);
    // only once
    expect(errors(refuse(r.state).events)).toHaveLength(1);
  });

  it('is refused with the category off or among her own limits', () => {
    const off = claimed([]);
    const r = refuse(off);
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toBe(off);
    const limit = enable(crowd(), 'public_humiliation');
    withBond(limit, ANN, { leadStyle: 'dominant', ownLimits: { categories: ['public_humiliation'] } });
    claim(limit, ctxFrom(limit, reg), ANN);
    expect(errors(refuse(limit).events)).toHaveLength(1);
  });

  it('needs a claim of today or yesterday', () => {
    const s = claimed(['public_humiliation']);
    s.day += 2;
    expect(errors(refuse(s).events)).toHaveLength(1);
    expect(errors(refuse(plain(reg)).events)).toHaveLength(1);
  });
});
