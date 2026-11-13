import { describe, expect, it } from 'vitest';
import {
  affinityBand, attractionBand, initialLoyaltyBand, nextLoyaltyBand, stressBand, trustBand,
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

describe('loyalty bands shifted by disposition (P8)', () => {
  // [level, shift { enter, exit }]: the spec table composed with TUNING: wavering/breaking enter 25/10, steady/breaking exit 35/20
  const shifts = {
    kind: { enter: -5, exit: -5 },
    guarded: { enter: 0, exit: 0 },
    hazardous: { enter: 10, exit: 18 },
  } as const;

  it('no shift is the old behaviour', () => {
    expect(nextLoyaltyBand('steady', 24, { enter: 0, exit: 0 })).toBe(nextLoyaltyBand('steady', 24));
    expect(initialLoyaltyBand(24, { enter: 0, exit: 0 })).toBe(initialLoyaltyBand(24));
    expect(initialLoyaltyBand(9)).toBe('breaking');
  });

  // trust 19/21/34/36/52/54 for each of the three levels, from every current band
  it.each([
    // [level, current, trust, expected]
    ['guarded', 'steady', 24, 'wavering'], ['guarded', 'steady', 34, 'steady'],
    ['guarded', 'wavering', 34, 'wavering'], ['guarded', 'wavering', 36, 'steady'],
    ['guarded', 'breaking', 19, 'breaking'], ['guarded', 'breaking', 21, 'wavering'],
    ['kind', 'steady', 19, 'wavering'], ['kind', 'steady', 21, 'steady'],           // enters wavering below 20
    ['kind', 'wavering', 29, 'wavering'], ['kind', 'wavering', 30, 'steady'],        // leaves wavering at 30
    ['kind', 'steady', 4, 'breaking'], ['kind', 'breaking', 14, 'breaking'], ['kind', 'breaking', 15, 'wavering'],
    ['hazardous', 'steady', 34, 'wavering'], ['hazardous', 'steady', 36, 'steady'], // enters wavering below 35
    ['hazardous', 'steady', 19, 'breaking'], ['hazardous', 'wavering', 21, 'wavering'], // breaking below 20
    ['hazardous', 'wavering', 52, 'wavering'], ['hazardous', 'wavering', 54, 'steady'], // back to steady at 53
    ['hazardous', 'breaking', 36, 'breaking'], ['hazardous', 'breaking', 38, 'wavering'], // out of breaking at 38
    ['hazardous', 'breaking', 54, 'steady'],
  ] as const)('%s: %s at Trust %i → %s', (level, current, trust, expected) => {
    expect(nextLoyaltyBand(current, trust, shifts[level])).toBe(expected);
  });

  it('hazardous thresholds are 35 / 20 / 53 / 38 as in the rulings', () => {
    expect(nextLoyaltyBand('steady', 34, shifts.hazardous)).toBe('wavering');
    expect(nextLoyaltyBand('steady', 35, shifts.hazardous)).toBe('steady');
    expect(nextLoyaltyBand('steady', 19, shifts.hazardous)).toBe('breaking');
    expect(nextLoyaltyBand('wavering', 52, shifts.hazardous)).toBe('wavering');
    expect(nextLoyaltyBand('wavering', 53, shifts.hazardous)).toBe('steady');
    expect(nextLoyaltyBand('breaking', 37, shifts.hazardous)).toBe('breaking');
    expect(nextLoyaltyBand('breaking', 38, shifts.hazardous)).toBe('wavering');
  });

  it('the initial band follows the enter thresholds', () => {
    expect(initialLoyaltyBand(30, shifts.hazardous)).toBe('wavering');
    expect(initialLoyaltyBand(19, shifts.hazardous)).toBe('breaking');
    expect(initialLoyaltyBand(36, shifts.hazardous)).toBe('steady');
    expect(initialLoyaltyBand(22, shifts.kind)).toBe('steady');
    expect(initialLoyaltyBand(19, shifts.kind)).toBe('wavering');
  });
});
