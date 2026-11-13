import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import { DEBUG_NOT_ROLLED_BACK } from '../../src/scene/sceneController';
import { ANN, BEA, CAT, harness, intentJson, praised, reply, summaryJson, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const DEE = 'unit_dee';
const active = (h: Harness) => h.st.members.filter((m) => m.active).map((m) => m.avatar).sort();
const intentCalls = (h: Harness) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee')).length;
const directives = (h: Harness) => h.context.build(h.state(), 5000).directives;
const open = async (h: Harness, participants = [ANN]) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants, origin: 'event' })).toBe(true);
};
const dateReady = (s: CampaignState) => {
  Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 });
};

describe('private scene', () => {
  it('runs end to end: free text, replies, intents, sprites, summary, slot', async () => {
    const h = harness(reg);
    h.dispatch({ type: 'activity/do', payload: { activityId: 'talk', companionId: ANN } });
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'activity' })).toBe(true);
    expect(active(h)).toEqual(['ann.png']);
    expect(directives(h)).toContain('Explicit content: not allowed');
    h.st.expressionsByName.set('ann.png', 'joy');
    h.st.groupReplies = [[reply('Ann', 'Thanks, commander.')], [reply('Ann', 'I mean it.')]];
    h.st.mainReplies = [
      intentJson([praised()]),
      intentJson([praised(ANN, { type: 'comforted' })]),
      summaryJson('Ann was praised and comforted.', [{ about: [ANN], text: 'Ann is holding it together.', importance: 3, tags: [] }]),
    ];
    const before = h.state().relations[ANN].affinity;
    await h.controller.send('Good work today.');
    expect(h.state().relations[ANN].affinity).toBe(before + 4);
    expect(h.ui).toContainEqual({ type: 'pulse', unitId: ANN, axis: 'affinity', up: true, delta: 4 });
    expect(h.ui).toContainEqual({ type: 'sprite', unitId: ANN, label: 'joy' });
    await h.controller.send('Rest now.');
    expect(h.state().scene!.exchanges).toBe(2);
    expect(h.controller.transcript().map((m) => m.text)).toEqual(['Good work today.', 'Thanks, commander.', 'Rest now.', 'I mean it.']);
    await h.controller.end();

    const s = h.state();
    expect(s.scene).toBeUndefined();
    expect(s.calendar.pendingScene).toBeUndefined();
    expect(s.slot).toBe('afternoon');
    expect(s.memory.chronicle).toMatchObject([{ kind: 'scene', text: 'Ann was praised and comforted.' }]);
    expect(s.memory.facts).toMatchObject([{ text: 'Ann is holding it together.', knownBy: [ANN] }]);
    expect(active(h)).toEqual(['ann.png', 'bea.png', 'cat.png', 'dee.png']);
    expect(directives(h)).toBe('');
    expect(h.st.calls).toHaveLength(3);
  });

  it('every exchange sends the user message through ST and the controller refuses empty text and double sends', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'ok')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('   ');
    expect(h.st.chatLength()).toBe(0);
    await Promise.all([h.controller.send('one'), h.controller.send('two')]);
    expect(h.st.getChatMessages().filter((m) => m.isUser).map((m) => m.text)).toEqual(['one']);
  });

  it('a failed send changes nothing and the scene continues', async () => {
    const h = harness(reg);
    await open(h);
    h.st.failSend = true;
    await h.controller.send('hello');
    expect(h.state().scene!.exchanges).toBe(0);
    expect(h.toasts.some((t) => t.kind === 'error' && /Could not send/.test(t.text))).toBe(true);
    h.st.failSend = false;
    h.st.groupReplies = [[reply('Ann', 'hi')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('hello');
    expect(h.state().scene!.exchanges).toBe(1);
  });
});

describe('group scene', () => {
  it('activates only its three members and restores everyone at the end', async () => {
    const h = harness(reg);
    await open(h, [ANN, BEA, CAT]);
    expect(active(h)).toEqual(['ann.png', 'bea.png', 'cat.png']);
    expect(h.state().scene!.mode).toBe('group');
    h.st.mainReplies = [summaryJson('A short talk.')];
    await h.controller.end();
    expect(active(h)).toEqual(['ann.png', 'bea.png', 'cat.png', 'dee.png']);
  });

  it('a start that ST refuses is aborted, releases a talk, and says so', async () => {
    const h = harness(reg);
    h.dispatch({ type: 'activity/do', payload: { activityId: 'talk', companionId: ANN } });
    h.st.setMembersActive = async () => { throw new Error('nope'); };
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'activity' })).toBe(false);
    expect(h.state().scene).toBeUndefined();
    expect(h.state().calendar.pendingScene).toBeUndefined();
    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(h.actions).toContain('calendar/cancel_scene');
  });

  it('start is refused by the engine for a grunt or a second scene (no toast loop, returns false)', async () => {
    const h = harness(reg);
    await open(h);
    expect(await h.controller.start({ locationId: 'mess_hall', participants: [BEA], origin: 'event' })).toBe(false);
    expect(h.toasts.at(-1)!.kind).toBe('error');
  });
});

describe('extraction modes', () => {
  it('every_n extracts on the third exchange and at the end', async () => {
    const h = harness(reg, { settings: { intentMode: 'every_n', intentEveryN: 3 } });
    await open(h);
    h.st.groupReplies = [1, 2, 3, 4].map((i) => [reply('Ann', `reply ${i}`)]);
    h.st.mainReplies = [intentJson([praised()]), intentJson([praised()]), summaryJson('Talk.')];
    await h.controller.send('m1');
    await h.controller.send('m2');
    expect(intentCalls(h)).toBe(0);
    await h.controller.send('m3');
    expect(intentCalls(h)).toBe(1);
    await h.controller.send('m4');
    expect(intentCalls(h)).toBe(1);
    await h.controller.end();
    expect(intentCalls(h)).toBe(2);
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(2);
  });

  it('scene_end mode extracts once, over everything said', async () => {
    const h = harness(reg, { settings: { intentMode: 'scene_end' } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'reply 1')], [reply('Ann', 'reply 2')]];
    h.st.mainReplies = [intentJson([praised()]), summaryJson('Talk.')];
    await h.controller.send('first thing');
    await h.controller.send('second thing');
    expect(intentCalls(h)).toBe(0);
    await h.controller.end();
    expect(intentCalls(h)).toBe(1);
    const prompt = (h.st.calls.find((c) => (c.system ?? '').includes('rules referee')) as { prompt: string }).prompt;
    expect(prompt).toContain('first thing');
    expect(prompt).toContain('second thing');
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(1);
  });

  it('a failed extraction changes nothing and the scene continues; the next one still reads the lost exchange', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'reply 1')], [reply('Ann', 'reply 2')]];
    h.st.mainReplies = ['no json at all', 'still none', intentJson([praised()])];
    const before = structuredClone(h.state().relations[ANN]);
    await h.controller.send('first thing');
    expect(h.state().relations[ANN]).toEqual(before);
    expect(h.state().scene).toBeDefined();
    await h.controller.send('second thing');
    const prompt = (h.st.calls.at(-1) as { prompt: string }).prompt;
    expect(prompt).toContain('first thing');
    expect(prompt).toContain('second thing');
    expect(h.state().relations[ANN].affinity).toBeGreaterThan(before.affinity);
  });

  it('all calls fail: the scene still ends with the fallback line, consumes the slot and restores the members', async () => {
    const h = harness(reg);
    h.dispatch({ type: 'activity/do', payload: { activityId: 'talk', companionId: ANN } });
    await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'activity' });
    h.st.groupReplies = [[reply('Ann', 'hello')]];
    await h.controller.send('hi'); // no mechanic reply queued: extraction fails
    await h.controller.end(); // no summary either
    const s = h.state();
    expect(s.scene).toBeUndefined();
    expect(s.slot).toBe('afternoon');
    expect(s.memory.chronicle).toMatchObject([{ kind: 'scene', text: 'Quarters Commander'.replace('Quarters Commander', 'Commander quarters') + ': Ann talked.' }]);
    expect(s.memory.facts).toEqual([]);
    expect(active(h)).toEqual(['ann.png', 'bea.png', 'cat.png', 'dee.png']);
  });
});

describe('swipes', () => {
  const swipeSetup = async (settings = {}) => {
    const h = harness(reg, { settings });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'first answer')]];
    h.st.swipeReplies = [reply('Ann', 'second answer')];
    h.st.on('message_swiped', (i) => h.controller.onSwipe(i as number));
    return h;
  };

  it('a swipe of the last reply rolls back its deltas and re-extracts', async () => {
    const h = await swipeSetup();
    h.st.mainReplies = [intentJson([praised()]), intentJson([praised()])];
    const base = h.state().relations[ANN].affinity;
    await h.controller.send('Hello');
    expect(h.state().relations[ANN].affinity).toBe(base + 4);
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(h.state().relations[ANN].affinity).toBe(base + 4); // undone once, applied once
    expect(h.state().relations[ANN].history.filter((x) => x.type === 'praised')).toHaveLength(1);
    expect(h.st.mainReplies).toEqual([]);
    const second = (h.st.calls.at(-1) as { prompt: string }).prompt;
    expect(second).toContain('second answer');
    expect(second).not.toContain('first answer');
    expect(second).toContain('Hello'); // the user line of the exchange is read again too
  });

  it('a swipe after another action is not rolled back', async () => {
    const h = await swipeSetup({ debug: true });
    h.st.mainReplies = [intentJson([praised()]), intentJson([praised()])];
    await h.controller.send('Hello');
    const applied = h.state().relations[ANN].affinity;
    h.dispatch({ type: 'dm/send', payload: { unitId: BEA, text: 'psst' } });
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(h.state().relations[ANN].affinity).toBe(applied);
    expect(h.st.mainReplies).toHaveLength(1);
    expect(h.toasts.some((t) => t.text === DEBUG_NOT_ROLLED_BACK)).toBe(true);
  });

  it('swiping an older message does nothing', async () => {
    const h = await swipeSetup();
    h.st.mainReplies = [intentJson([praised()])];
    await h.controller.send('Hello');
    const applied = structuredClone(h.state().relations[ANN]);
    h.controller.onSwipe(0);
    expect(h.state().relations[ANN]).toEqual(applied);
  });
});

describe('chat switches and reloads', () => {
  it('a late extraction after a chat switch is dropped', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'hello')]];
    h.st.mainReplies = [intentJson([praised()])];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
      return real(req);
    };
    const before = structuredClone(h.state().relations[ANN]);
    await h.controller.send('hi');
    expect(h.state().relations[ANN]).toEqual(before);
    expect(h.actions).not.toContain('intents/apply');
  });

  it('resume after a reload restores members, directives and the transcript', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'one')], [reply('Ann', 'two')]];
    h.st.mainReplies = [intentJson(), intentJson()];
    await h.controller.send('a');
    await h.controller.send('b');
    // simulate a reload: ST forgot who was active and the directives
    h.st.members.forEach((m) => { m.active = true; });
    h.context.clearDirective('explicit');
    expect(directives(h)).toBe('');
    h.controller.resume();
    expect(active(h)).toEqual(['ann.png']);
    expect(directives(h)).toContain('Explicit content');
    expect(h.controller.transcript().map((m) => m.text)).toEqual(['a', 'one', 'b', 'two']);
    expect(h.ui.at(-1)).toEqual({ type: 'transcript' });
  });

  it('resume clamps a shortened chat', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'one')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('a');
    const s = structuredClone(h.state());
    s.scene!.startIndex = 50;
    h.set(s);
    expect(() => h.controller.resume()).not.toThrow();
    expect(h.controller.transcript()).toEqual([]);
    s.scene!.startIndex = 1;
    h.set(structuredClone(s));
    expect(h.controller.transcript().map((m) => m.text)).toEqual(['one']);
  });

  it('resume of a night scene restores the framing', async () => {
    const h = harness(reg, {
      tweak: (s) => {
        s.slot = 'night';
        s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: 'visit', priority: 30, framing: 'Ann knocks on your door, late.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 };
      },
    });
    expect(await h.controller.start({ locationId: 'quarters_commander', participants: [ANN], origin: 'night', nightEntryId: 'n1' })).toBe(true);
    expect(directives(h)).toContain('Ann knocks on your door, late.');
    h.context.clearDirective('night');
    h.controller.resume();
    expect(directives(h)).toContain('Ann knocks on your door, late.');
  });

  it('resume without a scene does nothing', () => {
    const h = harness(reg);
    h.controller.resume();
    expect(h.ui).toEqual([]);
  });
});

describe('proposals', () => {
  it('propose() sets a receptive directive before the message is sent and it lapses with the next reply', async () => {
    const h = harness(reg, { tweak: dateReady });
    await open(h);
    h.controller.propose('date');
    expect(directives(h)).toContain("Ann is receptive to the commander's proposal (date)");
    expect(h.state().relations[ANN].stateId).toBe('flirting');
    h.st.groupReplies = [[reply('Ann', 'Yes. Fine.')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('So. Dinner?');
    expect(directives(h)).not.toContain('receptive');
  });

  it('propose() sets a decline directive with the reason', async () => {
    const h = harness(reg, { tweak: (s) => { dateReady(s); s.relations[ANN].attraction = 5; } });
    await open(h);
    h.controller.propose('date');
    expect(directives(h)).toContain('DECLINES');
    expect(directives(h)).toContain('she is not interested');
    expect(h.state().relations[ANN].stateId).toBe('friend');
  });

  it('a unit proposal produces chips and answer accept enters the state', async () => {
    const h = harness(reg, { tweak: dateReady });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Would you like to get dinner some time?')]];
    h.st.mainReplies = [intentJson([], { proposals: [{ from: ANN, to: 'commander', kind: 'date', evidence: 'would you like to get dinner' }] })];
    await h.controller.send('Good evening.');
    const chips = h.ui.find((e) => e.type === 'chips');
    expect(chips).toMatchObject({ type: 'chips', proposal: { unitId: ANN, kind: 'date', needsDisclosure: false } });
    const id = h.state().proposals![0].id;
    h.controller.answer(id, 'accept');
    expect(h.state().relations[ANN].stateId).toBe('flirting');
    expect(h.state().proposals).toEqual([]);
    expect(directives(h)).toContain("ACCEPTS Ann's proposal (date)");
  });

  it('a commander proposal found in the text shapes her next reply', async () => {
    const h = harness(reg, { tweak: dateReady });
    await open(h);
    h.st.groupReplies = [[reply('Ann', '...')]];
    h.st.mainReplies = [intentJson([], { proposals: [{ from: 'commander', to: ANN, kind: 'date', evidence: 'dinner?' }] })];
    await h.controller.send('Dinner with me?');
    expect(h.state().relations[ANN].stateId).toBe('flirting');
    expect(directives(h)).toContain('receptive');
  });
});

describe('pacing and cut-ins', () => {
  it('a pacing event after scenePacing exchanges', async () => {
    const h = harness(reg, { settings: { intentMode: 'scene_end', scenePacing: 5 } });
    await open(h);
    h.st.groupReplies = Array.from({ length: 5 }, (_, i) => [reply('Ann', `r${i}`)]);
    for (let i = 0; i < 4; i++) await h.controller.send(`m${i}`);
    expect(h.ui.some((e) => e.type === 'pacing')).toBe(false);
    await h.controller.send('m4');
    expect(h.ui.some((e) => e.type === 'pacing')).toBe(true);
  });

  it('an extreme event and a state change trigger cut-ins', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'You what?')]];
    h.st.mainReplies = [intentJson([praised(ANN, { type: 'insulted', severity: 'extreme' })])];
    await h.controller.send('You are useless.');
    expect(h.ui).toContainEqual({ type: 'cut_in', kind: 'insulted' });
  });
});

describe('dispose', () => {
  it('a disposed controller drops late results', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'hello')]];
    h.st.mainReplies = [intentJson([praised()])];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.controller.dispose();
      return real(req);
    };
    const before = structuredClone(h.state().relations[ANN]);
    await h.controller.send('hi');
    expect(h.state().relations[ANN]).toEqual(before);
  });
});

describe('disposition never reaches the extraction input (P8)', () => {
  const exchange = async (tweak: (s: CampaignState) => void) => {
    const h = harness(reg, { tweak });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Thanks, commander.')]];
    h.st.mainReplies = [intentJson([praised()])];
    await h.controller.send('Good work today.');
    return h;
  };
  const extractionCalls = (h: Harness) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'));

  it('intent_extract prompts are byte-identical across disposition levels, offsets and stances', async () => {
    const plain = await exchange(() => {});
    const harsh = await exchange((s) => {
      s.world.options = { ...(s.world.options ?? {}), disposition: 'hazardous', gender_norms: 'corporate_machismo', offspec_stigma: 'hunted' };
      s.squad[0].dispositionOffset = 2;
      s.squad[0].dispositionReason = 'Bites first.';
      s.squad[0].worldStances = { gender_norms: { stance: 'shares', strength: 2, reason: 'Raised on the old rules.' } };
    });
    const kind = await exchange((s) => {
      s.world.options = { ...(s.world.options ?? {}), disposition: 'kind' };
      s.squad[0].dispositionOffset = -2;
    });
    const a = extractionCalls(plain);
    expect(a).toHaveLength(1);
    for (const other of [harsh, kind]) {
      const b = extractionCalls(other);
      expect(b).toHaveLength(1);
      expect(b[0].system).toBe(a[0].system);
      expect(b[0].prompt).toBe(a[0].prompt);
    }
    for (const word of ['hazardous', 'disposition', 'Bites first', 'machismo', 'Raised on the old rules']) {
      expect(a[0].system + a[0].prompt).not.toContain(word);
      expect(extractionCalls(harsh)[0].system + extractionCalls(harsh)[0].prompt).not.toContain(word);
    }
  });

  it('the sanitizer floor follows the setting and the lowest level: a 0.45 loss reaches the engine, which judges it per unit', async () => {
    const insult = (confidence: number) => intentJson([praised(ANN, { type: 'insulted', confidence })]);
    const run = async (level: string) => {
      const h = harness(reg, { tweak: (s) => { s.world.options = { ...(s.world.options ?? {}), disposition: level }; } });
      await open(h);
      h.st.groupReplies = [[reply('Ann', 'Hm.')]];
      h.st.mainReplies = [insult(0.45)];
      const before = h.state().relations[ANN];
      await h.controller.send('That was careless.');
      return { before, after: h.state().relations[ANN] };
    };
    const g = await run('guarded');
    const events = (r: CampaignState['relations'][string]) => r.history.filter((h) => h.kind === 'event');
    expect(events(g.after)).toEqual(events(g.before)); // dropped for her: no history line
    expect(g.after.affinity).toBe(g.before.affinity);
    const hz = await run('hazardous');
    expect(hz.after.affinity).toBeLessThan(hz.before.affinity);
    expect(hz.after.history.at(-1)).toMatchObject({ type: 'insulted' });
  });
});
