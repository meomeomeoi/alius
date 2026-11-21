import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { dynamicDirectives } from '../../../src/dynamic/directives';
import '../../../src/engine/actions/dynamic';
import {
  aftermathDayStep, aftermathWeights, compromatCount, endAftermath, regardBandOf, registerCompromatCount, registerRegardBand, resetAftermathReaders, runAftermathEffect, startAftermath,
} from '../../../src/engine/dynamic/aftermath';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { exitDynamic } from '../../../src/engine/dynamic/exit';
import { forgetDynamic } from '../../../src/engine/dynamic/forget';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { AFTERMATH_KINDS, type AftermathEffect, type AftermathKind, type Frame, type ProfileStyle } from '../../../src/engine/dynamic/types';
import { Rng, seedRng } from '../../../src/engine/rng';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetAftermathReaders());
const [ANN, BEA, CAT] = ['unit_ann', 'unit_bea', 'unit_cat'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const bond = (primary: ProfileStyle, secondary?: ProfileStyle) => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'medium' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary, ...(secondary !== undefined ? { secondary } : {}) }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});
const rows = (r: Registries = reg) => [...r.aftermaths.values()] as unknown as Array<{ id: string; kind: AftermathKind; stages: Array<{ days: number; effects: AftermathEffect[] }> }>;

/** Ann holds at `frame` and hold, in a romantic bond (a booking and a rule need one), with the command in the group when `domains` says so. */
function world(primary: ProfileStyle, over: { frame?: Frame; hold?: number; domains?: string[]; secondary?: ProfileStyle } = {}): CampaignState {
  const s = campaign(reg, 3);
  for (const id of [ANN, BEA, CAT]) unitOf(s, id).bond = bond(id === ANN ? primary : 'cold', id === ANN ? over.secondary : undefined);
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'role', hold: over.hold ?? 50, domains: (over.domains ?? []).map((id) => ({ id, since: 1 })) };
  s.relations[ANN].stateId = 'lover';
  return s;
}
/** She has already left: equal, hold 0, `formerHolder` of the frame she held. */
function left(primary: ProfileStyle, over: { secondary?: ProfileStyle; frame?: Frame; sworn?: boolean } = {}): CampaignState {
  const s = world(primary, { ...(over.secondary !== undefined ? { secondary: over.secondary } : {}) });
  const d = dynamicOf(s, ANN)!;
  d.frame = 'equal';
  d.hold = 0;
  d.formerHolder = { endedDay: s.day, frame: over.frame ?? 'role', sworn: over.sworn === true, successor: '' }; // the squad has reacted already (Task 31's step is not under test here)
  return s;
}
const dyn = (s: CampaignState, id = ANN) => dynamicOf(s, id)!;
const W = (s: CampaignState, ctx: { route?: 'abrupt' | 'negotiated' | 'transfer' | 'force'; clean?: boolean; force?: boolean } = {}) =>
  aftermathWeights(s, reg, ANN, { route: ctx.route ?? 'abrupt', clean: ctx.clean ?? false, force: ctx.force ?? false });
const top = (w: Record<AftermathKind, number>): AftermathKind => (Object.entries(w).sort((a, b) => b[1] - a[1])[0][0]) as AftermathKind;

describe('the weights', () => {
  it('there is one row per kind, and the registry holds nine', () => {
    expect(rows().map((r) => r.kind).sort()).toEqual([...AFTERMATH_KINDS].sort());
  });

  it('weights follow style', () => {
    expect(top(W(left('affectionate')))).toBe('grief');
    expect(top(W(left('possessive')))).toBe('pursuit');
    expect(top(W(left('regal')))).toBe('revenge'); // 0.5 + 2, ahead of pursuit's 1 + 1
    // the secondary counts half
    const pair = W(left('affectionate', { secondary: 'possessive' }));
    expect(pair.pursuit).toBeCloseTo(1 + 3 * 0.5);
    expect(pair.grief).toBeCloseTo(1 + 4);
  });

  it('cold and clinical: blackmail only with compromat of hers, else cold_contempt', () => {
    expect(W(left('clinical')).blackmail).toBe(0);
    expect(W(left('cold')).blackmail).toBe(0);
    expect(top(W(left('cold')))).toBe('cold_contempt');
    registerCompromatCount((_s, id) => (id === ANN ? 1 : 0));
    expect(compromatCount(left('cold'), ANN)).toBe(1);
    expect(top(W(left('clinical')))).toBe('blackmail');
    expect(W(left('cold')).blackmail).toBeGreaterThan(W(left('cold')).grief);
  });

  it('low Regard raises cold_contempt and blackmail, high raises return_offer and grief (each x1.5)', () => {
    registerCompromatCount(() => 1);
    const base = W(left('cold'));
    registerRegardBand(() => 'low');
    const low = W(left('cold'));
    expect(low.cold_contempt).toBeCloseTo(base.cold_contempt * 1.5);
    expect(low.blackmail).toBeCloseTo(base.blackmail * 1.5);
    expect(low.grief).toBe(base.grief);
    registerRegardBand(() => 'esteem');
    const high = W(left('cold'));
    expect(high.return_offer).toBeCloseTo(base.return_offer * 1.5);
    expect(high.grief).toBeCloseTo(base.grief * 1.5);
    expect(high.cold_contempt).toBe(base.cold_contempt);
  });

  it('without a Regard reader there is no band and nothing changes', () => {
    expect(regardBandOf(left('cold'), reg, ANN)).toBeNull();
  });

  it('the frame she held and a vow weigh in; the squad reaction and the command struggle are never picked here', () => {
    const plain = W(left('ritual', { frame: 'play' }));
    const role = W(left('ritual', { frame: 'role' }));
    expect(role.habits).toBeCloseTo(plain.habits * 1.5);
    expect(plain.successor).toBe(0);
    expect(plain.command_kept).toBe(0);
  });

  it('a clean exit allows only grief, return_offer and habits', () => {
    registerCompromatCount(() => 1);
    const w = W(left('cold'), { route: 'negotiated', clean: true });
    expect(Object.entries(w).filter(([, n]) => n > 0).map(([k]) => k).sort()).toEqual(['grief', 'habits', 'return_offer']);
  });

  it('force multiplies every weight by 1.5', () => {
    registerCompromatCount(() => 1);
    const plain = W(left('possessive'));
    const forced = W(left('possessive'), { route: 'force', force: true });
    for (const k of AFTERMATH_KINDS) expect(forced[k]).toBeCloseTo(plain[k] * 1.5);
  });

  it('holding the command forces command_kept (nothing else), even in a clean exit', () => {
    const s = left('cold');
    dyn(s).domains = [{ id: 'command', since: 1 }];
    for (const w of [W(s), W(s, { route: 'negotiated', clean: true })]) {
      expect(w.command_kept).toBeGreaterThan(0);
      expect(Object.entries(w).filter(([k, n]) => k !== 'command_kept' && n > 0)).toEqual([]);
    }
  });
});

describe('starting and ending', () => {
  it('an exit starts one aftermath, with one draw of the rng', () => {
    const s = world('possessive');
    const ctx = ctxOf(s, reg);
    const events = exitDynamic(s, ctx, ANN, 'abrupt', {});
    const started = events.filter((e) => e.type === 'aftermath_started');
    expect(started).toHaveLength(1);
    const a = dyn(s).aftermath!;
    expect(a).toMatchObject({ id: 'da0', stage: 0 });
    expect(started[0]).toMatchObject({ unitId: ANN, id: 'da0', kind: a.kind });
    // exactly one float was drawn for the pick (nothing else in the exit draws)
    const probe = new Rng(s.rng);
    probe.float();
    expect(ctx.rng.state).toEqual(probe.state);
    const row = rows().find((r) => r.kind === a.kind)!;
    expect(a.untilDay).toBe(s.day + row.stages.reduce((n, st) => n + st.days, 0));
    expect(a.stageUntil).toBe(s.day + row.stages[0].days);
  });

  it('a clean exit picks from the mild end', () => {
    for (let i = 0; i < 6; i++) {
      const s = world('possessive');
      s.rng = seedRng(i + 1);
      const pending = run(s, reg, { type: 'dynamic/exit', payload: { unitId: ANN, route: 'negotiated' } }).state;
      const talk = run(pending, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
      const r = run(talk, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'compromise_reached', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'settled', confidence: 1, exitId: 'dx0', text: 'a last task' }] } } });
      expect(errors(r.events)).toEqual([]);
      expect(['grief', 'return_offer', 'habits']).toContain(dyn(r.state).aftermath?.kind);
    }
  });

  it('holding the command starts command_kept with no draw', () => {
    const s = world('cold', { frame: 'rule', hold: 70, domains: ['private_time', 'command'] });
    const ctx = ctxOf(s, reg);
    const before = ctx.rng.state;
    exitDynamic(s, ctx, ANN, 'abrupt', {});
    expect(dyn(s).aftermath).toMatchObject({ kind: 'command_kept' });
    expect(ctx.rng.state).toEqual(before);
  });

  it('a forced exit marks the aftermath forced', () => {
    const s = world('possessive');
    exitDynamic(s, ctxOf(s, reg), ANN, 'force', { means: 'transfer_request' });
    expect(dyn(s).aftermath?.forced).toBe(true);
  });

  it('endAftermath clears it and says why', () => {
    const s = left('affectionate');
    startAftermath(s, ctxOf(s, reg), ANN, 'grief');
    const id = dyn(s).aftermath!.id;
    expect(endAftermath(s, ANN, 'resolved')).toEqual({ type: 'aftermath_ended', unitId: ANN, id, kind: 'grief', reason: 'resolved' });
    expect(dyn(s).aftermath).toBeUndefined();
  });

  it('a removed holder\'s aftermath ends with gone', () => {
    const s = left('affectionate');
    startAftermath(s, ctxOf(s, reg), ANN, 'grief');
    const events = forgetDynamic(s, ANN);
    expect(events).toEqual([expect.objectContaining({ type: 'aftermath_ended', unitId: ANN, kind: 'grief', reason: 'gone' })]);
    expect(dyn(s).aftermath).toBeUndefined();
  });

  it('the day step does nothing while the dynamic is off', () => {
    const s = left('affectionate');
    startAftermath(s, ctxOf(s, reg), ANN, 'grief');
    delete s.dynamic;
    expect(aftermathDayStep(s, ctxOf(s, reg))).toEqual([]);
  });
});

describe('the day step', () => {
  it('runs a stage\'s effects once when the stage begins, moves to the next stage on its day, and ends at the last with time', () => {
    const s = left('affectionate');
    const ctx = ctxOf(s, reg);
    const day = s.day;
    const stress0 = unitOf(s, ANN).stress;
    startAftermath(s, ctx, ANN, 'grief');
    expect(unitOf(s, ANN).stress).toBe(Math.min(100, stress0 + 10)); // stage 0: stress 10
    s.day = day + 3;
    expect(aftermathDayStep(s, ctx)).toEqual([]);
    expect(dyn(s).aftermath!.stage).toBe(0);
    s.day = day + 4;
    const moved = aftermathDayStep(s, ctx);
    expect(dyn(s).aftermath!.stage).toBe(1);
    expect(moved.some((e) => e.type === 'stress_changed')).toBe(true); // stage 1: stress 5
    expect(unitOf(s, ANN).stress).toBe(Math.min(100, stress0 + 15));
    s.day = day + 9;
    expect(aftermathDayStep(s, ctx)).toEqual([]);
    s.day = day + 10;
    const ended = aftermathDayStep(s, ctx);
    expect(ended).toContainEqual({ type: 'aftermath_ended', unitId: ANN, id: 'da0', kind: 'grief', reason: 'time' });
    expect(dyn(s).aftermath).toBeUndefined();
  });

  it('pursuit chains to blackmail when its row says so, with one more draw', () => {
    const open = { ...reg, aftermaths: new Map([...reg.aftermaths].map(([k, v]) => [k, k === 'blackmail' ? { ...v, weights: { ...(v.weights as object), needsCompromat: undefined } } : v])) } as unknown as Registries;
    const s = left('possessive');
    const ctx = { registries: open, rng: new Rng(s.rng) };
    startAftermath(s, ctx, ANN, 'pursuit');
    const start = ctx.rng.state;
    s.day += 7; // the single stage of seven days
    const events = aftermathDayStep(s, ctx);
    expect(events.map((e) => e.type)).toEqual(expect.arrayContaining(['aftermath_ended', 'aftermath_started']));
    expect(events.find((e) => e.type === 'aftermath_ended')).toMatchObject({ kind: 'pursuit', reason: 'time' });
    expect(events.find((e) => e.type === 'aftermath_started')).toMatchObject({ kind: 'blackmail' });
    expect(dyn(s).aftermath).toMatchObject({ kind: 'blackmail', stage: 0 });
    const probe = new Rng(start);
    probe.float();
    expect(ctx.rng.state).toEqual(probe.state); // one draw, for the chain
  });

  it('without compromat there is no chain and no draw: pursuit just ends', () => {
    const s = left('possessive');
    const ctx = ctxOf(s, reg);
    startAftermath(s, ctx, ANN, 'pursuit');
    const start = ctx.rng.state;
    s.day += 7;
    const events = aftermathDayStep(s, ctx);
    expect(events.map((e) => e.type)).toContain('aftermath_ended');
    expect(events.some((e) => e.type === 'aftermath_started')).toBe(false);
    expect(ctx.rng.state).toEqual(start);
    expect(dyn(s).aftermath).toBeUndefined();
  });

  it('the dynamic\'s own day step runs it, after the knowledge step', () => {
    const s = left('affectionate');
    startAftermath(s, ctxOf(s, reg), ANN, 'grief');
    s.day += 4;
    const events = dynamicDayStep(s, ctxOf(s, reg));
    expect(dyn(s).aftermath!.stage).toBe(1);
    expect(events.some((e) => e.type === 'stress_changed' && e.unitId === ANN)).toBe(true);
  });
});

describe('every effect type', () => {
  const fx = (s: CampaignState, effect: AftermathEffect) => runAftermathEffect(s, ctxOf(s, reg), ANN, effect);

  it('stress', () => {
    const s = left('affectionate');
    const before = unitOf(s, ANN).stress;
    expect(fx(s, { type: 'stress', amount: 10 })).toEqual([{ type: 'stress_changed', unitId: ANN, delta: 10 }]);
    expect(unitOf(s, ANN).stress).toBe(before + 10);
  });

  it('want', () => {
    const s = left('affectionate');
    const events = fx(s, { type: 'want', amount: 15 });
    expect(s.relations[ANN].want).toBe(15);
    expect(events).toEqual([{ type: 'want_changed', unitId: ANN, from: 0, to: 15, cause: 'aftermath' }]);
  });

  it('a night knock', () => {
    const s = left('affectionate');
    const events = fx(s, { type: 'night_knock' });
    expect(events.map((e) => e.type)).toEqual(['night_queued']);
    expect(s.calendar.nightEventsQueue.some((n) => n.unitId === ANN)).toBe(true);
  });

  it('a demand of the stage\'s kind', () => {
    for (const kind of ['interpersonal', 'desire'] as const) {
      const s = left('affectionate');
      const events = fx(s, { type: 'demand', kind });
      expect(events.map((e) => e.type), kind).toEqual(['demand_opened']);
      const d = s.discipline!.demands.find((x) => x.unitId === ANN)!;
      expect(reg.demandTemplates.get(d.templateId)!.kind, kind).toBe(kind);
    }
  });

  it('a booking', () => {
    const s = left('possessive');
    const events = fx(s, { type: 'booking' });
    expect(events.map((e) => e.type)).toContain('booking_made');
    expect(s.personal!.bookings!.some((b) => b.unitId === ANN && b.source === 'aftermath' && b.status === 'booked')).toBe(true);
    // one at a time: she keeps what she has
    expect(fx(s, { type: 'booking' })).toEqual([]);
  });

  it('rule interference', () => {
    const s = left('possessive');
    const events = fx(s, { type: 'rule_interfere' });
    expect(events.map((e) => e.type)).toEqual(['rule_proposed']);
    expect(s.bonds!.rules.find((r) => r.unitId === ANN)).toMatchObject({ status: 'proposed' });
    expect(fx(s, { type: 'rule_interfere' })).toEqual([]); // one open at a time
  });

  it('a rumor fact, spreading, that names no pronoun for the commander', () => {
    const s = left('cold');
    fx(s, { type: 'rumor' });
    const fact = s.memory.facts.find((f) => f.tags.includes('rumor') && f.about.includes(ANN))!;
    expect(fact).toMatchObject({ spread: 'fast', knownBy: [ANN] });
    expect(fact.text).not.toMatch(/\b(he|him|his)\b/i);
  });

  it('the squad\'s Impunity record, for those who know of the dynamic', () => {
    const s = left('cold');
    s.dynamic!.knowledge = { [BEA]: { [ANN]: { suspicion: 100, level: 'knows_dynamic' } }, [CAT]: { [ANN]: { suspicion: 60, level: 'suspects_dynamic' } } };
    const events = fx(s, { type: 'squad_impunity', amount: 2 });
    expect(events.map((e) => [e.type, e.unitId])).toEqual([['impunity_changed', BEA]]);
    expect(s.relations[BEA].impunityRecord).toBe(2);
    expect(s.relations[CAT].impunityRecord ?? 0).toBe(0);
  });

  it('defiance', () => {
    const s = left('cold');
    fx(s, { type: 'defiance' });
    expect(s.discipline!.defiance).toEqual([expect.objectContaining({ unitId: ANN, severity: 'moderate' })]);
  });

  it('Trust', () => {
    const s = left('cold');
    const trust = s.relations[ANN].trust;
    const events = fx(s, { type: 'trust', amount: -10 });
    expect(s.relations[ANN].trust).toBe(trust - 10);
    expect(events).toEqual([{ type: 'relation_changed', unitId: ANN, axis: 'trust', delta: -10, applied: -10 }]);
  });

  it('standing effects write nothing today: the vote sabotage is read by the ballots, the threat waits for compromat', () => {
    const s = left('cold');
    expect(fx(s, { type: 'vote_sabotage' })).toEqual([]);
    expect(fx(s, { type: 'threaten_tell', audience: 'squad' })).toEqual([]);
  });

  it('nothing for a unit who is not a living named holder', () => {
    const s = left('cold');
    unitOf(s, ANN).status = 'deserted';
    expect(fx(s, { type: 'stress', amount: 10 })).toEqual([]);
  });
});

describe('what the model is told', () => {
  it('the stage\'s directive stands while she is in the room and only then', () => {
    const s = left('affectionate');
    startAftermath(s, ctxOf(s, reg), ANN, 'grief');
    const ids = (present: string[]) => dynamicDirectives(s, reg, present).map((d) => d.id);
    expect(ids([ANN])).toContain(`dynamic:aftermath:${ANN}`);
    expect(ids([BEA])).not.toContain(`dynamic:aftermath:${ANN}`);
    const text = dynamicDirectives(s, reg, [ANN]).find((d) => d.id === `dynamic:aftermath:${ANN}`)!.text;
    expect(text).not.toMatch(/\b(he|him|his)\b/i);
    expect(text).not.toMatch(/\d/); // no number
    dyn(s).aftermath!.stage = 1;
    const next = dynamicDirectives(s, reg, [ANN]).find((d) => d.id === `dynamic:aftermath:${ANN}`)!.text;
    expect(next).not.toBe(text);
    endAftermath(s, ANN, 'time');
    expect(ids([ANN])).not.toContain(`dynamic:aftermath:${ANN}`);
  });
});
