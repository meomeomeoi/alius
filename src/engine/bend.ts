/**
 * P15b: how a style's number bends by a step of one of her manner axes. A leaf (it imports only the tuning and a type) so the physics layer, which
 * imports nothing of the dynamic, bends its rows with the same helpers as the practices (`dynamic/manner.ts` re-exports `bend`) and the instruments
 * (`bendRow`, re-exported by `ui/scene/instruments/kit/bendRow.ts`). At a step of 0 every bend returns its base exactly.
 */
import type { MannerAxis } from './dynamic/types';
import { TUNING } from './tuning';

/**
 * How a number bends: `scale` multiplies by `1 + step × k` (never below 0), then caps the result at `cap`; `shift` adds `step × k`; `gate` is
 * 1 when the step reaches the threshold (`step >= gate` for a positive one, `step <= gate` for a negative one) and 0 otherwise.
 */
export type BendKind = { scale: number; cap?: number } | { shift: number } | { gate: number };

/** A style's number moved by one axis step. `step === 0` returns `base` exactly (a gate: 0). */
export function bend(base: number, step: number, kind: BendKind): number {
  if ('gate' in kind) {
    if (step === 0 || kind.gate === 0) return 0;
    return kind.gate > 0 ? (step >= kind.gate ? 1 : 0) : (step <= kind.gate ? 1 : 0);
  }
  if (step === 0) return base;
  if ('shift' in kind) return base + step * kind.shift;
  const out = base * Math.max(0, 1 + step * kind.scale);
  return kind.cap === undefined ? out : Math.min(kind.cap, out);
}

/**
 * What a field of a style row is, so `bendRow` knows which axis moves it and which way (`TUNING.manner.instrument`): `time` (how long she takes) and `lead`
 * (how far ahead she warns) by `tempo`; `jitter` (how unsteady she is) and `feint` (how often she tricks) by `order`, less of both when steadier;
 * `magnitude` by `intensity`; `patience` (how long she waits, how often she pauses) and `rests` (whole rests she gives) by `warmth`; `lines` (how many
 * lines, or what share of her moves speak) and `linegap` (the spacing between her lines, longer when she says less) by `voice`.
 */
export type FieldKind = 'time' | 'lead' | 'jitter' | 'feint' | 'magnitude' | 'patience' | 'rests' | 'lines' | 'linegap';
/** The kind of each bent field of a row; a field whose value is a plain object of numbers takes a table of its own (the shoe's `moves`). */
export type RowKinds<T> = { [K in keyof T]?: FieldKind | (NonNullable<T[K]> extends readonly unknown[] ? never : NonNullable<T[K]> extends Record<string, unknown> ? RowKinds<NonNullable<T[K]>> : never) };
/** Her manner axes as a row is bent by them (`physicsMannerOf` answers this shape). */
export type RowAxes = Readonly<Record<MannerAxis, number>>;

const clampStep = (n: number): string => String(Math.max(-2, Math.min(2, Math.trunc(n))));

function bendField(value: number, kind: FieldKind, axes: RowAxes): number {
  const I = TUNING.manner.instrument;
  const step = axes[I.axis[kind]] ?? 0;
  if (step === 0) return value;
  switch (kind) {
    case 'rests': return Math.max(0, value + Math.trunc(step * I.restsPerStep));
    case 'lines': return value * (TUNING.manner.voiceLines[clampStep(step)] ?? 1);
    case 'linegap': return value * (I.gap[clampStep(step)] ?? 1);
    case 'feint': return bend(value, step, { scale: I.scale.feint, cap: I.feintCap });
    default: return bend(value, step, { scale: I.scale[kind] });
  }
}

const isNumbers = (v: unknown): v is number[] => Array.isArray(v) && v.length > 0 && v.every((x) => typeof x === 'number');
const isPlain = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function bendWith(row: Record<string, unknown>, axes: RowAxes, kinds: Record<string, unknown>): Record<string, unknown> {
  let out: Record<string, unknown> | null = null;
  for (const key of Object.keys(kinds)) {
    const kind = kinds[key];
    const value = row[key];
    let next: unknown = value;
    if (typeof kind === 'string' && typeof value === 'number') next = bendField(value, kind as FieldKind, axes);
    else if (typeof kind === 'string' && isNumbers(value)) {
      const bent = value.map((v) => bendField(v, kind as FieldKind, axes)); // a [lo, hi] pair bends both ends
      next = bent.every((v, i) => v === value[i]) ? value : bent;
    } else if (isPlain(kind) && isPlain(value)) next = bendWith(value, axes, kind);
    if (next !== value) (out ??= { ...row })[key] = next;
  }
  return out ?? row;
}

const memo = new WeakMap<object, WeakMap<object, Map<string, object>>>();

/**
 * P15b: a style row bent by her manner. Each field named in `kinds` moves by its kind's axis (`TUNING.manner.instrument`); a `[lo, hi]` pair moves both
 * ends; a field the table does not name is kept as it is. With no manner, with every axis at 0, or when nothing moves, it returns `row` itself (the
 * same object), so a prototype's table and its goldens hold. Pure; a row bent once is kept per axes.
 */
export function bendRow<T extends object>(row: T, axes: RowAxes | null | undefined, kinds: RowKinds<T>): T {
  if (axes === null || axes === undefined) return row;
  const key = `${axes.tempo}|${axes.order}|${axes.intensity}|${axes.warmth}|${axes.voice}`;
  if (key === '0|0|0|0|0') return row;
  let byKinds = memo.get(row);
  if (byKinds === undefined) memo.set(row, (byKinds = new WeakMap()));
  let byAxes = byKinds.get(kinds as object);
  if (byAxes === undefined) byKinds.set(kinds as object, (byAxes = new Map()));
  let bent = byAxes.get(key);
  if (bent === undefined) byAxes.set(key, (bent = bendWith(row as Record<string, unknown>, axes, kinds as Record<string, unknown>)));
  return bent as T;
}
