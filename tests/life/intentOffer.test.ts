import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { enqueue, writeLifeFact } from '../../src/engine/life';
import { newLife } from '../../src/engine/life/state';
import { ANN, harness, intentJson, reply } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** The scene controller sends the life lists to the intent model, and sends nothing while life is off. */
async function sentPrompt(mode: 'normal' | 'off', report: unknown[] = []) {
  const h = harness(reg, {
    tweak: (s) => {
      s.settings.lifeEvents = mode;
      if (mode === 'off') return;
      s.life = newLife(5);
      const unit = s.squad.find((u) => u.id === ANN)!;
      unit.hobbies = [{ id: 'reading', skill: 0, interest: 60, state: 'active', since: 1, milestones: [] }];
      const fact = writeLifeFact(s, ANN, 'Ann: she found a coin in the vents.', ['life'], 1);
      enqueue(s, { unitId: ANN, kind: 'event', ref: 'found_something', what: 'event', factId: fact.id, category: 'things', day: s.day });
      s.life.news.push({ itemId: s.life.queue[0].id, unitId: ANN, until: s.day + 3 });
    },
  });
  expect(await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' })).toBe(true);
  h.st.groupReplies = [[reply('Ann', 'I found a coin in the vents, commander.')]];
  h.st.mainReplies = [intentJson(report)];
  await h.controller.send('What have you been up to?');
  return { h, call: h.st.calls.find((c) => (c.system ?? '').includes('rules referee'))! };
}

describe('the scene controller offers her life to the intent model', () => {
  it('off sends the old prompt (nothing about her life)', async () => {
    const { call } = await sentPrompt('off');
    for (const word of ['NEWS', 'HOBBIES', 'LIFE', 'news_told', 'first_moment']) expect(`${call.system}\n${call.prompt}`).not.toContain(word);
  });

  it('on lists her news and her hobby, and a reported news_told closes the item', async () => {
    const { h, call } = await sentPrompt('normal');
    expect(call.prompt).toContain('NEWS');
    expect(call.prompt).toContain('Ann: she found a coin in the vents.');
    expect(call.prompt).toContain('HOBBIES');
    expect(call.system).toContain('news_told');
    expect(call.system).toContain('hobby_praised');
    expect(call.system).toContain('first_moment'); // a private scene
    expect(h.state().life!.queue[0].id).toBe('ln0');
    expect(h.state().life!.news).toHaveLength(1);
    // the same exchange read again with a reported news_told
    const again = await sentPrompt('normal', [{ type: 'news_told', actor: ANN, targets: [], severity: 'minor', evidence: 'I found a coin', confidence: 0.9, newsId: 'ln0' }]);
    const state = again.h.state();
    expect(state.life!.queue).toEqual([]);
    expect(state.life!.news).toEqual([]);
    expect(state.memory.facts.find((f) => f.text.includes('coin'))!.hiddenFromCommander).toBeUndefined();
  });
});
