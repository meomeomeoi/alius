import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { COMMANDER, registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { drillPendingOf } from '../../../src/engine/craft/drillScene';
import { wantGrowthMult } from '../../../src/engine/dynamic/exchange';
import { blankDynamic } from '../../../src/engine/dynamic/state';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, run } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from './world';
import { playOut } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

type Ev = { type: string; [k: string]: unknown };
const DRILL = TUNING.craft.xp.drill;

/** Ann holds at `play` and the content is on: the weight and breath contacts of the base are open to her. */
function ready(): CampaignState {
  registerFrameReader(() => 'play');
  const s = world(reg, 'play');
  s.relations[ANN].stateId = 'confidant';
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'restraint', 'service', 'objectification', 'humiliation'])] };
  s.slot = 'afternoon';
  return s;
}
const asked = (s: CampaignState, companionId = ANN, focus = 'endurance_weight') => run(s, reg, { type: 'activity/do', payload: { activityId: 'train', companionId, focus } });
const opened = (s: CampaignState, ids: string[] = [ANN]) => run(s, reg, { type: 'scene/start', payload: { locationId: 'training_yard', participants: ids, origin: 'activity', consumesSlot: true, startIndex: 0 } });
const started = (s: CampaignState, unitId = ANN) => run(s, reg, { type: 'craft/drill_start', payload: { unitId } });
const doneOf = (events: Ev[]) => events.filter((e) => e.type === 'drill_done');

/** The whole way: asked, the scene open, the drill started. */
function begin(s: CampaignState, companionId = ANN, focus = 'endurance_weight', ids: string[] = [companionId]) {
  const a = asked(s, companionId, focus);
  expect(errors(a.events)).toEqual([]);
  const o = opened(a.state, ids);
  expect(errors(o.events)).toEqual([]);
  const d = started(o.state, companionId);
  expect(errors(d.events)).toEqual([]);
  return { asked: a, opened: o, started: d };
}

describe('the partner drill opens a scene', () => {
  it('asked with a holder it holds the slot for the scene at the training yard, with the drill pending', () => {
    const s = ready();
    const r = asked(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.events.find((e) => e.type === 'scene_requested')).toMatchObject({ unitId: ANN, activityId: 'train', origin: 'activity', locationId: 'training_yard' });
    expect(r.events.some((e) => e.type === 'activity_done')).toBe(true);
    expect(r.state.calendar.pendingScene).toEqual({ unitId: ANN, day: s.day, slot: 'afternoon' });
    expect(r.state.slot).toBe('afternoon'); // the scene's slot, spent when it ends
    expect(r.state.relations[ANN].craft?.drillPending).toEqual({ key: 'endurance:weight', mult: 1.5, day: s.day });
    expect(doneOf(r.events)).toEqual([]); // nothing is paid before the hold
    expect(r.state.commander.endurance).toBeUndefined();
    const o = opened(r.state);
    expect(o.state.scene).toMatchObject({ locationId: 'training_yard', participants: [ANN] });
    const ended = run(o.state, reg, { type: 'scene/end', payload: {} });
    expect(ended.state.slot).toBe('evening');
  });

  it('with no contact that can be staged for her it pays now, at the partner\'s multiplier, and opens nothing', () => {
    const s = ready();
    s.content = { enabled: ['restraint'] };
    const r = asked(s);
    expect(r.events.some((e) => e.type === 'scene_requested')).toBe(false);
    expect(r.state.calendar.pendingScene).toBeUndefined();
    expect(doneOf(r.events)).toEqual([{ type: 'drill_done', key: 'endurance:weight', companionId: ANN, mult: 1.5, alone: false, xp: 22.5 }]);
    expect(r.state.slot).toBe('evening');
    expect(r.state.relations[ANN].craft?.drillPending).toBeUndefined();
  });

  it('a partner who is neither a holder nor close pays x1 now (no scene)', () => {
    const s = ready();
    const r = asked(s, 'unit_cat');
    expect(r.events.some((e) => e.type === 'scene_requested')).toBe(false);
    expect(doneOf(r.events)[0]).toMatchObject({ companionId: 'unit_cat', mult: 1, xp: DRILL });
  });

  it('a scene that is cancelled, aborted or ended takes the waiting drill with it', () => {
    const s = ready();
    const a = asked(s);
    const cancelled = run(a.state, reg, { type: 'calendar/cancel_scene', payload: {} });
    expect(cancelled.state.relations[ANN].craft?.drillPending).toBeUndefined();
    const o = opened(a.state);
    expect(run(o.state, reg, { type: 'scene/abort', payload: {} }).state.relations[ANN].craft?.drillPending).toBeUndefined();
    expect(run(o.state, reg, { type: 'scene/end', payload: {} }).state.relations[ANN].craft?.drillPending).toBeUndefined();
  });
});

describe('craft/drill_start', () => {
  it('stages the first contact of the drill\'s physics that is open to her, by field, and starts the run', () => {
    const { started: d } = begin(ready());
    expect(d.state.scene!.blocking![COMMANDER]!.contact).toMatchObject({ id: 'footrest', with: ANN, direction: 'from' }); // the record sits on the receiver
    expect(d.events.find((e) => e.type === 'physics_started')).toMatchObject({ physicsId: 'weight', holderId: ANN, sourceKind: 'contact', sourceId: 'footrest' });
    expect(d.state.scene!.physics).toMatchObject({ physicsId: 'weight', holderId: ANN });
    expect(d.state.relations[ANN].craft?.drillPending).toMatchObject({ runId: d.state.scene!.physics!.id });
  });

  it('skips what she does not allow: the next row that names the physics', () => {
    const s = ready();
    s.content = { enabled: [...s.content!.enabled, 'pain_rough'] };
    unitOf(s, ANN).bond!.ownLimits = { categories: ['objectification'] };
    const { started: d } = begin(s);
    expect(d.state.scene!.blocking![COMMANDER]!.contact!.id).toBe('boot_on_chest');
  });

  it('a breath drill takes a breath contact', () => {
    const { started: d } = begin(ready(), ANN, 'endurance_breath');
    expect(d.events.find((e) => e.type === 'physics_started')).toMatchObject({ physicsId: 'breath' });
    expect(d.state.scene!.blocking![COMMANDER]!.contact!.id).toBe('smothered_armpit');
  });

  it('is refused without a waiting drill, outside her scene, or while a hold runs', () => {
    const s = ready();
    const bare = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: true, startIndex: 0 } }).state;
    expect(errors(started(bare).events)[0]?.message).toMatch(/no drill is waiting/);
    expect(errors(started(s).events)[0]?.message).toMatch(/no scene is open/);
    const a = asked(s);
    const sc = opened(a.state);
    const d = started(sc.state);
    expect(errors(started(d.state).events)[0]?.message).toMatch(/running already|waiting/);
    expect(errors(run(sc.state, reg, { type: 'craft/drill_start', payload: {} }).events)[0]?.message).toMatch(/needs/);
  });
});

describe('the outcome pays the drill', () => {
  it('x1.5 once, with her verdict and Regard, and the waiting drill is gone', () => {
    const { started: d } = begin(ready());
    const played = playOut(d.state, reg, 3);
    expect(played.state.scene!.physics).toBeUndefined();
    const done = doneOf(played.events);
    expect(done).toEqual([{ type: 'drill_done', key: 'endurance:weight', companionId: ANN, mult: 1.5, alone: false, xp: 22.5 }]);
    expect(played.events.find((e) => e.type === 'craft_xp' && e.cause === 'drill')).toMatchObject({ key: 'endurance:weight', gained: 22.5 });
    expect(played.state.commander.endurance!.weight!.trainedDay).toBe(played.state.day);
    expect(played.state.relations[ANN].craft?.drillPending).toBeUndefined();
    expect(played.state.relations[ANN].craft?.partnerDay).toBe(played.state.day);
    const rated = played.events.filter((e) => e.type === 'service_rated');
    expect(rated).toHaveLength(1);
    expect(rated[0]).toMatchObject({ unitId: ANN, via: 'engine' });
    expect(played.state.practices?.verdictScene?.[ANN]).toBe(played.state.scene!.id); // one verdict a scene
  });

  it('a clean hold is a pleased verdict, which raises her Regard (her style reads the rise)', () => {
    const { started: d } = begin(ready());
    const played = playOut(d.state, reg, 3);
    expect(played.events.find((e) => e.type === 'service_rated')).toMatchObject({ unitId: ANN, kind: 'pleased' });
    expect(played.events.find((e) => e.type === 'regard_changed' && e.cause === 'value')).toMatchObject({ unitId: ANN, from: 50, to: 50 + TUNING.craft.drill.regard });
  });

  it('the stop word ends it and pays nothing: no drill, no verdict, no lesson', () => {
    const { started: d } = begin(ready());
    const r = run(d.state, reg, { type: 'physics/stop_word', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.find((e) => e.type === 'physics_outcome')).toMatchObject({ result: 'stopped' });
    expect(doneOf(r.events)).toEqual([]);
    expect(r.events.some((e) => e.type === 'service_rated' || e.type === 'lesson' || e.type === 'record_set')).toBe(false);
    expect(r.state.relations[ANN].craft?.drillPending).toBeUndefined();
    expect(r.state.commander.endurance?.weight?.trainedDay).toBeUndefined();
  });

  it('a hold she did not start as the drill pays nothing extra', () => {
    const a = asked(ready());
    const o = opened(a.state);
    const bare = run(o.state, reg, { type: 'blocking/set', payload: { person: ANN, field: 'contact', value: 'footrest', with: COMMANDER, at: 3 } }); // a staged contact starts its run
    expect(errors(bare.events)).toEqual([]);
    expect(bare.state.scene!.physics).toMatchObject({ physicsId: 'weight' });
    const played = playOut(bare.state, reg, 3);
    expect(played.state.scene!.physics).toBeUndefined();
    expect(doneOf(played.events)).toEqual([]);
  });

  it('the same drill twice in a day: the second pays no xp (it was asked before the first was done)', () => {
    const { started: d } = begin(ready());
    const played = playOut(d.state, reg, 3);
    expect(String(errors(asked(run(played.state, reg, { type: 'scene/end', payload: {} }).state).events)[0]?.message)).toMatch(/done today/);
  });
});

describe('another woman', () => {
  /** Bea is close to the commander and has a dynamic block, but no profile: Ann is the one who holds. */
  function withOther(): CampaignState {
    const s = ready();
    s.relations[BEA].stateId = 'confidant';
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'play', hold: 30 };
    return s;
  }

  it('is x1.2, gets no verdict, and a holder who is not she sees them together', () => {
    const s = withOther();
    const a = asked(s, BEA);
    expect(a.state.relations[BEA].craft?.drillPending).toMatchObject({ mult: 1.2 });
    const o = opened(a.state, [BEA, ANN]);
    const d = started(o.state, BEA);
    expect(errors(d.events)).toEqual([]);
    const played = playOut(d.state, reg, 3);
    expect(doneOf(played.events)).toEqual([{ type: 'drill_done', key: 'endurance:weight', companionId: BEA, mult: 1.2, alone: false, xp: 18 }]);
    expect(played.events.some((e) => e.type === 'service_rated' && e.unitId === BEA)).toBe(false);
    expect(played.events.find((e) => e.type === 'dynamic_known')).toMatchObject({ observerId: ANN, holderId: BEA, level: 'suspects_close' });
    expect(played.state.dynamic!.knowledge[ANN]?.[BEA]?.level).toBe('suspects_close');
  });

  it('is a day of jealousy for the holder: her Want grows faster', () => {
    const s = withOther();
    const before = wantGrowthMult(s, reg, ANN);
    const a = asked(s, BEA);
    const o = opened(a.state, [BEA]);
    const played = playOut(started(o.state, BEA).state, reg, 3);
    const after = wantGrowthMult(played.state, reg, ANN);
    expect(played.state.relations[BEA].craft?.partnerDay).toBe(s.day);
    expect(after / before).toBeCloseTo(TUNING.exchange.lift, 5);
    // the partner herself is not jealous of her own drill
    const own = wantGrowthMult(played.state, reg, BEA);
    const ownBefore = wantGrowthMult(s, reg, BEA);
    expect(own).toBeCloseTo(ownBefore, 5);
  });

  it('nothing of the craft is seen while no holder is live', () => {
    const s = withOther();
    s.relations[ANN].dynamic = undefined;
    const r = asked(s, BEA);
    expect(r.events.some((e) => e.type === 'scene_requested' || e.type === 'drill_done')).toBe(false);
  });
});
