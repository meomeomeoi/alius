import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { ContextBuilder } from '../../src/llm/context';
import { registerSceneContext } from '../../src/scene/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { CampaignState } from '../../src/engine/state/types';
import { ANN, BEA, harness, intentJson, praised, reply, summaryJson } from '../helpers/sceneHarness';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const open = async (h: ReturnType<typeof harness>, participants = [ANN]) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants, origin: 'event' })).toBe(true);
};
const intentCalls = (h: ReturnType<typeof harness>) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'));

describe('review #1: END TRANSMISSION waits for the exchange in flight', () => {
  it('an exchange is applied once even if the scene is ended while its extraction runs', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'thanks')]];
    h.st.mainReplies = [intentJson([praised()]), summaryJson('Ann was praised.')];
    const real = h.st.generateMain.bind(h.st);
    let ended: Promise<void> | null = null;
    let first = true;
    h.st.generateMain = async (req) => {
      if (first) { first = false; ended = h.controller.end(); } // the player clicks END while intent_extract runs
      return real(req);
    };
    const base = h.state().relations[ANN].affinity;
    await h.controller.send('well done');
    await ended;
    expect(h.state().relations[ANN].affinity).toBe(base + 4);
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(1);
    expect(intentCalls(h)).toHaveLength(1);
    expect(h.state().scene).toBeUndefined();
  });
});

describe('review #2: batched modes read the whole scene', () => {
  it('scene_end over six exchanges reads every line, in chunks', async () => {
    const h = harness(reg, { settings: { intentMode: 'scene_end' } });
    await open(h);
    h.st.groupReplies = Array.from({ length: 6 }, (_, i) => [reply('Ann', `reply ${i}`)]);
    for (let i = 0; i < 6; i++) await h.controller.send(`line ${i}`);
    h.st.mainReplies = [intentJson([praised()]), intentJson([praised()]), summaryJson('Talk.')];
    await h.controller.end();
    const prompts = intentCalls(h).map((c) => (c as { prompt: string }).prompt).join('\n');
    for (let i = 0; i < 6; i++) {
      expect(prompts).toContain(`line ${i}`);
      expect(prompts).toContain(`reply ${i}`);
    }
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(2);
  });
});

describe('review #10: a proposal directive lapses only when its unit speaks', () => {
  it('in a group scene the first speaker does not consume her neighbour\'s directive', async () => {
    const h = harness(reg, { tweak: (s) => { Object.assign(s.relations[BEA], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); } });
    await open(h, [ANN, BEA]);
    h.controller.propose('date', BEA);
    const seen: string[] = [];
    h.st.on('message_received', (i) => {
      const m = h.st.getChatMessages(i as number)[0];
      seen.push(`${m.name}:${h.context.build(h.state(), 3000).directives.includes('receptive') ? 'directive' : 'none'}`);
    });
    h.st.groupReplies = [[reply('Ann', 'hm'), reply('Bea', 'yes')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('Bea, dinner?');
    expect(seen).toEqual(['Ann:directive', 'Bea:none']); // the controller (registered first) drops it as Bea's own reply arrives
    expect(h.context.build(h.state(), 3000).directives).not.toContain('receptive');
  });
});

describe('review #6: no secrets in a shared prompt', () => {
  const ctxFor = (state: CampaignState, participants: string[]) => {
    const b = new ContextBuilder();
    registerSceneContext(b, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    const r = run(state, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return b.build(r.state, 5000).block;
  };
  const world = (tweak: (s: CampaignState) => void) => { const s = campaign(reg, 4); tweak(s); return s; };

  it('a private promise does not reach a scene with another unit present', () => {
    const s = world((w) => { w.memory.promises = [{ id: 'p1', by: 'commander', to: ANN, text: 'a private promise', status: 'open', day: 1, knownBy: [ANN] }]; });
    expect(ctxFor(s, [ANN, BEA])).not.toContain('a private promise');
    expect(ctxFor(s, [ANN])).toContain('a private promise');
  });
  it('the crime is named only when every present unit knows it', () => {
    const s = world((w) => { w.relations[ANN].flags = ['knows_crime']; w.relations[BEA].flags = []; });
    const crime = String(reg.crimes.get('mutiny')!.name);
    const shared = ctxFor(s, [ANN, BEA]);
    expect(shared).not.toContain(crime);
    expect(shared).toContain('Crime: unknown to Bea.');
    expect(ctxFor(s, [ANN])).toContain(crime);
  });
  it('a secret affair is shown with its cover while the hidden partner is present', () => {
    const s = world((w) => {
      w.relations[ANN].stateId = 'secret_affair';
      w.relations[ANN].affair = { as: 'flirting', hiddenFrom: [BEA], since: 1 };
    });
    const hint = String(reg.relationshipStates.get('secret_affair')!.promptHint);
    expect(ctxFor(s, [ANN, BEA])).not.toContain(hint);
    expect(ctxFor(s, [ANN, BEA]).split('\n').find((l) => l.startsWith('Ann — '))).toContain('state Comrade');
    expect(ctxFor(s, [ANN])).toContain(hint);
  });
});
