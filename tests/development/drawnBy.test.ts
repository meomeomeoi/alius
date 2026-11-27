import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/development';
import { drawnByCandidate, mannerProposals, nextDrawnBy } from '../../src/engine/development/mannerDrift';
import { momentDirective, stampMoments } from '../../src/engine/development/moments';
import { applyReview, eligibleAxes, fallbackReview, undoReview, validateReview } from '../../src/engine/development/review';
import { developmentOf, ensureDevelopment } from '../../src/engine/development/state';
import { drawnFavour } from '../../src/engine/dynamic/drawn';
import { mannerOf } from '../../src/engine/dynamic/manner';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { CampaignState, Unit } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState): Unit => s.squad.find((u) => u.id === ANN)!;
const dynOf = (s: CampaignState) => s.relations[ANN].dynamic!;
const STEP = TUNING.development.stepThreshold;
const DAYS = TUNING.manner.drift.days;
type Drawn = 'pain' | 'power' | 'reaction' | 'discipline' | 'discovery';

function world(drawnBy: Drawn[] | undefined, acc: Record<string, number> = {}): CampaignState {
  const s = campaign(reg, 3);
  s.day = 100;
  s.settings.characterDevelopment = 'normal';
  setRelation(s, ANN, { stateId: 'comrade' });
  unitOf(s).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: {
      categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'cold' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate',
      manner: { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 }, ...(drawnBy === undefined ? {} : { drawnBy }),
    },
  };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 1, pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(40), frame: 'play', hold: 30, playSince: 40 };
  ensureDevelopment(unitOf(s)).acc = { ...acc };
  return s;
}
const drawn = (s: CampaignState): string[] => mannerOf(s, reg, ANN)!.drawnBy;
const step = (s: CampaignState): void => { applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback'); };

describe('what draws her drifts (spec §7)', () => {
  it('the candidate is the highest accumulator past the threshold that is not first', () => {
    const s = world(['reaction'], { 'manner:drawn_by.reaction': 6, 'manner:drawn_by.power': STEP, 'manner:drawn_by.pain': STEP + 1, 'manner:drawn_by.discipline': STEP - 0.5 });
    expect(drawnByCandidate(unitOf(s))).toBe('pain');
    expect(drawnByCandidate(unitOf(world(['reaction'], { 'manner:drawn_by.reaction': 6 })))).toBeNull(); // the first one's own push is no candidate
  });

  it('a one-entry drawnBy gains a second', () => {
    const s = world(['reaction'], { 'manner:drawn_by.power': STEP });
    expect(mannerProposals(s, reg, unitOf(s)).map((p) => p.axis)).toEqual(['manner:drawn_by']);
    expect(eligibleAxes(s, reg, unitOf(s))).toContainEqual({ axis: 'manner:drawn_by', direction: 'up', support: 'strong', proposed: true });
    step(s);
    expect(drawn(s)).toEqual(['reaction', 'power']);
    expect(developmentOf(unitOf(s)).practice).toEqual({ drawnBy: ['reaction', 'power'] });
    expect(unitOf(s).bond!.practice!.drawnBy).toEqual(['reaction']); // the import is untouched
    expect(developmentOf(unitOf(s)).acc['manner:drawn_by.power']).toBeUndefined(); // the support was taken
    expect(dynOf(s).mannerStepped).toEqual({ drawn_by: s.day });
    expect(developmentOf(unitOf(s)).moments.at(-1)).toMatchObject({ axis: 'manner:drawn_by', from: 'reaction', to: 'reaction and power' });
  });

  it('with nothing drawing her, the candidate is her one', () => {
    const s = world(undefined, { 'manner:drawn_by.discovery': STEP });
    step(s);
    expect(drawn(s)).toEqual(['discovery']);
  });

  it('a second becomes first only at a later step (a candidate never pushes the first out directly)', () => {
    const s = world(['reaction', 'power'], { 'manner:drawn_by.pain': STEP });
    step(s);
    expect(drawn(s)).toEqual(['reaction', 'pain']); // it replaces the second
    s.day += DAYS;
    developmentOf(unitOf(s)).acc['manner:drawn_by.pain'] = STEP;
    step(s);
    expect(drawn(s)).toEqual(['pain', 'reaction']); // now it is the second and swaps with the first
    expect(nextDrawnBy(['a' as Drawn, 'b' as Drawn], 'c' as Drawn)).toEqual(['a', 'c']);
  });

  it('holds the pace: one change at most every DAYS, and none before DAYS of play', () => {
    const s = world(['reaction'], { 'manner:drawn_by.power': STEP, 'manner:drawn_by.pain': STEP });
    step(s);
    expect(drawn(s)).toHaveLength(2);
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
    s.day += DAYS - 1;
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
    s.day += 1;
    expect(mannerProposals(s, reg, unitOf(s)).map((p) => p.axis)).toEqual(['manner:drawn_by']);
    const young = world(['reaction'], { 'manner:drawn_by.power': STEP });
    dynOf(young).playSince = young.day - (DAYS - 1);
    expect(mannerProposals(young, reg, unitOf(young))).toEqual([]);
  });

  it('a locked drawnBy never moves and takes no push', () => {
    const s = world(['reaction'], { 'manner:drawn_by.power': STEP });
    unitOf(s).practiceLocks = ['drawnBy'];
    expect(mannerProposals(s, reg, unitOf(s))).toEqual([]);
    drawnFavour(s, reg, ANN, 'pain');
    expect(developmentOf(unitOf(s)).acc['manner:drawn_by.pain']).toBeUndefined();
    expect(validateReview(s, reg, ANN, { shifts: [{ axis: 'manner:drawn_by', direction: 'up', size: 'step', reason: 'r' }], facts: [] }).dropped[0].why).toMatch(/locked/);
  });

  it('the validator takes it only as proposed, and UNDO puts it back', () => {
    const s = world(['reaction'], { 'manner:drawn_by.power': STEP });
    const v = { shifts: [{ axis: 'manner:drawn_by', direction: 'up' as const, size: 'step' as const, reason: 'what she seeks has changed' }], facts: [] };
    expect(validateReview(s, reg, ANN, v).shifts).toHaveLength(1);
    applyReview(s, reg, ANN, v, 'model');
    expect(drawn(s)).toEqual(['reaction', 'power']);
    expect(undoReview(s, ANN)).toBe(true);
    expect(drawn(s)).toEqual(['reaction']);
    expect(developmentOf(unitOf(s)).practice).toBeUndefined();
    expect(dynOf(s).mannerStepped).toBeUndefined();
    expect(developmentOf(unitOf(s)).acc['manner:drawn_by.power']).toBe(STEP);
    const none = world(['reaction']);
    expect(validateReview(none, reg, ANN, v).dropped[0].why).toBe('the engine proposed no such step');
  });

  it('the moment is quiet and its one-time line says what draws her now', () => {
    const s = world(['reaction'], { 'manner:drawn_by.power': STEP });
    step(s);
    s.scene = { id: 'sc1', participants: [ANN], locationId: 'x' } as unknown as CampaignState['scene'];
    stampMoments(s, [ANN], 'sc1');
    const d = momentDirective(s, reg, ANN)!;
    expect(d.text).toMatch(/changed lately: .*draws her/);
    expect(d.text).not.toMatch(/AUTHOR TO WRITE/);
  });
});
