/**
 * P10e-e Task 27 (R30, R27): her footwear and the dirt of her day are derived readers (never stored); a run is shoe service when its physics
 * is an `order` on a `dirt` gauge and its contact's target is footwear (read by field); her verdict on it (`physics/service`) lands through
 * P16's `rateService` and ends the cleaning (her inspection is the check). Nothing here draws.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import { blankDynamic, newDynamicCampaign } from '../../../src/engine/dynamic/state';
import { newLife } from '../../../src/engine/life/state';
import { busySlot } from '../../../src/engine/life/places';
import { dirtOfDay, footwearOf, isShoeRun, shoePaceOf, STYLES, wetDay } from '../../../src/engine/physics/footwear';
import { resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { CampaignState } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, errors, loadCore, ofType, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/practice';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
});

const ANN = 'unit_ann';
const ann = (s: CampaignState) => s.squad.find((u) => u.id === ANN)!;

describe('her footwear (R30)', () => {
  it('footwearOf is boots without heels in her tastes, heels with', () => {
    const s = campaign(reg, 4);
    ann(s).likes = ['coffee', 'quiet mornings'];
    expect(footwearOf(s, reg, ANN)).toBe('boots');
    ann(s).likes = ['coffee', 'high heels'];
    expect(footwearOf(s, reg, ANN)).toBe('heels');
    ann(s).likes = ['Stilettos at parade'];
    expect(footwearOf(s, reg, ANN)).toBe('heels');
    // through the effective profile (P14b): a like she lost no longer counts
    ann(s).development = { lost: { likes: ['Stilettos at parade'] } } as never;
    expect(footwearOf(s, reg, ANN)).toBe('boots');
    expect(footwearOf(s, reg, 'nobody')).toBe('boots');
  });
});

describe('the dirt of her day (R30)', () => {
  const regions = (): Record<string, string | undefined> => Object.fromEntries([...reg.regions.values()].map((r) => [r.id, r.dirt as string | undefined]));
  it('regions carry their dirt: the Ashway ash, K-12 oil, District 7 spores, the Drowned Market mud', () => {
    expect(regions()).toMatchObject({ ashway: 'ash', kestrel_corridor: 'oil', quarantine_d7: 'spores', drowned_market: 'mud' });
  });

  it('dirtOfDay follows her run\'s region today, else the training yard (dust), else rain, else dust', () => {
    const s = campaign(reg, 4);
    const dry = (st: CampaignState): CampaignState => { for (let d = 1; d < 400; d++) { st.day = d; if (!wetDay(st)) return st; } throw new Error('no dry day'); };
    const wet = (st: CampaignState): CampaignState => { for (let d = 1; d < 400; d++) { st.day = d; if (wetDay(st)) return st; } throw new Error('no wet day'); };
    dry(s);
    expect(dirtOfDay(s, reg, ANN)).toBe('dust');
    const report = (regionId: string, day: number, party = [ANN]) => ({ id: 'r1', missionId: 'm', missionTitle: 'm', regionId, day, outcome: 'success', party, nodes: [], log: [], loot: [], injuries: [], deaths: [], breakdowns: [], acknowledged: true, debriefed: true }) as never;
    for (const [region, dirt] of [['ashway', 'ash'], ['kestrel_corridor', 'oil'], ['quarantine_d7', 'spores'], ['drowned_market', 'mud']] as const) {
      s.lastExpedition = report(region, s.day);
      expect(dirtOfDay(s, reg, ANN)).toBe(dirt);
    }
    // not her run, not today's, or a region with no dirt of its own: the rest of her day decides
    s.lastExpedition = report('ashway', s.day, ['unit_bea']);
    expect(dirtOfDay(s, reg, ANN)).toBe('dust');
    s.lastExpedition = report('ashway', s.day - 1);
    expect(dirtOfDay(s, reg, ANN)).toBe('dust');
    s.lastExpedition = report('the_garden', s.day);
    expect(dirtOfDay(s, reg, ANN)).toBe('dust');
    // a wet day: rain, unless she trained in the yard today (dust) or ran (the region's)
    wet(s);
    delete s.lastExpedition;
    expect(dirtOfDay(s, reg, ANN)).toBe('rain');
    const life = newLife(1);
    life.busy.push({ unitId: ANN, slot: busySlot(s.day, 'morning'), activityId: 'train' });
    s.life = life;
    expect(dirtOfDay(s, reg, ANN)).toBe('dust');
    life.busy[0]!.slot = busySlot(s.day - 1, 'morning'); // yesterday's drill: today is wet
    expect(dirtOfDay(s, reg, ANN)).toBe('rain');
    s.lastExpedition = report('drowned_market', s.day);
    expect(dirtOfDay(s, reg, ANN)).toBe('mud');
  });

  it('a wet day is a stable hash of the day (no draw), on some days and not on others', () => {
    const s = campaign(reg, 4);
    const days = Array.from({ length: 100 }, (_, i) => { s.day = i + 1; return wetDay(s); });
    expect(days.some(Boolean)).toBe(true);
    expect(days.every(Boolean)).toBe(false);
    s.day = 7;
    expect(wetDay(structuredClone(s))).toBe(wetDay(s));
  });
});

/** Ann holding at `play` (practices live), the commander at her boots: the cleaning runs. */
function booted(style = 'neutral'): CampaignState {
  registerFrameReader(() => 'play');
  installDynamicHooks();
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service', 'humiliation');
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  ann(s).bond = { leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { service: { as: 'enjoys', witness: 'indifferent' }, worship: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: style }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate' } } as never;
  s.relations[ANN]!.dynamic = { ...blankDynamic(1), frame: 'play', hold: 40 };
  const st = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(st, { registries: reg }, { person: ANN, field: 'contact', value: 'boot_worship', with: COMMANDER }, { at: 1, source: 'engine' });
  expect(st.scene!.physics?.physicsId).toBe('tongue_work');
  return st;
}

describe('shoe service (a run on her footwear)', () => {
  it('a run is shoe service by field: an order on a dirt gauge from a contact whose target is footwear', () => {
    const s = booted();
    expect(isShoeRun(s.scene!.physics!, reg)).toBe(true);
    expect(isShoeRun({ ...s.scene!.physics!, sourceId: 'foot_worship' }, reg)).toBe(false); // her feet, not her footwear
    expect(isShoeRun({ ...s.scene!.physics!, physicsId: 'jaw' }, reg)).toBe(false);
    expect(isShoeRun({ ...s.scene!.physics!, sourceKind: 'item' }, reg)).toBe(false);
  });

  it('her ways of shoe service are the prototype\'s by her lead style (a style it has no row of takes neutral\'s)', () => {
    const s = booted('cruel');
    expect(shoePaceOf(s, reg, ANN)).toEqual(STYLES.cruel);
    expect(shoePaceOf(booted('clinical'), reg, ANN)).toEqual(STYLES.neutral);
  });

  it('her verdict lands once through rateService and ends the cleaning as checked (no draw); the run is recorded as shoe service done', () => {
    const s = booted();
    const r = run(s, reg, { type: 'physics/service', payload: { runId: 'p1', verdict: 'pleased' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'service_rated')).toHaveLength(1);
    expect(ofType(r.events, 'physics_outcome')[0]).toMatchObject({ runId: 'p1', result: 'checked' });
    expect(r.state.scene!.physics).toBeUndefined();
    expect(r.state.scene!.shoeDone).toEqual({ runId: 'p1', holderId: ANN });
    expect(r.state.rng).toEqual(s.rng);
    // a late verdict for it is taken (once a scene: ignored here); a stale id is refused
    const again = run(r.state, reg, { type: 'physics/service', payload: { runId: 'p1', verdict: 'displeased' } });
    expect(errors(again.events)).toEqual([]);
    expect(ofType(again.events, 'service_rated')).toHaveLength(0);
    expect(errors(run(r.state, reg, { type: 'physics/service', payload: { runId: 'p0', verdict: 'pleased' } }).events)).not.toEqual([]);
  });

  it('the engine\'s check ended the run first (a real segment to ≤ 10): her verdict on it is rated, the holder the record\'s', () => {
    const s = booted();
    s.scene!.physics!.gauge = 15;
    const st = run(s, reg, { type: 'physics/next_segment', payload: { runId: 'p1' } }).state;
    const ended = run(st, reg, { type: 'physics/segment_end', payload: { runId: 'p1', segment: 1, inputs: [{ beat: 0, kind: 'wipe', part: 'toe', amount: 0.1 }] } });
    expect(ofType(ended.events, 'physics_outcome')[0]).toMatchObject({ result: 'checked' });
    expect(ended.state.scene!.shoeDone).toEqual({ runId: 'p1', holderId: ANN });
    const r = run(ended.state, reg, { type: 'physics/service', payload: { runId: 'p1', verdict: 'adequate', holderId: 'unit_bea' } });
    expect(errors(r.events)).toEqual([]);
    expect(ofType(r.events, 'service_rated')[0]).toMatchObject({ kind: 'adequate', unitId: ANN });
  });

  it('a shoe run ended by the stop word, or another run that just ended, is refused', () => {
    const stopped = run(booted(), reg, { type: 'physics/stop_word', payload: {} }).state;
    expect(stopped.scene!.shoeDone).toBeUndefined();
    expect(errors(run(stopped, reg, { type: 'physics/service', payload: { runId: 'p1', verdict: 'displeased', holderId: ANN } }).events)).not.toEqual([]);
    const other = booted();
    other.scene!.physics = { ...other.scene!.physics!, physicsId: 'jaw', sourceId: 'sole_to_mouth' };
    const st = run(other, reg, { type: 'physics/stop_word', payload: {} }).state;
    expect(errors(run(st, reg, { type: 'physics/service', payload: { runId: 'p1', verdict: 'pleased', holderId: ANN } }).events)).not.toEqual([]);
  });
});
