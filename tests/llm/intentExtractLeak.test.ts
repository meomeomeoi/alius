import { beforeEach, describe, expect, it } from 'vitest';
import { extractIntents, sanitizeIntentOutput, type IntentExtractInput } from '../../src/llm/calls/intentExtract';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const ANN = 'unit_ann';
const unit = { id: ANN, name: 'Ann', values: {}, likes: [], dislikes: [], triggers: [], stateId: 'comrade', defectIds: [] };
const input = (over: Partial<IntentExtractInput> = {}): IntentExtractInput => ({
  commanderName: 'Vale', channel: 'scene', exchange: [{ speaker: 'Vale', text: 'I know you want to refuse.' }, { speaker: 'Ann', text: 'How?' }],
  units: [unit], openPromises: [], romance: false, measures: ['verbal', 'leash', 'unspecified'], ...over,
});
const call = async (i: IntentExtractInput, reply = '{}') => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  st.mainReplies = [reply];
  const out = await extractIntents(i, { st, settings: getSettings(st) });
  return { calls: st.calls as Array<{ system: string; prompt: string }>, out };
};
const items = [{ id: 'fq1', unitId: ANN, gist: 'she means to refuse the next order' }];

describe('intent_extract and the intercepted items (P12)', () => {
  it('offers knowledge_leak only with intercepted items', async () => {
    const without = await call(input());
    expect(without.calls[0].system).not.toContain('knowledge_leak');
    expect(without.calls[0].system).not.toContain('INTERCEPTED');
    expect(without.calls[0].prompt).not.toContain('INTERCEPTED');
    const withItems = await call(input({ intercepted: items }));
    expect(withItems.calls[0].system).toContain('knowledge_leak');
    expect(withItems.calls[0].system).toContain('INTERCEPTED');
    expect(withItems.calls[0].prompt).toContain('INTERCEPTED');
  });

  it('an empty list reads exactly like no list (the prompt stays byte-equal)', async () => {
    const a = await call(input());
    const b = await call(input({ intercepted: [] }));
    expect(b.calls[0]).toEqual(a.calls[0]);
  });

  it('the block lists id, unit and gist and never says whether an item is true', async () => {
    const { calls } = await call(input({ intercepted: [...items, { id: 'fq2', unitId: ANN, gist: 'she keeps nothing from the commander' }] }));
    const block = calls[0].prompt.slice(calls[0].prompt.indexOf('INTERCEPTED'), calls[0].prompt.indexOf('<exchange>'));
    expect(block).toContain('- fq1 — unit_ann: she means to refuse the next order');
    expect(block).toContain('- fq2 — unit_ann: she keeps nothing from the commander');
    expect(block).not.toMatch(/\b(true|false|real|fake|distorted)\b/i);
  });

  it('a reported leak with a listed id survives sanitizing; an unlisted id is dropped', async () => {
    const leak = (itemId: string) => JSON.stringify({ events: [{ type: 'knowledge_leak', actor: 'commander', targets: [ANN], severity: 'minor', itemId, evidence: 'I know', confidence: 0.9 }] });
    expect((await call(input({ intercepted: items }), leak('fq1'))).out!.intents.events[0]).toMatchObject({ type: 'knowledge_leak', itemId: 'fq1' });
    expect((await call(input({ intercepted: items }), leak('fq7'))).out!.intents.events).toEqual([]);
    expect((await call(input(), leak('fq1'))).out!.intents.events).toEqual([]);
  });

  it('sanitizeIntentOutput passes the listed ids to the validator', () => {
    const raw = { events: [{ type: 'knowledge_leak', actor: 'commander', targets: [ANN], severity: 'minor', itemId: 'fq1', evidence: 'x', confidence: 0.9 }] };
    const ctx = { participants: [ANN], squad: [{ id: ANN }], minConfidence: 0.5, romance: false };
    expect(sanitizeIntentOutput(raw, ctx).intents.events).toEqual([]);
    expect(sanitizeIntentOutput(raw, { ...ctx, intercepted: ['fq1'] }).intents.events).toHaveLength(1);
  });
});
