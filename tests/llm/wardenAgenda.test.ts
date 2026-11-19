import { beforeEach, describe, expect, it } from 'vitest';
import { generateAgenda, type WardenAgendaInput } from '../../src/llm/calls/wardenAgenda';
import { CALL_TYPE_IDS } from '../../src/llm/callTypes';
import { llmLog } from '../../src/llm/log';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';

beforeEach(() => llmLog.clear());
const setup = () => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  return { st, settings: getSettings(st) };
};
const input = (): WardenAgendaInput => ({
  name: 'Ann', card: 'A veteran sergeant who keeps her people alive.', values: { pragmatism: 0, autonomy: -1, ingroup: 2, mercy: 1, corporate: 1, sacrifice: 0 },
  corporation: 'Vesper Somatics: grows soldiers, treats the Bloom as a resource.', kinds: ['protect_squad', 'meet_quota', 'personal'],
});
const ok = { expectations: [{ kind: 'protect_squad', weight: 'high', source: 'card' }, { kind: 'meet_quota', weight: 'medium', source: 'corporate' }, { kind: 'personal', weight: 'low', source: 'card', text: 'Keeps the window shut.' }] };

describe('warden_agenda', () => {
  it('is a call type with a budget of 800', () => {
    expect(CALL_TYPE_IDS).toContain('warden_agenda');
    expect(DEFAULT_SETTINGS.budgets.warden_agenda).toBe(800);
    expect(CALL_TYPE_IDS).toContain('epilogue');
    expect(DEFAULT_SETTINGS.budgets.epilogue).toBe(700);
  });

  it('valid: the shape comes back for the engine to validate; the prompt carries the card, the values and the closed kinds', async () => {
    const { st, settings } = setup();
    st.mainReplies = [JSON.stringify(ok)];
    const r = await generateAgenda(input(), { st, settings });
    expect(r).toEqual(ok);
    const call = st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('A veteran sergeant');
    expect(call.prompt).toContain('Vesper Somatics');
    expect(call.prompt).toContain('protect_squad');
    expect(call.system).toMatch(/commander/i);
    expect(call.system).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('truncated → null (after the repair and the retry)', async () => {
    const { st, settings } = setup();
    const cut = JSON.stringify(ok).slice(0, 60);
    st.mainReplies = [cut, cut];
    expect(await generateAgenda(input(), { st, settings })).toBeNull();
  });

  it('a digit weight is refused: the model picks low, medium or high and never a number', async () => {
    const { st, settings } = setup();
    const digit = { expectations: [{ kind: 'protect_squad', weight: 0.7 }, { kind: 'meet_quota', weight: 0.2 }, { kind: 'personal', weight: 0.1, text: 'x' }] };
    st.mainReplies = [JSON.stringify(digit), JSON.stringify(digit)];
    expect(await generateAgenda(input(), { st, settings })).toBeNull();
  });

  it('a failed call → null', async () => {
    const { st, settings } = setup();
    st.mainReplies = [];
    expect(await generateAgenda(input(), { st, settings })).toBeNull();
  });
});
