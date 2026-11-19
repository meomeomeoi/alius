import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { MOVED_REASON } from '../../src/llm/envelope';
import { ANN, harness, intentJson, praised, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const NOPE = 'nope'; // not a model answer: the JSON calls call it invalid; as prose it is a fine reply, so a reply failure uses an empty one
const world = (over: Parameters<typeof harness>[1] = {}) => harness(reg, { ...over, settings: { autoRetry: 0, unitDms: true, ...over.settings } });
const records = (h: Harness) => h.state().generations?.records ?? [];
const thread = (h: Harness) => h.state().dms[ANN] ?? [];
const knock = (s: CampaignState): void => {
  s.slot = 'night';
  s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: 'visit', priority: 50, framing: 'A knock.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 99 };
};

describe('dm.reply', () => {
  it("a failed reply records dm.reply under the commander's message", async () => {
    const h = world();
    h.st.mainReplies = ['   ']; // nothing usable
    await h.comms.send(ANN, 'Are you awake?');
    expect(thread(h).map((m) => m.from)).toEqual(['commander']);
    expect(records(h)).toMatchObject([{ siteId: 'dm.reply', key: `${ANN}:${thread(h)[0].id}`, reason: 'empty', status: 'open' }]);
    expect(h.toasts.map((t) => t.text)).toEqual(['Her reply: nothing came back.']);
  });

  it('retry answers that message and reads it', async () => {
    const h = world();
    h.st.mainReplies = ['   '];
    await h.comms.send(ANN, 'Are you awake?');
    const before = h.state().relations[ANN].affinity;
    h.st.mainReplies = ['I am here.', intentJson([praised(ANN)])];
    expect((await h.generations.retry('g1')).kind).toBe('applied');
    await vi.waitFor(() => expect(h.state().relations[ANN].affinity).toBeGreaterThan(before)); // the reading follows the reply
    expect(thread(h).map((m) => m.text)).toEqual(['Are you awake?', 'I am here.']);
    expect(records(h)).toEqual([]);
  });

  it('a newer commander message expires the old record', async () => {
    const h = world();
    h.st.mainReplies = ['   ', '   '];
    await h.comms.send(ANN, 'First.');
    await h.comms.send(ANN, 'Second.');
    expect(records(h)).toHaveLength(2);
    const calls = h.st.calls.length;
    expect(await h.generations.retry('g1')).toEqual({ kind: 'expired', why: 'Her thread moved on.' });
    expect(records(h)[0]).toMatchObject({ status: 'expired', expiredWhy: 'Her thread moved on.' });
    expect(h.st.calls).toHaveLength(calls);
  });

  it('reroll restores the state before her reply, gets a new one and reads it', async () => {
    const h = world();
    const baseline = h.state().relations[ANN].affinity;
    h.st.mainReplies = ['First answer.', intentJson([praised(ANN)])];
    await h.comms.send(ANN, 'Are you awake?');
    const warm = h.state().relations[ANN].affinity;
    expect(warm).toBeGreaterThan(baseline);
    const view = h.comms.replyState(ANN)!;
    expect(view.reroll).toEqual({ enabled: true });
    expect(view.siteKey).toBe(`${ANN}:${thread(h)[0].id}`);
    h.st.mainReplies = ['Second answer.', intentJson()];
    await h.comms.rerollLast(ANN);
    expect(thread(h).map((m) => m.text)).toEqual(['Are you awake?', 'Second answer.']);
    expect(h.state().relations[ANN].affinity).toBe(baseline); // nothing of the words she no longer said is left
    expect(h.comms.replyState(ANN)!.reroll).toEqual({ enabled: true }); // the new reply can be rerolled again
  });

  it('reroll disabled after another dispatch', async () => {
    const h = world();
    h.st.mainReplies = ['First answer.', intentJson()];
    await h.comms.send(ANN, 'Are you awake?');
    h.dispatch({ type: 'dm/read', payload: { unitId: ANN } });
    expect(h.comms.replyState(ANN)!.reroll).toEqual({ enabled: false, reason: MOVED_REASON });
    const calls = h.st.calls.length;
    await h.comms.rerollLast(ANN);
    expect(h.st.calls).toHaveLength(calls);
    expect(thread(h)).toHaveLength(2);
  });

  it('no reroll for a thread that does not end with her answer', async () => {
    const h = world();
    expect(h.comms.replyState(ANN)).toBeNull();
  });

  it('a reading that fails is quiet and the reply stands', async () => {
    const h = world();
    h.st.mainReplies = ['I am here.', NOPE];
    await h.comms.send(ANN, 'Are you awake?');
    expect(thread(h).map((m) => m.text)).toEqual(['Are you awake?', 'I am here.']);
    expect(records(h)).toMatchObject([{ siteId: 'dm.intents', quiet: true }]);
    expect(h.toasts).toEqual([]);
  });
});

describe('dm.initiate and dm.door', () => {
  it('a failed initiative is quiet and expires when the slot passes', async () => {
    const h = world();
    h.st.mainReplies = ['   '];
    await h.comms.initiate(ANN);
    expect(records(h)).toMatchObject([{ siteId: 'dm.initiate', quiet: true }]);
    expect(h.toasts).toEqual([]);
    const s = structuredClone(h.state());
    s.slot = s.slot === 'evening' ? 'afternoon' : 'evening';
    h.set(s);
    expect(await h.generations.retry('g1')).toEqual({ kind: 'expired', why: 'That moment has passed.' });
  });

  it('a retried initiative is delivered as an initiated message', async () => {
    const h = world();
    h.st.mainReplies = ['   '];
    await h.comms.initiate(ANN);
    h.st.mainReplies = ['Are you there?'];
    expect((await h.generations.retry('g1')).kind).toBe('applied');
    expect(thread(h)).toMatchObject([{ from: ANN, text: 'Are you there?', initiated: true }]);
    expect(records(h)).toEqual([]);
  });

  it('a failed door reply records dm.door and expires when the night event closes', async () => {
    const h = world({ tweak: knock });
    h.st.mainReplies = ['   '];
    await h.comms.throughDoor('Ann? It is me.');
    expect(records(h)).toMatchObject([{ siteId: 'dm.door', key: 'n1', status: 'open' }]);
    expect(h.toasts.map((t) => t.text)).toEqual(['Her answer at the door: nothing came back.']);
    const s = structuredClone(h.state());
    delete s.calendar.nightEvent;
    h.set(s);
    expect(await h.generations.retry('g1')).toEqual({ kind: 'expired', why: 'The knock is over.' });
  });

  it('a retried door reply is stored and read', async () => {
    const h = world({ tweak: knock });
    h.st.mainReplies = ['   '];
    await h.comms.throughDoor('Ann? It is me.');
    h.st.mainReplies = ['Not tonight.', intentJson()];
    expect((await h.generations.retry('g1')).kind).toBe('applied');
    await vi.waitFor(() => expect(h.actions).toContain('intents/apply'));
    expect(h.state().calendar.nightEvent!.door).toEqual({ said: 'Ann? It is me.', reply: 'Not tonight.' });
  });
});
