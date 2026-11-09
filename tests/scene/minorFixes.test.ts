import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ANN, harness, intentJson, praised, reply, summaryJson } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const intentCalls = (h: ReturnType<typeof harness>) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'));
const open = async (h: ReturnType<typeof harness>) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
};

describe('minor: resume, swipe during extraction, rollback directives', () => {
  it('resume re-reads lines said before a reload in batched modes', async () => {
    const h = harness(reg, { settings: { intentMode: 'scene_end' } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'before the reload')]];
    await h.controller.send('said before the reload');
    expect(h.state().scene!.readIndex).toBe(0);
    h.controller.resume(); // a reload: the controller forgets its in-memory pointer
    h.st.mainReplies = [intentJson([praised()]), summaryJson('Talk.')];
    await h.controller.end();
    const prompt = (intentCalls(h)[0] as { prompt: string }).prompt;
    expect(prompt).toContain('said before the reload');
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(1);
  });

  it('the pointer moves with each applied extraction and is restored by a rollback', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'one')]];
    h.st.mainReplies = [intentJson([praised()])];
    await h.controller.send('hi');
    expect(h.state().scene!.readIndex).toBe(2);
    h.controller.onSwipe(1);
    expect(h.state().scene!.readIndex).toBe(0);
  });

  it('a swipe that happens while the extraction runs is rolled back and read again', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'first answer')]];
    h.st.mainReplies = [intentJson([praised()]), intentJson([praised()])];
    const real = h.st.generateMain.bind(h.st);
    let first = true;
    h.st.generateMain = async (req) => {
      if (first) {
        first = false;
        h.controller.onSwipe(1); // the player swipes the reply while intent_extract is running
        h.st.chatMessages[1].text = 'second answer';
      }
      return real(req);
    };
    const base = h.state().relations[ANN].affinity;
    await h.controller.send('Hello');
    expect(h.state().relations[ANN].affinity).toBe(base); // the first reading was undone
    h.st.emit('generation_ended');
    await h.controller.idle();
    expect(h.state().relations[ANN].affinity).toBe(base + 4);
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(1);
    expect((intentCalls(h).at(-1) as { prompt: string }).prompt).toContain('second answer');
  });

  it('a swipe rolls back the directive its extraction set', async () => {
    const h = harness(reg, { tweak: (s) => { Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', '...')]];
    h.st.mainReplies = [intentJson([], { proposals: [{ from: 'commander', to: ANN, kind: 'date', evidence: 'dinner?' }] })];
    await h.controller.send('Dinner?');
    expect(h.context.build(h.state(), 3000).directives).toContain('receptive');
    h.controller.onSwipe(1);
    expect(h.context.build(h.state(), 3000).directives).not.toContain('receptive');
    expect(h.state().relations[ANN].stateId).toBe('friend');
  });
});
