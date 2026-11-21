// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AnalyzeEnv } from '../../../src/analysis/model';
import { registerCoreProviders } from '../../../src/analysis/providers/core';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { aftermathDayStep, answerReturn, commandStruggleOf, countStruggleVote, resetAftermathReaders, startAftermath } from '../../../src/engine/dynamic/aftermath';
import { holderSource } from '../../../src/engine/dynamic/command';
import { addHold } from '../../../src/engine/dynamic/hold';
import { exitDynamic } from '../../../src/engine/dynamic/exit';
import { applyDynamicIntent, dynamicIntentInput } from '../../../src/engine/dynamic/intents';
import { capabilitiesOf, hasCapability } from '../../../src/engine/dynamic/domains';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { ballotFor } from '../../../src/engine/power/ballot';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { DEFAULT_SETTINGS } from '../../../src/settings';
import { h } from '../../../src/ui/dom';
import { drawReturnCards, renderReturnCard } from '../../../src/ui/dynamic/cards';
import { markedWithout, unreachable, unresolved } from '../../helpers/analyzeCoverage';
import { withOptions } from '../../helpers/power';
import { campaign, ctxOf, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); registerCoreProviders(); });
afterEach(() => { resetAftermathReaders(); document.body.innerHTML = ''; });
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const bond = (primary: ProfileStyle) => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});
const dyn = (s: CampaignState, id = ANN) => dynamicOf(s, id)!;

/** Ann holds at `frame` with `domains`; every unit is neutral (values 0, Trust 80) so every ballot but hers is FOR. */
function world(primary: ProfileStyle = 'cold', over: { frame?: Frame; hold?: number; domains?: string[] } = {}): CampaignState {
  const s = campaign(reg, 4);
  for (const id of [ANN, BEA, CAT]) { unitOf(s, id).bond = bond(id === ANN ? primary : 'cold'); unitOf(s, id).values = { ...ZERO }; }
  for (const u of s.squad) { u.values = { ...ZERO }; s.relations[u.id].trust = 80; }
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'rule', hold: over.hold ?? 70, domains: (over.domains ?? ['private_time', 'command']).map((id) => ({ id, since: 1 })) };
  s.leash.authorizationsLeft = 3;
  withOptions(s, { voting: 'on' });
  return s;
}
/** Ann has left while holding the command: the struggle is on. */
function struggle(primary: ProfileStyle = 'cold'): CampaignState {
  const s = world(primary);
  exitDynamic(s, ctxOf(s, reg), ANN, 'abrupt', {});
  expect(dyn(s).aftermath?.kind).toBe('command_kept');
  return s;
}
/** She has left without the command. */
function left(primary: ProfileStyle = 'cold', formerFrame: Frame = 'role'): CampaignState {
  const s = world(primary, { frame: 'equal', hold: 0, domains: [] });
  dyn(s).formerHolder = { endedDay: s.day, frame: formerFrame, sworn: false };
  return s;
}
const openVote = (s: CampaignState, subject = 'workshop') => run(s, reg, { type: 'vote/open', payload: { kind: 'upgrade', subject } });

describe('command_kept', () => {
  it('command_kept keeps countermand rolling after exit', () => {
    const s = struggle();
    expect(dyn(s).frame).toBe('equal');
    expect(dyn(s).hold).toBe(0);
    expect(dyn(s).domains.map((d) => d.id)).toEqual(['command']);
    expect(capabilitiesOf(s, reg, ANN).sort()).toEqual(['co_leader', 'countermand']);
    // her override has an authority of its own (her hold is 0), and a hold that moves does not take the command through the band
    const source = holderSource(s, reg, ANN);
    expect(source?.authority).toBe(TUNING.dynamic.commandKeptAuthority);
    addHold(s, ctxOf(s, reg), ANN, 3, 'followed_lead');
    expect(hasCapability(s, reg, ANN, 'countermand')).toBe(true);
    expect(commandStruggleOf(s)).toEqual({ unitId: ANN, wins: 0 });
  });

  it('she votes against the commander\'s side and adds her standing to it', () => {
    const s = struggle();
    const ann = ballotFor(s, reg, unitOf(s, ANN), 'upgrade', 'workshop');
    const bea = ballotFor(s, reg, unitOf(s, BEA), 'upgrade', 'workshop');
    expect(bea.vote).toBe('for');
    expect(ann.vote).toBe('against');
    expect(ann.weight).toBeGreaterThan(bea.weight);
    // without the struggle she votes as anyone does
    const plain = left();
    expect(ballotFor(plain, reg, unitOf(plain, ANN), 'upgrade', 'workshop').vote).toBe('for');
  });

  it('two lost votes end it and drop the domain', () => {
    let s = struggle();
    const first = openVote(s);
    expect(errors(first.events)).toEqual([]);
    expect(first.state.power!.votes.open!.passed).toBe(true); // the commander's side carried it
    expect(commandStruggleOf(first.state)).toEqual({ unitId: ANN, wins: 1 });
    expect(hasCapability(first.state, reg, ANN, 'countermand')).toBe(true);
    const second = openVote(first.state, 'barracks');
    expect(second.events.filter((e) => e.type === 'aftermath_ended')).toEqual([expect.objectContaining({ unitId: ANN, kind: 'command_kept', reason: 'resolved' })]);
    expect(second.events).toContainEqual({ type: 'domain_lost', unitId: ANN, domainId: 'command', reason: 'contest' });
    s = second.state;
    expect(dyn(s).aftermath).toBeUndefined();
    expect(hasCapability(s, reg, ANN, 'countermand')).toBe(false);
    expect(commandStruggleOf(s)).toBeNull();
  });

  it('a vote the commander does not carry is not a win, and nor is one she has no ballot in', () => {
    const s = struggle();
    const against = { unitId: ANN, vote: 'against' as const, weight: 2, score: -1, term: 'values' as const };
    expect(countStruggleVote(s, { registries: reg }, { passed: false, ballots: [against] })).toEqual([]);
    expect(countStruggleVote(s, { registries: reg }, { passed: true, ballots: [] })).toEqual([]);
    expect(countStruggleVote(s, { registries: reg }, { passed: true, ballots: [{ ...against, vote: 'for' }] })).toEqual([]);
    expect(commandStruggleOf(s)).toEqual({ unitId: ANN, wins: 0 });
    expect(countStruggleVote(s, { registries: reg }, { passed: true, ballots: [against] })).toEqual([]);
    expect(commandStruggleOf(s)).toEqual({ unitId: ANN, wins: 1 });
  });

  it('an enforcement of severity 3 ends it', () => {
    const s = struggle();
    withOptions(s, { voting: 'off' });
    const light = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'extra_duty' } }); // severity 2
    expect(errors(light.events)).toEqual([]);
    expect(dyn(light.state).aftermath?.kind).toBe('command_kept');
    const heavy = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'bench' } }); // severity 3
    expect(errors(heavy.events)).toEqual([]);
    expect(heavy.events.filter((e) => e.type === 'aftermath_ended')).toEqual([expect.objectContaining({ unitId: ANN, kind: 'command_kept', reason: 'resolved' })]);
    expect(heavy.events).toContainEqual({ type: 'domain_lost', unitId: ANN, domainId: 'command', reason: 'force' });
    expect(hasCapability(heavy.state, reg, ANN, 'countermand')).toBe(false);
    expect(dyn(heavy.state).aftermath).toBeUndefined();
  });

  it('the Leash on her ends it (severity 4)', () => {
    const s = struggle();
    withOptions(s, { voting: 'off' });
    const r = run(s, reg, { type: 'discipline/punish', payload: { unitId: ANN, measure: 'brig', days: 2 } });
    expect(errors(r.events)).toEqual([]);
    expect(dyn(r.state).aftermath).toBeUndefined();
  });

  it('nothing else returns command: time does not, and a hold that rises or falls does not', () => {
    const s = struggle();
    const ctx = ctxOf(s, reg);
    const row = dyn(s).aftermath!;
    const start = s.day;
    for (let d = 1; d <= 100; d++) {
      s.day = start + d;
      aftermathDayStep(s, ctx);
      addHold(s, ctx, ANN, d % 2 === 0 ? 2 : -1, d % 2 === 0 ? 'followed_lead' : 'decay');
    }
    expect(dyn(s).aftermath?.kind).toBe('command_kept');
    expect(dyn(s).aftermath?.id).toBe(row.id);
    expect(hasCapability(s, reg, ANN, 'countermand')).toBe(true);
    expect(dyn(s).aftermath!.untilDay).toBeGreaterThan(s.day);
  });

  it('a revenge aftermath sabotages the ballots too, and the struggle count is command_kept\'s alone', () => {
    const s = left();
    startAftermath(s, ctxOf(s, reg), ANN, 'revenge');
    expect(ballotFor(s, reg, unitOf(s, ANN), 'upgrade', 'workshop').vote).toBe('against');
    expect(commandStruggleOf(s)).toBeNull();
    const r = openVote(s);
    expect(dyn(r.state).aftermath?.kind).toBe('revenge');
    expect(r.events.some((e) => e.type === 'aftermath_ended')).toBe(false);
  });
});

describe('return_offer', () => {
  const offer = (primary: ProfileStyle) => {
    const s = left(primary);
    startAftermath(s, ctxOf(s, reg), ANN, 'return_offer');
    return s;
  };

  it('opens one return card, with terms by her style', () => {
    expect(offer('cold').dynamic!.open.returnOffer).toEqual({ id: 'dr1', unitId: ANN, terms: 'lower_band', day: expect.any(Number) });
    expect(offer('drill').dynamic!.open.returnOffer).toMatchObject({ unitId: ANN, terms: 'after_punishment' });
  });

  it('return_offer accept re-kindles at testing; after_punishment at keeping with refusal_noted', () => {
    const lower = offer('cold');
    const r = run(lower, reg, { type: 'dynamic/answer_return', payload: { answer: 'accept' } });
    expect(errors(r.events)).toEqual([]);
    expect(dyn(r.state).frame).toBe('play');
    expect(dyn(r.state).hold).toBe(20); // testing
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['frame_changed', 'aftermath_ended']));
    expect(r.events.find((e) => e.type === 'aftermath_ended')).toMatchObject({ kind: 'return_offer', reason: 'returned' });
    expect(r.events.some((e) => e.type === 'refusal_noted')).toBe(false);
    expect(r.state.dynamic!.open.returnOffer).toBeUndefined();
    expect(dyn(r.state).aftermath).toBeUndefined();
    expect(r.state.memory.facts.some((f) => f.tags.includes('frame_play') && f.about.includes(ANN))).toBe(true);

    const punished = offer('drill');
    const p = run(punished, reg, { type: 'dynamic/answer_return', payload: { answer: 'accept' } });
    expect(errors(p.events)).toEqual([]);
    expect(dyn(p.state).frame).toBe('play');
    expect(dyn(p.state).hold).toBe(40); // keeping
    expect(p.events).toContainEqual({ type: 'refusal_noted', unitId: ANN, what: 'return' });
  });

  it('refuse ends it with the memory fact', () => {
    const s = offer('cold');
    const r = run(s, reg, { type: 'dynamic/answer_return', payload: { answer: 'refuse' } });
    expect(errors(r.events)).toEqual([]);
    expect(r.events.find((e) => e.type === 'aftermath_ended')).toMatchObject({ kind: 'return_offer', reason: 'refused' });
    expect(dyn(r.state).frame).toBe('equal');
    expect(r.state.dynamic!.open.returnOffer).toBeUndefined();
    const fact = r.state.memory.facts.find((f) => f.tags.includes('aftermath_return_refused'));
    expect(fact).toMatchObject({ importance: 3, about: [ANN], knownBy: [ANN] });
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('with nothing open it is refused, and a lapsed offer takes the card with it', () => {
    const s = left();
    expect(errors(run(s, reg, { type: 'dynamic/answer_return', payload: { answer: 'accept' } }).events)).not.toEqual([]);
    const o = offer('cold');
    expect(errors(run(o, reg, { type: 'dynamic/answer_return', payload: { answer: 'maybe' } }).events)).not.toEqual([]);
    o.day += 20;
    aftermathDayStep(o, ctxOf(o, reg));
    expect(dyn(o).aftermath).toBeUndefined();
    expect(o.dynamic!.open.returnOffer).toBeUndefined();
    expect(() => answerReturn(o, ctxOf(o, reg), 'accept')).toThrow();
  });
});

describe('successor', () => {
  it('successor raises the next eligible unit by 10 and puts her first in the queue', () => {
    const s = left();
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), hold: 20 };
    s.relations[CAT].dynamic = { ...blankDynamic(s.day), hold: 5 };
    s.dynamic!.queue = [CAT];
    const events = aftermathDayStep(s, ctxOf(s, reg));
    expect(events).toContainEqual(expect.objectContaining({ type: 'hold_changed', unitId: BEA, from: 20, to: 30 }));
    expect(dyn(s, BEA).hold).toBe(30);
    expect(dyn(s, CAT).hold).toBe(5);
    expect(s.dynamic!.queue).toEqual([BEA, CAT]);
    expect(dyn(s).formerHolder?.successor).toBe(BEA);
    // once: the next day step does not raise her again
    s.day += 1;
    aftermathDayStep(s, ctxOf(s, reg));
    expect(dyn(s, BEA).hold).toBe(30);
  });

  it('it is never the former holder, and nobody eligible is nobody (no draw either way)', () => {
    const s = left();
    const ctx = ctxOf(s, reg);
    const before = ctx.rng.state;
    for (const id of [BEA, CAT]) unitOf(s, id).bond = undefined; // nobody else practises anything
    expect(aftermathDayStep(s, ctx)).toEqual([]);
    expect(dyn(s).formerHolder?.successor).toBe('');
    expect(ctx.rng.state).toEqual(before);
    expect(dyn(s).hold).toBe(0);
  });

  it('a former holder who has left the service starts a successor for no one', () => {
    const s = left();
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), hold: 20 };
    unitOf(s, ANN).status = 'deserted';
    aftermathDayStep(s, ctxOf(s, reg));
    expect(dyn(s, BEA).hold).toBe(20);
  });

  it('she who held again is not replaced', () => {
    const s = left();
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), hold: 20 };
    dyn(s).frame = 'play';
    dyn(s).hold = 30;
    aftermathDayStep(s, ctxOf(s, reg));
    expect(dyn(s, BEA).hold).toBe(20);
  });
});

describe('habits', () => {
  const habits = () => {
    const s = left('ritual');
    startAftermath(s, ctxOf(s, reg), ANN, 'habits');
    return s;
  };
  const offerOf = (s: CampaignState, ids: string[]) => dynamicIntentInput(s, reg, ids, 'scene').dynamic;

  it('habits offers protocol_slip with others present, and a slip adds the R14 sign', () => {
    const s = habits();
    expect(offerOf(s, [ANN, BEA])?.slips).toEqual([ANN]);
    expect(offerOf(s, [ANN, BEA])?.types).toContain('protocol_slip');
    expect(offerOf(s, [ANN])?.slips ?? []).toEqual([]); // alone: nobody to see it
    const talk = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(talk.events)).toEqual([]);
    const before = talk.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0;
    applyDynamicIntent(talk.state, { registries: reg }, ANN, { type: 'protocol_slip', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'the habit slipped out', confidence: 1 });
    const after = talk.state.dynamic!.knowledge[BEA]?.[ANN]?.suspicion ?? 0;
    expect(after - before).toBeGreaterThan(0);
  });

  it('the offer runs for the days of the stage and no longer', () => {
    const s = habits();
    s.day += 11;
    expect(offerOf(s, [ANN, BEA])?.slips ?? []).toEqual([]);
  });

  it('a unit with no habits aftermath and no frame is not offered', () => {
    const s = left('ritual');
    expect(offerOf(s, [ANN, BEA])?.slips ?? []).toEqual([]);
  });
});

const env = (s: CampaignState): AnalyzeEnv => ({ state: s, registries: reg, settings: { ...DEFAULT_SETTINGS } }) as unknown as AnalyzeEnv;

describe('the return card', () => {
  const open = (primary: ProfileStyle) => {
    const s = left(primary);
    startAftermath(s, ctxOf(s, reg), ANN, 'return_offer');
    return s;
  };

  it('the return card carries data-analyze, in her voice, with ACCEPT / REFUSE', () => {
    const s = open('cold');
    const onAnswer = vi.fn();
    const host = h('div');
    document.body.append(host);
    renderReturnCard(host, { state: s, reg, offer: s.dynamic!.open.returnOffer!, onAnswer });
    const card = host.querySelector<HTMLElement>('[data-return]')!;
    expect(card.getAttribute('data-return')).toBe(s.dynamic!.open.returnOffer!.id);
    expect(host.querySelector('.alius-voice-personal')).not.toBeNull();
    expect(host.textContent).toContain('Ann');
    const accept = host.querySelector<HTMLButtonElement>('button[data-return-answer="accept"]')!;
    const refuse = host.querySelector<HTMLButtonElement>('button[data-return-answer="refuse"]')!;
    expect([accept.textContent, refuse.textContent]).toEqual(['[ ACCEPT ]', '[ REFUSE ]']);
    for (const el of [card, accept, refuse]) expect(el.getAttribute('data-analyze')).toBeTruthy();
    accept.click();
    refuse.click();
    expect(onAnswer.mock.calls).toEqual([['accept'], ['refuse']]);
    expect(markedWithout(host)).toEqual([]);
    expect(unresolved(host, env(s))).toEqual([]);
    expect(unreachable(host)).toEqual([]);
  });

  it('the words follow the terms, and show no number, no frame and no pronoun for the commander', () => {
    const texts = (['cold', 'drill'] as const).map((style) => {
      const s = open(style);
      const host = h('div');
      document.body.append(host);
      renderReturnCard(host, { state: s, reg, offer: s.dynamic!.open.returnOffer!, onAnswer: vi.fn() });
      return host.querySelector('.alius-return-text')!.textContent!;
    });
    expect(texts[0]).not.toBe(texts[1]);
    for (const t of texts) {
      expect(t).not.toMatch(/\d/);
      expect(t).not.toMatch(/\b(he|him|his)\b/i);
    }
  });

  it('it is drawn only for the units the pick chooses, and only while the offer is open', () => {
    const s = open('cold');
    const host = h('div');
    document.body.append(host);
    drawReturnCards(host, s, reg, (c) => c.unitId === ANN, vi.fn());
    expect(host.querySelectorAll('[data-return]').length).toBeGreaterThan(0);
    drawReturnCards(host, s, reg, (c) => c.unitId === BEA, vi.fn());
    expect(host.children.length).toBe(0);
    delete s.dynamic!.open.returnOffer;
    drawReturnCards(host, s, reg, () => true, vi.fn());
    expect(host.children.length).toBe(0);
  });
});
