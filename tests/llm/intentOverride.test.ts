import { beforeEach, describe, expect, it } from 'vitest';
import { sanitizeIntentOutput, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import { extractIntents } from '../helpers/calls';
import { getCallType } from '../../src/llm/callTypes';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const BEA = 'unit_bea';
const input = (over: Partial<IntentExtractInput> = {}): IntentExtractInput => ({
  commanderName: 'Vale', channel: 'scene', exchange: [{ speaker: 'Vale', text: 'Train with me, and you keep watch.' }, { speaker: 'Bea', text: 'Fine. That I can accept.' }],
  units: [{ id: BEA, name: 'Bea', values: { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 }, likes: [], dislikes: [], triggers: [], stateId: 'stranger', defectIds: [] }],
  openPromises: [], romance: false, measures: ['verbal'], ...over,
});
const ct = () => getCallType('intent_extract')!;
const types = (system: string): string[] => (/EVENT_TYPE: (.*)/.exec(system)?.[1] ?? '').split(', ');

describe('OVERRIDE in the extraction input', () => {
  it('is listed, with compromise_reached and overrideId, only while one is open', () => {
    const none = ct().system(input());
    expect(none).not.toContain('OVERRIDE');
    expect(types(none)).not.toContain('compromise_reached');
    const withOv = input({ overrides: [{ id: 'ov1', order: 'Train with Ann', alternative: 'Train with Bea' }] });
    expect(ct().prompt(withOv)).toContain('OVERRIDE (id — the commander\'s order; what she wants instead):');
    expect(ct().prompt(withOv)).toContain('- ov1 — Train with Ann; Train with Bea');
    expect(types(ct().system(withOv))).toContain('compromise_reached');
    expect(types(ct().system(withOv))).not.toContain('rule_kept'); // the rule events are still tied to RULES
    expect(ct().system(withOv)).toContain('overrideId');
  });

  it('with rules and an override both offered', () => {
    const both = input({ overrides: [{ id: 'ov1', order: 'a', alternative: 'b' }], rules: [{ id: 'r1', unitId: BEA, text: 'x', status: 'negotiating' }] });
    expect(types(ct().system(both))).toEqual(expect.arrayContaining(['compromise_reached', 'rule_kept']));
  });

  it('a prompt with none is unchanged by the feature', () => {
    expect(ct().prompt(input())).not.toContain('OVERRIDE');
  });
});

describe('sanitizing a compromise for an override', () => {
  const event = (over: Record<string, unknown> = {}) => ({ events: [{ type: 'compromise_reached', actor: 'commander', targets: [BEA], severity: 'minor', evidence: 'she agrees', confidence: 0.9, overrideId: 'ov1', text: 'We train together.', ...over }] });
  const sanitize = (raw: unknown, overrides?: string[]) => sanitizeIntentOutput(raw, { participants: [BEA], squad: [{ id: BEA }], minConfidence: 0.5, romance: false, ...(overrides ? { overrides } : {}) });

  it('keeps one that names an open override', () => {
    const e = sanitize(event(), ['ov1']).intents.events;
    expect(e).toHaveLength(1);
    expect(e[0]).toMatchObject({ type: 'compromise_reached', overrideId: 'ov1', text: 'We train together.' });
  });

  it('drops an unknown id, one with no list, and one with no id and no rule', () => {
    expect(sanitize(event({ overrideId: 'ov9' }), ['ov1']).intents.events).toHaveLength(0);
    expect(sanitize(event()).intents.events).toHaveLength(0);
    expect(sanitize(event({ overrideId: undefined }), ['ov1']).intents.events).toHaveLength(0);
  });

  it('extractIntents passes the open ids through', async () => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.mainReplies = [JSON.stringify(event())];
    const r = await extractIntents(input({ overrides: [{ id: 'ov1', order: 'a', alternative: 'b' }] }), { st, settings: getSettings(st) });
    expect(r!.intents.events[0]).toMatchObject({ overrideId: 'ov1' });
  });
});

describe('CONSPIRE in the extraction input', () => {
  it('is offered only with a unit to name, and the instruction gives the commander no pronoun', () => {
    expect(types(ct().system(input()))).not.toContain('conspired');
    const withUnit = input({ conspire: [BEA] });
    expect(types(ct().system(withUnit))).toContain('conspired');
    expect(ct().prompt(withUnit)).toContain(`CONSPIRE (units the commander may enlist): ${BEA}`);
    const line = ct().system(withUnit).split('\n').find((l) => l.startsWith('"conspired"')) ?? '';
    expect(line.length).toBeGreaterThan(0);
    expect(line).not.toMatch(/\b(he|him|his|they|them|their|themselves?)\b/i);
  });
});

