import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/comms';
import '../../src/engine/actions/life';
import '../../src/engine/actions/scene';
import { closeNews, enqueue, lifeHash, writeLifeFact } from '../../src/engine/life';
import { newLife } from '../../src/engine/life/state';
import type { LifeEventEntry } from '../../src/engine/life/types';
import { stubExpedition } from '../helpers/world';
import type { CampaignState } from '../../src/engine/state/types';
import { createLife } from '../../src/life/controller';
import { generationSite } from '../../src/llm/sites';
import { listFlavorKinds } from '../../src/llm/calls/flavor';
import { campaign, loadCore } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const EVENT = 'broke_favourite_thing';
const records = (h: ReturnType<typeof worldHarness>) => h.state().generations?.records ?? [];
const answer = (text: string) => JSON.stringify({ text });

/** Ann has a DM waiting in the outbox (a life event), or a note (the `faces` milestone of sketching). */
function world(kind: 'dm' | 'note' = 'dm'): { s: CampaignState; itemId: string } {
  const s = campaign(reg, 4);
  s.day = 20;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  const fact = writeLifeFact(s, ANN, kind === 'dm' ? 'Ann: She broke something small.' : 'Ann (sketching): faces.', ['life'], 1);
  enqueue(s, kind === 'dm'
    ? { unitId: ANN, kind: 'event', ref: EVENT, what: 'event', factId: fact.id, category: 'things', day: 20 }
    : { unitId: ANN, kind: 'hobby', ref: 'sketching', what: 'milestone', milestoneId: 'faces', factId: fact.id, category: 'hobby', day: 20 });
  const itemId = s.life!.queue.at(-1)!.id;
  s.life!.outbox.push({ itemId, unitId: ANN, channel: kind, day: 20 });
  return { s, itemId };
}

function rig(initial: CampaignState, over: Record<string, unknown> = {}) {
  const h = worldHarness(reg, initial, { autoRetry: 0, ...over });
  h.st.cards.set('ann.png', { avatar: 'ann.png', name: 'Ann', description: 'Ann is a soldier.', personality: 'Dry.', scenario: '', creatorNotes: '' });
  const directives = new Map<string, { id: string; text: string }>();
  const context = {
    setDirective: (d: { id: string; text: string }) => { directives.set(d.id, d); },
    clearMatching: (f: (d: { id: string }) => boolean) => { for (const d of [...directives.values()]) if (f(d)) directives.delete(d.id); },
  };
  const refreshContext = vi.fn();
  const ctl = createLife({ ...h.deps, context: context as never, refreshContext });
  return { h, ctl, directives, refreshContext };
}
const entry = (): LifeEventEntry => reg.lifeEvents.get(EVENT) as unknown as LifeEventEntry;
const dms = (h: ReturnType<typeof worldHarness>) => h.state().dms[ANN] ?? [];

describe('the share DM', () => {
  it('an outbox item becomes one DM, in the words of the model', async () => {
    const { s, itemId } = world();
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer('My mug. The chipped one. It finally gave up.')];
    await ctl.run();
    expect(h.st.calls).toHaveLength(1);
    expect(dms(h)).toMatchObject([{ from: ANN, text: 'My mug. The chipped one. It finally gave up.', initiated: true, read: false }]);
    expect(h.log.at(-1)).toEqual({ type: 'life/share_done', payload: { itemId, text: 'My mug. The chipped one. It finally gave up.' } });
    expect(h.state().life!.outbox).toEqual([]);
    expect(h.state().life!.queue).toEqual([]);
    expect(h.state().memory.facts.find((f) => f.text.startsWith('Ann: She broke'))!.hiddenFromCommander).toBeUndefined();
    expect(records(h)).toEqual([]);
    expect(h.toasts).toEqual([]);
    // the call was told who she is, how she talks, what happened and her tone, never anything of the commander's gender
    const call = h.st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('Ann');
    expect(call.prompt).toContain('terse, steady, dry');
    expect(call.prompt).toContain('She broke something small');
    expect(call.prompt).toContain(entry().lines[0]);
    expect(call.prompt).toContain(entry().lines[1]);
    expect(call.prompt).toContain('Morning'.toLowerCase());
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('cuts a long answer to 300 characters and strips the markdown and the label', async () => {
    const { s } = world();
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer(`**Message:** ${'word '.repeat(100)}`)];
    await ctl.run();
    const text = dms(h)[0].text;
    expect(text.length).toBeLessThanOrEqual(300);
    expect(text).not.toContain('*');
    expect(text.startsWith('word')).toBe(true);
  });

  it('no profile: the registry line is the DM, picked by hash, and no record is written', async () => {
    const { s, itemId } = world();
    const { h, ctl } = rig(s, { mechanicProfileId: '', mechanicFallbackToMain: false });
    await ctl.run();
    expect(h.st.calls).toHaveLength(0);
    const expected = entry().lines[lifeHash(s.life!, itemId) % 2];
    expect(dms(h).map((m) => m.text)).toEqual([expected]);
    expect(h.state().life!.outbox).toEqual([]);
    expect(h.state().generations).toBeUndefined();
  });

  it('a refused call dispatches the fallback, with no toast and no record (nothing can be rerolled once the fallback stands)', async () => {
    const { s, itemId } = world();
    const { h, ctl } = rig(s);
    h.st.mainReplies = ['I cannot help with that.'];
    await ctl.run();
    expect(dms(h).map((m) => m.text)).toEqual([entry().lines[lifeHash(s.life!, itemId) % 2]]);
    expect(records(h)).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it('an answer that does not fit (a pronoun for the commander) is a failure, not a DM', async () => {
    const { s, itemId } = world();
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer('I told him about it.')];
    await ctl.run();
    expect(dms(h).map((m) => m.text)).toEqual([entry().lines[lifeHash(s.life!, itemId) % 2]]);
    expect(records(h)).toEqual([]); // the fallback stands: a site that cannot be rerolled writes no record then
  });

  it('an answer after a chat switch is dropped: nothing is told and the item stays', async () => {
    const { s } = world();
    const { h, ctl } = rig(s);
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [answer('Hello.')];
    h.st.generateMain = async (req) => { h.switchChat('other'); return original(req); };
    await ctl.run();
    expect(dms(h)).toEqual([]);
    expect(h.state().life!.outbox).toHaveLength(1);
  });

  it('the item left the outbox while the call was out: nothing is told', async () => {
    const { s, itemId } = world();
    const { h, ctl } = rig(s);
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [answer('Hello.')];
    h.st.generateMain = async (req) => { h.setState((x) => { closeNews(x, itemId); }); return original(req); };
    await ctl.run();
    expect(dms(h)).toEqual([]);
    expect(records(h)).toEqual([]);
  });

  it('one item per run: the next waits for the next run', async () => {
    const { s } = world();
    const fact = writeLifeFact(s, BEA, 'Bea: She won a hand of cards.', ['life'], 1);
    enqueue(s, { unitId: BEA, kind: 'event', ref: EVENT, what: 'event', factId: fact.id, category: 'luck', day: 20 });
    s.life!.outbox.push({ itemId: s.life!.queue.at(-1)!.id, unitId: BEA, channel: 'dm', day: 20 });
    const { h, ctl } = rig(s);
    h.st.cards.set('bea.png', { avatar: 'bea.png', name: 'Bea', description: 'b', personality: 'p', scenario: '', creatorNotes: '' });
    h.st.mainReplies = [answer('One.'), answer('Two.')];
    await ctl.run();
    expect(h.st.calls).toHaveLength(1);
    expect(h.state().life!.outbox).toHaveLength(1);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
    expect(h.state().life!.outbox).toEqual([]);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
  });

  it('nothing asked while a run or a fight is open, or with life off', async () => {
    const { s } = world();
    const open = structuredClone(s);
    open.expedition = stubExpedition(open, { party: [BEA] });
    const a = rig(open);
    await a.ctl.run();
    expect(a.h.st.calls).toHaveLength(0);
    const fight = structuredClone(s);
    fight.combat = {} as never;
    const b = rig(fight);
    await b.ctl.run();
    expect(b.h.st.calls).toHaveLength(0);
    const off = structuredClone(s);
    off.settings.lifeEvents = 'off';
    const c = rig(off);
    await c.ctl.run();
    expect(c.h.st.calls).toHaveLength(0);
    expect(c.h.state().life!.outbox).toHaveLength(1);
  });

  it('an item that could not be told is not asked for again until the next scene closes', async () => {
    const { s } = world();
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer('Hello.'), answer('Hello again.')];
    h.setState((x) => { x.ended = true as never; }); // every action is refused
    await ctl.run();
    const asked = h.st.calls.length;
    await ctl.run();
    expect(h.st.calls).toHaveLength(asked);
  });

  it('a hobby that was started or dropped has a plain line of its own when nothing is generated', async () => {
    const { s } = world();
    s.life!.queue[0].kind = 'hobby';
    s.life!.queue[0].ref = 'chess';
    s.life!.queue[0].what = 'started';
    const { h, ctl } = rig(s, { mechanicProfileId: '', mechanicFallbackToMain: false });
    await ctl.run();
    expect(dms(h)).toHaveLength(1);
    expect(dms(h)[0].text).toContain('chess');
    expect(dms(h)[0].text).not.toMatch(/\b(he|him|his|himself)\b/i);
  });
});

describe('a woman who is no longer living', () => {
  it('her DM or note is never asked for: no call, no record, and no new ask after a scene closes', async () => {
    for (const kind of ['dm', 'note'] as const) {
      const { s } = world(kind);
      s.squad[0].status = 'dead';
      const { h, ctl } = rig(s);
      h.st.mainReplies = [answer('Hello.'), answer('Hello.')];
      await ctl.run();
      ctl.onSceneClosed();
      await ctl.run();
      ctl.onSceneClosed();
      await ctl.run();
      expect(h.st.calls).toHaveLength(0);
      expect(records(h)).toEqual([]);
      expect(dms(h)).toEqual([]);
    }
  });
});

describe('the trace note', () => {
  it('a note item becomes a note in her quarters, in the words of the model', async () => {
    const { s, itemId } = world('note');
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer('Pencil faces, pinned over the cot.')];
    await ctl.run();
    expect(h.log.at(-1)).toEqual({ type: 'life/trace_note', payload: { itemId, text: 'Pencil faces, pinned over the cot.' } });
    expect(h.state().notes!.list).toMatchObject([{ unitId: ANN, noteId: 'life:sketching', where: 'quarters', text: 'Pencil faces, pinned over the cot.' }]);
    expect(h.state().life!.outbox).toEqual([]);
    expect(dms(h)).toEqual([]);
    const call = h.st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('sketching');
    expect(call.prompt).toContain(String((reg.hobbies.get('sketching')!.milestones as Array<{ id: string; line: string }>).find((m) => m.id === 'faces')!.line));
    expect(call.prompt).toContain('torn notebook paper'); // the hobby's own trace text, as the tone
  });

  it('a failure leaves the hobby\'s own trace text as the note, with no record', async () => {
    const { s, itemId } = world('note');
    const { h, ctl } = rig(s);
    h.st.mainReplies = ['nope'];
    await ctl.run();
    expect(h.state().notes!.list[0].text).toBe(String(reg.hobbies.get('sketching')!.traceText));
    expect(records(h)).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it('no profile: the trace text, no record', async () => {
    const { s } = world('note');
    const { h, ctl } = rig(s, { mechanicProfileId: '', mechanicFallbackToMain: false });
    await ctl.run();
    expect(h.st.calls).toHaveLength(0);
    expect(h.state().notes!.list[0].text).toBe(String(reg.hobbies.get('sketching')!.traceText));
    expect(h.state().generations).toBeUndefined();
  });
});

describe('the scene directive', () => {
  function withNews(): { s: CampaignState; itemId: string } {
    const { s, itemId } = world();
    s.life!.outbox = [];
    s.life!.news.push({ itemId, unitId: ANN, until: 23 });
    s.scene = { id: 's1', participants: [ANN, BEA], exchanges: 0 } as never;
    return { s, itemId };
  }

  it('is set when the scene opens, gone once the news is told, and cleared when the scene closes', () => {
    const { s, itemId } = withNews();
    const { h, ctl, directives, refreshContext } = rig(s);
    ctl.onSceneOpened();
    expect([...directives.keys()]).toEqual([`life:news:${ANN}`]);
    expect(refreshContext).toHaveBeenCalled();
    h.setState((x) => { closeNews(x, itemId); });
    ctl.onSceneOpened();
    expect(directives.size).toBe(0);
    ctl.onSceneClosed();
    expect(directives.size).toBe(0);
  });

  it('clearing at the scene end drops the directive', () => {
    const { s } = withNews();
    const { ctl, directives } = rig(s);
    ctl.onSceneOpened();
    expect(directives.size).toBe(1);
    ctl.onSceneClosed();
    expect(directives.size).toBe(0);
  });

  it('no scene, no directive; life off, none', () => {
    const { s } = withNews();
    delete s.scene;
    const a = rig(s);
    a.ctl.onSceneOpened();
    expect(a.directives.size).toBe(0);
    const { s: off } = withNews();
    off.settings.lifeEvents = 'off';
    const b = rig(off);
    b.ctl.onSceneOpened();
    expect(b.directives.size).toBe(0);
  });

  it('a passing mention reads "recently" and is gone after the scene (the engine drops it at scene/end)', () => {
    const { s } = withNews();
    s.life!.news[0].passing = true;
    const { h, ctl, directives } = rig(s);
    ctl.onSceneOpened();
    expect(directives.get(`life:news:${ANN}`)!.text).toContain('recently');
    h.app().dispatch({ type: 'scene/end', payload: {} });
    ctl.onSceneClosed();
    expect(directives.size).toBe(0);
    expect(h.state().life!.news).toEqual([]);
  });

  it('a news_delivered, news_stale or life_noted event refreshes the context', () => {
    const { s } = withNews();
    const { ctl, refreshContext } = rig(s);
    refreshContext.mockClear();
    ctl.onEvents([{ type: 'hobby_progress', unitId: ANN }]);
    expect(refreshContext).not.toHaveBeenCalled();
    ctl.onEvents([{ type: 'news_delivered', itemId: 'ln0', unitId: ANN, channel: 'directive' }]);
    expect(refreshContext).toHaveBeenCalledTimes(1);
    ctl.onCommanderLine('hello'); // Task 13: nothing yet
  });
});

describe('the sites', () => {
  it('the two flavor kinds have their sites: quiet, no reroll (an applied item closes), on the flavor call type', () => {
    for (const kind of ['life_share', 'life_trace']) {
      expect(listFlavorKinds()).toContain(kind);
      expect(generationSite(`flavor.${kind}`)).toMatchObject({ callType: 'flavor', record: 'quiet', reroll: 'none', surface: 'day' });
    }
    expect(generationSite('flavor.life_share')!.label(null, 'k')).toBe('Her news');
    expect(generationSite('flavor.life_trace')!.label(null, 'k')).toBe('Her note');
  });
});
