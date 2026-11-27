import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/dynamic';
import { applyDynamicIntent, dynamicIntentInput } from '../../../src/engine/dynamic/intents';
import { blankDynamic, dynamicOf, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import type { Frame, Inclination } from '../../../src/engine/dynamic/types';
import type { EventIntent } from '../../../src/engine/relations/intents';
import { ALL_EVENT_TYPES, DYNAMIC_INTENT_TYPES, ENGINE_EVENT_TYPES, EVENT_TYPES } from '../../../src/engine/relations/vocab';
import type { CampaignState } from '../../../src/engine/state/types';
import { campaign, ctxOf, errors, loadCore, run, setRelation } from '../../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const [ANN, BEA] = ['unit_ann', 'unit_bea'];
const unitOf = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

/** Ann can hold (restraint on, dominant lead, `inclination`); a scene with `present`; her block per `frame` (none when `block` is false). */
function world(over: { present?: string[]; frame?: Frame; inclination?: Inclination; block?: boolean; lead?: 'dominant' | 'balanced' | 'assertive'; scene?: boolean } = {}): CampaignState {
  const s = campaign(reg, 3);
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s, ANN).bond = {
    leadStyle: over.lead ?? 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: over.inclination ?? 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  if (over.block !== false) s.relations[ANN].dynamic = { ...blankDynamic(s.day), frame: over.frame ?? 'equal' };
  if (over.scene === false) return s;
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: over.present ?? [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const withProbe = (s: CampaignState, id = ANN): CampaignState => {
  dynamicOf(s, id)!.probes = { pending: { axis: 'space', tier: 1, day: s.day }, lastDay: s.day, answers: [], issued: 1 };
  s.dynamic!.queue = [id];
  return s;
};
const input = (s: CampaignState, ids = s.scene?.participants ?? [ANN], channel: 'scene' | 'dm' = 'scene') => dynamicIntentInput(s, reg, ids, channel);
const ev = (over: Partial<EventIntent> = {}): EventIntent => ({ type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she yields', confidence: 1, response: 'yielded', ...over } as EventIntent);

describe('the vocabulary', () => {
  it('seven reportable types and one engine type were added', () => {
    expect(EVENT_TYPES).toHaveLength(61); // P16 added seven, P15b two (quirk_voiced, hypothetical_answered)
    expect(ENGINE_EVENT_TYPES).toContain('dynamic_exit');
    expect(ALL_EVENT_TYPES).toHaveLength(88); // and two engine relation types
    for (const t of DYNAMIC_INTENT_TYPES) expect(EVENT_TYPES as readonly string[], t).toContain(t);
    for (const t of [...DYNAMIC_INTENT_TYPES, 'dynamic_exit']) expect(typeof reg.eventDeltas.get(t)?.cause, t).toBe('string');
  });
});

describe('what is offered', () => {
  it('nothing without a subject: a holder in the squad who is not present, with every category on', () => {
    const s = world({ present: [BEA] });
    expect(input(s)).toEqual({});
    s.content = { enabled: reg.contentCategories ? [...reg.contentCategories.keys()] : [] };
    expect(input(s)).toEqual({});
  });

  it('nothing while the dynamic is off, or with no practice category on', () => {
    const s = withProbe(world());
    expect(input(s).dynamic?.types).toContain('probe_answered');
    const off = structuredClone(s);
    delete off.dynamic;
    expect(input(off)).toEqual({});
    const none = structuredClone(s);
    none.content = { enabled: [] };
    expect(input(none)).toEqual({});
  });

  it('a pending probe for a present unit offers probe_answered, with the axis in words', () => {
    const o = input(withProbe(world())).dynamic!;
    expect(o.types).toEqual(['probe_answered']);
    expect(o.probes).toEqual([ANN]);
    expect(o.probeAxes[ANN]).toBe(reg.probeAxes.get('space')!.promptHint);
    expect(o.milestones).toEqual([]);
  });

  it('a probe whose unit is not present is not offered', () => {
    expect(input(withProbe(world({ present: [BEA] })), [BEA])).toEqual({});
  });

  it('only one probe a scene: two pending, the first present unit is offered', () => {
    const s = world({ present: [ANN, BEA] });
    unitOf(s, BEA).bond = structuredClone(unitOf(s, ANN).bond!);
    s.relations[BEA].dynamic = blankDynamic(s.day);
    withProbe(s, ANN);
    withProbe(s, BEA);
    expect(input(s).dynamic!.probes).toEqual([ANN]);
  });

  it('probe_observed: a present eligible unit in equal with lead style assertive or more, no probe pending', () => {
    const o = input(world()).dynamic!;
    expect(o.types).toContain('probe_observed');
    expect(o.observed).toEqual([ANN]);
    expect(input(world({ lead: 'balanced' }))).toEqual({}); // a balanced lead does not make gestures of its own
    expect(input(world({ frame: 'play' }))).toEqual({});
    expect(input(world({ inclination: 'none' }))).toEqual({});
    expect(input(withProbe(world())).dynamic!.observed ?? []).toEqual([]);
    expect(input(world({ block: false })).dynamic!.observed).toEqual([ANN]); // no block yet is still eligible
  });

  it('an open milestone, claim and offer of a present unit are listed with their ids; those of someone absent are not', () => {
    const s = world({ present: [ANN] });
    const open = s.dynamic!.open;
    open.milestones.push({ id: 'dm1', unitId: ANN, milestoneId: reg.dynamicMilestones.keys().next().value as string, day: s.day, form: 'scene' }, { id: 'dm2', unitId: BEA, milestoneId: 'x', day: s.day, form: 'scene' });
    open.claims.push({ id: 'dc1', unitId: ANN, domainId: 'private_time', day: s.day });
    open.offers.push({ id: 'do1', unitId: ANN, day: s.day, composition: [] });
    const o = input(s).dynamic!;
    expect(o.milestones).toEqual(['dm1']);
    expect(Object.keys(o.milestoneLabels)).toEqual(['dm1']);
    expect(o.claims).toEqual(['dc1']);
    expect(o.offers).toEqual(['do1']);
    for (const t of ['milestone_accepted', 'milestone_refused', 'compromise_reached', 'offer_answered']) expect(o.types, t).toContain(t);
  });

  it('protocol_slip: a unit at role or beyond, with another unit present', () => {
    const s = world({ present: [ANN, BEA], frame: 'role' });
    expect(input(s).dynamic!.slips).toEqual([ANN]);
    expect(input(world({ present: [ANN], frame: 'role' })).dynamic?.slips ?? []).toEqual([]);
    expect(input(world({ present: [ANN, BEA], frame: 'play' })).dynamic?.slips ?? []).toEqual([]);
  });

  it('a DM offers the same, rebuilt from the state, for the one unit', () => {
    const s = withProbe(world({ scene: false }));
    expect(input(s, [ANN], 'dm').dynamic!.probes).toEqual([ANN]);
  });

  it('reads and writes nothing, draws nothing', () => {
    const s = withProbe(world());
    const before = JSON.stringify(s);
    input(s);
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('applying', () => {
  it('a probe answer through intents/apply closes the probe and moves hold and the reading', () => {
    const s = withProbe(world());
    dynamicOf(s, ANN)!.hold = 10;
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she gave way at once', confidence: 0.9, response: 'yielded', tone: 'sincere' }] } } });
    expect(errors(r.events)).toEqual([]);
    const d = dynamicOf(r.state, ANN)!;
    expect(d.probes.pending).toBeUndefined();
    expect(d.probes.answers).toEqual(['yielded']);
    expect(d.hold).toBe(14);
    expect(d.readOf.updates).toBe(1);
    expect(d.readOf.r).toBeGreaterThan(0);
  });

  it('an answer for a unit with no pending probe through intents/apply changes nothing', () => {
    const s = world();
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'probe_answered', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'x', confidence: 0.9, response: 'yielded' }] } } });
    expect(dynamicOf(r.state, ANN)!.hold).toBe(0);
    expect(dynamicOf(r.state, ANN)!.readOf.updates).toBe(0);
  });

  it('probe_observed weighs half and closes nothing; it starts the block of a unit that has none', () => {
    const s = world({ block: false });
    const r = run(s, reg, { type: 'intents/apply', payload: { channel: 'scene', intents: { events: [{ type: 'probe_observed', actor: 'commander', targets: [ANN], severity: 'minor', evidence: 'she took the lead', confidence: 0.9, response: 'yielded' }] } } });
    expect(errors(r.events)).toEqual([]);
    expect(dynamicOf(r.state, ANN)!.hold).toBe(2);
    expect(dynamicOf(r.state, ANN)!.probes.answers).toEqual([]);
  });

  it('applyDynamicIntent rebuilds the offer: a stale pending probe is not answered twice, and the other types do nothing yet', () => {
    const s = withProbe(world());
    const ctx = ctxOf(s, reg);
    const first = applyDynamicIntent(s, ctx, ANN, ev());
    expect(first.some((e) => e.type === 'hold_changed')).toBe(true);
    expect(applyDynamicIntent(s, ctx, ANN, ev())).toEqual([]);
    expect(applyDynamicIntent(s, ctx, ANN, ev({ type: 'protocol_slip' } as Partial<EventIntent>))).toEqual([]);
  });

  it('draws nothing', () => {
    const s = withProbe(world());
    const before = structuredClone(s.rng);
    applyDynamicIntent(s, ctxOf(s, reg), ANN, ev());
    expect(s.rng).toEqual(before);
  });
});
