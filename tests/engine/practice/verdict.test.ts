import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { COMMANDER } from '../../../src/engine/blocking';
import { regardOf } from '../../../src/engine/dynamic/regard';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { ensurePractices } from '../../../src/engine/practice/gate';
import { noteOffence } from '../../../src/engine/practice/offences';
import { applyPracticeIntent } from '../../../src/engine/practice/intents';
import { addHold } from '../../../src/engine/dynamic/hold';
import { defaultActivity, kindnessSweep, momentGapFavour, verdictOf } from '../../../src/engine/practice/service';
import type { Task } from '../../../src/engine/practice/state';
import { Rng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { practiceDirectives, issuedDirective } from '../../../src/practice/directives';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, unitOf, withService, world } from './world';

let reg: Registries;
let R2: Registries;
beforeAll(async () => {
  reg = await loadCore();
  // three judged services of the commander's, who differ in how they are felt (her wish is `unnoticed`: a cold manner)
  const acts = new Map(reg.blockingActivities);
  const base = acts.get('refilling')!;
  acts.set('serve_quiet', { ...base, id: 'serve_quiet', fits: ['focused'], presence: 'unnoticed', judged: true });
  acts.set('serve_loud', { ...base, id: 'serve_loud', fits: ['focused'], presence: 'felt', judged: true });
  R2 = { ...reg, blockingActivities: acts } as Registries;
});

const ctxOf = (d: CampaignState) => ({ registries: R2, rng: new Rng(d.rng) });
const dyn = (s: CampaignState) => dynamicOf(s, ANN)!;

/** Ann (a cold holder at play, a lover who practises service) with a scene open with her. */
function scened(): CampaignState {
  const s = withService(world(R2, 'play'));
  s.relations[ANN].stateId = 'lover';
  const r = run(s, R2, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const doing = (s: CampaignState, person: string, activity: string) => run(s, R2, { type: 'blocking/set', payload: { person, field: 'activity', value: activity, at: 1 } });
const endScene = (s: CampaignState) => run(s, R2, { type: 'scene/end', payload: {} });
const said = (s: CampaignState, kind: 'pleased' | 'adequate' | 'displeased') => applyPracticeIntent(s, ctxOf(s), ANN, { type: 'service_rated', kind } as never);

/** Her hold after the writer P15 uses adds `n` to the state's (the hold takes her own scaling into it, so the test asks the same writer). */
function heldAfter(s: CampaignState, n: number): number {
  const copy = structuredClone(s);
  addHold(copy, { registries: R2 }, ANN, n, 'service_rated_pleased');
  return dynamicOf(copy, ANN)!.hold;
}

const asked = (s: CampaignState): CampaignState => {
  const task: Task = { id: 'pt9', holderId: ANN, kind: 'task', tags: ['service'], track: 'service', tier: 1, stakes: 'trivial', check: 'model', proof: 'none', text: 'Bring coffee.', summary: 'bring her coffee', status: 'open', acceptForm: 'button', day: s.day };
  ensurePractices(s).tasks.push(task);
  return s;
};

/** The pair she wants (a quiet service that fits her focus), served: the engine says pleased. */
function pleasedPair(): CampaignState {
  let s = scened();
  s = doing(s, ANN, 'reading_reports').state;
  const r = doing(s, COMMANDER, 'serve_quiet');
  expect(errors(r.events)).toEqual([]);
  return r.state;
}

describe('her verdict', () => {
  it("the engine verdict wins over the model's: a judged pair that fits and is felt as she wishes is pleased", () => {
    const s = pleasedPair();
    const hold0 = dyn(s).hold;
    const favour0 = dyn(s).favour;
    said(s, 'displeased'); // the model's, in the same scene: dropped
    const r = endScene(s);
    const rated = ofType(r.events, 'service_rated');
    expect(rated).toHaveLength(1);
    expect(rated[0]).toMatchObject({ kind: 'pleased', via: 'engine', unitId: ANN });
    expect(dynamicOf(r.state, ANN)!.hold).toBeCloseTo(heldAfter(s, TUNING.dynamic.gains.service_rated_pleased), 5);
    expect(dynamicOf(r.state, ANN)!.hold).toBeGreaterThan(hold0);
    expect(dynamicOf(r.state, ANN)!.favour).toBe(favour0 + TUNING.practice.verdict.favour.pleased);
    expect(verdictOf(s, R2, ANN)).toBe('pleased');
  });

  it('one verdict a scene: it lands once and the scene is marked', () => {
    const s = pleasedPair();
    const r = endScene(s);
    expect(ofType(r.events, 'service_rated')).toHaveLength(1);
    expect(r.state.practices!.verdictScene![ANN]).toBeDefined();
    expect(r.state.practices!.service?.[ANN]).toBeUndefined();
  });

  it('a pair that fits but is felt otherwise is adequate; one that does neither is displeased', () => {
    let s = doing(asked(doing(scened(), ANN, 'reading_reports').state), COMMANDER, 'serve_loud').state; // asked, so that anticipation does not lift it
    expect(verdictOf(s, R2, ANN)).toBe('adequate');
    s = doing(doing(scened(), ANN, 'idle').state, COMMANDER, 'serve_loud').state; // relaxed, not focused
    expect(verdictOf(s, R2, ANN)).toBe('displeased');
    const r = endScene(s);
    expect(ofType(r.events, 'service_rated')[0]).toMatchObject({ kind: 'displeased', via: 'engine' });
    expect(dynamicOf(r.state, ANN)!.favour).toBe(TUNING.practice.verdict.favour.displeased);
  });

  it("the model's verdict stands when no judged pair ran: pleased lands at the scene's end", () => {
    const s = scened();
    const hold0 = dyn(s).hold;
    expect(verdictOf(s, R2, ANN)).toBeNull();
    said(s, 'pleased');
    expect(dyn(s).hold).toBe(hold0); // nothing lands while the scene runs
    const r = endScene(s);
    expect(ofType(r.events, 'service_rated')[0]).toMatchObject({ kind: 'pleased', via: 'model' });
    expect(dynamicOf(r.state, ANN)!.hold).toBeCloseTo(heldAfter(s, TUNING.dynamic.gains.service_rated_pleased), 5);
    expect(dynamicOf(r.state, ANN)!.favour).toBe(2);
  });

  it('adequate moves nothing but the journal', () => {
    const s = scened();
    const before = { hold: dyn(s).hold, favour: dyn(s).favour, trust: s.relations[ANN].trust, affinity: s.relations[ANN].affinity };
    said(s, 'adequate');
    const r = endScene(s);
    const after = dynamicOf(r.state, ANN)!;
    expect({ hold: after.hold, favour: after.favour, trust: r.state.relations[ANN].trust, affinity: r.state.relations[ANN].affinity }).toEqual(before);
    expect(r.state.relations[ANN].history.some((h) => h.type === 'service_rated')).toBe(true);
  });

  it("a scene that is aborted rates nothing, and the model's last word in a scene is the one that counts", () => {
    const s = scened();
    said(s, 'displeased');
    said(s, 'pleased');
    const r = endScene(s);
    expect(ofType(r.events, 'service_rated')[0].kind).toBe('pleased');
    const aborted = run(scened(), R2, { type: 'scene/abort', payload: {} });
    expect(ofType(aborted.events, 'service_rated')).toEqual([]);
    expect(aborted.state.practices?.service?.[ANN]).toBeUndefined();
  });

  it('pleased at high favour raises Regard; at lower favour it does not', () => {
    const high = scened();
    dyn(high).favour = 9; // +2 → 11
    const before = regardOf(high, R2, ANN);
    said(high, 'pleased');
    const hi = endScene(high);
    expect(regardOf(hi.state, R2, ANN)).toBeGreaterThan(before);
    const low = scened();
    dyn(low).favour = 3;
    const lowBefore = regardOf(low, R2, ANN);
    said(low, 'pleased');
    expect(regardOf(endScene(low).state, R2, ANN)).toBe(lowBefore);
  });

  it('draws nothing from the campaign rng', () => {
    const s = pleasedPair();
    said(s, 'pleased');
    const before = JSON.stringify(s.rng);
    expect(JSON.stringify(endScene(s).state.rng)).toBe(before);
  });

  it('is told to the model for her next reply, as a verdict word', () => {
    const s = pleasedPair();
    const r = endScene(s);
    const d = issuedDirective(ofType(r.events, 'service_rated')[0], r.state, R2);
    expect(d?.id).toBe(`practice:verdict:${ANN}`);
    expect(d?.expiresAfter).toBe('next_reply');
    expect(d?.text).not.toMatch(/AUTHOR TO WRITE|\d/);
    expect(practiceDirectives(r.state, R2, [ANN]).some((x) => x.id.startsWith('practice:verdict:'))).toBe(false); // event-driven, not derived
  });
});

describe('moment gaps move favour', () => {
  const answered = (gap: string, unitId = ANN) => ({ type: 'moment_answered', momentId: 'm1', sourceId: 'her_demand', unitId, key: '0', responseType: 'yielded', gap, via: 'chip', present: [unitId] });
  it('matched +2, partial 0, opposite -3 for a holder; a comrade moves nothing', () => {
    for (const [gap, delta] of [['matched', 2], ['partial', 0], ['opposite', -3]] as const) {
      const s = scened();
      const f0 = dyn(s).favour;
      momentGapFavour(s, ctxOf(s), [answered(gap)]);
      expect(dyn(s).favour, gap).toBe(f0 + delta);
    }
    const s = scened();
    const b0 = s.relations[BEA].dynamic?.favour;
    momentGapFavour(s, ctxOf(s), [answered('opposite', BEA)]);
    expect(s.relations[BEA].dynamic?.favour).toBe(b0);
    expect(dyn(s).favour).toBe(0);
  });
});

describe('her kindnesses', () => {
  /** Every kindness has something to act on: a booking of hers, an active protocol, no token yet, no softer punishment pending. */
  function kind(day = 20): CampaignState {
    const s = withService(world(R2, 'role'));
    s.day = day;
    s.relations[ANN].stateId = 'lover';
    s.relations[ANN].affinity = 80; // the token gate asks for warmth
    dyn(s).favour = TUNING.practice.kindnessAt;
    s.relations[ANN].want = 40;
    s.personal = { bookings: [{ id: 'b1', unitId: ANN, kindId: [...R2.bookingKinds.keys()][0], day: day + 1, slot: 'evening', status: 'booked', source: 'her' }] } as never;
    s.bonds = { rules: [{ id: 'r1', unitId: ANN, templateId: 'stand_when_i_enter', text: 'Stand.', status: 'active', day: s.day, brokenCount: 0 }] };
    return s;
  }

  it('at favour 8 on a hit day she does one, and over the days each of the five comes once', () => {
    const seen = new Map<string, CampaignState>();
    for (let day = 20; day < 600 && seen.size < 5; day++) {
      const s = kind(day);
      const events = kindnessSweep(s, ctxOf(s));
      for (const e of ofType(events, 'favour_kindness')) seen.set(String(e.kind), s);
    }
    expect([...seen.keys()].sort()).toEqual(['gift', 'protocol_relaxed', 'slot_back', 'softer', 'want_relief']);
    expect(seen.get('slot_back')!.personal!.bookings![0].status).toBe('cancelled');
    expect(seen.get('protocol_relaxed')!.bonds!.rules[0].status).toBe('suspended');
    expect(seen.get('want_relief')!.relations[ANN].want).toBe(40 - 15);
    expect(seen.get('gift')!.personal!.tokens!.given).toContain(ANN);
    expect(seen.get('softer')!.practices!.softer?.[ANN]).toBe(true);
  });

  it('the gift goes through the token gate and her tier (review M9): none from a friend, none from an avoidant one, no romantic kind at a close tier', () => {
    const gifts = (make: (day: number) => CampaignState): CampaignState[] => {
      const out: CampaignState[] = [];
      for (let day = 20; day < 400; day++) {
        const s = make(day);
        if (ofType(kindnessSweep(s, ctxOf(s)), 'favour_kindness').some((e) => e.kind === 'gift')) out.push(s);
      }
      return out;
    };
    expect(gifts((day) => { const s = kind(day); s.relations[ANN].stateId = 'friend'; return s; })).toEqual([]);
    expect(gifts((day) => { const s = kind(day); unitOf(s, ANN).bond!.attachment = 'avoidant'; return s; })).toEqual([]);
    const close = gifts((day) => { const s = kind(day); s.relations[ANN].stateId = 'confidant'; return s; });
    expect(close.length).toBeGreaterThan(0);
    for (const s of close) {
      const kinds = s.personal!.tokens!.owned.map((t) => R2.tokenKinds.get(t.kindId)!);
      expect(kinds.every((k) => k.minTier === undefined || k.minTier === 'close')).toBe(true);
    }
  });

  it('slot_back never gives back a slot of her own hold: held bookings are not "upcoming" (review M9)', () => {
    const heldKind = [...R2.bookingKinds.values()].find((k) => k.held === true)!;
    for (let day = 20; day < 400; day++) {
      const s = kind(day);
      s.personal!.bookings = [{ id: 'bh', unitId: ANN, kindId: String(heldKind.id), day: day + 1, slot: 'evening', status: 'booked', source: 'practice' }] as never;
      const events = kindnessSweep(s, ctxOf(s));
      expect(ofType(events, 'favour_kindness').some((e) => e.kind === 'slot_back'), `day ${day}`).toBe(false);
      expect((s.personal!.bookings as Array<{ status: string }>)[0].status).toBe('booked');
    }
  });

  it('below favour 8 she does none', () => {
    for (let day = 20; day < 120; day++) {
      const s = kind(day);
      dyn(s).favour = TUNING.practice.kindnessAt - 1;
      expect(kindnessSweep(s, ctxOf(s))).toEqual([]);
    }
  });

  it('a relaxed protocol comes back the day after, and draws nothing', () => {
    let relaxed: CampaignState | undefined;
    for (let day = 20; day < 600 && relaxed === undefined; day++) {
      const s = kind(day);
      if (ofType(kindnessSweep(s, ctxOf(s)), 'favour_kindness').some((e) => e.kind === 'protocol_relaxed')) relaxed = s;
    }
    expect(relaxed).toBeDefined();
    const s = relaxed!;
    const rng = JSON.stringify(s.rng);
    s.day += 1;
    dyn(s).favour = 0; // no new kindness on the day it comes back
    kindnessSweep(s, ctxOf(s));
    expect(s.bonds!.rules[0].status).toBe('active');
    expect(JSON.stringify(s.rng)).toBe(rng);
  });

  it('softer takes one off her next punishment, once', () => {
    const plainNote = () => {
      const s = withService(world(R2, 'rule'));
      s.relations[ANN].stateId = 'lover';
      ensurePractices(s);
      noteOffence(s, ctxOf(s), ANN, { kind: 'task_broken', ref: 'x', stakes: 'major', day: s.day });
      return s;
    };
    const normal = plainNote().practices!.requests.find((r) => r.kind === 'punishment')!;
    const s = withService(world(R2, 'rule'));
    s.relations[ANN].stateId = 'lover';
    ensurePractices(s).softer = { [ANN]: true };
    noteOffence(s, ctxOf(s), ANN, { kind: 'task_broken', ref: 'x', stakes: 'major', day: s.day });
    const softer = s.practices!.requests.find((r) => r.kind === 'punishment')!;
    expect(softer.severity).toBe((normal.severity ?? 0) - 1);
    expect(s.practices!.softer?.[ANN]).toBeUndefined();
  });
});

describe('anticipation is read from the blocking', () => {
  it('a service she did not ask for, that fits her focus: practice_anticipated, favour +1, Regard +1, and the verdict one step up', () => {
    let s = doing(scened(), ANN, 'reading_reports').state;
    const regard0 = regardOf(s, R2, ANN);
    const r = doing(s, COMMANDER, 'serve_loud'); // fits, but felt: adequate on its own
    expect(ofType(r.events, 'practice_anticipated')).toEqual([expect.objectContaining({ unitId: ANN })]);
    s = r.state;
    expect(dyn(s).favour).toBe(1);
    expect(regardOf(s, R2, ANN)).toBe(regard0 + 1);
    const end = endScene(s);
    expect(ofType(end.events, 'service_rated')[0]).toMatchObject({ kind: 'pleased', via: 'engine' });
  });

  it('the same service asked by an open task is not anticipated, and stays adequate', () => {
    const s = asked(doing(scened(), ANN, 'reading_reports').state);
    const r = doing(s, COMMANDER, 'serve_loud');
    expect(ofType(r.events, 'practice_anticipated')).toEqual([]);
    expect(dynamicOf(r.state, ANN)!.favour).toBe(0);
    expect(ofType(endScene(r.state).events, 'service_rated')[0].kind).toBe('adequate');
  });

  it('a service that does not fit what she is doing is not anticipation, and it is counted once a scene', () => {
    const none = doing(doing(scened(), ANN, 'idle').state, COMMANDER, 'serve_loud');
    expect(ofType(none.events, 'practice_anticipated')).toEqual([]);
    let s = doing(scened(), ANN, 'reading_reports').state;
    s = doing(s, COMMANDER, 'serve_loud').state;
    s = doing(s, COMMANDER, 'serve_quiet').state;
    expect(dynamicOf(s, ANN)!.favour).toBe(1);
  });
});

describe('her default activity is read by field (review M15)', () => {
  it('the first of hers that is fully on the commander and that no source sets', () => {
    expect(defaultActivity(R2)).toBe('attending');
    const altered = { ...R2, blockingActivities: new Map([...R2.blockingActivities].filter(([id]) => id !== 'attending')) } as Registries;
    expect(defaultActivity(altered)).not.toBe('attending'); // another pack's default is found by its fields, or none
    expect(defaultActivity(altered) === undefined || altered.blockingActivities.get(defaultActivity(altered)!)!.sources === undefined).toBe(true);
  });
});
