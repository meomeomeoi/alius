import { beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { computeDeltas } from '../../../src/engine/relations/deltas';
import { applyEventToUnit } from '../../../src/engine/relations/effects';
import { meets } from '../../../src/engine/relations/graph';
import type { EventIntent } from '../../../src/engine/relations/intents';
import type { CampaignState } from '../../../src/engine/state/types';
import { TUNING } from '../../../src/engine/tuning';
import { confidenceFloor, confidenceShift, dispositionThresholds, worldDispositionLevel } from '../../../src/engine/worldOptions';
import { campaign, errors, loadCore, run } from '../../helpers/world';

let reg: Registries;
let base: CampaignState;
const ANN = 'unit_ann';
beforeAll(async () => {
  reg = await loadCore();
  base = campaign(reg, 2);
});

const at = (level: string, setting?: number): CampaignState => {
  const s = structuredClone(base);
  s.world.options = { ...(s.world.options ?? {}), disposition: level };
  if (setting !== undefined) s.settings.intentMinConfidence = setting;
  return s;
};
const ev = (type: string, severity: EventIntent['severity'], confidence = 1, over: Partial<EventIntent> = {}): EventIntent => ({
  type: type as EventIntent['type'], actor: 'commander', targets: [ANN], severity, evidence: 'x', confidence, ...over,
});
const gainRow = (level: string, type: string, sev: EventIntent['severity'] = 'major') => computeDeltas(at(level), reg, ANN, ev(type, sev));

describe('multipliers per axis', () => {
  it.each([
    ['kind', 1.2, 0.7], ['guarded', 1, 1], ['prickly', 0.9, 1.3], ['volatile', 0.8, 1.6], ['hazardous', 0.7, 2.0],
  ] as const)('%s: gains ×%f, losses ×%f', (level, gain, loss) => {
    const g = gainRow('guarded', 'praised');
    const l = gainRow('guarded', 'insulted');
    expect(g.affinity).toBeGreaterThan(0);
    expect(l.affinity).toBeLessThan(0);
    const dg = gainRow(level, 'praised');
    const dl = gainRow(level, 'insulted');
    expect(dg.affinity).toBeCloseTo(g.affinity * gain, 9);
    expect(dg.trust).toBeCloseTo(g.trust * gain, 9);
    expect(dl.affinity).toBeCloseTo(l.affinity * loss, 9);
    expect(dl.trust).toBeCloseTo(l.trust * loss, 9);
    expect(dl.stress).toBe(l.stress); // stress is not an axis
  });

  it('the same intent sequence leaves kind far ahead of hazardous', () => {
    const play = (level: string) => {
      let d = at(level);
      for (const e of [ev('praised', 'major'), ev('insulted', 'moderate'), ev('praised', 'moderate')]) {
        const draft = structuredClone(d);
        applyEventToUnit(draft, reg, ANN, e);
        d = draft;
      }
      return d.relations[ANN];
    };
    const k = play('kind');
    const h = play('hazardous');
    expect(k.affinity - at('kind').relations[ANN].affinity).toBeGreaterThan(h.affinity - at('hazardous').relations[ANN].affinity);
  });
});

describe('big gesture', () => {
  it('a major protected is ×2 for gains at hazardous, ×1 at guarded; a minor one is not a big gesture', () => {
    const g = gainRow('guarded', 'protected', 'major');
    expect(g.trust).toBeGreaterThan(0);
    expect(gainRow('hazardous', 'protected', 'major').trust).toBeCloseTo(g.trust * 0.7 * 2, 9);
    expect(gainRow('hazardous', 'protected', 'major').affinity).toBeCloseTo(g.affinity * 0.7 * 2, 9);
    expect(gainRow('volatile', 'protected', 'major').trust).toBeCloseTo(g.trust * 0.8 * 1.5, 9);
    expect(gainRow('prickly', 'protected', 'major').trust).toBeCloseTo(g.trust * 0.9 * 1.2, 9);
    expect(gainRow('kind', 'protected', 'major').trust).toBeCloseTo(g.trust * 1.2, 9);
    const gm = gainRow('guarded', 'protected', 'minor');
    expect(gainRow('hazardous', 'protected', 'minor').trust).toBeCloseTo(gm.trust * 0.7, 9);
    expect(gainRow('hazardous', 'protected', 'moderate').trust).toBeCloseTo(gainRow('guarded', 'protected', 'moderate').trust * 0.7, 9);
    expect(gainRow('hazardous', 'protected', 'extreme').trust).toBeCloseTo(gainRow('guarded', 'protected', 'extreme').trust * 0.7 * 2, 9);
  });

  it('only commander events of the listed types, only positive axes', () => {
    // praised is not in the list
    expect(gainRow('hazardous', 'praised', 'major').trust).toBeCloseTo(gainRow('guarded', 'praised', 'major').trust * 0.7, 9);
    // a unit\'s own protected is not the commander\'s gesture
    const own = (level: string) => computeDeltas(at(level), reg, ANN, ev('protected', 'major', 1, { actor: ANN, targets: [ANN] }));
    expect(own('hazardous').trust).toBeCloseTo(own('guarded').trust * 0.7, 9);
    expect(TUNING.disposition.bigGesture.events).toContain('protected');
  });
});

describe('confidence', () => {
  const landed = (level: string, e: EventIntent, setting?: number) => {
    const s = at(level, setting);
    const before = JSON.stringify(s.relations[ANN]);
    const events = applyEventToUnit(s, reg, ANN, e);
    return { s, events, changed: JSON.stringify(s.relations[ANN]) !== before };
  };

  it('a 0.55 gain lands at kind and is cut at hazardous; a 0.45 loss is dropped at kind and lands at hazardous', () => {
    const gain = ev('praised', 'major', 0.55);
    const loss = ev('insulted', 'major', 0.45);
    expect(computeDeltas(at('kind'), reg, ANN, gain).affinity).toBeGreaterThan(0);
    expect(computeDeltas(at('hazardous'), reg, ANN, gain)).toMatchObject({ trust: 0, affinity: 0 });
    expect(computeDeltas(at('kind'), reg, ANN, loss)).toMatchObject({ trust: 0, affinity: 0, stress: 0, dropped: true });
    const h = computeDeltas(at('hazardous'), reg, ANN, loss);
    expect(h.affinity).toBeLessThan(0);
    expect(h.dropped).toBeUndefined();
    // guarded keeps today's behaviour: both floors are 0.5
    expect(computeDeltas(at('guarded'), reg, ANN, loss).dropped).toBe(true);
    expect(computeDeltas(at('guarded'), reg, ANN, gain).affinity).toBeGreaterThan(0);
  });

  it('between the floors only the axes that pass move: a 0.55 loss at kind has no axis delta and no stress', () => {
    const d = computeDeltas(at('kind'), reg, ANN, ev('insulted', 'major', 0.55));
    expect(d).toMatchObject({ trust: 0, affinity: 0, stress: 0 });
    expect(d.dropped).toBeUndefined(); // above the lower (gain) floor, so the event is read, just not believed as a loss
  });

  it('an event below both floors leaves no history', () => {
    const r = landed('kind', ev('insulted', 'major', 0.45));
    expect(r.events).toEqual([]);
    expect(r.changed).toBe(false);
    expect(r.s.squad[0].stress).toBe(base.squad[0].stress);
    const hazardous = landed('hazardous', ev('insulted', 'major', 0.45));
    expect(hazardous.changed).toBe(true);
    expect(hazardous.s.relations[ANN].history.at(-1)).toMatchObject({ kind: 'event', type: 'insulted' });
  });

  it('setting 0.6 raises every floor by 0.1', () => {
    expect(confidenceShift(at('guarded'))).toBe(0);
    expect(confidenceShift(at('guarded', 0.6))).toBeCloseTo(0.1, 12);
    expect(computeDeltas(at('guarded', 0.6), reg, ANN, ev('praised', 'major', 0.55)).dropped).toBe(true);
    expect(computeDeltas(at('guarded', 0.6), reg, ANN, ev('praised', 'major', 0.6)).affinity).toBeGreaterThan(0);
    expect(computeDeltas(at('guarded', 0.4), reg, ANN, ev('praised', 'major', 0.45)).affinity).toBeGreaterThan(0);
    expect(computeDeltas(at('guarded', 0.4), reg, ANN, ev('praised', 'major', 0.35)).dropped).toBe(true);
    // hazardous gain 0.75 → 0.85 at 0.6
    expect(computeDeltas(at('hazardous', 0.6), reg, ANN, ev('praised', 'major', 0.8)).affinity).toBe(0);
    expect(computeDeltas(at('hazardous', 0.6), reg, ANN, ev('praised', 'major', 0.86)).affinity).toBeGreaterThan(0);
  });

  it('floor never exceeds any per-axis floor (settings 0, 0.5, 1)', () => {
    for (const setting of [0, 0.5, 1]) {
      const floor = confidenceFloor(reg, setting);
      expect(floor).toBeGreaterThanOrEqual(0);
      expect(floor).toBeLessThanOrEqual(1);
      for (const level of reg.dispositionLevels.values()) {
        const t = dispositionThresholds(level as never, setting - 0.5);
        // an event the engine would read is never dropped by the sanitizer
        for (let c = 0; c <= 1.0000001; c += 0.05) {
          const engineReads = c + 1e-9 >= Math.min(t.gain, t.loss);
          if (engineReads) expect(c + 1e-9, `${level.id} @${setting} c=${c.toFixed(2)}`).toBeGreaterThanOrEqual(floor);
        }
      }
    }
  });

  it('the floor at the default setting is the lowest level floor; the setting moves it one for one', () => {
    expect(confidenceFloor(reg, 0.5)).toBeCloseTo(0.4, 12);
    expect(confidenceFloor(reg, 0.6)).toBeCloseTo(0.5, 12);
    expect(confidenceFloor(reg, 0)).toBe(0);
    expect(confidenceFloor(reg, 1)).toBeCloseTo(0.9, 12);
  });

  it('at setting 1 nothing below 1 moves an axis at guarded or kind', () => {
    for (const level of ['kind', 'guarded']) {
      for (const [type, sev] of [['praised', 'major'], ['insulted', 'major']] as const) {
        expect(computeDeltas(at(level, 1), reg, ANN, ev(type, sev, 0.99)), `${level} ${type}`).toMatchObject({ trust: 0, affinity: 0, dropped: true });
      }
    }
  });

  it('engine-made events (confidence 1) always pass, at every level and setting', () => {
    for (const level of reg.dispositionLevels.keys()) {
      for (const setting of [0, 0.5, 1]) {
        const g = computeDeltas(at(level, setting), reg, ANN, ev('praised', 'major', 1));
        const l = computeDeltas(at(level, setting), reg, ANN, ev('insulted', 'major', 1));
        expect(g.dropped, `${level}@${setting}`).toBeUndefined();
        expect(g.affinity, `${level}@${setting} gain`).toBeGreaterThan(0);
        expect(l.affinity, `${level}@${setting} loss`).toBeLessThan(0);
      }
    }
  });

  it('a missing setting reads the default 0.5', () => {
    const s = at('guarded');
    delete s.settings.intentMinConfidence;
    expect(confidenceShift(s)).toBe(0);
    expect(worldDispositionLevel(s, reg).id).toBe('guarded');
  });
});

describe('stage timing', () => {
  it('minDaysInState 10 needs 8 days at kind and 20 at hazardous', () => {
    const cond = { minDaysInState: 10 };
    const after = (level: string, days: number) => {
      const s = at(level);
      s.day = 30;
      s.relations[ANN].stateSince = 30 - days;
      return meets(s, reg, ANN, cond);
    };
    expect([after('kind', 7), after('kind', 8)]).toEqual([false, true]);
    expect([after('guarded', 9), after('guarded', 10)]).toEqual([false, true]);
    expect([after('hazardous', 19), after('hazardous', 20)]).toEqual([false, true]);
    expect([after('prickly', 11), after('prickly', 12)]).toEqual([false, true]);
  });

  it('a unit\'s own offset scales only her stage timing', () => {
    const s = at('guarded');
    s.day = 30;
    s.squad[0].dispositionOffset = 2; // volatile: ×1.5 → 15 days
    s.relations[ANN].stateSince = 30 - 12;
    s.relations[s.squad[1].id].stateSince = 30 - 12;
    expect(meets(s, reg, ANN, { minDaysInState: 10 })).toBe(false);
    expect(meets(s, reg, s.squad[1].id, { minDaysInState: 10 })).toBe(true);
  });

  it('conditions without minDaysInState and a zero value are untouched', () => {
    const s = at('hazardous');
    expect(meets(s, reg, ANN, {})).toBe(true);
    expect(meets(s, reg, ANN, { minDaysInState: 0 })).toBe(true);
  });
});

describe('campaign/set_min_confidence', () => {
  it('mirrors the setting into the campaign', () => {
    const r = run(base, reg, { type: 'campaign/set_min_confidence', payload: { value: 0.65 } });
    expect(errors(r.events)).toEqual([]);
    expect(r.state.settings.intentMinConfidence).toBe(0.65);
  });
  it('refuses values outside 0 to 1 and changes nothing', () => {
    for (const value of [-0.1, 1.1, 'x', undefined]) {
      const r = run(base, reg, { type: 'campaign/set_min_confidence', payload: { value } });
      expect(errors(r.events)).toHaveLength(1);
      expect(r.state).toEqual(base);
    }
  });
});
