import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import {
  blockingLive, blockingOf, checkChange, effectsOf, personEffects, registerBlockingGate, registerFrameReader, resetBlockingHooks, sceneAffordances, sceneRoom,
  setBlocking, transitionProblem, COMMANDER, type BlockingChange,
} from '../../../src/engine/blocking';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable, withBond } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => resetBlockingHooks());

const ANN = 'unit_ann';
const BEA = 'unit_bea';
const ctx = () => ({ registries: reg });

/** A campaign with a scene open at `loc` with `ids` (Ann at `stateId`); the categories in `on` switched on. */
function scene(over: { loc?: string; stateId?: string; ids?: string[]; on?: string[] } = {}): CampaignState {
  let s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: over.stateId ?? 'confidant' });
  if (over.on) enable(s, ...over.on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: over.loc ?? 'quarters_commander', participants: over.ids ?? [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const set = (s: CampaignState, c: BlockingChange, at = 3): CampaignState => {
  const d = structuredClone(s);
  setBlocking(d, ctx(), c, { at, source: 'chip' });
  return d;
};
const reason = (s: CampaignState, c: BlockingChange): string => {
  const before = structuredClone(s);
  const msg = checkChange(s, reg, c);
  expect(msg, JSON.stringify(c)).not.toBeNull();
  expect(() => setBlocking(structuredClone(s), ctx(), c, { at: 1, source: 'chip' })).toThrow(msg!);
  expect(s).toEqual(before);
  return msg!;
};

describe('blockingLive (R2)', () => {
  it('is false without a close relation, true with one, never for a grunt, and a registered gate can make it true', () => {
    expect(blockingLive(scene({ stateId: 'comrade' }), reg)).toBe(false);
    expect(blockingLive(scene({ stateId: 'confidant' }), reg)).toBe(true);
    expect(blockingLive(scene({ stateId: 'lover' }), reg)).toBe(true);
    const comrade = scene({ stateId: 'comrade' });
    registerBlockingGate(() => true);
    expect(blockingLive(comrade, reg)).toBe(true);
    resetBlockingHooks();
    const none = campaign(reg, 4);
    expect(blockingLive(none, reg)).toBe(false); // no scene open
  });

  it('a close soldier who is not in the scene does not count', () => {
    const s = scene({ stateId: 'confidant', ids: [BEA] });
    expect(blockingLive(s, reg)).toBe(false);
  });
});

describe('where the scene is', () => {
  it('resolves the plan room and its affordances', () => {
    const cmdr = scene({ loc: 'quarters_commander' });
    expect(sceneRoom(cmdr, reg)!.id).toBe('u_cmdr');
    expect([...sceneAffordances(cmdr, reg)].sort()).toEqual(['bunk', 'desk', 'lock']);
    const mess = scene({ loc: 'mess_hall' });
    expect(sceneRoom(mess, reg)!.id).toBe('g_mess_hall');
    expect([...sceneAffordances(mess, reg)]).toEqual(['crowd']);
    const comms = scene({ loc: 'comms_room' });
    expect(sceneRoom(comms, reg)!.id).toBe('u_comms');
    expect(sceneAffordances(comms, reg).has('line')).toBe(true);
  });

  it('a per-unit location is the first participant\'s own cabin', () => {
    const s = scene({ loc: 'quarters_unit' });
    expect(sceneRoom(s, reg)!.cabin).toBe('unit');
    expect(sceneAffordances(s, reg).has('bunk')).toBe(true);
  });
});

describe('blocking/set refuses what the gates refuse, and changes nothing', () => {
  it('a tagged item with its category off', () => {
    const s = scene();
    reason(s, { person: COMMANDER, field: 'worn', value: 'blindfold' });
    expect(set(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' }).scene!.blocking![COMMANDER]!.worn!.eyes!.id).toBe('blindfold');
  });

  it('a dynamic contact at frame equal', () => {
    const s = scene({ on: ['objectification'] });
    reason(s, { person: COMMANDER, field: 'contact', value: 'human_chair', with: ANN });
  });

  it('her own limit', () => {
    const s = scene({ on: ['restraint'] });
    withBond(s, ANN, { ownLimits: { categories: ['restraint'] } });
    reason(s, { person: COMMANDER, field: 'worn', value: 'blindfold' });
  });

  it('an anchor whose furniture the room lacks', () => {
    reason(scene({ loc: 'mess_hall' }), { person: COMMANDER, field: 'anchor', value: 'under_desk' });
    expect(set(scene({ loc: 'quarters_commander' }), { person: COMMANDER, field: 'anchor', value: 'under_desk' }).scene!.blocking![COMMANDER]!.anchor).toEqual({ id: 'under_desk' });
  });

  it('a person who is not present', () => {
    reason(scene(), { person: BEA, field: 'posture', value: 'sitting' });
  });

  it('a second item on a used slot', () => {
    const s = set(scene({ on: ['restraint', 'pet_play'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' });
    const msg = reason(s, { person: COMMANDER, field: 'worn', value: 'hood' }); // the hood takes eyes and ears
    expect(msg).toMatch(/eyes/);
    reason(s, { person: COMMANDER, field: 'worn', value: 'scarf_blindfold' });
  });

  it('unknown ids, a wrong wearer, an unknown field', () => {
    const s = scene({ on: ['strap', 'explicit_scenes'] });
    reason(s, { person: COMMANDER, field: 'posture', value: 'levitating' });
    reason(s, { person: COMMANDER, field: 'worn', value: 'nothing' });
    reason(s, { person: COMMANDER, field: 'activity', value: 'reading_book' }); // hers
    reason(s, { person: ANN, field: 'activity', value: 'c_idle' }); // the commander's
    reason(s, { person: ANN, field: 'worn', value: 'blindfold' }); // worn by the commander
    reason(s, { person: COMMANDER, field: 'intimacy', value: 'loud' });
    expect(checkChange(s, reg, { person: COMMANDER, field: 'colour' as never })).not.toBeNull();
  });

  it('explicit intimacy needs explicit_scenes', () => {
    reason(scene(), { person: COMMANDER, field: 'intimacy', value: 'explicit' });
    expect(set(scene({ on: ['explicit_scenes'] }), { person: ANN, field: 'intimacy', value: 'explicit' }).scene!.blocking![ANN]!.intimacy).toBe('explicit');
    expect(set(scene(), { person: ANN, field: 'intimacy', value: 'close' }).scene!.blocking![ANN]!.intimacy).toBe('close');
  });

  it('through the action: an error event, the state untouched, and it needs a live scene', () => {
    const s = scene({ stateId: 'comrade' });
    const r = run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'sitting', at: 1 } });
    expect(errors(r.events)).toHaveLength(1);
    expect(r.state).toEqual(s);
    const live = scene();
    const ok = run(live, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'kneeling_upright', at: 4 } });
    expect(errors(ok.events)).toEqual([]);
    expect(ofType(ok.events, 'blocking_changed')).toEqual([{ type: 'blocking_changed', person: COMMANDER, field: 'posture', value: 'kneeling_upright', source: 'chip' }]);
    expect(blockingOf(ok.state.scene, COMMANDER).posture).toBe('kneeling_upright');
    const bad = run(live, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'posture', value: 'sitting' } });
    expect(errors(bad.events)).toHaveLength(1);
  });
});

describe('setting and removing', () => {
  it('a relative anchor takes the other person as relTo; an unset field is not stored', () => {
    let s = scene();
    s = set(s, { person: COMMANDER, field: 'anchor', value: 'at_her_feet' });
    expect(s.scene!.blocking![COMMANDER]).toEqual({ anchor: { id: 'at_her_feet', relTo: ANN } });
    s = set(s, { person: ANN, field: 'anchor', value: 'at_desk' });
    expect(s.scene!.blocking![ANN]).toEqual({ anchor: { id: 'at_desk' } });
    expect(blockingOf(s.scene, BEA)).toEqual({});
  });

  it('a note is cut and trimmed; an activity may imply a posture', () => {
    let s = set(scene(), { person: ANN, field: 'note', value: `  ${'x'.repeat(300)}  ` });
    expect(s.scene!.blocking![ANN]!.note).toHaveLength(120);
    s = set(s, { person: ANN, field: 'activity', value: 'on_comms' });
    expect(s.scene!.blocking![ANN]).toMatchObject({ activity: 'on_comms', posture: 'sitting' });
    s = set(s, { person: ANN, field: 'posture', value: 'standing' });
    s = set(s, { person: ANN, field: 'activity', value: 'reading_reports' });
    expect(s.scene!.blocking![ANN]!.posture).toBe('standing'); // an activity never overrides a posture that is set
  });

  it('removed takes an item off all its slots', () => {
    let s = set(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'hood' });
    expect(Object.keys(s.scene!.blocking![COMMANDER]!.worn!).sort()).toEqual(['ears', 'eyes']);
    s = set(s, { person: COMMANDER, field: 'removed', value: 'hood' });
    expect(s.scene!.blocking).toBeUndefined();
    reason(s, { person: COMMANDER, field: 'removed', value: 'hood' });
  });

  it('a one-slot item takes the chosen slot (jewelry)', () => {
    const s = scene({ on: ['feminization'] });
    registerFrameReader(() => 'play');
    const a = set(s, { person: COMMANDER, field: 'worn', value: 'fem_jewellery', slot: 'neck' });
    expect(Object.keys(a.scene!.blocking![COMMANDER]!.worn!)).toEqual(['neck']);
    reason(s, { person: COMMANDER, field: 'worn', value: 'fem_jewellery', slot: 'eyes' });
  });

  it('every change pushes the state before it onto the log, capped at 40', () => {
    let s = scene();
    for (let i = 0; i < 45; i++) s = set(s, { person: COMMANDER, field: 'posture', value: i % 2 === 0 ? 'sitting' : 'standing' }, i + 1);
    expect(s.scene!.stagingLog).toHaveLength(40);
    expect(s.scene!.stagingLog![39]!.at).toBe(45);
    expect(s.scene!.stagingLog![39]!.blocking[COMMANDER]).toEqual({ posture: 'standing' }); // the state before change 45 (change 44 set standing)
    expect(s.scene!.stagingLog![0]!.at).toBe(6);
  });
});

describe('implies writes both sides', () => {
  it('human_chair sets the commander all_fours and her sitting on_person; removing it restores the anchors', () => {
    registerFrameReader(() => 'play');
    let s = scene({ on: ['objectification'] });
    s = set(s, { person: COMMANDER, field: 'anchor', value: 'center' });
    s = set(s, { person: ANN, field: 'anchor', value: 'at_desk' });
    s = set(s, { person: COMMANDER, field: 'contact', value: 'human_chair', with: ANN });
    expect(s.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'all_fours', contact: { id: 'human_chair', with: ANN, direction: 'from' } });
    // the commander is the receiver, so the record sits on the commander, whose anchor the contact did not touch
    expect(s.scene!.blocking![ANN]).toEqual({ posture: 'sitting', anchor: { id: 'on_person', relTo: COMMANDER } });
    s = set(s, { person: ANN, field: 'removed', value: 'human_chair' });
    expect(s.scene!.blocking![ANN]).toEqual({ posture: 'sitting', anchor: { id: 'at_desk' } }); // the posture stays: the body did not move
    expect(s.scene!.blocking![COMMANDER]).toEqual({ posture: 'all_fours', anchor: { id: 'center' } });
  });

  it('without a previous anchor the commander goes back to beside her', () => {
    registerFrameReader(() => 'play');
    let s = scene({ on: ['objectification', 'restraint', 'pain_rough'] });
    s = set(s, { person: ANN, field: 'contact', value: 'on_lap', with: COMMANDER, direction: 'to' });
    // on_lap: the one on the lap is the receiver; commander acts toward her, so she is the receiver
    expect(s.scene!.blocking![ANN]!.contact).toMatchObject({ id: 'on_lap', with: COMMANDER, direction: 'to' });
    expect(s.scene!.blocking![ANN]!.anchor).toEqual({ id: 'on_person', relTo: COMMANDER });
    s = set(s, { person: ANN, field: 'removed', value: 'on_lap' });
    expect(s.scene!.blocking![ANN]?.anchor).toBeUndefined();
  });

  it('one contact per receiver: a second replaces the first and its anchors are put back', () => {
    registerFrameReader(() => 'play');
    let s = scene({ on: ['objectification', 'restraint', 'pain_rough'] });
    s = set(s, { person: COMMANDER, field: 'contact', value: 'human_chair', with: ANN });
    s = set(s, { person: COMMANDER, field: 'contact', value: 'footrest', with: ANN });
    expect(s.scene!.blocking![COMMANDER]!.contact!.id).toBe('footrest');
    expect(s.scene!.blocking![ANN]!.posture).toBe('sitting');
    expect(s.scene!.blocking![ANN]!.anchor).toBeUndefined(); // footrest implies no anchor for her: on_person was removed with the chair
  });

  it('a contact needs both parties and a direction when it works both ways', () => {
    registerFrameReader(() => 'play');
    const s = scene({ on: ['objectification'] });
    reason(s, { person: COMMANDER, field: 'contact', value: 'human_chair' });
    reason(s, { person: ANN, field: 'contact', value: 'human_chair', with: BEA });
    reason(s, { person: COMMANDER, field: 'contact', value: 'spooning', with: ANN });
    expect(set(s, { person: COMMANDER, field: 'contact', value: 'spooning', with: ANN, direction: 'to' }).scene!.blocking![ANN]!.contact!.direction).toBe('to');
  });

  it('a worship target must belong to the contact and be allowed', () => {
    registerFrameReader(() => 'play');
    const s = scene({ on: ['worship'] });
    reason(s, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN, target: 'armpits' });
    expect(set(s, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN, target: 'toes' }).scene!.blocking![ANN]!.contact!.target).toBe('toes');
    expect(set(s, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN }).scene!.blocking![ANN]!.contact!.target).toBe('feet');
  });
});

describe('mobility holds the person', () => {
  it('none freezes: with straddled a posture change is refused with the reason', () => {
    registerFrameReader(() => 'play');
    const s = set(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'contact', value: 'straddled', with: ANN });
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' })).toBe('The commander cannot move: held in place.');
    reason(s, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' });
    reason(s, { person: COMMANDER, field: 'anchor', value: 'center' });
    expect(transitionProblem(s, reg, { person: ANN, field: 'posture', value: 'standing' })).toBeNull(); // she is the one holding
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'worn', value: 'blindfold' })).toBeNull();
  });

  it('limited: no anchor change, no standing', () => {
    const s = set(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'spreader_bar' });
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'anchor', value: 'center' })).toMatch(/cannot change place/);
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'standing_attention' })).toMatch(/cannot stand/);
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'sitting' })).toBeNull();
  });

  it('crawl keeps all_fours', () => {
    registerFrameReader(() => 'play');
    const s = set(scene({ on: ['pet_play'] }), { person: COMMANDER, field: 'contact', value: 'crawling_on_leash', with: ANN });
    expect(s.scene!.blocking![COMMANDER]!.posture).toBe('all_fours');
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'sitting' })).toMatch(/can only crawl/);
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'all_fours' })).toBeNull();
  });

  it('follows allows only a relative anchor with her', () => {
    const s = set(scene({ on: ['pet_play'] }), { person: COMMANDER, field: 'worn', value: 'leash' });
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'anchor', value: 'center' })).toMatch(/stay with her/);
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'anchor', value: 'beside_her' })).toBeNull();
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: COMMANDER })).toMatch(/stay with her/);
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'sitting' })).toBeNull();
  });

  it('the posture\'s own mobility effect does not lock its bearer', () => {
    const s = set(scene(), { person: COMMANDER, field: 'posture', value: 'all_fours' });
    expect(transitionProblem(s, reg, { person: COMMANDER, field: 'posture', value: 'standing' })).toBeNull();
  });
});

describe('effects by channel', () => {
  it('effectsOf reads one record, personEffects a whole person', () => {
    const s = set(scene({ on: ['restraint', 'humiliation'] }), { person: COMMANDER, field: 'worn', value: 'ring_gag' });
    const b = s.scene!.blocking![COMMANDER]!;
    expect(effectsOf(b, reg, 'input')).toEqual([{ type: 'input', limit: 'garbled', strength: 3 }]);
    expect(effectsOf(b, reg, 'camera')).toEqual([{ type: 'camera', mode: 'face_close' }]);
    expect(effectsOf(b, reg, 'physics')).toEqual([{ type: 'physics', id: 'jaw' }]);
    expect(effectsOf(b, reg, 'sound')).toEqual([]);
  });

  it('personEffects: posture, anchor, items, and the contact for the commander only', () => {
    registerFrameReader(() => 'play');
    let s = scene({ on: ['restraint', 'worship', 'pet_play'] });
    s = set(s, { person: COMMANDER, field: 'posture', value: 'kneeling_upright' });
    s = set(s, { person: COMMANDER, field: 'anchor', value: 'under_desk' });
    s = set(s, { person: COMMANDER, field: 'worn', value: 'hood' });
    s = set(s, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN });
    const types = personEffects(s, reg, COMMANDER).map((e) => e.type);
    expect(types).toEqual(expect.arrayContaining(['camera', 'strain', 'visibility', 'backdrop', 'filter', 'perception', 'sound', 'pose_shot']));
    expect(personEffects(s, reg, ANN).map((e) => e.type)).not.toContain('pose_shot'); // the contact is the commander's
    expect(personEffects(s, reg, ANN)).toEqual([]);
    expect(personEffects(campaign(reg, 4), reg, COMMANDER)).toEqual([]);
  });
});

describe('a content category going off mid-scene', () => {
  it('strips what is tagged with it: worn items, the contact and the activity', () => {
    registerFrameReader(() => 'play');
    let s = scene({ on: ['restraint', 'humiliation', 'worship'] });
    s = set(s, { person: COMMANDER, field: 'worn', value: 'blindfold' }); // restraint
    s = set(s, { person: COMMANDER, field: 'worn', value: 'collar' }); // untagged
    s = set(s, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN }); // worship
    s = set(s, { person: ANN, field: 'activity', value: 'attending' });
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: ['humiliation', 'worship'] } });
    expect(errors(r.events)).toEqual([]);
    const b = r.state.scene!.blocking!;
    expect(b[COMMANDER]!.worn).toEqual({ neck: { id: 'collar', since: 0 } });
    expect(b[ANN]!.contact).toBeDefined(); // the commander acts toward her: the record sits on her
    const r2 = run(r.state, reg, { type: 'content/set_categories', payload: { enabled: ['humiliation'] } });
    expect(r2.state.scene!.blocking![ANN]?.contact).toBeUndefined();
    expect(r2.state.scene!.blocking![COMMANDER]!.worn).toEqual({ neck: { id: 'collar', since: 0 } });
    expect(r2.events.filter((e) => e.type.startsWith('blocking'))).toEqual([]); // quiet
  });

  it('with no scene, switching a category off changes nothing about blocking', () => {
    const s = enable(campaign(reg, 4), 'restraint');
    const r = run(s, reg, { type: 'content/set_categories', payload: { enabled: [] } });
    expect(r.state.scene).toBeUndefined();
  });

  it.todo('ends a physics that depends on the tagged contact (physics_outcome stopped): completed in Task 18');
});

describe('no rng draw', () => {
  it('blocking/set leaves state.rng alone', () => {
    const s = scene({ on: ['restraint'] });
    const r = run(s, reg, { type: 'blocking/set', payload: { person: COMMANDER, field: 'worn', value: 'hood', at: 2 } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.rng).toEqual(s.rng);
  });
});
