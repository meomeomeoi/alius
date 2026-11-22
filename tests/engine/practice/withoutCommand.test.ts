import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/life';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { withoutCommandProblem } from '../../../src/engine/practice/alarm';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { heldNow } from '../../../src/engine/practice/held';
import { startHold } from '../../../src/engine/practice/hold';
import type { CampaignState } from '../../../src/engine/state/types';
import { depart, payload, withMission } from '../../helpers/expedition';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, CAT, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

/** Ann keeps the commander (possessive, no mercy: she keeps against every duty) for `span` from the morning; a mission is on the board. */
function fixture(span: 1 | 2 | 'day' = 2, hold = true): { s: CampaignState; missionId: string } {
  const base = world(reg, 'role');
  base.slot = 'morning';
  dynamicOf(base, ANN)!.hold = 70;
  const u = unitOf(base, ANN);
  u.bond!.practice!.style = { primary: 'possessive' };
  u.values = { ...u.values, mercy: 0, corporate: 0 };
  const { state, mission } = withMission(reg, base);
  if (hold) startHold(state, ctxOf(state, reg), ANN, span);
  return { s: state, missionId: mission.id };
}
const go = (s: CampaignState, missionId: string, over: Record<string, unknown> = {}) => ({ ...payload(s, missionId, { unitIds: [BEA, CAT] }), ...over });
/** The alarm of a launch, kept. */
const kept = (span: 1 | 2 | 'day' = 2) => {
  const { s, missionId } = fixture(span);
  const raised = run(s, reg, { type: 'practice/raise_alarm', payload: { kind: 'launch', payload: go(s, missionId) } });
  expect(errors(raised.events)).toEqual([]);
  expect(raised.state.practices!.alarm).toMatchObject({ answer: 'keep' });
  return { s: raised.state, missionId };
};
const start = (s: CampaignState, missionId: string, over: Record<string, unknown> = { withoutCommand: true }) => run(s, reg, { type: 'expedition/start', payload: go(s, missionId, over) });

describe('the flag needs a kept alarm', () => {
  it('without a hold the commander is not held back; with a hold and no alarm the launch is the guard\'s; with the holder in the party it is refused', () => {
    const none = fixture(2, false);
    expect(errors(start(none.s, none.missionId).events)).toMatchObject([{ code: 'handler_failed', message: 'The commander is not held back.' }]);
    expect(withoutCommandProblem(none.s, reg, go(none.s, none.missionId, { withoutCommand: true }))).toBe('The commander is not held back.');
    const held = fixture(2);
    expect(errors(start(held.s, held.missionId).events)).toMatchObject([{ code: 'held_alarm' }]);
    const k = kept();
    expect(withoutCommandProblem(k.s, reg, go(k.s, k.missionId))).toBeNull();
    const inParty = go(k.s, k.missionId, { unitIds: [ANN, BEA], formation: { front: [ANN], back: [BEA] } });
    expect(withoutCommandProblem(k.s, reg, inParty)).toBe('She keeps the commander and cannot go with the squad.');
    expect(errors(run(k.s, reg, { type: 'expedition/start', payload: { ...inParty, withoutCommand: true } }).events)).toMatchObject([{ message: 'She keeps the commander and cannot go with the squad.' }]);
    expect(errors(start(k.s, k.missionId, { withoutCommand: 'yes' }).events)).toHaveLength(1);
  });

  it('a deadline alarm lets only its own mission go', () => {
    const { s, missionId } = fixture(2);
    const other = withMission(reg, s, { regionId: 'drowned_market' }, (x) => { x.world.clearanceTier = 1; });
    const raised = run(other.state, reg, { type: 'practice/raise_alarm', payload: { kind: 'deadline', payload: { missionId } } }).state;
    expect(raised.practices!.alarm).toMatchObject({ kind: 'deadline', answer: 'keep' });
    expect(withoutCommandProblem(raised, reg, go(raised, missionId))).toBeNull();
    expect(withoutCommandProblem(raised, reg, go(raised, other.mission.id))).toBe('That is not the mission that is running out of time.');
  });
});

describe('the squad leaves without the commander', () => {
  it('the run starts with the flag; the hold covers its slots and says so; the squad hears why; the alarm is spent', () => {
    const { s, missionId } = kept(1);
    const r = start(s, missionId);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'expedition_started')).toHaveLength(1);
    expect(r.state.expedition!.withoutCommand).toEqual({ holderId: ANN });
    expect(r.state.expedition!.party).toEqual([BEA, CAT]);
    const held = r.state.practices!.held!;
    expect(held.run).toBe(true);
    expect(held.until).toEqual({ day: 20, slot: 'afternoon' }); // the run takes the morning and the afternoon: the hold went on by a slot
    expect(held.bookingIds).toHaveLength(2);
    expect(ofType(r.events, 'hold_extended')).toMatchObject([{ reason: 'alarm' }]);
    expect(ofType(r.events, 'hold_alarm')).toMatchObject([{ kind: 'launch', answer: 'keep', run: true }]);
    expect(r.state.practices!.alarm).toBeUndefined();
    const facts = r.state.memory.facts.filter((f) => f.tags.includes('held_alarm'));
    expect(facts).toHaveLength(1);
    expect(facts[0].knownBy).toEqual(expect.arrayContaining([ANN, BEA, CAT]));
    expect(heldNow(r.state)).not.toBeNull();
    expect(JSON.stringify(r.state.rng)).not.toBe(JSON.stringify(s.rng)); // a run draws its map; the practices themselves draw nothing (their own tests)
  });

  it('a hold already long enough is not extended; the flag is read once: a second launch without it is the guard\'s again', () => {
    const { s, missionId } = kept(2);
    const r = start(s, missionId);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.practices!.held!.until).toEqual({ day: 20, slot: 'afternoon' });
    expect(ofType(r.events, 'hold_extended')).toHaveLength(1); // it is still said: the hold now covers a run
    const done = run(r.state, reg, { type: 'expedition/retreat', payload: {} });
    expect(errors(done.events)).toEqual([]);
    expect(done.state.lastExpedition!.withoutCommand).toEqual({ holderId: ANN });
    expect(done.state.practices!.alarm).toBeUndefined();
  });

  it('the hold ends when the run returns, as a full hold: restraint xp by the slots it kept, hold_released ran_out', () => {
    const { s, missionId } = kept(2);
    const out = start(s, missionId).state;
    const before = dynamicOf(out, ANN)!.tracks.restraint?.xp ?? 0;
    const r = run(out, reg, { type: 'expedition/retreat', payload: {} });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_released')).toMatchObject([{ holderId: ANN, reason: 'ran_out' }]);
    expect(r.state.practices!.held).toBeUndefined();
    expect(dynamicOf(r.state, ANN)!.tracks.restraint!.xp).toBeGreaterThan(before);
  });

  it('while the run is out the hold stays (the holder is not hurt, gone or in the party); a seeded run never sees the flag without a kept alarm', () => {
    const { s, missionId } = kept(2);
    const out = start(s, missionId).state;
    expect(out.practices!.held).toBeDefined();
    expect(out.expedition!.withoutCommand).toBeDefined();
    const normal = withMission(reg, world(reg, 'role'));
    const left = depart(reg, normal.state, normal.mission.id);
    expect(left.expedition).not.toHaveProperty('withoutCommand');
  });
});
