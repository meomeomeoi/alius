import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/memory';
import { addFact, recordPromise } from '../../src/engine/memory';
import type { CampaignState, DmMessage } from '../../src/engine/state/types';
import { estTokens } from '../../src/llm/text';
import { ContextBuilder, type ContextProvider } from '../../src/llm/context';
import { registerMemoryContext } from '../../src/scene/memoryContext';
import { DEFAULT_SETTINGS } from '../../src/settings';
import { campaign, errors, loadCore, run } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const IDS = ['dossier', 'journal', 'facts', 'promises', 'recent', 'dm_recap'];

/** The six providers, taken as they register themselves. */
function providers(): Map<string, ContextProvider> {
  const out = new Map<string, ContextProvider>();
  registerMemoryContext({ register: (p: ContextProvider) => out.set(p.id, p) } as unknown as ContextBuilder, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
  return out;
}
const render = (s: CampaignState, id: string, budget = 2000): string => providers().get(id)!.render(s, budget) ?? '';

const dm = (day: number, from: string, text: string, i: number): DmMessage => ({ id: `dm${i}`, from, text, day, slot: 'morning', read: true });
function world(participants: string[]): CampaignState {
  const s = campaign(reg, 4);
  s.day = 12;
  s.slot = 'evening';
  s.memory.dossiers = {
    [ANN]: { own: 'PRIVATE-OWN-ANN keeps a letter', shared: 'shared-ann is the squad sniper', day: 11, folded: 6 },
    [BEA]: { own: 'PRIVATE-OWN-BEA hides a debt', shared: 'shared-bea cooks for everyone', day: 11, folded: 6 },
    [CAT]: { own: 'PRIVATE-OWN-CAT', shared: 'shared-cat is not here', day: 11, folded: 6 },
    '*': { own: 'WORLD-OWN-NEVER', shared: 'world-shared the base was nearly lost', day: 11, folded: 6 },
  };
  s.relations[ANN].history = [{ day: 11, kind: 'event', type: 'broke_promise', severity: 'major', detail: 'SECRET-EVIDENCE about the medicine' }];
  addFact(s, { about: [ANN], text: 'FACT-ANN-ONLY she writes at night', tags: [], importance: 5, day: 12, knownBy: [ANN] });
  addFact(s, { about: [ANN, BEA], text: 'fact-both they share a bunk', tags: [], importance: 4, day: 12, knownBy: [ANN, BEA] });
  recordPromise(s, { by: 'commander', to: ANN, text: 'PROMISE-ANN-ONLY bring the medicine', kind: 'made' }, 12, [ANN]);
  s.memory.chronicle.push(
    { id: 'c1', kind: 'scene', day: 12, text: 'CHRONICLE-ANN-ONLY a quiet talk', audience: [ANN] },
    { id: 'c2', kind: 'scene', day: 12, text: 'chronicle-both a talk in the mess', audience: [ANN, BEA] },
    { id: 'c3', kind: 'day', day: 11, text: 'chronicle-all the squad moved out', audience: '*' },
    { id: 'c4', kind: 'scene', day: 12, text: 'OLD-NO-AUDIENCE written before P3b' },
  );
  s.dms[ANN] = [dm(12, 'commander', 'DM-TEXT are you all right?', 1), dm(12, ANN, 'DM-TEXT-REPLY I am fine', 2)];
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants, origin: 'event', startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}

describe('memory providers', () => {
  it('registers six providers of the memory group, in the planned priority', () => {
    const p = providers();
    expect([...p.keys()].sort()).toEqual([...IDS].sort());
    for (const id of IDS) expect(p.get(id)!.group, id).toBe('memory');
    const prio = IDS.map((id) => p.get(id)!.priority);
    expect(prio).toEqual([70, 65, 60, 55, 50, 45]);
  });

  it('nothing private renders in a group scene', () => {
    const PRIVATE = ['PRIVATE-OWN', 'SECRET-EVIDENCE', 'FACT-ANN-ONLY', 'PROMISE-ANN-ONLY', 'CHRONICLE-ANN-ONLY', 'OLD-NO-AUDIENCE', 'DM-TEXT', 'WORLD-OWN-NEVER'];
    for (const participants of [[ANN, BEA], [ANN, BEA, CAT]]) {
      const s = world(participants);
      for (const id of IDS) {
        const text = render(s, id);
        for (const secret of PRIVATE) expect(text, `${id} (${participants.length} present) leaks ${secret}`).not.toContain(secret);
        if (participants.length === 2) expect(text, `${id} names an absent unit`).not.toContain('shared-cat');
      }
    }
    // and the table is not vacuous: what is shared does render
    const s = world([ANN, BEA]);
    expect(render(s, 'dossier')).toContain('shared-ann is the squad sniper');
    expect(render(s, 'dossier')).toContain('shared-bea cooks for everyone');
    expect(render(s, 'dossier')).toContain('world-shared the base was nearly lost');
    expect(render(s, 'journal')).toContain('the commander broke a promise to her (day 11)'); // the type and the day only
    expect(render(s, 'facts')).toContain('fact-both they share a bunk');
    expect(render(s, 'recent')).toContain('chronicle-both a talk in the mess');
    expect(render(s, 'recent')).toContain('chronicle-all the squad moved out');
    expect(render(s, 'promises')).toBe('');
    expect(render(s, 'dm_recap')).toBe('');
  });

  it('a private scene renders own, evidence and the DM recap', () => {
    const s = world([ANN]);
    const dossier = render(s, 'dossier');
    expect(dossier).toContain('PRIVATE-OWN-ANN keeps a letter');
    expect(dossier).toContain('shared-ann is the squad sniper');
    expect(dossier).not.toContain('PRIVATE-OWN-BEA');
    expect(dossier).not.toContain('shared-bea'); // she is not here
    expect(dossier).not.toContain('WORLD-OWN-NEVER');
    expect(render(s, 'journal')).toContain("the commander broke a promise to her (day 11): 'SECRET-EVIDENCE about the medicine'");
    expect(render(s, 'facts')).toContain('FACT-ANN-ONLY she writes at night');
    expect(render(s, 'promises')).toContain('PROMISE-ANN-ONLY bring the medicine');
    expect(render(s, 'recent')).toContain('CHRONICLE-ANN-ONLY a quiet talk');
    expect(render(s, 'recent')).not.toContain('OLD-NO-AUDIENCE');
    expect(render(s, 'dm_recap')).toBe('Messages lately: commander: DM-TEXT are you all right?; Ann: DM-TEXT-REPLY I am fine');
  });

  it('the DM recap keeps the last dmLines messages of the last two days, each cut to 120 characters', () => {
    const s = world([ANN]);
    s.dms[ANN] = [
      dm(5, 'commander', 'too old', 1), dm(10, 'commander', 'first', 2), dm(11, ANN, 'x'.repeat(300), 3), dm(12, 'commander', 'third', 4), dm(12, ANN, 'fourth', 5),
    ];
    const text = render(s, 'dm_recap');
    expect(text).not.toContain('too old');
    expect(text.startsWith('Messages lately: ')).toBe(true);
    // normal = 3 messages: the last three of those in the window
    expect(text.split('; ')).toHaveLength(3);
    expect(text).not.toContain('first');
    expect(text).toContain('third');
    expect(text).toContain('fourth');
    s.dms[ANN] = [dm(12, ANN, 'y'.repeat(300), 1)];
    const cut = render(s, 'dm_recap').replace('Messages lately: Ann: ', '');
    expect(cut.length).toBeLessThanOrEqual(120);
    expect(cut.startsWith('yyy')).toBe(true);
    s.dms[ANN] = [];
    expect(render(s, 'dm_recap')).toBe('');
  });

  it('out of a scene only public memory renders', () => {
    const s = world([ANN]);
    delete s.scene;
    delete s.calendar.pendingScene;
    expect(render(s, 'dossier')).toContain('world-shared the base was nearly lost');
    expect(render(s, 'dossier')).not.toContain('shared-ann');
    expect(render(s, 'dossier')).not.toContain('WORLD-OWN-NEVER');
    expect(render(s, 'recent')).toContain('chronicle-all the squad moved out');
    expect(render(s, 'recent')).not.toContain('chronicle-both');
    expect(render(s, 'recent')).not.toContain('CHRONICLE-ANN-ONLY');
    for (const id of ['journal', 'facts', 'promises', 'dm_recap']) expect(render(s, id), id).toBe('');
    // the whole builder: header + public memory
    const b = new ContextBuilder();
    registerMemoryContext(b, { registries: () => reg, settings: () => DEFAULT_SETTINGS });
    const block = b.build(s, 2000, 600).block;
    expect(block).toContain('Day 12');
    expect(block).toContain('world-shared');
    expect(block).not.toContain('PRIVATE-OWN');
  });

  it('the facts line marks rumors and hidden facts', () => {
    const s = world([ANN, BEA]);
    const rumor = addFact(s, { about: [CAT], text: 'Cat sold her ration card.', tags: [], importance: 5, day: 12, knownBy: [ANN, BEA], heard: { [BEA]: 12 } } as never);
    expect(rumor.heard).toBeDefined();
    addFact(s, { about: [ANN], text: 'Ann knows a way out.', tags: [], importance: 5, day: 12, knownBy: [ANN, BEA], hiddenFromCommander: true });
    const text = render(s, 'facts');
    expect(text).toContain('- (heard as a rumor) Cat sold her ration card.');
    expect(text).toContain('- Ann and Bea know (the commander does not): Ann knows a way out; they do not tell the commander.');
    expect(text.split('\n')[0]).toBe('Known facts:');
  });

  it('retrievalK and journalLines come from the memory config', () => {
    const s = world([ANN]);
    for (let i = 0; i < 12; i++) addFact(s, { about: [ANN], text: `extra fact ${i}`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
    for (let i = 0; i < 8; i++) s.relations[ANN].history.push({ day: 11, kind: 'event', type: 'praised', severity: 'major' });
    const lines = (t: string): number => t.split('\n').filter((l) => l.startsWith('- ')).length;
    expect(lines(render(s, 'facts'))).toBe(6);
    expect(render(s, 'journal').split('; ')).toHaveLength(3);
    s.memory.config = { preset: 'long' };
    expect(lines(render(s, 'facts'))).toBe(8);
    expect(render(s, 'journal').split('; ')).toHaveLength(5);
    s.memory.config = { preset: 'custom', journalLines: 0 };
    expect(render(s, 'journal')).toBe('');
  });

  it('a dossier is cut to the budget by lines, keeping the first, and never dropped', () => {
    const s = world([ANN, BEA]);
    const full = render(s, 'dossier');
    const small = render(s, 'dossier', 30);
    expect(small.length).toBeGreaterThan(0);
    expect(small.length).toBeLessThan(full.length);
    expect(estTokens(small)).toBeLessThanOrEqual(30);
    expect(small).toContain('shared-ann'); // the unit's own line outranks the world's
    expect(render(s, 'dossier', 0)).toBe('');
  });

  it('every provider stays inside the budget it is given', () => {
    const s = world([ANN]);
    for (let i = 0; i < 12; i++) {
      addFact(s, { about: [ANN], text: `extra fact number ${i} with some more words in it`, tags: [], importance: 3, day: 12, knownBy: [ANN] });
      s.memory.chronicle.push({ id: `cx${i}`, kind: 'scene', day: 12, text: `a longer chronicle line number ${i} about the day`, audience: [ANN] });
    }
    for (const id of IDS) for (const budget of [25, 60, 150]) expect(estTokens(render(s, id, budget)), `${id} @${budget}`).toBeLessThanOrEqual(budget);
  });

  it('a save without any of the new state renders facts and promises as before', () => {
    const s = campaign(reg, 4);
    s.day = 12;
    addFact(s, { about: [ANN], text: 'She keeps a photo.', tags: [], importance: 3, day: 12, knownBy: [ANN] });
    recordPromise(s, { by: 'commander', to: ANN, text: 'bring tea', kind: 'made' }, 12);
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 0 } }).state;
    expect(render(started, 'facts')).toBe('Known facts:\n- She keeps a photo.');
    expect(render(started, 'promises')).toBe('Open promises:\n- Vale promised Ann: bring tea');
    for (const id of ['dossier', 'journal', 'recent', 'dm_recap']) expect(render(started, id), id).toBe('');
  });
});
