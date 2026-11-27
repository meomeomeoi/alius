import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../src/content/types';
import '../../src/engine/actions/dynamic';
import '../../src/engine/actions/development';
import { mannerAsShown } from '../../src/engine/development/mannerShown';
import { showMoments, stampMoments } from '../../src/engine/development/moments';
import { applyReview, fallbackReview, undoReview } from '../../src/engine/development/review';
import { ensureDevelopment } from '../../src/engine/development/state';
import { blankDynamic, newDynamicCampaign } from '../../src/engine/dynamic/state';
import type { CampaignState, Unit } from '../../src/engine/state/types';
import { TUNING } from '../../src/engine/tuning';
import { campaign, loadCore, setRelation } from '../helpers/loyalty';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
const ANN = 'unit_ann';
const unitOf = (s: CampaignState): Unit => s.squad.find((u) => u.id === ANN)!;
const ZERO = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const STEP = TUNING.development.stepThreshold;

function world(overlay?: Partial<typeof ZERO>, since = 100): CampaignState {
  const s = campaign(reg, 3);
  s.day = 200;
  s.settings.characterDevelopment = 'normal';
  for (const id of [ANN, 'unit_bea']) setRelation(s, id, { stateId: 'comrade' });
  unitOf(s).bond = {
    leadStyle: 'dominant', attachment: 'steady', desire: 'low', caretaker: false, ownLimits: { categories: [] }, publicity: 'known',
    practice: { categories: { restraint: { as: 'enjoys', witness: 'indifferent' } }, style: { primary: 'affectionate' }, audience: 'indifferent', inclination: 'curious', fairness: 'fair', hintStyle: 'offers', drive: 'moderate', manner: { ...ZERO }, drawnBy: ['reaction'] },
  };
  unitOf(s).values.mercy = 0;
  if (overlay !== undefined) ensureDevelopment(unitOf(s)).practice = { manner: overlay };
  s.content = { enabled: ['restraint'] };
  s.dynamic = newDynamicCampaign(7, { holders: 'any', pace: 'normal', frequency: 'normal', units: {} });
  s.relations[ANN].dynamic = { ...blankDynamic(s.day - since), frame: 'play', hold: 30, playSince: s.day - since };
  return s;
}
const review = (s: CampaignState): void => { applyReview(s, reg, ANN, fallbackReview(s, reg, ANN), 'fallback'); };

describe('the dossier shows her as the scenes have carried her (mannerAsShown)', () => {
  it('a step no scene has carried is not shown; it shows once the scene has ended; a REROLL never showed it', () => {
    const s = world();
    ensureDevelopment(unitOf(s)).acc = { 'manner:intensity': STEP };
    review(s);
    expect(unitOf(s).development!.practice!.manner).toEqual({ intensity: 1 });
    expect(mannerAsShown(unitOf(s)).manner).toBeUndefined(); // not carried yet
    stampMoments(s, [ANN], 'sc1');
    expect(mannerAsShown(unitOf(s)).manner).toBeUndefined(); // the scene is open
    showMoments(s, 'sc1');
    expect(mannerAsShown(unitOf(s)).manner).toEqual({ intensity: 1 });
    // a second step, unshown, leaves the shown one standing
    s.day += 40;
    ensureDevelopment(unitOf(s)).acc = { 'manner:intensity': STEP };
    review(s);
    expect(unitOf(s).development!.practice!.manner).toEqual({ intensity: 2 });
    expect(mannerAsShown(unitOf(s)).manner).toEqual({ intensity: 1 });
    expect(undoReview(s, ANN)).toBe(true);
    expect(mannerAsShown(unitOf(s)).manner).toEqual({ intensity: 1 });
  });

  it('a turn is not shown until its scene has ended: the style pair and the axes are the ones before it', () => {
    const s = world({ intensity: 2, warmth: -2, order: 2 }, 70);
    review(s); // the first qualifying review only counts
    s.day += 7;
    review(s); // the turn
    expect(unitOf(s).development!.practice!.primary).toBe('regal');
    const before = mannerAsShown(unitOf(s));
    expect(before.style).toEqual({ primary: 'affectionate' });
    expect(before.manner).toEqual({ intensity: 2, warmth: -2, order: 2 });
    stampMoments(s, [ANN], 'sc2');
    showMoments(s, 'sc2');
    const after = mannerAsShown(unitOf(s));
    expect(after.style).toEqual({ primary: 'regal', secondary: 'affectionate' });
    expect(after.manner).toEqual({ warmth: 1, curiosity: 1 });
  });

  it('is the state now when nothing is pending, and the import for a unit with no development', () => {
    const s = world({ intensity: 1 });
    expect(mannerAsShown(unitOf(s)).manner).toEqual({ intensity: 1 });
    const plain = world();
    expect(mannerAsShown(unitOf(plain))).toEqual({ manner: undefined, style: { primary: 'affectionate' } });
  });
});
