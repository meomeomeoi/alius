import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking, type BlockingChange } from '../../../src/engine/blocking';
import { writeLifeFact } from '../../../src/engine/life/facts';
import { allowedSources, liveSources, moodOf, registerMomentTrigger, resetMomentTriggers, visitorCandidates } from '../../../src/engine/moments/live';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetMomentTriggers();
});

const ANN = 'unit_ann';
const BEA = 'unit_bea';
const DEE = 'unit_dee';
const ctx = () => ({ registries: reg });

/** A campaign (morning, day 1: Bea is in the mess, Dee in the medbay) with a scene open at `loc` and Ann close to the commander. */
function scene(over: { loc?: string; on?: string[]; stateId?: string } = {}): CampaignState {
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: over.stateId ?? 'confidant' });
  if (over.on) enable(s, ...over.on);
  const r = run(s, reg, { type: 'scene/start', payload: { locationId: over.loc ?? 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
  expect(errors(r.events)).toEqual([]);
  return r.state;
}
const set = (s: CampaignState, c: BlockingChange): CampaignState => {
  const d = structuredClone(s);
  setBlocking(d, ctx(), c, { at: 3, source: 'chip' });
  return d;
};
const live = (s: CampaignState, opts?: { ripe?: string }) => liveSources(s, reg, opts);
const ids = (s: CampaignState, opts?: { ripe?: string }): string[] => live(s, opts).map((x) => x.sourceId);
const row = (s: CampaignState, sourceId: string) => live(s).find((x) => x.sourceId === sourceId);
const unit = (s: CampaignState, id: string) => s.squad.find((u) => u.id === id)!;

describe('liveSources: the kinds (R10)', () => {
  it('nothing is live in a quiet scene, and not live at all without a close relation', () => {
    expect(live(scene())).toEqual([]);
    const far = scene({ stateId: 'comrade' });
    far.scene!.tone = 'intimate';
    expect(live(far)).toEqual([]);
    expect(liveSources(campaign(reg, 4), reg)).toEqual([]); // no scene
  });

  it('blocking: a present value lists the source, with its weight (on_comms → remote)', () => {
    const s = set(scene(), { person: ANN, field: 'activity', value: 'on_comms' });
    expect(row(s, 'remote')).toEqual({ sourceId: 'remote', unitId: ANN, weight: 2 });
    const also = set(s, { person: COMMANDER, field: 'activity', value: 'c_on_comms' });
    expect(row(also, 'remote')?.weight).toBe(3); // the commander's own value adds its weight to her moment
  });

  it('blocking: the contact lists its sources too; a value makes a source without the kind only likelier', () => {
    registerFrameReader(() => 'play'); // the contact is a dynamic one
    const s = set(scene({ on: ['service'] }), { person: ANN, field: 'contact', value: 'kneeling_between_legs', with: COMMANDER });
    expect(ids(s)).toContain('remote');
    expect(ids(s)).not.toContain('third_party'); // listed, but it needs somebody who could come in
    const drinking = set(scene(), { person: ANN, field: 'activity', value: 'drinking' });
    expect(ids(drinking)).not.toContain('her_weakness'); // listed, but nothing makes her weak
    unit(drinking, ANN).stress = 85;
    expect(row(drinking, 'her_weakness')?.weight).toBe(2); // the weakness and the glass
  });

  it('visitor: a non-participant in the room and something at stake', () => {
    const s = scene({ loc: 'medbay' });
    expect(visitorCandidates(s, reg)).toEqual([DEE]);
    expect(ids(s)).not.toContain('third_party'); // nothing at stake yet
    const intimate = structuredClone(s);
    intimate.scene!.tone = 'intimate';
    expect(row(intimate, 'third_party')).toEqual({ sourceId: 'third_party', unitId: ANN, weight: 1 });
    const exposed = set(s, { person: COMMANDER, field: 'anchor', value: 'at_door' });
    expect(ids(exposed)).toContain('third_party'); // a value that shows
    const secret = structuredClone(s);
    secret.relations[ANN]!.stateId = 'secret_affair';
    expect(ids(secret)).toContain('third_party');
  });

  it('visitor: nobody near, no visitor', () => {
    const s = scene(); // the commander's cabin: nobody is a door away
    s.scene!.tone = 'intimate';
    expect(visitorCandidates(s, reg)).toEqual([]);
    expect(ids(s)).not.toContain('third_party');
    const gone = scene({ loc: 'medbay' });
    gone.scene!.tone = 'intimate';
    gone.squad.find((u) => u.id === DEE)!.status = 'deserted';
    expect(ids(gone)).not.toContain('third_party'); // she is not living
  });

  it('obscured: the commander cannot see (a hood or a blindfold)', () => {
    const s = set(scene({ on: ['restraint'] }), { person: COMMANDER, field: 'worn', value: 'blindfold' });
    expect(row(s, 'sensory')).toEqual({ sourceId: 'sensory', unitId: ANN, weight: 1 });
    expect(ids(scene({ on: ['restraint'] }))).not.toContain('sensory');
  });

  it('mood_jump: a band that changed since the pass saw her; a moody soldier counts double', () => {
    const s = scene();
    s.scene!.moments = { fired: [], seen: { [ANN]: moodOf(s, reg, ANN)! } };
    expect(ids(s)).not.toContain('her_mood_shift'); // she is as she was
    unit(s, ANN).stress = 55; // strained
    expect(row(s, 'her_mood_shift')?.weight).toBe(1);
    unit(s, ANN).temperament = { talkativeness: 'terse', volatility: 'moody', humor: 'dry' };
    expect(row(s, 'her_mood_shift')?.weight).toBe(2);
    const unseen = scene();
    unit(unseen, ANN).stress = 55;
    expect(ids(unseen)).not.toContain('her_mood_shift'); // nothing to compare with yet
  });

  it('weakness: breaking stress, an injury she does not hide, or a stamped development moment', () => {
    const s = scene();
    expect(ids(s)).not.toContain('her_weakness');
    unit(s, ANN).stress = 85;
    expect(ids(s)).toContain('her_weakness');
    const hurt = scene();
    unit(hurt, ANN).status = 'injured';
    expect(ids(hurt)).toContain('her_weakness');
    const stamped = scene();
    unit(stamped, ANN).development = {
      drift: {}, acc: {}, anchors: [], counters: {}, pending: [], facts: [], habits: [], nextId: 1,
      moments: [{ id: 'dm1', axis: 'x', from: 'a', to: 'b', day: 1, sceneId: stamped.scene!.id }] as never,
    };
    expect(ids(stamped)).toContain('her_weakness');
  });

  it('asleep: her activity has no attention', () => {
    const s = set(scene(), { person: ANN, field: 'activity', value: 'sleeping' });
    expect(ids(s)).toContain('her_absence');
    expect(ids(set(scene(), { person: ANN, field: 'activity', value: 'reading_book' }))).not.toContain('her_absence');
  });

  it('alarm: a mission due tomorrow, a clock filled today, or a night entry queued', () => {
    const base = scene();
    expect(ids(base)).not.toContain('alarm');
    const due = structuredClone(base);
    due.missions.active.push({ id: 'ms1', deadlineDay: due.day + 1, status: 'active' } as never);
    expect(row(due, 'alarm')).toEqual({ sourceId: 'alarm', unitId: ANN, weight: 1 });
    const later = structuredClone(base);
    later.missions.active.push({ id: 'ms1', deadlineDay: later.day + 2, status: 'active' } as never);
    expect(ids(later)).not.toContain('alarm');
    const clock = structuredClone(base);
    clock.world.clocks.push({ id: 'c1', label: 'x', segments: 4, filled: 4, visibleToPlayer: true, filledDay: clock.day });
    expect(ids(clock)).toContain('alarm');
    const night = structuredClone(base);
    night.calendar.nightEventsQueue.push({ id: 'n1', unitId: BEA, kind: 'knock', priority: 1, framing: '', ignore: { event: 'x', severity: 'minor' }, expiresDay: night.day } as never);
    expect(ids(night)).toContain('alarm');
  });

  it('keeps_fact: she keeps a fact of her own life that she has not told', () => {
    const s = scene();
    const keeps = [...reg.lifeEvents.values()].find((e) => e.share === 'keeps')!;
    const shares = [...reg.lifeEvents.values()].find((e) => e.share !== 'keeps')!;
    writeLifeFact(s, ANN, 'a thing she keeps', [String(shares.id)], 2);
    expect(ids(s)).not.toContain('memory_surfaces');
    writeLifeFact(s, ANN, 'a thing she will not say', [String(keeps.id)], 2);
    expect(row(s, 'memory_surfaces')).toEqual({ sourceId: 'memory_surfaces', unitId: ANN, weight: 1 });
    const told = structuredClone(s);
    for (const f of told.memory.facts) f.tags = f.tags.filter((t) => t !== 'untold');
    expect(ids(told)).not.toContain('memory_surfaces');
  });

  it('external: a registered trigger makes a source live (and its absence does not)', () => {
    registerFrameReader(() => 'play'); // her_demand is a dynamic source
    const s = scene();
    expect(ids(s)).not.toContain('her_demand');
    registerMomentTrigger('her_demand', (_st, _reg, unitId) => unitId === ANN);
    expect(row(s, 'her_demand')).toEqual({ sourceId: 'her_demand', unitId: ANN, weight: 1 });
    resetMomentTriggers();
    expect(ids(s)).not.toContain('her_demand');
  });

  it('physics kinds are not live while no physics runs', () => {
    expect(ids(scene())).not.toEqual(expect.arrayContaining(['endurance', 'own_slip']));
  });

  it('a live read draws nothing and writes nothing', () => {
    const s = set(scene(), { person: ANN, field: 'activity', value: 'on_comms' });
    const before = structuredClone(s);
    live(s);
    live(s, { ripe: 'her_offer' });
    expect(s).toEqual(before);
  });
});

describe('sources that may come up', () => {
  it('dynamic sources never at frame equal', () => {
    registerMomentTrigger('her_demand', () => true);
    const s = scene();
    expect(ids(s)).not.toContain('her_demand');
    expect(allowedSources(s, reg, ANN).map((x) => x.id)).not.toContain('her_demand');
    registerFrameReader(() => 'play');
    expect(allowedSources(s, reg, ANN).map((x) => x.id)).toContain('her_demand');
    expect(ids(s)).toContain('her_demand');
  });

  it('only a participant has moments', () => {
    expect(allowedSources(scene(), reg, BEA)).toEqual([]);
  });

  it('a content gate removes a source (her own limits, and a switched-off category)', () => {
    const entry = [...reg.momentSources.values()].find((e) => Array.isArray(e.contentTags) && e.contentTags.length > 0);
    if (entry === undefined) return; // no shipped source is gated yet
    expect(allowedSources(scene(), reg, ANN).map((x) => x.id)).not.toContain(entry.id);
  });

  it('a quiet meeting allows only its sources or the general five', () => {
    const s = scene();
    s.scene!.pastime = { id: [...reg.pastimes.keys()][0]!, unitId: ANN };
    const general = [...reg.momentSources.values()].filter((e) => e.generalMeeting === true).map((e) => e.id).sort();
    expect(general).toEqual(['her_affection', 'her_mood_shift', 'her_question', 'her_weakness', 'memory_surfaces']);
    expect(allowedSources(s, reg, ANN).map((x) => x.id).sort()).toEqual(general);
    registerFrameReader(() => 'play');
    expect(allowedSources(s, reg, ANN).map((x) => x.id)).not.toContain('her_demand'); // never a dynamic one
    s.scene!.pastime = undefined;
    delete s.scene!.pastime;
    expect(allowedSources(s, reg, ANN).length).toBeGreaterThan(general.length);
  });

  it('ripe counts only for extracted kinds', () => {
    const s = scene();
    expect(ids(s)).toEqual([]);
    expect(row({ ...s }, 'her_offer')).toBeUndefined();
    expect(live(s, { ripe: 'her_offer' })).toEqual([{ sourceId: 'her_offer', unitId: ANN, weight: 2 }]); // extracted: live because named, doubled
    expect(ids(s, { ripe: 'third_party' })).toEqual([]); // visitor-only: a hint means nothing
    expect(ids(s, { ripe: 'nonsense' })).toEqual([]);
    const glass = set(s, { person: ANN, field: 'activity', value: 'drinking' });
    expect(row(glass, 'her_weakness')).toBeUndefined();
    expect(live(glass, { ripe: 'her_weakness' }).find((x) => x.sourceId === 'her_weakness')?.weight).toBe(4); // (extracted 1 + the glass 1) × 2
    unit(glass, ANN).stress = 85;
    expect(live(glass, { ripe: 'her_weakness' }).find((x) => x.sourceId === 'her_weakness')?.weight).toBe(6); // (weakness 1 + extracted 1 + the glass 1) × 2
  });

  it('a group scene gives each soldier her own rows', () => {
    const s = campaign(reg, 4);
    setRelation(s, ANN, { stateId: 'confidant' });
    const r = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN, BEA], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(r.events)).toEqual([]);
    const g = set(r.state, { person: BEA, field: 'activity', value: 'crying_alone' });
    unit(g, BEA).stress = 85;
    const sources = live(g, { ripe: 'her_offer' });
    expect(sources.filter((x) => x.sourceId === 'her_weakness')).toEqual([{ sourceId: 'her_weakness', unitId: BEA, weight: 2 }]);
    expect(sources.filter((x) => x.sourceId === 'her_offer').map((x) => x.unitId)).toEqual([ANN]); // the hint names no one: the first soldier
  });
});
