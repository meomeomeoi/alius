/**
 * P10e-e Task 17 (R20): her question under scent. `physics/answer { runId, right, lie, caught }` records what the instrument judged:
 * `scent_answer` always, and `scent_lie_caught` when she found out a lie. A caught lie is remembered by her (memoryRules `scent_lie_caught`:
 * audience her, importance 2, no spread, not hidden from the commander); the rest is bookkeeping and writes nothing.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
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
});

const ANN = 'unit_ann';
function underFeet(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation');
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  setBlocking(r.state, { registries: reg }, { person: ANN, field: 'contact', value: 'feet_on_face', with: COMMANDER }, { at: 3, source: 'chip' });
  return r.state;
}
const answer = (s: CampaignState, p: Record<string, unknown>) => run(s, reg, { type: 'physics/answer', payload: { runId: s.scene!.physics!.id, ...p } });
const lieFacts = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('scent_lie'));

describe('her question (R20)', () => {
  it('records the answer as the instrument judged it', () => {
    const s = underFeet();
    const r = answer(s, { right: true, lie: false, caught: false });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'scent_answer')).toEqual([{ type: 'scent_answer', runId: s.scene!.physics!.id, holderId: ANN, right: true, lie: false, caught: false }]);
    expect(ofType(r.events, 'scent_lie_caught')).toEqual([]);
    expect(r.state.memory.facts.length).toBe(s.memory.facts.length);
    expect(r.state.memory.nextId).toBe(s.memory.nextId);
  });

  it('a caught lie is remembered once, with audience her; a lie not caught writes nothing', () => {
    const s = underFeet();
    const caught = answer(s, { right: false, lie: true, caught: true });
    expect(errors(caught.events)).toEqual([]);
    expect(ofType(caught.events, 'scent_lie_caught')).toEqual([{ type: 'scent_lie_caught', holderId: ANN }]);
    const facts = lieFacts(caught.state);
    expect(facts).toHaveLength(1);
    expect(facts[0]).toMatchObject({ about: [ANN], knownBy: [ANN], importance: 2 });
    expect(facts[0]!.id.startsWith('fr')).toBe(true);
    expect(facts[0]!.hiddenFromCommander).toBeFalsy();
    expect(facts[0]!.text).not.toMatch(/\b(he|him|his|she felt|the commander felt)\b/i);
    expect(caught.state.memory.nextId).toBe(s.memory.nextId);

    const free = answer(s, { right: true, lie: true, caught: false });
    expect(errors(free.events)).toEqual([]);
    expect(ofType(free.events, 'scent_lie_caught')).toEqual([]);
    expect(lieFacts(free.state)).toEqual([]);
  });

  it('refuses a stale run, a malformed answer and a caught truth', () => {
    const s = underFeet();
    expect(errors(run(s, reg, { type: 'physics/answer', payload: { runId: 'p99', right: true, lie: false, caught: false } }).events)).not.toEqual([]);
    expect(errors(answer(s, { right: 'yes', lie: false, caught: false }).events)).not.toEqual([]);
    expect(errors(answer(s, { right: true, lie: false, caught: true }).events)).not.toEqual([]);
  });
});
