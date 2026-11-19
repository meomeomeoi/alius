import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { DAY_START_KEY, readDayStart, writeDayStart } from '../../src/st/persistence';
import { createWarden } from '../../src/warden/controller';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/warden';
import '../../src/engine/actions/memory';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const build = (withMode = true): CampaignState => {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann'), unitSetup('Bea')],
    ...(withMode ? { mode: { kind: 'leashswap' as const, deathRule: 'rewind_day' as const, warden: { by: 'player' as const, index: 0 } } } : {}),
  }, reg, { desireBondDefects: false, seed: 4 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const flush = () => new Promise((r) => setTimeout(r, 0));

function rig(withMode = true, chat = 6) {
  const h = worldHarness(reg, build(withMode));
  for (let i = 0; i < chat; i++) h.st.chatMessages.push({ index: i, isUser: i % 2 === 0, name: 'x', text: `m${i}`, swipeId: 0 });
  const toast = vi.fn();
  const ctl = createWarden({
    ...h.deps, toast: (k, t) => { toast(k, t); h.deps.toast(k, t); }, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never,
    refreshContext: vi.fn(), restore: (a, b) => h.restore(a, b),
  });
  return { h, ctl, toast };
}
const died = (cause = 'terminated') => ({ type: 'commander_died', rule: 'rewind_day', cause });

describe('the day-start snapshot', () => {
  it('day_started writes the snapshot with the chat length and the state', () => {
    const { h, ctl } = rig(true, 6);
    ctl.onEvents([{ type: 'day_started', day: 1 }]);
    const snap = readDayStart(h.st)!;
    expect(snap).toMatchObject({ chatId: 'c', day: h.state().day, chatLength: 6 });
    expect(snap.state).toEqual(h.state());
    expect(h.st.readMetadata(DAY_START_KEY)).toBeDefined();
  });

  it('is also written once at load when there is none (right after buildCampaign), and not replaced by the next load', () => {
    const { h, ctl } = rig(true, 4);
    ctl.onLoaded();
    expect(readDayStart(h.st)!.chatLength).toBe(4);
    h.st.chatMessages.push({ index: 4, isUser: true, name: 'x', text: 'm4', swipeId: 0 });
    ctl.onLoaded();
    expect(readDayStart(h.st)!.chatLength).toBe(4);
  });

  it('a snapshot of another chat is replaced at load', () => {
    const { h, ctl } = rig(true, 4);
    writeDayStart(h.st, { chatId: 'other', day: 1, chatLength: 1, state: h.state() });
    ctl.onLoaded();
    expect(readDayStart(h.st)!.chatId).toBe('c');
  });

  it('no snapshot is written outside the mode', () => {
    const { h, ctl } = rig(false);
    ctl.onEvents([{ type: 'day_started', day: 1 }]);
    ctl.onLoaded();
    expect(h.st.readMetadata(DAY_START_KEY)).toBeUndefined();
  });
});

describe('the rewind', () => {
  it('restores the snapshot and hides from the stored length, recording the runs', async () => {
    const { h, ctl, toast } = rig(true, 4);
    ctl.onEvents([{ type: 'day_started', day: 1 }]); // snapshot: chat length 4
    const day = h.state().day;
    for (let i = 4; i < 9; i++) h.st.chatMessages.push({ index: i, isUser: false, name: 'x', text: `m${i}`, swipeId: 0 });
    h.setState((s) => { s.resources.credits += 99; s.day = day; });
    const spoiled = h.state().resources.credits;
    ctl.onEvents([died()]);
    await flush();
    expect(h.state().resources.credits).toBe(spoiled - 99); // the day-start state is back
    expect(h.st.chatMessages.slice(0, 4).every((m) => m.isSystem !== true)).toBe(true);
    expect(h.st.chatMessages.slice(4).every((m) => m.isSystem === true)).toBe(true);
    expect(h.state().memory.hidden).toEqual([[4, 8]]);
    expect(toast).toHaveBeenCalledWith('info', `REWIND — day ${day} begins again.`);
    expect(h.state().ended).toBeUndefined();
  });

  it('a foreign snapshot ends the campaign', async () => {
    const { h, ctl } = rig(true, 4);
    writeDayStart(h.st, { chatId: 'other', day: 1, chatLength: 1, state: h.state() });
    ctl.onEvents([died()]);
    await flush();
    expect(h.state().ended).toEqual({ day: h.state().day, cause: 'terminated' });
    expect(h.st.chatMessages.every((m) => m.isSystem !== true)).toBe(true); // nothing hidden
  });

  it('no snapshot at all ends the campaign', async () => {
    const { h, ctl } = rig(true, 4);
    ctl.onEvents([died('executed')]);
    await flush();
    expect(h.state().ended?.cause).toBe('executed');
  });

  it('a chat shorter than the stored length hides nothing and still restores', async () => {
    const { h, ctl } = rig(true, 2);
    writeDayStart(h.st, { chatId: 'c', day: 1, chatLength: 10, state: (() => { const s = structuredClone(h.state()); s.resources.credits = 1; return s; })() });
    ctl.onEvents([died()]);
    await flush();
    expect(h.state().resources.credits).toBe(1);
    expect(h.st.chatMessages.every((m) => m.isSystem !== true)).toBe(true);
    expect(h.state().memory.hidden).toBeUndefined();
  });

  it('a chat that changed while it hid writes nothing into the other chat', async () => {
    const { h, ctl } = rig(true, 4);
    ctl.onEvents([{ type: 'day_started', day: 1 }]);
    for (let i = 4; i < 8; i++) h.st.chatMessages.push({ index: i, isUser: false, name: 'x', text: `m${i}`, swipeId: 0 });
    const real = h.st.hideMessages.bind(h.st);
    h.st.hideMessages = async (a, b) => { const runs = await real(a, b); h.switchChat('other'); return runs; };
    ctl.onEvents([died()]);
    await flush();
    expect(h.log.filter((a) => a.type === 'memory/hidden')).toHaveLength(0);
  });

  it('ignores a campaign_end death (the engine has already closed it)', async () => {
    const { h, ctl } = rig(true, 3);
    ctl.onEvents([{ type: 'commander_died', rule: 'campaign_end', cause: 'terminated' }]);
    await flush();
    expect(h.log).toHaveLength(0);
  });
});

describe('the epilogue', () => {
  const closed = (): CampaignState => {
    const s = build();
    s.ended = { day: 3, cause: 'terminated' };
    s.memory.chronicle.push({ id: 'c900', kind: 'day', day: 2, text: 'Day 2: The squad held the gate.', audience: '*' }, { id: 'c901', kind: 'scene', day: 2, text: 'A private word.', audience: ['unit_ann'] });
    return s;
  };

  it('campaign_ended asks the model for the epilogue and stores it once', async () => {
    const h = worldHarness(reg, closed());
    const ctl = createWarden({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), restore: (a, b) => h.restore(a, b) });
    h.st.mainReplies = ['The commander was gone by morning. The squad held the gate.'];
    ctl.onEvents([{ type: 'campaign_ended', cause: 'terminated' }]);
    await flush();
    expect(h.state().ended?.epilogue).toBe('The commander was gone by morning. The squad held the gate.');
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('The squad held the gate.');
    expect(prompt).not.toContain('A private word.'); // only the public lines
  });

  it('falls back to the public lines under a fixed heading when the call fails', async () => {
    const h = worldHarness(reg, closed());
    const ctl = createWarden({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), restore: (a, b) => h.restore(a, b) });
    h.st.mainReplies = [];
    ctl.onLoaded();
    await flush();
    const text = h.state().ended!.epilogue!;
    expect(text).toContain('Day 2: The squad held the gate.');
    expect(text).not.toContain('A private word.');
  });

  it('is not asked twice, and not for another chat', async () => {
    const h = worldHarness(reg, closed());
    const ctl = createWarden({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), restore: (a, b) => h.restore(a, b) });
    h.st.mainReplies = ['One.', 'Two.'];
    ctl.onLoaded();
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(1);
    const h2 = worldHarness(reg, closed());
    const ctl2 = createWarden({ ...h2.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), restore: (a, b) => h2.restore(a, b) });
    h2.st.mainReplies = ['Late.'];
    ctl2.onLoaded();
    h2.switchChat('other');
    await flush();
    expect(h2.state().ended?.epilogue).toBeUndefined();
  });
});
