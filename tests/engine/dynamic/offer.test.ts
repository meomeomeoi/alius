import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { applyDynamicIntent } from '../../../src/engine/dynamic/intents';
import { answerOffer, makeOffer, offerChoices, type OfferComposition } from '../../../src/engine/dynamic/offer';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { zoneTag } from '../../../src/engine/dynamic/zones';
import { addFact } from '../../../src/engine/memory/facts';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { offerDirective, refreshDynamicDirectives, applyOfferDirectives } from '../../../src/dynamic/directives';
import { effectiveHoldsUntil, holdsUntilOf } from '../../../src/engine/physics/style';
import { ContextBuilder } from '../../../src/llm/context';
import { campaign, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const bond = (primary: ProfileStyle, over: Record<string, unknown> = {}) => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] as string[] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const, ...over },
});
const ON = ['restraint', 'worship', 'service', 'humiliation', 'objectification'];

/** Ann practises in `style`, her worship profile is feet craves, toes enjoys, hands dislikes; nothing is shown to the commander yet. */
function world(style: ProfileStyle = 'cold', opts: { frame?: Frame; hold?: number; shown?: string[]; on?: string[] } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = bond(style);
  unitOf(s, ANN).expectations = { worship: { feet: { attitude: 'craves' }, toes: { attitude: 'enjoys' }, hands: { attitude: 'dislikes' } } };
  s.content = { enabled: opts.on ?? ON };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  if (opts.frame !== undefined) s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: opts.frame, hold: opts.hold ?? 45 };
  for (const t of opts.shown ?? []) addFact(s, { about: [ANN], text: `AUTHOR TO WRITE: shown ${t}`, tags: ['dynamic', zoneTag(t)], importance: 2, day: s.day, knownBy: [ANN] });
  return s;
}
const offer = (tab: OfferComposition[number]['tab'], ...ids: string[]): OfferComposition => [{ tab, ids }];
const send = (s: CampaignState, composition: OfferComposition, extra: Record<string, unknown> = {}) => run(s, reg, { type: 'dynamic/offer', payload: { unitId: ANN, composition, ...extra } });

describe('Regard cost rise (I7)', () => {
  const costs = (events: Array<{ type: string; [k: string]: unknown }>) => events.filter((e) => e.type === 'regard_changed' && e.cause === 'cost');
  it('an accepted offer made while her reading has r at 0 or less raises her Regard by what it cost', () => {
    const s = world('cold', { shown: ['feet'], frame: 'play', hold: 20 });
    s.relations[ANN].regard = 50;
    dynamicOf(s, ANN)!.readOf.r = -0.4;
    const r = send(s, offer('part', 'feet'));
    expect(costs(r.events)).toEqual([expect.objectContaining({ unitId: ANN, from: 50, to: 53 })]);
  });
  it('not when her reading is above 0, when the offer was not accepted, or while she has no reading to be 0', () => {
    const above = world('cold', { shown: ['feet'], frame: 'play', hold: 20 });
    above.relations[ANN].regard = 50;
    dynamicOf(above, ANN)!.readOf.r = 0.4;
    expect(costs(send(above, offer('part', 'feet')).events)).toEqual([]);
    const refused = world('affectionate', { shown: ['hands'], frame: 'play', hold: 30 });
    refused.relations[ANN].regard = 50;
    dynamicOf(refused, ANN)!.readOf.r = -0.4;
    expect(costs(send(refused, offer('part', 'hands')).events)).toEqual([]);
  });
});

describe('her answer', () => {
  it('craves lands: accepted, hold +6 and favour +3', () => {
    const s = world('cold', { shown: ['feet'] });
    expect(answerOffer(s, reg, ANN, offer('part', 'feet'))).toMatchObject({ answer: 'accepted', hold: 6, favour: 3, cause: 'offer_craves' });
    const r = send(s, offer('part', 'feet'));
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'offer_made')[0]).toMatchObject({ unitId: ANN, answer: 'accepted' });
    expect(dynamicOf(r.state, ANN)).toMatchObject({ hold: 6, favour: 3 }); // her dynamic began with the first gain
    expect(r.state.dynamic!.open.offers).toHaveLength(1);
    expect(r.state.dynamic!.open.offers[0]).toMatchObject({ unitId: ANN, answer: 'accepted' });
  });

  it('enjoys is accepted for +3 and +1', () => {
    const s = world('cold', { shown: ['toes'] });
    expect(answerOffer(s, reg, ANN, offer('part', 'toes'))).toMatchObject({ answer: 'accepted', hold: 3, favour: 1, cause: 'offer_enjoys' });
  });

  it('an indifferent offer is "tonight" from a cold or ritual manner and accepted for nothing from any other', () => {
    expect(answerOffer(world('cold'), reg, ANN, offer('posture', 'sitting'))).toMatchObject({ answer: 'tonight', hold: 0, favour: 0 });
    expect(answerOffer(world('affectionate'), reg, ANN, offer('posture', 'sitting'))).toMatchObject({ answer: 'accepted', hold: 0, favour: 0 });
  });

  it('dislikes is mocked by a cruel holder and refused by an affectionate one, -3 hold and -2 favour', () => {
    const cruel = world('cruel', { frame: 'play', hold: 20, shown: ['hands'] });
    expect(answerOffer(cruel, reg, ANN, offer('part', 'hands'))).toMatchObject({ answer: 'mocked', hold: -3, favour: -2, cause: 'offer_refused' });
    const kind = world('affectionate', { frame: 'play', hold: 30, shown: ['hands'] });
    expect(answerOffer(kind, reg, ANN, offer('part', 'hands'))).toMatchObject({ answer: 'refused', hold: -3, favour: -2 });
    const r = send(kind, offer('part', 'hands'));
    expect(dynamicOf(r.state, ANN)).toMatchObject({ hold: 27, favour: -2 });
  });

  it('a playful holder mocks only with a mocking humor', () => {
    const s = world('playful', { frame: 'play', hold: 20, shown: ['hands'] });
    expect(answerOffer(s, reg, ANN, offer('part', 'hands')).answer).toBe('refused');
    unitOf(s, ANN).temperament = { talkativeness: 'terse', volatility: 'steady', humor: 'mocking' };
    expect(answerOffer(s, reg, ANN, offer('part', 'hands')).answer).toBe('mocked');
  });

  it('unknown reveals the zone: a correction with no hold, the zone shown by a fact tagged for it, and the target she craves named', () => {
    const s = world('cold');
    const answer = answerOffer(s, reg, ANN, offer('part', 'toes'));
    expect(answer).toMatchObject({ answer: 'corrected', hold: 0, favour: 0, reveal: 'toes', corrected: 'feet' });
    const r = send(s, offer('part', 'toes'));
    expect(ofType(r.events, 'zone_revealed').map((e) => e.targetId)).toEqual(['toes', 'feet']);
    expect(ofType(r.events, 'hold_changed')).toEqual([]);
    const facts = r.state.memory.facts.filter((f) => f.tags.includes(zoneTag('toes')));
    expect(facts).toHaveLength(1);
    expect(facts[0].about).toContain(ANN);
    expect(facts[0].tags).toContain(zoneTag('toes'));
    expect(r.state.memory.facts.some((f) => f.tags.includes(zoneTag('feet')))).toBe(true); // the one she named is shown too
    expect(offerChoices(r.state, reg, ANN).part.find((c) => c.id === 'toes')).toMatchObject({ known: 'enjoys' });
  });

  it('good timing multiplies a gain by 1.5 and her irritation halves it', () => {
    const content = world('cold', { frame: 'play', hold: 20, shown: ['feet'] });
    dynamicOf(content, ANN)!.favour = 6;
    expect(answerOffer(content, reg, ANN, offer('part', 'feet'))).toMatchObject({ hold: 9, favour: 4.5 });
    const frustrated = world('cold', { frame: 'play', hold: 20, shown: ['feet'] });
    dynamicOf(frustrated, ANN)!.favour = -6;
    expect(answerOffer(frustrated, reg, ANN, offer('part', 'feet'))).toMatchObject({ hold: 3, favour: 1.5 });
  });

  it('with the cap reached and she no holder: a kind refusal with no hold', () => {
    const s = world('cold', { shown: ['feet'] });
    s.dynamic!.setup.holders = 1;
    unitOf(s, BEA).bond = bond('cold');
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 45 };
    expect(answerOffer(s, reg, ANN, offer('part', 'feet'))).toMatchObject({ answer: 'refused', hold: 0, favour: 0, kind: true });
    const r = send(s, offer('part', 'feet'));
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'offer_made')[0]).toMatchObject({ answer: 'refused', kind: true });
    expect(dynamicOf(r.state, ANN)).toBeUndefined(); // nothing began
    expect(ofType(r.events, 'hold_changed')).toEqual([]);
  });
});

describe('what the offer does', () => {
  it('the position moves: unasked, readiness +0.1 and her motive toward her; with something asked in return, toward gain', () => {
    const s = world('cold', { frame: 'play', hold: 20, shown: ['feet'] });
    const before = structuredClone(dynamicOf(s, ANN)!.readOf);
    const r = send(s, offer('part', 'feet'));
    const after = dynamicOf(r.state, ANN)!.readOf;
    expect(after.r).toBeCloseTo(before.r + 0.1, 6);
    expect(after.motive.her).toBeGreaterThan(before.motive.her);
    expect(after.updates).toBe(before.updates + 1);
    const asked = send(s, offer('part', 'feet'), { askInReturn: true });
    const gained = dynamicOf(asked.state, ANN)!.readOf;
    expect(gained.motive.gain).toBeGreaterThan(before.motive.gain);
    expect(gained.motive.her).toBeLessThan(after.motive.her);
    expect(asked.state.dynamic!.open.offers[0].conditions).toBe(true);
  });

  it('an accepted offer of time at role becomes a book_ahead claim with chance 0.4 (one draw); at play no draw', () => {
    const at = (frame: Frame) => {
      const s = world('affectionate', { frame, hold: 50 });
      const rng = { chance: vi.fn(() => true) };
      const events = makeOffer(s, { registries: reg, rng: rng as unknown as Rng }, ANN, offer('time', 'evening'));
      return { s, rng, events };
    };
    const role = at('role');
    expect(role.rng.chance).toHaveBeenCalledTimes(1);
    expect(role.rng.chance).toHaveBeenCalledWith(0.4);
    expect(ofType(role.events, 'domain_claimed')[0]).toMatchObject({ unitId: ANN, domainId: 'private_time' });
    expect(role.s.dynamic!.open.claims).toHaveLength(1);
    const play = at('play');
    expect(play.rng.chance).not.toHaveBeenCalled();
    expect(play.s.dynamic!.open.claims).toHaveLength(0);
    // a claim that is open already, or a domain she has, draws nothing
    const again = role.s;
    const rng = { chance: vi.fn(() => true) };
    makeOffer(again, { registries: reg, rng: rng as unknown as Rng }, ANN, offer('time', 'night'));
    expect(rng.chance).not.toHaveBeenCalled();
  });

  it('an accepted offer of a part at role is a claim of the body domain, when the chance falls', () => {
    const s = world('affectionate', { frame: 'role', hold: 50, shown: ['feet'] });
    const miss = { chance: vi.fn(() => false) };
    const events = makeOffer(s, { registries: reg, rng: miss as unknown as Rng }, ANN, offer('part', 'feet'));
    expect(miss.chance).toHaveBeenCalledTimes(1);
    expect(ofType(events, 'domain_claimed')).toEqual([]);
  });

  it('Regard falls for her and for the witnesses by the entry humiliation, and the offer is public', () => {
    const s0 = world('cold', { shown: ['feet'], frame: 'equal', hold: 0 });
    dynamicOf(s0, ANN)!.readOf.r = 0.5; // she has no resistance to have overcome: no cost rise here (that is `Regard cost rise`), only the fall
    s0.relations[ANN].regard = 60;
    s0.relations[BEA].regard = 60;
    const started = run(s0, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    const r = send(started.state, offer('part', 'feet'));
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].regard!).toBeLessThan(60);
    expect(r.state.relations[BEA].regard!).toBeLessThan(60);
    expect(60 - r.state.relations[BEA].regard!).toBeLessThan(60 - r.state.relations[ANN].regard!); // she only saw it
    expect(r.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBeGreaterThan(0); // protocol_public
    expect(r.state.memory.facts.some((f) => f.knownBy.includes(BEA) && f.about.includes(ANN) && /offered/.test(f.text))).toBe(true);
    expect(r.state.dynamic!.open.offers[0].sceneId).toBe(r.state.scene!.id);
  });

  it('a mocked offer before others is mocked, remembered by those present and kept by her', () => {
    const s0 = world('cruel', { frame: 'play', hold: 30, shown: ['hands'] });
    const started = run(s0, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    const r = send(started.state, offer('part', 'hands'));
    expect(ofType(r.events, 'offer_made')[0]).toMatchObject({ answer: 'mocked' });
    expect(r.state.memory.facts.some((f) => f.tags.includes('compromat') && f.about.includes('commander'))).toBe(true);
    expect(r.state.memory.facts.some((f) => /mocked/.test(f.text) && f.knownBy.includes(BEA) && !f.tags.includes('compromat'))).toBe(true); // the rule: the present remember it
  });
});

describe('what may be offered', () => {
  it('gated entries never appear in the choices (a category off, her own limit, a dynamic-scope entry at equal)', () => {
    const ids = (s: CampaignState, tab: 'part' | 'contact' | 'service') => offerChoices(s, reg, ANN)[tab].map((c) => c.id);
    const on = world('cold', { frame: 'play', hold: 20 });
    expect(ids(on, 'part')).toContain('feet');
    expect(ids(on, 'part')).not.toContain('breasts'); // explicit_scenes is off
    expect(ids(on, 'contact')).toContain('foot_worship');
    expect(ids(on, 'service')).toContain('polishing_her_boots');
    const off = world('cold', { frame: 'play', hold: 20, on: ['restraint'] });
    expect(ids(off, 'part')).toEqual([]);
    expect(ids(off, 'service')).toEqual([]);
    const limit = world('cold', { frame: 'play', hold: 20 });
    unitOf(limit, ANN).bond!.ownLimits.categories = ['worship'];
    expect(ids(limit, 'part')).toEqual([]);
    expect(ids(limit, 'contact')).not.toContain('foot_worship');
    const equal = world('cold');
    expect(ids(equal, 'part')).toContain('feet'); // a part is not dynamic scope
    expect(ids(equal, 'contact')).not.toContain('foot_worship'); // dynamic scope needs play
    expect(ids(equal, 'service')).toEqual([]);
  });

  it('a worship target reads its attitude only once shown; the role tab holds the objects', () => {
    const s = world('cold', { frame: 'play', hold: 20, shown: ['feet'] });
    const choices = offerChoices(s, reg, ANN);
    expect(choices.part.find((c) => c.id === 'feet')!.known).toBe('craves');
    expect(choices.part.find((c) => c.id === 'toes')!.known).toBe('unknown');
    expect(choices.role.map((c) => c.id)).toContain('footrest');
    expect(choices.contact.map((c) => c.id)).not.toContain('footrest');
    expect(choices.time.map((c) => c.id)).toEqual(['evening', 'night']);
    expect(choices.endurance).toHaveLength(1);
  });

  it('nothing while the dynamic is off, for a woman who could not hold, and the action refuses', () => {
    const s = world('cold', { shown: ['feet'] });
    s.dynamic = undefined;
    expect(Object.values(offerChoices(s, reg, ANN)).flat()).toEqual([]);
    const r = send(s, offer('part', 'feet'));
    expect(errors(r.events)).toHaveLength(1);
    const no = world('cold');
    unitOf(no, ANN).bond!.practice!.inclination = 'none';
    expect(Object.values(offerChoices(no, reg, ANN)).flat()).toEqual([]);
    expect(errors(send(no, offer('part', 'feet')).events)).toHaveLength(1);
  });

  it('refuses an entry that is not offered, a third entry and a tab used twice', () => {
    const s = world('cold', { frame: 'play', hold: 20 });
    expect(errors(send(s, offer('part', 'breasts')).events)).toHaveLength(1); // closed here
    expect(errors(send(s, [{ tab: 'part', ids: ['feet', 'toes'] }, { tab: 'time', ids: ['evening'] }]).events)).toHaveLength(1); // three
    expect(errors(send(s, [{ tab: 'part', ids: ['feet'] }, { tab: 'part', ids: ['toes'] }]).events)).toHaveLength(1);
    expect(errors(send(s, []).events)).toHaveLength(1);
    expect(errors(send(s, [{ tab: 'bogus', ids: ['x'] }] as unknown as OfferComposition).events)).toHaveLength(1);
    expect(errors(send(s, [{ tab: 'part', ids: ['feet'] }, { tab: 'posture', ids: ['kneeling_upright'] }]).events)).toEqual([]); // two is an offer
  });
});

describe('the model confirms; the engine decides', () => {
  const made = () => {
    const s0 = world('cold', { shown: ['feet'] });
    const r = send(s0, offer('part', 'feet'));
    return { s: r.state, id: r.state.dynamic!.open.offers[0].id };
  };
  const ctx = () => ({ registries: reg });
  const ev = (over: Record<string, unknown>) => ({ type: 'offer_answered', unit: ANN, ...over }) as never;

  it('the intent confirms the engine answer and closes the question', () => {
    const { s, id } = made();
    const d = structuredClone(s);
    expect(applyDynamicIntent(d, ctx(), ANN, ev({ offerId: id, answer: 'accepted' }))).toEqual([]);
    expect(d.dynamic!.open.offers[0].confirmed).toBe(true);
  });

  it('a mismatched answer is dropped: the engine answer stands and the offer stays open', () => {
    const { s, id } = made();
    const d = structuredClone(s);
    applyDynamicIntent(d, ctx(), ANN, ev({ offerId: id, answer: 'mocked' }));
    expect(d.dynamic!.open.offers[0]).toMatchObject({ answer: 'accepted' });
    expect(d.dynamic!.open.offers[0].confirmed).toBeUndefined();
    expect(dynamicOf(d, ANN)!.hold).toBe(dynamicOf(s, ANN)!.hold);
    // a stale id, or another woman's, does nothing
    applyDynamicIntent(d, ctx(), BEA, ev({ offerId: id, answer: 'accepted' }));
    expect(d.dynamic!.open.offers[0].confirmed).toBeUndefined();
  });

  it('correction text becomes a fact of hers; text with a pronoun for the commander is dropped', () => {
    const s0 = world('cold');
    const r = send(s0, offer('part', 'toes'));
    const id = r.state.dynamic!.open.offers[0].id;
    expect(r.state.dynamic!.open.offers[0].answer).toBe('corrected');
    const d = structuredClone(r.state);
    const before = d.memory.facts.length;
    applyDynamicIntent(d, ctx(), ANN, ev({ offerId: id, answer: 'corrected', correction: 'slower, and from behind' }));
    expect(d.memory.facts.length).toBe(before + 1);
    expect(d.memory.facts.at(-1)).toMatchObject({ about: [ANN], knownBy: [ANN] });
    expect(d.memory.facts.at(-1)!.text).toContain('slower, and from behind');
    const p = structuredClone(r.state);
    applyDynamicIntent(p, ctx(), ANN, ev({ offerId: id, answer: 'corrected', correction: 'his hands, not hers' }));
    expect(p.memory.facts.length).toBe(before);
    expect(p.dynamic!.open.offers[0].confirmed).toBe(true); // confirmed all the same
  });
});

describe('the offer lapses', () => {
  it('an offer of the scene goes when the scene ends; one of a day goes at the day end', () => {
    const s0 = world('cold', { shown: ['feet'] });
    const started = run(s0, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    const r = send(started.state, offer('part', 'feet'));
    expect(r.state.dynamic!.open.offers).toHaveLength(1);
    const ended = run(r.state, reg, { type: 'scene/end', payload: {} });
    expect(errors(ended.events)).toEqual([]);
    expect(ended.state.dynamic!.open.offers).toHaveLength(0);
    const dm = send(world('cold', { shown: ['feet'] }), offer('part', 'feet')).state;
    expect(dm.dynamic!.open.offers).toHaveLength(1);
    const next = structuredClone(dm);
    dynamicDayStep(next, { registries: reg, rng: new Rng(next.rng) });
    expect(next.dynamic!.open.offers).toHaveLength(0);
  });
});

describe('what the model is told, and endurance', () => {
  const started = (s: CampaignState) => run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;

  it('the offer sets dynamic:offer:<unitId> for her next reply only, with her answer and no number or pronoun for the commander', () => {
    const s = started(world('cold', { shown: ['feet'] }));
    const r = send(s, offer('part', 'feet'), { askInReturn: true });
    const builder = new ContextBuilder();
    expect(applyOfferDirectives(builder, r.events, r.state, reg)).toBe(true);
    const d = offerDirective(ofType(r.events, 'offer_made')[0], r.state, reg)!;
    expect(d).toMatchObject({ id: 'dynamic:offer:unit_ann', expiresAfter: 'next_reply' });
    expect(d.text).toContain('Ann takes it up');
    expect(d.text).toContain('asks something in return');
    expect(d.text).not.toMatch(/\d/);
    expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
    refreshDynamicDirectives(builder, r.state, reg); // a refresh leaves the event-driven line alone
    expect(builder.build(r.state, 4000).directives).toContain('Ann takes it up');
    builder.onReplyReceived();
    expect(builder.build(r.state, 4000).directives).not.toContain('Ann takes it up');
    expect(offerDirective({ type: 'hold_changed', unitId: ANN }, r.state, reg)).toBeNull();
  });

  it('a correction names what she wants, a cap refusal is kind', () => {
    const s = started(world('cold'));
    const r = send(s, offer('part', 'toes'));
    expect(offerDirective(ofType(r.events, 'offer_made')[0], r.state, reg)!.text).toContain('What she wants is the commander');
    const capped = world('cold', { shown: ['feet'] });
    capped.dynamic!.setup.holders = 1;
    unitOf(capped, BEA).bond = bond('cold');
    capped.relations[BEA].dynamic = { ...blankDynamic(capped.day), frame: 'play', hold: 45 };
    const k = send(capped, offer('part', 'feet'));
    expect(offerDirective(ofType(k.events, 'offer_made')[0], k.state, reg)!.text).toContain('turns it down kindly');
  });

  it('an endurance she took raises what she holds the commander until, for that scene only', () => {
    const s = started(world('cold', { frame: 'play', hold: 20 }));
    expect(holdsUntilOf(s, ANN)).toBe('signal');
    const r = send(s, offer('endurance', 'endurance'));
    expect(ofType(r.events, 'offer_made')[0]).toMatchObject({ answer: 'accepted' });
    expect(holdsUntilOf(r.state, ANN)).toBe('blackout');
    expect(effectiveHoldsUntil(r.state, reg, ANN)).toBe('limit'); // breath_play is off: her maximum is the limit
    const ended = run(r.state, reg, { type: 'scene/end', payload: {} });
    expect(holdsUntilOf(ended.state, ANN)).toBe('signal');
  });
});
