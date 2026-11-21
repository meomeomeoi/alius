import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { buildKnowledge, resetKnowledgeRules } from '../../../src/analysis/knowledge';
import { registerDynamicProviders } from '../../../src/analysis/providers/dynamic';
import { registerMemoryProviders } from '../../../src/analysis/providers/memory';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { addSign, knowInstantly, knowledgeDayStep, levelOf, signsFromEvents } from '../../../src/engine/dynamic/knowledge';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, SignKind } from '../../../src/engine/dynamic/types';
import { applyDynamicIntent } from '../../../src/engine/dynamic/intents';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { Audience } from '../../../src/engine/dynamic/types';
import type { CampaignState } from '../../../src/engine/state/types';
import { personalOf } from '../../../src/engine/personal/state';
import { campaign, ctxOf, errors, loadCore, run, stubExpedition } from '../../helpers/world';
import '../../../src/engine/actions/personal';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetKnowledgeRules());

const [ANN, BEA, CAT, DEE, EVE, FAY] = ['unit_ann', 'unit_bea', 'unit_cat', 'unit_dee', 'unit_eve', 'unit_fay'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds at `frame` (a dominant woman who enjoys restraint) in a squad of `n`; everybody else is an observer with Trust and Affinity 0 and `mid` insight. */
function world(frame: Frame, over: { audience?: Audience; n?: number } = {}): CampaignState {
  const s = campaign(reg, over.n ?? 5);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: over.audience ?? 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 20;
  s.slot = 'morning';
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold: 50 };
  for (const u of s.squad) {
    if (u.id === ANN) continue;
    s.relations[u.id].trust = 0;
    s.relations[u.id].affinity = 0;
    s.relations[u.id].attraction = 0;
    delete u.insight;
  }
  return s;
}
const row = (s: CampaignState, observer: string, holder = ANN) => s.dynamic!.knowledge[observer]?.[holder];
const sign = (s: CampaignState, observer: string, kind: SignKind, holder = ANN) => addSign(s, ctxOf(s, reg), observer, holder, kind);
const known = (s: CampaignState) => s.memory.facts.filter((f) => f.tags.includes('dynamic_knowledge'));
const step = (s: CampaignState) => knowledgeDayStep(s, ctxOf(s, reg));

describe('addSign', () => {
  it('signs add by table with multipliers', () => {
    const s = world('role');
    unitOf(s, BEA).insight = 'high';
    s.relations[BEA].trust = 60; // a friend
    const events = sign(s, BEA, 'protocol_slip');
    expect(row(s, BEA)!.suspicion).toBe(39); // 20 x 1.3 x 1.5
    expect(events).toEqual([]); // no level yet
    unitOf(s, CAT).insight = 'low';
    sign(s, CAT, 'protocol_slip');
    expect(row(s, CAT)!.suspicion).toBe(14); // 20 x 0.7
    sign(s, DEE, 'held_night');
    expect(row(s, DEE)!.suspicion).toBe(5); // plain
    expect(row(s, ANN)).toBeUndefined(); // the holder is nobody's observer
  });

  it('the holder\'s audience multiplies: show_off x1.5, private_only x0.5', () => {
    const loud = world('role', { audience: 'show_off' });
    sign(loud, BEA, 'protocol_slip');
    expect(row(loud, BEA)!.suspicion).toBe(30);
    const quiet = world('role', { audience: 'private_only' });
    sign(quiet, BEA, 'protocol_slip');
    expect(row(quiet, BEA)!.suspicion).toBe(10);
  });

  it('a row whose content is off adds nothing (M9)', () => {
    const s = world('role');
    sign(s, BEA, 'territory_marking'); // tagged bodily_fluids, which is off
    expect(row(s, BEA)).toBeUndefined();
    s.content = { enabled: ['restraint', 'bodily_fluids'] };
    sign(s, BEA, 'territory_marking');
    expect(row(s, BEA)!.suspicion).toBe(30);
  });

  it('closeness-only signs give suspects_close and +0', () => {
    const s = world('role');
    const events = sign(s, BEA, 'seen_together');
    expect(row(s, BEA)!.suspicion).toBe(0);
    expect(levelOf(s, BEA, ANN)).toBe('suspects_close');
    expect(events).toEqual([{ type: 'dynamic_known', observerId: BEA, holderId: ANN, level: 'suspects_close' }]);
    expect(known(s)).toHaveLength(1);
    expect(sign(s, BEA, 'time_alone')).toEqual([]); // the level is reached once
  });

  it('nothing for an observer who is not a named living unit, a holder with no dynamic, or while off', () => {
    const s = world('role');
    expect(sign(s, 'nobody', 'protocol_slip')).toEqual([]);
    expect(sign(s, BEA, 'protocol_slip', BEA)).toEqual([]); // Bea holds nothing
    const off = world('role');
    off.dynamic!.setup.holders = 0;
    expect(sign(off, BEA, 'protocol_slip')).toEqual([]);
    expect(off.dynamic!.knowledge).toEqual({});
  });
});

describe('levels', () => {
  it('60 is suspects_dynamic (a hidden fact), 100 knows_dynamic and dynamic_known', () => {
    const s = world('role');
    sign(s, BEA, 'protocol_slip');
    sign(s, BEA, 'protocol_slip');
    expect(levelOf(s, BEA, ANN)).toBeUndefined();
    const at60 = sign(s, BEA, 'protocol_slip');
    expect(row(s, BEA)!.suspicion).toBe(60);
    expect(levelOf(s, BEA, ANN)).toBe('suspects_dynamic');
    expect(at60).toEqual([{ type: 'dynamic_known', observerId: BEA, holderId: ANN, level: 'suspects_dynamic' }]);
    expect(known(s)).toHaveLength(1);
    expect(known(s)[0]).toMatchObject({ about: [BEA, ANN], knownBy: [BEA], hiddenFromCommander: true });
    sign(s, BEA, 'protocol_slip');
    const last = sign(s, BEA, 'protocol_slip');
    expect(row(s, BEA)!.suspicion).toBe(100);
    expect(levelOf(s, BEA, ANN)).toBe('knows_dynamic');
    expect(last).toContainEqual({ type: 'dynamic_known', observerId: BEA, holderId: ANN, level: 'knows_dynamic' });
    expect(known(s)).toHaveLength(2);
    expect(known(s).every((f) => f.hiddenFromCommander === true)).toBe(true);
  });

  it('knowing instantly is 100 at once, whatever the insight', () => {
    const s = world('role');
    unitOf(s, BEA).insight = 'low';
    const events = knowInstantly(s, ctxOf(s, reg), BEA, ANN, 'holder_tells');
    expect(row(s, BEA)!.suspicion).toBe(100);
    expect(levelOf(s, BEA, ANN)).toBe('knows_dynamic');
    expect(events).toContainEqual({ type: 'dynamic_known', observerId: BEA, holderId: ANN, level: 'knows_dynamic' });
    expect(knowInstantly(s, ctxOf(s, reg), BEA, ANN, 'holder_tells')).toEqual([]); // she knows already
  });

  it('the fact becomes known to the commander after a shared scene (or a DM) after its day', () => {
    registerMemoryProviders();
    registerDynamicProviders();
    const s = world('role');
    knowInstantly(s, ctxOf(s, reg), BEA, ANN, 'holder_tells');
    knowInstantly(s, ctxOf(s, reg), CAT, ANN, 'holder_tells');
    const visible = (st: CampaignState) => buildKnowledge(st, DEFAULT_SETTINGS).facts().filter((f) => f.tags.includes('dynamic_knowledge')).map((f) => f.about[0]);
    expect(visible(s)).toEqual([]);
    s.day = 21;
    s.memory.scenes = [{ sceneId: 'sc1', from: 0, to: 4, summarized: false, day: 20, participants: [BEA] }]; // the day of the fact: not after it
    expect(visible(s)).toEqual([]);
    s.memory.scenes = [{ sceneId: 'sc1', from: 0, to: 4, summarized: false, day: 21, participants: [BEA, DEE] }];
    expect(visible(s)).toEqual([BEA]);
    s.dms[CAT] = [{ id: 'd1', from: CAT, text: 'ma\'am', day: 21, slot: 'morning', read: true }];
    expect(visible(s).sort()).toEqual([BEA, CAT]);
  });
});

describe('the day step', () => {
  it('background: role +3 a day, rule +6, play 0', () => {
    const role = world('role');
    step(role);
    expect(row(role, BEA)!.suspicion).toBe(3);
    expect(row(role, ANN)).toBeUndefined();
    const rule = world('rule');
    step(rule);
    expect(row(rule, BEA)!.suspicion).toBe(6);
    const play = world('play');
    step(play);
    expect(row(play, BEA)).toBeUndefined();
    const none = world('equal');
    step(none);
    expect(none.dynamic!.knowledge).toEqual({});
  });

  it('background at role nets +3 a day over six days with no other sign, and decays 2 a day once the signs stop (I3)', () => {
    const s = world('role');
    s.day = 10;
    const seen: number[] = [];
    for (let day = 10; day <= 15; day++) {
      s.day = day;
      step(s);
      seen.push(row(s, BEA)!.suspicion);
    }
    expect(seen).toEqual([3, 6, 9, 12, 15, 18]);
    s.relations[ANN].dynamic!.frame = 'play'; // no more background
    const after: number[] = [];
    for (let day = 16; day <= 18; day++) {
      s.day = day;
      step(s);
      after.push(row(s, BEA)!.suspicion);
    }
    expect(after).toEqual([16, 14, 12]);
    const rule = world('rule');
    rule.day = 10;
    const ruleSeen: number[] = [];
    for (let day = 10; day <= 12; day++) { rule.day = day; step(rule); ruleSeen.push(row(rule, BEA)!.suspicion); }
    expect(ruleSeen).toEqual([6, 12, 18]);
  });

  it('gossip capped at 15 a day', () => {
    let most = 0;
    for (let day = 1; day <= 60; day++) {
      const s = world('play', { n: 6 });
      s.day = day;
      for (const id of [BEA, CAT, DEE, FAY]) s.dynamic!.knowledge[id] = { [ANN]: { suspicion: 100, level: 'knows_dynamic', levelDay: 1, peakDay: day } };
      step(s);
      most = Math.max(most, row(s, EVE)?.suspicion ?? 0);
      expect(row(s, EVE)?.suspicion ?? 0).toBeLessThanOrEqual(15);
    }
    expect(most).toBe(15); // four knowers (20) on a day they all pass it on
  });

  it('gossip: 5 from a woman who knows, 2 from one who suspects', () => {
    const gains = new Set<number>();
    for (let day = 1; day <= 60; day++) {
      const s = world('play', { n: 4 });
      s.day = day;
      s.dynamic!.knowledge[BEA] = { [ANN]: { suspicion: 100, level: 'knows_dynamic', levelDay: 1, peakDay: day } };
      s.dynamic!.knowledge[CAT] = { [ANN]: { suspicion: 70, level: 'suspects_dynamic', levelDay: 1, peakDay: day } };
      step(s);
      gains.add(row(s, DEE)?.suspicion ?? 0);
    }
    expect([...gains].sort((a, b) => a - b)).toEqual([0, 2, 5, 7]);
  });

  it('decay 2 a day, never below 60 within 7 days of reaching it', () => {
    const s = world('play');
    s.day = 10;
    for (let i = 0; i < 3; i++) sign(s, BEA, 'protocol_slip'); // 60 on day 10
    sign(s, BEA, 'held_night');
    sign(s, BEA, 'held_night'); // 70
    expect(row(s, BEA)!.suspicion).toBe(70);
    const seen: number[] = [];
    for (let day = 11; day <= 18; day++) {
      s.day = day;
      for (const id of [CAT, DEE, EVE]) delete s.dynamic!.knowledge[id]; // nobody else gossips
      step(s);
      seen.push(row(s, BEA)!.suspicion);
    }
    expect(seen).toEqual([68, 66, 64, 62, 60, 60, 60, 58]); // the floor holds through day 17, then it falls
    expect(levelOf(s, BEA, ANN)).toBe('suspects_close'); // below 60 she no longer suspects it
  });

  it('a day with a sign is no day without one', () => {
    const s = world('play');
    s.day = 10;
    for (let i = 0; i < 3; i++) sign(s, BEA, 'protocol_slip');
    sign(s, BEA, 'held_night'); // 65, peak today
    step(s); // the same day: nothing is lost
    expect(row(s, BEA)!.suspicion).toBe(65);
  });

  it('a holder who tells: select_few tells a friend on one day in seven (hashed), show_off tells everyone once a week', () => {
    let told = 0;
    for (let day = 1; day <= 70; day++) {
      const s = world('play', { audience: 'select_few' });
      s.day = day;
      s.relations[BEA].trust = 60; // a friend
      step(s);
      if (levelOf(s, BEA, ANN) === 'knows_dynamic') told++;
      expect(levelOf(s, CAT, ANN)).toBeUndefined(); // an ordinary woman is not told
    }
    expect(told).toBeGreaterThan(3);
    expect(told).toBeLessThan(20);
    const days = [];
    for (let day = 1; day <= 14; day++) {
      const s = world('play', { audience: 'show_off' });
      s.day = day;
      step(s);
      if (levelOf(s, CAT, ANN) === 'knows_dynamic' && levelOf(s, DEE, ANN) === 'knows_dynamic') days.push(day);
    }
    expect(days).toHaveLength(2);
    expect(days[1] - days[0]).toBe(7);
  });

  it('draws no rng', () => {
    const s = world('rule', { audience: 'show_off' });
    const before = JSON.stringify(s.rng);
    step(s);
    expect(JSON.stringify(s.rng)).toBe(before);
  });
});

describe('instant knowledge from the scene', () => {
  const start = (s: CampaignState, participants: string[]): CampaignState => {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    return r.state;
  };

  it('an item with scope dynamic worn in front of her is instant knowledge', () => {
    const s = start(world('play'), [ANN, BEA]);
    const events = signsFromEvents(s, ctxOf(s, reg), [{ type: 'blocking_changed', person: 'commander', field: 'worn', value: 'property_tag', source: 'chip' }]);
    expect(levelOf(s, BEA, ANN)).toBe('knows_dynamic');
    expect(events).toContainEqual({ type: 'dynamic_known', observerId: BEA, holderId: ANN, level: 'knows_dynamic' });
    expect(levelOf(s, CAT, ANN)).toBeUndefined(); // she was not there
  });

  it('an item that is not of the dynamic is no sign', () => {
    const s = start(world('play'), [ANN, BEA]);
    expect(signsFromEvents(s, ctxOf(s, reg), [{ type: 'blocking_changed', person: 'commander', field: 'worn', value: 'collar', source: 'chip' }])).toEqual([]);
    expect(s.dynamic!.knowledge).toEqual({});
  });

  it('a visitor who walks in on a contact of the dynamic knows', () => {
    const s = start(world('play'), [ANN]);
    s.scene!.blocking = { commander: { contact: { id: 'human_chair', with: ANN, direction: 'from', since: 0 } } } as never;
    const events = signsFromEvents(s, ctxOf(s, reg), [{ type: 'moment_fired', momentId: 'm1', sourceId: 'third_party', unitId: ANN, visitorId: CAT }]);
    expect(levelOf(s, CAT, ANN)).toBe('knows_dynamic');
    expect(events).toContainEqual({ type: 'dynamic_known', observerId: CAT, holderId: ANN, level: 'knows_dynamic' });
    // nothing on the stage: she walks in on nothing
    const bare = start(world('play'), [ANN]);
    expect(signsFromEvents(bare, ctxOf(bare, reg), [{ type: 'moment_fired', momentId: 'm1', sourceId: 'third_party', unitId: ANN, visitorId: CAT }])).toEqual([]);
  });

  it('a protocol slip is seen by those present (the intent)', () => {
    const s = start(world('role'), [ANN, BEA, CAT]);
    const ev = { type: 'protocol_slip', actor: 'commander', targets: [ANN] } as unknown as EventIntent;
    applyDynamicIntent(s, ctxOf(s, reg), ANN, ev);
    expect(row(s, BEA)!.suspicion).toBe(20);
    expect(row(s, CAT)!.suspicion).toBe(20);
    expect(row(s, DEE)).toBeUndefined();
  });

  it('a refused submit claim at rule raises the Impunity record of those who know (R1)', () => {
    const s = world('rule');
    knowInstantly(s, ctxOf(s, reg), BEA, ANN, 'holder_tells');
    s.relations[ANN].dynamic!.contest = [s.day, s.day];
    s.dynamic!.open.claims.push({ id: 'dc0', unitId: ANN, submit: true, day: s.day });
    const was = s.relations[BEA].impunityRecord ?? 0;
    const r = run(s, reg, { type: 'dynamic/answer_claim', payload: { claimId: 'dc0', answer: 'refuse' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[BEA].impunityRecord ?? 0).toBe(was + 5);
    expect(r.state.relations[CAT].impunityRecord ?? 0).toBe(0); // she does not know
  });
});

describe('the producers of held_night and leaving_quarters (review I4)', () => {
  const book = (s: CampaignState, over: Partial<import('../../../src/engine/state/types').Booking> = {}) => {
    (personalOf(s).bookings ??= []).push({ id: `bk${personalOf(s).bookings?.length ?? 0}`, unitId: ANN, kindId: 'evening_with_me', day: s.day, slot: s.slot, status: 'booked', source: 'milestone', made: s.day - 1, ...over });
  };
  const suspicion = (s: CampaignState, id: string) => row(s, id)?.suspicion ?? 0;

  it('a played milestone booking is a held_night (+5) for every named unit at base; a booking of the dice is none', () => {
    const s = world('play');
    book(s);
    const r = run(s, reg, { type: 'booking/play', payload: {} });
    expect(errors(r.events)).toEqual([]);
    for (const id of [BEA, CAT, DEE, EVE]) expect(suspicion(r.state, id)).toBe(5);
    expect(row(r.state, ANN)).toBeUndefined(); // the holder is nobody's observer
    const dice = world('play');
    book(dice, { source: 'roll' });
    const r2 = run(dice, reg, { type: 'booking/play', payload: {} });
    expect(errors(r2.events)).toEqual([]);
    expect(r2.state.dynamic!.knowledge).toEqual({});
    // she is met in a scene: the same booking is played there
    const met = world('play');
    book(met);
    const r3 = run(met, reg, { type: 'scene/start', payload: { participants: [ANN], locationId: 'quarters_commander', origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r3.events)).toEqual([]);
    expect(suspicion(r3.state, CAT)).toBe(5);
    // off: nothing
    const off = world('play');
    off.dynamic!.setup.holders = 0;
    book(off);
    expect(run(off, reg, { type: 'booking/play', payload: {} }).state.dynamic!.knowledge).toEqual({});
  });

  it('the morning after a second_place evening the units at the hub saw her leave her quarters (+5); no domain, no sign', () => {
    const s = world('play');
    s.slot = 'evening';
    s.relations[ANN].dynamic!.domains = [{ id: 'household', since: 1 }];
    book(s, { status: 'played', source: 'roll' });
    s.expedition = stubExpedition(s, { party: [DEE] }); // Dee is out: nobody sees her
    step(s);
    for (const id of [BEA, CAT, EVE]) expect(suspicion(s, id)).toBe(5);
    expect(suspicion(s, DEE)).toBe(0);
    expect(row(s, ANN)).toBeUndefined();
    // without the domain, with the booking unplayed, or on another slot: nothing
    for (const tweak of [(x: CampaignState) => { x.relations[ANN].dynamic!.domains = []; }, (x: CampaignState) => { personalOf(x).bookings![0].status = 'lapsed'; }, (x: CampaignState) => { personalOf(x).bookings![0].slot = 'afternoon'; }]) {
      const t = world('play');
      t.slot = 'evening';
      t.relations[ANN].dynamic!.domains = [{ id: 'household', since: 1 }];
      book(t, { status: 'played', source: 'roll' });
      tweak(t);
      step(t);
      expect(t.dynamic!.knowledge).toEqual({});
    }
  });
});

describe('the expected pace (spec §15.13)', () => {
  /**
   * Days until each woman first suspects and first knows: five named units, Ann holding at `role` and telling a few (`select_few`), a protocol slip
   * seen by the women present every `slipEvery` days (a played dynamic), and the day step in between.
   */
  function pace(salt: number, slipEvery: number): { ordinary: { suspects: number; knows: number }; friend: { suspects: number; knows: number } } {
    const s = world('role', { audience: 'select_few' });
    s.dynamic!.salt = salt;
    s.relations[BEA].trust = 60; // the holder's friend
    const got: Record<string, { suspects?: number; knows?: number }> = { [BEA]: {}, [CAT]: {} };
    for (let day = 1; day <= 40; day++) {
      s.day = day;
      if (day % slipEvery === 0) for (const id of [BEA, CAT, DEE, EVE]) sign(s, id, 'protocol_slip');
      step(s);
      for (const id of [BEA, CAT]) {
        const level = levelOf(s, id, ANN);
        if ((level === 'suspects_dynamic' || level === 'knows_dynamic') && got[id].suspects === undefined) got[id].suspects = day;
        if (level === 'knows_dynamic' && got[id].knows === undefined) got[id].knows = day;
      }
    }
    return { ordinary: { suspects: got[CAT].suspects ?? 99, knows: got[CAT].knows ?? 99 }, friend: { suspects: got[BEA].suspects ?? 99, knows: got[BEA].knows ?? 99 } };
  }

  it('an ordinary woman suspects between day 8 and 12 and knows between day 14 and 21; the holder\'s friend about twice as fast', () => {
    // review I3: the background now nets its full +3 a day (decay no longer cancels it), so the same pace needs fewer slips than the every-5-days
    // the first version of this test used to make up for the bug: one slip a week and a half (8 days) gives suspects day 8-12 and knows day 14-16
    const runs = Array.from({ length: 12 }, (_, i) => pace(i + 1, 8));
    for (const r of runs) {
      expect(r.ordinary.suspects).toBeGreaterThanOrEqual(8);
      expect(r.ordinary.suspects).toBeLessThanOrEqual(12);
      expect(r.ordinary.knows).toBeGreaterThanOrEqual(14);
      expect(r.ordinary.knows).toBeLessThanOrEqual(21);
      expect(r.friend.suspects).toBeLessThanOrEqual(r.ordinary.suspects); // never slower
      expect(r.friend.knows).toBeLessThanOrEqual(r.ordinary.knows);
    }
    const mean = (f: (r: (typeof runs)[number]) => number): number => runs.reduce((a, r) => a + f(r), 0) / runs.length;
    expect(mean((r) => r.friend.suspects) / mean((r) => r.ordinary.suspects)).toBeLessThanOrEqual(0.7);
    expect(mean((r) => r.friend.knows) / mean((r) => r.ordinary.knows)).toBeLessThanOrEqual(0.55);
  });
});
