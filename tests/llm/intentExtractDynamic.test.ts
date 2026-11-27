import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DYNAMIC_INTENT_TYPES } from '../../src/engine/relations/vocab';
import { getCallType } from '../../src/llm/callTypes';
import { readIntentOutput, sanitizeIntentOutput, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';

const ANN = 'unit_ann';
const ct = () => getCallType('intent_extract')!;
const system = (i: IntentExtractInput) => ct().system(i) as string;
const prompt = (i: IntentExtractInput) => ct().prompt(i) as string;
type Dyn = NonNullable<IntentExtractInput['dynamic']>;
const dyn = (over: Partial<Dyn> = {}): Dyn => ({ types: [], probes: [], milestones: [], claims: [], exits: [], offers: [], compromat: [], probeAxes: {}, milestoneLabels: {}, ...over });
const withDyn = (d: Dyn, channel: 'scene' | 'dm' = 'scene'): IntentExtractInput => ({ ...INTENT_SNAPSHOT_INPUT, channel, dynamic: d });
const typeLine = (i: IntentExtractInput): string => system(i).split('\n').find((l) => l.startsWith('EVENT_TYPE:'))!;

/** Each of the seven types, what offers it and a word its lines carry. */
const OFFERS: Array<{ type: string; offer: Dyn; word: string }> = [
  { type: 'probe_answered', offer: dyn({ types: ['probe_answered'], probes: [ANN], probeAxes: { [ANN]: 'takes the commander\'s seat' } }), word: 'takes the commander\'s seat' },
  { type: 'probe_observed', offer: dyn({ types: ['probe_observed'], observed: [ANN] }), word: '"response"' },
  { type: 'milestone_accepted', offer: dyn({ types: ['milestone_accepted', 'milestone_refused'], milestones: ['dm1'], milestoneLabels: { dm1: 'she asks to be called by her title' } }), word: 'she asks to be called by her title' },
  { type: 'milestone_refused', offer: dyn({ types: ['milestone_accepted', 'milestone_refused'], milestones: ['dm1'], milestoneLabels: { dm1: 'x' } }), word: '"milestoneId"' },
  { type: 'compromat_mentioned', offer: dyn({ types: ['compromat_mentioned'], compromat: [ANN] }), word: '"summary"' },
  { type: 'protocol_slip', offer: dyn({ types: ['protocol_slip'], slips: [ANN] }), word: '"protocol_slip":' },
  { type: 'offer_answered', offer: dyn({ types: ['offer_answered'], offers: ['do1'] }), word: '"offerId"' },
  // P15b: one of her small ways, listed with her words and the kind
  { type: 'quirk_voiced', offer: dyn({ types: ['quirk_voiced'], quirks: [{ unitId: ANN, when: 'switch' }], quirkTexts: { [`${ANN}:switch`]: 'she locks the door' } }), word: 'she locks the door' },
];

describe('the intent prompt and the dynamic', () => {
  const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');

  it('prompt without dynamic is byte-identical (the pinned text), with the field absent or with nothing offered', () => {
    for (const input of [INTENT_SNAPSHOT_INPUT, withDyn(dyn())]) expect(`${system(input)}\n=====\n${prompt(input)}\n`).toBe(pinned);
    for (const t of DYNAMIC_INTENT_TYPES) expect(pinned, t).not.toContain(t);
    expect(pinned).not.toContain('DYNAMIC');
  });

  for (const { type, offer, word } of OFFERS) {
    it(`${type} is offered only with its subject`, () => {
      expect(system(INTENT_SNAPSHOT_INPUT)).not.toContain(type);
      const both = `${system(withDyn(offer))}\n${prompt(withDyn(offer))}`;
      expect(typeLine(withDyn(offer))).toContain(type);
      expect(both).toContain(word);
      expect(both).toContain(`"${type}"`); // its rule line
    });
  }

  it('P15b: the QUIRKS block lists the unit, the kind and her words, one per line, and the shape asks for "when" only then', () => {
    const d = dyn({ types: ['quirk_voiced'], quirks: [{ unitId: ANN, when: 'during' }, { unitId: ANN, when: 'address' }], quirkTexts: { [`${ANN}:during`]: 'she hums\nunder her breath', [`${ANN}:address`]: 'she names the commander by rank' } });
    const text = prompt(withDyn(d));
    expect(text).toContain(`- ${ANN} — during: she hums under her breath`);
    expect(text).toContain(`- ${ANN} — address: she names the commander by rank`);
    expect(system(withDyn(d))).toContain('"when": "switch" | "during" | "after" | "address"');
    expect(system(INTENT_SNAPSHOT_INPUT)).not.toContain('"when"');
  });

  it('only offered types are listed: a pending probe lists probe_answered and not milestone_accepted', () => {
    const line = typeLine(withDyn(OFFERS[0].offer));
    expect(line).toContain('probe_answered');
    for (const other of DYNAMIC_INTENT_TYPES.filter((t) => t !== 'probe_answered')) expect(line, other).not.toContain(other);
  });

  it('the DYNAMIC block lists the ids the report may use, one per line, with her words', () => {
    const d = dyn({
      types: ['probe_answered', 'milestone_accepted', 'milestone_refused', 'offer_answered', 'compromise_reached'], probes: [ANN], probeAxes: { [ANN]: 'makes the commander wait' },
      milestones: ['dm2'], milestoneLabels: { dm2: 'a new step\nwith a break' }, claims: ['dc3'], offers: ['do4'],
    });
    const text = prompt(withDyn(d));
    expect(text).toContain('DYNAMIC');
    expect(text).toContain(`- ${ANN}: makes the commander wait`);
    expect(text).toContain('- dm2: a new step with a break'); // one line
    expect(text).toContain('dc3');
    expect(text).toContain('do4');
    expect(text).not.toMatch(/\bhe\b|\bhim\b|\bhis\b/i);
  });

  it('a claim or an exit offers compromise_reached with its id', () => {
    const claim = withDyn(dyn({ types: ['compromise_reached'], claims: ['dc1'] }));
    expect(typeLine(claim)).toContain('compromise_reached');
    expect(system(claim)).toContain('"claimId"');
    const exit = withDyn(dyn({ types: ['compromise_reached'], exits: ['dx1'] }));
    expect(system(exit)).toContain('"exitId"');
  });

  it('a holder\'s compromat is named by holder only, never its content', () => {
    const text = prompt(withDyn(dyn({ types: ['compromat_mentioned'], compromat: [ANN] })));
    expect(text).toContain('HOLDER COMPROMAT');
    expect(text).toContain(ANN);
  });
});

describe('what a reading may report about the dynamic', () => {
  const ev = (over: Record<string, unknown>) => ({ type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she yields', confidence: 0.9, response: 'yielded', ...over });
  const read = (events: unknown[], d: Dyn) => readIntentOutput({ events }, withDyn(d), { minConfidence: 0.5 }).intents.events;
  const PROBE = dyn({ types: ['probe_answered'], probes: [ANN] });

  it('a probe answer keeps its response and tone, for the unit that has the probe', () => {
    const [e] = read([ev({ tone: 'sincere', axis: 'space' })], PROBE);
    expect(e).toMatchObject({ type: 'probe_answered', actor: 'commander', targets: [ANN], response: 'yielded', tone: 'sincere' });
  });

  it('an unoffered type or id is dropped', () => {
    expect(read([ev({})], dyn())).toEqual([]); // nothing offered
    expect(read([ev({ type: 'milestone_accepted', milestoneId: 'dm9' })], dyn({ types: ['milestone_accepted'], milestones: ['dm1'] }))).toEqual([]); // not an open milestone
    expect(read([ev({ type: 'milestone_accepted', milestoneId: 'dm1' })], dyn({ types: ['milestone_accepted'], milestones: ['dm1'] }))).toHaveLength(1);
    expect(read([ev({ targets: ['unit_bea'] })], PROBE)).toEqual([]); // a unit with no probe (and not even here)
    expect(read([ev({ type: 'probe_observed' })], PROBE)).toEqual([]); // observed was not offered
    expect(read([ev({ type: 'offer_answered', offerId: 'do1', answer: 'accepted' })], dyn({ types: ['offer_answered'], offers: ['do2'] }))).toEqual([]);
  });

  it('a response outside the closed list drops the event', () => {
    expect(read([ev({ response: 'laughed' })], PROBE)).toEqual([]);
    expect(read([ev({ response: undefined })], PROBE)).toEqual([]);
  });

  it('tone outside TONES is dropped from the event, the event stays', () => {
    const [e] = read([ev({ tone: 'furious' })], PROBE);
    expect(e).toMatchObject({ type: 'probe_answered', response: 'yielded' });
    expect(e.tone).toBeUndefined();
  });

  it('the unit may be written as the actor; the sides are the type\'s own', () => {
    const [e] = read([ev({ actor: ANN, targets: [] })], PROBE);
    expect(e).toMatchObject({ actor: 'commander', targets: [ANN] });
  });

  it('an offer answer needs one of the five answers; a correction is kept as short text; a compromat summary is required', () => {
    const offers = dyn({ types: ['offer_answered'], offers: ['do1'] });
    const [o] = read([ev({ type: 'offer_answered', offerId: 'do1', answer: 'corrected', correction: '  slower, and from behind  ', response: undefined })], offers);
    expect(o).toMatchObject({ offerId: 'do1', answer: 'corrected', correction: 'slower, and from behind' });
    expect(read([ev({ type: 'offer_answered', offerId: 'do1', answer: 'adored', response: undefined })], offers)).toEqual([]);
    const comp = dyn({ types: ['compromat_mentioned'], compromat: [ANN] });
    expect(read([ev({ type: 'compromat_mentioned', response: undefined })], comp)).toEqual([]);
    expect(read([ev({ type: 'compromat_mentioned', summary: 'the stolen ration log', factId: 'f12', response: undefined })], comp)[0]).toMatchObject({ summary: 'the stolen ration log', factId: 'f12' });
  });

  it('a claim or an exit settles a compromise only by an id it was shown', () => {
    const d = dyn({ types: ['compromise_reached'], claims: ['dc1'], exits: ['dx1'] });
    const base = { type: 'compromise_reached', response: undefined, text: 'a smaller step' };
    expect(read([ev({ ...base, claimId: 'dc1' })], d)[0]).toMatchObject({ claimId: 'dc1' });
    expect(read([ev({ ...base, exitId: 'dx1' })], d)[0]).toMatchObject({ exitId: 'dx1' });
    expect(read([ev({ ...base, claimId: 'dc9' })], d)).toEqual([]);
  });

  it('sanitizeIntentOutput takes the offer through its context', () => {
    const out = sanitizeIntentOutput({ events: [ev({})] }, { participants: [ANN], squad: [{ id: ANN }], minConfidence: 0.5, romance: false, dynamic: PROBE });
    expect(out.intents.events).toHaveLength(1);
    expect(sanitizeIntentOutput({ events: [ev({})] }, { participants: [ANN], squad: [{ id: ANN }], minConfidence: 0.5, romance: false }).intents.events).toEqual([]);
  });
});
