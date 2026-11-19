import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { wardenOf } from '../../src/engine/warden';
import { createWarden } from '../../src/warden/controller';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const swap = (): CampaignState => {
  const r = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann'), unitSetup('Bea'), unitSetup('Cat')],
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 9 });
  if (!r.ok) throw new Error(r.errors.join('; '));
  return r.state;
};
const ANSWER = { expectations: [{ kind: 'meet_quota', weight: 'high', source: 'corporate' }, { kind: 'keep_me_close', weight: 'medium' }, { kind: 'no_civilian_harm', weight: 'low' }] };
const flush = () => new Promise((r) => setTimeout(r, 0));
const records = (h: ReturnType<typeof worldHarness>) => h.state().generations?.records ?? [];

function rig(initial: CampaignState = swap()) {
  const h = worldHarness(reg, initial, { autoRetry: 0, wardenJudge: true });
  h.st.cards.set('bea.png', { avatar: 'bea.png', name: 'Bea', description: 'A sergeant.', personality: 'Dry.', scenario: '', creatorNotes: '' });
  const ctl = createWarden({ ...h.deps, context: { setDirective: vi.fn(), clearMatching: vi.fn() } as never, refreshContext: vi.fn(), startScene: async () => false, restore: () => false });
  return { h, ctl };
}

describe('warden.agenda', () => {
  it('a failed agenda keeps the fallback, records quietly, and RETRY replaces it while no override fired', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [];
    ctl.onLoaded();
    await flush();
    const w = wardenOf(h.state())!;
    expect(w.agenda).toBe('fallback');
    expect(records(h)).toMatchObject([{ siteId: 'warden.agenda', key: `${w.unitId}:${w.sinceDay}`, quiet: true, fallbackApplied: true }]);
    expect(h.toasts).toEqual([]);
    h.st.mainReplies = [JSON.stringify(ANSWER)];
    expect((await h.deps.generations.retry('g1')).kind).toBe('applied');
    expect(wardenOf(h.state())!.agenda).toBe('model');
    expect(records(h)).toEqual([]);
  });

  it('once the agenda is set there is nothing to retry or reroll', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [];
    ctl.onLoaded();
    await flush();
    const key = records(h)[0].key;
    h.st.mainReplies = [JSON.stringify(ANSWER)];
    await ctl.rerollAgenda(); // the second try while it is still the fallback
    expect(wardenOf(h.state())!.agenda).toBe('model');
    expect(h.deps.generations.rerollState('warden.agenda', key)).toEqual({ enabled: false, reason: 'Her agenda is set.' });
  });
});

describe('warden.judge', () => {
  it('a failed judge dispatches without it and writes nothing', async () => {
    const { h, ctl } = rig();
    const s = structuredClone(h.state());
    wardenOf(s)!.expectations = [{ id: 'x2', kind: 'personal', weight: 0.6, source: 'card', known: false, text: 'Never leave a window open.' } as never];
    h.setState((x) => { Object.assign(x, s); });
    const action = { type: 'activity/do', payload: { activityId: 'rest' } };
    h.st.mainReplies = [];
    const events = await ctl.judgeThen(action);
    expect(events.some((e) => e.type === 'error' && /Alius|unknown/i.test(String(e.message)))).toBe(false);
    expect(h.log.filter((a) => a.type === 'activity/do')).toHaveLength(1);
    expect((h.log.find((a) => a.type === 'activity/do')!.payload as Record<string, unknown>).wardenJudged).toBeUndefined();
    expect(h.state().generations).toBeUndefined();
  });
});

describe('warden.epilogue', () => {
  const closed = (): CampaignState => {
    const s = swap();
    s.ended = { day: s.day, cause: 'terminated' } as never;
    s.memory.chronicle.push({ id: 'c1', kind: 'scene', day: s.day, text: 'The squad held the gate.', audience: '*' });
    return s;
  };

  it('a failed epilogue writes the joined lines and a full record; reroll replaces it', async () => {
    const { h, ctl } = rig(closed());
    h.st.mainReplies = [];
    ctl.onLoaded();
    await flush();
    expect(h.state().ended!.epilogue).toContain('The squad held the gate.');
    expect(records(h)).toMatchObject([{ siteId: 'warden.epilogue', key: 'epilogue', fallbackApplied: true, status: 'open' }]);
    expect(h.toasts.map((t) => t.text)).toEqual(['Epilogue: the connection failed.']);
    h.st.mainReplies = ['The gate held, and so did they.'];
    expect((await h.deps.generations.retry('g1')).kind).toBe('applied');
    expect(h.state().ended!.epilogue).toBe('The gate held, and so did they.');
    expect(records(h)).toEqual([]);
    h.st.mainReplies = ['Another ending.'];
    await ctl.rerollEpilogue();
    expect(h.state().ended!.epilogue).toBe('Another ending.');
  });

  it('a campaign that is open again expires the record', async () => {
    const { h, ctl } = rig(closed());
    h.st.mainReplies = [];
    ctl.onLoaded();
    await flush();
    h.setState((s) => { delete s.ended; });
    expect(await h.deps.generations.retry('g1')).toEqual({ kind: 'expired', why: 'The campaign is open again.' });
  });
});
