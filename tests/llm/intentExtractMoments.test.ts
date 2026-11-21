import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { stagingInput } from '../../src/blocking/input';
import { resetBlockingHooks } from '../../src/engine/blocking';
import { cleanLabels } from '../../src/engine/moments/answer';
import { fireMoment } from '../../src/engine/moments/fire';
import { momentsOf } from '../../src/engine/moments/state';
import { seedRng } from '../../src/engine/rng';
import type { CampaignState } from '../../src/engine/state/types';
import { getCallType } from '../../src/llm/callTypes';
import { sanitizeStaging, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import '../../src/llm/calls/all';
import { INTENT_SNAPSHOT_INPUT } from '../development/intentSnapshotInput';
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

function scene(): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const withOpen = (sourceId = 'her_offer'): CampaignState => {
  const s = scene();
  s.scene!.exchanges = 1;
  fireMoment(s, { registries: reg }, sourceId, ANN);
  return s;
};

describe('what the reading is told about a moment', () => {
  it('no open moment → no answer or labels lines; nothing ripe → no ripe line', () => {
    const input = { ...INTENT_SNAPSHOT_INPUT, ...stagingInput(scene(), reg, [ANN]) };
    expect(input.staging!.open).toBeUndefined();
    expect(system(input)).not.toContain('"answer"');
    expect(system(input)).not.toContain('"labels"');
    expect(prompt(input)).not.toContain('OPEN');
    expect(system(input)).toContain('"ripe"');
    const none = { ...input, staging: { ...input.staging!, ripe: [] } };
    expect(system(none)).not.toContain('"ripe"');
    expect(prompt(none)).not.toContain('RIPE');
  });

  it('an open moment is offered with its three generic words and the keys of every option', () => {
    const s = withOpen('third_party');
    const staging = stagingInput(s, reg, [ANN]).staging!;
    expect(staging.open).toEqual({ id: 'm1', sourceId: 'third_party', options: ['hide', 'as is', 'show yourself'], keys: ['0', '1', '2', 'lock', 'look'] }); // the commander's room has a lock
    const input = { ...INTENT_SNAPSHOT_INPUT, staging };
    expect(system(input)).toContain('"answer"');
    expect(system(input)).toContain('"labels"');
    expect(prompt(input)).toContain('m1 — third_party');
    expect(prompt(input)).toContain('0 hide; 1 as is; 2 show yourself');
    expect(prompt(input)).toContain('extra keys: lock, look');
    expect(system(input)).not.toMatch(/expect/i); // her expected option is never in the prompt
    expect(prompt(input)).not.toMatch(/expect/i);
  });
});

describe('hostile output', () => {
  const open = { id: 'm1', sourceId: 'her_offer', options: ['accept', 'decline', 'accept carefully'], keys: ['0', '1', '2'] };
  const staging = { persons: [{ id: ANN, name: 'Ann' }], vocabulary: { posture: [], anchor: [], contact: [], worn: [] }, ripe: [], open };

  it('labels: newlines, markup and length are cleaned', () => {
    const out = sanitizeStaging({ labels: ['<b>take</b>\nit', `a${'b'.repeat(300)}`, '`ask` "her"'] }, staging).labels!;
    expect(out).toEqual(['take it', `a${'b'.repeat(39)}`, 'ask her']);
    for (const l of out) expect(l).not.toMatch(/[\n<>"`]/);
  });

  it('labels with a pronoun for the commander are dropped whole; her own "her" stays', () => {
    expect(sanitizeStaging({ labels: ['let him in', 'a', 'b'] }, staging).labels).toBeNull();
    expect(sanitizeStaging({ labels: ['ask HIS pardon', 'a', 'b'] }, staging).labels).toBeNull();
    expect(sanitizeStaging({ labels: ['ask her to wait', 'tell her', 'the shepherd'] }, staging).labels).toEqual(['ask her to wait', 'tell her', 'the shepherd']);
    expect(cleanLabels(['this', 'that', 'whichever'])).toEqual(['this', 'that', 'whichever']);
  });

  it('an answer, a ripe hint or labels that are not what was offered are dropped', () => {
    const out = sanitizeStaging({ ripe: 'third_party', answer: { option: 9, confidence: 1 }, labels: 'accept' }, staging);
    expect(out).toEqual({ blocking: [], ripe: null, answer: null, labels: null });
  });
});

describe('a reading answers, labels and hints a moment (harness)', () => {
  const setup = async (over: { open?: string | null; seed?: number } = {}) => {
    const h = harness(reg, { tweak: (s) => { s.relations[ANN]!.stateId = 'confidant'; if (over.seed !== undefined) s.rng = seedRng(over.seed); s.settings.momentFrequency = 'often'; } });
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'event' })).toBe(true);
    if (over.open !== null) {
      const d = structuredClone(h.state());
      fireMoment(d, { registries: reg }, over.open ?? 'her_offer', ANN);
      h.set(d);
    }
    h.st.groupReplies = [[reply('Ann', 'She waits.')]];
    return h;
  };
  const staging = (extra: Record<string, unknown>) => intentJson([], { staging: { blocking: [], ripe: null, answer: null, labels: null, ...extra } });

  it('labels land on the open moment and are never read (a label "obey" on a resisted option changes nothing)', async () => {
    const h = await setup();
    h.st.mainReplies = [staging({ labels: ['obey', 'obey', 'obey'] })];
    await h.controller.send('Hello');
    const open = momentsOf(h.state().scene).open!;
    expect(open.labels).toEqual(['obey', 'obey', 'obey']);
    const answered = h.dispatch({ type: 'moment/answer', payload: { momentId: open.id, key: '1' } });
    expect(answered.find((e) => e.type === 'moment_answered')).toMatchObject({ key: '1', responseType: 'resisted', gap: 'partial', via: 'chip' });
    const sent = h.st.calls.find((c) => (c.system ?? '').includes('rules referee')) as { prompt: string };
    expect(sent.prompt).toContain('OPEN');
  });

  it('free text maps to an option: { option: 2, confidence: 0.7, tone: ironic } answers it', async () => {
    const h = await setup();
    h.st.mainReplies = [staging({ answer: { option: 2, confidence: 0.7, tone: 'ironic' } })];
    await h.controller.send('Carefully, then.');
    const m = momentsOf(h.state().scene);
    expect(m.open).toBeUndefined();
    expect(m.lastAnswer).toMatchObject({ momentId: 'm1', key: '2', via: 'text', tone: 'ironic', type: 'returned', gap: 'matched' });
    expect(h.toasts.filter((t) => t.kind === 'error')).toEqual([]);
  });

  it('an answer below 0.55 leaves the moment open', async () => {
    const h = await setup();
    h.st.mainReplies = [staging({ answer: { option: 2, confidence: 0.5 } })];
    await h.controller.send('Hm.');
    expect(momentsOf(h.state().scene).open?.id).toBe('m1');
  });

  it('a ripe hint reaches the pass: it opens the moment of that source, and the same seeds open nothing without it', async () => {
    let fired = 0;
    let quiet = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const withHint = await setup({ open: null, seed });
      withHint.st.mainReplies = [staging({ ripe: 'her_offer' })];
      await withHint.controller.send('Hello');
      if (momentsOf(withHint.state().scene).open?.sourceId === 'her_offer') fired++;
      const without = await setup({ open: null, seed });
      without.st.mainReplies = [staging({})];
      await without.controller.send('Hello');
      if (momentsOf(without.state().scene).open !== undefined) quiet++;
    }
    expect(fired).toBeGreaterThan(0);
    expect(quiet).toBe(0);
  });
});
