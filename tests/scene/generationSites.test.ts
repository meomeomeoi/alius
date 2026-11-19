import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { MOVED_REASON } from '../../src/llm/envelope';
import { ANN, harness, intentJson, praised, reply, summaryJson, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const NOPE = 'nope'; // an answer with no JSON: invalid_output
const world = (settings: Parameters<typeof harness>[1] = {}) => harness(reg, { ...settings, settings: { autoRetry: 0, ...settings.settings } });
const open = async (h: Harness) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
};
const records = (h: Harness) => h.state().generations?.records ?? [];
const say = async (h: Harness, text: string, answer: string) => {
  h.st.groupReplies.push([reply('Ann', `re: ${text}`)]);
  h.st.mainReplies.push(answer);
  await h.controller.send(text);
};

describe('scene.intents', () => {
  it('a failed chunk records scene.intents and the next pass closes it', async () => {
    const h = world();
    await open(h);
    await say(h, 'Hello.', NOPE);
    expect(records(h)).toMatchObject([{ siteId: 'scene.intents', reason: 'invalid_output', status: 'open', attempts: 1 }]);
    expect(records(h)[0].key).toMatch(/^s1:\d+-\d+$/);
    expect(h.state().scene!.readIndex ?? 0).toBe(h.state().scene!.startIndex); // the pointer did not move
    expect(h.toasts.map((t) => t.text)).toEqual(['Scene reading: the answer did not fit the form.']);
    const before = h.state().relations[ANN].affinity;
    await say(h, 'Again.', intentJson([praised()]));
    expect(records(h)).toEqual([]); // the pass read the lines again, with the new ones, and the record is gone
    expect(h.state().relations[ANN].affinity).toBeGreaterThan(before);
  });

  it('ten failed chunks leave one record per chunk, and a later pass closes them', async () => {
    const h = world();
    await open(h);
    for (let i = 0; i < 10; i++) await say(h, `Line ${i}.`, NOPE);
    expect(records(h)).toHaveLength(1);
    expect(records(h)[0].attempts).toBeGreaterThanOrEqual(1);
    expect(h.toasts).toHaveLength(1); // one chip, one toast: a failing model does not shout every exchange
    // 22 lines wait: the model comes back and reads them in chunks of eight
    h.st.groupReplies.push([reply('Ann', 'fine')]);
    h.st.mainReplies.push(intentJson(), intentJson(), intentJson());
    await h.controller.send('Now?');
    expect(records(h)).toEqual([]);
  });

  it('scene.intents reroll undoes and re-reads the last exchange', async () => {
    const h = world();
    await open(h);
    await say(h, 'Hello.', intentJson());
    const before = h.state().relations[ANN].affinity;
    expect(h.controller.rerollState()).toEqual({ enabled: true });
    h.st.mainReplies.push(intentJson([praised()]));
    await h.controller.rerollLast();
    expect(h.state().relations[ANN].affinity).toBeGreaterThan(before);
    expect(h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'))).toHaveLength(2);
    expect(records(h)).toEqual([]);
  });

  it('scene.intents reroll disabled after another dispatch', async () => {
    const h = world();
    await open(h);
    await say(h, 'Hello.', intentJson());
    h.dispatch({ type: 'scene/exchange', payload: {} });
    expect(h.controller.rerollState()).toEqual({ enabled: false, reason: MOVED_REASON });
    const calls = h.st.calls.length;
    await h.controller.rerollLast();
    expect(h.st.calls).toHaveLength(calls);
  });

  it('a reroll of nothing is disabled with a reason', async () => {
    const h = world();
    await open(h);
    expect(h.controller.rerollState()).toEqual({ enabled: false, reason: 'Nothing was read yet.' });
    await h.controller.rerollLast();
    expect(h.st.calls).toHaveLength(0);
  });
});

describe('scene.summary', () => {
  async function endedWithFailedSummary() {
    const h = world();
    await open(h);
    h.st.chatMessages.push({ index: 0, isUser: true, name: 'Vale', text: 'Hello.', swipeId: 0 });
    h.st.mainReplies = [NOPE];
    await h.controller.end();
    return h;
  }

  it('a failed summary ends the scene with the fallback line and records scene.summary', async () => {
    const h = await endedWithFailedSummary();
    const s = h.state();
    expect(s.scene).toBeUndefined();
    expect(s.memory.chronicle.at(-1)!.text).toMatch(/talked\.$/);
    expect(records(h)).toMatchObject([{ siteId: 'scene.summary', key: 's1', reason: 'invalid_output', fallbackApplied: true, status: 'open' }]);
    expect(s.memory.scenes).toMatchObject([{ sceneId: 's1', summarized: false, participants: [ANN], locationId: 'mess_hall' }]);
    expect(h.toasts.map((t) => t.text)).toEqual(['Scene summary: the answer did not fit the form.']);
  });

  it('RETRY stores the late summary: it replaces the fallback line and adds facts once', async () => {
    const h = await endedWithFailedSummary();
    h.st.mainReplies = [summaryJson('Ann was kind.', [{ about: [ANN], text: 'Ann is holding it together.', importance: 3, tags: [] }])];
    const out = await h.generations.retry('g1');
    expect(out.kind).toBe('applied');
    const s = h.state();
    expect(s.memory.chronicle.filter((e) => e.sceneId === 's1')).toMatchObject([{ text: 'Ann was kind.', audience: [ANN] }]);
    expect(s.memory.facts.filter((f) => f.sceneId === 's1')).toHaveLength(1);
    expect(s.memory.scenes).toEqual([{ sceneId: 's1', from: 0, to: 0, summarized: true }]);
    expect(records(h)).toEqual([]);
  });

  it('late summary on an old mark without participants expires', async () => {
    const h = await endedWithFailedSummary();
    const s = structuredClone(h.state());
    delete s.memory.scenes![0].participants;
    h.set(s);
    const calls = h.st.calls.length;
    const out = await h.generations.retry('g1');
    expect(out).toEqual({ kind: 'expired', why: 'That scene ended before late summaries existed.' });
    expect(records(h)[0]).toMatchObject({ status: 'expired', expiredWhy: 'That scene ended before late summaries existed.' });
    expect(h.st.calls).toHaveLength(calls);
  });

  it('summary reroll restores the open scene and ends it with the new summary while nothing changed', async () => {
    const h = world();
    await open(h);
    h.st.chatMessages.push({ index: 0, isUser: true, name: 'Vale', text: 'Hello.', swipeId: 0 });
    h.st.mainReplies = [summaryJson('First version.')];
    await h.controller.end();
    const slot = h.state().slot;
    expect(h.state().memory.chronicle.at(-1)!.text).toBe('First version.');
    expect(h.controller.summaryRerollState()).toEqual({ enabled: true });
    h.st.mainReplies = [summaryJson('Second version.')];
    await h.controller.rerollSummary();
    const s = h.state();
    expect(s.scene).toBeUndefined();
    expect(s.memory.chronicle.filter((e) => e.sceneId === 's1')).toMatchObject([{ text: 'Second version.' }]);
    expect(s.slot).toBe(slot); // the slot was spent once, not twice
    expect(h.st.members.filter((m) => m.active)).toHaveLength(4);
    // something else happened since: no more rerolls
    h.dispatch({ type: 'dm/read', payload: { unitId: ANN } });
    h.dispatch({ type: 'scene/exchange', payload: {} });
    h.set({ ...h.state() });
    expect(h.controller.summaryRerollState().enabled).toBe(false);
  });

  it('a summary that works writes no record and no extra action', async () => {
    const h = world();
    await open(h);
    h.st.chatMessages.push({ index: 0, isUser: true, name: 'Vale', text: 'Hello.', swipeId: 0 });
    h.st.mainReplies = [summaryJson('Fine.')];
    await h.controller.end();
    expect(h.actions.filter((a) => a.startsWith('generation/'))).toEqual([]);
    expect(h.state().generations).toBeUndefined();
  });
});

describe('scene.digest and emotion.pick', () => {
  const long = (n: number, ch: string) => `${ch} `.repeat(n).trim();
  async function longScene() {
    const h = world({ memory: true, settings: { intentMode: 'scene_end' } });
    await open(h);
    for (let i = 0; i < 10; i++) {
      h.st.chatMessages.push({ index: h.st.chatMessages.length, isUser: i % 2 === 0, name: i % 2 === 0 ? 'Vale' : 'Ann', avatar: i % 2 === 0 ? undefined : 'ann.png', text: `M${i} ${long(600, `w${i}`)}`, swipeId: 0 });
    }
    return h;
  }

  it('a failed digest is quiet and the next exchange tries again', async () => {
    const h = await longScene();
    h.st.mainReplies = [NOPE];
    await h.memory!.digestIfDue();
    expect(h.state().scene!.digest).toBeUndefined();
    expect(records(h)).toMatchObject([{ siteId: 'scene.digest', quiet: true }]);
    expect(h.toasts).toEqual([]);
    h.st.mainReplies = [JSON.stringify({ digest: 'They argued.', facts: [] })];
    await h.memory!.digestIfDue(); // the same range: the key is the same, the record closes
    expect(h.state().scene!.digest).toMatchObject({ text: 'They argued.' });
    expect(records(h)).toEqual([]);
  });

  it('emotion.pick failure writes nothing', async () => {
    const h = world({ settings: { spriteMode: 'emotion_pick', intentMode: 'scene_end' } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Hm.')]];
    h.st.mainReplies = [NOPE]; // the emotion call
    await h.controller.send('Well?');
    expect(h.state().generations).toBeUndefined();
    expect(h.toasts).toEqual([]);
    expect(h.ui.some((e) => e.type === 'sprite')).toBe(false);
    h.st.groupReplies = [[reply('Ann', 'Ha!')]];
    h.st.mainReplies = [JSON.stringify({ label: 'joy' })];
    await h.controller.send('Better?');
    expect(h.ui).toContainEqual({ type: 'sprite', unitId: ANN, label: 'joy' });
  });
});
