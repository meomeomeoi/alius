import { readFileSync } from 'node:fs';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { stagingInput } from '../../src/blocking/input';
import { registerFrameReader, resetBlockingHooks, COMMANDER } from '../../src/engine/blocking';
import { blockingVocabulary } from '../../src/engine/blocking/vocabulary';
import type { CampaignState } from '../../src/engine/state/types';
import { getCallType } from '../../src/llm/callTypes';
import { readIntentOutput, sanitizeStaging, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';
import { enable, withBond } from '../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../helpers/loyalty';
import { ANN, harness, intentJson, reply } from '../helpers/sceneHarness';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetBlockingHooks());

const ct = () => getCallType('intent_extract')!;
const system = (i: IntentExtractInput) => ct().system(i) as string;
const prompt = (i: IntentExtractInput) => ct().prompt(i) as string;

function scene(over: { stateId?: string; on?: string[]; loc?: string } = {}): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: over.stateId ?? 'confidant' });
  if (over.on) enable(s, ...over.on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: over.loc ?? 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
type Staging = NonNullable<IntentExtractInput['staging']>;
const STAGING: Staging = {
  persons: [{ id: ANN, name: 'Ann' }, { id: COMMANDER, name: 'Vale' }],
  vocabulary: { posture: ['sitting', 'kneeling_upright'], anchor: ['at_desk', 'beside_her'], contact: ['foot_worship', 'spooning'], worn: ['hood', 'collar'] },
  ripe: ['her_offer', 'time'],
  open: { id: 'm1', sourceId: 'her_offer', options: ['accept', 'decline', 'accept carefully'], keys: ['0', '1', '2', 'look'] },
};
const withStaging = (staging: Staging = STAGING): IntentExtractInput => ({ ...INTENT_SNAPSHOT_INPUT, staging });
const change = (over: Record<string, unknown> = {}) => ({ person: COMMANDER, field: 'posture', value: 'sitting', confidence: 0.9, ...over });

describe('the prompt', () => {
  const pinned = readFileSync('tests/fixtures/intent_extract/prompt_without_reading.txt', 'utf8');

  it('without staging is byte-identical (the pinned text), with the field absent', () => {
    expect(`${system(INTENT_SNAPSHOT_INPUT)}\n=====\n${prompt(INTENT_SNAPSHOT_INPUT)}\n`).toBe(pinned);
    expect(`${system({ ...INTENT_SNAPSHOT_INPUT, staging: undefined })}\n=====\n${prompt({ ...INTENT_SNAPSHOT_INPUT, staging: undefined })}\n`).toBe(pinned);
    expect(pinned).not.toMatch(/staging|STAGING/i);
  });

  it('with staging: the output block, the closed vocabulary, the persons, the ripe list and the open moment', () => {
    const sys = system(withStaging());
    expect(sys).toContain('"staging"');
    expect(sys).toContain('"blocking"');
    expect(sys).toContain('"answer"');
    expect(sys).toContain('"labels"');
    const p = prompt(withStaging());
    expect(p).toContain('STAGING');
    expect(p).toContain('sitting, kneeling_upright');
    expect(p).toContain('foot_worship, spooning');
    expect(p).toContain('hood, collar');
    expect(p).toContain('her_offer, time');
    expect(p).toContain('m1');
    expect(p).toContain('accept carefully');
    expect(p).toContain(`${ANN} (Ann)`);
    expect(p).toContain(`${COMMANDER} (Vale)`);
  });

  it('with no open moment and nothing ripe, the answer and the ripe are not asked for', () => {
    const bare: Staging = { ...STAGING, ripe: [], open: undefined };
    const sys = system(withStaging(bare));
    expect(sys).toContain('"blocking"');
    expect(sys).not.toContain('"answer"');
    expect(sys).not.toContain('"ripe"');
    expect(sys).not.toContain('"labels"');
  });

  it('is never offered an activity', () => {
    expect(system(withStaging())).not.toMatch(/"activity"|field.*activity/);
    expect(prompt(withStaging())).not.toMatch(/activity/i);
  });

  it('the budget default is 700', () => {
    expect(DEFAULT_SETTINGS.budgets.intent_extract).toBe(700);
  });
});

describe('stagingInput: the vocabulary is filtered', () => {
  it('nothing while the blocking is not live', () => {
    expect(stagingInput(scene({ stateId: 'comrade' }), reg, [ANN])).toEqual({});
    expect(stagingInput(campaign(reg, 4), reg, [ANN])).toEqual({});
  });

  it('a disabled tag, a dynamic contact, her own limit and an anchor whose affordance is missing are absent from the vocabulary and from the prompt', () => {
    const s = scene({ loc: 'mess_hall' });
    const v = stagingInput(s, reg, [ANN]).staging!;
    expect(v.vocabulary.worn).not.toContain('blindfold'); // restraint is off
    expect(v.vocabulary.worn).toContain('collar'); // untagged
    expect(v.vocabulary.contact).not.toContain('human_chair'); // dynamic, tag off
    expect(v.vocabulary.contact).toContain('holding_hands'); // any, untagged
    expect(v.vocabulary.anchor).not.toContain('under_desk'); // no desk in the mess
    expect(v.vocabulary.anchor).toContain('beside_her');
    expect(v.vocabulary.posture).toHaveLength(13);
    const text = prompt({ ...INTENT_SNAPSHOT_INPUT, ...stagingInput(s, reg, [ANN]) });
    for (const id of ['blindfold', 'human_chair', 'under_desk']) expect(text, id).not.toContain(id);
    expect(v.persons).toEqual([{ id: ANN, name: 'Ann' }, { id: COMMANDER, name: 'Vale' }]);
  });

  it('turning the tag on, the frame to play and the room to one with a desk adds them back; her own limit takes them out again', () => {
    registerFrameReader(() => 'play');
    const s = scene({ loc: 'quarters_commander', on: ['restraint', 'objectification'] });
    const v = stagingInput(s, reg, [ANN]).staging!;
    expect(v.vocabulary.worn).toEqual(expect.arrayContaining(['blindfold', 'hood']));
    expect(v.vocabulary.contact).toContain('human_chair');
    expect(v.vocabulary.anchor).toEqual(expect.arrayContaining(['under_desk', 'on_bunk']));
    withBond(s, ANN, { ownLimits: { categories: ['restraint'] } });
    const limited = stagingInput(s, reg, [ANN]).staging!;
    expect(limited.vocabulary.worn).not.toContain('blindfold');
    expect(limited.vocabulary.contact).toContain('human_chair'); // objectification only
  });

  it('blockingVocabulary is the same filter, as entries', () => {
    const s = scene({ loc: 'mess_hall' });
    const v = blockingVocabulary(s, reg);
    expect(v.anchor.map((e) => e.id)).not.toContain('under_desk');
    expect(v.item.map((e) => e.id)).not.toContain('blindfold');
    expect(v.activity.map((e) => e.id)).toContain('on_comms');
  });

  it('ripe lists the allowed sources the reading may name; a quiet meeting narrows them to its own', () => {
    const s = scene();
    const ripe = stagingInput(s, reg, [ANN]).staging!.ripe;
    expect(ripe).toEqual(expect.arrayContaining(['her_offer', 'her_silence', 'time']));
    expect(ripe).not.toContain('her_demand'); // external and dynamic
    expect(ripe).not.toContain('third_party'); // not an extracted source
    const quiet = structuredClone(s);
    quiet.scene!.pastime = { id: 'fix_gear', unitId: ANN };
    const meeting = stagingInput(quiet, reg, [ANN]).staging!.ripe;
    expect(meeting.sort()).toEqual(['her_affection', 'her_question', 'her_weakness', 'memory_surfaces'].sort());
  });
});

describe('sanitizeStaging', () => {
  const clean = (raw: unknown, staging: Staging = STAGING) => sanitizeStaging(raw, staging);

  it('keeps a valid change and normalizes it', () => {
    const out = clean({ blocking: [change(), change({ person: ANN, field: 'contact', value: 'spooning', with: COMMANDER, direction: 'to' }), change({ field: 'anchor', value: 'beside_her', relTo: ANN }), change({ field: 'worn', value: 'hood' }), change({ field: 'removed', value: 'hood' })] })!;
    expect(out.blocking).toEqual([
      { person: COMMANDER, field: 'posture', value: 'sitting', confidence: 0.9 },
      { person: ANN, field: 'contact', value: 'spooning', with: COMMANDER, direction: 'to', confidence: 0.9 },
      { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN, confidence: 0.9 },
      { person: COMMANDER, field: 'worn', value: 'hood', confidence: 0.9 },
    ]); // the fifth (removed) is over the limit of four
  });

  it('drops unknown ids, other fields (activity), people who are not there and low confidence', () => {
    const out = clean({ blocking: [
      change({ value: 'levitating' }), change({ field: 'activity', value: 'on_comms' }), change({ field: 'intimacy', value: 'close' }), change({ person: 'unit_zed' }),
      change({ confidence: 0.59 }), change({ confidence: 'high' }), change({ field: 'contact', value: 'human_chair', with: ANN }), change({ field: 'removed', value: 'blindfold' }),
      change({ field: 'anchor', value: 'beside_her', relTo: 'unit_zed' }), change({ field: 'contact', value: 'spooning', with: 'unit_zed' }), change({ field: 'contact', value: 'spooning', with: ANN, direction: 'sideways' }),
      'nonsense', null, change({ value: 3 }),
    ] })!;
    expect(out.blocking).toEqual([]);
  });

  it('keeps at most four changes, a fifth is dropped', () => {
    const out = clean({ blocking: Array.from({ length: 6 }, (_, i) => change({ value: i % 2 === 0 ? 'sitting' : 'kneeling_upright' })) })!;
    expect(out.blocking).toHaveLength(4);
  });

  it('an answer needs an open moment and enough confidence; its key is one of the moment\'s', () => {
    expect(clean({ answer: { option: 1, confidence: 0.9, tone: 'ironic' } })!.answer).toEqual({ key: '1', confidence: 0.9, tone: 'ironic' });
    expect(clean({ answer: { option: 'look', confidence: 0.8, tone: 'flat' } })!.answer).toEqual({ key: 'look', confidence: 0.8, tone: 'flat' });
    expect(clean({ answer: { option: 1, confidence: 0.54, tone: 'flat' } })!.answer).toBeNull();
    expect(clean({ answer: { option: 1, confidence: 0.55, tone: 'flat' } })!.answer).not.toBeNull();
    expect(clean({ answer: { option: 'lock', confidence: 0.9 } })!.answer).toBeNull(); // not one of its keys
    expect(clean({ answer: { option: 3, confidence: 0.9 } })!.answer).toBeNull();
    expect(clean({ answer: { option: 1, confidence: 0.9, tone: 'sarcastic' } })!.answer).toEqual({ key: '1', confidence: 0.9 });
    expect(clean({ answer: { option: 1, confidence: 0.9, tone: 'flat' } }, { ...STAGING, open: undefined })!.answer).toBeNull(); // no open moment
  });

  it('ripe must be one of the listed sources', () => {
    expect(clean({ ripe: 'time' })!.ripe).toBe('time');
    expect(clean({ ripe: 'third_party' })!.ripe).toBeNull();
    expect(clean({ ripe: 7 })!.ripe).toBeNull();
    expect(clean({ ripe: 'time' }, { ...STAGING, ripe: [] })!.ripe).toBeNull();
  });

  it('labels: exactly three, quotes stripped, each cut at 40 characters; otherwise none', () => {
    expect(clean({ labels: ['"Take it."', 'Say no', `x${'y'.repeat(60)}`] })!.labels).toEqual(['Take it.', 'Say no', `x${'y'.repeat(39)}`]);
    expect(clean({ labels: ['one', 'two'] })!.labels).toBeNull();
    expect(clean({ labels: ['one', 'two', 'three', 'four'] })!.labels).toBeNull();
    expect(clean({ labels: ['one', '', 'three'] })!.labels).toBeNull();
    expect(clean({ labels: ['one', 2, 'three'] })!.labels).toBeNull();
    expect(clean({ labels: ['one', 'two', 'three'] }, { ...STAGING, open: undefined })!.labels).toBeNull();
  });

  it('anything that is not an object gives an empty reading', () => {
    for (const raw of [null, undefined, 'x', 3, []]) expect(clean(raw)).toEqual({ blocking: [], ripe: null, answer: null, labels: null });
  });
});

describe('readIntentOutput', () => {
  it('returns staging only when it was asked for', () => {
    const raw = { events: [], staging: { blocking: [change()] } };
    expect(readIntentOutput(raw, INTENT_SNAPSHOT_INPUT, { minConfidence: 0.5 }).staging).toBeUndefined();
    expect(readIntentOutput(raw, withStaging(), { minConfidence: 0.5 }).staging!.blocking).toHaveLength(1);
    expect(readIntentOutput({ events: [] }, withStaging(), { minConfidence: 0.5 }).staging).toEqual({ blocking: [], ripe: null, answer: null, labels: null });
  });
});

describe('a reading\'s change lands and rolls back with the reading (harness)', () => {
  const setup = async () => {
    const h = harness(reg, { tweak: (s) => { s.relations[ANN]!.stateId = 'confidant'; } });
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'event' })).toBe(true);
    h.st.groupReplies = [[reply('Ann', 'first answer')]];
    h.st.swipeReplies = [reply('Ann', 'second answer')];
    h.st.on('message_swiped', (i) => h.controller.onSwipe(i as number));
    return h;
  };
  const report = (value = 'kneeling_upright') => intentJson([], { staging: { blocking: [{ person: COMMANDER, field: 'posture', value, confidence: 0.9 }], ripe: null, answer: null, labels: null } });

  it('the posture lands with source reading, the prompt offered the vocabulary, and a swipe takes it back', async () => {
    const h = await setup();
    h.st.mainReplies = [report(), intentJson()];
    await h.controller.send('Hello');
    const sent = (h.st.calls.find((c) => (c.system ?? '').includes('rules referee')) as { system: string; prompt: string });
    expect(sent.prompt).toContain('STAGING');
    expect(h.state().scene!.blocking![COMMANDER]).toEqual({ posture: 'kneeling_upright' });
    expect(h.state().scene!.stagingLog![0]!.at).toBe(h.state().scene!.readIndex);
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(h.state().scene!.blocking).toBeUndefined();
  });

  it('an invalid change in a reading is dropped silently and the rest of the reading still lands', async () => {
    const h = await setup();
    h.st.mainReplies = [intentJson([], { staging: { blocking: [{ person: COMMANDER, field: 'worn', value: 'blindfold', confidence: 0.9 }, { person: COMMANDER, field: 'posture', value: 'sitting', confidence: 0.9 }] } })];
    await h.controller.send('Hello');
    expect(h.state().scene!.blocking![COMMANDER]).toEqual({ posture: 'sitting' }); // blindfold: restraint is off, not even offered (dropped by the sanitizer)
    expect(h.toasts.filter((t) => t.kind === 'error')).toEqual([]);
  });

  it('not live: the prompt is the old one and a staging block in the answer is ignored', async () => {
    const h = harness(reg);
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'event' })).toBe(true);
    h.st.groupReplies = [[reply('Ann', 'hi')]];
    h.st.mainReplies = [report()];
    await h.controller.send('Hello');
    const sent = h.st.calls.find((c) => (c.system ?? '').includes('rules referee')) as { system: string; prompt: string };
    expect(sent.prompt).not.toContain('STAGING');
    expect(sent.system).not.toContain('"staging"');
    expect(h.state().scene!.blocking).toBeUndefined();
  });
});
