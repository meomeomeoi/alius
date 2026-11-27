// @vitest-environment jsdom
/**
 * P15b Task 7: `bendRow` and its wiring in the ported instruments. The helper bends the numeric fields of a style row by her manner, by the field's kind
 * (planning ruling 1: times and leads by tempo, jitter and feints by order, magnitudes by intensity, patience and rests by warmth, lines by voice);
 * with no manner or every axis at 0 it returns the row itself. Each instrument wraps its one row lookup in it (the fidelity gate declares the wrapper);
 * here the wrappers read the same bent row as `bendRow` gives, and the engine's copies of the same rows (gulp's flow, the service's pace) agree.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Registries } from '../../../src/content/types';
import { bendRow, type FieldKind, type RowAxes } from '../../../src/ui/scene/instruments/kit/bendRow';
import { installDynamicHooks } from '../../../src/engine/dynamic/hooks';
import type { MannerAxis } from '../../../src/engine/dynamic/types';
import { GULP_KINDS, gulpRowOf } from '../../../src/engine/physics/gulp';
import { servicePaceOf } from '../../../src/engine/physics/service';
import { registerPhysicsStyle, resetPhysicsHooks } from '../../../src/engine/physics/style';
import { STYLES as SHOE_STYLES } from '../../../src/engine/physics/footwear';
import { GULP_STYLES, TUNING } from '../../../src/engine/tuning';
import { STYLE_KINDS as BREATH_KINDS, STYLES as BREATH_STYLES, _breath } from '../../../src/ui/scene/instruments/breath/breath';
import { STYLE_KINDS as WEIGHT_KINDS, _weight } from '../../../src/ui/scene/instruments/weight/weight';
import { STYLE_KINDS as JAW_KINDS, STYLES as JAW_STYLES, _jaw } from '../../../src/ui/scene/instruments/jaw/jaw';
import { STYLE_KINDS as SCENT_KINDS, ST as scentST, _scent } from '../../../src/ui/scene/instruments/scent/scent';
import { STYLES as SCENT_STYLES } from '../../../src/ui/scene/instruments/scent/words';
import { _gulp } from '../../../src/ui/scene/instruments/gulp/gulp';
import { SHOE_KINDS, _shoe } from '../../../src/ui/scene/instruments/shoe/shoe';
import { TELE_KINDS, T_TELE } from '../../../src/ui/scene/instruments/activity/throne';
import { REST_KINDS } from '../../../src/ui/scene/instruments/activity/frame';
import { loadCore } from '../../helpers/loyalty';
import { ANN, unitOf, world } from '../../engine/practice/world';

let reg: Registries;
beforeAll(async () => { reg = await loadCore(); });
afterEach(() => resetPhysicsHooks());

const ZERO: RowAxes = { intensity: 0, warmth: 0, order: 0, voice: 0, tempo: 0, curiosity: 0 };
const ax = (a: Partial<Record<MannerAxis, number>>): RowAxes => ({ ...ZERO, ...a });
const K = TUNING.manner.instrument;
const S = TUNING.manner.scale;

describe('bendRow', () => {
  const row = Object.freeze({ t: 1000, lead: [600, 900], j: 100, f: 0.5, m: 0.4, p: 4, r: 2, n: 3, gap: [20, 30], word: 'x', flag: true, nested: Object.freeze({ a: 0.2, b: 0.4 }), none: 7 });
  const kinds = { t: 'time', lead: 'lead', j: 'jitter', f: 'feint', m: 'magnitude', p: 'patience', r: 'rests', n: 'lines', gap: 'linegap', word: 'time', flag: 'time', nested: { a: 'magnitude', b: 'patience' } } as const;
  const bent = (a: Partial<Record<MannerAxis, number>>) => bendRow(row, ax(a), kinds as never) as unknown as Record<string, unknown>;

  it('returns the row itself with no manner, at 0, or when only an axis it does not read moves', () => {
    expect(bendRow(row, null, kinds as never)).toBe(row);
    expect(bendRow(row, undefined, kinds as never)).toBe(row);
    expect(bendRow(row, ZERO, kinds as never)).toBe(row);
    expect(bendRow(row, ax({ curiosity: 2 }), kinds as never)).toBe(row);
    expect(bendRow(row, ax({ tempo: 2 }), {} as never)).toBe(row);
  });
  it('tempo bends times and leads, a [lo, hi] pair at both ends: + is shorter', () => {
    expect(bent({ tempo: 2 }).t).toBeCloseTo(1000 * (1 - 2 * S), 5);
    expect(bent({ tempo: 2 }).lead).toEqual([600 * (1 - 2 * S), 900 * (1 - 2 * S)].map((v) => expect.closeTo(v, 5)));
    expect(bent({ tempo: -2 }).t).toBeCloseTo(1000 * (1 + 2 * S), 5);
    expect(bent({ tempo: -1 }).lead).toEqual([600 * (1 + S), 900 * (1 + S)].map((v) => expect.closeTo(v, 5)));
  });
  it('order bends jitter and feint down when + (steadier), up when -; a feint is a share, capped at 1', () => {
    expect(bent({ order: 2 }).j).toBeCloseTo(100 * (1 - 2 * S), 5);
    expect(bent({ order: -2 }).j).toBeCloseTo(100 * (1 + 2 * S), 5);
    expect(bent({ order: -2 }).f).toBeCloseTo(0.5 * (1 + 2 * S), 5);
    expect(bendRow({ f: 0.9 }, ax({ order: -2 }), { f: 'feint' }).f).toBe(K.feintCap);
  });
  it('intensity bends magnitudes, warmth patience, whole rests (never below 0), voice lines and the gap between them', () => {
    expect(bent({ intensity: 2 }).m).toBeCloseTo(0.4 * (1 + 2 * S), 5);
    expect(bent({ warmth: -2 }).p).toBeCloseTo(4 * (1 - 2 * S), 5);
    expect(bent({ warmth: 2 }).r).toBe(3);
    expect(bent({ warmth: 1 }).r).toBe(2);
    expect(bent({ warmth: -2 }).r).toBe(1);
    expect(bendRow({ r: 0 }, ax({ warmth: -2 }), { r: 'rests' }).r).toBe(0);
    expect(bent({ voice: 2 }).n).toBe(3 * TUNING.manner.voiceLines['2']!);
    expect(bent({ voice: -1 }).n).toBe(3 * TUNING.manner.voiceLines['-1']!);
    expect(bent({ voice: -1 }).gap).toEqual([20 * K.gap['-1']!, 30 * K.gap['-1']!]);
    expect(bent({ voice: 2 }).gap).toEqual([20 * K.gap['2']!, 30 * K.gap['2']!]);
  });
  it('a plain object of numbers takes a table of its own; a word, a flag and a field with no kind are kept', () => {
    expect(bent({ intensity: 2, warmth: 2 }).nested).toEqual({ a: expect.closeTo(0.2 * (1 + 2 * S), 5), b: expect.closeTo(0.4 * (1 + 2 * S), 5) });
    const all = bent({ intensity: 2, warmth: 2, tempo: 2, order: 2, voice: 2 });
    expect(all.word).toBe('x'); expect(all.flag).toBe(true); expect(all.none).toBe(7);
  });
  it('is pure: the row is not changed, and the same axes give the same bent object', () => {
    const a = bendRow(row, ax({ tempo: 1 }), kinds as never);
    expect(a).not.toBe(row);
    expect(row.t).toBe(1000);
    expect(bendRow(row, ax({ tempo: 1 }), kinds as never)).toBe(a);
  });
  it('every kind has an axis and a factor in TUNING.manner.instrument', () => {
    const kindsOf: FieldKind[] = ['time', 'lead', 'jitter', 'feint', 'magnitude', 'patience', 'rests', 'lines', 'linegap'];
    for (const k of kindsOf) expect(['tempo', 'order', 'intensity', 'warmth', 'voice']).toContain(K.axis[k]);
    expect(K.axis).toMatchObject({ time: 'tempo', lead: 'tempo', jitter: 'order', feint: 'order', magnitude: 'intensity', patience: 'warmth', rests: 'warmth', lines: 'voice' });
    expect(K.scale.time).toBeLessThan(0); expect(K.scale.lead).toBeLessThan(0); expect(K.scale.jitter).toBeLessThan(0); expect(K.scale.feint).toBeLessThan(0);
    expect(K.scale.magnitude).toBeGreaterThan(0); expect(K.scale.patience).toBeGreaterThan(0);
    expect(Math.abs(K.scale.time)).toBe(S);
  });
});

/** A kinds table is real: each key names a numeric field, a pair or a table of numbers in a row of the instrument's table. */
function tableIsReal(rows: Record<string, unknown>, kinds: Record<string, unknown>): void {
  for (const key of Object.keys(kinds)) {
    const seen = Object.values(rows).some((r) => {
      const v = (r as Record<string, unknown>)[key];
      return typeof v === 'number' || (Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number')) || (typeof v === 'object' && v !== null && !Array.isArray(v));
    });
    expect(seen, key).toBe(true);
  }
}

describe('each instrument reads her row through bendRow at its one lookup', () => {
  const EXTREME = ax({ tempo: 2, order: 2, intensity: 2, warmth: 2, voice: 2 });
  const OTHER = ax({ tempo: -2, order: -2, intensity: -2, warmth: -2, voice: -2 });
  /** The breath's `st()` takes these from the engine (the plan's opening, the run's seal); they are not her row's. */
  const ENGINE_OWNED = ['windowMs', 'seal', 'overDelay'];
  type Case = { name: string; rows: Record<string, object>; kinds: object; read: (style: string, manner: RowAxes | null) => Record<string, unknown> };
  const cases: Case[] = [
    { name: 'breath', rows: BREATH_STYLES, kinds: BREATH_KINDS, read: (style, m) => { _breath.R.row = style; _breath.R.manner = m; return _breath.st() as never; } },
    { name: 'weight', rows: _weight.STYLES, kinds: WEIGHT_KINDS, read: (style, m) => { _weight.S.style = style; _weight.R.manner = m; return _weight.ST() as never; } },
    { name: 'jaw', rows: JAW_STYLES, kinds: JAW_KINDS, read: (style, m) => { _jaw.S.style = style; _jaw.R.manner = m; return _jaw.st() as never; } },
    { name: 'scent', rows: SCENT_STYLES, kinds: SCENT_KINDS, read: (style, m) => { _scent.S.style = style; _scent.R.manner = m; return scentST() as never; } },
    { name: 'gulp', rows: GULP_STYLES, kinds: GULP_KINDS, read: (style, m) => { _gulp.S.style = style; _gulp.R.manner = m; return _gulp.ST(); } },
    { name: 'shoe', rows: SHOE_STYLES, kinds: SHOE_KINDS, read: (style, m) => { _shoe.S.style = style; _shoe.R.manner = m; return _shoe.ST() as never; } },
  ];
  for (const c of cases) {
    it(`${c.name}: with no manner, or at 0, every row reads the table's own values; at ±2 the bent fields move`, () => {
      tableIsReal(c.rows as never, c.kinds as never);
      let moved = 0;
      for (const style of Object.keys(c.rows)) {
        const base = c.rows[style] as Record<string, unknown>;
        const kinds = c.kinds as Record<string, unknown>;
        for (const m of [null, ZERO]) {
          const got = c.read(style, m);
          for (const key of Object.keys(base)) if (!ENGINE_OWNED.includes(key)) expect(got[key], `${style}.${key}`).toEqual(base[key]);
        }
        const bentUp = c.read(style, EXTREME);
        const want = bendRow(base as never, EXTREME, kinds as never) as Record<string, unknown>;
        for (const key of Object.keys(kinds)) {
          expect(bentUp[key], `${style}.${key}`).toEqual(want[key]);
          if (JSON.stringify(base[key]) !== JSON.stringify(want[key])) moved++;
        }
        // a field the table does not name is never bent
        for (const key of Object.keys(base)) if (!(key in kinds) && !ENGINE_OWNED.includes(key)) expect(bentUp[key], `${style}.${key}`).toEqual(base[key]);
        c.read(style, OTHER); // the other end reads without error
      }
      expect(moved, `${c.name} bends something`).toBeGreaterThan(0);
      c.read(Object.keys(c.rows)[0]!, null);
    });
  }
  it('the engine\'s gulp row and the instrument\'s are the same bent row', () => {
    for (const style of Object.keys(GULP_STYLES)) {
      expect(gulpRowOf(style, null)).toBe(GULP_STYLES[style]);
      expect(gulpRowOf(style, ZERO)).toBe(GULP_STYLES[style]);
      expect(gulpRowOf(style, EXTREME)).toEqual(_gulp.R && (() => { _gulp.S.style = style; _gulp.R.manner = EXTREME; const r = _gulp.ST(); _gulp.R.manner = null; return r; })());
    }
    expect(gulpRowOf('regal', EXTREME)).toEqual(bendRow(GULP_STYLES.neutral!, EXTREME, GULP_KINDS));
    expect(gulpRowOf('cruel', ax({ tempo: 2 })).warn).toBe(0); // no warning stays none
    expect(gulpRowOf('neutral', ax({ tempo: 2 })).warn).toBeCloseTo(700 * (1 - 2 * S), 5);
  });
  it('the frame bends her rests and the throne her telegraph, by their tables', () => {
    expect(bendRow({ rests: 2 }, ax({ warmth: 2 }), REST_KINDS).rests).toBe(3);
    expect(bendRow({ rests: 0 }, ax({ warmth: -2 }), REST_KINDS).rests).toBe(0);
    const row = { tele: T_TELE.neutral! };
    expect(bendRow(row, ZERO, TELE_KINDS)).toBe(row);
    expect(bendRow(row, ax({ tempo: 2 }), TELE_KINDS).tele[0]).toBeCloseTo(600 * (1 - 2 * S), 5);
  });
});

describe('the service\'s pace (the engine\'s servicePaceOf)', () => {
  const pace = (axes: Partial<Record<MannerAxis, number>> | null) => {
    resetPhysicsHooks(); registerPhysicsStyle(() => ({ primary: 'neutral' }));
    const s = world(reg, 'role');
    if (axes !== null) { unitOf(s, ANN).bond!.practice!.manner = ax(axes); installDynamicHooks(); registerPhysicsStyle(() => ({ primary: 'neutral' })); }
    return servicePaceOf(s, reg, ANN);
  };
  it('no manner, or at 0, is the style\'s pace; warmth bends her patience, tempo her kiss, her wait between bouts and her rub', () => {
    const base = pace(null);
    expect(pace({})).toEqual(base);
    expect(pace({ curiosity: 2 })).toEqual(base);
    expect(pace({ warmth: 2 }).patience).toBeCloseTo(base.patience * (1 + 2 * S), 5);
    expect(pace({ warmth: 2 }).kiss).toEqual(base.kiss);
    const quick = pace({ tempo: 2 });
    expect(quick.kiss[0]).toBeCloseTo(base.kiss[0] * (1 - 2 * S), 5);
    expect(quick.every).toBeCloseTo(base.every * (1 - 2 * S), 5);
    expect(quick.tempo).toBeCloseTo(base.tempo * (1 + 2 * S), 5);
    expect(quick.patience).toBe(base.patience);
    expect(quick.order).toEqual(base.order);
    expect(quick.grain).toBe(base.grain);
  });
});
