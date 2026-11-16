import { describe, expect, it } from 'vitest';
import '../../src/engine/actions/memory';
import { dispatch } from '../../src/engine/dispatch';
import { hideCandidates } from '../../src/engine/memory/scenes';
import type { CampaignState, SceneMark } from '../../src/engine/state/types';
import { createCampaign } from '../../src/engine/state/create';
import { hideCommand, hideRuns } from '../../src/st/chat';
import { FakeStAdapter } from '../../src/st/fake';

const fakeChat = (n: number, system: number[] = []): FakeStAdapter => {
  const st = new FakeStAdapter({ chatId: 'c', isGroup: true, groupId: 'g' });
  for (let i = 0; i < n; i++) st.chatMessages.push({ index: i, isUser: i % 2 === 0, name: i % 2 === 0 ? 'Vale' : 'Ann', text: `m${i}`, swipeId: 0, ...(system.includes(i) ? { isSystem: true } : {}) });
  return st;
};
const visible = (st: FakeStAdapter): number[] => st.getChatMessages().map((m) => m.index);

describe('hideRuns and the slash command', () => {
  it('splits a range into runs of messages that are not system messages and are inside the chat', () => {
    const sys = new Set([4, 9]);
    expect(hideRuns(12, 2, 7, (i) => sys.has(i))).toEqual([[2, 3], [5, 7]]);
    expect(hideRuns(12, 0, 20, (i) => sys.has(i))).toEqual([[0, 3], [5, 8], [10, 11]]); // clamped to the chat
    expect(hideRuns(12, 4, 4, (i) => sys.has(i))).toEqual([]);
    expect(hideRuns(12, 15, 20, () => false)).toEqual([]); // past the end
    expect(hideRuns(12, 5, 2, () => false)).toEqual([]); // backwards
    expect(hideRuns(12, -3, 1, () => false)).toEqual([[0, 1]]);
  });

  it('the command is ST\'s /hide and /unhide with an index or a range', () => {
    expect(hideCommand(false, [2, 7])).toBe('/hide 2-7');
    expect(hideCommand(true, [5, 5])).toBe('/unhide 5');
  });
});

describe('FakeStAdapter.hideMessages / unhideMessages', () => {
  it('hides only the messages that were visible and returns the runs it hid', async () => {
    const st = fakeChat(10, [4]);
    const hid = await st.hideMessages(2, 7);
    expect(hid).toEqual([[2, 3], [5, 7]]);
    expect(visible(st)).toEqual([0, 1, 8, 9]);
    expect(await st.hideMessages(2, 7)).toEqual([]); // nothing left to hide
  });

  it('a system message in the range stays system after unhide', async () => {
    const st = fakeChat(10, [4]);
    const hid = await st.hideMessages(2, 7);
    await st.unhideMessages(hid);
    expect(visible(st)).toEqual([0, 1, 2, 3, 5, 6, 7, 8, 9]);
    expect(st.chatMessages.find((m) => m.index === 4)!.isSystem).toBe(true); // the narrator line is still hidden
    // an ST /unhide of the whole range would have shown it: that is why only the runs are recorded
  });

  it('a range past the chat end is dropped', async () => {
    const st = fakeChat(10);
    const hid = await st.hideMessages(6, 30);
    expect(hid).toEqual([[6, 9]]);
    st.chatMessages.splice(8); // the chat got shorter
    await st.unhideMessages([[6, 9], [12, 15]]);
    expect(visible(st)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    const none = fakeChat(5);
    await none.hideMessages(1, 2);
    await none.unhideMessages([[40, 50]]);
    expect(visible(none)).toEqual([0, 3, 4]); // the far range touched nothing
  });
});

const mark = (n: number, over: Partial<SceneMark> = {}): SceneMark => ({ sceneId: `s${n}`, from: n * 10, to: n * 10 + 5, summarized: true, ...over });
const withScenes = (marks: SceneMark[], over: (s: CampaignState) => void = () => {}): CampaignState => {
  const s = createCampaign({ seed: 1, commanderName: 'Vale' });
  s.memory.scenes = marks;
  over(s);
  return s;
};

describe('hideCandidates', () => {
  it('N = 2 hides the older summarized scenes', () => {
    const s = withScenes([mark(1), mark(2), mark(3), mark(4), mark(5)]);
    expect(hideCandidates(s, 2).map((m) => m.sceneId)).toEqual(['s1', 's2', 's3']);
    expect(hideCandidates(s, 4).map((m) => m.sceneId)).toEqual(['s1']);
    expect(hideCandidates(s, 5)).toEqual([]);
    expect(hideCandidates(s, 0)).toEqual([]); // off
  });

  it('a scene without a summary is never hidden', () => {
    const s = withScenes([mark(1, { summarized: false }), mark(2), mark(3), mark(4)]);
    expect(hideCandidates(s, 1).map((m) => m.sceneId)).toEqual(['s2', 's3']);
  });

  it('the open scene is never hidden', () => {
    const s = withScenes([mark(1), mark(2), mark(3)], (w) => { w.scene = { id: 's1' } as never; });
    expect(hideCandidates(s, 1).map((m) => m.sceneId)).toEqual(['s2']);
  });

  it('what is hidden already is not a candidate again', () => {
    const s = withScenes([mark(1), mark(2), mark(3), mark(4)], (w) => { w.memory.hidden = [[10, 15]]; });
    expect(hideCandidates(s, 1).map((m) => m.sceneId)).toEqual(['s2', 's3']);
    const overlap = withScenes([mark(1), mark(2)], (w) => { w.memory.hidden = [[3, 12]]; });
    expect(hideCandidates(overlap, 0)).toEqual([]);
    expect(hideCandidates(overlap, 1)).toEqual([]); // s1 (10–15) overlaps 3–12
  });
});

describe('memory/hidden', () => {
  const act = (s: CampaignState, payload: unknown) => dispatch(s, { type: 'memory/hidden', payload }, {} as never);

  it('adds the runs Alius hid and clears them', () => {
    const s = createCampaign({ seed: 1, commanderName: 'Vale' });
    const a = act(s, { add: [[2, 3], [5, 7]] });
    expect(a.state.memory.hidden).toEqual([[2, 3], [5, 7]]);
    const b = act(a.state, { add: [[9, 9]] });
    expect(b.state.memory.hidden).toEqual([[2, 3], [5, 7], [9, 9]]);
    const c = act(b.state, { clear: true });
    expect(c.state.memory.hidden).toBeUndefined();
  });

  it('refuses a bad payload and changes nothing', () => {
    const s = createCampaign({ seed: 1, commanderName: 'Vale' });
    for (const bad of [null, {}, { add: 'x' }, { add: [[3, 2]] }, { add: [[-1, 2]] }, { add: [[1.5, 2]] }, { add: [[1]] }, { clear: 'yes' }]) {
      const r = act(s, bad);
      expect(r.events[0], JSON.stringify(bad)).toMatchObject({ type: 'error' });
      expect(r.state).toBe(s);
    }
  });
});
