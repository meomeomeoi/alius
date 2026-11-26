import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import { CUE_KINDS, INTERACTIONS, LIVE_KINDS, RESPONSE_TYPES, STAGES, type MomentSourceEntry, type PhysicsEntry } from '../../src/engine/blocking/types';
import { loadCore } from '../helpers/world';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});

const Y = 'yielded', R = 'resisted', T = 'returned', D = 'deflected';
/** blocking.md §10 (generic words and types, in option order), the scope and the live kinds of the plan's table. */
const TABLE: Record<string, { scope: 'any' | 'dynamic'; frame: Array<[string, string]>; live: string[] }> = {
  her_demand: { scope: 'dynamic', frame: [['obey', Y], ['resist', R], ['bargain', D]], live: ['external'] },
  her_offer: { scope: 'any', frame: [['accept', Y], ['decline', R], ['accept carefully', T]], live: ['extracted'] },
  her_silence: { scope: 'any', frame: [['guess by action', T], ['ask', D], ['wait', Y]], live: ['extracted'] },
  her_question: { scope: 'any', frame: [['honest', T], ['what she wants to hear', Y], ['silent', R]], live: ['extracted'] },
  her_weakness: { scope: 'any', frame: [['care', T], ['keep the role', Y], ['withdraw', R]], live: ['weakness', 'extracted'] },
  her_mood_shift: { scope: 'any', frame: [['adapt', Y], ['ask', T], ['ignore', D]], live: ['mood_jump'] },
  her_test: { scope: 'dynamic', frame: [['test option 1', Y], ['test option 2', R], ['test option 3', D]], live: ['external'] },
  her_absence: { scope: 'any', frame: [['wait', Y], ['call her', T], ['free yourself', R]], live: ['asleep', 'blocking'] },
  her_affection: { scope: 'any', frame: [['answer', T], ['stay in role', Y], ['pull away', R]], live: ['extracted'] },
  her_jealousy: { scope: 'any', frame: [['reassure', Y], ['explain', T], ['deflect', D]], live: ['extracted'] },
  endurance: { scope: 'dynamic', frame: [['endure', Y], ['signal', D], ['break', R]], live: ['physics_warning'] },
  permission: { scope: 'dynamic', frame: [['ask', Y], ['take', R], ['wait', D]], live: ['external'] },
  own_slip: { scope: 'dynamic', frame: [['confess', Y], ['hide', R], ['pretend', D]], live: ['physics_slip', 'extracted'] },
  own_want: { scope: 'any', frame: [['ask', T], ['take', R], ['stay quiet', Y]], live: ['extracted'] },
  duty_call: { scope: 'any', frame: [['answer', R], ['ignore', Y], ['ask her', T]], live: ['blocking', 'extracted'] },
  third_party: { scope: 'any', frame: [['hide', Y], ['as is', T], ['show yourself', R]], live: ['visitor'] },
  remote: { scope: 'any', frame: [['keep steady', Y], ['slip', D], ['cut the line', R]], live: ['blocking'] },
  sensory: { scope: 'any', frame: [['wait', Y], ['speak', D], ['reach out', T]], live: ['obscured'] },
  time: { scope: 'any', frame: [['wait', Y], ['call', D], ['free yourself', R]], live: ['blocking', 'extracted'] },
  alarm: { scope: 'any', frame: [['stay', Y], ['ask release', D], ['go', R]], live: ['alarm'] },
  object_at_hand: { scope: 'any', frame: [['leave it', Y], ['take it', R], ['tell her', T]], live: ['blocking', 'extracted'] },
  summons: { scope: 'dynamic', frame: [['come at once', Y], ['delay', R], ['ask a reprieve', D]], live: ['external'] },
  memory_surfaces: { scope: 'any', frame: [['own it', Y], ['deny', R], ['turn it', T]], live: ['keeps_fact', 'extracted'] },
  rule_collision: { scope: 'dynamic', frame: [['her rule', Y], ['the order', R], ['ask her', D]], live: ['external'] },
  compromat_hint: { scope: 'dynamic', frame: [['ask', D], ['ignore', R], ['bargain', T]], live: ['external'] },
  ritual_due: { scope: 'dynamic', frame: [['keep it', Y], ['skip', R], ['ask to move it', D]], live: ['external'] },
};

const sources = () => [...reg.momentSources.values()] as unknown as MomentSourceEntry[];

describe('momentSources (P15a, blocking.md §10)', () => {
  it('26 sources with the table\'s frames and types', () => {
    expect(sources()).toHaveLength(26);
    expect(sources().map((s) => s.id).sort()).toEqual(Object.keys(TABLE).sort());
    for (const s of sources()) {
      expect(s.frame.map((o) => [o.generic, o.type]), s.id).toEqual(TABLE[s.id]!.frame);
      for (const o of s.frame) {
        expect(RESPONSE_TYPES, s.id).toContain(o.type);
        expect(o.generic.length, s.id).toBeLessThanOrEqual(40);
      }
    }
  });

  it('the nine power-laden sources are dynamic, the rest open to every close relation', () => {
    const dynamic = sources().filter((s) => s.scope === 'dynamic').map((s) => s.id).sort();
    expect(dynamic).toEqual(['compromat_hint', 'endurance', 'her_demand', 'her_test', 'own_slip', 'permission', 'ritual_due', 'rule_collision', 'summons']);
    for (const s of sources()) expect(s.scope, s.id).toBe(TABLE[s.id]!.scope);
  });

  it('the five general meeting sources', () => {
    expect(sources().filter((s) => s.generalMeeting === true).map((s) => s.id).sort()).toEqual(['her_affection', 'her_mood_shift', 'her_question', 'her_weakness', 'memory_surfaces']);
  });

  it('every source has a live kind from the closed list, as the plan\'s table says', () => {
    for (const s of sources()) {
      expect(s.live.length, s.id).toBeGreaterThan(0);
      for (const k of s.live) expect(LIVE_KINDS, s.id).toContain(k);
      expect([...s.live].sort(), s.id).toEqual([...TABLE[s.id]!.live].sort());
    }
  });

  it('`remember` lists the options the memory rules use (R15), for the analyze text only', () => {
    const rem = (id: string) => (reg.momentSources.get(id) as unknown as MomentSourceEntry).remember?.map((r) => [r.option, r.importance]);
    expect(rem('her_question')).toEqual([[1, 2]]);
    expect(rem('own_slip')).toEqual([[0, 3], [1, 3]]);
    expect(rem('third_party')).toEqual([[1, 3], [2, 3]]); // every answer that is not "hide"
    expect(rem('her_weakness')).toEqual([[0, 3], [1, 3], [2, 3]]);
    expect(rem('memory_surfaces')).toEqual([[0, 2], [1, 2], [2, 2]]);
    for (const s of sources()) for (const r of s.remember ?? []) expect([0, 1, 2]).toContain(r.option);
  });
});

describe('contactPhysics (P15a)', () => {
  const physics = () => [...reg.contactPhysics.values()] as unknown as PhysicsEntry[];
  it('seven physics with the TUNING segment lengths (§16.14)', () => {
    const by = Object.fromEntries(physics().map((p) => [p.id, p]));
    expect(Object.keys(by).sort()).toEqual(['breath', 'gulp', 'her_activity', 'jaw', 'saturation', 'tongue_work', 'weight']);
    expect(Object.fromEntries(physics().map((p) => [p.id, p.segmentSeconds]))).toEqual({ breath: 20, weight: 30, saturation: 30, tongue_work: 40, her_activity: 30, jaw: 30, gulp: 20 });
    expect(Object.fromEntries(physics().map((p) => [p.id, p.interaction]))).toEqual({ breath: 'timing', weight: 'hold', saturation: 'decision', tongue_work: 'order', her_activity: 'passive', jaw: 'gesture', gulp: 'timing' });
    for (const p of physics()) expect(INTERACTIONS).toContain(p.interaction);
  });

  it('skill is on for breath, weight, saturation, jaw and gulp; gulp is tagged watersports; a gulp spill chains to tongue work at dirt 60', () => {
    expect(physics().filter((p) => p.skill).map((p) => p.id).sort()).toEqual(['breath', 'gulp', 'jaw', 'saturation', 'weight']);
    expect(physics().filter((p) => (p.contentTags ?? []).length > 0).map((p) => [p.id, p.contentTags])).toEqual([['gulp', ['watersports']]]);
    expect(physics().find((p) => p.id === 'gulp')!.chains).toEqual([{ on: 'slip', to: 'tongue_work', start: 60 }]);
    expect(physics().find((p) => p.id === 'tongue_work')!.gauge).toEqual({ kind: 'dirt', start: 100 });
  });
});

describe('physicsCues (P15a)', () => {
  it('one row per cue kind with 3 to 5 lines each (P10e-e R32: a row of one physics holds as many as its prototype has, gulp\'s `surge` one)', () => {
    const rows = [...reg.physicsCues.values()];
    expect(rows.map((r) => r.kind).sort()).toEqual([...CUE_KINDS].sort());
    for (const r of rows) {
      expect((r.lines as string[]).length, String(r.id)).toBeGreaterThanOrEqual(r.kind === 'surge' ? 1 : 3);
      expect((r.lines as string[]).length, String(r.id)).toBeLessThanOrEqual(5);
    }
  });
});

describe('stimulusKinds (P15a §16.8)', () => {
  it('twelve kinds, no intimate ones, each with a word per stage and for the week apart', () => {
    const ids = [...reg.stimulusKinds.keys()].sort();
    expect(ids).toEqual(['scent_armpit', 'scent_body', 'scent_feet', 'scent_worn', 'sweat_exertion', 'sweat_fear', 'sweat_heat', 'sweat_stale', 'taste_dirt', 'taste_polish', 'taste_salt', 'taste_skin']);
    for (const k of reg.stimulusKinds.values()) {
      expect(Object.keys(k.perception as object).sort(), String(k.id)).toEqual([...STAGES, 'separated'].sort());
      expect(k.family, String(k.id)).toBe(String(k.id).split('_')[0]);
    }
  });

  it('the sweat kinds are bodily fluids; nothing else is gated by its kind', () => {
    for (const k of reg.stimulusKinds.values()) expect(k.contentTags ?? [], String(k.id)).toEqual(String(k.id).startsWith('sweat_') ? ['bodily_fluids'] : []);
  });
});

describe('commanderConditions (P15a)', () => {
  it('dizzy lowers social rank by 1 and adds 5 stress; stiff is prompt only', () => {
    expect(reg.commanderConditions.get('dizzy')!.effects).toEqual([{ type: 'social_rank', delta: -1 }, { type: 'stress', amount: 5 }]);
    expect(reg.commanderConditions.get('stiff')!.effects).toEqual([]);
    expect([...reg.commanderConditions.keys()].sort()).toEqual(['dizzy', 'stiff']);
  });
});
