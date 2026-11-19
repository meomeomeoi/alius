import { beforeEach, describe, expect, it } from 'vitest';
import { llmLog } from '../../src/llm/log';
import type { SceneSummaryInput } from '../../src/llm/calls/sceneSummary';
import { summarizeScene } from '../helpers/calls';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const input = (over: Partial<SceneSummaryInput> = {}): SceneSummaryInput => ({
  location: 'Mess hall', participants: [{ id: 'unit_ann', name: 'Ann' }, { id: 'unit_bea', name: 'Bea' }],
  transcript: [{ speaker: 'Vale', text: 'Sit.' }, { speaker: 'Ann', text: 'No.' }], ...over,
});

describe('summarizeScene', () => {
  it('valid answer gives a chronicle and validated facts', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({
      chronicle: 'Ann refused to sit with the commander.',
      facts: [{ about: ['unit_ann'], text: 'Ann will not eat with him.', importance: 3, tags: ['meals'] }, { about: ['unit_zed'], text: 'ghost', importance: 3, tags: [] }],
    })];
    const r = await summarizeScene(input(), { st, settings });
    expect(r).toEqual({
      chronicle: 'Ann refused to sit with the commander.',
      facts: [{ about: ['unit_ann'], text: 'Ann will not eat with him.', importance: 3, tags: ['meals'] }],
      contentViolations: [], // P9d
    });
    const call = st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('unit_ann');
    expect(call.prompt).toContain('Mess hall');
  });
  it('chronicle capped at 240 characters, newlines flattened', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ chronicle: `line one\n${'x'.repeat(400)}`, facts: [] })];
    const r = await summarizeScene(input(), { st, settings });
    expect(r!.chronicle.length).toBeLessThanOrEqual(240);
    expect(r!.chronicle).not.toContain('\n');
  });
  it('invalid → null (no chronicle, prose, or failed call)', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"facts": []}', '{"chronicle": ""}'];
    expect(await summarizeScene(input(), { st, settings })).toBeNull();
    st.mainReplies = ['they talked'];
    expect(await summarizeScene(input(), { st, settings })).toBeNull();
  });
  it('transcript is trimmed from the oldest side', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"chronicle": "ok", "facts": []}'];
    const transcript = Array.from({ length: 400 }, (_, i) => ({ speaker: 'Vale', text: `message ${String(i).padStart(3, '0')} ${'filler '.repeat(40)}` }));
    await summarizeScene(input({ transcript }), { st, settings });
    const { prompt } = st.calls[0] as { prompt: string };
    expect(prompt).toContain('message 399');
    expect(prompt).not.toContain('message 000');
    expect(prompt.length).toBeLessThan(20000);
  });
});

describe('flagged replies in the summary (P9d)', () => {
  const FLAGGED = 'She pinned him to the table with the strap while the others watched, laughing at him.';
  const flaggedInput = (): SceneSummaryInput => ({
    ...input(),
    excluded: [{ id: 'restraint', label: 'Restraint' }, { id: 'public_humiliation', label: 'Public humiliation' }],
    transcript: [{ speaker: 'Vale', text: 'Easy.' }, { speaker: 'Ann', text: FLAGGED, flagged: true }, { speaker: 'Ann', text: 'Never mind. Sorry.' }],
  });

  it('marks the flagged lines for the model and names what is excluded', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ chronicle: 'Ann and the commander talked.', facts: [] })];
    await summarizeScene(flaggedInput(), { st, settings });
    const text = (st.calls[0].system ?? '') + st.calls[0].prompt;
    expect(text).toContain('[EXCLUDED CONTENT] Ann: She pinned him');
    expect(text).toContain('restraint: Restraint');
    expect(text).toContain('"contentViolations"');
    expect(text).not.toContain('[EXCLUDED CONTENT] Vale');
  });

  it('drops facts whose text came from a flagged reply and keeps the others; never throws on junk', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({
      chronicle: 'A rough evening.',
      facts: [
        { about: ['unit_ann'], text: 'Ann says: she pinned him to the table with the strap while the others watched.', importance: 3, tags: [] },
        { about: ['unit_ann'], text: 'Ann apologized afterwards.', importance: 3, tags: [] },
        { about: ['unit_ann'], text: 'Ann was shown tied down in front of the squad.', importance: 3, tags: [], excluded: true },
      ],
      contentViolations: [{ category: 'restraint', evidence: 'pinned him to the table' }, { category: 'bogus' }, 'x'],
    })];
    const r = await summarizeScene(flaggedInput(), { st, settings });
    expect(r!.facts.map((f) => f.text)).toEqual(['Ann apologized afterwards.']);
    expect(r!.contentViolations).toEqual([{ category: 'restraint', evidence: 'pinned him to the table' }]);
  });

  it('a fact that quotes the model\'s own evidence is dropped too', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({
      chronicle: 'x', facts: [{ about: ['unit_ann'], text: 'Everyone saw the strap used on the commander.', importance: 2, tags: [] }],
      contentViolations: [{ category: 'restraint', evidence: 'the strap used on the commander' }],
    })];
    expect((await summarizeScene(flaggedInput(), { st, settings }))!.facts).toEqual([]);
  });

  it('without flags nothing changes: the prompt is the old one and the violations list is empty', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify({ chronicle: 'Quiet.', facts: [] }), JSON.stringify({ chronicle: 'Quiet.', facts: [] })];
    const plain = await summarizeScene(input(), { st, settings });
    await summarizeScene({ ...input(), excluded: [] }, { st, settings });
    expect(plain!.contentViolations).toEqual([]);
    expect(st.calls[0].prompt).toBe(st.calls[1].prompt);
    expect(st.calls[0].prompt).not.toContain('EXCLUDED');
  });
});
