import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { applyMomentDirectives, clearMomentDirectives, momentDirective } from '../../../src/blocking/momentDirectives';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { RESPONSE_TYPES, type ResponseType } from '../../../src/engine/blocking/types';
import { answerMoment, escalationVerb, expectedOption, gapOf, lapseMoments, registerExpectation, resetExpectations } from '../../../src/engine/moments/answer';
import { fireMoment } from '../../../src/engine/moments/fire';
import { momentsOf } from '../../../src/engine/moments/state';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { ContextBuilder } from '../../../src/llm/context';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/moments';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetExpectations();
});

const ANN = 'unit_ann';

function scene(on?: string[], loc = 'quarters_commander'): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  if (on) enable(s, ...on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: loc, participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const set = (s: CampaignState, c: BlockingChange): CampaignState => {
  const d = structuredClone(s);
  setBlocking(d, { registries: reg }, c, { at: 3, source: 'chip' });
  return d;
};
/** A scene with `sourceId`'s moment open. */
function open(sourceId: string, base: CampaignState = scene()): CampaignState {
  const d = structuredClone(base);
  d.scene!.exchanges = 2;
  fireMoment(d, { registries: reg }, sourceId, ANN);
  return d;
}
const answer = (s: CampaignState, key: string, seed = 1, via: 'chip' | 'text' = 'chip', tone?: string) => {
  const d = structuredClone(s);
  const rng = new Rng(seedRng(seed));
  const events = answerMoment(d, { registries: reg, rng }, momentsOf(d.scene).open!.id, key, via, tone);
  d.rng = rng.state;
  return { state: d, events, rng: rng.state };
};

describe('her expected option and the gap', () => {
  it('the neutral expected option is the returned one, else the yielded one; a registered expectation wins', () => {
    const third = momentsOf(open('third_party').scene).open!; // yielded hide · returned as is · resisted show yourself
    expect(expectedOption(open('third_party'), reg, third)).toEqual({ key: '1', strength: 1 });
    const demand = (() => { registerFrameReader(() => 'play'); return momentsOf(open('her_demand').scene).open!; })(); // yielded · resisted · deflected
    expect(expectedOption(open('her_demand'), reg, demand)).toEqual({ key: '0', strength: 1 });
    registerExpectation((_s, _r, m) => (m.sourceId === 'her_demand' ? { key: '2', strength: 3 } : null));
    expect(expectedOption(open('her_demand'), reg, demand)).toEqual({ key: '2', strength: 3 });
    expect(expectedOption(open('third_party'), reg, third)).toEqual({ key: '1', strength: 1 }); // a reader that has no say defers
    resetExpectations();
    registerExpectation(() => ({ key: 'nonsense', strength: 2 })); // a key the moment does not have is ignored
    expect(expectedOption(open('third_party'), reg, third).key).toBe('1');
  });

  it('the additions are never what she expected', () => {
    const s = open('third_party', scene());
    const m = momentsOf(s.scene).open!;
    expect(m.options.map((o) => o.key)).toContain('look');
    expect(['0', '1', '2']).toContain(expectedOption(s, reg, m).key);
  });

  it('the gap table (all 16 pairs)', () => {
    const OPPOSITE = new Set(['yielded|resisted', 'resisted|yielded', 'returned|deflected', 'deflected|returned']);
    let n = 0;
    for (const e of RESPONSE_TYPES) {
      for (const c of RESPONSE_TYPES) {
        n++;
        const want = e === c ? 'matched' : OPPOSITE.has(`${e}|${c}`) ? 'opposite' : 'partial';
        expect(gapOf(e as ResponseType, c as ResponseType), `${e} → ${c}`).toBe(want);
      }
    }
    expect(n).toBe(16);
  });
});

describe('answering', () => {
  it('the escalation verb: a nudge with the foot under the desk, a tug of the lead with a leash, else a look', () => {
    registerFrameReader(() => 'play');
    expect(escalationVerb(scene(), reg)).toBe('look');
    const desk = set(scene(['service']), { person: ANN, field: 'contact', value: 'kneeling_between_legs', with: COMMANDER });
    expect(escalationVerb(desk, reg)).toBe('nudge_with_foot');
    const lead = set(scene(['pet_play']), { person: COMMANDER, field: 'worn', value: 'leash' });
    expect(escalationVerb(lead, reg)).toBe('tug_leash');
    const both = set(set(scene(['pet_play']), { person: COMMANDER, field: 'worn', value: 'leash' }), { person: COMMANDER, field: 'anchor', value: 'at_her_feet' });
    expect(escalationVerb(both, reg)).toBe('tug_leash'); // the engine's order: the lead before the foot
  });

  it('opposite may escalate: about half of the seeds, strength 1; the foot under the desk', () => {
    registerFrameReader(() => 'play');
    const s = open('third_party', set(scene(['service']), { person: ANN, field: 'contact', value: 'kneeling_between_legs', with: COMMANDER }));
    let hit = 0;
    for (let i = 0; i < 400; i++) {
      const a = answer(s, 'look', 100 + i); // deflected against the expected returned
      const e = ofType(a.events, 'moment_answered')[0]!;
      expect(e).toMatchObject({ gap: 'opposite', responseType: 'deflected', key: 'look' });
      if (e.escalated === true) {
        hit++;
        expect(e.verb).toBe('nudge_with_foot');
        expect(ofType(a.events, 'moment_escalated')[0]).toMatchObject({ verb: 'nudge_with_foot', momentId: 'm1' });
      } else expect(ofType(a.events, 'moment_escalated')).toEqual([]);
    }
    expect(hit).toBeGreaterThan(150);
    expect(hit).toBeLessThan(250);
    // a strength of 3 always escalates (0.5 × 3 ≥ 1)
    registerExpectation(() => ({ key: '1', strength: 3 }));
    expect(Array.from({ length: 50 }, (_, i) => answer(s, 'look', 900 + i).events.some((e) => e.type === 'moment_escalated')).every(Boolean)).toBe(true);
  });

  it('matched or partial never draws', () => {
    const s = open('third_party'); // expected: 1 (returned)
    const matched = answer(s, '1', 7);
    expect(matched.rng).toEqual(seedRng(7));
    expect(matched.events[0]).toMatchObject({ gap: 'matched' });
    const partial = answer(s, '2', 7); // resisted against returned
    expect(partial.rng).toEqual(seedRng(7));
    expect(partial.events[0]).toMatchObject({ gap: 'partial' });
  });

  it('closes the moment, remembers the answer, says who was present and who walked in, and moves no axis', () => {
    const medbay = scene(undefined, 'medbay'); // the soldier in the next bed could come in
    medbay.scene!.tone = 'intimate';
    const s = open('third_party', medbay);
    const relationsBefore = structuredClone(s.relations);
    const a = answer(s, '1', 3, 'text', 'ironic');
    expect(momentsOf(a.state.scene).open).toBeUndefined();
    expect(momentsOf(a.state.scene).lastAnswer).toMatchObject({ momentId: 'm1', sourceId: 'third_party', key: '1', type: 'returned', gap: 'matched', via: 'text', tone: 'ironic' });
    expect(a.events[0]).toMatchObject({ type: 'moment_answered', momentId: 'm1', sourceId: 'third_party', unitId: ANN, key: '1', responseType: 'returned', gap: 'matched', via: 'text', tone: 'ironic', visitorId: 'unit_dee', present: [ANN] });
    expect(a.state.relations).toEqual(relationsBefore); // no axis moves
    expect(a.state.scene!.stagingLog!.at(-1)).toMatchObject({ field: 'answer', value: 'third_party', source: 'reading' });
  });

  it('a stale moment id and an unknown key are refused, and change nothing', () => {
    const s = open('her_offer');
    const before = structuredClone(s);
    const rng = new Rng(s.rng);
    expect(() => answerMoment(s, { registries: reg, rng }, 'm9', '0', 'chip')).toThrow('Stale moment answer.');
    expect(() => answerMoment(s, { registries: reg, rng }, 'm1', 'lock', 'chip')).toThrow(/no option/);
    expect(s).toEqual(before);
    expect(() => answerMoment(scene(), { registries: reg, rng }, 'm1', '0', 'chip')).toThrow('Stale moment answer.');
    const r = run(s, reg, { type: 'moment/answer', payload: { momentId: 'm9', key: '0' } });
    expect(errors(r.events)[0]).toMatchObject({ message: 'Stale moment answer.' });
    expect(r.state).toEqual(s);
  });

  it('moment/answer: the chip path, with the chat index it was made at', () => {
    const s = open('her_offer');
    const r = run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '0', at: 6 } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'moment_answered')[0]).toMatchObject({ via: 'chip', key: '0' });
    expect(r.state.scene!.stagingLog!.at(-1)!.at).toBe(6);
    expect(errors(run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '0', at: -1 } }).events)).not.toEqual([]);
    const far = structuredClone(s);
    far.relations[ANN]!.stateId = 'comrade';
    expect(errors(run(far, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '0' } }).events)).not.toEqual([]); // not live
  });

  it('a swipe of the reply before the answer takes the answer back', () => {
    const s = open('her_offer');
    const r = run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '0', at: 6 } });
    const back = run(r.state, reg, { type: 'blocking/rollback', payload: { after: 5 } });
    expect(momentsOf(back.state.scene).open?.id).toBe('m1');
    expect(momentsOf(back.state.scene).lastAnswer).toBeUndefined();
  });
});

describe('the reading answers and labels the open moment (intents/apply)', () => {
  const apply = (s: CampaignState, staging: unknown, readIndex = 4) => run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: {}, readIndex, staging } });

  it('a typed answer maps to an option with its tone; one below 0.55 is dropped', () => {
    const s = open('her_offer');
    const ok = apply(s, { answer: { key: '2', confidence: 0.7, tone: 'ironic' } });
    expect(errors(ok.events)).toEqual([]);
    expect(ofType(ok.events, 'moment_answered')[0]).toMatchObject({ via: 'text', tone: 'ironic', key: '2', gap: 'matched' });
    expect(momentsOf(ok.state.scene).open).toBeUndefined();
    const low = apply(s, { answer: { key: '2', confidence: 0.5 } });
    expect(ofType(low.events, 'moment_answered')).toEqual([]);
    expect(momentsOf(low.state.scene).open?.id).toBe('m1');
    expect(ofType(apply(s, { answer: { key: 'ally', confidence: 0.9 } }).events, 'moment_answered')).toEqual([]); // not an option of this moment
    expect(ofType(apply(s, { answer: 'yes' }).events, 'moment_answered')).toEqual([]);
  });

  it('labels land on the open moment; unusable ones do not, and none are read', () => {
    const s = open('her_offer');
    const ok = apply(s, { labels: ['take it', 'turn it down', '  slowly\nplease  '] });
    expect(momentsOf(ok.state.scene).open?.labels).toEqual(['take it', 'turn it down', 'slowly please']);
    expect(momentsOf(apply(s, { labels: ['one', 'two'] }).state.scene).open?.labels).toBeUndefined();
    expect(momentsOf(apply(s, { labels: ['a', '', 'c'] }).state.scene).open?.labels).toBeUndefined();
    expect(momentsOf(apply(s, { labels: ['x'.repeat(300), 'b', 'c'] }).state.scene).open?.labels?.[0]).toHaveLength(40);
    // a label never changes what the options are
    const o = momentsOf(ok.state.scene).open!;
    expect(o.options).toEqual(momentsOf(s.scene).open!.options);
  });

  it('a label that says "obey" on a resisted option changes nothing in the gap', () => {
    const s = open('her_offer');
    const labelled = apply(s, { labels: ['obey', 'obey', 'obey'] }).state;
    const a = run(labelled, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '1', at: 5 } });
    const b = run(s, reg, { type: 'moment/answer', payload: { momentId: 'm1', key: '1', at: 5 } });
    expect(ofType(a.events, 'moment_answered')[0]).toEqual(ofType(b.events, 'moment_answered')[0]);
  });

  it('an unanswered moment lapses after two readings (no directive), and one that was answered does not', () => {
    let s = open('her_offer');
    const first = apply(s, {});
    expect(ofType(first.events, 'moment_lapsed')).toEqual([]);
    expect(momentsOf(first.state.scene).open?.passes).toBe(1);
    const second = apply(first.state, {});
    expect(ofType(second.events, 'moment_lapsed')[0]).toMatchObject({ momentId: 'm1', sourceId: 'her_offer', unitId: ANN });
    expect(momentsOf(second.state.scene).open).toBeUndefined();
    expect(momentsOf(second.state.scene).lastAnswer).toBeUndefined();
    expect(momentDirective(ofType(second.events, 'moment_lapsed')[0]!, second.state, reg)).toBeNull();
    // the lapse is on the log, so a swipe of the reply that caused it brings the moment back
    expect(momentsOf(run(second.state, reg, { type: 'blocking/rollback', payload: { after: 3 } }).state.scene).open?.id).toBe('m1');
    s = structuredClone(first.state);
    expect(lapseMoments(structuredClone(scene()))).toEqual([]); // nothing open
  });
});

describe('the directive', () => {
  const pronoun = /\b(he|him|his|himself)\b/i;

  it('lasts one reply, is at most three sentences and names the exposing element', () => {
    const s = set(scene(['pet_play']), { person: COMMANDER, field: 'worn', value: 'leash' });
    const fired = structuredClone(s);
    const events = fireMoment(fired, { registries: reg }, 'third_party', ANN);
    const d = momentDirective(events[0]!, fired, reg)!;
    expect(d.id).toBe('moment:third_party');
    expect(d.expiresAfter).toBe('next_reply');
    expect(d.text).toContain(`${String(reg.blockingItems.get('leash')!.label)} may give the commander away.`);
    expect(d.text.startsWith(`A moment of tension for ${String(fired.squad.find((u) => u.id === ANN)!.displayName)}: `)).toBe(true); // names whose moment it is (review I5)
    expect(d.text).not.toMatch(pronoun);
    expect(d.text).not.toContain('AUTHOR TO WRITE');
    expect(d.text.split(/(?<=\.)\s/).length).toBeLessThanOrEqual(3); // the moment, the visitor the engine chose, the exposing element
    // answered: what was chosen, how she takes it
    const a = answer(fired, '1', 4);
    const ad = momentDirective(a.events[0]!, a.state, reg)!;
    expect(ad.id).toBe('moment:third_party');
    expect(ad.text).toBe(`The commander chose to as is. ${String(fired.squad.find((u) => u.id === ANN)!.displayName)} takes it as what she expected; she answers in character.`);
    expect(ad.text).not.toMatch(pronoun);
    // opposite and escalated: the verb's hint follows
    registerFrameReader(() => 'play');
    const foot = open('third_party', set(scene(['service']), { person: ANN, field: 'contact', value: 'kneeling_between_legs', with: COMMANDER }));
    let escalated: ReturnType<typeof answer> | undefined;
    for (let i = 1; i < 40 && !escalated; i++) {
      const t = answer(foot, 'look', i);
      if (t.events.some((e) => e.type === 'moment_escalated')) escalated = t;
    }
    const ed = momentDirective(escalated!.events[0]!, escalated!.state, reg)!;
    expect(ed.text).toContain('the opposite of what she expected');
    expect(ed.text.endsWith(String(reg.escalationVerbs.get('nudge_with_foot')!.promptHint))).toBe(true);
    expect(ed.text).toContain('ask her with a look');
    expect(ed.text).not.toMatch(pronoun);
  });

  it('is set from the events, dropped by the next reply, and cleared with the scene', () => {
    const b = new ContextBuilder();
    const s = scene();
    const fired = structuredClone(s);
    const events = fireMoment(fired, { registries: reg }, 'her_offer', ANN);
    expect(applyMomentDirectives(b, events, fired, reg)).toBe(true);
    expect(b.build(fired, 4000).directives).toContain('A moment of tension');
    b.onReplyReceived();
    expect(b.build(fired, 4000).directives).not.toContain('A moment of tension');
    applyMomentDirectives(b, events, fired, reg);
    clearMomentDirectives(b);
    expect(b.build(fired, 4000).directives).not.toContain('A moment of tension');
    expect(applyMomentDirectives(b, [{ type: 'scene_exchange' }], fired, reg)).toBe(false);
    expect(applyMomentDirectives(b, events, null, reg)).toBe(false);
  });
});
