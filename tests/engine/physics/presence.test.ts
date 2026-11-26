/**
 * P10e-e Task 21 (R25): her presence is a derived reader (her_activity.html `baseScore` / `stepOf`): her activity's attention, her
 * talkativeness, her style, Regard as a tone term, her hold band, her mood and a hash of the session; it drifts by `absorb` per phase. No draw,
 * never stored.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { COMMANDER, registerFrameReader, resetBlockingHooks, setBlocking } from '../../../src/engine/blocking';
import { presenceOf, presenceScore, registerPresenceTerms, resetPresenceHooks, stepOf } from '../../../src/engine/physics/presence';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import type { StyleKey } from '../../../src/engine/physics/state';
import type { CampaignState, Unit } from '../../../src/engine/state/types';
import { enable } from '../../helpers/bonds';
import { campaign, loadCore, run, setRelation } from '../../helpers/loyalty';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/physics';

let reg: Registries;
beforeAll(async () => {
  reg = await loadCore();
});
afterEach(() => {
  resetBlockingHooks();
  resetPhysicsHooks();
  resetPresenceHooks();
});

const ANN = 'unit_ann';

function framed(opts: { style: StyleKey; talk?: 'silent' | 'terse' | 'talkative'; regardRank: number; holdIndex: number; activity?: string }): CampaignState {
  registerFrameReader(() => 'play');
  registerPhysicsStyle((_s, id) => (id === ANN ? { primary: opts.style } : null));
  registerPresenceTerms((state, _reg, id) => (id === ANN ? { regardRank: opts.regardRank, regardBands: 5, holdIndex: opts.holdIndex, holdBands: 5, hash: () => 0.5 } : null));
  const s = campaign(reg, 4);
  setRelation(s, ANN, { stateId: 'confidant' });
  enable(s, 'worship', 'service');
  if (opts.talk) (s.squad.find((u) => u.id === ANN) as Unit & { temperament?: unknown }).temperament = { talkativeness: opts.talk, volatility: 'steady', humor: 'dry' };
  const d = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_commander', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } }).state;
  setBlocking(d, { registries: reg }, { person: ANN, field: 'activity', value: opts.activity ?? 'reading_book' }, { at: 1, source: 'chip' });
  setBlocking(d, { registries: reg }, { person: COMMANDER, field: 'anchor', value: 'beside_her', relTo: ANN }, { at: 2, source: 'chip' });
  expect(d.scene!.physics?.sourceKind).toBe('activity');
  return d;
}

describe('her presence (R25)', () => {
  it('stepOf: the prototype\'s thresholds 1.2 / 0.3 / −0.7', () => {
    expect([1.2, 1.19, 0.3, 0.29, -0.7, -0.71].map(stepOf)).toEqual(['with', 'glancing', 'glancing', 'own', 'own', 'use']);
  });

  it('a cruel holder at the lowest Regard, in the highest hold band, reads `use`', () => {
    const s = framed({ style: 'cruel', regardRank: 4, holdIndex: 4 });
    expect(presenceOf(s, reg, s.scene!.physics!, 1)).toBe('use');
  });

  it('an affectionate, talkative one reads `with`', () => {
    const s = framed({ style: 'affectionate', talk: 'talkative', regardRank: 2, holdIndex: 2 });
    expect(presenceScore(s, reg, s.scene!.physics!)).toBeCloseTo(0 + 0.8 + 0.8, 6); // elsewhere 0, talkative .8, affectionate .8, the hash at .5 adds 0
    expect(presenceOf(s, reg, s.scene!.physics!, 1)).toBe('with');
  });

  it('is deterministic for the same run and phase, and drifts by the activity\'s absorb', () => {
    const s = framed({ style: 'neutral', regardRank: 2, holdIndex: 2 });
    const p = s.scene!.physics!;
    expect(presenceOf(s, reg, p, 2)).toBe(presenceOf(structuredClone(s), reg, p, 2));
    // reading a book absorbs her (−0.35 a phase, the hashed ±0.15 at its middle adds 0): from 0 (own) she drifts to use by phase 4
    expect([1, 2, 4].map((ph) => presenceOf(s, reg, p, ph))).toEqual(['own', 'own', 'use']);
  });

  it('draws nothing and writes nothing', () => {
    const s = framed({ style: 'neutral', regardRank: 2, holdIndex: 2 });
    const before = JSON.stringify(s);
    presenceOf(s, reg, s.scene!.physics!, 3);
    expect(JSON.stringify(s)).toBe(before);
  });
});
