import { beforeEach, describe, expect, it } from 'vitest';
import { generateDm, sanitizeDm, type DmReplyInput } from '../../src/llm/calls/dmReply';
import { llmLog } from '../../src/llm/log';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const input = (over: Partial<DmReplyInput> = {}): DmReplyInput => ({
  unitName: 'Rhea', commanderName: 'Vale', stateHint: 'She trusts the commander and says so plainly.',
  bands: { trust: 'solid', affinity: 'warm', attraction: 'faint', stress: 'tense' },
  recentFacts: ['She keeps a photo.', 'She hates sirens.', 'She owes Kara.', 'a fourth fact'], slotText: 'DAY 003 // EVENING',
  history: Array.from({ length: 9 }, (_, i) => ({ from: i % 2 ? 'unit' as const : 'commander' as const, text: `history ${i}` })), mode: 'reply', ...over,
});

describe('dm reply', () => {
  it('returns the cleaned text; the prompt holds bands, not numbers, and at most 3 facts and 6 history lines', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['I am here.'];
    expect(await generateDm(input(), { st, settings })).toBe('I am here.');
    const call = st.calls[0] as { prompt: string; system: string };
    expect(call.prompt).toContain('solid');
    expect(call.prompt).toContain('warm');
    expect(call.prompt).not.toMatch(/(trust|warmth|affinity|attraction|stress)\D{0,12}\d/i);
    expect(call.prompt).toContain('She keeps a photo.');
    expect(call.prompt).not.toContain('a fourth fact');
    expect(call.prompt).toContain('history 8');
    expect(call.prompt).not.toContain('history 2');
    expect(call.system).toMatch(/1.3 sentences/);
    expect(call.system).toMatch(/no actions/i);
  });
  it('snap mode says so in the prompt', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['Stop.'];
    await generateDm(input({ mode: 'snap' }), { st, settings });
    expect((st.calls[0] as { system: string }).system).toMatch(/too many messages|spamm|snap/i);
  });
  it('initiate mode asks her to start the conversation', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['Hey.'];
    await generateDm(input({ mode: 'initiate', history: [] }), { st, settings });
    expect((st.calls[0] as { system: string }).system).toMatch(/start|first/i);
  });
  it('sanitizer strips "Rhea:" and quotes and markdown', () => {
    expect(sanitizeDm('Rhea: "I am here."')).toBe('I am here.');
    expect(sanitizeDm('**Rhea:** *smiles* I am here.')).toBe('I am here.');
    expect(sanitizeDm('"Fine." “Whatever.”')).toBe('Fine. “Whatever.”'.replace(/[“”]/g, ''));
    expect(sanitizeDm('line one\n\nline two')).toBe('line one line two');
    expect(sanitizeDm('x'.repeat(900))!.length).toBeLessThanOrEqual(400);
  });
  it('empty → null', async () => {
    expect(sanitizeDm('')).toBeNull();
    expect(sanitizeDm('   ')).toBeNull();
    expect(sanitizeDm('Rhea:')).toBeNull();
    expect(sanitizeDm('*sighs*')).toBeNull();
    const { st, settings } = setup();
    st.mainReplies = ['*nods*', '*nods*'];
    expect(await generateDm(input(), { st, settings })).toBeNull();
  });
  it('a failing call is null', async () => {
    const { st, settings } = setup();
    st.mainReplies = [];
    expect(await generateDm(input(), { st, settings })).toBeNull();
  });
});
