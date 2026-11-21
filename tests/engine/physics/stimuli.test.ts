import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { perceptionLines } from '../../../src/blocking/physicsDirectives';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { rememberEvents } from '../../../src/engine/memory/remember';
import { bandOfLevel, scentBand, scentLevel } from '../../../src/engine/physics/scent';
import {
  decayStimuli, exposedKinds, inhaleZone, perceptionWord, reflexAt, stageOf, toleranceOf, updateTrajectory, applyWay, type Way,
} from '../../../src/engine/physics/stimuli';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { enable } from '../../helpers/bonds';
import { campaign, endDay, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const ON = ['worship', 'bodily_fluids', 'humiliation'];

/** A scene with the commander at Ann's feet (a foot worship contact: the scent of her feet and the salt of her skin reach the body). */
function worship(on: string[] = ON): CampaignState {
  registerFrameReader(() => 'play');
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, ...on);
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: COMMANDER, field: 'contact', value: 'foot_worship', with: ANN, target: 'feet' }, { at: 3, source: 'chip' });
  return st;
}
const way = (s: CampaignState, w: Way | string, kind: string, depth?: number | string, seed = 1) => {
  const d = structuredClone(s);
  d.rng = seedRng(seed);
  return run(d, reg, { type: 'physics/stimulus', payload: { way: w, kind, ...(depth !== undefined ? { depth } : {}) } });
};
type StimRow = NonNullable<CampaignState['commander']['stimuli']>[string];
const contactRecord = (s: CampaignState) => Object.values(s.scene!.blocking!).find((b) => b.contact)!.contact!;
const row = (s: CampaignState, kind: string) => s.commander.stimuli![kind]!;

describe('the scent band', () => {
  it('a base per part × hygiene × the situation; the bands at 1 / 2 / 3.5', () => {
    const s = worship();
    expect(scentLevel(s, reg, ANN, 'armpits')).toBe(1.5);
    expect(scentBand(s, reg, ANN, 'armpits')).toBe('noticeable');
    expect(scentBand(s, reg, ANN, 'feet')).toBe('strong'); // 2 at rest
    expect(scentBand(s, reg, ANN, 'hair')).toBe('faint');
    expect([0.99, 1, 1.99, 2, 3.49, 3.5].map(bandOfLevel)).toEqual(['faint', 'noticeable', 'noticeable', 'strong', 'strong', 'overwhelming']);
  });

  it('after a run: ×2 the day she came back, ×1.5 the day after; after training ×1.5 this slot', () => {
    const s = worship();
    s.lastExpedition = { day: s.day, party: [ANN] } as never;
    expect(scentLevel(s, reg, ANN, 'feet')).toBe(4);
    expect(scentBand(s, reg, ANN, 'feet')).toBe('overwhelming');
    s.day += 1;
    expect(scentLevel(s, reg, ANN, 'feet')).toBe(3);
    expect(scentBand(s, reg, ANN, 'feet')).toBe('strong');
    s.day += 1;
    expect(scentLevel(s, reg, ANN, 'feet')).toBe(2);
    expect(scentLevel(s, reg, 'unit_bea', 'feet')).toBe(2); // not her run
    const t = worship();
    t.life = { salt: 1, nextId: 0, units: {}, queue: [], delivered: [], busy: [{ unitId: ANN, slot: t.day * 4 + 0, activityId: 'train' }] } as never;
    expect(scentLevel(t, reg, ANN, 'armpits')).toBeCloseTo(1.5 * 1.5, 6);
  });
});

describe('what the scene exposes', () => {
  it('the contact\'s target stimuli, only the allowed kinds; sweat joins after a run', () => {
    const s = worship();
    expect(exposedKinds(s, reg).map((e) => e.kind).sort()).toEqual(['scent_feet', 'taste_salt']);
    expect(exposedKinds(s, reg)[0]).toMatchObject({ holderId: ANN, part: 'feet' });
    const after = structuredClone(s);
    after.lastExpedition = { day: after.day, party: [ANN] } as never;
    expect(exposedKinds(after, reg).map((e) => e.kind)).toContain('sweat_exertion');
    expect(exposedKinds(campaign(reg, 4), reg)).toEqual([]);
    const off = structuredClone(after);
    off.content = { enabled: ['worship', 'humiliation'] }; // no bodily_fluids: no sweat
    expect(exposedKinds(off, reg).map((e) => e.kind)).not.toContain('sweat_exertion');
  });
});

describe('tolerance', () => {
  it('+2 per scene of exposure, however many ways; a new scene is a new session', () => {
    const s = worship();
    expect(toleranceOf(s, 'scent_feet')).toBe(TUNING.stimuli.startTolerance);
    const a = way(s, 'sniff', 'scent_feet').state;
    expect(row(a, 'scent_feet')).toMatchObject({ tolerance: 22, exposure: 1 });
    const b = way(a, 'sniff', 'scent_feet').state;
    expect(row(b, 'scent_feet').tolerance).toBe(22);
    const next = structuredClone(b);
    next.scene!.id = 's99';
    expect(row(way(next, 'sniff', 'scent_feet').state, 'scent_feet')).toMatchObject({ tolerance: 24, exposure: 2 });
  });

  it('slips back 1 per 7 days apart and never below half the best', () => {
    const s = worship();
    const d = structuredClone(s);
    d.commander.stimuli = { scent_feet: { tolerance: 24, exposure: 2, lastDay: 1, best: 24, seek: 0, stage: 'aversion' } };
    d.day = 8;
    decayStimuli(d);
    expect(row(d, 'scent_feet').tolerance).toBe(23);
    decayStimuli(d); // idempotent within the week
    expect(row(d, 'scent_feet').tolerance).toBe(23);
    for (let day = 15; day <= 15 + 7 * 30; day += 7) {
      d.day = day;
      decayStimuli(d);
    }
    expect(row(d, 'scent_feet').tolerance).toBe(12); // half the best
  });

  it('decays on its own at the day end (the day step is registered)', () => {
    const s = campaign(reg, 4);
    s.commander.stimuli = { scent_feet: { tolerance: 30, exposure: 3, lastDay: -20, best: 30, seek: 0, stage: 'aversion' } };
    const after = endDay(s, reg);
    expect(after.commander.stimuli!.scent_feet!.tolerance).toBe(29);
  });
});

describe('the reflex and the inhale', () => {
  it('the body protests above tolerance × 1.2 in stimulus units: a nuzzle at strong feet at the start is a reflex', () => {
    const s = worship();
    expect(reflexAt(s, 'scent_feet')).toBeCloseTo(24, 6);
    const r = way(s, 'nuzzle', 'scent_feet');
    expect(ofType(r.events, 'stimulus_way')[0]).toMatchObject({ result: 'reflex' });
    const tough = structuredClone(s);
    tough.commander.stimuli = { scent_feet: { tolerance: 45, exposure: 9, lastDay: 1, best: 45, seek: 0, stage: 'aversion', session: tough.scene!.id } };
    expect(ofType(way(tough, 'nuzzle', 'scent_feet').events, 'stimulus_way')[0]).toMatchObject({ result: 'ok' }); // 50 < 54
  });

  it('the inhale zone is [b × 20, b × 20 + 10 + tolerance / 5] and widens with tolerance', () => {
    expect(inhaleZone('strong', 20)).toEqual([40, 54]);
    expect(inhaleZone('strong', 60)).toEqual([40, 62]);
    expect(inhaleZone('faint', 0)).toEqual([0, 10]);
    expect(inhaleZone('overwhelming', 100)[0]).toBe(60);
  });

  it('turn-based: shallow / deep / very deep against the band + 1; too far is the reflex, too short is shallow', () => {
    const s = worship(); // feet at rest: strong, index 2: the right depth is 3
    const res = (d: string) => ofType(way(s, 'inhale', 'scent_feet', d).events, 'stimulus_way')[0]!.result;
    expect(res('shallow')).toBe('shallow');
    expect(res('deep')).toBe('shallow');
    expect(res('very_deep')).toBe('ok');
    expect(ofType(way(s, 'inhale', 'scent_feet', 'very_deep').events, 'reflex')).toEqual([]);
    const fainter = structuredClone(s);
    contactRecord(fainter).target = 'hands'; // her hands: a faint scent, so the right depth is one and anything deeper is too far
    expect(scentBand(fainter, reg, ANN, 'hands')).toBe('faint');
    expect(ofType(way(fainter, 'inhale', 'scent_body', 'deep').events, 'stimulus_way')[0]).toMatchObject({ result: 'reflex' });
    expect(ofType(way(fainter, 'inhale', 'scent_body', 'shallow').events, 'stimulus_way')[0]).toMatchObject({ result: 'ok' });
  });

  it('real time: the bar released in the zone is a good inhale, above it the reflex, below it shallow', () => {
    const s = worship();
    const [lo, hi] = inhaleZone('strong', 22); // the first session lifts the tolerance to 22 before the zone is read
    const res = (n: number) => ofType(way(s, 'inhale', 'scent_feet', n).events, 'stimulus_way')[0]!.result;
    expect(res(lo - 1)).toBe('shallow');
    expect(res(lo)).toBe('ok');
    expect(res(hi)).toBe('ok');
    expect(res(hi + 1)).toBe('reflex');
  });

  it('overshoot is a reflex: the event, a slip and a cough; and it joins the segment\'s noise', () => {
    const s = worship();
    const r = way(s, 'inhale', 'scent_feet', 100);
    expect(ofType(r.events, 'reflex')[0]).toMatchObject({ kind: 'scent_feet', way: 'inhale', holderId: ANN });
    expect(ofType(r.events, 'physics_slip')[0]).toMatchObject({ kind: 'reflex' });
    expect(ofType(r.events, 'physics_noise')[0]).toMatchObject({ kind: 'cough', loudness: 1 });
  });

  it('is refused for what the scene does not offer', () => {
    const s = worship();
    for (const [w, kind, d] of [['sing', 'scent_feet'], ['sniff', 'scent_body'], ['taste', 'scent_feet'], ['sniff', 'taste_salt'], ['inhale', 'scent_feet']] as Array<[string, string, string?]>) {
      expect(errors(way(s, w, kind, d).events), `${w} ${kind}`).not.toEqual([]);
    }
    const off = structuredClone(s);
    off.settings.physicsInteractions = { timing: true, hold: true, decision: true, order: true, passive: true, gesture: true, inhale: false };
    expect(errors(way(off, 'inhale', 'scent_feet', 'deep').events)).not.toEqual([]);
    expect(errors(run(campaign(reg, 4), reg, { type: 'physics/stimulus', payload: { way: 'sniff', kind: 'scent_feet' } }).events)).not.toEqual([]);
    expect(errors(way(s, 'sniff', 'scent_feet').events)).toEqual([]);
    expect(errors(way(s, 'taste', 'taste_salt').events)).toEqual([]);
  });
});

describe('the other ways', () => {
  it('avoid is noticed with 0.6 (one draw), and moves the trajectory down', () => {
    const s = worship();
    let noticed = 0;
    for (let seed = 1; seed <= 500; seed++) if (ofType(way(s, 'avoid', 'scent_feet', undefined, seed).events, 'stimulus_way')[0]!.noticed === true) noticed++;
    expect(noticed / 500).toBeCloseTo(0.6, 1);
    const one = way(s, 'avoid', 'scent_feet', undefined, 4);
    const rng = new Rng(seedRng(4));
    rng.float();
    expect(one.state.rng).toEqual(rng.state);
    expect(row(one.state, 'scent_feet').seek).toBe(0);
  });

  it('in secret is the cheat in reverse: caught with the gaze chance, seeking all the same', () => {
    const s = worship();
    let caught = 0;
    for (let seed = 1; seed <= 600; seed++) if (ofType(way(s, 'secret', 'scent_feet', undefined, seed).events, 'physics_caught').length > 0) caught++;
    expect(caught / 600).toBeCloseTo(0.7 * 0.6 + 0.3 * 0.25, 1);
    expect(row(way(s, 'secret', 'scent_feet').state, 'scent_feet').seek).toBeGreaterThan(0);
  });

  it('sniff, inhale, nuzzle, as ordered and taste draw nothing', () => {
    const s = worship();
    for (const [w, k, d] of [['sniff', 'scent_feet'], ['inhale', 'scent_feet', 'deep'], ['nuzzle', 'scent_feet'], ['ordered', 'scent_feet'], ['taste', 'taste_salt']] as Array<[string, string, string?]>) {
      expect(way(s, w, k, d, 6).state.rng, w).toEqual(seedRng(6));
    }
  });
});

describe('the trajectory', () => {
  it('stages at 0.2 / 0.4 / 0.6 / 0.8', () => {
    expect([0, 0.19, 0.2, 0.4, 0.6, 0.8, 1].map(stageOf)).toEqual(['aversion', 'aversion', 'enduring', 'accustomed', 'craving', 'adoring', 'adoring']);
  });

  it('moves down on avoiding, up on seeking, and a stage waits for three agreeing updates', () => {
    const r: StimRow = { tolerance: 20, exposure: 1, lastDay: 1, best: 20, seek: 0.1, stage: 'aversion' };
    expect(updateTrajectory(r, true)).toBeNull(); // 0.235: enduring, 1st
    expect(r.pending).toEqual({ stage: 'enduring', n: 1 });
    expect(updateTrajectory(r, true)).toBeNull(); // 0.30: 2nd
    expect(updateTrajectory(r, true)).toEqual({ from: 'aversion', to: 'enduring' }); // 0.355: 3rd
    expect(r.stage).toBe('enduring');
    expect(r.pending).toBeUndefined();
    const flip: StimRow = { tolerance: 20, exposure: 1, lastDay: 1, best: 20, seek: 0.2, stage: 'enduring' };
    expect(updateTrajectory(flip, false)).toBeNull(); // 0.17: aversion, 1st
    expect(updateTrajectory(flip, true)).toBeNull(); // 0.31: back to enduring: the pending ends
    expect(flip.pending).toBeUndefined();
    expect(flip.stage).toBe('enduring');
  });

  it('through the ways: three seeking contacts in a row before the stage moves, and the event says she was there', () => {
    let s = worship();
    s.commander.stimuli = { scent_feet: { tolerance: 50, exposure: 5, lastDay: 1, best: 50, seek: 0.1, stage: 'aversion', session: s.scene!.id } };
    const events: Array<{ type: string; [k: string]: unknown }> = [];
    for (let i = 0; i < 3; i++) {
      const r = way(s, 'sniff', 'scent_feet');
      events.push(...ofType(r.events, 'stimulus_stage_changed'));
      s = r.state;
    }
    expect(events).toEqual([{ type: 'stimulus_stage_changed', kind: 'scent_feet', from: 'aversion', to: 'enduring', herPresent: true, holderId: ANN }]);
  });
});

describe('perception, not feeling', () => {
  it('the stage picks the line; faint fades from tolerance 40; a week apart reads "like the first time"', () => {
    const s = worship();
    const w = reg.stimulusKinds.get('scent_feet')!.perception as Record<string, string>;
    expect(perceptionWord(s, reg, 'scent_feet')).toBe(w.aversion);
    s.commander.stimuli = { scent_feet: { tolerance: 30, exposure: 4, lastDay: s.day, best: 30, seek: 0.5, stage: 'accustomed' } };
    expect(perceptionWord(s, reg, 'scent_feet')).toBe(w.accustomed);
    expect(perceptionWord(s, reg, 'scent_feet', 'faint')).toBe(w.accustomed); // tolerance 30: still reaches
    s.commander.stimuli.scent_feet!.tolerance = 40;
    expect(perceptionWord(s, reg, 'scent_feet', 'faint')).toBeNull();
    expect(perceptionWord(s, reg, 'scent_feet', 'noticeable')).toBe(w.accustomed);
    s.day += 7;
    expect(perceptionWord(s, reg, 'scent_feet')).toBe(w.separated);
    expect(perceptionWord(s, reg, 'nonsense')).toBeNull();
  });

  it('something is missing: a craved kind with no exposure for three days costs 3 stress, once a day, and the word says so until the next exposure', () => {
    const s = campaign(reg, 4);
    s.commander.stress = 0;
    s.day = 10;
    s.commander.stimuli = { scent_feet: { tolerance: 30, exposure: 9, lastDay: 8, best: 30, seek: 0.7, stage: 'craving' } };
    expect(decayStimuli(s)).toEqual([]); // two days: not yet
    s.day = 11;
    const events = decayStimuli(s);
    expect(events).toMatchObject([{ type: 'commander_stress_changed', delta: 3 }]);
    expect(s.commander.stress).toBe(3);
    expect(decayStimuli(s)).toEqual([]); // once a day
    s.day = 12;
    decayStimuli(s);
    expect(s.commander.stress).toBe(6);
    expect(perceptionWord(s, reg, 'scent_feet')).toMatch(/missing/i);
    const calm = campaign(reg, 4);
    calm.commander.stress = 0;
    calm.day = 20;
    calm.commander.stimuli = { scent_feet: { tolerance: 30, exposure: 3, lastDay: 1, best: 30, seek: 0.3, stage: 'accustomed' } }; // not craved: nothing is missed
    expect(decayStimuli(calm)).toEqual([]);
    // she is breathed again: the missing word and the stress stop
    const back = worship();
    back.day = 12;
    back.commander.stimuli = { scent_feet: { tolerance: 30, exposure: 9, lastDay: 8, best: 30, seek: 0.7, stage: 'craving', missedDay: 11 } };
    const after = way(back, 'sniff', 'scent_feet').state;
    expect(row(after, 'scent_feet').missedDay).toBeUndefined();
    expect(perceptionWord(after, reg, 'scent_feet')).not.toMatch(/missing/i);
  });

  it('the directive carries what reaches the commander and no feeling, no pronoun', () => {
    const s = worship();
    const d = perceptionLines(s, reg)!;
    expect(d.id).toBe('physics:perception');
    expect(d.expiresAfter).toBe('manual');
    expect(d.text.startsWith('What reaches the commander: ')).toBe(true);
    expect(d.text).not.toMatch(/\b(feel|feels|feeling|love|loves|enjoy|enjoys|ashamed|afraid)\b/i);
    expect(d.text).not.toMatch(/\b(he|him|his)\b/i);
    for (const stage of ['aversion', 'enduring', 'accustomed', 'craving', 'adoring'] as const) {
      const t = structuredClone(s);
      t.commander.stimuli = { scent_feet: { tolerance: 20, exposure: 1, lastDay: t.day, best: 20, seek: 0, stage } };
      expect(perceptionLines(t, reg)!.text).not.toMatch(/\b(he|him|his)\b/i);
    }
    expect(perceptionLines(campaign(reg, 4), reg)).toBeNull();
    const faded = structuredClone(s);
    contactRecord(faded).target = 'hair'; // faint scent_body: nothing reaches once tolerance is high
    faded.commander.stimuli = { scent_body: { tolerance: 45, exposure: 9, lastDay: faded.day, best: 45, seek: 0.5, stage: 'accustomed' }, taste_skin: { tolerance: 20, exposure: 1, lastDay: faded.day, best: 20, seek: 0, stage: 'aversion' } };
    expect(perceptionLines(faded, reg)!.text).not.toContain(String((reg.stimulusKinds.get('scent_body')!.perception as Record<string, string>).accustomed));
  });
});

describe('the memory rules', () => {
  const facts = (...events: Array<Record<string, unknown> & { type: string }>) => {
    const d = worship();
    rememberEvents(d, events, reg);
    return d.memory.facts.filter((f) => f.tags.includes('stimulus'));
  };
  const staged = (to: string, herPresent: boolean) => ({ type: 'stimulus_stage_changed', kind: 'scent_feet', from: 'accustomed', to, herPresent, holderId: ANN });

  it('craving and adoring, while she was there, are facts of the pair; absent, or any other stage, none', () => {
    expect(facts(staged('craving', true))).toMatchObject([{ about: [ANN], knownBy: [ANN], importance: 3, tags: ['physics', 'stimulus', 'craving'] }]);
    expect(facts(staged('adoring', true))).toMatchObject([{ importance: 3, tags: ['physics', 'stimulus', 'adoring'] }]);
    expect(facts(staged('craving', false))).toEqual([]);
    for (const to of ['aversion', 'enduring', 'accustomed']) expect(facts(staged(to, true))).toEqual([]);
    const t = facts(staged('craving', true))[0]!.text;
    expect(t).toContain('scent of her feet');
    expect(t).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('end to end: the third seeking contact that moves the stage into craving writes the fact', () => {
    let s = worship();
    s.commander.stimuli = { scent_feet: { tolerance: 60, exposure: 9, lastDay: 1, best: 60, seek: 0.59, stage: 'accustomed', session: s.scene!.id } };
    for (let i = 0; i < 3; i++) s = way(s, 'sniff', 'scent_feet').state;
    expect(s.commander.stimuli!.scent_feet!.stage).toBe('craving');
    expect(s.memory.facts.filter((f) => f.tags.includes('craving'))).toHaveLength(1);
  });
});
