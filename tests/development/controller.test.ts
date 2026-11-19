import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/development';
import '../../src/engine/actions/scene';
import { createDevelopment } from '../../src/development/controller';
import { developmentOf, ensureDevelopment } from '../../src/engine/development/state';
import type { Appraisal, CampaignState } from '../../src/engine/state/types';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann', BEA = 'unit_bea';
const ap = (i: number): Appraisal => ({
  id: `ap${i}`, day: 1, kind: 'praised', target: 'her', role: 'subject', wanted: 'yes', initiator: 'actor', harm: 'none', outcome: 'good', severity: 'moderate',
  subject: ANN, pushes: [], summary: `subject · praised · Ann · ${i}`,
});
/** ANN and (optionally) BEA are due: three experiences waiting, support on mercy, day 8. */
function world(due: string[] = [ANN]): CampaignState {
  const s = campaign(reg, 4);
  s.settings.characterDevelopment = 'normal';
  s.day = 8;
  for (const id of due) {
    const dev = ensureDevelopment(s.squad.find((u) => u.id === id)!);
    dev.pending = [ap(0), ap(1), ap(2)];
    dev.acc = { 'value:mercy': 3.5 };
    dev.nextId = 3;
  }
  return s;
}
const answer = (over: Record<string, unknown> = {}) => JSON.stringify({
  shifts: [{ axis: 'value:mercy', direction: 'up', size: 'step', reason: 'Weeks of kindness.' }], facts: [{ text: 'She saves the commander a seat.', kind: 'attitude' }], ...over,
});
const records = (h: ReturnType<typeof worldHarness>) => h.state().generations?.records ?? [];

function rig(initial: CampaignState = world(), over: Record<string, unknown> = {}) {
  const h = worldHarness(reg, initial, { autoRetry: 0, ...over });
  for (const n of ['ann', 'bea']) h.st.cards.set(`${n}.png`, { avatar: `${n}.png`, name: n, description: `${n} is a soldier.`, personality: 'Dry.', scenario: '', creatorNotes: '' });
  const directives = new Map<string, { id: string; text: string }>();
  const context = {
    setDirective: (d: { id: string; text: string }) => { directives.set(d.id, d); },
    clearMatching: (f: (d: { id: string }) => boolean) => { for (const d of [...directives.values()]) if (f(d)) directives.delete(d.id); },
  };
  const refreshContext = vi.fn();
  const ctl = createDevelopment({ ...h.deps, context: context as never, refreshContext });
  return { h, ctl, directives, refreshContext };
}
const ann = (h: ReturnType<typeof worldHarness>) => developmentOf(h.state().squad.find((u) => u.id === ANN)!);

describe('the review request', () => {
  it('asks for one due review and applies the answer', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [answer()];
    await ctl.run();
    expect(h.st.calls).toHaveLength(1);
    expect(ann(h).drift.mercy).toBe(1);
    expect(ann(h).facts.map((f) => f.text)).toEqual(['She saves the commander a seat.']);
    expect(ann(h).pending).toEqual([]);
    expect(records(h)).toEqual([]);
    expect(h.toasts).toEqual([]);
    const call = h.st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('ann is a soldier.');
    expect(call.prompt).toContain('value:mercy: up, strong');
    expect(call.prompt).toContain('praised');
  });

  it('nothing due, nothing asked', async () => {
    const { h, ctl } = rig(world([]));
    await ctl.run();
    expect(h.st.calls).toHaveLength(0);
  });

  it('one review per run: two units due, one call, the second on the next run', async () => {
    const { h, ctl } = rig(world([ANN, BEA]));
    h.st.mainReplies = [answer(), answer({ shifts: [] })];
    await ctl.run();
    expect(h.st.calls).toHaveLength(1);
    expect(h.state().squad.find((u) => u.id === BEA)!.development!.pending).toHaveLength(3);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
    expect(h.state().squad.find((u) => u.id === BEA)!.development!.pending).toEqual([]);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
  });

  it('no profile: the fallback review applies and no record is written', async () => {
    const { h, ctl } = rig(world(), { mechanicProfileId: '', mechanicFallbackToMain: false });
    await ctl.run();
    expect(h.st.calls).toHaveLength(0);
    expect(ann(h).drift.mercy).toBeCloseTo(0.34); // a nudge: the fallback never steps
    expect(ann(h).facts).toEqual([]);
    expect(ann(h).pending).toEqual([]);
    expect(h.state().generations).toBeUndefined();
    expect(h.log.at(-1)).toMatchObject({ type: 'development/review', payload: { source: 'fallback' } });
  });

  it('a failure writes a quiet record, applies the fallback, and shows no toast', async () => {
    const { h, ctl } = rig(world(), { autoRetry: 0 });
    h.st.mainReplies = ['I cannot help with that.'];
    await ctl.run();
    expect(ann(h).drift.mercy).toBeCloseTo(0.34);
    expect(records(h)).toMatchObject([{ siteId: 'development.review', key: ANN, fallbackApplied: true, quiet: true }]);
    expect(h.toasts).toEqual([]);
  });

  it('a retry after the fallback replaces it in place', async () => {
    const { h, ctl } = rig(world(), { autoRetry: 0 });
    h.st.mainReplies = ['nope'];
    await ctl.run();
    h.st.mainReplies = [answer()];
    expect((await h.deps.generations.retry(records(h)[0].id)).kind).toBe('applied');
    expect(ann(h).drift.mercy).toBe(1); // the model's step, not the nudge
    expect(ann(h).facts).toHaveLength(1);
    expect(ann(h).acc['value:mercy']).toBeCloseTo(0.5);
    // the retry read the batch the fallback had taken
    expect((h.st.calls[1] as { prompt: string }).prompt).toContain('praised');
  });

  it('an answer after a chat switch is dropped', async () => {
    const { h, ctl } = rig();
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [answer()];
    h.st.generateMain = async (req) => { h.switchChat('other'); return original(req); };
    await ctl.run();
    expect(ann(h).drift).toEqual({});
    expect(ann(h).pending).toHaveLength(3);
  });

  it('a hostile answer cannot overreach: unknown axes and a step without support are dropped', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [answer({ shifts: [{ axis: 'value:autonomy', direction: 'up', size: 'step', reason: 'x' }, { axis: 'bond:own_limits', direction: 'up', size: 'step', reason: 'x' }] })];
    await ctl.run();
    expect(ann(h).drift).toEqual({});
    expect(ann(h).pending).toEqual([]); // the batch is closed all the same
  });
});

describe('reroll', () => {
  it('replaces the review before she has shown it, and is refused after the scene', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [answer()];
    await ctl.run();
    expect(ctl.rerollState(ANN)).toEqual({ enabled: true });
    h.st.mainReplies = [answer({ shifts: [{ axis: 'value:mercy', direction: 'up', size: 'nudge', reason: 'again' }], facts: [] })];
    await ctl.reroll(ANN);
    expect(ann(h).drift.mercy).toBeCloseTo(0.34);
    expect(ann(h).facts).toEqual([]);
    // a scene stamps and shows what the review left
    h.setState((s) => { ensureDevelopment(s.squad.find((u) => u.id === ANN)!).moments.push({ id: 'dmx', axis: 'value:mercy', from: '1', to: '2', reason: 'r', day: 8, sceneId: 's1' }); ensureDevelopment(s.squad.find((u) => u.id === ANN)!).lastApplied!.momentIds.push('dmx'); });
    expect(ctl.rerollState(ANN)).toEqual({ enabled: false, reason: 'She has already shown it.' });
    h.st.mainReplies = [answer()];
    const calls = h.st.calls.length;
    await ctl.reroll(ANN);
    expect(h.st.calls).toHaveLength(calls);
    expect(ann(h).drift.mercy).toBeCloseTo(0.34);
  });
});

describe('the scene directive', () => {
  it('is set while the scene carries her change and cleared when it closes', () => {
    const s = world([]);
    ensureDevelopment(s.squad.find((u) => u.id === ANN)!).moments = [{ id: 'dm0', axis: 'value:mercy', from: '1', to: '2', reason: 'r', day: 3, sceneId: 's1' }];
    s.scene = { id: 's1', participants: [ANN, BEA], exchanges: 0 } as never;
    const { ctl, directives, refreshContext } = rig(s);
    ctl.onSceneOpened();
    expect([...directives.keys()]).toEqual(['development:unit_ann']);
    expect(refreshContext).toHaveBeenCalled();
    ctl.onSceneClosed();
    expect(directives.size).toBe(0);
  });

  it('no scene, no directive', () => {
    const { ctl, directives } = rig(world([]));
    ctl.onSceneOpened();
    expect(directives.size).toBe(0);
  });
});
