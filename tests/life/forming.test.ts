import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/comms';
import '../../src/engine/actions/life';
import '../../src/engine/actions/scene';
import { lifeHash } from '../../src/engine/life';
import { defaultPosition } from '../../src/engine/life/opinions';
import { newLife } from '../../src/engine/life/state';
import type { OpinionTopicEntry } from '../../src/engine/life/types';
import type { CampaignState } from '../../src/engine/state/types';
import { createLife } from '../../src/life/controller';
import { campaign, errors, loadCore, run } from '../helpers/world';
import { worldHarness } from '../helpers/worldApp';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ANN = 'unit_ann';
const topic = (id: string) => reg.opinionTopics.get(id) as unknown as OpinionTopicEntry;
const records = (h: ReturnType<typeof worldHarness>) => h.state().generations?.records ?? [];
const answer = (position: string, text: string) => JSON.stringify({ position, text });
const opinions = (h: ReturnType<typeof worldHarness>) => h.state().squad.find((u) => u.id === ANN)!.opinions ?? {};

/** A scene with Ann is open at a place that brings no topic up, life is on. */
function world(mode: 'normal' | 'off' = 'normal'): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.world.clocks = [];
  s.settings.lifeEvents = mode;
  if (mode !== 'off') s.life = newLife(7);
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants: [ANN], origin: 'event', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
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

describe('lazy forming', () => {
  it('a keyword in the commander\'s line forms an opinion once (two lines with it, one call)', async () => {
    const { h, ctl } = rig(world());
    const position = topic('coffee').positions[1].id;
    h.st.mainReplies = [answer(position, 'Black, no sugar.'), answer('x', 'should never be used')];
    ctl.onCommanderLine('Want some coffee?');
    await ctl.idle();
    expect(h.st.calls).toHaveLength(1);
    expect(opinions(h).coffee).toEqual({ position, strength: 'held', text: 'Black, no sugar.', formedDay: 40 });
    expect(h.log.at(-1)).toMatchObject({ type: 'life/opinion_formed', payload: { unitId: ANN, topicId: 'coffee', position, source: 'model' } });
    ctl.onCommanderLine('More coffee, then?');
    await ctl.idle();
    expect(h.st.calls).toHaveLength(1);
    expect(opinions(h).coffee.text).toBe('Black, no sugar.');
    // she has a view now and the topic was triggered: it is the one she may voice in this scene
    expect(h.state().life!.units[ANN].scene!.topic).toBe('coffee');
    expect(records(h)).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it('the call is told her card, her manner, her firm views and the topic (and no pronoun for the commander)', async () => {
    const s = world();
    s.squad.find((u) => u.id === ANN)!.opinions = { the_leash: { position: topic('the_leash').positions[0].id, strength: 'strong', text: 'It is a collar with a number.', formedDay: 1 } };
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer(topic('coffee').positions[0].id, 'Strong.')];
    ctl.onCommanderLine('coffee');
    await ctl.idle();
    const call = h.st.calls[0] as { prompt: string; system?: string };
    expect(call.prompt).toContain('Ann is a soldier.');
    expect(call.prompt).toContain('terse, steady, dry');
    expect(call.prompt).toContain(`${topic('the_leash').label}: ${topic('the_leash').positions[0].id} — "It is a collar with a number."`);
    expect(call.prompt).toContain('TOPIC: ' + topic('coffee').label);
    expect(`${call.system}\n${call.prompt}`).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('no profile: the position the axis suggests and a hashed line of it, held loosely, with no call and no record', async () => {
    const s = world();
    const { h, ctl } = rig(s, { mechanicProfileId: '', mechanicFallbackToMain: false });
    ctl.onCommanderLine('The corporations again.');
    await ctl.idle();
    expect(h.st.calls).toHaveLength(0);
    const position = defaultPosition(s, reg, ANN, 'corporations');
    const line = topic('corporations').positions.find((p) => p.id === position)!.lines[lifeHash(s.life!, `${ANN}|corporations`) % 2];
    expect(opinions(h).corporations).toEqual({ position, strength: 'loose', text: line, formedDay: 40 });
    expect(h.log.at(-1)).toMatchObject({ type: 'life/opinion_formed', payload: { source: 'fallback', strength: 'loose' } });
    expect(h.state().generations).toBeUndefined();
  });

  it('a refused call is the fallback opinion, with no toast and no record (a site that cannot be rerolled writes none once its fallback stands)', async () => {
    const { h, ctl } = rig(world());
    h.st.mainReplies = ['I cannot help with that.'];
    ctl.onCommanderLine('coffee');
    await ctl.idle();
    expect(opinions(h).coffee).toMatchObject({ strength: 'loose', position: defaultPosition(h.state(), reg, ANN, 'coffee') });
    expect(h.log.at(-1)).toMatchObject({ type: 'life/opinion_formed', payload: { source: 'fallback' } });
    expect(records(h)).toEqual([]);
    expect(h.toasts).toEqual([]);
  });

  it('an answer with a position outside the topic is a failure and the fallback stands', async () => {
    const { h, ctl } = rig(world());
    h.st.mainReplies = [answer('burn_them', 'Fire.')];
    ctl.onCommanderLine('coffee');
    await ctl.idle();
    expect(opinions(h).coffee).toMatchObject({ strength: 'loose' });
    expect(opinions(h).coffee.position).not.toBe('burn_them');
    expect(records(h)).toEqual([]);
  });

  it('an answer after a chat switch is dropped: nothing is formed', async () => {
    const { h, ctl } = rig(world());
    const original = h.st.generateMain.bind(h.st);
    h.st.mainReplies = [answer(topic('coffee').positions[0].id, 'Strong.')];
    h.st.generateMain = async (req) => { h.switchChat('other'); return original(req); };
    ctl.onCommanderLine('coffee');
    await ctl.idle();
    expect(opinions(h)).toEqual({});
  });

  it('one topic per run: the next waits for the next run, and a formed topic is not asked again', async () => {
    const { h, ctl } = rig(world());
    h.st.mainReplies = [answer(topic('coffee').positions[0].id, 'One.'), answer(topic('music').positions[0].id, 'Two.')];
    ctl.onCommanderLine('coffee and music');
    await ctl.idle();
    expect(h.st.calls).toHaveLength(1);
    expect(Object.keys(opinions(h))).toEqual(['coffee']);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
    expect(Object.keys(opinions(h)).sort()).toEqual(['coffee', 'music']);
    await ctl.run();
    expect(h.st.calls).toHaveLength(2);
  });

  it('a topic opened for her (a trace, an event) is formed when a scene with her opens', async () => {
    const s = world();
    s.life!.units[ANN].pendingTopics = ['books'];
    const { h, ctl } = rig(s);
    h.st.mainReplies = [answer(topic('books').positions[0].id, 'Paper smells right.')];
    ctl.onSceneOpened();
    await ctl.idle();
    expect(opinions(h).books).toMatchObject({ position: topic('books').positions[0].id, strength: 'held' });
    expect(h.state().life!.units[ANN].pendingTopics).toEqual([]);
  });

  it('a line with no keyword and a scene with nothing triggered ask for nothing', async () => {
    const { h, ctl } = rig(world());
    ctl.onSceneOpened();
    ctl.onCommanderLine('Nothing of note here.');
    await ctl.idle();
    expect(h.st.calls).toHaveLength(0);
    expect(h.log.some((a) => a.type === 'life/topics_triggered')).toBe(false);
  });

  it('nothing with life off, without a scene, or while a fight or a run is open', async () => {
    const off = rig(world('off'));
    off.ctl.onCommanderLine('coffee');
    await off.ctl.idle();
    expect(off.h.st.calls).toHaveLength(0);
    expect(off.h.log).toEqual([]);
    const s = world();
    const none = structuredClone(s);
    delete none.scene;
    const a = rig(none);
    a.ctl.onCommanderLine('coffee');
    await a.ctl.idle();
    expect(a.h.st.calls).toHaveLength(0);
    const fight = structuredClone(s);
    fight.combat = {} as never;
    const b = rig(fight);
    b.ctl.onCommanderLine('coffee');
    await b.ctl.idle();
    expect(b.h.st.calls).toHaveLength(0);
  });

  it('a topic she formed meanwhile is not asked for: the call is expired and writes nothing', async () => {
    const { h } = rig(world());
    h.setState((x) => { x.squad.find((u) => u.id === ANN)!.opinions = { coffee: { position: 'x', strength: 'held', formedDay: 1 } }; });
    expect(await h.deps.generations.generate('opinion.form', `${ANN}:coffee`)).toMatchObject({ kind: 'expired' });
    expect(h.st.calls).toHaveLength(0);
    expect(records(h)).toEqual([]);
  });

  it('the opinion directive is set once a topic is picked for her', async () => {
    const { h, ctl, directives, refreshContext } = rig(world());
    h.st.mainReplies = [answer(topic('coffee').positions[2].id, 'Weak is fine.')];
    ctl.onCommanderLine('coffee');
    await ctl.idle();
    ctl.onEvents([{ type: 'topic_picked', unitId: ANN }]);
    expect(refreshContext).toHaveBeenCalled();
    ctl.onSceneOpened();
    expect([...directives.keys()]).toEqual([`life:opinion:${ANN}`]);
    expect(directives.get(`life:opinion:${ANN}`)!.text).toContain('Weak is fine.');
  });
});

describe('the scene controller hands the commander\'s line over', () => {
  it('before it goes out, trimmed, once per message', async () => {
    const { harness, reply } = await import('../helpers/sceneHarness');
    const seen: Array<{ text: string; sent: number }> = [];
    let h!: ReturnType<typeof harness>;
    h = harness(reg, { deps: { onCommanderLine: (text: string) => { seen.push({ text, sent: h.st.chatLength() }); } } });
    expect(await h.controller.start({ locationId: 'workshop', participants: [ANN], origin: 'event' })).toBe(true);
    h.st.groupReplies = [[reply('Ann', 'Mm.')]];
    h.st.mainReplies = [JSON.stringify({ events: [], facts: [], proposals: [], promises: [], emotions: [], stressHints: [] })];
    const before = h.st.chatLength();
    await h.controller.send('  Coffee, Ann?  ');
    expect(seen).toEqual([{ text: 'Coffee, Ann?', sent: before }]);
  });
});
