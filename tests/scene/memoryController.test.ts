import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/memory';
import type { CampaignState, Fact } from '../../src/engine/state/types';
import { createMemoryController } from '../../src/scene/memoryController';
import { ANN, BEA, harness, reply, summaryJson, intentJson } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

/** `n` facts 10 days old about `unit`, known by her alone. */
const oldFacts = (s: CampaignState, unit: string, n: number): Fact[] => {
  const out: Fact[] = [];
  for (let i = 0; i < n; i++) {
    const f: Fact = { id: `f${s.memory.facts.length + 1}`, about: [unit], text: `${unit} fact ${i}.`, tags: [], importance: 3, day: s.day - 10, knownBy: [unit] };
    s.memory.facts.push(f);
    out.push(f);
  }
  return out;
};
const aged = (s: CampaignState): void => {
  s.day = 20;
  oldFacts(s, ANN, 7);
  oldFacts(s, BEA, 7);
};
const controllerOf = (h: ReturnType<typeof harness>) => createMemoryController({
  st: h.st, registries: () => reg, settings: () => h.settings,
  app: {
    dispatch: (a: { type: string }, o?: { expectChatId?: string }) => {
      if (o?.expectChatId !== undefined && h.st.getActiveChat()?.chatId !== o.expectChatId) return [{ type: 'error', code: 'chat_changed' }];
      return h.dispatch(a);
    },
    current: () => ({ load: { kind: 'none' }, state: h.state() }),
  } as never,
});
const foldJson = (own: string, shared = 'The whole squad remembers.') => JSON.stringify({ own, shared });

describe('the fold', () => {
  it('the controller folds once per run and falls back without a profile', async () => {
    const h = harness(reg, { tweak: aged, settings: { mechanicFallbackToMain: false } }); // no profile, no model at all
    const memory = controllerOf(h);
    await memory.run();
    // one fold: Ann's seven facts (the first in squad order); Bea's wait for the next run
    expect(h.state().memory.facts).toHaveLength(7);
    expect(h.state().memory.facts.every((f) => f.about[0] === BEA)).toBe(true);
    const d = h.state().memory.dossiers![ANN];
    expect(d).toMatchObject({ folded: 7, day: 20 });
    expect(d.own).toContain('unit_ann fact 0.');
    expect(d.own).toContain('unit_ann fact 6.'); // joined oldest first, nothing thrown away
    expect(d.own.length).toBeLessThanOrEqual(500);
    expect(h.st.calls).toHaveLength(0); // no profile: no call at all
    await memory.run();
    expect(h.state().memory.facts).toHaveLength(0);
    expect(h.state().memory.dossiers![BEA].folded).toBe(7);
    await memory.run(); // nothing due: nothing happens
    expect(h.state().memory.dossiers).toBeDefined();
    expect(h.actions.filter((a) => a === 'memory/fold')).toHaveLength(2);
  });

  it('a model answer becomes the dossier; a failed one falls back', async () => {
    const h = harness(reg, { tweak: aged });
    h.st.mainReplies = [foldJson('Ann keeps to herself.', 'Ann is the squad sniper.')];
    const memory = controllerOf(h);
    await memory.run();
    expect(h.state().memory.dossiers![ANN]).toMatchObject({ own: 'Ann keeps to herself.', folded: 7 });
    const call = h.st.calls[0] as { prompt: string };
    expect(call.prompt).toContain('unit_ann fact 3.');
    expect(call.prompt).not.toContain('unit_bea fact');
    // the next fold gets an unusable answer: joined text
    h.st.mainReplies = ['not json', 'not json'];
    await memory.run();
    expect(h.state().memory.dossiers![BEA].own).toContain('unit_bea fact 2.');
  });

  it('a stale answer is refused and folds nothing', async () => {
    const h = harness(reg, { tweak: aged });
    h.st.mainReplies = [foldJson('Ann keeps to herself.')];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      const s = structuredClone(h.state());
      s.memory.facts.find((f) => f.about[0] === ANN)!.pinned = true; // a fact is pinned while the model writes
      h.set(s);
      return real(req);
    };
    await controllerOf(h).run();
    expect(h.state().memory.dossiers).toBeUndefined();
    expect(h.state().memory.facts).toHaveLength(14);
  });

  it('a chat switch mid-call drops the answer', async () => {
    const h = harness(reg, { tweak: aged });
    h.st.mainReplies = [foldJson('Ann keeps to herself.')];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
      return real(req);
    };
    const before = structuredClone(h.state().memory);
    await controllerOf(h).run();
    expect(h.state().memory).toEqual(before);
  });
});

describe('while a run or a fight is open', () => {
  it('nothing is folded or retold: those actions would be refused', async () => {
    for (const open of ['combat', 'expedition'] as const) {
      const h = harness(reg, { tweak: (s) => { aged(s); (s as unknown as Record<string, unknown>)[open] = {}; } });
      await controllerOf(h).run();
      expect(h.state().memory.facts, open).toHaveLength(14);
      expect(h.actions, open).toEqual([]);
    }
  });
});

describe('rumor retelling', () => {
  const spreading = (s: CampaignState): void => {
    s.day = 12;
    s.memory.facts.push(
      { id: 'fr1', about: [ANN], text: 'Ann broke down at the gate.', tags: [], importance: 3, day: 11, knownBy: [ANN, BEA], spread: 'slow' },
      { id: 'fr2', about: [BEA], text: 'Bea was wounded.', tags: [], importance: 3, day: 11, knownBy: [BEA], spread: 'fast' },
    );
  };

  it('plain mode makes no retell call', async () => {
    const h = harness(reg, { tweak: spreading });
    h.st.mainReplies = ['They say Ann broke down.'];
    await controllerOf(h).run();
    expect(h.st.calls).toHaveLength(0);
    expect(h.state().memory.facts.every((f) => f.rumor === undefined)).toBe(true);
  });

  it('model mode retells each spreading fact once and stores it; a failure is not asked again', async () => {
    const h = harness(reg, { tweak: (s) => { spreading(s); s.memory.config = { preset: 'normal', rumorMode: 'model' }; } });
    h.st.mainReplies = ['They say Ann broke down at the gate.', 'garbage with 3 numbers', 'garbage with 3 numbers'];
    const memory = controllerOf(h);
    await memory.run();
    const [a, b] = h.state().memory.facts;
    expect(a.rumor).toEqual({ text: 'They say Ann broke down at the gate.' });
    expect(b.rumor).toBeUndefined(); // the retelling had a digit: told as it was
    const calls = h.st.calls.length;
    await memory.run();
    expect(h.st.calls).toHaveLength(calls); // neither is asked again
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('Ann broke down at the gate.');
    expect(prompt).toContain('trust'); // bands in words
  });
});

describe('the digest of a long scene', () => {
  const long = (n: number, ch: string) => `${ch} `.repeat(n).trim();
  async function longScene() {
    const h = harness(reg, { memory: true, settings: { intentMode: 'scene_end' } });
    await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' });
    // ten messages of ~1800 characters: the six before the last four are over 2500 tokens
    for (let i = 0; i < 10; i++) {
      h.st.chatMessages.push({ index: h.st.chatMessages.length, isUser: i % 2 === 0, name: i % 2 === 0 ? 'Vale' : 'Ann', avatar: i % 2 === 0 ? undefined : 'ann.png', text: `M${i} ${long(600, `w${i}`)}`, swipeId: 0 });
    }
    return h;
  }

  it('digest runs past 2500 tokens, keeps the last 4 messages, and the end summary gets digest + tail', async () => {
    const h = await longScene();
    const start = h.state().scene!.startIndex;
    const total = h.st.chatLength();
    h.st.mainReplies = [JSON.stringify({ digest: 'DIGEST-TEXT: they argued about the gate.', facts: [{ about: [ANN], text: 'Ann dislikes the gate.', importance: 3, tags: [] }] })];
    await h.memory!.digestIfDue();
    const scene = h.state().scene!;
    expect(scene.digest).toEqual({ text: 'DIGEST-TEXT: they argued about the gate.', upTo: total - 1 - 4 });
    expect(h.state().memory.facts.some((f) => f.text === 'Ann dislikes the gate.' && f.sceneId === scene.id)).toBe(true);
    // the digest covered everything before the last four messages
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain(`M${0} `);
    expect(prompt).not.toContain(`M${total - start - 1} `); // the newest are left out
    // a second call has nothing new beyond the threshold
    await h.memory!.digestIfDue();
    expect(h.st.calls).toHaveLength(1);
    // the end: intent extraction (the ten unread messages are read in two chunks of eight), then the summary of digest + tail
    h.st.mainReplies = [intentJson(), intentJson(), summaryJson('They argued about the gate.')];
    await h.controller.end();
    const summaryCall = h.st.calls.at(-1) as { prompt: string };
    expect(summaryCall.prompt).toContain('DIGEST-TEXT: they argued about the gate.');
    expect(summaryCall.prompt).toContain(`M${total - start - 1} `); // the tail
    expect(summaryCall.prompt).not.toContain('M0 '); // the digested part is not read again
    expect(h.state().scene).toBeUndefined();
    expect(h.state().memory.scenes).toEqual([{ sceneId: 's1', from: start, to: h.st.chatLength() - 1, summarized: true }]);
  });

  it('a short scene is not digested, and a failed digest changes nothing', async () => {
    const h = harness(reg, { memory: true });
    await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' });
    h.st.chatMessages.push({ index: 0, isUser: true, name: 'Vale', text: 'Hello.', swipeId: 0 });
    await h.memory!.digestIfDue();
    expect(h.st.calls).toHaveLength(0);
    const l = await longScene();
    l.settings.mechanicFallbackToMain = false; // no profile: the digest is skipped
    await l.memory!.digestIfDue();
    expect(l.state().scene!.digest).toBeUndefined();
    expect(l.st.calls).toHaveLength(0);
  });

  it('a chat switch mid-call drops the digest', async () => {
    const h = await longScene();
    h.st.mainReplies = [JSON.stringify({ digest: 'late digest', facts: [] })];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
      return real(req);
    };
    await h.memory!.digestIfDue();
    expect(h.state().scene!.digest).toBeUndefined();
  });

  it('after a reply the scene asks for the digest in the background', async () => {
    const h = harness(reg, { memory: true, settings: { intentMode: 'scene_end' } });
    await h.controller.start({ locationId: 'mess_hall', participants: [ANN], origin: 'event' });
    for (let i = 0; i < 10; i++) h.st.chatMessages.push({ index: h.st.chatMessages.length, isUser: true, name: 'Vale', text: `P${i} ${long(600, `q${i}`)}`, swipeId: 0 });
    h.st.groupReplies = [[reply('Ann', 'Short answer.')]];
    h.st.mainReplies = [JSON.stringify({ digest: 'DIGEST-BY-REPLY', facts: [] })];
    await h.controller.send('go on');
    await h.controller.idle();
    expect(h.state().scene!.digest?.text).toBe('DIGEST-BY-REPLY');
  });
});
