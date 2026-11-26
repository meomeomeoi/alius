/**
 * P10e-e Task 23 (R28): her frame's two remembered events. `forgotten_end` is a fact of hers only (importance 2, no spread);
 * `found_posed` is remembered by the finder and spreads as a squad rumor (importance 3, not hidden from the commander). Rule facts take
 * `fr` ids and `memory.nextId` does not shift.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { registerPresenceTerms, resetPresenceHooks } from '../../../src/engine/physics/presence';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/memory';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
  resetPresenceHooks();
});

const ANN = 'unit_ann';
function forgotten(): CampaignState {
  registerFrameReader(() => 'play');
  registerPhysicsStyle((_s, id) => (id === ANN ? { primary: 'cruel' } : null));
  registerPresenceTerms((_s, _r, id) => (id === ANN ? { regardRank: 4, regardBands: 5, holdIndex: 4, holdBands: 5, hash: () => 0.5 } : null));
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service');
  let st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: 'on_comms' }, { at: 1, source: 'chip' });
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN }, { at: 2, source: 'chip' });
  for (let i = 0; i < 400 && st.scene?.physics && !st.scene.physics.forgotten; i++) {
    const p = st.scene.physics;
    const a = p.marathon?.waiting ? { type: 'physics/skip', payload: { strategy: 'spare' } } : p.segment.state === 'held' ? { type: 'physics/next_segment', payload: { runId: p.id } } : { type: 'physics/segment_end', payload: { runId: p.id, segment: p.segment.n, inputs: [] } };
    const r = run(st, reg, a);
    expect(errors(r.events)).toEqual([]);
    st = r.state;
  }
  expect(st.scene!.physics!.forgotten).toBe(true);
  return st;
}
const tagged = (s: CampaignState, tag: string) => s.memory.facts.filter((f) => f.tags.includes(tag));

describe('her frame\'s memory (R28)', () => {
  it('forgotten_end is a fact of hers only', () => {
    const s = forgotten();
    const facts = tagged(s, 'forgotten_end');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ about: [ANN], knownBy: [ANN], importance: 2 });
    expect(facts[0]!.id.startsWith('fr')).toBe(true);
    expect(facts[0]!.text).not.toMatch(/\b(he|him|his|it)\b/i);
  });

  it('found_posed is remembered by the finder and spreads as a squad rumor', () => {
    const s = forgotten();
    const finder = s.squad.find((u) => u.id !== ANN && u.kind === 'named')!;
    const before = s.memory.nextId;
    const r = run(s, reg, { type: 'physics/found', payload: { runId: s.scene!.physics!.id, finderId: finder.id } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'found_posed')).toHaveLength(1);
    const facts = tagged(r.state, 'found_posed');
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ about: [ANN], knownBy: [finder.id], importance: 3 });
    expect(facts[0]!.hiddenFromCommander).toBeFalsy();
    expect(facts[0]!.text).toContain(finder.displayName);
    expect(facts[0]!.text).not.toMatch(/\b(he|him|his|it)\b/i);
    expect(r.state.memory.nextId).toBe(before);
    const rule = reg.memoryRules.get('found_posed')!;
    expect(rule.spread).not.toBe('none'); // spreads (the squad_rumor kind)
  });

  it('getting up alone writes no fact of its own (her offence is her practices\')', () => {
    const s = forgotten();
    const r = run(s, reg, { type: 'physics/get_up', payload: { runId: s.scene!.physics!.id } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.memory.facts.length).toBe(s.memory.facts.length);
  });
});
