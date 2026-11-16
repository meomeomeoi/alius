import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { rollRules } from '../../../src/engine/bonds';
import { personalDayStep } from '../../../src/engine/personal/dayStep';
import { rollTokenOffer, tokenLine, wornTokens } from '../../../src/engine/personal/tokens';
import { personalOf } from '../../../src/engine/personal/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState, Token } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ANN, BEA, CAT, ctxFrom, enable, errors, loadCore, ofType, partner, plain, run, seeded, withOptions } from '../../helpers/personal';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const history = (s: CampaignState, id: string) => s.relations[id].history.filter((h) => h.kind === 'event');
const tok = (id: string, giverId: string, over: Partial<Token> = {}): Token => ({ id, giverId, kindId: 'patch', label: `${giverId}'s patch`, day: 1, worn: false, ...over });

/** Ann is a close friend with Affinity 60: she passes the token gate. */
function giver(over: { affinity?: number; stateId?: string; attachment?: 'slow' | 'steady' | 'intense' | 'avoidant' } = {}): CampaignState {
  return partner(plain(reg), ANN, { lead: 'balanced', stateId: over.stateId ?? 'confidant', affinity: over.affinity ?? 60, attachment: over.attachment });
}
const offerRoll = (s: CampaignState, seed: number) => {
  const t = seeded(s, seed);
  return { t, events: rollTokenOffer(t, ctxFrom(t, reg)) };
};
function offering(s = giver()) {
  for (let seed = 1; seed <= 600; seed++) {
    const r = offerRoll(s, seed);
    if (ofType(r.events, 'token_offered').length > 0) return r.t;
  }
  throw new Error('no seed offered');
}
const answer = (s: CampaignState, accept: boolean) => run(s, reg, { type: 'token/answer', payload: { offerId: s.personal!.tokens!.offer!.id, accept } });
const wear = (s: CampaignState, id: string) => run(s, reg, { type: 'token/wear', payload: { tokenId: id } });
const remove = (s: CampaignState, id: string) => run(s, reg, { type: 'token/remove', payload: { tokenId: id } });
/** A state holding tokens of the given givers, none worn. */
function holding(s: CampaignState, ...tokens: Token[]): CampaignState {
  personalOf(s).tokens = { owned: tokens, given: tokens.map((t) => t.giverId) };
  return s;
}

describe('the offer', () => {
  it('an eligible unit offers once, ever; a second offer never comes', () => {
    const s = offering();
    const offer = s.personal!.tokens!.offer!;
    expect(offer).toMatchObject({ giverId: ANN, day: s.day });
    expect(offer.label).toContain('Ann');
    expect(s.personal!.tokens!.given).toEqual([ANN]);
    expect(s.dms[ANN].at(-1)).toMatchObject({ from: ANN, read: false, initiated: true, id: offer.dmId });
    // answered: she never offers again, whatever the seed
    const closed = answer(s, false).state;
    for (let seed = 1; seed <= 300; seed++) expect(ofType(offerRoll(closed, seed).events, 'token_offered')).toEqual([]);
  });

  it('draws nothing while an offer is open or nobody is eligible', () => {
    const open = offering();
    const r = offerRoll(open, 3);
    expect(r.events).toEqual([]);
    expect(r.t.rng).toEqual(seeded(open, 3).rng);
    const none = plain(reg);
    const q = offerRoll(none, 3);
    expect(q.t.rng).toEqual(seeded(none, 3).rng);
  });

  it('a unit without the token gate never offers (acceptance 7)', () => {
    const nobond = plain(reg);
    nobond.relations[ANN] = { ...nobond.relations[ANN], stateId: 'confidant', affinity: 90 };
    for (const s of [nobond, giver({ affinity: 49 }), giver({ stateId: 'friend' }), giver({ attachment: 'avoidant' })]) {
      for (let seed = 1; seed <= 100; seed++) {
        const r = offerRoll(s, seed);
        expect(r.events).toEqual([]);
        expect(r.t.rng).toEqual(seeded(s, seed).rng);
      }
    }
  });

  it('the kind is picked by weight among those her tier allows; a romantic-only kind needs the romantic tier', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 1500; seed++) {
      const r = offerRoll(giver({ stateId: 'confidant' }), seed);
      for (const e of ofType(r.events, 'token_offered')) kinds.add(String(e.kindId));
    }
    const romanticOnly = [...reg.tokenKinds.values()].filter((k) => k.minTier === 'romantic').map((k) => String(k.id));
    expect(romanticOnly.length).toBeGreaterThan(0);
    expect(kinds.size).toBeGreaterThan(1);
    for (const id of romanticOnly) expect(kinds.has(id)).toBe(false);
    const lover = new Set<string>();
    for (let seed = 1; seed <= 3000; seed++) {
      for (const e of ofType(offerRoll(giver({ stateId: 'lover' }), seed).events, 'token_offered')) lover.add(String(e.kindId));
    }
    for (const id of romanticOnly) expect(lover.has(id)).toBe(true);
  });

  it('the chance is 0.03 × demandMult × pressureMult', () => {
    const rate = (s: CampaignState) => {
      let n = 0;
      const N = 3000;
      for (let seed = 1; seed <= N; seed++) n += ofType(offerRoll(s, seed).events, 'token_offered').length;
      return n / N;
    };
    const base = rate(giver());
    expect(base).toBeGreaterThan(TUNING.personal.token.chance * 0.6);
    expect(base).toBeLessThan(TUNING.personal.token.chance * 1.5);
    expect(rate(withOptions(giver(), { squad_assertiveness: 'high' }))).toBeGreaterThan(base * 1.2);
  });

  it('accept stores it unworn; decline applies rejected_advance minor', () => {
    const s = offering();
    const kept = answer(s, true);
    expect(errors(kept.events)).toEqual([]);
    expect(kept.state.personal!.tokens!.owned).toEqual([expect.objectContaining({ giverId: ANN, worn: false, kindId: s.personal!.tokens!.offer!.kindId, label: s.personal!.tokens!.offer!.label })]);
    expect(kept.state.personal!.tokens!.offer).toBeUndefined();
    expect(ofType(kept.events, 'token_accepted')).toHaveLength(1);
    const declined = answer(s, false);
    expect(declined.state.personal!.tokens!.owned).toEqual([]);
    expect(history(declined.state, ANN).at(-1)).toMatchObject({ type: 'rejected_advance', severity: 'minor' });
    expect(ofType(declined.events, 'token_declined')).toHaveLength(1);
  });

  it('an offer expires after 3 days as declined', () => {
    const s = offering();
    const early = structuredClone(s);
    early.day += TUNING.personal.token.offerDays - 1;
    expect(personalDayStep(early, ctxFrom(early, reg)).filter((e) => e.type === 'token_declined')).toEqual([]);
    expect(early.personal!.tokens!.offer).toBeDefined();
    const late = structuredClone(s);
    late.day += TUNING.personal.token.offerDays;
    const events = personalDayStep(late, ctxFrom(late, reg));
    expect(ofType(events, 'token_declined')).toEqual([expect.objectContaining({ expired: true })]);
    expect(late.personal!.tokens!.offer).toBeUndefined();
    expect(history(late, ANN).at(-1)).toMatchObject({ type: 'rejected_advance', severity: 'minor' });
  });

  it('answering an offer that is not there throws', () => {
    const s = holding(giver(), tok('t1', ANN));
    expect(errors(run(s, reg, { type: 'token/answer', payload: { offerId: 'nope', accept: true } }).events)).toHaveLength(1);
  });
});

describe('wearing', () => {
  function crowd(): CampaignState {
    const s = giver();
    partner(s, BEA, { lead: 'balanced', stateId: 'lover', affinity: 80 });
    partner(s, CAT, { lead: 'balanced', stateId: 'confidant', affinity: 60 });
    for (const u of s.squad) u.values = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
    return holding(s, tok('t1', ANN), tok('t2', BEA), tok('t3', CAT));
  }

  it('at most two worn; a third wear throws', () => {
    const s = crowd();
    const two = wear(wear(s, 't1').state, 't2').state;
    expect(wornTokens(two).map((t) => t.id)).toEqual(['t1', 't2']);
    const third = wear(two, 't3');
    expect(errors(third.events)[0]).toMatchObject({ message: expect.stringContaining('two') });
    expect(third.state).toBe(two);
    expect(errors(wear(two, 't1').events)).toHaveLength(1); // already worn
    expect(errors(wear(s, 'nope').events)).toHaveLength(1);
  });

  it('wearing makes rivals rival_favoured and others bond_shown', () => {
    const s = crowd();
    const before = structuredClone(s.relations);
    const r = wear(s, 't1');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'token_worn')).toEqual([{ type: 'token_worn', tokenId: 't1', giverId: ANN, reactions: [{ unitId: BEA, kind: 'rival' }, { unitId: CAT, kind: 'respect' }] }]);
    expect(history(r.state, BEA).at(-1)).toMatchObject({ type: 'rival_favoured', severity: 'moderate' });
    expect(history(r.state, CAT).at(-1)).toMatchObject({ type: 'bond_shown', severity: 'minor' });
    expect(r.state.relations[BEA].affinity).toBeLessThan(before[BEA].affinity);
    expect(history(r.state, ANN)).toEqual(before[ANN].history.filter((h) => h.kind === 'event')); // nothing happens to the giver
  });

  it('a token whose giver is gone can be worn and does nothing', () => {
    const s = crowd();
    s.squad.find((u) => u.id === ANN)!.status = 'terminated';
    const before = structuredClone(s.relations);
    const r = wear(s, 't1');
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'token_worn')[0].reactions).toEqual([]);
    expect(r.state.relations[BEA]).toEqual(before[BEA]);
  });

  it('the scene line names what is worn', () => {
    const s = crowd();
    expect(tokenLine(s)).toBeNull();
    const one = wear(s, 't1').state;
    expect(tokenLine(one)).toBe(`The commander wears ${one.personal!.tokens!.owned[0].label}.`);
    const two = wear(one, 't2').state;
    expect(tokenLine(two)).toBe(`The commander wears ${two.personal!.tokens!.owned[0].label} and ${two.personal!.tokens!.owned[1].label}.`);
  });
});

describe('while worn', () => {
  it('the giver gains Affinity 1 a day through the gain handler', () => {
    const s = wear(holding(giver(), tok('t1', ANN)), 't1').state;
    const before = s.relations[ANN].affinity;
    const t = structuredClone(s);
    personalDayStep(t, ctxFrom(t, reg));
    expect(t.relations[ANN].affinity).toBe(before + TUNING.personal.token.giverAffinityPerDay);
    // a token that is not worn gives nothing; two tokens of one giver still give one
    const idle = holding(giver(), tok('t1', ANN));
    personalDayStep(idle, ctxFrom(idle, reg));
    expect(idle.relations[ANN].affinity).toBe(before);
    const two = holding(giver(), tok('t1', ANN, { worn: true }), tok('t2', ANN, { worn: true }));
    personalDayStep(two, ctxFrom(two, reg));
    expect(two.relations[ANN].affinity).toBe(before + 1);
  });

  it('a giver who is gone gives nothing', () => {
    const s = holding(giver(), tok('t1', ANN, { worn: true }));
    s.squad.find((u) => u.id === ANN)!.status = 'dead';
    const before = s.relations[ANN].affinity;
    personalDayStep(s, ctxFrom(s, reg));
    expect(s.relations[ANN].affinity).toBe(before);
  });
});

describe('taking it off', () => {
  it('applies token_removed to the giver, ×1.5 for a pressureMult defect', () => {
    const base = holding(giver(), tok('t1', ANN, { worn: true }));
    const heavy = structuredClone(base);
    heavy.squad.find((u) => u.id === ANN)!.defects = [{ id: 'possessive_protocol', arc: 'manage' }];
    const a = remove(base, 't1');
    expect(errors(a.events)).toEqual([]);
    expect(history(a.state, ANN).at(-1)).toMatchObject({ type: 'token_removed', severity: 'moderate' });
    expect(a.state.personal!.tokens!.owned[0]).toMatchObject({ worn: false, removedDay: base.day });
    expect(ofType(a.events, 'token_taken_off')).toEqual([{ type: 'token_taken_off', tokenId: 't1', giverId: ANN }]);
    const b = remove(heavy, 't1');
    const lossA = base.relations[ANN].affinity - a.state.relations[ANN].affinity;
    const lossB = heavy.relations[ANN].affinity - b.state.relations[ANN].affinity;
    expect(lossA).toBeGreaterThan(0);
    expect(lossB).toBeGreaterThan(lossA);
  });

  it('a locked token removed early also breaks a promise', () => {
    const s = holding(giver(), tok('t1', ANN, { worn: true, lockedUntil: giver().day + 5 }));
    const r = remove(s, 't1');
    const types = history(r.state, ANN).slice(-2).map((h) => h.type);
    expect(types).toContain('broke_promise');
    expect(types).toContain('token_removed');
    const free = remove(holding(giver(), tok('t1', ANN, { worn: true, lockedUntil: s.day })), 't1');
    expect(history(free.state, ANN).map((h) => h.type)).not.toContain('broke_promise');
  });

  it('only a worn token can be taken off; a giver who is gone takes no offence', () => {
    const s = holding(giver(), tok('t1', ANN));
    expect(errors(remove(s, 't1').events)).toHaveLength(1);
    const gone = holding(giver(), tok('t1', ANN, { worn: true }));
    gone.squad.find((u) => u.id === ANN)!.status = 'terminated';
    const before = structuredClone(gone.relations[ANN]);
    const r = remove(gone, 't1');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN]).toEqual(before);
  });
});

describe('the rule no_other_tokens', () => {
  const ruleOf = (unitId: string) => ({ id: 'r1', unitId, templateId: 'no_other_tokens', text: 'No other tokens.', status: 'active' as const, day: 1, brokenCount: 0 });

  function ruled(): CampaignState {
    const s = enable(giver(), 'jealousy_games');
    partner(s, BEA, { lead: 'dominant', stateId: 'lover', affinity: 80 });
    s.bonds = { rules: [ruleOf(BEA)] };
    return holding(s, tok('t1', ANN), tok('t2', BEA));
  }

  it('is checked by wearing, not by intent', () => {
    expect(reg.relationshipRuleTemplates.get('no_other_tokens')!.check).toBe('token_wear');
    expect(reg.relationshipRuleTemplates.get('no_other_tokens')!.contentTags).toEqual(['jealousy_games']);
  });

  it("wearing another's token breaks it by check; her own does not", () => {
    const s = ruled();
    const broken = wear(s, 't1');
    expect(ofType(broken.events, 'rule_broken_by_check')).toEqual([{ type: 'rule_broken_by_check', ruleId: 'r1', unitId: BEA }]);
    expect(broken.state.bonds!.rules[0].brokenCount).toBe(1);
    expect(history(broken.state, BEA).map((h) => h.type)).toContain('rule_broken');
    const own = wear(s, 't2');
    expect(ofType(own.events, 'rule_broken_by_check')).toEqual([]);
    expect(own.state.bonds!.rules[0].brokenCount).toBe(0);
  });

  it('a suspended rule (jealousy_games off) is not broken', () => {
    const s = ruled();
    s.bonds!.rules[0].status = 'suspended';
    expect(ofType(wear(s, 't1').events, 'rule_broken_by_check')).toEqual([]);
  });

  it('with jealousy_games off the rule is never proposed; on, it is', () => {
    const proposals = (cats: string[]) => {
      const s = enable(partner(plain(reg), ANN, { lead: 'dominant', stateId: 'lover', affinity: 80 }), ...cats);
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const d = structuredClone(s);
        rollRules(d, { registries: reg, rng: new Rng(seedRng(seed)) });
        n += (d.bonds?.rules ?? []).filter((r) => r.templateId === 'no_other_tokens').length;
      }
      return n;
    };
    expect(proposals([])).toBe(0);
    expect(proposals(['jealousy_games'])).toBeGreaterThan(0);
  });
});
