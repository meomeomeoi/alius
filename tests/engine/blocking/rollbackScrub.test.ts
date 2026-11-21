import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, hasSource, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

/** Review finding C1: a rollback never brings back what the stop word, the end of a hold or a switched-off category took away. */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const ANN = 'unit_ann';
const ON = ['worship', 'restraint', 'explicit_scenes', 'service', 'objectification', 'humiliation'];

function scene(): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...ON);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const put = (s: CampaignState, c: BlockingChange, at: number): void => { setBlocking(s, { registries: reg }, c, { at, source: 'chip' }); };
const rollback = (s: CampaignState, after: number): CampaignState => {
  const r = run(s, reg, { type: 'blocking/rollback', payload: { after } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};

describe('a rollback after something was taken away quietly', () => {
  it('the stop word: the gag it removed does not come back', () => {
    const s = scene();
    put(s, { person: COMMANDER, field: 'worn', value: 'ring_gag' }, 4);
    put(s, { person: ANN, field: 'posture', value: 'sitting' }, 6);
    expect(s.scene!.physics).toBeDefined();
    const stopped = run(s, reg, { type: 'physics/stop_word', payload: {} });
    expect(errors(stopped.events)).toEqual([]);
    expect(stopped.state.scene!.physics).toBeUndefined();
    expect(hasSource(stopped.state.scene, 'item', 'ring_gag')).toBe(false);
    const back = rollback(stopped.state, 5);
    expect(hasSource(back.scene, 'item', 'ring_gag')).toBe(false); // the gag stays off
    expect(back.scene!.blocking?.[ANN]?.posture).toBeUndefined(); // what came after the reply is still taken back
  });

  it('the stop word on a contact: the contact does not come back', () => {
    const s = scene();
    put(s, { person: ANN, field: 'contact', value: 'smothered_armpit', with: COMMANDER }, 4);
    put(s, { person: ANN, field: 'posture', value: 'sitting' }, 6);
    const stopped = run(s, reg, { type: 'physics/stop_word', payload: {} }).state;
    expect(hasSource(stopped.scene, 'contact', 'smothered_armpit')).toBe(false);
    const back = rollback(stopped, 5);
    expect(hasSource(back.scene, 'contact', 'smothered_armpit')).toBe(false);
  });

  it('a category switched off: its blindfold does not come back', () => {
    const s = scene();
    put(s, { person: COMMANDER, field: 'worn', value: 'blindfold' }, 4);
    put(s, { person: ANN, field: 'posture', value: 'sitting' }, 6);
    const off = run(s, reg, { type: 'content/set_categories', payload: { enabled: ON.filter((c) => c !== 'restraint') } });
    expect(errors(off.events)).toEqual([]);
    expect(hasSource(off.state.scene, 'item', 'blindfold')).toBe(false);
    const back = rollback(off.state, 5);
    expect(hasSource(back.scene, 'item', 'blindfold')).toBe(false);
  });
});
