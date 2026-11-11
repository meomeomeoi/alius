import { SOCIAL_STATS, type SocialStat } from '../social';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import type { WorldEffect } from '../world/types';
import { plainText, toWorldEffect, type MapCtx } from './effects';
import type { DilemmaOption, DilemmaScale, Magnitude, Rejection } from './types';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const cutWords = (text: string, max: number): string => text.split(' ').filter(Boolean).slice(0, max).join(' ');

// ---------------------------------------------------------------------------------------------
// Parsing the model's answer

export interface ParsedDilemma {
  title: string;
  setup: string;
  options: DilemmaOption[];
}

function parseOption(raw: unknown, index: number, ctx: MapCtx, bad: Rejection[]): { option: DilemmaOption; flags: string[] } | null {
  const at = (reason: string, rule: Rejection['rule'] = 'shape'): void => void bad.push({ rule, option: index, reason });
  if (!isObj(raw)) return at('An option must be an object.'), null;
  if (typeof raw.label !== 'string' || plainText(raw.label, 400) === '') return at('An option needs a label.'), null;
  if (!Array.isArray(raw.effects) || raw.effects.length === 0 || raw.effects.length > 6) return at('An option needs 1 to 6 effects.'), null;
  const option: DilemmaOption = {
    label: cutWords(plainText(raw.label, 400), TUNING.dilemma.labelWords), effects: [], magnitudes: [],
  };
  const flags: string[] = [];
  let failed = false;
  for (const e of raw.effects) {
    const mapped = toWorldEffect(e, ctx);
    if ('rule' in mapped) {
      bad.push({ ...mapped, option: index });
      failed = true;
      continue;
    }
    const magnitude = (e as { magnitude: Magnitude }).magnitude;
    if ('check' in mapped) {
      if (option.check) {
        at('An option has at most one social check.');
        failed = true;
      } else option.check = mapped.check;
      option.magnitudes.push(magnitude);
      continue;
    }
    option.effects.push(mapped);
    option.magnitudes.push(magnitude);
    if (mapped.type === 'flag') flags.push(mapped.flagId);
  }
  if (raw.requires !== undefined) {
    const r = raw.requires;
    const stat = isObj(r) ? (r.socialStat ?? r.stat) : undefined;
    if (!isObj(r) || !(SOCIAL_STATS as readonly unknown[]).includes(stat) || typeof r.rank !== 'number' || !Number.isInteger(r.rank) || r.rank < 1 || r.rank > 5) {
      at('requires needs { socialStat, rank } with a rank from 1 to 5.');
      failed = true;
    } else option.requires = { stat: stat as SocialStat, rank: r.rank };
  }
  if (!failed && option.effects.length === 0) {
    at('An option needs at least one effect besides its check.');
    failed = true;
  }
  return failed ? null : { option, flags };
}

/**
 * Checks and maps a `dilemma_generate` answer: shape, texts (plain, cut: title 60 characters, setup 120 words, label
 * 12 words), the option count of the template, the effect mapping (numbers from the engine tables), rule 4 (magnitudes
 * match the scale) and rule 6 (flags, one per option when the template says so). Rules 1–3 are `validateOptions`.
 * Never throws; a rejection list means the answer must not reach the player.
 */
export function parseDilemmaOutput(raw: unknown, ctx: MapCtx): ParsedDilemma | { rejected: Rejection[] } {
  const bad: Rejection[] = [];
  try {
    if (!isObj(raw)) return { rejected: [{ rule: 'shape', reason: 'The answer must be an object.' }] };
    if (typeof raw.title !== 'string' || plainText(raw.title, 200) === '') bad.push({ rule: 'shape', reason: 'A dilemma needs a title.' });
    if (typeof raw.setup !== 'string' || plainText(raw.setup, 2000) === '') bad.push({ rule: 'shape', reason: 'A dilemma needs a setup.' });
    const want = (ctx.template.optionCount as number | undefined) ?? 3;
    if (!Array.isArray(raw.options)) bad.push({ rule: 'shape', reason: 'A dilemma needs a list of options.' });
    else if (raw.options.length !== want) bad.push({ rule: 'shape', reason: `This dilemma needs exactly ${want} options.` });
    if (bad.length > 0) return { rejected: bad };

    const options: DilemmaOption[] = [];
    const flagsOf: string[][] = [];
    (raw.options as unknown[]).forEach((o, i) => {
      const parsed = parseOption(o, i, ctx, bad);
      if (parsed) {
        options.push(parsed.option);
        flagsOf.push(parsed.flags);
      }
    });
    if (bad.length > 0) return { rejected: bad };

    // rule 4: the raw magnitudes must suit the scale
    const scale = ctx.template.scale as DilemmaScale;
    const all = options.flatMap((o) => o.magnitudes);
    if (scale === 'minor' && all.includes('large')) bad.push({ rule: 4, reason: 'A minor dilemma may not carry a large effect.' });
    if (scale === 'defining' && !all.includes('large')) bad.push({ rule: 4, reason: 'A defining dilemma needs at least one large effect.' });

    // rule 6: one declared flag per option, no two alike
    if ((ctx.template.constraints as { flagPerOption?: boolean } | undefined)?.flagPerOption === true) {
      flagsOf.forEach((f, i) => {
        if (f.length !== 1) bad.push({ rule: 6, option: i, reason: 'Every option must set exactly one of the allowed flags.' });
      });
      const flat = flagsOf.map((f) => f[0]).filter((f) => f !== undefined);
      if (new Set(flat).size !== flat.length) bad.push({ rule: 6, reason: 'Two options set the same flag.' });
    }
    if (bad.length > 0) return { rejected: bad };
    return {
      title: plainText(raw.title, TUNING.dilemma.titleMax),
      setup: cutWords(plainText(raw.setup, 2000), TUNING.dilemma.setupWords),
      options,
    };
  } catch (e) {
    return { rejected: [{ rule: 'shape', reason: `The answer could not be read: ${e instanceof Error ? e.message : String(e)}` }] };
  }
}

// ---------------------------------------------------------------------------------------------
// Rules 1–3: what the options are worth

type Hearer = Pick<Unit, 'values' | 'kind'>;

/** How one unit takes a value-aligned event: −1…1 from her values and the axes, as P3 reads them. */
function alignment(fx: Extract<WorldEffect, { type: 'unit_event' }>, unit: Hearer): number {
  if (fx.valueAxes && fx.valueAxes.length > 0) {
    const sum = fx.valueAxes.reduce((n, a) => n + (unit.values[a.axis as keyof Unit['values']] ?? 0) * a.direction, 0);
    return clamp(sum / 3, -1, 1);
  }
  return ['sided_against', 'decision_violated', 'endangered', 'coerced', 'dismissed', 'insulted', 'lied_detected', 'broke_promise', 'mocked_defect', 'crime_revealed', 'rejected_advance'].includes(fx.event) ? -1 : 1;
}

const presentNamed = (units: Unit[]): Unit[] => units.filter((u) => u.kind === 'named');

/** Gain / loss reading of one effect and the key it is accounted under. Flags and bookkeeping effects are neutral. */
export function effectSign(fx: WorldEffect, units: Unit[]): { pos: boolean; neg: boolean; key: string } {
  switch (fx.type) {
    case 'resource': return { pos: fx.amount > 0, neg: fx.amount < 0, key: `resource:${fx.resource}` };
    case 'carried_supplies': return { pos: fx.amount > 0, neg: fx.amount < 0, key: 'carried_supplies' };
    case 'faction': return { pos: fx.amount > 0, neg: fx.amount < 0, key: `faction:${fx.factionId}` };
    case 'clock': return { pos: fx.by < 0, neg: fx.by > 0, key: `clock:${fx.clockId}` };
    case 'party_stress': return { pos: fx.amount < 0, neg: fx.amount > 0, key: 'stress' };
    case 'party_hp': return { pos: fx.pct > 0, neg: fx.pct < 0, key: 'party_hp' };
    case 'leash': return { pos: fx.amount > 0, neg: fx.amount < 0, key: 'leash' };
    case 'loot': return { pos: true, neg: false, key: 'loot' };
    case 'unit_event': {
      const key = `unit_event:${fx.valueAxes?.length ? fx.valueAxes.map((a) => a.axis).join('+') : fx.event}`;
      const hearers = presentNamed(units);
      const read = hearers.map((u) => alignment(fx, u));
      return { pos: read.some((a) => a > 0), neg: read.some((a) => a < 0), key };
    }
    default: return { pos: false, neg: false, key: fx.type };
  }
}

export interface Score {
  resources: number;
  factions: number;
  clocks: number;
  stress: number;
  units: number;
}

/** The five dimensions of the dominance check (weights in `TUNING.dilemma.weight`): the sum of what an option does to each. */
export function scoreOption(o: DilemmaOption, units: Unit[]): Score {
  const w = TUNING.dilemma.weight;
  const score: Score = { resources: 0, factions: 0, clocks: 0, stress: 0, units: 0 };
  for (const fx of o.effects) {
    switch (fx.type) {
      case 'resource': score.resources += fx.amount * w[fx.resource]; break;
      case 'carried_supplies': score.resources += fx.amount * w.supplies; break;
      case 'faction': score.factions += fx.amount * w.faction; break;
      case 'clock': score.clocks += fx.by * w.clock; break;
      case 'party_stress': score.stress += fx.amount * w.stress; break;
      case 'unit_event':
        for (const u of presentNamed(units)) score.units += alignment(fx, u) * w.unit[fx.severity === 'extreme' ? 'major' : fx.severity];
        break;
      default: break;
    }
  }
  return score;
}

/** `a` is at least as good as `b` on every dimension (equal vectors included). */
export function dominates(a: Score, b: Score): boolean {
  return (Object.keys(a) as Array<keyof Score>).every((k) => a[k] >= b[k]);
}

/**
 * Rules 1–3 for a set of options: (1) every option has a gain and a loss on different keys; (2) for `major` and
 * `defining`, some option hurts a present squad member through her values; (3) no ungated option is at least as good as
 * another on every dimension (an option with `requires` or `check` is never the dominator).
 */
export function validateOptions(options: DilemmaOption[], scale: DilemmaScale, units: Unit[]): Rejection[] {
  const out: Rejection[] = [];
  options.forEach((o, i) => {
    const signs = o.effects.map((fx) => effectSign(fx, units));
    const ok = signs.some((p) => p.pos && signs.some((n) => n.neg && n.key !== p.key));
    if (!ok) out.push({ rule: 1, option: i, reason: `Option ${i + 1} needs a gain and a loss on different things.` });
  });
  if (scale !== 'minor') {
    const hurts = options.some((o) => o.effects.some((fx) => fx.type === 'unit_event' && effectSign(fx, units).neg));
    if (!hurts) out.push({ rule: 2, reason: 'No option hurts a squad member by what she values.' });
  }
  const scores = options.map((o) => scoreOption(o, units));
  options.forEach((a, i) => {
    if (a.requires || a.check) return;
    const beaten = options.findIndex((_, j) => j !== i && dominates(scores[i], scores[j]));
    if (beaten >= 0) out.push({ rule: 3, option: i, reason: `Option ${i + 1} is at least as good as option ${beaten + 1} everywhere.` });
  });
  return out;
}

/** Rule 5: a defining dilemma waits out the cooldown and happens at most once per spine beat. */
export function checkDefining(state: CampaignState, beatId: string): Rejection | null {
  const d = state.dilemmas;
  if (d?.lastDefiningDay !== undefined && state.day - d.lastDefiningDay < TUNING.dilemma.definingCooldownDays) {
    return { rule: 5, reason: `A defining decision was made ${state.day - d.lastDefiningDay} days ago: wait ${TUNING.dilemma.definingCooldownDays} days.` };
  }
  if (d?.definingBeats?.includes(beatId)) return { rule: 5, reason: 'This story beat already had its defining decision.' };
  return null;
}
