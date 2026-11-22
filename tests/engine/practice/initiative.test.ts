import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import { askAnswer, askRefusal, askable } from '../../../src/engine/practice/initiative';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { issuedDirective } from '../../../src/practice/directives';
import { errors, loadCore, ofType, run } from '../../helpers/world';
import { ANN, BEA, holderBond, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

type Style = 'cruel' | 'cold' | 'ritual' | 'possessive' | 'affectionate' | 'drill' | 'playful' | 'regal';
const askTask = (s: CampaignState, unitId = ANN) => run(s, reg, { type: 'practice/ask', payload: { unitId, what: 'task' } });
const askPunishment = (s: CampaignState, unitId = ANN) => run(s, reg, { type: 'practice/ask', payload: { unitId, what: 'punishment' } });

/** Ann holds at `play` (hold 30) in `style` and practises service too (the task seeds). */
function holder(style: Style, over: { hold?: number; favour?: number } = {}): CampaignState {
  const s = world(reg, 'play');
  s.content = { enabled: [...(s.content?.enabled ?? []), 'service', 'physical_discipline_shown', 'pain_rough'] };
  unitOf(s, ANN).bond!.practice!.categories.service = { as: 'enjoys', witness: 'indifferent' };
  unitOf(s, ANN).bond!.practice!.style = { primary: style };
  dynamicOf(s, ANN)!.hold = over.hold ?? 30;
  if (over.favour !== undefined) dynamicOf(s, ANN)!.favour = over.favour;
  return s;
}
const scened = (s: CampaignState, participants: string[]): CampaignState => {
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants, origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
};

describe('who the chips are for', () => {
  it('an eligible unit at equal and a holder may be asked; a woman who could not hold and holds nothing may not', () => {
    expect(askable(holder('ritual'), reg, ANN)).toBe(true);
    const eligible = world(reg, 'equal');
    delete eligible.relations[ANN].dynamic; // no block yet: she is only eligible
    expect(askable(eligible, reg, ANN)).toBe(true);
    const never = world(reg, 'equal');
    delete never.relations[ANN].dynamic;
    unitOf(never, ANN).bond!.practice!.inclination = 'none';
    expect(askable(never, reg, ANN)).toBe(false);
    const aftermath = holder('ritual');
    dynamicOf(aftermath, ANN)!.aftermath = { id: 'x', kind: 'rejection' } as never;
    expect(askable(aftermath, reg, ANN)).toBe(false);
    expect(askable(holder('ritual'), reg, BEA)).toBe(false); // no profile
  });
});

describe('her answer (R15)', () => {
  it('accepts: ritual, drill and regal, and anyone at hold 40 or more', () => {
    for (const style of ['ritual', 'drill', 'regal'] as const) expect(askAnswer(holder(style), reg, ANN, 'task').answer, style).toBe('accepted');
    expect(askAnswer(holder('possessive', { hold: 40 }), reg, ANN, 'task').answer).toBe('accepted');
    expect(askAnswer(holder('possessive', { hold: 39 }), reg, ANN, 'task').answer).not.toBe('accepted');
  });

  it('mocks: cruel and cold, playful while hold is under 20, and anyone at a favour of refusalAt or less', () => {
    expect(askAnswer(holder('cruel'), reg, ANN, 'task').answer).toBe('mocked');
    expect(askAnswer(holder('cold'), reg, ANN, 'task').answer).toBe('mocked');
    expect(askAnswer(holder('playful', { hold: 19 }), reg, ANN, 'task').answer).toBe('mocked');
    expect(askAnswer(holder('playful', { hold: 30 }), reg, ANN, 'task').answer).toBe('refused');
    expect(askAnswer(holder('ritual', { favour: TUNING.practice.refusalAt }), reg, ANN, 'task').answer).toBe('mocked'); // one step harsher
  });

  it('refuses: affectionate kindly, possessive as an opening; the rest minor', () => {
    expect(askAnswer(holder('affectionate'), reg, ANN, 'task')).toMatchObject({ answer: 'refused', kind: true });
    expect(askAnswer(holder('possessive'), reg, ANN, 'task')).toMatchObject({ answer: 'refused', opening: true });
    expect(askAnswer(holder('drill'), reg, ANN, 'task').answer).toBe('accepted');
  });
});

describe('accepts', () => {
  it('a task request is written (asked) and her hold rises by the draft amount', () => {
    const s = holder('ritual');
    const before = dynamicOf(s, ANN)!.hold;
    const rng = JSON.stringify(s.rng);
    const r = askTask(s);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'ask_answered')[0]).toMatchObject({ unitId: ANN, what: 'task', answer: 'accepted' });
    const asked = r.state.practices!.requests.filter((q) => q.holderId === ANN);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toMatchObject({ kind: 'task', asked: true });
    expect(dynamicOf(r.state, ANN)!.hold).toBeGreaterThan(before);
    expect(dynamicOf(r.state, ANN)!.hold - before).toBeLessThanOrEqual(TUNING.practice.ask.hold * 1.3);
    expect(JSON.stringify(r.state.rng)).toBe(rng); // no draw
  });

  it('a punishment request carries the offence asked, at minor, with an entry the engine picked', () => {
    const r = askPunishment(holder('ritual'));
    expect(errors(r.events)).toEqual([]);
    const q = r.state.practices!.requests.find((x) => x.kind === 'punishment')!;
    expect(q).toMatchObject({ holderId: ANN, asked: true, offence: { kind: 'asked', stakes: 'minor' } });
    expect(typeof q.entryId).toBe('string');
    expect(q.severity).toBeGreaterThanOrEqual(1);
  });

  it('asking does not count as an offence in her repeat list', () => {
    const r = askPunishment(holder('ritual'));
    expect(r.state.practices!.offences[ANN] ?? []).toEqual([]);
  });

  it('an eligible unit at equal with no dynamic: the first gain starts it (no request: she does not hold yet)', () => {
    const s = world(reg, 'equal');
    delete s.relations[ANN].dynamic;
    unitOf(s, ANN).bond!.practice!.style = { primary: 'ritual' };
    const r = askTask(s);
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'dynamic_started')).toHaveLength(1);
    expect(dynamicOf(r.state, ANN)!.hold).toBeGreaterThan(0);
    expect(r.state.practices?.requests ?? []).toHaveLength(0);
  });
});

describe('mocks', () => {
  it('cruel: her record +3, the humiliation fact for those present, protocol_public for each other participant', () => {
    const s = scened(holder('cruel'), [ANN, BEA]);
    const rng = JSON.stringify(s.rng);
    const r = askTask(s);
    expect(errors(r.events)).toEqual([]);
    const ev = ofType(r.events, 'ask_answered')[0];
    expect(ev).toMatchObject({ answer: 'mocked', what: 'task' });
    expect(ev.present).toEqual([ANN, BEA]);
    expect(r.state.relations[ANN].impunityRecord).toBe(TUNING.practice.ask.mockRecord);
    expect(r.state.memory.facts.some((f) => f.knownBy.includes(BEA) && f.about.includes(ANN) && /mocked/.test(f.text))).toBe(true); // the memory rule `ask_mocked`
    expect(r.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBeGreaterThan(0); // protocol_public
    expect(r.state.practices?.requests ?? []).toHaveLength(0);
    expect(JSON.stringify(r.state.rng)).toBe(rng);
  });

  it('in a DM nobody else saw it: her record rises, no sign, the fact is hers and the commander’s alone', () => {
    const r = askTask(holder('cold'));
    expect(r.state.relations[ANN].impunityRecord).toBe(TUNING.practice.ask.mockRecord);
    expect(r.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0).toBe(0);
  });
});

describe('refuses', () => {
  it('affectionate kindly: no record, no hold, no request', () => {
    const s = holder('affectionate');
    const before = dynamicOf(s, ANN)!.hold;
    const r = askTask(s);
    expect(ofType(r.events, 'ask_answered')[0]).toMatchObject({ answer: 'refused', kind: true });
    expect(r.state.relations[ANN].impunityRecord ?? 0).toBe(0);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(before);
    expect(r.state.practices?.requests ?? []).toHaveLength(0);
  });

  it('possessive takes it as an opening: "opening" joins her recent forms and hold rises by one', () => {
    const s = holder('possessive');
    const before = dynamicOf(s, ANN)!.hold;
    const r = askTask(s);
    expect(ofType(r.events, 'ask_answered')[0]).toMatchObject({ answer: 'refused' });
    expect(dynamicOf(r.state, ANN)!.recent.at(-1)).toBe('opening');
    expect(dynamicOf(r.state, ANN)!.hold).toBeGreaterThan(before);
    expect(r.state.relations[ANN].impunityRecord ?? 0).toBe(0);
  });
});

describe('what stops it', () => {
  it('asking another woman while the commander is held by a holder who lacks the others domain is refused with the reason', () => {
    const s = holder('ritual');
    unitOf(s, BEA).bond = holderBond(); // Bea could hold: she has a profile and no block yet
    expect(askable(s, reg, BEA)).toBe(true);
    // Ann holds without `relation_rules`; Bea is the woman asked
    expect(askRefusal(s, reg, BEA, 'task')).toMatch(/others/i);
    expect(errors(askTask(s, BEA).events)[0]?.message).toMatch(/others/i);
    // with the domain she allows it
    dynamicOf(s, ANN)!.domains = [{ id: 'others', since: s.day }];
    dynamicOf(s, ANN)!.hold = 80;
    expect(askRefusal(s, reg, BEA, 'task')).toBeNull();
    // and asking the holder herself is never a matter for it
    expect(askRefusal(holder('ritual'), reg, ANN, 'task')).toBeNull();
  });

  it('once a day per woman, and not with a scene open without her', () => {
    const s = holder('ritual');
    const first = askTask(s);
    expect(errors(first.events)).toEqual([]);
    const again = askTask(first.state);
    expect(errors(again.events)[0]?.message).toMatch(/already/i);
    const elsewhere = scened(holder('ritual'), [BEA]);
    expect(errors(askTask(elsewhere).events)[0]?.message).toMatch(/not here/i);
  });

  it('nothing is asked for when no punishment could be given, or no task is open to her', () => {
    const none = holder('ritual');
    none.content = { enabled: ['restraint'] }; // no service seeds: no task; the punishments that need restraint only: slot_held is possible
    const t = askTask(none);
    expect(errors(t.events)[0]?.message).toMatch(/nothing/i);
  });
});

describe('the directive', () => {
  it('carries the engine’s answer word only: no number, no pronoun for the commander', () => {
    for (const [style, word] of [['ritual', /agree/i], ['cruel', /laugh|mock/i], ['possessive', /turn|down|refus/i]] as const) {
      const s = holder(style);
      const r = askTask(s);
      const e = ofType(r.events, 'ask_answered')[0];
      const sc = scened(holder(style), [ANN]);
      const d = issuedDirective(e, sc, reg)!;
      expect(d.id).toBe(`practice:ask:${ANN}`);
      expect(d.expiresAfter).toBe('next_reply');
      expect(d.text, style).toMatch(word);
      expect(d.text).not.toMatch(/\d/);
      expect(d.text).not.toMatch(/\b(he|him|his|himself)\b/i);
      expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
    }
  });

  it('also in a DM: her reply there is told the answer too', () => {
    const s = holder('ritual');
    const e = ofType(askTask(s).events, 'ask_answered')[0];
    expect(issuedDirective(e, s, reg)?.id).toBe(`practice:ask:${ANN}`);
  });
});
