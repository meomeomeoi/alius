import type { Registries } from '../../content/types';
import { TUNING } from '../tuning';
import type { Archetype, BodyStat, CampaignState, Commander } from '../state/types';

export type { Archetype, BodyStat };

/** P7: the commander's body, expression, seasoning and traits; everything the player sees is a descriptor. */
export const BODY_STATS: readonly BodyStat[] = Object.freeze(['strength', 'endurance', 'reflexes'] as const);

export type DescriptorKind = BodyStat | 'expression' | 'seasoning';

/** Index 0 = value 1. */
export const DESCRIPTORS: Record<DescriptorKind, readonly string[]> = Object.freeze({
  strength: Object.freeze(['Feeble', 'Slight', 'Average', 'Strong', 'Powerful']),
  endurance: Object.freeze(['Fragile', 'Delicate', 'Average', 'Hardy', 'Iron']),
  reflexes: Object.freeze(['Sluggish', 'Slow', 'Average', 'Quick', 'Lightning']),
  expression: Object.freeze(['Very feminine', 'Feminine', 'Androgynous', 'Masculine', 'Very masculine']),
  seasoning: Object.freeze(['Green', 'Young', 'Experienced', 'Seasoned', 'Veteran']),
});

/** The descriptor of a value 1–5 (out-of-range values are clamped). */
export function descriptor(kind: DescriptorKind, value: number): string {
  const list = DESCRIPTORS[kind];
  return list[Math.min(5, Math.max(1, Math.round(value))) - 1];
}

/** ≤4 frail, 5–6 slight, 7–9 average, 10–12 fit, ≥13 hardened. */
export function archetypeOf(body: Record<BodyStat, number>): Archetype {
  const sum = BODY_STATS.reduce((n, k) => n + body[k], 0);
  if (sum <= 4) return 'frail';
  if (sum <= 6) return 'slight';
  if (sum <= 9) return 'average';
  if (sum <= 12) return 'fit';
  return 'hardened';
}

export interface CommanderProfile {
  body: Record<BodyStat, number>;
  bodyXp: Record<BodyStat, number>;
  expression: number;
  seasoning: number;
  traits: { regular: string[]; special?: string };
  archetype: Archetype;
}

/** What a P7 save holds, or the defaults for anything a P0–P6 save lacks. The archetype is recomputed from the body. */
export function commanderProfile(state: CampaignState): CommanderProfile {
  const c = state.commander;
  const d = TUNING.commander.defaults;
  const body = { ...d.body, ...(c.body ?? {}) };
  const traits = c.traits ?? { regular: [] };
  return {
    body,
    bodyXp: { strength: 0, endurance: 0, reflexes: 0, ...(c.bodyXp ?? {}) },
    expression: c.expression ?? d.expression,
    seasoning: c.seasoning ?? d.seasoning,
    traits: { regular: [...traits.regular], ...(traits.special !== undefined ? { special: traits.special } : {}) },
    archetype: archetypeOf(body),
  };
}

/** The choices of the COMMANDER FILE step. */
export interface CommanderSetup {
  body: Record<BodyStat, number>;
  expression: number;
  seasoning: number;
  traits: { regular: string[]; special?: string };
}

export const defaultCommanderSetup = (): CommanderSetup => ({
  body: { ...TUNING.commander.defaults.body },
  expression: TUNING.commander.defaults.expression,
  seasoning: TUNING.commander.defaults.seasoning,
  traits: { regular: [] },
});

/** Points spent from the creation pool: every stat starts at 1. */
export const poolSpent = (body: Record<BodyStat, number>): number => BODY_STATS.reduce((n, k) => n + body[k], 0) - BODY_STATS.length;

const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

/**
 * One readable message per problem of a commander setup; an empty list means it can be applied. Unspent points are
 * allowed. Traits: known ids of the right kind, at most 2 regular (unique) and one special, no exclusive pair, and the
 * campaign settings a trait asks for.
 */
export function validateCommanderSetup(c: CommanderSetup, reg: Registries, opts: { desireBondDefects: boolean }): string[] {
  const out: string[] = [];
  if (typeof c !== 'object' || c === null) return ['The commander file is missing'];
  for (const k of BODY_STATS) {
    if (!isInt(c.body?.[k], 1, TUNING.commander.creationMax)) {
      out.push(`Commander ${k} must be a whole number from 1 to ${TUNING.commander.creationMax}`);
    }
  }
  if (BODY_STATS.every((k) => isInt(c.body?.[k], 1, TUNING.commander.creationMax)) && poolSpent(c.body) > TUNING.commander.pool) {
    out.push(`Commander body spends ${poolSpent(c.body)} points, the pool is ${TUNING.commander.pool}`);
  }
  if (!isInt(c.expression, 1, 5)) out.push('Commander expression must be a whole number from 1 to 5');
  if (!isInt(c.seasoning, 1, 5)) out.push('Commander seasoning must be a whole number from 1 to 5');

  const regular = c.traits?.regular;
  if (!Array.isArray(regular)) out.push('Commander traits are missing');
  else {
    if (regular.length > TUNING.commander.maxRegular) out.push(`At most ${TUNING.commander.maxRegular} regular traits (has ${regular.length})`);
    if (new Set(regular).size !== regular.length) out.push('A regular trait is chosen twice');
    const chosen: string[] = [];
    for (const id of regular) {
      const t = reg.commanderTraits.get(id);
      if (!t) out.push(`Unknown trait "${String(id)}"`);
      else if (t.kind !== 'regular') out.push(`"${id}" is not a regular trait`);
      chosen.push(id);
    }
    const special = c.traits.special;
    if (special !== undefined) {
      const t = reg.commanderTraits.get(special);
      if (!t) out.push(`Unknown trait "${String(special)}"`);
      else if (t.kind !== 'special') out.push(`"${special}" is not a special trait`);
      chosen.push(special);
    }
    const reported = new Set<string>();
    for (const id of chosen) {
      const t = reg.commanderTraits.get(id);
      if (!t) continue;
      for (const other of (t.exclusiveWith as string[] | undefined) ?? []) {
        const key = [id, other].sort().join('|');
        if (chosen.includes(other) && !reported.has(key)) {
          reported.add(key);
          out.push(`Traits "${[id, other].sort()[0]}" and "${[id, other].sort()[1]}" exclude each other`);
        }
      }
      const needs = t.requiresSettings as { desireBondDefects?: boolean } | undefined;
      if (needs?.desireBondDefects && !opts.desireBondDefects) out.push(`Trait "${id}" needs the Desire/Bond setting`);
    }
  }
  return out;
}

/** Writes a validated setup into the commander: fields, zeroed training XP and the archetype. */
export function applyCommanderSetup(commander: Commander, c: CommanderSetup): void {
  commander.body = { ...c.body };
  commander.bodyXp = { strength: 0, endurance: 0, reflexes: 0 };
  commander.expression = c.expression;
  commander.seasoning = c.seasoning;
  commander.traits = { regular: [...c.traits.regular], ...(c.traits.special !== undefined ? { special: c.traits.special } : {}) };
  commander.archetype = archetypeOf(c.body);
}

/** Days since the unit first knew the commander (`state.day − metDay`, never below 0); a missing `metDay` counts as day 1. */
export function daysKnown(state: CampaignState, unitId: string): number {
  return Math.max(0, state.day - (state.relations[unitId]?.metDay ?? 1));
}

/**
 * Multiplier on body training XP; trait effects join in P7 Task 11. `state` and `reg` are already in the signature so
 * the activity code does not change then.
 */
export function bodyGrowthMult(_state: CampaignState, _reg: Registries): number {
  return 1;
}

/**
 * Adds training XP to a body stat. A step costs `TUNING.commander.bodyXpSteps[value − 1]`; what is left over carries
 * into the next step, and a stat at 5 takes nothing. Recomputes the archetype. `gained` says whether the stat rose.
 */
export function addBodyXp(commander: Commander, stat: BodyStat, amount: number): { value: number; gained: boolean } {
  const body = (commander.body ??= { ...TUNING.commander.defaults.body });
  const xp = (commander.bodyXp ??= { strength: 0, endurance: 0, reflexes: 0 });
  const before = body[stat];
  if (before >= 5 || !(amount > 0)) return { value: before, gained: false };
  let pool = xp[stat] + amount;
  while (body[stat] < 5 && pool >= TUNING.commander.bodyXpSteps[body[stat] - 1]) {
    pool -= TUNING.commander.bodyXpSteps[body[stat] - 1];
    body[stat] += 1;
  }
  xp[stat] = body[stat] >= 5 ? 0 : pool;
  commander.archetype = archetypeOf(body);
  return { value: body[stat], gained: body[stat] > before };
}

/**
 * What the commander's build and experience add to an Authority talk-down chance: 0.03 per point of strength and of
 * seasoning above 3. Symmetric: a weak, green commander really is weaker here.
 */
export function intimidationBonus(state: CampaignState): number {
  const p = commanderProfile(state);
  return TUNING.commander.intimidatePerPoint * (p.body.strength - 3 + (p.seasoning - 3));
}
