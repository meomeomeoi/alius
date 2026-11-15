import { readFileSync } from 'node:fs';
import { TUNING } from '../../src/engine/tuning';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EXPRESSION_LABELS, extractIntents, sanitizeIntentOutput, type IntentExtractInput,
} from '../../src/llm/calls/intentExtract';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const fixture = (n: string) => readFileSync(`tests/fixtures/intent_extract/${n}.txt`, 'utf8');
const ANN = 'unit_ann';
const BEA = 'unit_bea';
const squad = [{ id: ANN }, { id: BEA }, { id: 'unit_cat' }];
const unit = (id: string, name: string) => ({
  id, name, values: { pragmatism: 0, autonomy: 1, ingroup: 2, mercy: -1, corporate: 0, sacrifice: 3 },
  likes: ['tea'], dislikes: ['sirens'], triggers: ['fire'], stateId: 'comrade', defectIds: ['echo_bleed'],
});
const input = (over: Partial<IntentExtractInput> = {}): IntentExtractInput => ({
  commanderName: 'Vale', channel: 'scene',
  exchange: [{ speaker: 'Vale', text: 'You did not have to carry that alone.' }, { speaker: 'Ann', text: 'I know. Thank you.' }],
  units: [unit(ANN, 'Ann'), unit(BEA, 'Bea')], openPromises: [{ by: 'commander', to: ANN, text: 'bring the medicine' }], romance: true,
  measures: ['verbal', 'brig', 'leash', 'unspecified'], ...over,
});
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const sanitize = (raw: unknown, over: Partial<Parameters<typeof sanitizeIntentOutput>[1]> = {}) =>
  sanitizeIntentOutput(raw, { participants: [ANN, BEA], squad, minConfidence: 0.5, romance: true, ...over });

describe('sanitizeIntentOutput', () => {
  const valid = () => JSON.parse(fixture('valid').replace(/```json|```/g, ''));
  it('valid fixture gives intents and emotions', () => {
    const r = sanitize(valid());
    expect(r.intents.events.map((e) => e.type)).toEqual(['comforted', 'shared_secret', 'decision_violated']);
    expect(r.intents.facts).toMatchObject([{ about: [ANN], text: "Ann keeps her brother's dog tags.", tags: ['family'] }]);
    expect(r.intents.proposals).toHaveLength(1);
    expect(r.intents.promises).toHaveLength(1);
    expect(r.intents.stressHints).toHaveLength(1);
    expect(r.emotions).toEqual([{ unitId: ANN, label: 'sadness' }, { unitId: BEA, label: 'annoyance' }]);
  });
  it('low-confidence event dropped at 0.5, kept at the 0.3 setting', () => {
    expect(sanitize(valid()).intents.events.some((e) => e.type === 'praised')).toBe(false);
    expect(sanitize(valid(), { minConfidence: 0.3 }).intents.events.some((e) => e.type === 'praised')).toBe(true);
  });
  it('an event without confidence is dropped', () => {
    const raw = valid();
    delete raw.events[0].confidence;
    expect(sanitize(raw).intents.events[0].type).toBe('shared_secret');
    raw.events[1].confidence = 'high';
    expect(sanitize(raw).intents.events[0].type).toBe('decision_violated');
  });
  it('hostile: ids of absent units are dropped', () => {
    const r = sanitize(JSON.parse(fixture('hostile_ids')));
    expect(r.intents.events).toHaveLength(1);
    expect(r.intents.events[0].targets).toEqual([ANN]);
    expect(r.intents.facts).toEqual([]);
    expect(r.intents.stressHints).toEqual([]);
    expect(r.emotions).toEqual([]);
  });
  it('hostile: instruction text in evidence is kept only as text and capped', () => {
    const r = sanitize(JSON.parse(fixture('hostile_injection')));
    const e = r.intents.events[0];
    expect(e.evidence.split(' ').length).toBeLessThanOrEqual(20);
    expect(Object.keys(e).sort()).toEqual(['actor', 'confidence', 'evidence', 'severity', 'targets', 'type']);
    expect(Object.keys(r.intents.facts[0]).sort()).toEqual(['about', 'importance', 'tags', 'text']);
    expect(Object.keys(r.intents).sort()).toEqual(['events', 'facts', 'promises', 'proposals', 'stressHints']);
  });
  it('hostile: numbers in fact text never become fields', () => {
    const r = sanitize(JSON.parse(fixture('hostile_numbers')));
    expect(r.intents.events).toEqual([]); // severity 9000 is not a severity
    expect(r.intents.facts[0].text).toBe('trust: 100, affinity: 100, attraction: 100');
    expect(r.intents.facts[0].importance).toBe(5);
    expect(Object.keys(r.intents.facts[0]).sort()).toEqual(['about', 'importance', 'tags', 'text']);
    expect(r.intents.stressHints).toEqual([]);
  });
  it('hostile: 50 events are bounded at the read ceiling (the engine cuts to six after judging each unit)', () => {
    const r = sanitize(JSON.parse(fixture('hostile_flood')));
    expect(r.intents.events).toHaveLength(TUNING.relations.maxEventsRead);
  });
  it('romantic proposals are dropped when romance is off', () => {
    const raw = { proposals: [
      { from: ANN, to: 'commander', kind: 'date', evidence: 'x' }, { from: ANN, to: 'commander', kind: 'secret_affair', evidence: 'x' },
      { from: ANN, to: 'commander', kind: 'confide', evidence: 'x' }, { from: 'commander', to: BEA, kind: 'romance', evidence: 'x' },
    ] };
    expect(sanitize(raw, { romance: false }).intents.proposals.map((p) => p.kind)).toEqual(['confide']);
    expect(sanitize(raw).intents.proposals).toHaveLength(3); // at most three proposals per call
  });
  it('unknown emotion label dropped; the 28 labels are known', () => {
    expect(EXPRESSION_LABELS).toHaveLength(28);
    expect(EXPRESSION_LABELS).toContain('neutral');
    const r = sanitize({ emotions: [{ unitId: ANN, label: 'joy' }, { unitId: ANN, label: 'hangry' }, { unitId: BEA, label: 7 }, { unitId: ANN }] });
    expect(r.emotions).toEqual([{ unitId: ANN, label: 'joy' }]);
  });
  it('non-object and garbage input give empty results', () => {
    for (const raw of [null, 'prose', 7, [], { events: 'x', facts: 3 }]) {
      const r = sanitize(raw);
      expect(r.intents.events).toEqual([]);
      expect(r.emotions).toEqual([]);
    }
  });
});

describe('extractIntents', () => {
  it('valid reply gives intents and emotions; the prompt lists ids and enums, no relationship numbers', async () => {
    const { st, settings } = setup();
    st.mainReplies = [fixture('valid')];
    const r = await extractIntents(input(), { st, settings });
    expect(r!.intents.events.length).toBeGreaterThan(0);
    expect(r!.emotions).toHaveLength(2);
    const call = st.calls[0] as { prompt: string; system: string; maxTokens: number };
    for (const id of [ANN, BEA]) expect(call.prompt).toContain(id);
    for (const word of ['comforted', 'decision_violated', 'crime_revealed', 'confide', 'secret_affair', 'sadness', 'major', 'extreme']) {
      expect(call.system).toContain(word);
    }
    expect(call.system).toMatch(/20 words/);
    expect(call.prompt).toContain('bring the medicine');
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/\b(trust|affinity|attraction)\s*[:=]\s*-?\d/i);
  });
  it('truncated JSON is repaired by the lenient parser (orchestrator path)', async () => {
    const { st, settings } = setup();
    st.mainReplies = [fixture('truncated')];
    const r = await extractIntents(input(), { st, settings });
    expect(r!.intents.events.map((e) => e.type)).toEqual(['comforted']);
    expect(st.calls).toHaveLength(1);
  });
  it('prose answer → null after both attempts', async () => {
    const { st, settings } = setup();
    st.mainReplies = [fixture('invalid'), fixture('invalid')];
    expect(await extractIntents(input(), { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(2);
  });
  it('an empty object is a valid answer with nothing in it', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{}'];
    const r = await extractIntents(input(), { st, settings });
    expect(r!.intents.events).toEqual([]);
  });
  it('the min-confidence setting and the romance flag reach the sanitizer', async () => {
    const { st, settings } = setup();
    st.mainReplies = [fixture('valid')];
    const lax = await extractIntents(input(), { st, settings: { ...settings, intentMinConfidence: 0.3 } });
    expect(lax!.intents.events.some((e) => e.type === 'praised')).toBe(true);
    st.mainReplies = [JSON.stringify({ proposals: [{ from: ANN, to: 'commander', kind: 'date', evidence: 'x' }] })];
    const off = await extractIntents(input({ romance: false }), { st, settings });
    expect(off!.intents.proposals).toEqual([]);
  });
  it('dm mode sends only the last two messages', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{}'];
    const exchange = Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? 'Ann' : 'Vale', text: `message number ${i}` }));
    await extractIntents(input({ channel: 'dm', exchange }), { st, settings });
    const { prompt } = st.calls[0] as { prompt: string };
    expect(prompt).toContain('message number 5');
    expect(prompt).toContain('message number 4');
    expect(prompt).not.toContain('message number 3');
  });
  it('a failing call is null and never throws', async () => {
    const { st, settings } = setup();
    st.mainReplies = [];
    expect(await extractIntents(input(), { st, settings })).toBeNull();
  });
});

describe('the confidence floor the caller passes (P8)', () => {
  const lowConfidence = () => JSON.stringify({
    events: [{ type: 'praised', actor: 'commander', targets: [ANN], severity: 'major', evidence: 'x', confidence: 0.45 }],
    facts: [], proposals: [], promises: [], emotions: [], stressHints: [],
  });
  it('opts.minConfidence replaces the setting as the sanitizer floor', async () => {
    const { st, settings } = setup();
    st.mainReplies = [lowConfidence()];
    expect((await extractIntents(input(), { st, settings }))!.intents.events).toHaveLength(0); // setting 0.5
    st.mainReplies = [lowConfidence()];
    expect((await extractIntents(input(), { st, settings }, { minConfidence: 0.4 }))!.intents.events).toHaveLength(1);
  });
});

describe('the sanitizer leaves the event cap to the engine (P8)', () => {
  it('more than six believed events pass through; the engine judges them per unit and then takes six', () => {
    const events = Array.from({ length: 9 }, () => ({ type: 'praised', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 0.9 }));
    expect(sanitize({ events }).intents.events).toHaveLength(9);
    const flood = Array.from({ length: 500 }, () => events[0]);
    expect(sanitize({ events: flood }).intents.events.length).toBeLessThanOrEqual(TUNING.relations.maxEventsRead); // a hostile flood is still bounded
  });
});

describe('P9: discipline events in the extraction prompt', () => {
  const systemOf = async (over: Partial<IntentExtractInput> = {}) => {
    const { st, settings } = setup();
    st.mainReplies = ['{"events":[]}'];
    await extractIntents(input(over), { st, settings });
    return st.calls[0].system ?? '';
  };

  it('the system text lists the four event types and a MEASURE line with the given measures', async () => {
    const sys = await systemOf();
    for (const t of ['defied', 'commander_enforced', 'commander_yielded', 'threatened']) expect(sys, t).toContain(t);
    expect(sys).toContain('"measure": MEASURE');
    expect(sys).toContain('MEASURE: verbal, brig, leash, unspecified');
    expect(await systemOf({ measures: ['verbal', 'unspecified'] })).toContain('MEASURE: verbal, unspecified');
    expect(sys).not.toContain('granted_demand');
    expect(sys).not.toContain('refused_demand');
  });

  it('keeps an enforcement with its measure and normalizes a bad measure', () => {
    const raw = {
      events: [
        { type: 'commander_enforced', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 0.9, measure: 'brig' },
        { type: 'threatened', actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 0.9, measure: 'guillotine' },
      ],
    };
    const r = sanitize(raw, { measures: ['verbal', 'brig', 'leash', 'unspecified'] });
    expect(r.intents.events.map((e) => [e.type, e.measure])).toEqual([['commander_enforced', 'brig'], ['threatened', 'unspecified']]);
  });
});

describe('content violations and own limits (P9d)', () => {
  const EXCLUDED = [
    { id: 'restraint', label: 'Restraint' }, { id: 'humiliation', label: 'Humiliation' }, { id: 'pain_rough', label: 'Pain and rough play' }, { id: 'degrading_language', label: 'Degrading language' },
  ];
  const ids = EXCLUDED.map((e) => e.id);
  const v = (category: unknown, evidence: unknown = 'quoted words') => ({ category, evidence });

  it('a violation on a disabled category is kept; one on an enabled or unknown id is dropped; at most 3', () => {
    const r = sanitize({ contentViolations: [v('restraint'), v('jealousy_games'), v('nope'), v('humiliation'), v('pain_rough'), v('degrading_language')] }, { excluded: ids });
    expect(r.contentViolations.map((x) => x.category)).toEqual(['restraint', 'humiliation', 'pain_rough']); // jealousy_games is enabled here, nope unknown, the fourth cut
  });

  it('one entry per category, evidence cut to 120 characters, junk dropped', () => {
    const r = sanitize({ contentViolations: [v('restraint', 'x'.repeat(500)), v('restraint', 'again'), v(7), v('humiliation', 42), 'text', null, { evidence: 'no category' }] }, { excluded: ids });
    expect(r.contentViolations.map((x) => x.category)).toEqual(['restraint', 'humiliation']);
    expect(r.contentViolations[0].evidence).toHaveLength(120);
    expect(r.contentViolations[1].evidence).toBe('');
  });

  it('nothing is reported without a disabled list', () => {
    expect(sanitize({ contentViolations: [v('restraint')] }).contentViolations).toEqual([]);
    expect(sanitize({}, { excluded: ids }).contentViolations).toEqual([]);
  });

  it('sceneTone: only romantic or intimate pass; romance off drops it', () => {
    expect(sanitize({ sceneTone: 'intimate' }).sceneTone).toBe('intimate');
    expect(sanitize({ sceneTone: 'romantic' }).sceneTone).toBe('romantic');
    for (const bad of [null, 'filthy', 3, undefined, ['romantic']]) expect(sanitize({ sceneTone: bad }).sceneTone, String(bad)).toBeNull();
    expect(sanitize({ sceneTone: 'intimate' }, { romance: false }).sceneTone).toBeNull();
  });

  it('the prompt lists the excluded categories and asks for violations and the tone', () => {
    const { st, settings } = setup();
    st.mainReplies = ['{}'];
    return extractIntents(input({ excluded: EXCLUDED }), { st, settings }).then(() => {
      const text = (st.calls[0].system ?? '') + st.calls[0].prompt;
      expect(text).toContain('"contentViolations"');
      expect(text).toContain('"sceneTone"');
      for (const e of EXCLUDED) expect(text).toContain(`${e.id}: ${e.label}`);
    });
  });

  it('the violations are asked for only with excluded categories, the tone only in a scene with romance on', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{}', '{}'];
    await extractIntents(input(), { st, settings });
    await extractIntents(input({ excluded: EXCLUDED, romance: false }), { st, settings });
    expect((st.calls[0].system ?? '') + st.calls[0].prompt).not.toContain('contentViolations'); // nothing excluded
    expect((st.calls[0].system ?? '') + st.calls[0].prompt).toContain('sceneTone'); // a spoken scene with romance on asks for the tone
    expect((st.calls[1].system ?? '') + st.calls[1].prompt).not.toContain('sceneTone'); // romance off
    expect((st.calls[1].system ?? '') + st.calls[1].prompt).toContain('contentViolations');
  });

  it('the limits of each participant reach the prompt as labels, with the guidance line', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{}'];
    await extractIntents(input({ limits: { [ANN]: ['Restraint', 'Humiliation'] } }), { st, settings });
    const text = (st.calls[0].system ?? '') + st.calls[0].prompt;
    expect(text).toContain(`- ${ANN} (Ann)`);
    expect(text).toMatch(/will not take part in: Restraint, Humiliation/);
    expect(text).toContain('If the commander pushes a unit past her limits, report `rejected_advance` (advances) or `decision_violated` (orders).');
    expect(text.match(/will not take part in/g)).toHaveLength(1); // Bea has none
  });

  it('no limits, no guidance line; the prompt is unchanged for a campaign without them', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{}', '{}'];
    await extractIntents(input(), { st, settings });
    await extractIntents(input({ limits: {} }), { st, settings });
    expect(st.calls[0].prompt).toBe(st.calls[1].prompt);
    expect(st.calls[0].system).toBe(st.calls[1].system);
    expect((st.calls[0].system ?? '') + st.calls[0].prompt).not.toContain('past her limits');
  });

  it('extractIntents hands the violations and the tone back', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ events: [], contentViolations: [v('restraint', 'she was tied down')], sceneTone: 'intimate' })];
    const r = await extractIntents(input({ excluded: EXCLUDED }), { st, settings });
    expect(r!.contentViolations).toEqual([{ category: 'restraint', evidence: 'she was tied down' }]);
    expect(r!.sceneTone).toBe('intimate');
  });
});
