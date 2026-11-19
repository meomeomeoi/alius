import { beforeEach, describe, expect, it } from 'vitest';
import type { FoldInput } from '../../src/llm/calls/memoryFold';
import type { SceneSummaryInput } from '../../src/llm/calls/sceneSummary';
import { digestScene, foldMemory, retellRumor, summarizeScene } from '../helpers/calls';
import { CALL_TYPE_IDS } from '../../src/llm/callTypes';
import { llmLog } from '../../src/llm/log';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const foldInput = (over: Partial<FoldInput> = {}): FoldInput => ({
  name: 'Ann', own: 'She keeps a letter.', shared: 'The squad sniper.', ownFacts: ['Ann wrote to her sister.'], sharedFacts: ['Ann held the gate on day 4.'], ...over,
});

describe('call types and budgets', () => {
  it('memory_fold and rumor_retell are call types with their budgets', () => {
    expect(CALL_TYPE_IDS).toEqual(expect.arrayContaining(['memory_fold', 'rumor_retell']));
    expect(DEFAULT_SETTINGS.budgets.memory_fold).toBe(500);
    expect(DEFAULT_SETTINGS.budgets.rumor_retell).toBe(200);
  });
});

describe('foldMemory', () => {
  it('fold call: JSON in, two paragraphs out', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ own: 'Ann keeps a letter and wrote to her sister.', shared: 'Ann is the squad sniper; she held the gate on day 4.' })];
    const r = await foldMemory(foldInput(), { st, settings });
    expect(r).toEqual({ own: 'Ann keeps a letter and wrote to her sister.', shared: 'Ann is the squad sniper; she held the gate on day 4.' });
    const call = st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('She keeps a letter.'); // the current paragraphs
    expect(call.prompt).toContain('The squad sniper.');
    expect(call.prompt).toContain('Ann wrote to her sister.'); // the facts to fold
    expect(call.prompt).toContain('Ann held the gate on day 4.');
    expect(call.prompt).toContain('Ann');
  });

  it('each part is cut to its cap and flattened', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ own: `line one\n${'o'.repeat(900)}`, shared: 's'.repeat(900) })];
    const r = await foldMemory(foldInput(), { st, settings });
    expect(r!.own.length).toBeLessThanOrEqual(500);
    expect(r!.shared.length).toBeLessThanOrEqual(400);
    expect(r!.own).not.toContain('\n');
  });

  it('a part without facts may come back empty; a part with facts may not', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ own: 'Only the private part.', shared: '' })];
    expect(await foldMemory(foldInput({ sharedFacts: [] }), { st, settings })).toEqual({ own: 'Only the private part.', shared: '' });
    st.mainReplies = [JSON.stringify({ own: 'Only the private part.', shared: '' }), JSON.stringify({ own: 'Only the private part.', shared: '' })];
    expect(await foldMemory(foldInput(), { st, settings })).toBeNull();
  });

  it('invalid → null (prose, a missing part, a wrong type, a failed call)', async () => {
    const { st, settings } = setup();
    for (const bad of ['they remembered', '{"own": "x"}', '{"own": 1, "shared": 2}', '[]']) {
      st.mainReplies = [bad, bad];
      expect(await foldMemory(foldInput(), { st, settings }), bad).toBeNull();
    }
    st.mainReplies = [];
    expect(await foldMemory(foldInput(), { st, settings })).toBeNull();
  });

  it('nothing to fold → no call', async () => {
    const { st, settings } = setup();
    expect(await foldMemory(foldInput({ ownFacts: [], sharedFacts: [] }), { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(0);
  });

  it('the system prompt keeps the commander pronoun-free and forbids numbers about relationships', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ own: 'a', shared: 'b' })];
    await foldMemory(foldInput(), { st, settings });
    const call = st.calls[0] as { system?: string; prompt: string };
    const text = `${call.system ?? ''}\n${call.prompt}`;
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
    expect(text).toMatch(/commander/);
  });
});

describe('retellRumor', () => {
  it('retell call: one line, markup removed, cut to a fact length', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['**They say** Ann keeps a letter\nnobody has read.'];
    const r = await retellRumor({ teller: 'Bea', bands: 'trust steady, affinity warm, stress calm', text: 'Ann keeps a letter.' }, { st, settings });
    expect(r).toBe('They say Ann keeps a letter nobody has read.');
    const call = st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('Bea');
    expect(call.prompt).toContain('trust steady');
    expect(call.prompt).toContain('Ann keeps a letter.');
    st.mainReplies = ['x'.repeat(500)];
    expect((await retellRumor({ teller: 'Bea', bands: 'b', text: 't' }, { st, settings }))!.length).toBeLessThanOrEqual(200);
  });

  it('a digit → null (the retelling never writes numbers)', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['They say Ann has 3 letters.'];
    expect(await retellRumor({ teller: 'Bea', bands: 'b', text: 't' }, { st, settings })).toBeNull();
    st.mainReplies = ['   '];
    expect(await retellRumor({ teller: 'Bea', bands: 'b', text: 't' }, { st, settings })).toBeNull();
  });
});

describe('scene_summary in digest mode', () => {
  const input = (over: Partial<SceneSummaryInput> = {}): SceneSummaryInput => ({
    location: 'Mess hall', participants: [{ id: 'unit_ann', name: 'Ann' }], transcript: [{ speaker: 'Vale', text: 'Sit.' }, { speaker: 'Ann', text: 'No.' }], ...over,
  });

  it('the digest answer is a text and facts; the text is cut to 800 characters', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ digest: `${'d'.repeat(1200)}`, facts: [{ about: ['unit_ann'], text: 'Ann refuses to sit.', importance: 3, tags: [] }, { about: ['unit_zed'], text: 'ghost', importance: 3, tags: [] }] })];
    const r = await digestScene(input({ previous: 'Earlier they argued.' }), { st, settings });
    expect(r!.digest).toHaveLength(800);
    expect(r!.facts).toEqual([{ about: ['unit_ann'], text: 'Ann refuses to sit.', importance: 3, tags: [] }]);
    const call = st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('Earlier they argued.'); // the previous digest is part of the input
    expect(call.system ?? '').toMatch(/digest/i);
    expect(call.system ?? '').toContain('800');
  });

  it('the digest prompt marks flagged lines and lists excluded categories', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ digest: 'They talked.', facts: [] })];
    await digestScene(input({
      transcript: [{ speaker: 'Vale', text: 'Hello.' }, { speaker: 'Ann', text: 'A flagged reply.', flagged: true }],
      excluded: [{ id: 'restraint', label: 'Restraint' }],
    }), { st, settings });
    const call = st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('[EXCLUDED CONTENT] Ann: A flagged reply.');
    expect(call.prompt).toContain('- restraint: Restraint');
    expect(call.system ?? '').toContain('EXCLUDED');
  });

  it('a fact quoting a flagged reply is not kept, as in the final summary', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ digest: 'They talked.', facts: [{ about: ['unit_ann'], text: 'A flagged reply that goes on for a while.', importance: 3, tags: [] }] })];
    const r = await digestScene(input({ transcript: [{ speaker: 'Ann', text: 'A flagged reply that goes on for a while.', flagged: true }], excluded: [{ id: 'restraint', label: 'Restraint' }] }), { st, settings });
    expect(r!.facts).toEqual([]);
  });

  it('invalid → null; the final summary is unchanged by the new mode', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"facts": []}', '{"facts": []}'];
    expect(await digestScene(input(), { st, settings })).toBeNull();
    st.mainReplies = [JSON.stringify({ digest: 'only a digest', facts: [] }), JSON.stringify({ digest: 'only a digest', facts: [] })];
    expect(await summarizeScene(input(), { st, settings })).toBeNull(); // a chronicle line is required at the end
    st.mainReplies = ['{"chronicle": "ok", "facts": []}'];
    expect((await summarizeScene(input(), { st, settings }))!.chronicle).toBe('ok');
  });
});
