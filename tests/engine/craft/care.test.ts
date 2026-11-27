/**
 * P16b Task 15: unasked care (ruling 7 and 18): an action `care/unasked { unitId, careId }` that spends one slot on her without her asking. Whether she notices is a hashed roll
 * (`craftRoll`: the same on the same day, no draw), kept hidden until she shows it (her next scene or DM); what lands when she shows it depends on the frame (nothing but the
 * noticing at `equal`, favour, the motive `her` and Regard from `play`); and at the fourth shown care in 7 days a woman on `testing` with a manner may name the service.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/comms';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/scene';
import { resetBlockingHooks } from '../../../src/engine/blocking';
import { heldGuard } from '../../../src/engine/practice/held';
import { careKinds, careNoticeChance, careReason, landCares, namesService, noticesCare, shownCares } from '../../../src/engine/craft/care';
import { installCraftHooks } from '../../../src/engine/craft/hooks';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); resetPhysicsHooks(); installCraftHooks(); });

const BOOTS = 'polishing_her_boots';
const care = (s: CampaignState, careId = BOOTS, unitId = ANN) => run(s, reg, { type: 'care/unasked', payload: { unitId, careId } });
const meet = (s: CampaignState) => run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
const withCares = (s: CampaignState, cares: Array<{ day: number; careId: string; noticed: boolean; voiced?: true; named?: true }>): CampaignState => { s.relations[ANN].craft = { ...(s.relations[ANN].craft ?? {}), cares }; return s; };

describe('what a care is (read by field)', () => {
  it('the rows with a `care` field, in registry order, each with how easily she sees it', () => {
    const rows = careKinds(reg);
    expect(rows.length).toBeGreaterThanOrEqual(5);
    for (const id of ['polishing_her_boots', 'tidying_her_quarters', 'doing_her_laundry', 'preparing_her_gear', 'cleaning_her_weapon']) expect(rows.map((r) => r.id)).toContain(id);
    for (const r of rows) expect(['low', 'high']).toContain(r.notice);
    expect(rows.every((r) => reg.blockingActivities.get(r.id)?.actor === 'commander' && reg.blockingActivities.get(r.id)?.scope === 'dynamic')).toBe(true);
    expect(rows.map((r) => r.id)).toEqual([...reg.blockingActivities.values()].filter((a) => (a as { care?: unknown }).care !== undefined).map((a) => String(a.id)));
  });
});

describe('the action', () => {
  it('spends one slot and writes the care for the day; the event is the same whether she noticed or not', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    const r = care(s);
    expect(errors(r.events)).toEqual([]);
    expect(r.state.slot).toBe('afternoon');
    expect(ofType(r.events, 'care_unasked')).toEqual([{ type: 'care_unasked', unitId: ANN, careId: BOOTS }]);
    expect(r.events.some((e) => e.type === 'care_noticed')).toBe(false);
    expect(r.state.relations[ANN].craft!.cares).toEqual([expect.objectContaining({ day: s.day, careId: BOOTS, noticed: expect.any(Boolean) })]);
    expect(r.state.rng).toEqual(s.rng);
  });

  it('is refused without careOpen (no dynamic block, no profile), for an unknown or non-care id, and for a unit that is not a soldier', () => {
    const none = world(reg, 'play');
    delete none.relations[ANN].dynamic;
    expect(errors(care(none).events).length).toBeGreaterThan(0);
    const noProfile = world(reg, 'play');
    delete unitOf(noProfile, ANN).bond!.practice;
    expect(errors(care(noProfile).events).length).toBeGreaterThan(0);
    const s = world(reg, 'play');
    for (const careId of ['no_such', 'standing_by', 'attending']) expect(errors(care(s, careId).events).length, careId).toBeGreaterThan(0);
    expect(errors(care(s, BOOTS, BEA).events).length).toBeGreaterThan(0);
    expect(errors(run(s, reg, { type: 'care/unasked', payload: { unitId: ANN } }).events).length).toBeGreaterThan(0);
  });

  it('is refused while she is with the commander: in a scene with her, or holding the commander', () => {
    const s = world(reg, 'play');
    const open = meet(s).state;
    expect(errors(care(open).events).length).toBeGreaterThan(0);
    const held = world(reg, 'play');
    held.personal = { seq: 9, bookings: [{ id: 'bk_held', unitId: ANN, kindId: 'evening_with_me', day: held.day, slot: held.slot, status: 'booked', source: 'practice', made: held.day }] } as never;
    held.practices = { ...(held.practices ?? {}), held: { by: ANN, since: { day: held.day, slot: held.slot }, until: { day: held.day, slot: held.slot }, sensory: false, extended: 0, bookingIds: ['bk_held'] } } as never;
    expect(errors(care(held).events).length).toBeGreaterThan(0);
  });

  it('is refused while another woman holds the commander (her booking must not lapse), by the engine and by the dispatch guard; the menu shows the reason', () => {
    const s = world(reg, 'play');
    s.personal = { seq: 9, bookings: [{ id: 'bk_held', unitId: BEA, kindId: 'held_in_quarters', day: s.day, slot: s.slot, status: 'booked', source: 'practice', made: s.day }] } as never;
    s.practices = { handovers: [], ...(s.practices ?? {}), held: { by: BEA, since: { day: s.day, slot: s.slot }, until: { day: s.day, slot: s.slot }, sensory: false, extended: 0, bookingIds: ['bk_held'] } } as never;
    expect(careReason(s, reg, ANN, BOOTS)).not.toBeNull();
    const r = care(s);
    expect(errors(r.events).length).toBeGreaterThan(0);
    expect(r.events.some((e) => e.type === 'booking_lapsed' || e.type === 'care_unasked')).toBe(false);
    expect(heldGuard(s, reg, { type: 'care/unasked', payload: { unitId: ANN, careId: BOOTS } })?.code).toBe('held');
  });

  it('is refused while a booking is due (the dispatch guard), and once the same care is done the same day', () => {
    const s = world(reg, 'play');
    s.personal = { seq: 9, bookings: [{ id: 'bk1', unitId: BEA, kindId: 'evening_with_me', day: s.day, slot: s.slot, status: 'booked', source: 'roll', made: s.day }] } as never;
    expect(care(s).events.some((e) => e.type === 'error' && e.code === 'booking_due')).toBe(true);
    const ok = world(reg, 'play');
    ok.slot = 'morning';
    const first = care(ok).state;
    expect(errors(care(first).events).length).toBeGreaterThan(0);
    expect(errors(care(first, 'tidying_her_quarters').events)).toEqual([]);
  });
});

describe('whether she notices', () => {
  it('is the row\'s chance (low 0.3, high 0.7) times her insight (low 0.7, mid 1, high 1.3), by a hashed roll', () => {
    const s = world(reg, 'play');
    const row = (n: 'low' | 'high') => ({ id: 'x', notice: n, label: 'x', promptHint: 'x' });
    expect(careNoticeChance(s, ANN, row('low'))).toBeCloseTo(0.3);
    unitOf(s, ANN).insight = 'high';
    expect(careNoticeChance(s, ANN, row('low'))).toBeCloseTo(0.39);
    unitOf(s, ANN).insight = 'low';
    expect(careNoticeChance(s, ANN, row('high'))).toBeCloseTo(0.49);
    expect(careNoticeChance(s, ANN, row('high'))).toBeLessThanOrEqual(1);
  });

  it('is the same for the same day and care, differs over days, and draws nothing', () => {
    const s = world(reg, 'play');
    const rng = JSON.stringify(s.rng);
    const row = careKinds(reg).find((r) => r.id === BOOTS)!;
    const again = noticesCare(s, ANN, row);
    for (let i = 0; i < 4; i++) expect(noticesCare(s, ANN, row)).toBe(again);
    const seen = new Set<boolean>();
    for (let day = 1; day < 60; day++) { s.day = day; seen.add(noticesCare(s, ANN, row)); }
    expect(seen.size).toBe(2);
    expect(JSON.stringify(s.rng)).toBe(rng);
    expect(careNoticeChance(s, ANN, careKinds(reg).find((r) => r.notice === 'high')!)).toBeGreaterThan(careNoticeChance(s, ANN, careKinds(reg).find((r) => r.notice === 'low')!));
  });

  it('is stored hidden: the action\'s events and result carry no sign of it', () => {
    const outcomes = new Set<boolean>();
    for (let day = 1; day < 40 && outcomes.size < 2; day++) {
      const s = world(reg, 'play');
      s.day = day;
      s.slot = 'morning';
      const r = care(s);
      outcomes.add(r.state.relations[ANN].craft!.cares![0]!.noticed);
      expect(JSON.stringify(r.events)).not.toMatch(/noticed/);
      expect(r.events.map((e) => e.type)).toEqual(expect.not.arrayContaining(['care_noticed', 'favour_changed', 'regard_changed']));
    }
    expect(outcomes.size).toBe(2);
  });
});

describe('what lands when she shows it (her next scene)', () => {
  const noticed = (s: CampaignState): CampaignState => withCares(s, [{ day: s.day - 1, careId: BOOTS, noticed: true }]);

  it('a noticed care lands as care_noticed when she next appears: favour +1, a yielded sample with motive her and Regard at play', () => {
    const s = noticed(world(reg, 'play'));
    s.relations[ANN].regard = 50;
    const favour = dynamicOf(s, ANN)!.favour;
    const updates = dynamicOf(s, ANN)!.readOf.updates;
    const r = meet(s);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'care_noticed')).toEqual([{ type: 'care_noticed', unitId: ANN, careId: BOOTS }]);
    const dyn = dynamicOf(r.state, ANN)!;
    expect(dyn.favour).toBe(favour + 1);
    expect(dyn.readOf.updates).toBe(updates + 1);
    expect(r.state.relations[ANN].regard!).toBeGreaterThan(50);
    expect(r.state.relations[ANN].craft!.cares![0]).toMatchObject({ voiced: true, scene: r.state.scene!.id });
    expect(r.state.relations[ANN].history.some((h) => h.type === 'care_noticed')).toBe(true);
    // once
    const second = meet(structuredClone({ ...r.state, scene: undefined }) as CampaignState);
    expect(ofType(second.events, 'care_noticed')).toEqual([]);
  });

  it('at equal it is only the noticing: the journal line and nothing for favour, her reading or Regard', () => {
    const s = noticed(world(reg, 'equal'));
    s.relations[ANN].regard = 50;
    const favour = dynamicOf(s, ANN)!.favour;
    const updates = dynamicOf(s, ANN)!.readOf.updates;
    const r = meet(s);
    expect(ofType(r.events, 'care_noticed')).toHaveLength(1);
    expect(dynamicOf(r.state, ANN)!.favour).toBe(favour);
    expect(dynamicOf(r.state, ANN)!.readOf.updates).toBe(updates);
    expect(r.state.relations[ANN].regard).toBe(50);
    expect(r.state.relations[ANN].history.some((h) => h.type === 'care_noticed')).toBe(true);
  });

  it('a care she did not notice never lands, and one older than the days kept is dropped', () => {
    const s = withCares(world(reg, 'play'), [{ day: 19, careId: BOOTS, noticed: false }]);
    const r = meet(s);
    expect(ofType(r.events, 'care_noticed')).toEqual([]);
    const old = withCares(world(reg, 'play'), [{ day: 1, careId: BOOTS, noticed: true }]);
    expect(ofType(meet(old).events, 'care_noticed')).toEqual([]);
  });

  it('lands when she writes too (a DM she sends)', () => {
    const s = noticed(world(reg, 'play'));
    const r = run(s, reg, { type: 'dm/receive', payload: { unitId: ANN, text: 'AUTHOR TO WRITE: I saw.', initiated: true } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'care_noticed')).toHaveLength(1);
    expect(r.state.relations[ANN].craft!.cares![0]).toMatchObject({ voiced: true, scene: 'dm' });
  });
});

describe('she names the service', () => {
  /** Four shown cares in the week, the last of them landing now: a woman at equal on testing, with a manner and the style regal. */
  function almost(over: { frame?: 'equal' | 'play'; style?: string; curiosity?: number; manner?: boolean; hold?: number } = {}): CampaignState {
    const s = world(reg, over.frame ?? 'equal');
    s.day = 30;
    dynamicOf(s, ANN)!.hold = over.hold ?? 25;
    const u = unitOf(s, ANN);
    u.bond!.practice!.style = { primary: (over.style ?? 'regal') as never };
    if (over.manner !== false) u.bond!.practice!.manner = { curiosity: over.curiosity ?? 0 } as never;
    return withCares(s, [
      { day: 25, careId: BOOTS, noticed: true, voiced: true }, { day: 27, careId: 'tidying_her_quarters', noticed: true, voiced: true },
      { day: 28, careId: 'doing_her_laundry', noticed: true, voiced: true }, { day: 29, careId: 'cleaning_her_weapon', noticed: true },
    ]);
  }
  const named = (s: CampaignState) => s.relations[ANN].craft!.cares!.some((c) => c.named === true);

  it('the fourth shown care in 7 days, by a woman at equal on testing with a manner and the style regal, marks the care named once', () => {
    const r = meet(almost());
    expect(ofType(r.events, 'care_noticed')).toHaveLength(1);
    expect(named(r.state)).toBe(true);
    expect(r.state.relations[ANN].craft!.cares!.filter((c) => c.named === true)).toHaveLength(1);
    expect(r.state.relations[ANN].craft!.cares!.at(-1)!.named).toBe(true);
    // once: a fifth care that lands later in the week does not name it again
    const next = withCares(structuredClone({ ...r.state, scene: undefined }) as CampaignState, [...r.state.relations[ANN].craft!.cares!, { day: 30, careId: BOOTS, noticed: true }]);
    expect(meet(next).state.relations[ANN].craft!.cares!.filter((c) => c.named === true)).toHaveLength(1);
  });

  it('a care that lands in a DM never names the service (the directive is a scene\'s); the next scene with her names it, once, in that scene', () => {
    const s = almost();
    const events = landCares(s, { registries: reg }, ANN, 'dm');
    expect(ofType(events, 'care_noticed')).toHaveLength(1);
    expect(named(s)).toBe(false);
    expect(shownCares(s, ANN, s.day)).toHaveLength(4); // the week's fourth is shown, and still unnamed
    const r = meet(s);
    expect(named(r.state)).toBe(true);
    const cares = r.state.relations[ANN].craft!.cares!;
    expect(cares.filter((c) => c.named === true)).toHaveLength(1);
    expect(cares.find((c) => c.named === true)!.scene).toBe(r.state.scene!.id); // the directive reads the scene it was named in
  });

  it('curiosity of +1 or more is enough without the style regal', () => {
    expect(named(meet(almost({ style: 'cold', curiosity: 1 })).state)).toBe(true);
    expect(named(meet(almost({ style: 'cold', curiosity: 0 })).state)).toBe(false);
  });

  it('needs a manner block, frame equal and the hold band testing', () => {
    expect(named(meet(almost({ manner: false })).state)).toBe(false);
    expect(named(meet(almost({ frame: 'play' })).state)).toBe(false);
    expect(named(meet(almost({ hold: 5 })).state)).toBe(false); // interest
    expect(named(meet(almost({ hold: 45 })).state)).toBe(false); // keeping
  });

  it('counts only noticed cares of the last 7 days', () => {
    const s = almost();
    s.relations[ANN].craft!.cares![0]!.day = 20; // out of the week
    expect(named(meet(s).state)).toBe(false);
    const t = almost();
    t.relations[ANN].craft!.cares![1]!.noticed = false;
    expect(named(meet(t).state)).toBe(false);
    expect(shownCares(almost(), ANN, 30)).toHaveLength(3);
    expect(namesService(almost(), reg, ANN)).toBe(false); // the fourth has not landed yet
  });
});

describe('forgetting and pruning', () => {
  it('keeps the last 14 days of cares', () => {
    const s = world(reg, 'play');
    s.slot = 'morning';
    withCares(s, [{ day: 1, careId: BOOTS, noticed: true }, { day: s.day - 3, careId: BOOTS, noticed: false }]);
    const r = care(s, 'doing_her_laundry');
    expect(r.state.relations[ANN].craft!.cares!.map((c) => c.day)).toEqual([s.day - 3, s.day]);
  });

  it('TUNING keeps the plan\'s numbers', () => {
    expect(TUNING.craft.care).toMatchObject({ notice: { low: 0.3, high: 0.7 }, insight: { low: 0.7, mid: 1, high: 1.3 }, nameAt: 4, nameDays: 7, keepDays: 14 });
  });
});
