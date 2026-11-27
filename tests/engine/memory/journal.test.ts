import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dilemma';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { journalLines } from '../../../src/engine/memory/journal';
import { openScapegoat, scapegoatOptionId } from '../../../src/engine/power/scapegoat';
import type { CampaignState, HistoryEntry } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const fresh = (): CampaignState => {
  const s = campaign(reg, 4);
  s.day = 10;
  return s;
};
const hist = (s: CampaignState, ...entries: HistoryEntry[]): CampaignState => {
  s.relations[ANN].history = entries;
  return s;
};
const ev = (day: number, type: string, severity: HistoryEntry['severity'], detail?: string): HistoryEntry => ({ day, kind: 'event', type, severity, ...(detail !== undefined ? { detail } : {}) });

describe('journalLines', () => {
  it('journal keeps moderate+ and recent minor events, last n, oldest first', () => {
    const s = hist(fresh(),
      ev(1, 'praised', 'minor'), // old and minor: out
      ev(2, 'insulted', 'moderate'),
      ev(3, 'comforted', 'minor'), // old and minor: out
      ev(8, 'listened', 'minor'), // minor but inside the last 2 days
      ev(9, 'protected', 'major'),
      ev(10, 'broke_promise', 'extreme'));
    expect(journalLines(s, reg, ANN, { n: 10, evidence: false })).toEqual([
      'the commander insulted her (day 2)', 'the commander listened to her (day 8)', 'the commander protected her (day 9)', 'the commander broke a promise to her (day 10)',
    ]);
    expect(journalLines(s, reg, ANN, { n: 2, evidence: false })).toEqual(['the commander protected her (day 9)', 'the commander broke a promise to her (day 10)']);
    expect(journalLines(s, reg, ANN, { n: 0, evidence: false })).toEqual([]);
  });

  it('stress_high is never a journal line, and neither are states, proposals and marks', () => {
    const s = hist(fresh(), ev(9, 'stress_high', 'major'),
      { day: 9, kind: 'state', type: 'friend', severity: 'major' }, { day: 9, kind: 'proposal', type: 'confide', severity: 'major' }, { day: 9, kind: 'mark', type: 'x', severity: 'major' },
      ev(9, 'praised', 'moderate'));
    expect(journalLines(s, reg, ANN, { n: 5, evidence: false })).toEqual(['the commander praised her (day 9)']);
  });

  it('an event type without a phrase is its humanized id', () => {
    const s = hist(fresh(), ev(9, 'no_such_event', 'major'));
    expect(journalLines(s, reg, ANN, { n: 3, evidence: false })).toEqual(['no such event (day 9)']);
  });

  it('evidence only when asked', () => {
    const s = hist(fresh(), ev(9, 'broke_promise', 'major', 'said she would bring medicine'), ev(10, 'praised', 'major'));
    expect(journalLines(s, reg, ANN, { n: 3, evidence: false })).toEqual(['the commander broke a promise to her (day 9)', 'the commander praised her (day 10)']);
    expect(journalLines(s, reg, ANN, { n: 3, evidence: true })).toEqual([
      "the commander broke a promise to her (day 9): 'said she would bring medicine'", 'the commander praised her (day 10)',
    ]);
  });

  it('a unit without a relation or history has no lines', () => {
    const s = fresh();
    expect(journalLines(s, reg, ANN, { n: 3, evidence: true })).toEqual([]);
    expect(journalLines(s, reg, 'nobody', { n: 3, evidence: true })).toEqual([]);
  });

  it('every event delta has a journal phrase without a commander pronoun', () => {
    // P16b fix wave: praise_given and foot_signal_answered are rows of zeros that never reach applyEventToUnit (the craft applies them itself), so a phrase would be dead and they have none
    const NEVER_JOURNALED = ['praise_given', 'foot_signal_answered'];
    const missing = [...reg.eventDeltas.values()].filter((e) => !NEVER_JOURNALED.includes(String(e.id)) && (typeof e.journal !== 'string' || e.journal === '')).map((e) => e.id);
    expect(missing).toEqual([]);
    for (const e of reg.eventDeltas.values()) expect(String(e.journal ?? ''), String(e.id)).not.toMatch(/\b(he|him|his|himself)\b/i);
  });

  it('a scapegoat shift shows in the shifted unit\'s journal', () => {
    const s = campaign(reg, 4);
    s.leash.authorizationsLeft = 3;
    openScapegoat(s, ctxOf(s, reg), { missionId: 'm1', unitId: ANN, witnessIds: [BEA] });
    const open = s.dilemmas!.open!;
    const r = run(s, reg, { type: 'dilemma/choose', payload: { id: open.id, index: open.options!.findIndex((o) => scapegoatOptionId(o) === 'shift_blame') } });
    expect(errors(r.events)).toEqual([]);
    expect(journalLines(r.state, reg, ANN, { n: 3, evidence: false })).toContain(`the commander took the side against her (day ${r.state.day})`);
  });
});

describe('scene/digest', () => {
  const open = (): CampaignState => {
    const r = run(campaign(reg, 4), reg, { type: 'scene/start', payload: { locationId: 'mess_hall', participants: [ANN], origin: 'event', startIndex: 7 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };
  const digest = (s: CampaignState, payload: unknown) => run(s, reg, { type: 'scene/digest', payload });

  it('scene/digest stores text and facts and refuses a backwards upTo', () => {
    const s = open();
    const r = digest(s, { text: 'They argued about the generator.', upTo: 20, facts: [{ about: [ANN], text: 'Ann distrusts the generator.', importance: 3, tags: [] }] });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.digest).toEqual({ text: 'They argued about the generator.', upTo: 20 });
    const fact = r.state.memory.facts.at(-1)!;
    expect(fact).toMatchObject({ text: 'Ann distrusts the generator.', about: [ANN], knownBy: [ANN], sceneId: r.state.scene!.id, importance: 3 });
    expect(ofType(r.events, 'scene_digested')).toHaveLength(1);
    // a later digest replaces it; an equal or smaller upTo is refused
    const again = digest(r.state, { text: 'And then they made peace.', upTo: 30, facts: [] });
    expect(again.state.scene!.digest).toEqual({ text: 'And then they made peace.', upTo: 30 });
    for (const upTo of [30, 25, 7, 3]) expect(errors(digest(again.state, { text: 'x', upTo, facts: [] }).events), String(upTo)).toHaveLength(1);
    // the first digest must be past the scene's start
    expect(errors(digest(s, { text: 'x', upTo: 7, facts: [] }).events)).toHaveLength(1);
    expect(errors(digest(s, { text: 'x', upTo: 8, facts: [] }).events)).toEqual([]);
  });

  it('the text is cut to 800 characters, empty text and bad payloads are refused, and there must be an open scene', () => {
    const s = open();
    const long = digest(s, { text: 'x'.repeat(1200), upTo: 20, facts: [] });
    expect(long.state.scene!.digest!.text).toHaveLength(800);
    for (const bad of [null, {}, { text: '', upTo: 20, facts: [] }, { text: 'x', upTo: 'a', facts: [] }, { text: 'x', upTo: 20, facts: 'no' }, { text: 'x', upTo: 20.5, facts: [] }]) {
      expect(errors(digest(s, bad).events), JSON.stringify(bad)).toHaveLength(1);
    }
    expect(errors(digest(campaign(reg, 4), { text: 'x', upTo: 20, facts: [] }).events)).toHaveLength(1);
  });

  it('digest facts count against the per-scene cap, with the facts of the scene end', () => {
    const s = open();
    const facts = Array.from({ length: 6 }, (_, i) => ({ about: [ANN], text: `digest fact ${i}`, importance: 2, tags: [] }));
    const r = digest(s, { text: 't', upTo: 20, facts });
    expect(r.state.memory.facts).toHaveLength(6);
    const more = digest(r.state, { text: 't2', upTo: 30, facts: facts.map((f, i) => ({ ...f, text: `second ${i}` })) });
    expect(more.state.memory.facts.filter((f) => f.sceneId === s.scene!.id)).toHaveLength(8); // factsPerScene
    const end = run(more.state, reg, { type: 'scene/end', payload: { summary: { chronicle: 'done', facts: [{ about: [ANN], text: 'one more', importance: 2, tags: [] }] } } });
    expect(end.state.memory.facts.filter((f) => f.sceneId === s.scene!.id)).toHaveLength(8);
  });

  it('a digest is gone with the scene on abort', () => {
    const r = digest(open(), { text: 'A digest.', upTo: 20, facts: [] });
    expect(r.state.scene!.digest).toBeDefined();
    const aborted = run(r.state, reg, { type: 'scene/abort' });
    expect(aborted.state.scene).toBeUndefined();
    expect(JSON.stringify(aborted.state)).not.toContain('A digest.');
    const ended = run(r.state, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.scene).toBeUndefined();
  });
});
