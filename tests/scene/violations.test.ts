import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import type { CampaignState } from '../../src/engine/state/types';
import '../../src/engine/actions/bonds';
import { ANN, BEA, harness, intentJson, praised, reply, type Harness } from '../helpers/sceneHarness';
import { setRecord, setRelation } from '../helpers/discipline';
import { loadCore } from '../helpers/world';
import { withBond } from '../helpers/bonds';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const intentCalls = (h: Harness) => h.st.calls.filter((c) => (c.system ?? '').includes('rules referee'));
const open = async (h: Harness, participants = [ANN]) => {
  expect(await h.controller.start({ locationId: 'mess_hall', participants, origin: 'event' })).toBe(true);
};
const flagged = (category = 'restraint', extra: Record<string, unknown> = {}) =>
  intentJson([praised()], { contentViolations: [{ category, evidence: 'she was tied down' }], ...extra });
const marks = (h: Harness) => h.state().scene?.violations;

describe('content violations in a scene (Review Focus 4)', () => {
  it('a flagged reply is marked with its chat index', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Ann ties him down.')]];
    h.st.mainReplies = [flagged()];
    await h.controller.send('Hello');
    expect(marks(h)).toEqual([{ index: 1, categories: ['restraint'] }]);
    const call = intentCalls(h)[0];
    expect(call.system! + call.prompt).toContain('restraint: Restraint'); // the extraction was told what is excluded
  });

  it('a flag on a category that is switched on is dropped', async () => {
    const h = harness(reg);
    h.dispatch({ type: 'content/set_categories', payload: { enabled: ['restraint'] } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Ann ties him down.')]];
    h.st.mainReplies = [flagged('restraint')];
    await h.controller.send('Hello');
    expect(marks(h)).toBeUndefined();
    expect((intentCalls(h)[0].system! + intentCalls(h)[0].prompt)).not.toContain('restraint: Restraint');
  });

  it('a swipe after a flagged reply removes the mark, and the new reply is read fresh', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'first answer')]];
    h.st.swipeReplies = [reply('Ann', 'second answer')];
    h.st.on('message_swiped', (i) => h.controller.onSwipe(i as number));
    h.st.mainReplies = [flagged(), intentJson([praised()])];
    await h.controller.send('Hello');
    expect(marks(h)).toHaveLength(1);
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(marks(h)).toBeUndefined();
    expect(h.st.mainReplies).toEqual([]);
    expect(intentCalls(h).at(-1)!.prompt).toContain('second answer');
  });

  it('a swipe that is flagged again is marked again, once', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'first answer')]];
    h.st.swipeReplies = [reply('Ann', 'second answer')];
    h.st.on('message_swiped', (i) => h.controller.onSwipe(i as number));
    h.st.mainReplies = [flagged(), flagged('humiliation')];
    await h.controller.send('Hello');
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(marks(h)).toEqual([{ index: 1, categories: ['humiliation'] }]);
  });

  it('an edited flagged reply is re-read and loses the mark when clean', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Ann ties him down.')]];
    h.st.mainReplies = [flagged(), intentJson([praised()])];
    await h.controller.send('Hello');
    expect(marks(h)).toHaveLength(1);
    await h.controller.edit(1, 'Ann nods and sits.');
    await h.controller.idle();
    expect(h.st.getChatMessages()[1].text).toBe('Ann nods and sits.');
    expect(marks(h)).toBeUndefined();
    expect(intentCalls(h).at(-1)!.prompt).toContain('Ann nods and sits.');
  });

  it('an edit that is still flagged keeps one mark', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Ann ties him down.')]];
    h.st.mainReplies = [flagged(), flagged()];
    await h.controller.send('Hello');
    await h.controller.edit(1, 'Ann ties him down, hard.');
    await h.controller.idle();
    expect(marks(h)).toEqual([{ index: 1, categories: ['restraint'] }]);
  });
});

describe('own limits reach the extraction (Review Focus 2/acceptance 3)', () => {
  it('limits of each participant reach the prompt', async () => {
    const h = harness(reg, { tweak: (s) => { withBond(s, ANN, { ownLimits: { categories: ['restraint', 'humiliation'] } }); } });
    await open(h, [ANN, BEA]);
    h.st.groupReplies = [[reply('Ann', 'No.')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('Hello');
    const text = intentCalls(h)[0].system! + intentCalls(h)[0].prompt;
    expect(text).toMatch(/- unit_ann \(Ann\)[^\n]*\n[^\n]*\n[^\n]*\n[^\n]*\n  will not take part in: Humiliation, Restraint/);
    expect(text.match(/will not take part in/g)).toHaveLength(1);
    expect(text).toContain('past her limits');
  });

  it('the prompt is byte-identical across dispositions and stances with the same categories and limits', async () => {
    const run = async (tweak: (s: CampaignState) => void) => {
      const h = harness(reg, { tweak: (s) => { withBond(s, ANN, { ownLimits: { categories: ['restraint'] } }); tweak(s); } });
      await open(h);
      h.st.groupReplies = [[reply('Ann', 'Thanks, commander.')]];
      h.st.mainReplies = [intentJson([praised()])];
      await h.controller.send('Good work today.');
      return intentCalls(h)[0];
    };
    const plain = await run(() => {});
    const harsh = await run((s) => {
      s.world.options = { ...(s.world.options ?? {}), disposition: 'hazardous', gender_norms: 'corporate_machismo' };
      s.squad[0].dispositionOffset = 2;
    });
    const brazen = await run((s) => { setRelation(s, ANN, { trust: 15 }); setRecord(s, ANN, 40); });
    for (const other of [harsh, brazen]) {
      expect(other.system).toBe(plain.system);
      expect(other.prompt).toBe(plain.prompt);
    }
  });

  it('lead, Want and publicity never enter the prompt', async () => {
    const h = harness(reg, { tweak: (s) => { withBond(s, ANN, { leadStyle: 'dominant', desire: 'high' }); s.relations[ANN].want = 95; s.relations[ANN].publicity = { level: 'secret', since: 1 }; } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Hm.')]];
    h.st.mainReplies = [intentJson()];
    await h.controller.send('Hello');
    const text = (intentCalls(h)[0].system! + intentCalls(h)[0].prompt).toLowerCase();
    for (const word of ['dominant', 'publicity', 'leads this scene', 'leadstyle', 'want: ', 'want 95']) expect(text).not.toContain(word);
  });
});

describe('scene tone from the reading', () => {
  it('a reported tone is stored on the scene', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'She leans closer.')]];
    h.st.mainReplies = [intentJson([], { sceneTone: 'romantic' })];
    await h.controller.send('Hello');
    expect(h.state().scene!.tone).toBe('romantic');
  });

  it('a swipe rolls the tone back with the reading', async () => {
    const h = harness(reg);
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'She leans closer.')]];
    h.st.swipeReplies = [reply('Ann', 'She shrugs.')];
    h.st.on('message_swiped', (i) => h.controller.onSwipe(i as number));
    h.st.mainReplies = [intentJson([], { sceneTone: 'intimate' }), intentJson()];
    await h.controller.send('Hello');
    expect(h.state().scene!.tone).toBe('intimate');
    expect(h.state().scene!.lead).toMatchObject({ unitId: ANN });
    await h.st.swipeLast('right');
    await h.controller.idle();
    expect(h.state().scene!.tone).toBeUndefined();
    expect(h.state().scene!.lead).toBeUndefined(); // the lead decided with the tone goes with it
  });
});

describe('scene_summary and flagged replies', () => {
  it('flagged transcript lines are marked for the summary, its violations are only logged and never mark anything', async () => {
    const h = harness(reg, { settings: { debug: true } });
    await open(h);
    h.st.groupReplies = [[reply('Ann', 'Ann ties him down with the strap.')]];
    h.st.mainReplies = [
      flagged(),
      JSON.stringify({ chronicle: 'A rough evening.', facts: [{ about: [ANN], text: 'Ann ties him down with the strap.', importance: 3, tags: [] }, { about: [ANN], text: 'Ann likes tea.', importance: 2, tags: [] }], contentViolations: [{ category: 'restraint', evidence: 'ties him down' }] }),
    ];
    await h.controller.send('Hello');
    await h.controller.end();
    const summaryCall = h.st.calls.find((c) => (c.system ?? '').includes('summarize one finished scene'))!;
    expect(summaryCall.prompt).toContain('[EXCLUDED CONTENT] Ann: Ann ties him down');
    expect(h.state().memory.facts.map((f) => f.text)).toEqual(['Ann likes tea.']);
    expect(h.state().scene).toBeUndefined();
    expect(h.toasts.some((t) => /content/i.test(t.text) && /restraint/i.test(t.text))).toBe(true); // the debug log line
  });
});

describe('DM violations', () => {
  it('a violation in her DM marks the DM', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['Ann ties you to the bed.', JSON.stringify({ events: [], contentViolations: [{ category: 'restraint', evidence: 'ties you' }] })];
    await h.comms.send(ANN, 'Hello?');
    const thread = h.state().dms[ANN];
    expect(thread.at(-1)!.from).toBe(ANN);
    expect(thread.at(-1)!.violation).toEqual(['restraint']);
    expect(thread[0].violation).toBeUndefined();
    expect(h.ui).toContainEqual(expect.objectContaining({ type: 'transcript' }));
  });

  it('a clean DM is not marked', async () => {
    const h = harness(reg);
    h.st.mainReplies = ['Hello, commander.', intentJson()];
    await h.comms.send(ANN, 'Hello?');
    expect(h.state().dms[ANN].some((m) => m.violation !== undefined)).toBe(false);
  });
});
