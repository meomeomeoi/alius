import { beforeEach, describe, expect, it } from 'vitest';
import { llmLog } from '../../src/llm/log';
import {
  generateFlavor, generateGruntFlavor, registerFlavorKind, sanitizeGruntFlavor, type GruntFlavorInput,
} from '../../src/llm/calls/flavor';
import { getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());

const input: GruntFlavorInput = { kind: 'grunt', designation: 'K-117', roleName: 'Assault', defectName: 'Echo Bleed' };
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};

describe('sanitizeGruntFlavor', () => {
  it('valid input gives name and bio', () => {
    expect(sanitizeGruntFlavor({ name: " Mara O'Dell ", bio: 'Quiet. Counts exits.' })).toEqual({ name: "Mara O'Dell", bio: 'Quiet. Counts exits.' });
  });

  it('overlong bio is cut at 120 and newlines become spaces', () => {
    const r = sanitizeGruntFlavor({ name: 'Rex', bio: 'a\nb' + 'c'.repeat(200) })!;
    expect(r.bio.length).toBeLessThanOrEqual(120);
    expect(r.bio).not.toContain('\n');
  });

  it('a name with markup, digits only, empty or too long is rejected', () => {
    for (const name of ['<b>Rex</b>', '1234', '', 'x'.repeat(25), 5, null]) {
      expect(sanitizeGruntFlavor({ name, bio: 'ok' }), String(name)).toBeNull();
    }
  });

  it('a missing bio becomes empty, garbage input is null', () => {
    expect(sanitizeGruntFlavor({ name: 'Rex' })).toEqual({ name: 'Rex', bio: '' });
    expect(sanitizeGruntFlavor('Rex')).toBeNull();
    expect(sanitizeGruntFlavor(null)).toBeNull();
  });
});

describe('generateGruntFlavor', () => {
  it('valid JSON gives name and bio, with the 400-token budget on the main model fallback', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"name": "Mara", "bio": "Counts exits."}'];
    expect(await generateGruntFlavor(input, { st, settings })).toEqual({ name: 'Mara', bio: 'Counts exits.' });
    expect(st.calls[0]).toMatchObject({ kind: 'main' });
    const call = st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('K-117');
    expect(call.prompt).toContain('Echo Bleed');
  });

  it('invalid JSON after both attempts is null', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['no json here', 'still none'];
    expect(await generateGruntFlavor(input, { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(2);
  });

  it('a reply whose name fails the rules is null', async () => {
    const { st, settings } = setup();
    st.mainReplies = ['{"name": "<script>", "bio": "x"}'];
    expect(await generateGruntFlavor(input, { st, settings })).toBeNull();
  });

  it('a failed call is null and never throws', async () => {
    const { st, settings } = setup();
    await expect(generateGruntFlavor(input, { st, settings })).resolves.toBeNull();
  });
});

describe('flavor kinds', () => {
  it('an unknown kind is refused without calling the model', async () => {
    const { st, settings } = setup();
    expect(await generateFlavor({ kind: 'spaceship' }, { st, settings })).toBeNull();
    expect(st.calls).toHaveLength(0);
  });

  it('other packages register their own kind', async () => {
    registerFlavorKind('test_item', { system: () => 'SYS', prompt: (i) => `ITEM ${(i as { id: string }).id}` });
    const { st, settings } = setup();
    st.mainReplies = ['{"x": 1}'];
    expect(await generateFlavor({ kind: 'test_item', id: 'sword' }, { st, settings })).toEqual({ x: 1 });
    expect((st.calls[0] as { prompt: string }).prompt).toBe('ITEM sword');
    expect(() => registerFlavorKind('test_item', { system: () => '', prompt: () => '' })).toThrow();
  });
});
