import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import '../../../src/engine/actions/blocking';
import '../../../src/engine/actions/bonds';
import '../../../src/engine/actions/dynamic';
import '../../../src/engine/actions/personal';
import '../../../src/engine/actions/physics';
import '../../../src/engine/actions/practice';
import { dynamicOf } from '../../../src/engine/dynamic/state';
import type { MannerAxis } from '../../../src/engine/dynamic/types';
import { permissionAnswer } from '../../../src/engine/practice/denial';
import { forgotChance } from '../../../src/engine/practice/hold';
import { severityOf } from '../../../src/engine/practice/offences';
import { postureWindowMs } from '../../../src/engine/practice/postures';
import { ceremonyOf } from '../../../src/engine/practice/punish';
import { noDurationShare, sealedShare } from '../../../src/engine/practice/request';
import { slapWindowMs, startSlap } from '../../../src/engine/practice/slap';
import { TUNING } from '../../../src/engine/tuning';
import type { CampaignState } from '../../../src/engine/state/types';
import { ctxOf, errors, loadCore, run } from '../../helpers/world';
import { ANN, unitOf, world } from './world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });

const ZERO: Record<MannerAxis, number> = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
/** Ann at `frame` in `style`; `manner` is her block (absent: none), at `axes` over zeros. */
function holder(style: string, axes: Partial<Record<MannerAxis, number>> | null, frame: 'play' | 'role' | 'rule' = 'role'): CampaignState {
  const s = world(reg, frame);
  unitOf(s, ANN).bond!.practice!.style = { primary: style } as never;
  if (axes !== null) unitOf(s, ANN).bond!.practice!.manner = { ...ZERO, ...axes };
  return s;
}
const off = { stakes: 'minor' as const };

describe('severity: intensity shifts by half a step before the one rounding', () => {
  it('equals today without a manner and at all zeros', () => {
    for (const style of ['cold', 'cruel', 'affectionate']) {
      const base = severityOf(holder(style, null), reg, ANN, off);
      expect(severityOf(holder(style, {}), reg, ANN, off), style).toBe(base);
    }
  });
  it('a cold holder at role (2): +1 step is 2.5 -> 3, +2 is 3, -1 is 1.5 -> 2, -2 is 1', () => {
    const at = (i: number) => severityOf(holder('cold', { intensity: i }), reg, ANN, off);
    expect(at(0)).toBe(2);
    expect(at(1)).toBe(3);
    expect(at(2)).toBe(3);
    expect(at(-1)).toBe(2);
    expect(at(-2)).toBe(1);
  });
  it('stays clamped to 1 and 5', () => {
    expect(severityOf(holder('affectionate', { intensity: -2 }, 'play'), reg, ANN, { stakes: 'trivial' })).toBe(1);
    expect(severityOf(holder('cruel', { intensity: 2 }, 'rule'), reg, ANN, { stakes: 'severe' })).toBe(5);
  });
});

describe('the ceremony: order', () => {
  it('without a manner and at zeros nothing changes (ritual yes, cold no)', () => {
    for (const axes of [null, {}] as const) {
      expect(ceremonyOf(holder('ritual', axes), reg, ANN, 3)).not.toBeNull();
      expect(ceremonyOf(holder('cold', axes), reg, ANN, 3)).toBeNull();
    }
  });
  it('order -2 holds no ceremony even for a ceremony style; -1 does not change it', () => {
    expect(ceremonyOf(holder('ritual', { order: -2 }), reg, ANN, 3)).toBeNull();
    expect(ceremonyOf(holder('ritual', { order: -1 }), reg, ANN, 3)).not.toBeNull();
  });
  it('order +2 gives a holder of any style the ritual steps at minSeverity or more, and not below', () => {
    const steps = ceremonyOf(holder('ritual', null), reg, ANN, 3)!;
    for (const style of ['cold', 'cruel', 'affectionate', 'playful']) {
      expect(ceremonyOf(holder(style, { order: 2 }), reg, ANN, 3), style).toEqual(steps);
      expect(ceremonyOf(holder(style, { order: 2 }), reg, ANN, 2), style).toBeNull();
      expect(ceremonyOf(holder(style, { order: 1 }), reg, ANN, 3), style).toBeNull();
    }
  });
});

describe('sealed and no-duration shares', () => {
  it('equal today without a manner and at zeros', () => {
    for (const style of ['cruel', 'cold', 'ritual', 'drill']) {
      expect(sealedShare(holder(style, {}), reg, ANN), style).toBe(sealedShare(holder(style, null), reg, ANN));
      expect(noDurationShare(holder(style, {}), reg, ANN), style).toBe(noDurationShare(holder(style, null), reg, ANN));
    }
  });
  it('curiosity raises the sealed share by 0.03 a step, order down by 0.02 a step', () => {
    const base = sealedShare(holder('cold', null), reg, ANN);
    expect(sealedShare(holder('cold', { curiosity: 2 }), reg, ANN)).toBeCloseTo(base + 0.06, 10);
    expect(sealedShare(holder('cold', { curiosity: 1 }), reg, ANN)).toBeCloseTo(base + 0.03, 10);
    expect(sealedShare(holder('cold', { order: -2 }), reg, ANN)).toBeCloseTo(base + 0.04, 10);
    expect(sealedShare(holder('cold', { order: -1, curiosity: 1 }), reg, ANN)).toBeCloseTo(base + 0.05, 10);
    expect(sealedShare(holder('cold', { order: 2, curiosity: -2 }), reg, ANN)).toBe(0); // never below 0
  });
  it('order down raises the no-duration share by 0.03 a step', () => {
    const base = noDurationShare(holder('cold', null), reg, ANN);
    expect(noDurationShare(holder('cold', { order: -1 }), reg, ANN)).toBeCloseTo(base + 0.03, 10);
    expect(noDurationShare(holder('cold', { order: -2 }), reg, ANN)).toBeCloseTo(base + 0.06, 10);
  });
  it('ritual and drill stay at 0 at order 0 and +2 (a scale would too, but a high order never lowers it below 0); a low order lifts them by shift', () => {
    for (const style of ['ritual', 'drill']) {
      expect(noDurationShare(holder(style, null), reg, ANN)).toBe(0);
      for (const order of [0, 1, 2]) expect(noDurationShare(holder(style, { order }), reg, ANN), `${style} ${order}`).toBe(0);
      expect(noDurationShare(holder(style, { order: -1 }), reg, ANN)).toBeCloseTo(0.03, 10);
      expect(noDurationShare(holder(style, { order: -2 }), reg, ANN)).toBeCloseTo(0.06, 10);
    }
  });
});

describe('forgetting to let go', () => {
  it('equals today without a manner and at zeros', () => {
    for (const style of ['cruel', 'cold', 'drill']) expect(forgotChance(holder(style, {}), reg, ANN), style).toBe(forgotChance(holder(style, null), reg, ANN));
  });
  it('warmth down adds 0.03 a step and intensity up 0.02 a step, before the impunity bonus', () => {
    const base = forgotChance(holder('cold', null), reg, ANN);
    expect(forgotChance(holder('cold', { warmth: -2 }), reg, ANN)).toBeCloseTo(base + 0.06, 10);
    expect(forgotChance(holder('cold', { intensity: 2 }), reg, ANN)).toBeCloseTo(base + 0.04, 10);
    expect(forgotChance(holder('cold', { warmth: -1, intensity: 1 }), reg, ANN)).toBeCloseTo(base + 0.05, 10);
    expect(forgotChance(holder('cold', { warmth: 1 }), reg, ANN)).toBeCloseTo(base - 0.03, 10);
    expect(forgotChance(holder('cold', { warmth: 2 }), reg, ANN)).toBe(0); // never below 0
  });
  it('a style at 0 (drill) is lifted only by a positive shift, and a negative one leaves it 0', () => {
    expect(forgotChance(holder('drill', { warmth: 1 }), reg, ANN)).toBe(0);
    expect(forgotChance(holder('drill', { intensity: -2 }), reg, ANN)).toBe(0);
    expect(forgotChance(holder('drill', { warmth: -1 }), reg, ANN)).toBeCloseTo(0.03, 10);
    expect(forgotChance(holder('drill', { warmth: -2, intensity: 2 }), reg, ANN)).toBeCloseTo(0.1, 10);
  });
});

describe('permission: warmth +2 grants like affectionate', () => {
  it('cold denies; warmth +2 grants; +1 does not; the frame rule still denies first', () => {
    expect(permissionAnswer(holder('cold', null, 'play'), reg, ANN)).toBe(TUNING.practice.permission.byStyle.cold ?? 'wait');
    expect(permissionAnswer(holder('cold', { warmth: 1 }, 'play'), reg, ANN)).toBe(permissionAnswer(holder('cold', null, 'play'), reg, ANN));
    expect(permissionAnswer(holder('cold', { warmth: 2 }, 'play'), reg, ANN)).toBe('grant');
    expect(permissionAnswer(holder('cold', { warmth: 2 }, 'rule'), reg, ANN)).toBe('deny');
    const refused = holder('cold', { warmth: 2 }, 'play');
    dynamicOf(refused, ANN)!.favour = TUNING.practice.refusalAt;
    expect(permissionAnswer(refused, reg, ANN)).toBe('deny');
  });
});

describe('time windows: tempo', () => {
  it('the posture call and the swing equal today without a manner and at zeros', () => {
    for (const style of ['ritual', 'drill', 'cold']) {
      expect(postureWindowMs(holder(style, {}), reg, ANN)).toBe(postureWindowMs(holder(style, null), reg, ANN));
      expect(slapWindowMs(holder(style, {}), reg, ANN, 'ps1')).toBe(slapWindowMs(holder(style, null), reg, ANN, 'ps1'));
    }
  });
  it('a sudden holder (tempo +2) gives 30 % less time, a slow one (-2) 30 % more', () => {
    const other = TUNING.practice.posture.windowMs.other;
    expect(postureWindowMs(holder('cold', { tempo: 2 }), reg, ANN)).toBeCloseTo(other * 0.7, 6);
    expect(postureWindowMs(holder('cold', { tempo: -2 }), reg, ANN)).toBeCloseTo(other * 1.3, 6);
    const swing = TUNING.practice.slap.windowMs.cold;
    expect(slapWindowMs(holder('cold', { tempo: 2 }), reg, ANN, 'ps1')).toBeCloseTo(swing * 0.7, 6);
    expect(slapWindowMs(holder('cold', { tempo: -1 }), reg, ANN, 'ps1')).toBeCloseTo(swing * 1.15, 6);
  });
});

describe('the slap after a flinch', () => {
  function slapWorld(style: string, axes: Partial<Record<MannerAxis, number>> | null): CampaignState {
    const s = holder(style, axes, 'role');
    s.content = { enabled: [...(s.content?.enabled ?? []), 'physical_discipline_shown'] };
    dynamicOf(s, ANN)!.hold = 60;
    const started = run(s, reg, { type: 'scene/start', payload: { locationId: 'quarters_unit', participants: [ANN], origin: 'event', consumesSlot: false, startIndex: 0 } });
    expect(errors(started.events)).toEqual([]);
    return started.state;
  }
  /** Opens a slap and answers `flinched`: the favour it moved and whether a second slap is open. */
  function flinched(style: string, axes: Partial<Record<MannerAxis, number>> | null) {
    const d = structuredClone(slapWorld(style, axes));
    startSlap(d, ctxOf(d, reg), ANN);
    const before = dynamicOf(d, ANN)!.favour;
    const r = run(d, reg, { type: 'practice/slap_answer', payload: { slapId: d.practices!.slap!.id, result: 'flinched' } });
    return { favour: dynamicOf(r.state, ANN)!.favour - before, again: r.state.practices?.slap?.again === true };
  }
  const T = TUNING.practice.slap.favour;

  it('equals today without a manner and at zeros', () => {
    for (const style of ['cold', 'cruel', 'affectionate']) expect(flinched(style, {}), style).toEqual(flinched(style, null));
  });
  it('warmth +2 gives affectionate\'s softer favour to any style; +1 does not', () => {
    const base = flinched('cold', null).favour;
    expect(flinched('cold', { warmth: 2 }).favour).toBe(base + T.softer);
    expect(flinched('cold', { warmth: 1 }).favour).toBe(base);
    expect(flinched('affectionate', { warmth: 2 }).favour).toBe(flinched('affectionate', null).favour); // once, not twice
  });
  it('intensity +2 gives any style a second slap after a flinch; cruel at -2 gives none; the second slap is never a third', () => {
    expect(flinched('cold', null).again).toBe(false);
    expect(flinched('cold', { intensity: 1 }).again).toBe(false);
    expect(flinched('cold', { intensity: 2 }).again).toBe(true);
    expect(flinched('cruel', null).again).toBe(true);
    expect(flinched('cruel', { intensity: 1 }).again).toBe(true);
    expect(flinched('cruel', { intensity: -2 }).again).toBe(false);
    expect(flinched('cruel', { intensity: -1 }).again).toBe(true);
  });
});
