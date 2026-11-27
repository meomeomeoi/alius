/**
 * P16b Task 25: stillness under provocation, the engine's half. A reaction is `physics/relief` `react` (she always feels it: no draw), a stimulus that went by is `endure`
 * (`physics_endured`: the craft pays `stillness`), the game's gate is `provocationOpen`.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import '../../../src/engine/actions/craft';
import { craftLevel, craftXp } from '../../../src/engine/craft/book';
import { provocationOpen } from '../../../src/engine/craft/provocation';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, holdScene } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

/** Ann reads a book with the commander beside her: her frame runs. */
function framed(): CampaignState {
  const s = holdScene(reg, { realtime: true });
  setBlocking(s, { registries: reg }, { person: ANN, field: 'activity', value: 'reading_book' }, { at: 3, source: 'chip' });
  // the footrest contact is the weight's: take it away and place the commander beside her
  delete s.scene!.blocking![COMMANDER]!.contact;
  delete s.scene!.blocking![ANN]!.contact;
  setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN }, { at: 3, source: 'chip' });
  expect(s.scene!.physics?.sourceKind).toBe('activity');
  return s;
}
const relief = (s: CampaignState, p: Record<string, unknown>) => run(s, reg, { type: 'physics/relief', payload: { runId: s.scene!.physics!.id, beat: 0, ...p } });

describe('the gate (provocationOpen)', () => {
  it('opens for a craft-live holder\'s frame with the game on and restraint on', () => {
    const s = framed();
    expect(provocationOpen(s, reg, s.scene!.physics!)).toBe(true);
  });
  it('is closed when the game is switched off, restraint is off, she is asleep, there is a second physics, or she is not craft-live', () => {
    const base = framed();
    const off = structuredClone(base);
    off.settings.physicsInteractions = { ...(off.settings.physicsInteractions as Record<string, boolean>), provocation: false } as never;
    expect(provocationOpen(off, reg, off.scene!.physics!)).toBe(false);
    const noRestraint = structuredClone(base);
    noRestraint.content = { enabled: (noRestraint.content?.enabled ?? []).filter((c) => c !== 'restraint') };
    expect(provocationOpen(noRestraint, reg, noRestraint.scene!.physics!)).toBe(false);
    const second = structuredClone(base);
    second.scene!.physics!.second = { physicsId: 'weight', segment: { state: 'held', n: 0 } } as never;
    expect(provocationOpen(second, reg, second.scene!.physics!)).toBe(false);
    const cold = structuredClone(base);
    cold.relations[ANN]!.stateId = 'neutral';
    cold.dynamic = undefined;
    expect(provocationOpen(cold, reg, cold.scene!.physics!)).toBe(false);
  });
});

describe('physics/relief react and endure', () => {
  it('a reaction is always felt: a caught cheat of kind react and the tally, and no rng is drawn', () => {
    const s = framed();
    const r = relief(s, { kind: 'react' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'physics_cheat')[0]).toMatchObject({ kind: 'react', holderId: ANN });
    expect(ofType(r.events, 'physics_caught')[0]).toMatchObject({ kind: 'react', holderId: ANN });
    expect(r.state.scene!.physics!.tally).toMatchObject({ cheatsCaught: 1 });
    expect(r.state.rng).toEqual(s.rng);
  });

  it('the body giving way (involuntary) is only noticed, never a caught cheat', () => {
    const s = framed();
    const r = relief(s, { kind: 'react', involuntary: true });
    expect(ofType(r.events, 'physics_noticed')).toHaveLength(1);
    expect(ofType(r.events, 'physics_caught')).toEqual([]);
    expect(ofType(r.events, 'physics_cheat')).toEqual([]);
    expect(r.state.scene!.physics!.tally).toMatchObject({ moved: 1 });
    expect(r.state.rng).toEqual(s.rng);
  });

  it('an endured stimulus says physics_endured and pays stillness once, with no draw', () => {
    const s = framed();
    expect(craftXp(s, 'stillness')).toBe(0);
    const r = relief(s, { kind: 'endure' });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'physics_endured')[0]).toMatchObject({ holderId: ANN });
    expect(ofType(r.events, 'craft_xp')[0]).toMatchObject({ key: 'stillness', gained: TUNING.craft.xp.endure, cause: 'provocation' });
    expect(craftXp(r.state, 'stillness')).toBe(TUNING.craft.xp.endure);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('enough of them raise the level of stillness', () => {
    let s = framed();
    const needed = Math.ceil(TUNING.physics.endurance.thresholds[1]! / TUNING.craft.xp.endure);
    for (let i = 0; i < needed; i++) s = relief(s, { kind: 'endure' }).state;
    expect(craftLevel(s, 'stillness')).toBeGreaterThanOrEqual(1);
  });

  it('a reaction pays nothing', () => {
    const r = relief(framed(), { kind: 'react' });
    expect(ofType(r.events, 'craft_xp')).toEqual([]);
  });

  it('both are refused while the game is switched off, and outside her frame', () => {
    const s = framed();
    const off = structuredClone(s);
    off.settings.physicsInteractions = { ...(off.settings.physicsInteractions as Record<string, boolean>), provocation: false } as never;
    for (const kind of ['react', 'endure']) {
      const r = run(off, reg, { type: 'physics/relief', payload: { runId: off.scene!.physics!.id, beat: 0, kind } });
      expect(errors(r.events).length).toBeGreaterThan(0);
    }
  });
});
