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
  recentFacts: ['She keeps a photo.', 'She hates sirens.', 'She owes Kara.', 'a fourth fact', 'a fifth fact'], slotText: 'DAY 003 // EVENING',
  history: Array.from({ length: 9 }, (_, i) => ({ from: i % 2 ? 'unit' as const : 'commander' as const, text: `history ${i}` })), mode: 'reply', ...over,
});

describe('dm reply memory (P3b)', () => {
  it('dm_reply gets her own and shared dossier and her journal', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['Fine.'];
    await generateDm(input({ dossier: 'Ann keeps a letter. Ann is the squad sniper.', journal: ["the commander broke a promise to her (day 11): 'the medicine'"] }), { st, settings });
    const prompt = (st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('Ann keeps a letter. Ann is the squad sniper.');
    expect(prompt).toContain("the commander broke a promise to her (day 11): 'the medicine'");
    expect(prompt).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('inputs without the fields render as before', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['a', 'b', 'c'];
    await generateDm(input(), { st, settings });
    await generateDm(input({ dossier: undefined, journal: undefined }), { st, settings });
    await generateDm(input({ dossier: '', journal: [] }), { st, settings });
    const prompts = st.calls.map((c) => (c as { prompt: string }).prompt);
    expect(prompts[1]).toBe(prompts[0]);
    expect(prompts[2]).toBe(prompts[0]);
    expect(prompts[0]).not.toMatch(/remember|Lately/i);
  });
});

describe('dm reply', () => {
  it('returns the cleaned text; the prompt holds bands, not numbers, and at most 4 facts and 6 history lines', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['I am here.'];
    expect(await generateDm(input(), { st, settings })).toBe('I am here.');
    const call = st.calls[0] as { prompt: string; system: string };
    expect(call.prompt).toContain('solid');
    expect(call.prompt).toContain('warm');
    expect(call.prompt).not.toMatch(/(trust|warmth|affinity|attraction|stress)\D{0,12}\d/i);
    expect(call.prompt).toContain('She keeps a photo.');
    expect(call.prompt).toContain('a fourth fact'); // P3b: four facts are used (a long memory asks for four)
    expect(call.prompt).not.toContain('a fifth fact');
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

describe('dm reply modes of P10b', () => {
  const prompted = async (mode: DmReplyInput['mode']) => {
    const { st, settings } = setup();
    st.mainReplies = ['Fine.'];
    await generateDm(input({ mode }), { st, settings });
    return st.calls[0] as { prompt: string; system: string };
  };

  it('curt mode asks for one or two words, cold', async () => {
    const call = await prompted('curt');
    expect(call.system).toMatch(/one or two words/i);
    expect(call.system).toMatch(/cold/i);
    expect(call.system).not.toMatch(/1.3 sentences/);
  });

  it('door mode says she answers through the closed door and is still deciding', async () => {
    const call = await prompted('door');
    expect(call.system).toMatch(/through the closed door/i);
    expect(call.system).toMatch(/still deciding whether to stay/i);
    expect(call.system).toMatch(/one or two sentences/i);
    expect(call.system).not.toMatch(/PDA/);
  });

  it('neither mode text gives the commander a pronoun', async () => {
    for (const mode of ['curt', 'door'] as const) {
      const call = await prompted(mode);
      expect(`${call.system}\n${call.prompt}`, mode).not.toMatch(/\b(he|him|his|himself)\b/i);
    }
  });

  it('the older modes are unchanged', async () => {
    for (const mode of ['reply', 'snap', 'initiate'] as const) {
      const call = await prompted(mode);
      expect(call.system, mode).toMatch(/1.3 sentences/);
      expect(call.system, mode).toMatch(/PDA/);
    }
  });
});
