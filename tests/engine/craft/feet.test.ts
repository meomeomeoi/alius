/**
 * P16b Task 14: the day of her feet (derived, nothing stored), her care in her combat form (+3 / -3 %, only for a craft-live holder) and her foot language as the
 * instrument reports it (named once, answered, missed). Nothing here draws.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/craft';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { buildCombat, resetCombatPassives } from '../../../src/engine/combat/build';
import { defaultFormation } from '../../../src/engine/combat/stats';
import type { StartPayload } from '../../../src/engine/combat/types';
import { careOfFeet, caredForFeet, feetOfDay, motionsOf, noteFootSignal } from '../../../src/engine/craft/feet';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { whereaboutAt } from '../../../src/engine/hub';
import { isPrivateRoom, busySlot } from '../../../src/engine/life/places';
import { signalsOf } from '../../../src/engine/physics/service';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { loadCore } from '../../helpers/world';
import { COMMANDER, registerFrameReader, setBlocking } from '../../../src/engine/blocking';
import { errors, run } from '../../helpers/world';
import { ANN, withService, world } from './world';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/scene';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); resetCombatPassives(); installCraftHooks(); });

const ranOn = (s: CampaignState, day: number, party: string[] = [ANN]): void => { s.lastExpedition = { id: 'r1', day, party, regionId: 'x', missionId: 'm', missionTitle: 'm', outcome: 'success', nodes: [], log: [], loot: [], injuries: [], deaths: [], breakdowns: [], acknowledged: true, debriefed: true } as never; };

describe('the day of her feet', () => {
  it('is sore the day of a run she was in and the day after, and not the day after that', () => {
    const s = world(reg, 'play');
    ranOn(s, s.day);
    expect(feetOfDay(s, reg, ANN).state).toBe('sore');
    ranOn(s, s.day - 1);
    expect(feetOfDay(s, reg, ANN).state).toBe('sore');
    ranOn(s, s.day - 2);
    expect(feetOfDay(s, reg, ANN).state).not.toBe('sore');
    ranOn(s, s.day, ['unit_bea']);
    expect(feetOfDay(s, reg, ANN).state).not.toBe('sore');
  });

  it('is bare when she is in her quarters in the evening (her whereabouts now), by field of the room', () => {
    const s = world(reg, 'play');
    s.slot = 'evening';
    const states = new Set<string>();
    for (let day = 3; day < 60; day++) {
      s.day = day;
      const room = whereaboutAt(s, reg, ANN, s.day, s.slot).roomId;
      const own = room !== null && isPrivateRoom(reg, room);
      const now = feetOfDay(s, reg, ANN).state;
      expect(now === 'bare').toBe(own);
      states.add(now);
    }
    expect(states.has('bare')).toBe(true);
    s.slot = 'morning';
    for (let day = 3; day < 30; day++) { s.day = day; expect(feetOfDay(s, reg, ANN).state).not.toBe('bare'); }
  });

  it('is hot after a training today, worn or hot or fresh by a hash otherwise, and her footwear is the engine\'s', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    const seen = new Set<string>();
    for (let day = 3; day < 80; day++) { s.day = day; seen.add(feetOfDay(s, reg, ANN).state); }
    expect([...seen].sort()).toEqual(['fresh', 'hot', 'worn']);
    s.day = 20;
    const trainer = [...reg.activities.values()].find((a) => ((a.effects as Array<{ type: string }> | undefined) ?? []).some((e) => TUNING.dynamic.style.trainingEffects.includes(e.type)));
    expect(trainer).toBeDefined();
    s.life = { busy: [{ unitId: ANN, slot: busySlot(s.day, 'morning'), activityId: trainer!.id }] } as never;
    expect(feetOfDay(s, reg, ANN)).toEqual({ footwear: 'boots', state: 'hot' });
  });

  it('stores nothing and draws nothing', () => {
    const s = world(reg, 'play');
    ranOn(s, s.day);
    const before = JSON.stringify(s);
    for (let i = 0; i < 3; i++) feetOfDay(s, reg, ANN);
    careOfFeet(s, reg, ANN);
    expect(JSON.stringify(s)).toBe(before);
  });
});

const husk = { enemyId: 'husk', level: 1, affixes: [] as string[] };
const payloadOf = (s: CampaignState): StartPayload => ({ encounter: { enemies: [husk], danger: 1 }, formation: defaultFormation(s, reg, s.roster.activeIds) });
const formOf = (s: CampaignState) => buildCombat(s, reg, new Rng(seedRng(9)), payloadOf(s)).combatants.find((c) => c.unitId === ANN)!.passives.filter((p) => p.source === 'dynamic').map((p) => ({ type: p.type, pct: (p as { pct?: number }).pct }));

describe('her care in her combat form', () => {
  it('+3 outgoing (-3 incoming) after a pleased service since her last run; -3 when she is sore and nothing was done; nothing otherwise', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    s.day = 12; // a day that is neither wet nor worn nor hot by the hash is not needed: only sore and cared are read
    expect(careOfFeet(s, reg, ANN)).toEqual([]);
    ranOn(s, s.day - 1);
    expect(careOfFeet(s, reg, ANN)).toEqual([{ type: 'outgoing', pct: -3 }, { type: 'incoming', pct: 3 }]);
    s.relations[ANN].craft = { footCare: { day: s.day } };
    expect(caredForFeet(s, ANN)).toBe(true);
    expect(careOfFeet(s, reg, ANN)).toEqual([{ type: 'outgoing', pct: 3 }, { type: 'incoming', pct: -3 }]);
  });

  it('a care from before her last run does not count, nor one older than careDays', () => {
    const s = world(reg, 'play');
    ranOn(s, s.day - 1);
    s.relations[ANN].craft = { footCare: { day: s.day - 1 } };
    expect(caredForFeet(s, ANN)).toBe(false);
    ranOn(s, s.day - 30, ['unit_bea']);
    s.relations[ANN].craft = { footCare: { day: s.day - TUNING.craft.feet.careDays - 1 } };
    expect(caredForFeet(s, ANN)).toBe(false);
    s.relations[ANN].craft = { footCare: { day: s.day - TUNING.craft.feet.careDays } };
    expect(caredForFeet(s, ANN)).toBe(true);
  });

  it('is 0 without craft (a holder at equal, no holder): the entries are unchanged', () => {
    const s = world(reg, 'equal');
    ranOn(s, s.day - 1);
    s.relations[ANN].craft = { footCare: { day: s.day } };
    expect(careOfFeet(s, reg, ANN)).toEqual([]);
    expect(formOf(s)).toEqual([]);
  });

  it('is in her combatant (source dynamic) through the registered passive, and only hers', () => {
    const s = world(reg, 'play');
    ranOn(s, s.day - 1);
    s.relations[ANN].craft = { footCare: { day: s.day } };
    expect(formOf(s)).toEqual([{ type: 'outgoing', pct: 3 }, { type: 'incoming', pct: -3 }]);
    const bea = buildCombat(s, reg, new Rng(seedRng(9)), payloadOf(s)).combatants.find((c) => c.unitId === 'unit_bea');
    if (bea !== undefined) expect(bea.passives.filter((p) => p.source === 'dynamic')).toEqual([]);
  });
});

describe('her foot language', () => {
  const motion = (s: CampaignState, i = 0): string => signalsOf(s, ANN)[i]!.motion;

  it('she names a motion once: the first report gives foot_signal_given, a later one does not', () => {
    const s = world(reg, 'play');
    const m = motion(s);
    const first = noteFootSignal(s, reg, ANN, m, true);
    expect(first.filter((e) => e.type === 'foot_signal_given')).toEqual([{ type: 'foot_signal_given', unitId: ANN, motion: m }]);
    expect(s.relations[ANN].craft!.signals![m]).toMatchObject({ named: true, answered: 1, day: s.day });
    const again = noteFootSignal(s, reg, ANN, m, true);
    expect(again.some((e) => e.type === 'foot_signal_given')).toBe(false);
    expect(s.relations[ANN].craft!.signals![m]!.answered).toBe(2);
  });

  it('an answered one is practice of the commander\'s memory', () => {
    const s = world(reg, 'play');
    const events = noteFootSignal(s, reg, ANN, motion(s), true);
    expect(events).toContainEqual(expect.objectContaining({ type: 'craft_xp', key: 'memory', gained: TUNING.craft.xp.knowledge }));
    expect(s.commander.craft!.memory!.xp).toBe(TUNING.craft.xp.knowledge);
  });

  it('a missed one is foot_signal_missed and a slip that waits for her punishment; it is no offence and pays nothing', () => {
    const s = world(reg, 'play');
    s.scene = { id: 'sc1', exchanges: 2, participants: [ANN] } as never;
    const m = motion(s, 1);
    const events = noteFootSignal(s, reg, ANN, m, false);
    expect(events).toContainEqual({ type: 'foot_signal_missed', unitId: ANN, motion: m });
    expect(events.some((e) => e.type === 'craft_xp' || e.type.startsWith('offence'))).toBe(false);
    expect(s.relations[ANN].craft!.signals![m]).toMatchObject({ named: true, answered: 0 });
    expect(s.relations[ANN].craft!.slips).toEqual([{ key: 'memory', scene: 'sc1', day: s.day }]);
  });

  it('writes nothing for a motion she does not have, or without craft', () => {
    const s = world(reg, 'play');
    expect(noteFootSignal(s, reg, ANN, 'wave', true)).toEqual([]);
    expect(motionsOf(s, ANN)).toHaveLength(5);
    const q = world(reg, 'equal');
    expect(noteFootSignal(q, reg, ANN, motion(q), true)).toEqual([]);
    expect(q.relations[ANN].craft).toBeUndefined();
    expect(q.commander.craft).toBeUndefined();
  });

  it('draws no rng', () => {
    const s = world(reg, 'play');
    const rng = JSON.stringify(s.rng);
    noteFootSignal(s, reg, ANN, motion(s), true);
    noteFootSignal(s, reg, ANN, motion(s, 2), false);
    expect(JSON.stringify(s.rng)).toBe(rng);
  });
});

describe('physics/service carries her foot language and her care', () => {
  /** Her frame under the desk, she holds at `play` and is craft-live. */
  function underDesk(): CampaignState {
    registerFrameReader(() => 'play');
    const s = withService(world(reg, 'play'));
    s.relations[ANN].stateId = 'confidant';
    s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'worship', 'objectification'])] };
    s.slot = 'afternoon';
    const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
    setBlocking(st, { registries: reg }, { person: ANN, field: 'activity', value: 'reading_reports' }, { at: 1, source: 'chip' });
    setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'under_desk' }, { at: 2, source: 'reading' });
    expect(st.scene!.physics?.sourceKind).toBe('activity');
    return st;
  }

  it('a signal alone is reported without a verdict; the verdict alone still rates, and a pleased one cares for her feet', () => {
    const s = underDesk();
    const runId = s.scene!.physics!.id;
    const m = signalsOf(s, ANN)[0]!.motion;
    const a = run(s, reg, { type: 'physics/service', payload: { runId, signal: { motion: m, answered: true } } });
    expect(errors(a.events)).toEqual([]);
    expect(a.events.map((e) => e.type)).toEqual(expect.arrayContaining(['foot_signal_given', 'craft_xp']));
    expect(a.events.some((e) => e.type === 'service_rated')).toBe(false);
    expect(a.state.relations[ANN].craft!.footCare).toBeUndefined();
    expect(a.state.rng).toEqual(s.rng);
    const b = run(a.state, reg, { type: 'physics/service', payload: { runId, verdict: 'pleased' } });
    expect(errors(b.events)).toEqual([]);
    expect(b.events.some((e) => e.type === 'service_rated')).toBe(true);
    expect(b.state.relations[ANN].craft!.footCare).toEqual({ day: s.day });
  });

  it('a displeased verdict does not care for her feet; a second verdict in the scene is not noted either', () => {
    const s = underDesk();
    const runId = s.scene!.physics!.id;
    const a = run(s, reg, { type: 'physics/service', payload: { runId, verdict: 'displeased' } });
    expect(a.state.relations[ANN].craft?.footCare).toBeUndefined();
    const b = run(a.state, reg, { type: 'physics/service', payload: { runId, verdict: 'pleased' } });
    expect(b.state.relations[ANN].craft?.footCare).toBeUndefined();
  });

  it('refuses a payload with neither, a bad signal or a bad verdict', () => {
    const s = underDesk();
    const runId = s.scene!.physics!.id;
    for (const payload of [{ runId }, { runId, signal: { motion: 'tap2' } }, { runId, signal: { motion: 3, answered: true } }, { runId, verdict: 'thrilled', signal: { motion: 'tap2', answered: true } }]) {
      expect(errors(run(s, reg, { type: 'physics/service', payload }).events).length).toBeGreaterThan(0);
    }
  });
});
