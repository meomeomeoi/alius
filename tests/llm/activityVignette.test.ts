import { beforeEach, describe, expect, it } from 'vitest';
import { llmLog } from '../../src/llm/log';
import { generateVignette, sanitizeVignette, type VignetteInput } from '../../src/llm/calls/activityVignette';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());

const input: VignetteInput = {
  activityName: 'Rest', commanderName: 'Vale', unitName: 'Rhea', unitRole: 'Assault',
  likes: ['tea'], defectNames: ['Echo Bleed'],
};
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};

describe('sanitizeVignette', () => {
  it('keeps two lines', () => {
    expect(sanitizeVignette('She sits down beside him.\nNeither speaks.')).toBe('She sits down beside him.\nNeither speaks.');
  });

  it('drops a third line and blank lines', () => {
    expect(sanitizeVignette('One.\n\nTwo.\nThree.')).toBe('One.\nTwo.');
  });

  it('strips wrapping quotes, markdown and a label', () => {
    expect(sanitizeVignette('Vignette: "**She laughs, quietly.**"')).toBe('She laughs, quietly.');
    expect(sanitizeVignette('```\n*Steam rises.*\n```')).toBe('Steam rises.');
  });

  it('truncates at 240 characters', () => {
    const out = sanitizeVignette('word '.repeat(100))!;
    expect(out.length).toBeLessThanOrEqual(240);
    expect(out.length).toBeGreaterThan(200);
  });

  it('empty or whitespace-only is null', () => {
    expect(sanitizeVignette('')).toBeNull();
    expect(sanitizeVignette('  \n \n')).toBeNull();
    expect(sanitizeVignette('""')).toBeNull();
  });
});

describe('generateVignette', () => {
  it('returns the cleaned text from the main model with the 150-token budget', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['"Rhea pours the tea.\nIt is terrible. She drinks it anyway."'];
    const out = await generateVignette(input, { st, settings });
    expect(out).toBe('Rhea pours the tea.\nIt is terrible. She drinks it anyway.');
    expect(st.calls[0]).toMatchObject({ kind: 'main', maxTokens: 150 });
  });

  it('the prompt names activity, unit and commander but carries no numbers', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['Fine.'];
    await generateVignette(input, { st, settings });
    const call = st.calls[0] as { system?: string; prompt: string };
    for (const word of ['Rest', 'Vale', 'Rhea', 'Assault', 'tea', 'Echo Bleed']) expect(call.prompt).toContain(word);
    expect(call.prompt).not.toMatch(/\d/);
    expect(call.system ?? '').toMatch(/2 lines|two lines/i);
  });

  it('returns null on a failed call and never throws', async () => {
    const { st, settings } = setup(); // no reply queued: the fake throws
    await expect(generateVignette(input, { st, settings })).resolves.toBeNull();
  });

  it('returns null on an empty answer', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['  ', '  '];
    expect(await generateVignette(input, { st, settings })).toBeNull();
  });
});
