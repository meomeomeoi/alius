import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/headStart';
import '../../src/engine/actions/memory';
import { recapPairs } from '../../src/engine/headStart/recap';
import { buildCampaign } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { createHeadStart, headStartOpening, OPENING_DIRECTIVE } from '../../src/headStart/controller';
import { loadCore, unitSetup } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const COMMANDER_PRONOUN = /\bcommander\b[^.]*\b(he|him|his|she|her)\b|\b(he|him|his)\b[^.]*\bcommander\b/i;

const build = (days = 14, newArrivals: string[] = ['rhea.png']): CampaignState => {
  const out = buildCampaign({
    commanderName: 'Vale', startId: 'start_vesper', crimeId: 'liquidation', units: ['Ann', 'Bea', 'Rhea'].map((n) => unitSetup(n)),
    ...(days > 0 ? { headStart: { days: days as 14, newArrivals } } : {}),
  }, reg, { desireBondDefects: false, seed: 7 });
  if (!out.ok) throw new Error(out.errors.join('; '));
  return out.state;
};
const answerFor = (s: CampaignState, tag = 'a') => ({
  units: s.headStart!.units.map((u) => ({ unitId: u.unitId, moments: u.moments.map((kind) => ({ kind, text: `${tag}: ${u.unitId} remembers ${kind}.` })) })),
  chronicle: `${tag}: the squad had two weeks with the commander.`,
});
const flush = () => new Promise((r) => setTimeout(r, 0));
const records = (h: ReturnType<typeof worldHarness>) => h.state().generations?.records ?? [];
const headFacts = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('head_start'));

function rig(initial: CampaignState = build(), over: Record<string, unknown> = {}) {
  const h = worldHarness(reg, initial, { autoRetry: 0, ...over });
  for (const n of ['ann', 'bea', 'rhea']) h.st.cards.set(`${n}.png`, { avatar: `${n}.png`, name: n, description: `${n} is a soldier.`, personality: 'Dry.', scenario: '', creatorNotes: '' });
  const directives = new Map<string, { id: string; text: string; expiresAfter?: string }>();
  const context = {
    setDirective: (d: { id: string; text: string; expiresAfter?: string }) => { directives.set(d.id, d); },
    clearMatching: (f: (d: { id: string }) => boolean) => { for (const d of [...directives.values()]) if (f(d)) directives.delete(d.id); },
  };
  const refreshContext = vi.fn();
  const ctl = createHeadStart({ ...h.deps, context: context as never, refreshContext });
  return { h, ctl, directives, refreshContext };
}

describe('the recap request', () => {
  it('onLoaded asks once and applies the answer', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    ctl.onLoaded();
    await flush();
    const s = h.state();
    expect(s.headStart!.recap).toMatchObject({ source: 'model' });
    expect(headFacts(s)).toHaveLength(recapPairs(s).length);
    expect(headFacts(s)[0].text).toMatch(/^a: /);
    expect(s.memory.chronicle.at(-1)!.text).toMatch(/^a: the squad/);
    expect(h.st.calls).toHaveLength(1);
    expect(records(h)).toEqual([]);
  });

  it('the model is not told the authors\' draft marker', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    ctl.onLoaded();
    await flush();
    expect((h.st.calls[0] as { prompt: string }).prompt).not.toMatch(/AUTHOR TO WRITE/i);
  });

  it('the prompt is built from the state: the days, the crime, her card and her moments', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    ctl.onLoaded();
    await flush();
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('14 days');
    expect(prompt).toContain('ann is a soldier.');
    expect(prompt).toContain('unit_ann');
    expect(prompt).not.toContain('unit_rhea'); // the new arrival is no part of the recap
    for (const kind of h.state().headStart!.units[0].moments) expect(prompt).toContain(kind);
  });

  it('a chat switch that dropped the answer does not stop the next load from asking again', async () => {
    const { h, ctl } = rig();
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    h.st.generateMain = async (req) => { h.switchChat('other'); return original(req); };
    ctl.onLoaded();
    await flush();
    expect(h.state().headStart!.recap).toBeUndefined();
    // back in the first chat: the load asks again and the recap lands
    h.switchChat('c');
    h.st.generateMain = original;
    h.st.mainReplies = [JSON.stringify(answerFor(h.state(), 'b'))];
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(2);
    expect(h.state().headStart!.recap).toMatchObject({ source: 'model' });
    expect(headFacts(h.state()).every((f) => f.text.startsWith('b: '))).toBe(true);
  });

  it('reload asks once', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(answerFor(h.state())), JSON.stringify(answerFor(h.state(), 'b'))];
    ctl.onLoaded();
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(1);
  });

  it('a recap already written is not asked again', async () => {
    const { h, ctl } = rig();
    h.app().dispatch({ type: 'head_start/recap', payload: { ...answerFor(h.state()), source: 'model' } });
    h.st.mainReplies = [JSON.stringify(answerFor(h.state(), 'b'))];
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(0);
  });

  it('a campaign without a head start asks for nothing', async () => {
    const { h, ctl } = rig(build(0, []));
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(0);
  });

  it('no profile applies the fallback without a record', async () => {
    const { h, ctl } = rig(build(), { mechanicProfileId: '', mechanicFallbackToMain: false });
    ctl.onLoaded();
    await flush();
    const s = h.state();
    expect(s.headStart!.recap!.source).toBe('fallback');
    expect(headFacts(s)).toHaveLength(recapPairs(s).length);
    expect(s.memory.chronicle.at(-1)!.text).toMatch(/^The squad had 14 days with the commander/);
    for (const f of headFacts(s)) expect(f.text, f.text).not.toMatch(/AUTHOR TO WRITE|^unit_|^Ann:|^Bea:/);
    expect(s.generations).toBeUndefined();
  });

  it('an invalid answer retries, then falls back with a full record', async () => {
    const { h, ctl } = rig(build(), { autoRetry: 1 });
    const bad = { units: [], chronicle: 'x' };
    h.st.mainReplies = [JSON.stringify(bad), JSON.stringify(bad)];
    ctl.onLoaded();
    await flush();
    expect(h.st.calls).toHaveLength(2);
    const s = h.state();
    expect(s.headStart!.recap!.source).toBe('fallback');
    expect(records(h)).toMatchObject([{ siteId: 'setup.head_start_recap', key: 'recap', fallbackApplied: true, status: 'open' }]);
    // RETRY replaces the template texts in place
    h.st.mainReplies = [JSON.stringify(answerFor(s, 'r'))];
    expect((await h.deps.generations.retry(records(h)[0].id)).kind).toBe('applied');
    expect(h.state().headStart!.recap!.source).toBe('model');
    expect(headFacts(h.state())).toHaveLength(recapPairs(s).length);
    expect(headFacts(h.state()).every((f) => f.text.startsWith('r: '))).toBe(true);
  });

  it('an answer for another chat is dropped', async () => {
    const { h, ctl } = rig();
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    h.st.generateMain = async (req) => { h.switchChat('other'); return original(req); };
    ctl.onLoaded();
    await flush();
    expect(h.state().headStart!.recap).toBeUndefined();
    expect(headFacts(h.state())).toEqual([]);
  });

  it('reroll replaces before the first scene and is refused after', async () => {
    const { h, ctl } = rig();
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    ctl.onLoaded();
    await flush();
    expect(ctl.rerollState()).toEqual({ enabled: true });
    h.st.mainReplies = [JSON.stringify(answerFor(h.state(), 'b'))];
    await ctl.rerollRecap();
    expect(headFacts(h.state()).every((f) => f.text.startsWith('b: '))).toBe(true);
    h.setState((s) => { s.memory.scenes = [{ sceneId: 's1', from: 0, to: 3, summarized: true }]; });
    expect(ctl.rerollState()).toEqual({ enabled: false, reason: 'The first scene has started.' });
    h.st.mainReplies = [JSON.stringify(answerFor(h.state(), 'c'))];
    await ctl.rerollRecap();
    expect(headFacts(h.state()).every((f) => f.text.startsWith('b: '))).toBe(true);
  });

  it('the fact length the player set is what the model is asked for', async () => {
    const wide = build();
    wide.memory.config = { preset: 'normal', factTextMax: 150 } as CampaignState['memory']['config'];
    const { h, ctl } = rig(wide);
    h.st.mainReplies = [JSON.stringify(answerFor(h.state()))];
    ctl.onLoaded();
    await flush();
    expect((h.st.calls[0] as { prompt: string }).prompt).toContain('at most 150 characters');
  });
});

describe('the opening directive', () => {
  const open = (s: CampaignState): CampaignState => { s.scene = { id: 's1', participants: ['unit_ann'], exchanges: 0 } as never; return s; };

  it('is set in the first scene of day 1 and cleared after', () => {
    const { h, ctl, directives, refreshContext } = rig(open(build()));
    ctl.onSceneOpened();
    expect(directives.get(OPENING_DIRECTIVE)).toMatchObject({ id: 'head_start:known', expiresAfter: 'scene' });
    expect(directives.get(OPENING_DIRECTIVE)!.text).toContain('The squad has known the commander for 14 days: no introductions, no first meeting.');
    expect(refreshContext).toHaveBeenCalled();
    ctl.onSceneClosed();
    expect(directives.size).toBe(0);
    void h;
  });

  it('is absent in a second scene, on day 2 and without a head start', () => {
    const second = open(build());
    second.memory.scenes = [{ sceneId: 's0', from: 0, to: 3, summarized: true }];
    const a = rig(second);
    a.ctl.onSceneOpened();
    expect(a.directives.size).toBe(0);
    const later = open(build());
    later.day = 2;
    const b = rig(later);
    b.ctl.onSceneOpened();
    expect(b.directives.size).toBe(0);
    const plain = rig(open(build(0, [])));
    plain.ctl.onSceneOpened();
    expect(plain.directives.size).toBe(0);
  });

  it('no scene, no directive', () => {
    const { ctl, directives } = rig(build());
    ctl.onSceneOpened();
    expect(directives.size).toBe(0);
  });

  it('the opening names the new arrivals', () => {
    expect(headStartOpening(build())).toBe(
      'The squad has known the commander for 14 days: no introductions, no first meeting. Rhea arrived today and meets the commander for the first time.',
    );
    const two = build(14, ['bea.png', 'rhea.png']);
    expect(headStartOpening(two)).toContain('Bea and Rhea arrived today and meet the commander for the first time.');
    expect(headStartOpening(build(7, []))).toBe('The squad has known the commander for 7 days: no introductions, no first meeting.');
  });

  it('a deserted or terminated new arrival is not named', () => {
    const s = build(14, ['bea.png', 'rhea.png']);
    s.squad.find((u) => u.id === 'unit_rhea')!.status = 'deserted' as never;
    expect(headStartOpening(s)).toContain('Bea arrived today and meets');
    expect(headStartOpening(s)).not.toContain('Rhea');
    s.squad.find((u) => u.id === 'unit_bea')!.status = 'terminated' as never;
    expect(headStartOpening(s)).toBe('The squad has known the commander for 14 days: no introductions, no first meeting.');
  });

  it('gives the commander no pronoun', () => {
    for (const s of [build(), build(30, []), build(7, ['bea.png', 'rhea.png'])]) expect(headStartOpening(s)).not.toMatch(COMMANDER_PRONOUN);
  });
});
