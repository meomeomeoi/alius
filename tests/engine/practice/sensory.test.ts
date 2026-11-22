import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { addRecord } from '../../../src/engine/discipline/record';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { effectsOfEntry } from '../../../src/engine/blocking/types';
import { endHold, forgotChance, holdSweep, sensoryNow, startHold } from '../../../src/engine/practice/hold';
import { heldNow } from '../../../src/engine/practice/held';
import { practiceRoll } from '../../../src/engine/practice/state';
import { issuedDirective, practiceDirectives } from '../../../src/practice/directives';
import type { CampaignState } from '../../../src/engine/state/types';
import { ctxOf, errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { vi.unstubAllGlobals(); });

type Style = 'affectionate' | 'ritual' | 'cruel' | 'cold' | 'drill' | 'playful';
/** Ann at role, morning of day 20, close tier (the blocking is live in a scene with her). */
const calm = (style: Style = 'cold'): CampaignState => {
  const s = world(reg, 'role');
  s.slot = 'morning';
  s.relations[ANN].stateId = 'lover';
  dynamicOf(s, ANN)!.hold = 70;
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  return s;
};
const held = (s: CampaignState, span: 1 | 2 | 'day' = 2, opts: Parameters<typeof startHold>[4] = {}) => {
  const d = structuredClone(s);
  const events = startHold(d, ctxOf(d, reg), ANN, span, opts);
  return { d, events };
};
const ask = (s: CampaignState) => run(s, reg, { type: 'practice/ask_release', payload: {} });
const pass = (s: CampaignState, n = 1): CampaignState => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = run(cur, reg, { type: 'calendar/consume_slot' }).state;
  return cur;
};
/** The first item of the pack that darkens the commander's sight (read by its effect, never by id). */
const darkItem = (): string => [...reg.blockingItems.values()].find((e) => effectsOfEntry(e).some((x) => x.type === 'filter' && x.kind === 'sensory_dark'))!.id as string;
const withScene = (s: CampaignState): CampaignState => {
  s.scene = { id: 's1', day: s.day, slot: s.slot, locationId: 'quarters_unit', participants: [ANN], mode: 'private', origin: 'event', consumesSlot: true, startIndex: 0, readIndex: 0, exchanges: 0 } as never;
  return s;
};
/** Moves her Impunity to at least / at most a value through the record (the one stored term). */
const impunityAt = (s: CampaignState, atLeast: boolean, n: number): void => {
  for (let i = 0; i < 40 && (atLeast ? impunityOf(s, reg, ANN)!.value < n : impunityOf(s, reg, ANN)!.value >= n); i++) addRecord(s, ANN, atLeast ? 10 : -10, 'test');
  expect(atLeast ? impunityOf(s, reg, ANN)!.value >= n : impunityOf(s, reg, ANN)!.value < n).toBe(true);
};

describe('sensory is derived', () => {
  it('a sensory hold is sensory; a blindfold worn (a filter sensory_dark effect) is sensory; neither is not; reading never asks the media query', () => {
    const spy = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', spy);
    expect(sensoryNow(held(calm(), 1, { sensory: true }).d, reg)).toBe(true);
    expect(sensoryNow(held(calm(), 1).d, reg)).toBe(false);
    expect(sensoryNow(calm(), reg)).toBe(false);
    const eyes = withScene(calm());
    eyes.scene!.blocking = { commander: { worn: { eyes: { id: darkItem(), since: 0 } } } };
    expect(sensoryNow(eyes, reg)).toBe(true); // no hold at all: the blindfold alone dims the device
    const other = withScene(calm());
    other.scene!.blocking = { commander: { posture: 'kneeling_upright' } };
    expect(sensoryNow(other, reg)).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the hold scene blindfolds through the blocking', () => {
  it('at scene_started with her in a sensory hold the commander wears the first allowed sensory_dark item; the hold\'s end takes it off and leaves nothing on the staging log', () => {
    const s = held(calm(), 2, { sensory: true }).d;
    const r = run(s, reg, { type: 'scene/start', payload: { origin: 'event', startIndex: 0, locationId: 'quarters_unit', participants: [ANN] } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.scene!.blocking?.commander?.worn?.eyes?.id).toBe(darkItem());
    expect(r.state.practices!.held!.eyes).toBe(darkItem());
    expect(r.state.scene!.stagingLog ?? []).toEqual([]); // the engine's own setup is not a change a swipe could take back
    const d = structuredClone(r.state);
    const events = endHold(d, ctxOf(d, reg), 'asked');
    expect(ofType(events, 'hold_released')).toHaveLength(1);
    expect(d.scene!.blocking?.commander?.worn).toBeUndefined();
    expect(JSON.stringify(d.scene)).not.toContain(darkItem());
  });

  it('a hold that is not sensory leaves the commander\'s eyes alone, and so does a blindfold already worn', () => {
    const plain = run(held(calm(), 2).d, reg, { type: 'scene/start', payload: { origin: 'event', startIndex: 0, locationId: 'quarters_unit', participants: [ANN] } });
    expect(plain.state.scene!.blocking?.commander?.worn).toBeUndefined();
    expect(plain.state.practices!.held!.eyes).toBeUndefined();
  });
});

describe('asking to be let go', () => {
  it('affectionate at favour 0 releases; the hold is over at once, with no xp', () => {
    const s = held(calm('affectionate'), 2).d;
    dynamicOf(s, ANN)!.favour = 0;
    const r = ask(s);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'hold_asked')).toMatchObject([{ holderId: ANN, answer: 'release' }]);
    expect(ofType(r.events, 'hold_released')).toMatchObject([{ reason: 'asked' }]);
    expect(r.state.practices!.held).toBeUndefined();
    expect(dynamicOf(r.state, ANN)!.tracks.restraint).toBeUndefined();
    dynamicOf(s, ANN)!.favour = -1;
    expect(ofType(ask(s).events, 'hold_asked')).toMatchObject([{ answer: 'refuse' }]); // below favour 0 she does not
  });

  it('ritual refuses before the named end and lets go at it', () => {
    const s = held(calm('ritual'), 2).d;
    const early = ask(s);
    expect(ofType(early.events, 'hold_asked')).toMatchObject([{ answer: 'refuse' }]);
    expect(early.state.practices!.held).toBeDefined();
    const last = pass(s);
    expect(last.slot).toBe('afternoon');
    expect(ofType(ask(last).events, 'hold_released')).toMatchObject([{ reason: 'asked' }]);
    const drill = ask(held(calm('drill'), 2).d);
    expect(ofType(drill.events, 'hold_asked')).toMatchObject([{ answer: 'refuse' }]);
  });

  it('cruel at Impunity 70 extends the hold by one slot (hold_extended asked); below 60 she only refuses', () => {
    const s = held(calm('cruel'), 1).d;
    impunityAt(s, true, 70);
    const r = ask(s);
    expect(ofType(r.events, 'hold_asked')).toMatchObject([{ answer: 'extend' }]);
    expect(ofType(r.events, 'hold_extended')).toMatchObject([{ reason: 'asked', slots: 1 }]);
    expect(r.state.practices!.held).toMatchObject({ until: { day: 20, slot: 'afternoon' }, extended: 1 });
    expect(r.state.practices!.held!.bookingIds).toHaveLength(2);
    expect(r.state.personal!.bookings!.filter((b) => b.source === 'practice').map((b) => b.slot)).toEqual(['morning', 'afternoon']);
    const low = held(calm('cruel'), 1).d;
    impunityAt(low, false, 60);
    expect(ofType(ask(low).events, 'hold_asked')).toMatchObject([{ answer: 'refuse' }]);
    expect(ofType(ask(low).events, 'hold_extended')).toEqual([]);
  });

  it('cold refuses in silence: no line for the model; the others refuse with one', () => {
    const cold = ask(held(calm('cold'), 2).d);
    const ev = ofType(cold.events, 'hold_asked')[0];
    expect(ev).toMatchObject({ answer: 'refuse', silent: true });
    const scened = withScene(cold.state);
    expect(issuedDirective(ev, scened, reg)).toBeNull();
    const playful = ask(held(calm('playful'), 2).d);
    const words = ofType(playful.events, 'hold_asked')[0];
    expect(words).not.toHaveProperty('silent');
    const line = issuedDirective(words, withScene(playful.state), reg);
    expect(line?.id).toBe(`practice:issued:${ANN}`);
    expect(line?.expiresAfter).toBe('next_reply');
    expect(line?.text).not.toMatch(/\d/);
  });

  it('asking with no hold throws; a hold that is not hers to give up still answers; no rng is drawn', () => {
    expect(errors(ask(calm()).events)).toHaveLength(1);
    const s = held(calm('affectionate'), 2).d;
    const r = ask(s);
    expect(JSON.stringify(r.state.rng)).toBe(JSON.stringify(s.rng));
  });
});

describe('forgot', () => {
  const dayWhere = (style: Style, hit: boolean): number => {
    const s = calm(style);
    for (let d = 1; d < 400; d++) { s.day = d; if ((practiceRoll(s, ANN, `forgot:${d}`) < forgotChance(s, reg, ANN)) === hit) return d; }
    throw new Error('no such day');
  };

  it('a cruel holder on a hit day extends by one slot when the last one ends (hold_extended forgot), once; on any other day it ends', () => {
    const d = dayWhere('cruel', true);
    const s = calm('cruel');
    s.day = d;
    const one = held(s, 1).d;
    const after = run(one, reg, { type: 'calendar/consume_slot' });
    expect(ofType(after.events, 'hold_extended')).toMatchObject([{ reason: 'forgot', slots: 1 }]);
    expect(after.state.practices!.held).toMatchObject({ until: { day: d, slot: 'afternoon' }, forgot: true });
    expect(heldNow(after.state)).not.toBeNull(); // the afternoon is still hers
    const over = run(after.state, reg, { type: 'calendar/consume_slot' });
    expect(ofType(over.events, 'hold_released')).toMatchObject([{ reason: 'ran_out' }]);
    expect(ofType(over.events, 'hold_extended')).toEqual([]); // once
    const miss = calm('cruel');
    miss.day = dayWhere('cruel', false);
    expect(ofType(run(held(miss, 1).d, reg, { type: 'calendar/consume_slot' }).events, 'hold_released')).toMatchObject([{ reason: 'ran_out' }]);
  });

  it('never past the evening unless the hold is already there: an evening hold that ran out into the morning is over; one that reached the Night goes into it', () => {
    const s = calm('cruel');
    s.day = dayWhere('cruel', true);
    s.slot = 'evening';
    const d = held(s, 1).d;
    const morning = structuredClone(d);
    morning.day += 1;
    morning.slot = 'morning';
    expect(ofType(holdSweep(morning, ctxOf(morning, reg)), 'hold_released')).toHaveLength(1);
    const night = structuredClone(d);
    night.slot = 'night';
    const events = holdSweep(night, ctxOf(night, reg));
    expect(ofType(events, 'hold_extended')).toMatchObject([{ reason: 'forgot' }]);
    expect(night.practices!.held!.until).toEqual({ day: d.day, slot: 'night' });
  });

  it('a drill holder never forgets; a cruel one at Impunity 60 and above forgets more often than one below', () => {
    expect(forgotChance(calm('drill'), reg, ANN)).toBe(0);
    const hi = calm('cruel');
    impunityAt(hi, true, 60);
    const lo = calm('cruel');
    impunityAt(lo, false, 60);
    expect(forgotChance(hi, reg, ANN)).toBeGreaterThan(forgotChance(lo, reg, ANN));
    expect(forgotChance(calm('cruel'), reg, ANN)).toBeGreaterThanOrEqual(0.3);
    expect(forgotChance(calm('cold'), reg, ANN)).toBeLessThan(0.3);
  });

  it('no rng is drawn: the extension is the hashed roll\'s, and the directive still says the hold', () => {
    const s = calm('cruel');
    s.day = dayWhere('cruel', true);
    const d = held(s, 1).d;
    d.slot = 'afternoon'; // the one slot passed
    const before = JSON.stringify(d.rng);
    expect(ofType(holdSweep(d, ctxOf(d, reg)), 'hold_extended')).toHaveLength(1);
    expect(JSON.stringify(d.rng)).toBe(before);
    expect(practiceDirectives(d, reg, [ANN]).some((x) => x.id === 'practice:held')).toBe(true);
    const drill = held(calm('drill'), 1).d;
    drill.slot = 'afternoon';
    expect(ofType(holdSweep(drill, ctxOf(drill, reg)), 'hold_released')).toHaveLength(1);
  });
});
