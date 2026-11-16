import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { unreadCount } from '../../src/engine/dms';
import { ANN, BEA, harness, intentJson, praised, type Harness } from '../helpers/sceneHarness';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const mainCalls = (h: Harness) => h.st.calls.length;
const eager = (): Registries => {
  const r = structuredClone(reg);
  for (const st of r.relationshipStates.values()) st.dmChance = 1;
  return r;
};

describe('DMs carry her memory (P3b)', () => {
  const memoryWorld = (s: import('../../src/engine/state/types').CampaignState): void => {
    s.day = 12;
    s.memory.dossiers = { [ANN]: { own: 'OWN-PART she keeps a letter.', shared: 'SHARED-PART she is the sniper.', day: 11, folded: 6 } };
    s.relations[ANN].history = [{ day: 11, kind: 'event', type: 'broke_promise', severity: 'major', detail: 'EVIDENCE-TEXT' }];
    for (let i = 0; i < 10; i++) s.memory.facts.push({ id: `f${i + 1}`, about: [ANN], text: `DM fact ${i}`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
  };
  const factsInPrompt = (h: Harness): number => ((h.st.calls[0] as { prompt: string }).prompt.match(/DM fact/g) ?? []).length;

  it('dm_reply gets her own and shared dossier and her journal with evidence', async () => {
    const h = harness(reg, { tweak: memoryWorld });
    h.st.mainReplies = ['Here.', intentJson()];
    await h.comms.send(ANN, 'Are you awake?');
    const prompt = (h.st.calls[0] as { prompt: string }).prompt;
    expect(prompt).toContain('OWN-PART she keeps a letter.');
    expect(prompt).toContain('SHARED-PART she is the sniper.');
    expect(prompt).toContain('the commander broke a promise to her (day 11)');
    expect(prompt).toContain('EVIDENCE-TEXT'); // a DM is private: the evidence is hers to know
  });

  it('the DM asks for ceil(retrievalK / 2) facts', async () => {
    for (const [preset, n] of [['short', 3], ['normal', 3], ['long', 4]] as const) {
      const h = harness(reg, { tweak: (s) => { memoryWorld(s); s.memory.config = { preset }; } });
      h.st.mainReplies = ['Here.', intentJson()];
      await h.comms.send(ANN, 'Are you awake?');
      expect(factsInPrompt(h), preset).toBe(n);
    }
  });

  it('a unit without memory gets the DM prompt of before', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['Here.', intentJson()];
    await h.comms.send(ANN, 'Are you awake?');
    expect((h.st.calls[0] as { prompt: string }).prompt).not.toMatch(/remember|Lately/i);
  });
});

describe('DMs', () => {
  it('DM send → reply → intents (acceptance 8)', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['I am here, commander.', intentJson([praised(ANN, { type: 'comforted' })])];
    const before = h.state().relations[ANN].affinity;
    await h.comms.send(ANN, 'Are you awake?');
    const thread = h.state().dms[ANN];
    expect(thread.map((m) => [m.from, m.text, m.read])).toEqual([['commander', 'Are you awake?', true], [ANN, 'I am here, commander.', false]]);
    expect(unreadCount(h.state())).toBe(1);
    expect(h.state().relations[ANN].affinity).toBeGreaterThan(before);
    expect(h.state().relations[ANN].history.at(-1)).toMatchObject({ type: 'comforted' });
    // the reply prompt knows bands, the extraction prompt the exchange
    expect((h.st.calls[0] as { prompt: string }).prompt).toMatch(/Trust: /);
    expect((h.st.calls[1] as { prompt: string }).prompt).toContain('Are you awake?');
    expect((h.st.calls[1] as { prompt: string }).prompt).toContain('I am here, commander.');
  });

  it('a DM by the commander that proposes something is not honoured in the thread', async () => {
    const h = harness(reg, { tweak: (s) => { Object.assign(s.relations[ANN], { stateId: 'friend', trust: 50, affinity: 30, attraction: 40 }); } });
    h.st.mainReplies = ['Maybe.', intentJson([], { proposals: [{ from: 'commander', to: ANN, kind: 'date', evidence: 'x' }, { from: ANN, to: 'commander', kind: 'date', evidence: 'she asks' }] })];
    await h.comms.send(ANN, 'Dinner?');
    expect(h.state().relations[ANN].stateId).toBe('friend');
    expect(h.state().proposals).toHaveLength(1);
    expect(h.state().proposals![0]).toMatchObject({ from: 'unit', channel: 'dm' });
    expect(h.ui).toContainEqual(expect.objectContaining({ type: 'chips' }));
  });

  it('an ignored message sends no LLM call', async () => {
    const h = harness(reg);
    const s = structuredClone(h.state());
    s.dmMeta = { [ANN]: { day: s.day, sent: 6 } };
    h.set(s);
    await h.comms.send(ANN, 'one more');
    expect(mainCalls(h)).toBe(0);
    expect(h.state().dms[ANN]).toHaveLength(1);
    expect(unreadCount(h.state())).toBe(0);
  });

  it('a spammed unit snaps', async () => {
    const h = harness(reg);
    const s = structuredClone(h.state());
    s.dmMeta = { [ANN]: { day: s.day, sent: 4 } };
    h.set(s);
    h.st.mainReplies = ['Stop it.', intentJson()];
    await h.comms.send(ANN, 'hello?');
    expect((h.st.calls[0] as { system: string }).system).toMatch(/too many messages/);
    expect(h.state().dms[ANN].at(-1)!.text).toBe('Stop it.');
  });

  it('no reply from the model leaves the thread with the commander message only', async () => {
    const h = harness(reg);
    await h.comms.send(ANN, 'hello');
    expect(h.state().dms[ANN]).toHaveLength(1);
  });

  it('a send to a unit that cannot be messaged shows the error', async () => {
    const h = harness(reg);
    await h.comms.send('ghost', 'hello');
    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(mainCalls(h)).toBe(0);
  });

  it('a chat switch while she writes drops the reply', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['late reply'];
    const real = h.st.generateMain.bind(h.st);
    h.st.generateMain = async (req) => {
      h.st.switchChat({ chatId: 'chat-2', isGroup: true, groupId: 'g2' });
      return real(req);
    };
    await h.comms.send(ANN, 'hello');
    expect(h.state().dms[ANN]).toHaveLength(1);
  });
});

describe('initiative', () => {
  it('a unit-initiated DM after a slot transition raises the unread count', async () => {
    const h = harness(eager());
    h.st.mainReplies = ['Hey you.', 'Where are you?'];
    await h.comms.onSlotAdvanced();
    expect(unreadCount(h.state())).toBe(2);
    const initiated = Object.values(h.state().dms).flat();
    expect(initiated.every((m) => m.initiated === true && m.read === false)).toBe(true);
    expect((h.st.calls[0] as { system: string }).system).toMatch(/writes first/);
  });

  it('unitDms off rolls nothing', async () => {
    const h = harness(eager(), { settings: { unitDms: false } });
    await h.comms.onSlotAdvanced();
    expect(h.actions).not.toContain('dm/roll_initiative');
    expect(unreadCount(h.state())).toBe(0);
  });

  it('a failed generation leaves no message', async () => {
    const h = harness(eager());
    await h.comms.onSlotAdvanced();
    expect(unreadCount(h.state())).toBe(0);
    expect(h.actions).toContain('dm/roll_initiative');
  });
});

describe('initiate (P11: one unit, no roll)', () => {
  it('sends one initiated DM from the unit without rolling the initiative', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['Hey, commander. Got a minute?'];
    await h.comms.initiate(ANN);
    expect(h.actions).not.toContain('dm/roll_initiative');
    const dms = Object.values(h.state().dms).flat();
    expect(dms).toHaveLength(1);
    expect(dms[0]).toMatchObject({ from: ANN, text: 'Hey, commander. Got a minute?', initiated: true, read: false });
    expect(h.st.calls).toHaveLength(1);
    expect((h.st.calls[0] as { system: string }).system).toMatch(/writes first/);
  });

  it('is a no-op with unit DMs off', async () => {
    const h = harness(reg, { settings: { unitDms: false } });
    await h.comms.initiate(ANN);
    expect(h.st.calls).toHaveLength(0);
    expect(unreadCount(h.state())).toBe(0);
  });

  it('a failed generation or an unknown unit leaves no message', async () => {
    const h = harness(reg);
    await h.comms.initiate(ANN);
    await h.comms.initiate('ghost');
    expect(unreadCount(h.state())).toBe(0);
  });
});

describe('night', () => {
  const night = (s: ReturnType<Harness['state']>) => {
    s.slot = 'night';
    s.calendar.nightEvent = { id: 'n1', unitId: ANN, kind: 'visit', priority: 30, framing: 'Ann knocks on your door, late.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: 9 };
  };
  it('open night starts a night scene at the commander quarters', async () => {
    const h = harness(reg, { tweak: night });
    await h.comms.openNight();
    expect(h.state().scene).toMatchObject({ origin: 'night', locationId: 'quarters_commander', participants: [ANN], nightEntryId: 'n1' });
    expect(h.context.build(h.state(), 3000).directives).toContain('Ann knocks on your door, late.');
    expect(h.st.members.filter((m) => m.active).map((m) => m.avatar)).toEqual(['ann.png']);
  });
  it('ignore applies the consequence and rolls the day', async () => {
    const h = harness(reg, { tweak: night });
    const before = h.state().relations[ANN].affinity;
    h.comms.ignoreNight();
    expect(h.state().day).toBe(2);
    expect(h.state().slot).toBe('morning');
    expect(h.state().relations[ANN].affinity).toBe(before - 1);
  });
  it('open night without a knock shows the engine error', async () => {
    const h = harness(reg);
    await h.comms.openNight();
    expect(h.toasts.some((t) => t.kind === 'error')).toBe(true);
    expect(h.state().scene).toBeUndefined();
    expect(BEA).toBeDefined();
  });
});

describe('discipline read from a DM (P9)', () => {
  const event = (type: string, measure: string) => ({ type, actor: 'commander', targets: [ANN], severity: 'moderate', evidence: 'x', confidence: 0.9, measure });
  it('a threat written in a DM is registered with channel dm', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['We will see.', intentJson([event('threatened', 'brig')])];
    await h.comms.send(ANN, 'Do that again and it is the brig.');
    expect(h.state().discipline!.threats).toEqual([expect.objectContaining({ unitId: ANN, measure: 'brig', channel: 'dm' })]);
    expect(h.ui).toContainEqual({ type: 'discipline' });
  });

  it('a punishment written in a DM applies, with a dm message ref', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['Understood.', intentJson([event('commander_enforced', 'revoke_rations')])];
    await h.comms.send(ANN, 'Your rations are revoked.');
    const app = h.state().discipline!.applications[0];
    expect(app).toMatchObject({ unitId: ANN, measure: 'revoke_rations', source: 'dialogue', channel: 'dm' });
    expect(app.messageRef).toMatch(/^dm:/);
    expect(h.ui).toContainEqual({ type: 'discipline' });
  });

  it('the extraction prompt lists the measures', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['ok', intentJson([])];
    await h.comms.send(ANN, 'hi');
    expect((h.st.calls[1] as { system: string }).system).toContain('MEASURE: verbal, revoke_rations, revoke_leave, extra_duty, bench, brig, leash, unspecified');
  });
});

