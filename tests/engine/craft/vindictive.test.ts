import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/craft';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/practice';
import { registerFrameReader, resetBlockingHooks } from '../../../src/engine/blocking';
import { sentenceOf, vindictiveDayStep } from '../../../src/engine/craft/programmes/vindictive';
import { forcedEditorOf } from '../../../src/engine/personal/intercept';
import { book } from '../../../src/engine/personal/bookings';
import { noteOffence, pickHolderPunishment } from '../../../src/engine/practice/offences';
import { pickSeeds, seedRows } from '../../../src/engine/practice/seeds';
import { obedienceOf } from '../../../src/engine/personal/state';
import { rememberEvents } from '../../../src/engine/memory/remember';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { ctxOf, loadCore } from '../../helpers/world';
import { ANN, BEA, unitOf, withService, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => { resetBlockingHooks(); });

type Ev = { type: string; [k: string]: unknown };

/** Ann holds at `play`, is vindictive and knows the commander's crime. */
function sentenced(crime = 'liquidation', opts: { knows?: boolean; style?: string } = {}): CampaignState {
  registerFrameReader(() => 'play');
  const s = withService(world(reg, 'play'));
  s.content = { enabled: [...new Set([...(s.content?.enabled ?? []), 'jealousy_games', 'physical_discipline_shown'])] };
  s.relations[ANN].stateId = 'lover';
  unitOf(s, ANN).bond!.practice!.style = { primary: (opts.style ?? 'vindictive') as 'vindictive' };
  s.commander.crimeId = crime;
  if (opts.knows !== false) s.relations[ANN].flags = [...s.relations[ANN].flags, 'knows_crime'];
  return s;
}
const step = (s: CampaignState): Ev[] => vindictiveDayStep(s, ctxOf(s, reg)) as Ev[];
const offend = (s: CampaignState, ref: string): Ev[] => noteOffence(s, ctxOf(s, reg), ANN, { kind: 'protocol_slip', ref, stakes: 'trivial', day: s.day }) as Ev[];

describe('the sentence', () => {
  it('starts at a day step, only for a vindictive holder who knows the crime', () => {
    const s = sentenced();
    const events = step(s);
    expect(events.filter((e) => e.type === 'sentence_set')).toEqual([{ type: 'sentence_set', unitId: ANN, holderId: ANN, days: 21 }]);
    expect(s.relations[ANN].craft!.sentence).toMatchObject({ crimeId: 'liquidation', start: s.day, until: s.day + 21, extended: 0 });
    expect(step(s).some((e) => e.type === 'sentence_set')).toBe(false); // once
    for (const bare of [sentenced('liquidation', { knows: false }), sentenced('liquidation', { style: 'cold' })]) {
      expect(step(bare)).toEqual([]);
      expect(bare.relations[ANN].craft).toBeUndefined();
    }
    const none = sentenced();
    none.commander.crimeId = null;
    expect(step(none)).toEqual([]);
  });

  it('the term is the echo row\'s (7 to 30 days), read by the crime field', () => {
    const terms = [...reg.crimeEchoes.values()].map((e) => [e.crime, e.days] as const);
    expect(terms.length).toBe(6);
    for (const [crime, days] of terms) {
      const s = sentenced(String(crime));
      step(s);
      expect(s.relations[ANN].craft!.sentence!.until - s.day, String(crime)).toBe(days);
      expect(days).toBeGreaterThanOrEqual(7);
      expect(days).toBeLessThanOrEqual(30);
    }
  });

  it('a crime with no echo row gets the default term', () => {
    const s = sentenced('liquidation');
    s.commander.crimeId = 'something_else';
    step(s);
    expect(s.relations[ANN].craft!.sentence!.until - s.day).toBe(TUNING.craft.sentence.defaultDays);
  });

  it('a slip adds three days, at most once a day however many slips', () => {
    const s = sentenced();
    step(s);
    const until = s.relations[ANN].craft!.sentence!.until;
    const events = offend(s, 'a');
    expect(events.filter((e) => e.type === 'sentence_extended')).toEqual([{ type: 'sentence_extended', unitId: ANN, holderId: ANN, days: 3 }]);
    expect(s.relations[ANN].craft!.sentence).toMatchObject({ until: until + 3, extended: 3 });
    expect(offend(s, 'a')).toEqual([]); // the same offence is one
    expect(offend(s, 'b').some((e) => e.type === 'sentence_extended')).toBe(false); // a second slip the same day adds nothing
    expect(offend(s, 'c').some((e) => e.type === 'sentence_extended')).toBe(false);
    expect(s.relations[ANN].craft!.sentence).toMatchObject({ until: until + 3, extended: 3 });
    s.day += 1; // the next day a slip adds again
    expect(offend(s, 'd').filter((e) => e.type === 'sentence_extended')).toHaveLength(1);
    expect(s.relations[ANN].craft!.sentence).toMatchObject({ until: until + 6, extended: 6 });
  });

  it('a slip with no sentence running extends nothing and writes nothing', () => {
    const s = sentenced('liquidation', { knows: false });
    expect(offend(s, 'a').some((e) => e.type === 'sentence_extended')).toBe(false);
    expect(s.relations[ANN].craft).toBeUndefined();
  });

  it('is served: sentence_served and a closing rise of Regard for dignity; she does not sentence again', () => {
    const s = sentenced();
    step(s);
    const until = s.relations[ANN].craft!.sentence!.until;
    s.day = until - 1;
    expect(step(s).some((e) => e.type === 'sentence_served')).toBe(false);
    s.day = until;
    const before = s.relations[ANN].regard ?? 50;
    const events = step(s);
    expect(events.filter((e) => e.type === 'sentence_served')).toEqual([{ type: 'sentence_served', unitId: ANN, holderId: ANN }]);
    expect(events.find((e) => e.type === 'regard_changed' && e.cause === 'dignity')).toMatchObject({ unitId: ANN, from: before, to: before + TUNING.regard.rise.dignity * TUNING.craft.sentence.closing });
    expect(sentenceOf(s, ANN)).toBeUndefined(); // no longer running
    expect(s.relations[ANN].craft!.sentence!.servedDay).toBe(until);
    s.day += 1;
    expect(step(s).some((e) => e.type === 'sentence_set')).toBe(false);
  });

  it('a woman who stops being live pauses it: nothing happens, nothing is lost', () => {
    const s = sentenced();
    step(s);
    registerFrameReader(() => 'equal');
    s.relations[ANN].dynamic!.frame = 'equal';
    s.day += 40;
    expect(step(s)).toEqual([]);
    expect(s.relations[ANN].craft!.sentence).toBeDefined();
  });
});

describe('the echoes, by type', () => {
  it('give_up (liquidation): her punishments put privileges first, and a booking of another woman is cancelled once a week', () => {
    const s = sentenced('liquidation');
    const plain = sentenced('smuggling');
    step(s);
    step(plain);
    for (const st of [s, plain]) ((st.practices ??= { seq: 0, requests: [], tasks: [], punishments: [], demonstrations: [], restrictions: [], cold: {}, postures: {}, offences: {}, records: [], handovers: [] } as never).punishments as unknown[]).push({ holderId: ANN }); // one given already: the turns have moved on
    const isPrivilege = (id: string | null) => ((reg.holderPunishments.get(String(id))?.effects as Array<{ type: string }>) ?? []).some((fx) => fx.type === 'privilege_revoked');
    // at a weight that has both a privilege and another entry, the tilt takes the privilege
    let tilted = 0;
    for (let sev = 1; sev <= 5; sev++) if (isPrivilege(pickHolderPunishment(s, reg, ANN, sev)) && !isPrivilege(pickHolderPunishment(plain, reg, ANN, sev))) tilted++;
    expect(tilted).toBeGreaterThan(0);
    // a booking of Bea's is given up (quietly: no cancel cost), hers stays
    const day = s.day;
    book(s, { registries: reg }, { unitId: BEA, kindId: 'evening_with_me', day: day + 2, slot: 'evening', source: 'roll' });
    book(s, { registries: reg }, { unitId: ANN, kindId: 'evening_with_me', day: day + 3, slot: 'evening', source: 'roll' });
    s.day += 1;
    const events = step(s); // the first week found nothing to give up: it tries again
    expect(s.personal!.bookings!.find((b) => b.unitId === BEA)!.status).toBe('cancelled');
    expect(s.personal!.bookings!.find((b) => b.unitId === ANN)!.status).toBe('booked');
    expect(events.some((e) => e.type === 'hit_her' || e.type === 'relation_event')).toBe(false); // quietly
  });

  it('the punishment tilt answers null without a sentence: her picks are as P16 made them', () => {
    const a = sentenced('liquidation', { knows: false });
    const b = sentenced('liquidation', { knows: false });
    step(b);
    for (let sev = 1; sev <= 5; sev++) expect(pickHolderPunishment(a, reg, ANN, sev)).toBe(pickHolderPunishment(b, reg, ANN, sev));
    // and an echo with no punish list leaves them alone too
    const c = sentenced('smuggling');
    step(c);
    const d = sentenced('smuggling', { knows: false });
    for (let sev = 1; sev <= 5; sev++) expect(pickHolderPunishment(c, reg, ANN, sev)).toBe(pickHolderPunishment(d, reg, ANN, sev));
  });

  it('through_her (smuggling): she edits every message to another while it runs, and not after', () => {
    const s = sentenced('smuggling');
    expect(forcedEditorOf(s, reg, 'dm', BEA)).toBeNull(); // not before it is set
    step(s);
    expect(forcedEditorOf(s, reg, 'dm', BEA)).toBe(ANN);
    expect(forcedEditorOf(s, reg, 'dm', ANN)).toBeNull(); // a message to her is not hers to edit
    s.content = { enabled: s.content!.enabled.filter((t) => t !== 'jealousy_games') };
    expect(forcedEditorOf(s, reg, 'dm', BEA)).toBeNull(); // the device needs what the intercept needs
    s.content = { enabled: [...s.content.enabled, 'jealousy_games'] };
    s.day = s.relations[ANN].craft!.sentence!.until;
    step(s);
    expect(forcedEditorOf(s, reg, 'dm', BEA)).toBeNull();
    const other = sentenced('liquidation');
    step(other);
    expect(forcedEditorOf(other, reg, 'dm', BEA)).toBeNull(); // another crime's echo does not edit
  });

  it('experiment: her tasks come from the experiment seeds, once a week, and the ordinary pool never offers them', () => {
    const s = sentenced('experimentation');
    const echoSeeds = seedRows(reg).filter((x) => x.echo === 'experiment').map((x) => x.id);
    expect(echoSeeds.length).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < 20; i++) { const c = structuredClone(s); c.day += i; for (const id of pickSeeds(c, reg, ANN, 'task')) expect(echoSeeds).not.toContain(id); }
    const events = step(s);
    const request = s.practices!.requests.find((r) => r.kind === 'task')!;
    expect(request).toBeDefined();
    expect(request.seedIds.length).toBeGreaterThan(0);
    for (const id of request.seedIds) expect(echoSeeds).toContain(id);
    expect(events.some((e) => e.type === 'practice_requested')).toBe(true);
    s.practices!.requests = [];
    s.day += 1;
    expect(step(s).some((e) => e.type === 'practice_requested')).toBe(false); // the same week
    s.day += TUNING.craft.sentence.weekDays;
    expect(step(s).some((e) => e.type === 'practice_requested')).toBe(true);
  });

  it('obey_day (purge): a day of obedience to her once a week of the term', () => {
    const s = sentenced('purge');
    step(s);
    expect(obedienceOf({ personal: s.personal, day: s.day + 1 })).toEqual({ unitId: ANN, who: 'commander' });
    expect(s.personal!.obedience).toMatchObject({ unitId: ANN, day: s.day + 1, who: 'commander' });
    const first = structuredClone(s.personal!.obedience);
    s.day += 1;
    step(s);
    expect(s.personal!.obedience).toEqual(first); // the same week: not again
    s.day += TUNING.craft.sentence.weekDays;
    step(s);
    expect(s.personal!.obedience).toMatchObject({ unitId: ANN, day: s.day + 1, who: 'commander' });
  });

  it('answer_first (mutiny): the rule of answering to her first is proposed to the commander, once', () => {
    const s = sentenced('mutiny');
    const events = step(s);
    const rules = (s.bonds?.rules ?? []).filter((r) => reg.relationshipRuleTemplates.get(r.templateId)?.echo === 'answer_first');
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ unitId: ANN, status: 'proposed', delivered: true });
    expect(events.some((e) => e.type === 'rule_proposed')).toBe(true);
    s.day += 8;
    step(s);
    expect((s.bonds?.rules ?? []).filter((r) => reg.relationshipRuleTemplates.get(r.templateId)?.echo === 'answer_first')).toHaveLength(1);
    // no ordinary pool offers it
    expect(sentenced('liquidation').bonds).toBeUndefined();
  });

  it('tithe (strain_trade): PLYX if the base has it, else credits, each week of the term', () => {
    const s = sentenced('strain_trade');
    s.resources = { credits: 300, supplies: 5, plyx: 2 };
    const echo = [...reg.crimeEchoes.values()].find((e) => e.crime === 'strain_trade')!;
    const fx = (echo.effects as Array<{ type: string; plyx: number; credits: number }>).find((x) => x.type === 'tithe')!;
    const events = step(s);
    expect(s.resources.plyx).toBe(2 - fx.plyx);
    expect(events.find((e) => e.type === 'resource_changed')).toMatchObject({ resource: 'plyx', amount: -fx.plyx });
    s.resources.plyx = 0;
    s.day += TUNING.craft.sentence.weekDays;
    step(s);
    expect(s.resources.credits).toBe(300 - fx.credits);
    s.resources.credits = 10;
    s.relations[ANN].craft!.sentence!.until += 30; // a longer term
    s.day += TUNING.craft.sentence.weekDays;
    step(s);
    expect(s.resources.credits).toBe(0); // never below nothing
    s.day += 1;
    step(s);
    expect(s.resources.credits).toBe(0); // and not again in the same week
  });
});

describe('what is remembered', () => {
  it('sentence_set, sentence_extended and sentence_served are hers, spread none, with no crime and no echo in the words', () => {
    const s = world(reg, 'play');
    const before = s.memory.facts.length;
    rememberEvents(s, [
      { type: 'sentence_set', unitId: ANN, days: 21 }, { type: 'sentence_extended', unitId: ANN, days: 3 }, { type: 'sentence_served', unitId: ANN },
      { type: 'exam_passed', unitId: ANN }, { type: 'exam_failed', unitId: ANN },
    ], reg);
    const facts = s.memory.facts.slice(before);
    expect(facts).toHaveLength(5);
    expect(facts.map((f) => f.importance)).toEqual([2, 2, 2, 1, 2]);
    for (const f of facts) expect(f).toMatchObject({ about: [ANN], knownBy: [ANN] });
    expect(facts[0]!.text).toMatch(/21 days/);
    expect(facts[1]!.text).toMatch(/3 days/);
    expect(facts.map((f) => f.text).join(' ')).not.toMatch(/liquidation|smuggling|crime|echo/i);
  });
});
