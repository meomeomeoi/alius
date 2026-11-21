import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { dynamicDayStep } from '../../../src/engine/dynamic/dayStep';
import { holdFeed } from '../../../src/engine/dynamic/feed';
import { addHold } from '../../../src/engine/dynamic/hold';
import { applyMilestone, milestonesDue, refusalCost, requiresMet } from '../../../src/engine/dynamic/milestones';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { DynamicMilestoneEntry, Frame } from '../../../src/engine/dynamic/types';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { Booking, CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, loadCore } from '../../helpers/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;
const entry = (id: string): DynamicMilestoneEntry => reg.dynamicMilestones.get(id) as unknown as DynamicMilestoneEntry;

/** Ann holds at `frame` with `hold` (a dominant, curious woman who enjoys restraint; the restraint category is on). */
function world(frame: Frame, hold: number, over: { enabled?: string[]; lastPractice?: number } = {}): CampaignState {
  const s = campaign(reg, 3);
  unitOf(s, ANN).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: over.enabled ?? ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.day = 40;
  s.slot = 'morning';
  s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame, hold, lastPracticeDay: over.lastPractice ?? s.day };
  return s;
}
const dyn = (s: CampaignState) => dynamicOf(s, ANN)!;
const open = (s: CampaignState) => s.dynamic!.open.milestones;
const due = (s: CampaignState) => milestonesDue(s, ctxOf(s, reg), ANN);
const bookings = (s: CampaignState): Booking[] => s.personal?.bookings ?? [];
/** The private set: three domains whose grants are the three capabilities of `private_rule`. */
const PRIVATE_SET = [{ id: 'private_time', since: 1 }, { id: 'body', since: 1 }, { id: 'household', since: 1 }];

describe('milestonesDue', () => {
  it('first_yes opens at testing in the scene form', () => {
    const s = world('equal', 25);
    const events = due(s);
    expect(open(s)).toEqual([{ id: 'dm0', unitId: ANN, milestoneId: 'first_yes', day: 40, form: 'scene' }]);
    expect(events).toContainEqual({ type: 'milestone_offered', unitId: ANN, id: 'dm0', milestoneId: 'first_yes', form: 'scene' });
    expect(dyn(s).frame).toBe('equal'); // a number never moves a frame
  });

  it('stays closed below its band, and opens nothing twice for one unit', () => {
    const low = world('equal', 10);
    expect(due(low)).toEqual([]);
    expect(open(low)).toEqual([]);
    const s = world('equal', 25);
    due(s);
    expect(due(s)).toEqual([]); // one open per unit
    expect(open(s)).toHaveLength(1);
  });

  it('first_protocol books her next free evening, even with two roll bookings this week', () => {
    const s = world('play', 45);
    const mk = (id: string): Booking => ({ id, unitId: ANN, kindId: 'evening_with_me', day: 38, slot: 'evening', status: 'played', source: 'roll', made: 37 });
    s.personal = { ...(s.personal ?? {}), bookings: [mk('bk90'), mk('bk91')] } as CampaignState['personal'];
    const events = due(s);
    const made = bookings(s).filter((b) => b.source === 'milestone');
    expect(made).toHaveLength(1);
    expect(made[0]).toMatchObject({ unitId: ANN, slot: 'evening', day: 40, status: 'booked' }); // this morning: tonight is free
    expect(events).toContainEqual(expect.objectContaining({ type: 'booking_made', source: 'milestone' }));
    expect(open(s)[0]).toMatchObject({ milestoneId: 'first_protocol', form: 'booking' });
  });

  it('the next free evening skips an evening that is taken', () => {
    const s = world('play', 45);
    s.personal = { bookings: [{ id: 'bk90', unitId: BEA, kindId: 'evening_with_me', day: 40, slot: 'evening', status: 'booked', source: 'roll', made: 39 }] } as CampaignState['personal'];
    due(s);
    expect(bookings(s).find((b) => b.source === 'milestone')).toMatchObject({ day: 41, slot: 'evening' });
  });

  it('first_night_held needs restraint >= 1 and stays closed at track 0', () => {
    const closed = world('role', 45);
    expect(due(closed)).toEqual([]);
    const s = world('role', 45);
    dyn(s).tracks.restraint = { xp: 10, level: 1 };
    due(s);
    expect(open(s)[0]).toMatchObject({ milestoneId: 'first_night_held', form: 'booking' });
  });

  it('a mark is offered once; a passed one is not offered again', () => {
    const s = world('role', 45);
    dyn(s).tracks.restraint = { xp: 10, level: 1 };
    dyn(s).milestones.push('first_night_held');
    expect(due(s)).toEqual([]);
  });

  it('a gated milestone stays closed while its category is off', () => {
    const s = world('role', 45, { enabled: ['humiliation'] }); // another practice category keeps the dynamic on
    dyn(s).tracks.restraint = { xp: 10, level: 1 };
    expect(due(s)).toEqual([]);
    const limited = world('role', 45);
    dyn(limited).tracks.restraint = { xp: 10, level: 1 };
    unitOf(limited, ANN).bond!.ownLimits = { categories: ['restraint'] };
    expect(due(limited)).toEqual([]);
  });

  it('cooling: role, 21 days without a gain -> frame_changed to play, automatic', () => {
    const s = world('role', 45, { lastPractice: 40 - 21 });
    const events = due(s);
    expect(events).toContainEqual({ type: 'frame_changed', unitId: ANN, from: 'role', to: 'play', milestoneId: 'cooling' });
    expect(dyn(s).frame).toBe('play');
    expect(dyn(s).milestones).toContain('cooling');
    expect(open(s)).toEqual([]);
    const fresh = world('role', 45, { lastPractice: 40 - 20 });
    expect(due(fresh)).toEqual([]);
    expect(dyn(fresh).frame).toBe('role');
  });

  it('after a cooling the climb back is held for a while (no first_protocol the same day)', () => {
    const s = world('role', 45, { lastPractice: 10 });
    due(s);
    expect(dyn(s).frame).toBe('play');
    expect(due(s)).toEqual([]);
    expect(open(s)).toEqual([]);
    s.day += 20;
    due(s);
    expect(open(s)[0]).toMatchObject({ milestoneId: 'first_protocol' });
  });

  it('command_lost: rule without countermand and without the private set -> role', () => {
    const s = world('rule', 70);
    dyn(s).milestones.push('handover');
    const events = due(s);
    expect(events).toContainEqual({ type: 'frame_changed', unitId: ANN, from: 'rule', to: 'role', milestoneId: 'command_lost' });
    expect(dyn(s).frame).toBe('role');
  });

  it('command_lost: with countermand she stays rule', () => {
    const s = world('rule', 70);
    dyn(s).domains = [{ id: 'command', since: 3 }];
    due(s);
    expect(dyn(s).frame).toBe('rule');
  });

  it('command_lost: with the private set and possessing she stays rule', () => {
    const s = world('rule', 85);
    dyn(s).domains = PRIVATE_SET;
    due(s);
    expect(dyn(s).frame).toBe('rule');
    dyn(s).hold = 70; // no longer possessing: the private set alone does not hold the frame
    due(s);
    expect(dyn(s).frame).toBe('role');
  });

  it('private_rule opens at possessing with book_ahead, body_conditions and household_protocol', () => {
    const s = world('role', 85);
    dyn(s).milestones.push('first_night_held', 'vow');
    dyn(s).cooldowns.handover = 99; // (the handover would come first: she was refused it)
    dyn(s).domains = PRIVATE_SET.slice(0, 2);
    expect(due(s)).toEqual([]);
    dyn(s).domains = PRIVATE_SET;
    due(s);
    expect(open(s)[0]).toMatchObject({ milestoneId: 'private_rule', form: 'demand' });
    const owning = world('role', 70);
    owning.relations[ANN].dynamic!.milestones.push('first_night_held', 'vow');
    owning.relations[ANN].dynamic!.cooldowns.handover = 99;
    owning.relations[ANN].dynamic!.domains = PRIVATE_SET;
    due(owning);
    expect(open(owning)).toEqual([]);
  });

  it('handover and the vow come with owning, in her scene', () => {
    const s = world('role', 65);
    due(s);
    expect(open(s)[0]).toMatchObject({ milestoneId: 'vow', form: 'scene' });
  });

  it('a milestone whose cooldown has not passed is not offered', () => {
    const s = world('equal', 25);
    dyn(s).cooldowns.first_yes = 47;
    expect(due(s)).toEqual([]);
    s.day = 47;
    due(s);
    expect(open(s)[0]).toMatchObject({ milestoneId: 'first_yes' });
  });

  it('a stale open milestone (the frame moved on) is dropped', () => {
    const s = world('equal', 25);
    due(s);
    dyn(s).frame = 'role'; // (a seed or a test moved it; whatever did, the offer is no longer hers to make)
    due(s);
    expect(open(s).some((m) => m.milestoneId === 'first_yes')).toBe(false);
  });

  it('rekindle is never applied by the day check (a return offer accepted applies it)', () => {
    const s = world('equal', 25);
    dyn(s).formerHolder = { endedDay: 10, frame: 'role', sworn: false };
    due(s);
    expect(dyn(s).frame).toBe('equal');
    expect(requiresMet(s, reg, ANN, entry('rekindle'))).toBe(true);
    applyMilestone(s, ctxOf(s, reg), ANN, 'rekindle');
    expect(dyn(s).frame).toBe('play');
  });

  it('the eligible-only gate: a unit who may not hold gets no first_yes', () => {
    const s = world('equal', 25);
    s.dynamic!.setup.units[ANN] = { mayHold: 'no' };
    expect(due(s)).toEqual([]);
  });

  it('the day step opens and applies them (and a hold gain that crosses the band opens one)', () => {
    const s = world('equal', 19);
    const events = addHold(s, ctxOf(s, reg), ANN, 4, 'followed_lead');
    expect(events.map((e) => e.type)).toEqual(['hold_changed', 'hold_band_changed', 'milestone_offered']);
    const cooling = world('role', 45, { lastPractice: 10 });
    expect(dynamicDayStep(cooling, ctxOf(cooling, reg)).map((e) => e.type)).toContain('frame_changed');
  });

  it('nothing happens while the dynamic is off', () => {
    const s = world('equal', 25);
    s.content = { enabled: [] };
    expect(due(s)).toEqual([]);
    expect(open(s)).toEqual([]);
  });
});

describe('requiresMet', () => {
  it('reads the band, the tracks, the capabilities, the styles and the romance by field', () => {
    const s = world('play', 45);
    const m = (requires: DynamicMilestoneEntry['requires']): DynamicMilestoneEntry => ({ ...entry('first_protocol'), requires });
    expect(requiresMet(s, reg, ANN, m({ holdBand: 'keeping' }))).toBe(true);
    expect(requiresMet(s, reg, ANN, m({ holdBand: 'owning' }))).toBe(false);
    expect(requiresMet(s, reg, ANN, m({ styles: ['cold'] }))).toBe(true);
    expect(requiresMet(s, reg, ANN, m({ styles: ['regal'] }))).toBe(false);
    expect(requiresMet(s, reg, ANN, m({ romantic: true }))).toBe(false);
    s.relations[ANN].stateId = 'lover';
    expect(requiresMet(s, reg, ANN, m({ romantic: true }))).toBe(true);
    expect(requiresMet(s, reg, ANN, m({ tracks: { restraint: 1 } }))).toBe(false);
    dyn(s).tracks.restraint = { xp: 10, level: 1 };
    expect(requiresMet(s, reg, ANN, m({ tracks: { restraint: 1 } }))).toBe(true);
    expect(requiresMet(s, reg, ANN, m({ capabilities: ['book_ahead'] }))).toBe(false);
    dyn(s).domains = [{ id: 'private_time', since: 1 }];
    expect(requiresMet(s, reg, ANN, m({ capabilities: ['book_ahead'] }))).toBe(true);
    expect(requiresMet(s, reg, ANN, m({ noCapability: 'book_ahead' }))).toBe(false);
  });
});

describe('refusalCost', () => {
  it('-2 at play, and no note', () => {
    const s = world('play', 30);
    const events = refusalCost(s, ctxOf(s, reg), ANN, 'demand');
    expect(dyn(s).hold).toBe(28);
    expect(events.map((e) => e.type)).toEqual(['hold_changed']);
    expect(dyn(s).refusals).toEqual([]);
  });

  it('-4 plus refusal_noted at role', () => {
    const s = world('role', 50);
    const events = refusalCost(s, ctxOf(s, reg), ANN, 'claim');
    expect(dyn(s).hold).toBe(46);
    expect(events).toContainEqual({ type: 'refusal_noted', unitId: ANN, what: 'claim' });
    expect(dyn(s).refusals).toEqual([40]);
  });

  it('at rule a third refusal within 14 days opens the submit claim', () => {
    const s = world('rule', 80);
    dyn(s).domains = [{ id: 'command', since: 1 }];
    const ctx = ctxOf(s, reg);
    refusalCost(s, ctx, ANN, 'demand');
    s.day += 3;
    refusalCost(s, ctx, ANN, 'claim');
    expect(s.dynamic!.open.claims).toEqual([]);
    s.day += 3;
    const events = refusalCost(s, ctx, ANN, 'demand');
    expect(s.dynamic!.open.claims).toEqual([{ id: 'dc0', unitId: ANN, submit: true, day: 46 }]);
    expect(events).toContainEqual(expect.objectContaining({ type: 'domain_claimed', unitId: ANN, claimId: 'dc0', submit: true }));
    expect(dyn(s).hold).toBe(80 - 12);
  });

  it('refusals older than 14 days do not count toward the contest', () => {
    const s = world('rule', 80);
    dyn(s).domains = [{ id: 'command', since: 1 }];
    const ctx = ctxOf(s, reg);
    refusalCost(s, ctx, ANN, 'demand');
    s.day += 10;
    refusalCost(s, ctx, ANN, 'demand');
    s.day += 10;
    refusalCost(s, ctx, ANN, 'demand');
    expect(s.dynamic!.open.claims).toEqual([]);
  });

  it('a milestone refusal is noted but its hold cost is the band drop (answered by the milestone), not the frame cost', () => {
    const s = world('role', 50);
    const events = refusalCost(s, ctxOf(s, reg), ANN, 'milestone');
    expect(dyn(s).hold).toBe(50);
    expect(events.map((e) => e.type)).toEqual(['refusal_noted']);
  });

  it('nothing for a unit with no dynamic, or while off', () => {
    const s = world('role', 50);
    expect(refusalCost(s, ctxOf(s, reg), BEA, 'demand')).toEqual([]);
    s.content = { enabled: [] };
    expect(refusalCost(s, ctxOf(s, reg), ANN, 'demand')).toEqual([]);
    expect(dyn(s).hold).toBe(50);
  });
});

describe('the demand refusal goes through refusalCost (M5)', () => {
  const refused = (over: Partial<EventIntent> = {}): EventIntent =>
    ({ type: 'refused_demand', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 1, ...over } as EventIntent);

  it('costs by the frame once, not twice', () => {
    for (const [frame, cost] of [['play', 2], ['role', 4]] as const) {
      const s = world(frame, 60);
      applyEventToUnit(s, reg, ANN, refused());
      expect(dyn(s).hold, frame).toBe(60 - cost);
    }
    const role = world('role', 60);
    applyEventToUnit(role, reg, ANN, refused());
    expect(dyn(role).refusals).toEqual([40]);
  });

  it('a postponed desire demand is not a refusal', () => {
    const s = world('role', 60);
    holdFeed(s, reg, ANN, refused({ templateId: 'want_tonight' }), 'moderate');
    expect(dyn(s).hold).toBe(60);
    expect(dyn(s).refusals).toEqual([]);
    holdFeed(s, reg, ANN, refused({ templateId: 'claim_weapon' }), 'moderate'); // an item demand refused is
    expect(dyn(s).hold).toBe(56);
  });
});

describe('applyMilestone', () => {
  it('applies the effects: the frame (no hold gain), a passed id and frame_changed', () => {
    const s = world('equal', 25);
    const events = applyMilestone(s, ctxOf(s, reg), ANN, 'first_yes');
    expect(events).toEqual([{ type: 'frame_changed', unitId: ANN, from: 'equal', to: 'play', milestoneId: 'first_yes' }]);
    expect(dyn(s).frame).toBe('play');
    expect(dyn(s).hold).toBe(25);
    expect(dyn(s).milestones).toEqual(['first_yes']);
  });

  it('the handover moves to rule and hands her the command (by capability, not by id)', () => {
    const s = world('role', 65);
    applyMilestone(s, ctxOf(s, reg), ANN, 'handover');
    expect(dyn(s).frame).toBe('rule');
    expect(dyn(s).domains.map((d) => d.id)).toEqual(['command']);
  });

  it('the vow sets sworn and emits sworn; a frame is lifted to its floor', () => {
    const s = world('role', 65);
    const events = applyMilestone(s, ctxOf(s, reg), ANN, 'vow');
    expect(dyn(s).sworn).toEqual({ day: 40 });
    expect(events).toContainEqual({ type: 'sworn', unitId: ANN, day: 40 });
    expect(dyn(s).frame).toBe('role');
    const low = world('equal', 12);
    applyMilestone(low, ctxOf(low, reg), ANN, 'rekindle');
    expect(dyn(low).hold).toBe(20); // play's floor
  });
});
