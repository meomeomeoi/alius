import { describe, expect, it } from 'vitest';
import {
  affinityBand, attractionBand, nextLoyaltyBand, stressBand, trustBand,
} from '../../../src/engine/relations/bands';

describe('axis bands', () => {
  it.each([[0, 'none'], [9, 'none'], [10, 'low'], [24, 'low'], [25, 'guarded'], [44, 'guarded'], [45, 'solid'], [69, 'solid'], [70, 'high'], [100, 'high']] as const)(
    'trustBand(%i) is %s', (n, band) => expect(trustBand(n)).toBe(band),
  );
  it.each([[-100, 'hostile'], [-60, 'hostile'], [-59, 'cold'], [-30, 'cold'], [-29, 'cool'], [-1, 'cool'], [0, 'neutral'], [29, 'neutral'], [30, 'warm'], [59, 'warm'], [60, 'devoted'], [100, 'devoted']] as const)(
    'affinityBand(%i) is %s', (n, band) => expect(affinityBand(n)).toBe(band),
  );
  it.each([[0, 'none'], [9, 'none'], [10, 'faint'], [24, 'faint'], [25, 'interested'], [49, 'interested'], [50, 'strong'], [100, 'strong']] as const)(
    'attractionBand(%i) is %s', (n, band) => expect(attractionBand(n)).toBe(band),
  );
  it.each([[0, 'calm'], [24, 'calm'], [25, 'tense'], [49, 'tense'], [50, 'strained'], [79, 'strained'], [80, 'breaking'], [100, 'breaking']] as const)(
    'stressBand(%i) is %s', (n, band) => expect(stressBand(n)).toBe(band),
  );
});

describe('loyalty hysteresis', () => {
  it('steady stays steady at 30', () => expect(nextLoyaltyBand('steady', 30)).toBe('steady'));
  it('steady drops to wavering below 25', () => expect(nextLoyaltyBand('steady', 24)).toBe('wavering'));
  it('wavering needs 35 to recover', () => expect(nextLoyaltyBand('wavering', 35)).toBe('steady'));
  it('wavering at 34 stays wavering', () => expect(nextLoyaltyBand('wavering', 34)).toBe('wavering'));
  it('breaking at 19 stays breaking', () => expect(nextLoyaltyBand('breaking', 19)).toBe('breaking'));
  it('breaking climbs to wavering at 20', () => expect(nextLoyaltyBand('breaking', 20)).toBe('wavering'));
  it('breaking jumps to steady at 35', () => expect(nextLoyaltyBand('breaking', 35)).toBe('steady'));
  it('any band drops to breaking below 10', () => {
    for (const b of ['steady', 'wavering', 'breaking'] as const) expect(nextLoyaltyBand(b, 9)).toBe('breaking');
  });
});
