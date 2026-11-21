import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { addHold } from '../../../src/engine/dynamic/hold';
import { answerClaim, capabilitiesOf, claimsDue, hasCapability, holderWith, loseDomain, settleDomainConflict, yieldPartial } from '../../../src/engine/dynamic/domains';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = (primary: 'cold' | 'possessive') => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});

/** Ann holds at `frame` with `hold`; Bea too when `bea` is given. */
function world(frame: Frame, hold: number, bea?: { frame: Frame; hold: number }): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = practice('cold');
  unitOf(s, BEA).bond = practice('cold');
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold };
  if (bea !== undefined) s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: bea.frame, hold: bea.hold };
  return s;
}
const dyn = (s: CampaignState, id = ANN) => dynamicOf(s, id)!;
/** A rng that always says yes and counts its draws. */
const yes = () => { const rng = { calls: 0, chance(): boolean { this.calls++; return true; } }; return { rng, ctx: { registries: reg, rng: rng as unknown as Rng } }; };
/** A rng that must never be asked. */
const never = () => { const rng = { calls: 0, chance(): boolean { this.calls++; return false; } }; return { rng, ctx: { registries: reg, rng: rng as unknown as Rng } }; };
const claimed = (s: CampaignState) => { const { ctx } = yes(); claimsDue(s, ctx); return s.dynamic!.open.claims[0]; };
const answer = (s: CampaignState, a: 'yield' | 'refuse' | 'talk') => run(s, reg, { type: 'dynamic/answer_claim', payload: { claimId: s.dynamic!.open.claims[0].id, answer: a } });

describe('claims', () => {
  it('a claim opens only when frame and band meet the domain, with one draw', () => {
    const s = world('play', 45); // keeping at play: the private time domain is due, nothing else
    const { rng, ctx } = yes();
    const events = claimsDue(s, ctx);
    expect(rng.calls).toBe(1);
    expect(s.dynamic!.open.claims).toEqual([{ id: 'dc0', unitId: ANN, domainId: 'private_time', day: s.day }]);
    expect(events).toEqual([{ type: 'domain_claimed', unitId: ANN, claimId: 'dc0', domainId: 'private_time' }]);
    // one open per unit: no second claim, no further draw
    claimsDue(s, ctx);
    expect(rng.calls).toBe(1);
    expect(s.dynamic!.open.claims).toHaveLength(1);
  });

  it('no due claim, no draw', () => {
    for (const s of [world('equal', 45), world('play', 25), world('play', 30)]) {
      const { rng, ctx } = never();
      expect(claimsDue(s, ctx)).toEqual([]);
      expect(rng.calls).toBe(0);
    }
    const idle = world('equal', 10);
    const rng = new Rng(idle.rng);
    claimsDue(idle, { registries: reg, rng });
    expect(rng.state).toEqual(idle.rng); // a real rng is untouched too
  });

  it('a milestone-form domain (the command) is never claimed by the day step', () => {
    const s = world('role', 70);
    const { ctx } = yes();
    claimsDue(s, ctx);
    expect(s.dynamic!.open.claims.map((c) => c.domainId)).toEqual(['private_time']); // the first due demand domain, one at a time; the command (a milestone) is never offered here
    expect(s.dynamic!.open.claims.some((c) => c.domainId === 'command')).toBe(false);
  });

  it('a refusal cooldown keeps the same domain from coming back, and a domain she holds is not claimed again', () => {
    const s = world('play', 45);
    dyn(s).domains.push({ id: 'private_time', since: 1 });
    const { rng, ctx } = yes();
    claimsDue(s, ctx);
    expect(rng.calls).toBe(0);
    dyn(s).domains = [];
    dyn(s).cooldowns.private_time = s.day + 3;
    claimsDue(s, ctx);
    expect(rng.calls).toBe(0);
    s.day += 3;
    claimsDue(s, ctx);
    expect(rng.calls).toBe(1);
  });
});

describe('answering a claim', () => {
  it('yield adds the domain and its capabilities', () => {
    const s = world('play', 45);
    claimed(s);
    const r = answer(s, 'yield');
    expect(errors(r.events)).toEqual([]);
    expect(dyn(r.state).domains).toEqual([{ id: 'private_time', since: r.state.day }]);
    expect(capabilitiesOf(r.state, reg, ANN).sort()).toEqual(['book_ahead', 'booking_uncapped']);
    expect(hasCapability(r.state, reg, ANN, 'book_ahead')).toBe(true);
    expect(holderWith(r.state, reg, 'book_ahead')).toBe(ANN);
    expect(r.events.map((e) => e.type)).toContain('domain_yielded');
    expect(r.state.dynamic!.open.claims).toEqual([]);
  });

  it('a yielded domain is remembered by the pair (dynamic_domain_yielded), the submit card is not', () => {
    const s = world('play', 45);
    claimed(s);
    const r = answer(s, 'yield');
    const fact = r.state.memory.facts.find((f) => (f.tags ?? []).includes('domain'));
    expect(fact?.text).toContain('Private time');
    expect(fact?.knownBy).toEqual(expect.arrayContaining([ANN]));
    const t = world('rule', 70);
    t.dynamic!.open.claims.push({ id: 'dc0', unitId: ANN, submit: true, day: t.day });
    expect(answer(t, 'yield').state.memory.facts.some((f) => (f.tags ?? []).includes('domain'))).toBe(false);
  });

  it('refuse costs by frame and cools down 7 days', () => {
    const s = world('play', 45);
    claimed(s);
    const r = answer(s, 'refuse');
    expect(errors(r.events)).toEqual([]);
    expect(dyn(r.state).hold).toBe(43); // minor at play: -2
    expect(dyn(r.state).domains).toEqual([]);
    expect(dyn(r.state).cooldowns.private_time).toBe(r.state.day + 7);
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['domain_refused', 'hold_changed']));
    expect(r.state.dynamic!.open.claims).toEqual([]);
    const role = world('role', 55); // moderate: -4, and noted
    claimed(role);
    const q = answer(role, 'refuse');
    expect(dyn(q.state).hold).toBe(51);
    expect(q.events.map((e) => e.type)).toContain('refusal_noted');
  });

  it('talk keeps the claim open and changes nothing', () => {
    const s = world('play', 45);
    claimed(s);
    const r = answer(s, 'talk');
    expect(errors(r.events)).toEqual([]);
    expect(r.state.dynamic!.open.claims).toHaveLength(1);
    expect(dyn(r.state).hold).toBe(45);
  });

  it('a stale or foreign claim id is refused', () => {
    const s = world('play', 45);
    claimed(s);
    const r = run(s, reg, { type: 'dynamic/answer_claim', payload: { claimId: 'dc99', answer: 'yield' } });
    expect(errors(r.events)).toHaveLength(1);
    const bad = run(s, reg, { type: 'dynamic/answer_claim', payload: { claimId: 'dc0', answer: 'maybe' } });
    expect(errors(bad.events)).toHaveLength(1);
  });

  it('talk then compromise yields partially for 7 days, then she claims again', () => {
    const s = world('play', 45);
    const claim = claimed(s);
    const events = yieldPartial(s, yes().ctx, claim.id);
    expect(events.map((e) => e.type)).toContain('domain_yielded');
    expect(dyn(s).domains).toEqual([{ id: 'private_time', since: s.day, partialUntil: s.day + 7 }]);
    expect(hasCapability(s, reg, ANN, 'book_ahead')).toBe(true);
    expect(s.dynamic!.open.claims).toEqual([]);
    // while the partial runs she does not claim it
    const { rng, ctx } = yes();
    s.day += 6;
    claimsDue(s, ctx);
    expect(rng.calls).toBe(0);
    // then it lapses (no capability) and she claims again
    s.day += 1;
    expect(hasCapability(s, reg, ANN, 'book_ahead')).toBe(false);
    claimsDue(s, ctx);
    expect(rng.calls).toBe(1);
    expect(s.dynamic!.open.claims[0].domainId).toBe('private_time');
    // yielding the second time makes it whole
    const r = answer(s, 'yield');
    expect(dyn(r.state).domains).toEqual([{ id: 'private_time', since: r.state.day }]);
  });

  it('the compromise intent settles only the claim of the unit it landed on', () => {
    const s = world('play', 45, { frame: 'play', hold: 45 });
    const claim = claimed(s);
    expect(claim.unitId).toBe(ANN);
    expect(yieldPartial(s, yes().ctx, 'dc99')).toEqual([]);
  });

  it('the compromise intent (claimId) yields the domain for a week; a claim of another unit, or a stale id, does nothing', () => {
    const s = world('play', 45, { frame: 'play', hold: 45 });
    s.dynamic!.open.claims.push({ id: 'dc0', unitId: BEA, domainId: 'private_time', day: s.day }, { id: 'dc1', unitId: ANN, domainId: 'private_time', day: s.day });
    s.dynamic!.seq = 2;
    const talk = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(talk.events)).toEqual([]);
    const intent = (claimId: string) => ({ events: [{ type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'they settled it', confidence: 1, claimId, text: 'weekends only' }] });
    const apply = (st: CampaignState, claimId: string) => run(st, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: intent(claimId) } });
    const stale = apply(talk.state, 'dc0'); // Bea's claim: Ann is not the one asking
    expect(dynamicOf(stale.state, ANN)!.domains).toEqual([]);
    expect(stale.state.dynamic!.open.claims.map((c) => c.id)).toEqual(['dc0', 'dc1']);
    const ok = apply(talk.state, 'dc1');
    expect(errors(ok.events)).toEqual([]);
    expect(dynamicOf(ok.state, ANN)!.domains).toEqual([{ id: 'private_time', since: ok.state.day, partialUntil: ok.state.day + 7 }]);
    expect(ok.state.dynamic!.open.claims.map((c) => c.id)).toEqual(['dc0']);
  });

  it('the submit claim (rule): yield clears the contest, refuse drops a band', () => {
    const s = world('rule', 70);
    dyn(s).contest = [s.day, s.day, s.day];
    s.dynamic!.open.claims.push({ id: 'dc0', unitId: ANN, submit: true, day: s.day });
    s.dynamic!.seq = 1;
    const y = answer(structuredClone(s), 'yield');
    expect(errors(y.events)).toEqual([]);
    expect(dyn(y.state).contest).toEqual([]);
    expect(dyn(y.state).domains).toEqual([]);
    const r = answer(structuredClone(s), 'refuse');
    expect(dyn(r.state).hold).toBe(60); // 70 - 20 is 50, but the rule frame's floor is 60
    expect(r.events.map((e) => e.type)).toContain('domain_refused');
    expect(r.state.dynamic!.open.claims).toEqual([]);
  });
});

describe('losing a domain', () => {
  it('falling below the band loses the domain at once', () => {
    const s = world('play', 45);
    dyn(s).domains.push({ id: 'private_time', since: 1 }); // keeping (40)
    const events = addHold(s, { registries: reg }, ANN, -6, 'decay'); // 39
    expect(dyn(s).domains).toEqual([]);
    expect(events).toContainEqual({ type: 'domain_lost', unitId: ANN, domainId: 'private_time', reason: 'band' });
    expect(capabilitiesOf(s, reg, ANN)).toEqual([]);
  });

  it('a hold that stays in the band loses nothing', () => {
    const s = world('play', 45);
    dyn(s).domains.push({ id: 'private_time', since: 1 });
    addHold(s, { registries: reg }, ANN, -4, 'decay');
    expect(dyn(s).domains).toHaveLength(1);
  });

  it('an open claim whose band she has fallen below is withdrawn', () => {
    const s = world('play', 45);
    claimed(s);
    addHold(s, { registries: reg }, ANN, -10, 'decay');
    expect(s.dynamic!.open.claims).toEqual([]);
  });

  it('loseDomain names its reason', () => {
    const s = world('role', 70);
    dyn(s).domains.push({ id: 'body', since: 1 });
    expect(loseDomain(s, ANN, 'body', 'force')).toEqual({ type: 'domain_lost', unitId: ANN, domainId: 'body', reason: 'force' });
    expect(dyn(s).domains).toEqual([]);
  });
});

describe('one domain, one holder', () => {
  it('a second holder\'s claim is settled by order: the loser loses 10 hold and domain_contested', () => {
    const s = world('play', 45, { frame: 'play', hold: 50 });
    unitOf(s, ANN).bond = { ...practice('cold'), leadStyle: 'balanced' }; // Bea outranks her
    dyn(s, BEA).domains.push({ id: 'private_time', since: 1 });
    const events = settleDomainConflict(s, yes().ctx, ANN, BEA, 'private_time');
    expect(events).toContainEqual({ type: 'domain_contested', domainId: 'private_time', winnerId: BEA, loserId: ANN, claimantId: ANN, holderId: BEA });
    expect(dyn(s).hold).toBe(35);
    expect(dyn(s, BEA).domains.map((d) => d.id)).toEqual(['private_time']);
    expect(dyn(s).domains).toEqual([]);
  });

  it('when the claimant wins, the holder loses the domain (contest) and 10 hold', () => {
    const s = world('play', 45, { frame: 'play', hold: 50 });
    unitOf(s, BEA).bond = { ...practice('cold'), leadStyle: 'balanced' };
    dyn(s, BEA).domains.push({ id: 'private_time', since: 1 });
    const events = settleDomainConflict(s, yes().ctx, ANN, BEA, 'private_time');
    expect(events).toContainEqual({ type: 'domain_lost', unitId: BEA, domainId: 'private_time', reason: 'contest' });
    expect(dyn(s, BEA).hold).toBe(40);
    expect(dyn(s).domains.map((d) => d.id)).toEqual(['private_time']);
  });

  it('the day step sends a claim of a held domain to the contest instead of the card', () => {
    const s = world('play', 45, { frame: 'play', hold: 50 });
    unitOf(s, BEA).bond = { ...practice('cold'), leadStyle: 'balanced' };
    dyn(s, BEA).domains.push({ id: 'private_time', since: 1 });
    const events = claimsDue(s, yes().ctx);
    expect(events.map((e) => e.type)).toContain('domain_contested');
    expect(s.dynamic!.open.claims).toEqual([]);
  });

  it('a yielded claim that was overtaken by another holder is contested', () => {
    const s = world('play', 45, { frame: 'play', hold: 50 });
    claimed(s);
    dyn(s, BEA).domains.push({ id: 'private_time', since: 2 });
    const r = answer(s, 'yield');
    expect(errors(r.events)).toEqual([]);
    expect(r.events.map((e) => e.type)).toContain('domain_contested');
  });
});

describe('the readers', () => {
  it('capabilitiesOf never reads a domain id', () => {
    const s = world('play', 45);
    // a pack that renames every domain: the capabilities come from `grants`
    const renamed = new Map([...reg.dynamicDomains].map(([id, row], i) => [`zz_${i}`, { ...row, id: `zz_${i}` }]));
    const other = { ...reg, dynamicDomains: renamed } as unknown as Registries;
    const first = [...renamed.keys()][0];
    dyn(s).domains.push({ id: first, since: 1 }, { id: 'unknown_id', since: 1 });
    expect(capabilitiesOf(s, other, ANN).sort()).toEqual(['book_ahead', 'booking_uncapped']);
    expect(hasCapability(s, other, ANN, 'booking_uncapped')).toBe(true);
    expect(holderWith(s, other, 'book_ahead')).toBe(ANN);
    expect(holderWith(s, other, 'countermand')).toBeNull();
  });

  it('nothing answers while the dynamic is off, or for a unit that is not a holder', () => {
    const s = world('play', 45);
    dyn(s).domains.push({ id: 'private_time', since: 1 });
    expect(capabilitiesOf(s, reg, BEA)).toEqual([]);
    s.dynamic!.setup.holders = 0;
    expect(capabilitiesOf(s, reg, ANN)).toEqual([]);
    expect(holderWith(s, reg, 'book_ahead')).toBeNull();
  });

  it('holderWith picks the first in squad order', () => {
    const s = world('play', 45, { frame: 'play', hold: 45 });
    dyn(s, BEA).domains.push({ id: 'private_time', since: 1 });
    dyn(s).domains.push({ id: 'private_time', since: 2 });
    expect(holderWith(s, reg, 'booking_uncapped')).toBe(ANN);
  });
});
