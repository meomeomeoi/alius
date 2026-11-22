import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/warden';
import '../../../src/engine/actions/leash';
import '../../../src/engine/actions/scene';
import { forgetDynamic, holdsDynamic } from '../../../src/engine/dynamic/forget';
import { leashBlockOf } from '../../../src/engine/dynamic/leashBlock';
import { impunityOf } from '../../../src/engine/discipline/impunity';
import { memoryResolverFor } from '../../../src/engine/memory/resolvers';
import { exitDynamic, meansDone } from '../../../src/engine/dynamic/exit';
import { oversightNotice } from '../../../src/ui/dynamic/notices';
import { coverMult, oversightActOf, oversightDayStep, OVERSIGHT_CLOCK } from '../../../src/engine/dynamic/oversight';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, ProfileStyle } from '../../../src/engine/dynamic/types';
import { leashLog } from '../../../src/engine/leash/weekly';
import { buildCampaign } from '../../../src/engine/setup';
import type { CampaignState } from '../../../src/engine/state/types';
import { oversightGain } from '../../../src/engine/special/debts/consequences';
import { TUNING } from '../../../src/engine/tuning';
import { addSuspicion, leashswapOf } from '../../../src/engine/warden';
import { ANN as SANN, specialCampaign } from '../../helpers/special';
import { HANDLER_UNIT, HANDLER_VISIT_KIND, type IntelItem } from '../../../src/engine/special/state';
import type { NightEntry } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, ofType, run, unitSetup } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const practice = (primary: ProfileStyle) => ({
  leadStyle: 'dominant' as const, attachment: 'steady' as const, desire: 'low' as const, caretaker: false, ownLimits: { categories: [] }, publicity: 'known' as const,
  practice: { categories: { restraint: { as: 'enjoys' as const, witness: 'indifferent' as const } }, style: { primary }, audience: 'indifferent' as const, inclination: 'curious' as const, fairness: 'fair' as const, hintStyle: 'offers' as const, drive: 'moderate' as const },
});
/** Ann holds the device at `frame`. */
function give(s: CampaignState, over: { frame?: Frame; style?: ProfileStyle; domains?: string[]; hold?: number } = {}): CampaignState {
  unitOf(s, ANN).bond = practice(over.style ?? 'cold');
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'role', hold: over.hold ?? 70, domains: (over.domains ?? ['device']).map((id) => ({ id, since: 1 })) };
  return s;
}
const world = (over: Parameters<typeof give>[1] = {}): CampaignState => give(campaign(reg, 3), over);
const blocks = (s: CampaignState, ...daysAgo: number[]): CampaignState => { s.dynamic!.oversight = { blocked: daysAgo.map((d) => s.day - d) }; return s; };
const clockOf = (s: CampaignState) => s.world.clocks.find((c) => c.id === OVERSIGHT_CLOCK);
const threadsOf = (s: CampaignState) => s.world.threads.filter((t) => t.id === 'oversight_inquiry');
const step = (s: CampaignState, seed?: number) => {
  const d = structuredClone(s);
  const ctx = ctxOf(d, reg);
  void seed;
  return { state: d, events: oversightDayStep(d, ctx) };
};

describe('the inquiry', () => {
  it('three blocks within 14 days advance the clock by one and open the thread once', () => {
    const first = step(blocks(world(), 0, 1, 2));
    expect(clockOf(first.state)).toMatchObject({ filled: 1, segments: 6, visibleToPlayer: true, engine: true });
    expect(threadsOf(first.state)).toHaveLength(1);
    expect(threadsOf(first.state)[0]).toMatchObject({ status: 'open', relatedUnits: [], createdDay: first.state.day });
    expect(ofType(first.events, 'oversight_inquiry').map((e) => e.stage)).toContain('opened');
    expect(first.state.dynamic!.oversight!.blocked).toEqual([]); // the window is cleared
    // three more: one segment more, the thread stays one
    first.state.dynamic!.oversight!.blocked = [first.state.day, first.state.day, first.state.day];
    const second = step(first.state);
    expect(clockOf(second.state)!.filled).toBe(2);
    expect(threadsOf(second.state)).toHaveLength(1);
    expect(ofType(second.events, 'oversight_inquiry').map((e) => e.stage)).not.toContain('opened');
  });

  it('two blocks, or blocks too far apart, advance nothing', () => {
    expect(clockOf(step(blocks(world(), 0, 1)).state)).toBeUndefined();
    expect(clockOf(step(blocks(world(), 0, 1, 20)).state)).toBeUndefined();
    expect(step(blocks(world(), 0, 1)).state.dynamic!.oversight!.blocked).toHaveLength(2); // they wait for a third
    expect(step(blocks(world(), 0, 1, 20)).state.dynamic!.oversight!.blocked).toHaveLength(2); // the old one is dropped
  });

  it("the holder's cover shortens the span: at role 11 days, at rule 9", () => {
    expect(clockOf(step(blocks(world(), 0, 1, 12)).state)).toBeUndefined();
    expect(clockOf(step(blocks(world(), 0, 1, 10)).state)?.filled).toBe(1);
    expect(clockOf(step(blocks(world({ frame: 'rule' }), 0, 1, 10)).state)).toBeUndefined();
  });

  it('draws nothing and touches nothing without blocks or while the dynamic is off', () => {
    const s = world();
    const d = structuredClone(s);
    const ctx = ctxOf(d, reg);
    expect(oversightDayStep(d, ctx)).toEqual([]);
    expect(ctx.rng.state).toEqual(s.rng);
    expect(d.world.clocks.some((c) => c.id === OVERSIGHT_CLOCK)).toBe(false);
    const off = campaign(reg, 3);
    expect(oversightDayStep(off, ctxOf(off, reg))).toEqual([]);
  });

  it('notices at 3 and 5: a notice event and a world fact each, none at 4', () => {
    const at = (filled: number) => {
      const s = blocks(world(), 0, 1, 2);
      s.world.clocks.push({ id: OVERSIGHT_CLOCK, label: 'Oversight inquiry', segments: 6, filled, visibleToPlayer: true, engine: true });
      return step(s);
    };
    for (const [before, notice] of [[1, false], [2, true], [3, false], [4, true]] as const) {
      const r = at(before);
      expect(ofType(r.events, 'oversight_inquiry').some((e) => e.stage === 'notice'), `at ${before + 1}`).toBe(notice);
      expect(r.state.memory.facts.some((f) => f.tags.includes('oversight_inquiry')), `fact at ${before + 1}`).toBe(notice);
    }
    const fact = at(2).state.memory.facts.find((f) => f.tags.includes('oversight_inquiry'))!;
    expect(fact).toMatchObject({ knownBy: ['*'] });
    expect(fact.text).not.toMatch(/Ann/); // no one is named
    expect(fact.text).not.toMatch(/\b(he|him|his)\b/i);
  });
});

describe('on fill oversight acts on her', () => {
  const full = (salt: number): CampaignState => {
    const s = blocks(world(), 0, 1, 2);
    s.dynamic!.salt = salt;
    s.dynamic!.oversight!.holderId = ANN;
    s.world.clocks.push({ id: OVERSIGHT_CLOCK, label: 'Oversight inquiry', segments: 6, filled: 5, visibleToPlayer: true, engine: true });
    return s;
  };
  /** The first salt that makes oversight pick each act. */
  const acts = new Map<string, number>();
  beforeAll(() => {
    for (let salt = 1; salt <= 60; salt++) {
      const act = oversightActOf(full(salt), ANN);
      if (!acts.has(act)) acts.set(act, salt);
    }
  });

  it('a hashed pick: all three come up over salts, and the same salt gives the same one', () => {
    expect([...acts.keys()].sort()).toEqual(['forced_leash', 'reprimand', 'transfer_threat']);
    const salt = acts.get('reprimand')!;
    const a = step(full(salt));
    const b = step(full(salt));
    expect(ofType(a.events, 'oversight_inquiry').map((e) => e.stage)).toEqual(ofType(b.events, 'oversight_inquiry').map((e) => e.stage));
    expect(a.state.rng).toEqual(full(salt).rng); // no draw
  });

  it('a reprimand: her stress +15 and hold -10; the clock starts over and the thread rests', () => {
    const s = full(acts.get('reprimand')!);
    unitOf(s, ANN).stress = 10;
    const r = step(s);
    expect(ofType(r.events, 'oversight_inquiry').map((e) => e.stage)).toContain('reprimand');
    expect(unitOf(r.state, ANN).stress).toBe(10 + TUNING.dynamic.oversight.reprimandStress);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(70 - TUNING.dynamic.oversight.reprimandHold);
    expect(clockOf(r.state)!.filled).toBe(0);
    expect(threadsOf(r.state)[0].status).toBe('resolved');
  });

  it('a transfer threat: seven days to lift the block, else she is reassigned', () => {
    const s = full(acts.get('transfer_threat')!);
    const r = step(s);
    expect(ofType(r.events, 'oversight_inquiry').map((e) => e.stage)).toContain('transfer_threat');
    expect(r.state.dynamic!.oversight!.threat).toEqual({ unitId: ANN, untilDay: s.day + 7 });
    // six days later: nothing
    const early = structuredClone(r.state);
    early.day = s.day + 6;
    expect(ofType(oversightDayStep(early, ctxOf(early, reg)), 'oversight_inquiry').map((e) => e.stage)).toEqual([]);
    expect(unitOf(early, ANN).status).not.toBe('reassigned');
    // on the day, with the block standing: reassigned, and nothing of hers is left
    const late = structuredClone(r.state);
    late.day = s.day + 7;
    const events = oversightDayStep(late, ctxOf(late, reg));
    expect(ofType(events, 'oversight_inquiry').map((e) => e.stage)).toContain('reassigned');
    expect(unitOf(late, ANN).status).toBe('reassigned');
    expect(late.dynamic!.oversight!.threat).toBeUndefined();
    // on the day, with the block lifted: she stays
    const lifted = structuredClone(r.state);
    lifted.day = s.day + 7;
    dynamicOf(lifted, ANN)!.domains = [];
    const kept = oversightDayStep(lifted, ctxOf(lifted, reg));
    expect(ofType(kept, 'oversight_inquiry').map((e) => e.stage)).toContain('lifted');
    expect(unitOf(lifted, ANN).status).not.toBe('reassigned');
    expect(lifted.dynamic!.oversight!.threat).toBeUndefined();
  });

  it('a reassignment waits while she is in a scene', () => {
    const s = full(acts.get('transfer_threat')!);
    const t = step(s).state;
    t.day = s.day + 7;
    t.scene = { id: 'sc', participants: [ANN] } as never;
    expect(oversightDayStep(t, ctxOf(t, reg))).toEqual([]);
    expect(unitOf(t, ANN).status).not.toBe('reassigned');
    expect(t.dynamic!.oversight!.threat).toBeDefined();
  });

  it('a forced Leash on her is the force exit: the entry copies oversight, her dynamic ends at once and the command comes back (I6)', () => {
    const s = full(acts.get('forced_leash')!);
    const authorizations = s.leash.authorizationsLeft;
    const r = step(s);
    expect(ofType(r.events, 'oversight_inquiry').map((e) => e.stage)).toContain('forced_leash');
    expect(leashLog(r.state).at(-1)).toMatchObject({ unitId: ANN, kind: 'compel', outcome: 'done', cc: 'oversight' });
    expect(r.state.leash.authorizationsLeft).toBe(authorizations); // oversight's, not the commander's
    expect(meansDone(r.state, ANN, 'leash')).toBe(true); // still read as the means of a forced exit that day
    expect(ofType(r.events, 'dynamic_exit')).toEqual([expect.objectContaining({ unitId: ANN, route: 'force', means: 'leash', force: true, commandKept: false })]);
    expect(dynamicOf(r.state, ANN)).toMatchObject({ frame: 'equal', hold: 0, domains: [] }); // no domain, no block
    expect(leashBlockOf(r.state, reg)).toBeNull();
    expect(ofType(r.events, 'leash_used')[0]).toMatchObject({ by: 'oversight' });
  });

  it('is not the commander\'s Leash: Impunity, the bluff credit, the relation graph and memory do not count it (M2)', () => {
    const s = world();
    const before = impunityOf(s, reg, BEA)!.value;
    const log = (cc?: string) => ({ no: 1, unitId: BEA, kind: 'compel', day: s.day, context: 'pda', outcome: 'done', ...(cc !== undefined ? { cc } : {}) });
    const mine = structuredClone(s);
    mine.leash.log.push(log() as never);
    const theirs = structuredClone(s);
    theirs.leash.log.push(log('oversight') as never);
    expect(impunityOf(mine, reg, BEA)!.value).not.toBe(before); // the commander's own use is a recent use
    expect(impunityOf(theirs, reg, BEA)!.value).toBe(before); // oversight's is nothing of the commander's
    const resolve = memoryResolverFor('leash_used')!;
    const ev = { type: 'leash_used', kind: 'compel', unitId: BEA, no: 1, outcome: 'done' };
    expect(resolve(s, ev, reg)).not.toBeNull();
    expect(resolve(s, { ...ev, by: 'oversight' }, reg)).toBeNull(); // her exit is what is remembered (dynamic_exit)
  });

  it('with nobody holding the block any more the inquiry only starts over', () => {
    const s = full(1);
    dynamicOf(s, ANN)!.domains = [];
    delete s.dynamic!.oversight!.holderId;
    const r = step(s);
    expect(ofType(r.events, 'oversight_inquiry').map((e) => e.stage)).not.toContain('reprimand');
    expect(clockOf(r.state)!.filled).toBe(0);
  });
});

describe('the transfer request, the force exit\'s means', () => {
  it('is filed through dynamic/request_transfer and read from state for today only', () => {
    const s = world({ frame: 'role', hold: 50, domains: ['private_time'] });
    const early = run(s, reg, { type: 'dynamic/exit', payload: { unitId: ANN, route: 'force', means: 'transfer_request' } });
    expect(errors(early.events)[0]).toMatchObject({ message: expect.stringMatching(/file the oversight request/i) });
    const filed = run(s, reg, { type: 'dynamic/request_transfer', payload: { unitId: ANN } });
    expect(errors(filed.events)).toEqual([]);
    expect(ofType(filed.events, 'oversight_inquiry')).toEqual([expect.objectContaining({ stage: 'transfer_requested', unitId: ANN })]);
    expect(meansDone(filed.state, ANN, 'transfer_request')).toBe(true);
    const out = run(filed.state, reg, { type: 'dynamic/exit', payload: { unitId: ANN, route: 'force', means: 'transfer_request' } });
    expect(errors(out.events)).toEqual([]);
    expect(ofType(out.events, 'dynamic_exit')[0]).toMatchObject({ force: true, means: 'transfer_request', severity: 'extreme' });
    // tomorrow it is stale
    const late = structuredClone(filed.state);
    late.day += 1;
    expect(meansDone(late, ANN, 'transfer_request')).toBe(false);
    // a holder at no frame has nothing to be moved from
    expect(errors(run(world({ frame: 'equal' }), reg, { type: 'dynamic/request_transfer', payload: { unitId: ANN } }).events)).not.toEqual([]);
  });
});

describe('the transfer request costs her Trust and a slot (user ruling 2026-11-22)', () => {
  it('takes her Trust and spends one slot, and a second request the same day is refused', () => {
    const s = world({ frame: 'role', hold: 50, domains: ['private_time'] });
    const trust = s.relations[ANN].trust;
    const slot = s.slot;
    const r = run(s, reg, { type: 'dynamic/request_transfer', payload: { unitId: ANN } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.relations[ANN].trust).toBe(trust - TUNING.dynamic.transferRequest.trust);
    expect(r.state.slot).not.toBe(slot);
    expect(r.events.some((e) => e.type === 'slot_advanced')).toBe(true);
    const again = run(r.state, reg, { type: 'dynamic/request_transfer', payload: { unitId: ANN } });
    expect(errors(again.events)[0]).toMatchObject({ message: expect.stringMatching(/already/i) });
  });

  it('is refused while a conversation is open, changing nothing', () => {
    const s = world({ frame: 'role', hold: 50, domains: ['private_time'] });
    s.calendar.pendingScene = { locationId: 'quarters_commander' } as never;
    const r = run(s, reg, { type: 'dynamic/request_transfer', payload: { unitId: ANN } });
    expect(errors(r.events)).not.toEqual([]);
    expect(r.state).toBe(s);
  });
});

describe('the holder\'s cover', () => {
  it('a role holder takes 20 % off, a rule holder 35 %, a cruel one half of that; nobody takes nothing', () => {
    expect(coverMult(campaign(reg, 3), reg)).toBe(1);
    expect(coverMult(world({ frame: 'play' }), reg)).toBe(1);
    expect(coverMult(world({ frame: 'role' }), reg)).toBeCloseTo(0.8);
    expect(coverMult(world({ frame: 'rule' }), reg)).toBeCloseTo(0.65);
    expect(coverMult(world({ frame: 'rule', style: 'cruel' }), reg)).toBeCloseTo(0.825);
    expect(coverMult(world({ frame: 'role', style: 'cruel' }), reg)).toBeCloseTo(0.9);
  });

  it('the strongest holder counts, and a unit who left covers nobody', () => {
    const s = world({ frame: 'role' });
    unitOf(s, BEA).bond = practice('cold');
    s.relations[BEA].dynamic = { ...blankDynamic(s.day), frame: 'rule', hold: 70 };
    expect(coverMult(s, reg)).toBeCloseTo(0.65);
    unitOf(s, BEA).status = 'deserted';
    expect(coverMult(s, reg)).toBeCloseTo(0.8);
  });

  const swap = (over: (s: CampaignState) => void): CampaignState => {
    const out = buildCampaign({
      commanderName: 'Vale', startId: 'start_vesper', crimeId: 'mutiny', units: ['Ann', 'Bea', 'Cat'].map((n) => unitSetup(n)),
      mode: { kind: 'leashswap', deathRule: 'rewind_day', warden: { by: 'player', index: 1 } },
    }, reg, { desireBondDefects: false, seed: 9 });
    if (!out.ok) throw new Error(out.errors.join('; '));
    over(out.state);
    return out.state;
  };
  const noise = (s: CampaignState): number => {
    const d = structuredClone(s);
    leashswapOf(d)!.intrigue.suspicion = 0;
    addSuspicion(d, { registries: reg, rng: { chance: () => false } } as never, 10, 'dig');
    return leashswapOf(d)!.intrigue.suspicion;
  };

  it('P13 suspicion: x0.8 with a role holder, x0.65 at rule, x1 with none', () => {
    expect(noise(swap(() => {}))).toBe(10);
    expect(noise(swap((s) => give(s, { frame: 'role' })))).toBeCloseTo(8);
    expect(noise(swap((s) => give(s, { frame: 'rule' })))).toBeCloseTo(6.5);
    expect(noise(swap((s) => give(s, { frame: 'rule', style: 'cruel' })))).toBeCloseTo(8.25);
  });

  it('P12 debts: the oversight gain is cut the same way; the leak too; none leaves them as they were', () => {
    const plain = specialCampaign(reg, 'web_of_debts');
    expect(oversightGain(plain, reg, 1)).toBe(10);
    const held = give(specialCampaign(reg, 'web_of_debts'), { frame: 'role' });
    unitOf(held, SANN).bond = practice('cold');
    expect(oversightGain(held, reg, 1)).toBe(8);
    expect(oversightGain(give(specialCampaign(reg, 'web_of_debts'), { frame: 'rule' }), reg, 1)).toBe(7); // round(6.5)
  });

  it('the handler\'s leak: oversight +25 becomes +20 with a role holder', () => {
    const items: IntelItem[] = [{ id: 'squad:unit_ann', kind: 'squad', refId: SANN, label: 'squad Ann' }];
    const leaked = (holder: boolean): number => {
      const s = specialCampaign(reg, 'web_of_debts');
      if (holder) give(s, { frame: 'role' });
      s.special!.debts!.visit = { id: 'hv1', day: s.day, items };
      s.special!.debts!.visitSeq = 1;
      s.special!.debts!.handlerPressure = 80;
      s.slot = 'night';
      const entry: NightEntry = { id: 'n_v', unitId: HANDLER_UNIT, kind: HANDLER_VISIT_KIND, priority: 6, framing: 'A visitor at the gate.', ignore: { event: 'dismissed', severity: 'minor' }, expiresDay: s.day + 2 };
      s.calendar.nightEvent = entry;
      const r = run(s, reg, { type: 'debts/answer_visit', payload: { visitId: 'hv1', answers: { 'squad:unit_ann': 'withhold' } } });
      expect(ofType(r.events, 'handler_leak')).toHaveLength(1);
      return r.state.special!.debts!.oversightSuspicion;
    };
    expect(leaked(false)).toBe(25);
    expect(leaked(true)).toBe(20);
  });
});

describe('the notices', () => {
  it('the world does not seed the inquiry clock: it is made when it is first needed', () => {
    expect(campaign(reg, 3).world.clocks.some((c) => c.id === OVERSIGHT_CLOCK)).toBe(false);
    expect(reg.clocks.get(OVERSIGHT_CLOCK)).toMatchObject({ segments: 6, visibleToPlayer: true, engine: true });
  });

  it('each stage has a corporate notice with no pronoun for the commander and no number; unknown stages have none', () => {
    const s = world();
    const stages = [{ stage: 'notice', filled: 3 }, { stage: 'notice', filled: 5 }, { stage: 'reprimand', unitId: ANN }, { stage: 'transfer_threat', unitId: ANN }, { stage: 'forced_leash', unitId: ANN }, { stage: 'reassigned', unitId: ANN }, { stage: 'lifted', unitId: ANN }];
    for (const e of stages) {
      const n = oversightNotice({ type: 'oversight_inquiry', ...e }, s);
      expect(n, e.stage).not.toBeNull();
      expect(n!.text).not.toMatch(/\b(he|him|his)\b/i);
      expect(n!.text.replace(/Ann/g, '')).not.toMatch(/\d/);
    }
    expect(oversightNotice({ type: 'oversight_inquiry', stage: 'opened' }, s)).toBeNull();
    expect(oversightNotice({ type: 'oversight_inquiry', stage: 'transfer_requested', unitId: ANN }, s)).toBeNull();
    expect(oversightNotice({ type: 'something_else' }, s)).toBeNull();
    expect(oversightNotice({ type: 'oversight_inquiry', stage: 'transfer_threat', unitId: ANN }, s)!.text).toContain('Ann');
  });
});

describe('a unit who leaves the service', () => {
  it('takes oversight\'s threat, her requests and the block it was counting with her', () => {
    const s = world({ domains: ['private_time'] });
    s.dynamic!.oversight = { blocked: [s.day], holderId: ANN, threat: { unitId: ANN, untilDay: s.day + 3 }, requests: [{ unitId: ANN, day: s.day }] };
    expect(holdsDynamic(s, ANN)).toBe(true);
    forgetDynamic(s, ANN);
    expect(s.dynamic!.oversight).toEqual({ blocked: [s.day] });
    expect(holdsDynamic(s, ANN)).toBe(false);
  });
});
