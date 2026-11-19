import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { orderOfAction, wardenOf, type Expectation } from '../../src/engine/warden';
import { judgeOrder } from '../../src/llm/calls/wardenJudge';
import { CALL_TYPE_IDS } from '../../src/llm/callTypes';
import { llmLog } from '../../src/llm/log';
import { DEFAULT_SETTINGS, getSettings } from '../../src/settings';
import { FakeStAdapter } from '../../src/st/fake';
import { createWarden } from '../../src/warden/controller';
import { ContextBuilder } from '../../src/llm/context';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';
import '../../src/engine/actions/warden';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => llmLog.clear());

const personal: Expectation = { id: 'x2', kind: 'personal', weight: 0.6, source: 'card', known: false, text: 'Never leave a window open.' };
const quota: Expectation = { id: 'x1', kind: 'meet_quota', weight: 0.4, source: 'values', known: false };
function swap(list: Expectation[]): CampaignState {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
    mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
  }, reg, { desireBondDefects: false, seed: 5 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  wardenOf(out.state)!.expectations = list;
  return out.state;
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('the call type', () => {
  it('warden_judge is a mechanic call with a budget of 120, and the setting is off by default', () => {
    expect(CALL_TYPE_IDS).toContain('warden_judge');
    expect(DEFAULT_SETTINGS.budgets.warden_judge).toBe(120);
    expect(DEFAULT_SETTINGS.wardenJudge).toBe(false);
  });
});

describe('judgeOrder', () => {
  const run = async (reply: unknown) => {
    const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
    st.mainReplies = [typeof reply === 'string' ? reply : JSON.stringify(reply), typeof reply === 'string' ? reply : JSON.stringify(reply)];
    const r = await judgeOrder({ order: 'Rest with Ann', expectations: [{ id: 'x2', text: 'Never leave a window open.' }] }, { st, settings: getSettings(st) });
    return { r, st };
  };

  it('valid: the id and the word', async () => {
    const { r, st } = await run({ expectationId: 'x2', conflict: 'minor' });
    expect(r).toEqual({ expectationId: 'x2', conflict: 'minor' });
    expect((st.calls[0] as { prompt: string }).prompt).toContain('Rest with Ann');
    expect((st.calls[0] as { prompt: string }).prompt).toContain('Never leave a window open.');
  });

  it('an id that is not in the list → null', async () => {
    expect((await run({ expectationId: 'x7', conflict: 'major' })).r).toBeNull();
  });

  it('a number for conflict → null; garbage → null', async () => {
    expect((await run({ expectationId: 'x2', conflict: 0.8 })).r).toBeNull();
    expect((await run('nope')).r).toBeNull();
  });
});

describe('judgeThen', () => {
  const rig = (list: Expectation[], settings: Record<string, unknown> = { wardenJudge: true }) => {
    const h = worldHarness(reg, swap(list), settings);
    const act = vi.fn((a) => h.app().dispatch(a));
    const ctl = createWarden({ ...h.deps, context: new ContextBuilder(), refreshContext: vi.fn(), restore: () => false, startScene: async () => false, act });
    return { h, ctl, act };
  };
  const rest = { type: 'activity/do', payload: { activityId: 'rest' } };

  it('judge off: no call, and nothing to wait for', async () => {
    const { h, ctl, act } = rig([personal], { wardenJudge: false });
    expect(ctl.needsJudge(rest)).toBe(false);
    await ctl.judgeThen(rest);
    expect(h.st.calls).toHaveLength(0);
    expect(act).toHaveBeenCalledWith(rest);
  });

  it('judge on with no personal expectation: no call', async () => {
    const { h, ctl } = rig([quota]);
    expect(ctl.needsJudge(rest)).toBe(false);
    await ctl.judgeThen(rest);
    expect(h.st.calls).toHaveLength(0);
  });

  it('judge on: the payload carries wardenJudged', async () => {
    const { h, ctl, act } = rig([personal, quota]);
    h.st.mainReplies = [JSON.stringify({ expectationId: 'x2', conflict: 'major' })];
    expect(ctl.needsJudge(rest)).toBe(true);
    await ctl.judgeThen(rest);
    expect(act).toHaveBeenCalledTimes(1);
    expect(act.mock.calls[0][0]).toEqual({ type: 'activity/do', payload: { activityId: 'rest', wardenJudged: { expectationId: 'x2', conflict: 'major' } } });
  });

  it('a failed call dispatches without it', async () => {
    const { h, ctl, act } = rig([personal]);
    h.st.mainReplies = ['nope', 'nope'];
    await ctl.judgeThen(rest);
    expect(act.mock.calls[0][0]).toEqual(rest);
  });

  it('"none" is not attached', async () => {
    const { h, ctl, act } = rig([personal]);
    h.st.mainReplies = [JSON.stringify({ expectationId: 'x2', conflict: 'none' })];
    await ctl.judgeThen(rest);
    expect(act.mock.calls[0][0]).toEqual(rest);
  });

  it('combat never calls', async () => {
    const { h, ctl } = rig([personal]);
    const order = { type: 'combat/order', payload: { orderId: 'fall_back', targetCid: 's1' } };
    expect(ctl.needsJudge(order)).toBe(false);
    await ctl.judgeThen(order);
    expect(h.st.calls).toHaveLength(0);
  });

  it('a chat that changed while the model judged drops the action', async () => {
    const { h, ctl, act } = rig([personal]);
    h.st.mainReplies = [JSON.stringify({ expectationId: 'x2', conflict: 'major' })];
    const p = ctl.judgeThen(rest);
    h.switchChat('other');
    expect(await p).toEqual([]);
    expect(act).not.toHaveBeenCalled();
    await flush();
  });

  it('orderOfAction reads the four overridable actions', () => {
    expect(orderOfAction({ type: 'activity/do', payload: { activityId: 'rest', companionId: 'unit_ann' } })).toEqual({ kind: 'activity', activityId: 'rest', companionId: 'unit_ann' });
    expect(orderOfAction({ type: 'roster/set_active', payload: { activeIds: ['a'] } })).toEqual({ kind: 'roster', activeIds: ['a'] });
    expect(orderOfAction({ type: 'expedition/start', payload: { unitIds: ['a'], missionId: 'm1' } })).toEqual({ kind: 'expedition', missionId: 'm1', unitIds: ['a'] });
    expect(orderOfAction({ type: 'dilemma/choose', payload: { id: 'd', index: 1 } })).toEqual({ kind: 'dilemma', index: 1 });
    expect(orderOfAction({ type: 'combat/order', payload: {} })).toBeNull();
  });
});
