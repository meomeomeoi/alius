import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/memory';
import '../../../src/engine/actions/scene';
import { lifeIntentInput } from '../../../src/engine/life/intents';
import { keepFirst } from '../../../src/engine/life/meetings';
import { newLife } from '../../../src/engine/life/state';
import { validateIntents } from '../../../src/engine/relations/intents';
import { FIRST_KINDS } from '../../../src/engine/relations/vocab';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const [ANN, BEA] = ['unit_ann', 'unit_bea'];

/** Day 40, life normal, a private scene with Ann is open. */
function world(participants = [ANN]): CampaignState {
  const s = campaign(reg, 4);
  s.day = 40;
  s.world.clocks = [];
  s.settings.lifeEvents = 'normal';
  s.life = newLife(7);
  const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'workshop', participants, origin: 'event', startIndex: 0 } });
  expect(errors(started.events)).toEqual([]);
  return started.state;
}
const report = (kind: unknown) => ({ type: 'first_moment', actor: ANN, targets: [], severity: 'minor', evidence: 'as the lines show', confidence: 0.9, kind });
const apply = (s: CampaignState, ...kinds: unknown[]) => run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: kinds.map(report) } } });
const firstFacts = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('first'));

describe('each kind once per pair', () => {
  it('the first laugh is kept (Affinity +2, a fact, the event) and a second one is ignored', () => {
    const s = world();
    s.relations[ANN].affinity = 10;
    const first = apply(s, 'laughed');
    expect(errors(first.events)).toEqual([]);
    expect(ofType(first.events, 'first_moment_kept')).toEqual([{ type: 'first_moment_kept', unitId: ANN, kind: 'laughed' }]);
    expect(first.state.relations[ANN].affinity).toBe(12);
    expect(first.state.life!.units[ANN].firsts).toEqual(['laughed']);
    expect(firstFacts(first.state)).toHaveLength(1);
    const again = apply(first.state, 'laughed');
    expect(ofType(again.events, 'first_moment_kept')).toEqual([]);
    expect(ofType(again.events, 'relation_changed')).toEqual([]);
    expect(again.state.relations[ANN].affinity).toBe(12);
    expect(firstFacts(again.state)).toHaveLength(1);
    expect(again.state.life!.units[ANN].firsts).toEqual(['laughed']);
    expect(again.state.relations[ANN].history.filter((h) => h.type === 'first_moment')).toHaveLength(1); // no second journal line either
  });

  it('two kinds in one reading are both kept, one repeated in the same reading only once', () => {
    const s = world();
    const out = apply(s, 'cried', 'cried', 'taught');
    expect(ofType(out.events, 'first_moment_kept').map((e) => e.kind)).toEqual(['cried', 'taught']);
    expect(out.state.life!.units[ANN].firsts).toEqual(['cried', 'taught']);
  });

  it('keepFirst itself refuses a repeat, an unknown kind and a woman who is gone', () => {
    const s = world();
    const ctx = ctxOf(s, reg);
    expect(keepFirst(s, ctx, ANN, 'laughed').map((e) => e.type)).toContain('first_moment_kept');
    expect(keepFirst(s, ctx, ANN, 'laughed')).toEqual([]);
    expect(keepFirst(s, ctx, ANN, 'danced')).toEqual([]);
    s.squad.find((u) => u.id === BEA)!.status = 'dead';
    expect(keepFirst(s, ctx, BEA, 'cried')).toEqual([]);
    expect(s.life!.units[BEA]?.firsts).toBeUndefined();
  });
});

describe('what is offered', () => {
  it('is offered only in a private scene with a named woman', () => {
    const s = world();
    expect(lifeIntentInput(s, reg, [ANN], s.scene!, 'scene').life).toMatchObject({ firsts: true, firstKinds: [...FIRST_KINDS] });
    expect(lifeIntentInput(s, reg, [ANN], null, 'dm')).toEqual({});
    const group = world([ANN, BEA]);
    expect(lifeIntentInput(group, reg, [ANN, BEA], group.scene!, 'scene')).toEqual({});
  });

  it('lists only the kinds the pair has not had, and nothing once they all have', () => {
    const s = world();
    s.life!.units[ANN] = { last: {}, firsts: ['laughed', 'cried'] };
    const offer = lifeIntentInput(s, reg, [ANN], s.scene!, 'scene').life!;
    expect(offer.firsts).toBe(true);
    expect(offer.firstKinds).toEqual(['fell_asleep_beside', 'told_her_past', 'taught', 'asked_about_commander']);
    s.life!.units[ANN].firsts = [...FIRST_KINDS];
    expect(lifeIntentInput(s, reg, [ANN], s.scene!, 'scene')).toEqual({});
  });

  it('is her own list: another woman has her own firsts', () => {
    const s = world();
    s.life!.units[BEA] = { last: {}, firsts: [...FIRST_KINDS] };
    expect(lifeIntentInput(s, reg, [ANN], s.scene!, 'scene').life!.firstKinds).toHaveLength(FIRST_KINDS.length);
  });

  it('validation drops a kind that was not offered, an unknown kind and a missing one', () => {
    const base = { participants: [ANN], squad: world().squad, factTextMax: 200 };
    const life = { news: [], hobbies: [], topics: [], jokes: [], firsts: true, firstKinds: ['cried', 'taught'] };
    const kinds = (kind: unknown) => validateIntents({ events: [report(kind)] }, { ...base, life }).events.map((e) => e.kind);
    expect(kinds('cried')).toEqual(['cried']);
    expect(kinds('laughed')).toEqual([]); // a kind she has had already
    expect(kinds('danced')).toEqual([]);
    expect(kinds(undefined)).toEqual([]);
    const without = { ...life, firsts: false, firstKinds: [] };
    expect(validateIntents({ events: [report('cried')] }, { ...base, life: without }).events).toEqual([]);
  });

  it('an unknown kind is dropped end to end', () => {
    const s = world();
    const out = apply(s, 'danced');
    expect(errors(out.events)).toEqual([]);
    expect(ofType(out.events, 'first_moment_kept')).toEqual([]);
    expect(out.state.life!.units[ANN]?.firsts).toBeUndefined();
    expect(out.state.relations[ANN].affinity).toBe(s.relations[ANN].affinity);
  });
});

describe('what is remembered', () => {
  const importance: Record<string, number> = { cried: 3, told_her_past: 3, fell_asleep_beside: 2, laughed: 2, taught: 2, asked_about_commander: 2 };

  for (const kind of FIRST_KINDS) {
    it(`${kind} writes its rule's fact`, () => {
      const s = world();
      const nextId = s.memory.nextId;
      const out = apply(s, kind);
      expect(errors(out.events)).toEqual([]);
      const facts = firstFacts(out.state);
      expect(facts).toHaveLength(1);
      expect(facts[0]).toMatchObject({ about: [ANN], knownBy: [ANN], importance: importance[kind] });
      expect(facts[0].tags).toEqual(expect.arrayContaining(['first', kind]));
      expect(facts[0].text).toContain('Ann');
      expect(facts[0].text).toContain('for the first time');
      expect(facts[0].text).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(facts[0].text).not.toMatch(/\{/);
      expect(facts[0].hiddenFromCommander).toBeUndefined();
      expect(out.state.memory.nextId).toBe(nextId); // the facts a rule writes take their own `fr` ids
      expect(facts[0].id).toMatch(/^fr/);
    });
  }

  it('the journal phrase is the row\'s', () => {
    expect(String(reg.eventDeltas.get('first_moment')!.journal)).toBe('a first between her and the commander');
  });
});
