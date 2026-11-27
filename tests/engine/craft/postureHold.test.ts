import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import '../../../src/engine/actions/craft';
import { COMMANDER, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { startPostureHold } from '../../../src/engine/craft/posture';
import { craftRoll } from '../../../src/engine/craft/state';
import { levelOf } from '../../../src/engine/dynamic/knowledge';
import { regardOf } from '../../../src/engine/dynamic/regard';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, holdScene, unitOf, withBea, world } from './world';

/**
 * P16b, Task 12: taking, holding, correcting and slipping a posture. The instrument plays the drift in real time and reports; the engine judges the reports: `posture/take` starts the hold,
 * `posture/correct` and `posture/slip` count what happened, `posture/end` pays a clean hold to her release (xp, the pair's mastery of the preset, a record in fiction time) and takes the
 * Regard a humiliating posture costs. Nothing is written without a craft-live holder; nothing is drawn.
 */
let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
beforeEach(() => installCraftHooks()); // the physics hooks are reset after each test: the stop word's and the stillness's are installed again
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); });

const ctxOf = (d: CampaignState) => ({ registries: reg, rng: new Rng(d.rng) });
const act = (s: CampaignState, type: string, payload: object = {}) => run(s, reg, { type, payload } as never);
const ok = (r: { events: Array<{ type: string }> }): void => expect(errors(r.events as never)).toEqual([]);

/** A scene with Ann (craft-live) and the commander in no posture: the contact the weight scene started with is gone. */
function posed(): CampaignState {
  const s = holdScene(reg);
  delete s.scene!.blocking;
  delete s.scene!.stagingLog;
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'humiliation', 'pet_play', 'objectification'])] };
  return s;
}
const taken = (preset = 'kneel_upright', extra: object = {}): CampaignState => { const r = act(posed(), 'posture/take', { presetId: preset, at: 1, ...extra }); ok(r); return r.state; };
const runOf = (s: CampaignState) => s.practices?.postureRun;

describe('posture/take', () => {
  it('sets the posture with its preset and starts the hold: posture_taken, one run at a time', () => {
    const r = act(posed(), 'posture/take', { presetId: 'kneel_open', at: 1 });
    ok(r);
    expect(ofType(r.events, 'posture_taken')).toEqual([expect.objectContaining({ unitId: ANN, holderId: ANN, presetId: 'kneel_open' })]);
    expect(r.state.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'kneeling_upright', preset: 'kneel_open' });
    expect(runOf(r.state)).toMatchObject({ holderId: ANN, presetId: 'kneel_open', beats: 0, slips: 0, corrections: 0, source: 'take', startedAt: r.state.scene!.exchanges, present: [ANN] });
    expect(errors(act(r.state, 'posture/take', { presetId: 'kneel_present', at: 2 }).events)).not.toEqual([]); // a hold is running
  });

  it('an old base name takes the base\'s default preset', () => {
    const r = act(posed(), 'posture/take', { presetId: 'kneeling_upright', at: 1 });
    ok(r);
    expect(runOf(r.state)!.presetId).toBe('kneel_upright');
  });

  it('is refused for a preset that does not exist, one her categories forbid, one the place cannot give, no holder, and a holder who is not in the room', () => {
    expect(errors(act(posed(), 'posture/take', { presetId: 'no_such', at: 1 }).events)).not.toEqual([]);
    const off = posed();
    off.content = { enabled: off.content!.enabled.filter((c) => c !== 'objectification') };
    expect(errors(act(off, 'posture/take', { presetId: 'table', at: 1 }).events)).not.toEqual([]); // `objectification` is off
    expect(errors(act(posed(), 'posture/take', { presetId: 'face_to_wall', at: 1 }).events)).not.toEqual([]); // it needs a wall or a corner
    const none = posed();
    none.relations[ANN].dynamic!.frame = 'equal';
    expect(errors(act(none, 'posture/take', { presetId: 'kneel_upright', at: 1 }).events)).not.toEqual([]); // nobody holds
    expect(runOf(none)).toBeUndefined();
    const away = posed();
    away.scene!.participants = [BEA];
    expect(errors(act(away, 'posture/take', { presetId: 'kneel_upright', at: 1, holderId: ANN }).events)).not.toEqual([]);
  });

  it('a place she asks for is given by the commander\'s anchor: at the wall, facing it works', () => {
    const s = posed();
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'by_wall' }, { at: 1, source: 'engine' });
    ok(act(s, 'posture/take', { presetId: 'face_to_wall', at: 2 }));
  });

  it('the settling-in modifier (hidden): after three clean holds in a row her next hold of the kind has a load, and the count starts over', () => {
    const s = posed();
    s.relations[ANN].craft = { streak: { posture: 3 } };
    const r = act(s, 'posture/take', { presetId: 'kneel_upright', at: 1 });
    ok(r);
    expect(runOf(r.state)!.load).toBeDefined();
    expect(r.state.relations[ANN].craft!.streak?.posture).toBeUndefined();
    const fresh = act(posed(), 'posture/take', { presetId: 'kneel_upright', at: 1 });
    expect(runOf(fresh.state)!.load).toBeUndefined();
  });

  it('a hold with no duration keeps its end hidden; a planned length is kept for her release', () => {
    const hidden = taken('kneel_upright', { until: 60, hidden: true });
    expect(runOf(hidden)).toMatchObject({ until: 60, hidden: true });
    expect(ofType(act(posed(), 'posture/take', { presetId: 'kneel_upright', at: 1, until: 60, hidden: true }).events, 'posture_taken')[0]).not.toHaveProperty('until');
    expect(runOf(taken('kneel_upright', { until: 60 }))!.hidden).toBeUndefined();
  });

  it('draws nothing from the campaign rng', () => {
    const s = posed();
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(act(s, 'posture/take', { presetId: 'kneel_upright', at: 1 }).state.rng)).toBe(rng);
  });

  it('startPostureHold is reusable: another source (P17g attendance) starts the same run', () => {
    const s = posed();
    setBlocking(s, { registries: reg }, { person: COMMANDER, field: 'posture', value: 'kneeling_upright', preset: 'kneel_upright' }, { at: 1, source: 'engine' });
    const events = startPostureHold(s, ctxOf(s), { holderId: ANN, presetId: 'kneel_upright', until: 30, source: 'attendance' });
    expect(events.map((e) => e.type)).toContain('posture_taken');
    expect(runOf(s)).toMatchObject({ source: 'attendance', until: 30 });
  });
});

describe('posture/correct', () => {
  it('counts the correction and says it; a small one is quiet and never seen', () => {
    const s = taken();
    const r = act(s, 'posture/correct', { point: 'hips', amount: 20, attention: 'watching' });
    ok(r);
    expect(ofType(r.events, 'posture_corrected')).toEqual([expect.objectContaining({ unitId: ANN, point: 'hips', seen: false })]);
    expect(runOf(r.state)).toMatchObject({ corrections: 1, slips: 0 });
  });

  it('a loud one under her eyes reads as fidgeting; every third one she sees is a slip (and an offence)', () => {
    let s = taken();
    const seen = [];
    for (let i = 1; i <= 3; i++) {
      const r = act(s, 'posture/correct', { point: 'hips', amount: 90, attention: 'watching' });
      ok(r);
      s = r.state;
      seen.push(ofType(r.events, 'posture_corrected')[0].seen);
      expect(ofType(r.events, 'posture_slip').length, `correction ${i}`).toBe(i === TUNING.craft.posture.fidgetSlipEvery ? 1 : 0);
    }
    expect(seen).toEqual([true, true, true]);
    expect(runOf(s)).toMatchObject({ corrections: 3, fidgets: 3, slips: 1 });
    expect(s.practices!.offences[ANN]).toHaveLength(1);
  });

  it('under a glance a loud one is seen only above 0.72, and a busy holder sees none', () => {
    const s = taken();
    expect(ofType(act(s, 'posture/correct', { point: 'hips', amount: 70, attention: 'glancing' }).events, 'posture_corrected')[0].seen).toBe(false); // (0.7)^1.4 = 0.61
    expect(ofType(act(s, 'posture/correct', { point: 'hips', amount: 95, attention: 'glancing' }).events, 'posture_corrected')[0].seen).toBe(true);
    expect(ofType(act(s, 'posture/correct', { point: 'hips', amount: 100, attention: 'busy' }).events, 'posture_corrected')[0].seen).toBe(false);
  });

  it('the commander\'s stillness makes it quieter (noiseOf): the same correction is not seen once the body is still', () => {
    const s = taken();
    expect(ofType(act(s, 'posture/correct', { point: 'hips', amount: 80, attention: 'watching' }).events, 'posture_corrected')[0].seen).toBe(true);
    (s.commander.craft ??= {}).stillness = { xp: 400, level: 5, lastDay: s.day };
    expect(ofType(act(s, 'posture/correct', { point: 'hips', amount: 80, attention: 'watching' }).events, 'posture_corrected')[0].seen).toBe(false);
  });

  it('with no attention reported it is hashed from the run and the beat (never drawn), the same every time', () => {
    const s = taken();
    const a = ofType(act(s, 'posture/correct', { point: 'hips', amount: 90, beat: 12 }).events, 'posture_corrected')[0].seen;
    const b = ofType(act(s, 'posture/correct', { point: 'hips', amount: 90, beat: 12 }).events, 'posture_corrected')[0].seen;
    expect(a).toBe(b);
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(act(s, 'posture/correct', { point: 'hips', amount: 90, beat: 12 }).state.rng)).toBe(rng);
  });

  it('is refused with no hold, for a point the preset does not judge nowhere, and a bad payload', () => {
    expect(errors(act(posed(), 'posture/correct', { point: 'hips', amount: 20 }).events)).not.toEqual([]);
    const s = taken();
    expect(errors(act(s, 'posture/correct', { point: 'elbows', amount: 20 }).events)).not.toEqual([]);
    expect(errors(act(s, 'posture/correct', { point: 'hips', amount: -1 }).events)).not.toEqual([]);
    expect(errors(act(s, 'posture/correct', { point: 'hips' }).events)).not.toEqual([]);
  });
});

describe('posture/slip', () => {
  it('is one offence of hers and a slip the craft notes; the run\'s streak starts over', () => {
    const s = taken();
    s.relations[ANN].craft = { streak: { posture: 2 } };
    const r = act(s, 'posture/slip', { point: 'gaze' });
    ok(r);
    expect(ofType(r.events, 'posture_slip')).toEqual([expect.objectContaining({ unitId: ANN, holderId: ANN })]);
    expect(ofType(r.events, 'posture_slip_noted')).toEqual([expect.objectContaining({ unitId: ANN, point: 'gaze', presetId: 'kneel_upright' })]);
    expect(r.state.practices!.offences[ANN]).toHaveLength(1);
    expect(runOf(r.state)!.slips).toBe(1);
    expect(r.state.relations[ANN].craft?.streak?.posture).toBeUndefined();
    const again = act(r.state, 'posture/slip', { point: 'hips' });
    expect(again.state.practices!.offences[ANN]).toHaveLength(2); // one offence for each slip
    expect(runOf(again.state)!.slips).toBe(2);
  });

  it('a slip teaches by the same rule as any other (her punishment or her naming the point): the engine\'s lesson reads posture_slip', () => {
    const s = taken();
    unitOf(s, ANN).bond!.practice!.style = { primary: 'drill' };
    const r = act(s, 'posture/slip', { point: 'hips' });
    expect(ofType(r.events, 'lesson')).toHaveLength(1); // a drill holder names the point at once
  });

  it('is refused with no hold, and for a point that is not one', () => {
    expect(errors(act(posed(), 'posture/slip', { point: 'hips' }).events)).not.toEqual([]);
    expect(errors(act(taken(), 'posture/slip', { point: 'elbow' }).events)).not.toEqual([]);
  });
});

describe('posture/end', () => {
  const xpOf = (s: CampaignState) => s.commander.craft?.posture?.xp ?? 0;

  it('a clean hold to her release pays xp to posture, the pair\'s mastery of the preset and a record in fiction time (beats x 45 s)', () => {
    const r = act(taken(), 'posture/end', { reason: 'released', beats: 40 });
    ok(r);
    expect(xpOf(r.state)).toBe(TUNING.craft.xp.posture);
    expect(r.state.relations[ANN].craft!.postures!.kneel_upright.xp).toBe(TUNING.craft.xp.knowledge);
    expect(ofType(r.events, 'record_set')).toEqual([expect.objectContaining({ unitId: ANN, key: 'posture:kneel_upright', seconds: 40 * 45 })]);
    expect(r.state.relations[ANN].craft!.records!['posture:kneel_upright']).toMatchObject({ longest: 1800, clean: 1800 });
    expect(ofType(r.events, 'posture_ended')).toEqual([expect.objectContaining({ unitId: ANN, presetId: 'kneel_upright', reason: 'released', slips: 0, clean: true })]);
    expect(runOf(r.state)).toBeUndefined();
    expect(r.state.practices!.postureDay).toEqual({ day: r.state.day, holds: 1 });
    expect(r.state.relations[ANN].craft!.streak?.posture).toBe(1);
  });

  it('beats stretch with the level of the posture (+25 % a level), as every record does', () => {
    const s = taken();
    (s.commander.craft ??= {}).posture = { xp: 150, level: 3, lastDay: s.day };
    const r = act(s, 'posture/end', { reason: 'released', beats: 40 });
    expect(r.state.relations[ANN].craft!.records!['posture:kneel_upright'].longest).toBe(Math.round(40 * 45 * 1.75));
  });

  it('with no beats reported the planned length stands; with neither nothing is a record', () => {
    expect(act(taken('kneel_upright', { until: 20 }), 'posture/end', { reason: 'released' }).state.relations[ANN].craft!.records!['posture:kneel_upright'].longest).toBe(20 * 45);
    const bare = act(taken(), 'posture/end', { reason: 'released' });
    expect(ofType(bare.events, 'record_set')).toEqual([]);
  });

  it('a hold with a slip pays nothing and keeps no clean record, and the streak starts over; the longest still counts', () => {
    let s = taken();
    s = act(s, 'posture/slip', { point: 'hips' }).state;
    s.relations[ANN].craft = { ...(s.relations[ANN].craft ?? {}), streak: { posture: 2 } };
    const r = act(s, 'posture/end', { reason: 'released', beats: 40 });
    expect(xpOf(r.state)).toBe(0);
    expect(r.state.relations[ANN].craft!.postures).toBeUndefined();
    expect(r.state.relations[ANN].craft!.records!['posture:kneel_upright']).toMatchObject({ longest: 1800, clean: 0 });
    expect(r.state.relations[ANN].craft!.streak?.posture).toBeUndefined();
    expect(ofType(r.events, 'posture_ended')[0]).toMatchObject({ slips: 1, clean: false });
  });

  it('tapped out, a collapse: no pay, no clean; the stop word and a scene that ended are out of the fiction (no pay, no record, no Regard)', () => {
    for (const reason of ['tapped', 'collapse']) {
      const r = act(taken(), 'posture/end', { reason, beats: 40 });
      expect(xpOf(r.state), reason).toBe(0);
      expect(ofType(r.events, 'posture_ended')[0]).toMatchObject({ reason, clean: false });
    }
    for (const reason of ['stopped', 'gone']) {
      const s = taken('kneel_open');
      const regard = regardOf(s, reg, ANN);
      const r = act(s, 'posture/end', { reason, beats: 40 });
      expect(xpOf(r.state), reason).toBe(0);
      expect(ofType(r.events, 'record_set'), reason).toEqual([]);
      expect(r.state.practices!.postureDay, reason).toBeUndefined();
      expect(regardOf(r.state, reg, ANN), reason).toBe(regard);
    }
  });

  it('is refused with no hold, for a reason that is not one, and for beats that are not a count', () => {
    expect(errors(act(posed(), 'posture/end', { reason: 'released' }).events)).not.toEqual([]);
    expect(errors(act(taken(), 'posture/end', { reason: 'whim' }).events)).not.toEqual([]);
    expect(errors(act(taken(), 'posture/end', { reason: 'released', beats: -3 }).events)).not.toEqual([]);
  });

  it('the day\'s holds are the fatigue of the next: two holds earlier raise the drift', () => {
    let s = taken();
    s = act(s, 'posture/end', { reason: 'released', beats: 10 }).state;
    s = act(s, 'posture/take', { presetId: 'kneel_upright', at: 3 }).state;
    s = act(s, 'posture/end', { reason: 'released', beats: 10 }).state;
    expect(s.practices!.postureDay!.holds).toBe(2);
  });
});

describe('Regard and who saw', () => {
  const sceneWithBea = (): CampaignState => {
    const s = posed();
    withBea(s);
    s.scene!.participants = [ANN, BEA];
    return s;
  };
  const taking = (s: CampaignState, preset: string): CampaignState => { const r = act(s, 'posture/take', { presetId: preset, at: 1 }); ok(r); return r.state; };

  it('a humiliating posture lowers her Regard of the commander (the preset\'s humiliation); a posture of 0 does not', () => {
    const s = posed();
    const before = regardOf(s, reg, ANN);
    const low = act(taking(s, 'kneel_open'), 'posture/end', { reason: 'released', beats: 10 }).state;
    expect(regardOf(low, reg, ANN)).toBeLessThan(before);
    const flat = act(taking(posed(), 'attention'), 'posture/end', { reason: 'released', beats: 10 }).state;
    expect(regardOf(flat, reg, ANN)).toBe(before);
  });

  it('someone in the room who does not know falls too, by the witness factor, and the sign of the dynamic reaches her', () => {
    const s = sceneWithBea();
    const regardBea = regardOf(s, reg, BEA);
    const end = act(taking(s, 'kneel_open'), 'posture/end', { reason: 'released', beats: 10 }).state;
    expect(regardOf(end, reg, BEA)).toBeLessThan(regardBea);
    expect(end.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBeGreaterThan(0);
    // alone with her no sign reaches anyone
    const alone = act(taking(posed(), 'kneel_open'), 'posture/end', { reason: 'released', beats: 10 }).state;
    expect(alone.dynamic!.knowledge?.[BEA]?.[ANN]).toBeUndefined();
  });

  it('someone who already knows is no witness: no fall for her and no new sign', () => {
    const s = sceneWithBea();
    s.dynamic!.knowledge[BEA] = { [ANN]: { suspicion: 100, level: 'knows_dynamic' } } as never;
    const regardBea = regardOf(s, reg, BEA);
    const end = act(taking(s, 'kneel_open'), 'posture/end', { reason: 'released', beats: 10 }).state;
    expect(regardOf(end, reg, BEA)).toBe(regardBea);
    expect(levelOf(end, BEA, ANN)).toBe('knows_dynamic');
  });

  it('the situation adds to the preset: others in the room, and a long hold, cost more than the preset alone', () => {
    const regardAfter = (s: CampaignState, beats: number): number => regardOf(act(taking(s, 'kneel_open'), 'posture/end', { reason: 'released', beats }).state, reg, ANN);
    const alone = regardAfter(posed(), 10);
    const crowd = regardAfter(sceneWithBea(), 10);
    const long = regardAfter(posed(), 400); // 400 beats of 45 s: hours of fiction
    expect(crowd).toBeLessThan(alone);
    expect(long).toBeLessThan(alone);
  });
});

describe('her call, answered with a preset, may start a hold', () => {
  function called(s: CampaignState, callId: string, presetId: string): CampaignState {
    unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
    s.practices = { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, offences: {}, records: [], handovers: [],
      postures: { [ANN]: [{ postureId: presetId, name: 'X', day: s.day }, { postureId: 'kneel_open', name: 'Y', day: s.day }] },
      call: { id: callId, holderId: ANN, postureId: presetId, sceneId: s.scene!.id, at: 3 } } as never;
    s.relations[ANN].dynamic!.frame = 'role';
    return s;
  }
  const share = TUNING.craft.posture.holdShare.ritual;
  const idFor = (s: CampaignState, wants: boolean): string => {
    for (let n = 0; n < 200; n++) if ((craftRoll(s, ANN, `hold:pc${n}`) < share) === wants) return `pc${n}`;
    throw new Error('no call id');
  };

  it('when the roll under her style\'s share says so, the right answer starts the hold of the preset she called (her call as the source); else it only sets the posture', () => {
    const base = posed();
    const yes = idFor(base, true);
    const a = act(called(posed(), yes, 'kneel_present'), 'practice/take_posture', { callId: yes, postureId: 'kneel_present', late: false, at: 2 });
    ok(a);
    expect(runOf(a.state)).toMatchObject({ holderId: ANN, presetId: 'kneel_present', source: 'her_call' });
    expect(ofType(a.events, 'posture_taken')).toHaveLength(1);
    expect(a.state.scene!.blocking![COMMANDER]).toMatchObject({ posture: 'kneeling_upright', preset: 'kneel_present' });
    const no = idFor(base, false);
    const b = act(called(posed(), no, 'kneel_present'), 'practice/take_posture', { callId: no, postureId: 'kneel_present', late: false, at: 2 });
    expect(runOf(b.state)).toBeUndefined();
    expect(b.state.scene!.blocking![COMMANDER]).toMatchObject({ preset: 'kneel_present' });
  });

  it('a wrong or late answer starts no hold', () => {
    const base = posed();
    const yes = idFor(base, true);
    const r = act(called(posed(), yes, 'kneel_present'), 'practice/take_posture', { callId: yes, postureId: 'kneel_open', late: false, at: 2 });
    expect(runOf(r.state)).toBeUndefined();
  });

  it('draws nothing from the campaign rng', () => {
    const base = posed();
    const yes = idFor(base, true);
    const s = called(posed(), yes, 'kneel_present');
    const rng = JSON.stringify(s.rng);
    expect(JSON.stringify(act(s, 'practice/take_posture', { callId: yes, postureId: 'kneel_present', late: false, at: 2 }).state.rng)).toBe(rng);
  });
});

describe('the stop word and the scene end a posture hold', () => {
  it('the stop word always ends a posture run (it is out of the fiction: no pay)', () => {
    const s = taken();
    const r = act(s, 'physics/stop_word');
    ok(r);
    expect(ofType(r.events, 'posture_ended')).toEqual([expect.objectContaining({ reason: 'stopped' })]);
    expect(runOf(r.state)).toBeUndefined();
    expect(r.state.commander.craft?.posture?.xp ?? 0).toBe(0);
  });

  it('with no run and nothing to stop the stop word is refused as before', () => {
    expect(errors(act(posed(), 'physics/stop_word').events)).not.toEqual([]);
  });

  it('the scene ending takes the run with it (no pay, no record)', () => {
    const r = act(taken(), 'scene/end', {});
    expect(runOf(r.state)).toBeUndefined();
    expect(r.state.commander.craft?.posture?.xp ?? 0).toBe(0);
  });

  it('a soldier who leaves the service leaves no run behind', () => {
    const s = taken();
    expect(runOf(s)).toBeDefined();
    const r = act(s, 'scene/abort', {});
    expect(runOf(r.state)).toBeUndefined();
  });
});

describe('without the craft', () => {
  it('nothing is written and nothing is drawn: a holder at equal, no run, no events', () => {
    const s = world(reg, 'equal');
    const rng = JSON.stringify(s.rng);
    for (const [type, payload] of [['posture/correct', { point: 'hips', amount: 10 }], ['posture/slip', { point: 'hips' }], ['posture/end', { reason: 'released' }]] as const) {
      expect(errors(act(s, type, payload).events), type).not.toEqual([]);
    }
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(s.practices).toBeUndefined();
  });
});
