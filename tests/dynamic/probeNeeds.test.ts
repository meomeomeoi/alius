import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/memory';
import { pickAxis, probePool } from '../../src/engine/dynamic/probes';
import { applyDynamicIntent, dynamicIntentInput } from '../../src/engine/dynamic/intents';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { DrawnBy, MannerAxis, Practice, ProfileStyle } from '../../src/engine/dynamic/types';
import { validateIntents, type EventIntent } from '../../src/engine/relations/intents';
import { DYNAMIC_INTENT_TYPES, EVENT_TYPES } from '../../src/engine/relations/vocab';
import { buildCampaign, type SetupResult } from '../../src/engine/setup';
import type { CampaignState } from '../../src/engine/state/types';
import { campaign, errors, loadCore, run, unitSetup } from '../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
interface Over { style?: ProfileStyle; manner?: Partial<Record<MannerAxis, number>> | null; drawnBy?: DrawnBy[]; feet?: 'enjoys' | 'craves' | 'indifferent' | null; secondary?: ProfileStyle }

/** Ann with a practice (restraint), the given style and manner, and (optionally) an opinion of feet. */
function world(over: Over = {}): CampaignState {
  const s = campaign(reg, 3);
  const practice: Practice = {
    categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: over.style ?? 'cold', ...(over.secondary !== undefined ? { secondary: over.secondary } : {}) },
    audience: 'indifferent', inclination: 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
    ...(over.manner === null ? {} : { manner: { ...ZERO, ...(over.manner ?? {}) }, drawnBy: over.drawnBy ?? ['reaction'] }),
  };
  unitOf(s, ANN).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known', practice };
  if (over.feet !== undefined && over.feet !== null) unitOf(s, ANN).expectations = { worship: { feet: { attitude: over.feet } } };
  s.content = { enabled: ['restraint', 'worship'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.relations[ANN].dynamic = blankDynamic(s.day);
  return s;
}
const ids = (s: CampaignState, tier: 1 | 2 = 2, recent: string[] = []): string[] => probePool(s, reg, ANN, tier, recent).map((a) => a.id);
const count = (list: string[], id: string): number => list.filter((x) => x === id).length;

describe('a woman who matches nothing keeps the pool she had (spec 12.1)', () => {
  const OLD = JSON.parse(readFileSync(new URL('../fixtures/probeAxisOldPicks.json', import.meta.url), 'utf8')) as Record<string, string[]>;
  const CASES: Array<[tier: 1 | 2, recent: string[]]> = [[1, []], [2, []], [2, ['touch', 'claim', 'space']]];

  for (const [label, over] of [['no manner at all, even a regal one', { manner: null, style: 'regal' }], ['a manner but nothing that matches (cold, steady)', {}]] as Array<[string, Over]>) {
    it(`${label}: the picks over 200 seeds equal the picks recorded before the new rows`, () => {
      for (const [tier, recent] of CASES) {
        const picks: string[] = [];
        for (let seed = 1; seed <= 200; seed++) {
          const s = world(over);
          s.dynamic!.salt = seed * 7919;
          s.day = seed;
          picks.push(pickAxis(s, reg, ANN, tier, recent).id);
        }
        expect(picks, `${tier}:${recent.join(',')}`).toEqual(OLD[`${tier}:${recent.join(',')}`]);
      }
    });
  }

  it('the pool itself is the old rows, once each, in registry order', () => {
    const old = ['space', 'small_order', 'correction', 'decision', 'waiting', 'touch', 'public_tone', 'claim', 'permission', 'reversal'];
    expect(ids(world({ manner: null, style: 'regal' }))).toEqual(old);
    expect(ids(world())).toEqual(old);
  });
});

describe('a woman with a manner who matches gets the new rows', () => {
  it('a regal woman: each of her rows takes two places, the others one', () => {
    const pool = ids(world({ style: 'regal' }));
    for (const id of ['admiration', 'deference', 'credit', 'gaze', 'corrected_praise', 'hypothetical']) expect(count(pool, id), id).toBe(2);
    expect(count(pool, 'feet_in_lap')).toBe(0); // no opinion of feet
    for (const id of ['space', 'small_order', 'touch']) expect(count(pool, id), id).toBe(1);
  });

  it('the style that counts is the one she has now: a turned style is read through the overlay', () => {
    const s = world({ style: 'cold' });
    expect(count(ids(s), 'corrected_praise')).toBe(0);
    unitOf(s, ANN).development = { ...(unitOf(s, ANN).development ?? {}), practice: { primary: 'regal' } } as never;
    expect(count(ids(s), 'corrected_praise')).toBe(2);
  });

  it('a tier-1 band offers only the tier-1 rows (deference, credit, corrected_praise, hypothetical; admiration, gaze and feet_in_lap are tier 2)', () => {
    const pool = ids(world({ style: 'regal', feet: 'craves' }), 1);
    for (const id of ['deference', 'credit', 'corrected_praise', 'hypothetical']) expect(pool, id).toContain(id);
    for (const id of ['admiration', 'gaze', 'feet_in_lap']) expect(pool, id).not.toContain(id);
  });

  it('admiration: power draws her and she is not warm, or regal; a warm woman drawn by power gets none', () => {
    expect(count(ids(world({ style: 'cold', drawnBy: ['power'], manner: { warmth: -1 } })), 'admiration')).toBe(1); // matched by the second alternative, not by style
    expect(count(ids(world({ style: 'cold', drawnBy: ['power'], manner: { warmth: 0 } })), 'admiration')).toBe(1);
    expect(count(ids(world({ style: 'cold', drawnBy: ['power'], manner: { warmth: 1 } })), 'admiration')).toBe(0);
    expect(count(ids(world({ style: 'cold', drawnBy: ['pain'], manner: { warmth: -2 } })), 'admiration')).toBe(0);
    expect(count(ids(world({ style: 'cold', secondary: 'regal', drawnBy: ['power'], manner: { warmth: 2 } })), 'admiration')).toBe(0); // only her primary style counts
  });

  it('deference: ritual and possessive match through their style, two places each; credit: drill; gaze: playful', () => {
    expect(count(ids(world({ style: 'ritual' })), 'deference')).toBe(2);
    expect(count(ids(world({ style: 'possessive' })), 'deference')).toBe(2);
    expect(count(ids(world({ style: 'drill' })), 'credit')).toBe(2);
    expect(count(ids(world({ style: 'playful' })), 'gaze')).toBe(2);
    expect(count(ids(world({ style: 'drill' })), 'deference')).toBe(0);
  });

  it('hypothetical: regal or playful, or a curious woman (curiosity +1 or more) of any style, who then takes one place', () => {
    expect(count(ids(world({ style: 'cold', manner: { curiosity: 1 } }), 1), 'hypothetical')).toBe(1);
    expect(count(ids(world({ style: 'cold', manner: { curiosity: 2 } }), 1), 'hypothetical')).toBe(1);
    expect(count(ids(world({ style: 'cold', manner: { curiosity: 0 } }), 1), 'hypothetical')).toBe(0);
    expect(count(ids(world({ style: 'playful', manner: { curiosity: 2 } }), 1), 'hypothetical')).toBe(2);
  });

  it('feet_in_lap needs her opinion of feet at enjoys or craves (her expectation profile, not the practice categories)', () => {
    expect(count(ids(world({ feet: 'enjoys' })), 'feet_in_lap')).toBe(1);
    expect(count(ids(world({ feet: 'craves' })), 'feet_in_lap')).toBe(1);
    expect(count(ids(world({ feet: 'indifferent' })), 'feet_in_lap')).toBe(0);
    expect(count(ids(world({ feet: null })), 'feet_in_lap')).toBe(0);
    expect(count(ids(world({ feet: 'enjoys', manner: null })), 'feet_in_lap')).toBe(0); // no manner: not at all
    const closed = world({ feet: 'craves' });
    closed.content = { enabled: ['restraint'] }; // the worship category is off: the entry reads as nothing
    expect(count(ids(closed), 'feet_in_lap')).toBe(0);
  });

  it('the mood of the day does not move the pool (the bounds read what she has become, not today)', () => {
    const s = world({ style: 'cold', manner: { curiosity: 1 } });
    const before = ids(s, 1);
    s.day += 1;
    expect(ids(s, 1)).toEqual(before);
  });

  it('a recent row is left out, both of its places together', () => {
    const s = world({ style: 'regal' });
    expect(count(ids(s, 1), 'deference')).toBe(2);
    expect(ids(s, 1, ['deference'])).not.toContain('deference');
  });

  it('a pick over 200 days is a pool row and the new rows do come up for her', () => {
    const picks = new Set<string>();
    for (let day = 1; day <= 200; day++) {
      const s = world({ style: 'regal' });
      s.day = day;
      picks.add(pickAxis(s, reg, ANN, 2, []).id);
    }
    for (const id of ['deference', 'credit', 'corrected_praise', 'hypothetical', 'admiration', 'gaze']) expect(picks.has(id), id).toBe(true);
  });
});

describe('the head start builds the same pool (spec 12.1)', () => {
  const bond = (style: ProfileStyle, withManner: boolean) => ({
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: style }, audience: 'indifferent', inclination: 'eager', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
      ...(withManner ? { manner: { ...ZERO }, drawnBy: ['reaction'] } : {}),
    },
  }) as never;
  const recentOf = (style: ProfileStyle, withManner: boolean, seed: number): string[] => {
    const r: SetupResult = {
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: [unitSetup('Ann', { bond: bond(style, withManner) })], content: { enabled: ['restraint'] },
      dynamic: { holders: 'any', pace: 'normal', frequency: 'normal', units: {} },
      headStart: { days: 30, newArrivals: [], dynamicUnderway: true },
    };
    const b = buildCampaign(r, reg, { desireBondDefects: false, seed });
    if (!b.ok) throw new Error(b.errors.join('; '));
    return dynamicOf(b.state, ANN)?.recent ?? [];
  };
  const NEW = ['admiration', 'deference', 'credit', 'gaze', 'corrected_praise', 'feet_in_lap', 'hypothetical'];

  it('a regal woman with a manner is probed on the new rows in the weeks behind her; one with no manner never is', () => {
    const withManner = new Set<string>();
    const without = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) {
      recentOf('regal', true, seed).forEach((a) => withManner.add(a));
      recentOf('regal', false, seed).forEach((a) => without.add(a));
    }
    expect([...withManner].some((a) => NEW.includes(a))).toBe(true);
    expect([...without].filter((a) => NEW.includes(a))).toEqual([]);
  });
});

describe('`hypothetical_answered { unitId, answer }`', () => {
  const pendingHypothetical = (): CampaignState => {
    const s = world({ style: 'regal' });
    s.relations[ANN].dynamic!.probes = { pending: { axis: 'hypothetical', tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 };
    s.dynamic!.queue = [ANN];
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };
  const ev = (over: Partial<EventIntent> = {}): EventIntent => ({ type: 'hypothetical_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said so', confidence: 1, summary: 'said it would kneel', ...over } as unknown as EventIntent);

  it('is a model-reportable dynamic type with a row of zeros and a journal phrase', () => {
    expect(EVENT_TYPES as readonly string[]).toContain('hypothetical_answered');
    expect(DYNAMIC_INTENT_TYPES).toContain('hypothetical_answered');
    const row = reg.eventDeltas.get('hypothetical_answered') as unknown as { cause: string; journal: string; rows: Record<string, unknown> };
    expect(typeof row.cause).toBe('string');
    expect(row.journal.length).toBeGreaterThan(0);
    for (const sev of ['minor', 'moderate', 'major', 'extreme']) expect(row.rows[sev]).toEqual({});
  });

  it('is offered only while a hypothetical probe is pending for a unit in the scene', () => {
    const s = pendingHypothetical();
    const offer = dynamicIntentInput(s, reg, [ANN], 'scene').dynamic!;
    expect(offer.types).toContain('hypothetical_answered');
    expect(offer.hypothetical).toEqual([ANN]);
    const other = structuredClone(s);
    other.relations[ANN].dynamic!.probes.pending!.axis = 'space';
    const o = dynamicIntentInput(other, reg, [ANN], 'scene').dynamic!;
    expect(o.types).not.toContain('hypothetical_answered');
    expect(o.hypothetical ?? []).toEqual([]);
    const none = structuredClone(s);
    delete none.relations[ANN].dynamic!.probes.pending;
    expect(dynamicIntentInput(none, reg, [ANN], 'scene').dynamic?.types ?? []).not.toContain('hypothetical_answered');
  });

  it('validateIntents keeps it with the offer and drops it without, and a paraphrase that gives the commander a pronoun', () => {
    const s = pendingHypothetical();
    const offer = dynamicIntentInput(s, reg, [ANN], 'scene');
    const raw = (summary: string) => ({ events: [{ type: 'hypothetical_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, summary }] });
    const base = { participants: [ANN], squad: [{ id: ANN }] };
    const kept = validateIntents(raw('would kneel if asked'), { ...base, ...offer }).events;
    expect(kept).toHaveLength(1);
    expect(kept[0].summary).toBe('would kneel if asked');
    expect(validateIntents(raw('he would kneel'), { ...base, ...offer }).events).toEqual([]);
    expect(validateIntents(raw('would kneel'), base).events).toEqual([]);
    expect(validateIntents(raw('   '), { ...base, ...offer }).events).toEqual([]);
    const spaceOffer = structuredClone(offer);
    spaceOffer.dynamic!.hypothetical = [];
    expect(validateIntents(raw('would kneel'), { ...base, ...spaceOffer }).events).toEqual([]);
  });

  it('writes her fact through the rule: hers alone, importance 1, no spread, the commander is not told, no pronoun', () => {
    const s = pendingHypothetical();
    const before = s.memory.facts.length;
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'hypothetical_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said so', confidence: 1, summary: 'said it would kneel' }] } } });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.map((e) => e.type)).toContain('hypothetical_answered');
    const fact = r.state.memory.facts.slice(before).find((f) => f.tags.includes('hypothetical'));
    expect(fact).toBeDefined();
    expect(fact!.about).toContain(ANN);
    expect(fact!.knownBy).toEqual([ANN]);
    expect(fact!.importance).toBe(1);
    expect(fact!.text).toContain('said it would kneel');
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
    const rule = [...reg.memoryRules.values()].find((m) => m.event === 'hypothetical_answered')!;
    expect(rule.spread).toBe('none');
    expect(rule.audience).toBe('her');
    expect(rule.importance).toBe(1);
  });

  it('a report with no hypothetical pending writes no fact', () => {
    const s = pendingHypothetical();
    s.relations[ANN].dynamic!.probes.pending!.axis = 'space';
    const before = s.memory.facts.length;
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'hypothetical_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'said so', confidence: 1, summary: 'said it would kneel' }] } } });
    expect(r.state.memory.facts.slice(before).some((f) => f.tags.includes('hypothetical'))).toBe(false);
  });

  it('applyDynamicIntent: an answer with no hypothetical pending does nothing', () => {
    const s = pendingHypothetical();
    delete s.relations[ANN].dynamic!.probes.pending;
    s.relations[ANN].dynamic!.probes.lastDay = s.day - 5;
    expect(applyDynamicIntent(s, { registries: reg }, ANN, ev())).toEqual([]);
    const space = pendingHypothetical();
    space.relations[ANN].dynamic!.probes.pending!.axis = 'space';
    expect(applyDynamicIntent(space, { registries: reg }, ANN, ev())).toEqual([]);
  });

  it('applyDynamicIntent: a pending hypothetical yields the engine event with her unit and the answer', () => {
    const s = pendingHypothetical();
    const events = applyDynamicIntent(s, { registries: reg }, ANN, ev());
    expect(events).toEqual([{ type: 'hypothetical_answered', unitId: ANN, answer: 'said it would kneel' }]);
  });

  it('applyDynamicIntent: the answer still counts when the probe was closed by the same report (probe_answered came first)', () => {
    const s = pendingHypothetical();
    delete s.relations[ANN].dynamic!.probes.pending; // closed by `answerProbe` earlier in the batch
    s.relations[ANN].dynamic!.recent = ['hypothetical'];
    s.relations[ANN].dynamic!.probes.answers = ['yielded'];
    expect(applyDynamicIntent(s, { registries: reg }, ANN, ev())).toEqual([{ type: 'hypothetical_answered', unitId: ANN, answer: 'said it would kneel' }]);
  });
});
