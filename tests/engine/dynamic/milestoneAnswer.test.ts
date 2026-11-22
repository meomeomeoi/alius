import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { answerMilestone, milestonesDue } from '../../../src/engine/dynamic/milestones';
import { applyDynamicIntent, dynamicIntentInput } from '../../../src/engine/dynamic/intents';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame } from '../../../src/engine/dynamic/types';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann holds at `frame` with `hold` and has her milestone open (`opened`): the engine opens the first due one. */
function world(frame: Frame, hold: number, opts: { scene?: boolean } = {}): CampaignState {
  let s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold };
  if (opts.scene === true) {
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    s = r.state;
  }
  milestonesDue(s, ctxOf(s, reg), ANN);
  return s;
}
const dyn = (s: CampaignState) => dynamicOf(s, ANN)!;
const answer = (s: CampaignState, a: 'accept' | 'refuse') => run(s, reg, { type: 'dynamic/answer_milestone', payload: { milestoneId: s.dynamic!.open.milestones[0].id, answer: a } });
const strip = (events: unknown[]) => JSON.parse(JSON.stringify(events), (k, v) => (k === 'via' ? undefined : v)) as unknown[];

describe('answering a milestone', () => {
  it('accept applies the frame and moves no hold (user R1)', () => {
    const s = world('equal', 25);
    const r = answer(s, 'accept');
    expect(errors(r.events)).toEqual([]);
    expect(dynamicOf(r.state, ANN)!.frame).toBe('play');
    expect(dynamicOf(r.state, ANN)!.hold).toBe(25);
    expect(r.events.map((e) => e.type)).toEqual(expect.arrayContaining(['milestone_accepted', 'frame_changed']));
    expect(r.events.some((e) => e.type === 'hold_changed')).toBe(false);
    expect(r.state.dynamic!.open.milestones).toEqual([]);
  });

  it('refuse drops one band and sets a 7-day cooldown, and the same milestone is not offered again before it', () => {
    const s = world('play', 45); // keeping: first_protocol is open
    expect(s.dynamic!.open.milestones[0].milestoneId).toBe('first_protocol');
    const r = answer(s, 'refuse');
    expect(errors(r.events)).toEqual([]);
    const d = dynamicOf(r.state, ANN)!;
    expect(d.hold).toBe(25); // 45 - 20: from keeping to testing
    expect(d.frame).toBe('play');
    expect(d.cooldowns.first_protocol).toBe(r.state.day + 7);
    expect(r.state.dynamic!.open.milestones).toEqual([]);
    expect(r.events.map((e) => e.type)).toContain('milestone_refused');
    // back at keeping the next day: still held back until the cooldown passes
    d.hold = 45;
    milestonesDue(r.state, ctxOf(r.state, reg), ANN);
    expect(r.state.dynamic!.open.milestones).toEqual([]);
    r.state.day += 7;
    milestonesDue(r.state, ctxOf(r.state, reg), ANN);
    expect(r.state.dynamic!.open.milestones[0]?.milestoneId).toBe('first_protocol');
  });

  it('a refused milestone is remembered by her (user ruling 2026-11-22)', () => {
    const s = world('play', 45);
    const before = s.memory?.facts?.length ?? 0;
    const r = answer(s, 'refuse');
    expect(errors(r.events)).toEqual([]);
    const facts = (r.state.memory?.facts ?? []).slice(before);
    const fact = facts.find((f) => f.tags.includes('milestone_refused'));
    expect(fact).toBeDefined();
    expect(fact!.about).toContain(ANN);
    expect(fact!.knownBy).toContain(ANN);
    expect(fact!.hiddenFromCommander).toBeUndefined();
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
    // accepting writes no refusal fact
    const a = answer(world('play', 45), 'accept');
    expect((a.state.memory?.facts ?? []).some((f) => f.tags.includes('milestone_refused'))).toBe(false);
  });

  it('refuse never goes below the frame floor, and at role it is noted', () => {
    const s = world('role', 65); // owning: the vow is open
    expect(s.dynamic!.open.milestones[0].milestoneId).toBe('vow');
    const r = answer(s, 'refuse');
    expect(dynamicOf(r.state, ANN)!.hold).toBe(45);
    expect(dynamicOf(r.state, ANN)!.refusals).toEqual([r.state.day]);
    const low = world('role', 62);
    const l = answer(low, 'refuse');
    expect(dynamicOf(l.state, ANN)!.hold).toBe(42);
    const floor = world('role', 60);
    expect(answer(floor, 'refuse').state.relations[ANN].dynamic!.hold).toBe(40);
  });

  it('the vow sets sworn and pins a memory fact (importance 5, audience the pair, pinned)', () => {
    const s = world('role', 65);
    const r = answer(s, 'accept');
    expect(dynamicOf(r.state, ANN)!.sworn).toEqual({ day: r.state.day });
    expect(dynamicOf(r.state, ANN)!.frame).toBe('role');
    expect(r.events.map((e) => e.type)).toContain('sworn');
    const fact = r.state.memory.facts.find((f) => f.tags.includes('sworn'));
    expect(fact).toMatchObject({ importance: 5, about: [ANN], knownBy: [ANN], pinned: true });
    expect(fact!.text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('a frame change is remembered by its target', () => {
    const play = answer(world('equal', 25), 'accept');
    expect(play.state.memory.facts.some((f) => f.tags.includes('frame_play'))).toBe(true);
    const role = answer(world('play', 45), 'accept');
    expect(role.state.memory.facts.some((f) => f.tags.includes('frame_role'))).toBe(true);
    const rule = world('role', 65);
    dyn(rule).milestones.push('vow'); // (the vow comes first; with it passed the handover is next)
    rule.dynamic!.open.milestones = [];
    milestonesDue(rule, ctxOf(rule, reg), ANN);
    expect(rule.dynamic!.open.milestones[0].milestoneId).toBe('handover');
    const handed = answer(rule, 'accept');
    expect(dynamicOf(handed.state, ANN)!.frame).toBe('rule');
    expect(handed.state.memory.facts.some((f) => f.tags.includes('frame_rule'))).toBe(true);
  });

  it('the intent path equals the card path (same events except via)', () => {
    const card = world('equal', 25, { scene: true });
    const text = structuredClone(card);
    const viaCard = answerMilestone(card, ctxOf(card, reg), card.dynamic!.open.milestones[0].id, 'accept', 'card');
    const ev: EventIntent = { type: 'milestone_accepted', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'yes', confidence: 1, milestoneId: text.dynamic!.open.milestones[0].id };
    expect(dynamicIntentInput(text, reg, [ANN], 'scene').dynamic?.milestones).toEqual([ev.milestoneId]);
    const viaText = applyDynamicIntent(text, ctxOf(text, reg), ANN, ev);
    expect(strip(viaText)).toEqual(strip(viaCard));
    expect(viaCard.find((e) => e.type === 'milestone_accepted')).toMatchObject({ via: 'card' });
    expect(viaText.find((e) => e.type === 'milestone_accepted')).toMatchObject({ via: 'text' });
    expect(text.relations[ANN].dynamic).toEqual(card.relations[ANN].dynamic);
    expect(text.dynamic).toEqual(card.dynamic);
    // and a refusal
    const a = world('play', 45, { scene: true });
    const b = structuredClone(a);
    const refCard = answerMilestone(a, ctxOf(a, reg), a.dynamic!.open.milestones[0].id, 'refuse', 'card');
    const refText = applyDynamicIntent(b, ctxOf(b, reg), ANN, { ...ev, type: 'milestone_refused', milestoneId: b.dynamic!.open.milestones[0].id });
    expect(strip(refText)).toEqual(strip(refCard));
    expect(b.relations[ANN].dynamic).toEqual(a.relations[ANN].dynamic);
  });

  it('an intent for a milestone that is not open for that unit (a wrong id, another unit\'s) does nothing', () => {
    const s = world('equal', 25, { scene: true });
    const before = structuredClone(s);
    const ev = (milestoneId: string, unit = ANN): EventIntent => ({ type: 'milestone_accepted', actor: 'commander', targets: [unit], severity: 'minor', evidence: 'yes', confidence: 1, milestoneId });
    expect(applyDynamicIntent(s, ctxOf(s, reg), ANN, ev('dm99'))).toEqual([]);
    expect(applyDynamicIntent(s, ctxOf(s, reg), BEA, ev(s.dynamic!.open.milestones[0].id, BEA))).toEqual([]);
    expect(applyDynamicIntent(s, ctxOf(s, reg), BEA, ev(s.dynamic!.open.milestones[0].id, BEA))).toEqual([]); // her milestone, named for Bea
    expect(s).toEqual(before);
  });

  it('a stale milestone id is refused (handler_failed, no change)', () => {
    const s = world('equal', 25);
    const before = structuredClone(s);
    const r = run(s, reg, { type: 'dynamic/answer_milestone', payload: { milestoneId: 'dm99', answer: 'accept' } });
    expect(errors(r.events)[0]).toMatchObject({ code: 'handler_failed' });
    expect(r.state).toEqual(before);
    const bad = run(s, reg, { type: 'dynamic/answer_milestone', payload: { milestoneId: s.dynamic!.open.milestones[0].id, answer: 'maybe' } });
    expect(errors(bad.events)[0]).toMatchObject({ code: 'handler_failed' });
    const off = world('equal', 25);
    off.content = { enabled: [] };
    expect(errors(answer(off, 'accept').events)[0]).toMatchObject({ code: 'handler_failed' });
  });
});

describe('her line while it is open', () => {
  it('the open milestone is a line in dynamic:<unitId>, even before the first frame (no number, no pronoun for the commander)', () => {
    const s = world('equal', 25, { scene: true });
    const line = dynamicDirectives(s, reg, [ANN]).find((d) => d.id === `dynamic:${ANN}`);
    expect(line?.text).toContain('waiting for the commander');
    expect(line?.text).not.toMatch(/\d/);
    const closed = world('equal', 5, { scene: true });
    expect(dynamicDirectives(closed, reg, [ANN])).toEqual([]);
    const answered = answer(s, 'accept').state;
    expect(dynamicDirectives(answered, reg, [ANN]).find((d) => d.id === `dynamic:${ANN}`)?.text).not.toContain('waiting for the commander');
  });
});
