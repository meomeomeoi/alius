import type { Entry, Registries } from '../content/types';
import { createCampaign } from './state/create';
import { TUNING } from './tuning';
import { ensureLeash } from './leash/weekly';
import { seedWorld } from './world/state';
import { initialLoyaltyBand } from './relations/bands';
import { defaultWorldOptions, validateWorldOptions } from './worldOptions';
import { applyFirstImpression } from './commander/presence';
import { applyFactionTraitEffects, applyStartTraitEffects, syncTraitSettings } from './commander/traits';
import { applyCommanderSetup, defaultCommanderSetup, validateCommanderSetup, type CommanderSetup } from './commander/profile';
import {
  VALUE_AXES, type CampaignState, type Relation, type SignatureInstance, type Unit,
} from './state/types';

export const SETUP_LIMITS = {
  maxUnits: 4, maxDefects: 2, likes: 6, dislikes: 6, triggers: 4, tagLength: 32,
  value: [-3, 3],
  baseline: { trust: [0, 40], affinity: [-20, 30], attraction: [0, 20] },
} as const;

/** Entry state of the P3 relationship graph. */
export const INITIAL_RELATION_STATE = 'stranger';

/** Lowercase, trim, collapse spaces, keep [a-z0-9 '_-], at most 32 characters; nothing left → null. */
export function normalizeTag(s: unknown): string | null {
  if (typeof s !== 'string') return null;
  const t = s
    .toLowerCase()
    .replace(/[^a-z0-9 '_-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, SETUP_LIMITS.tagLength)
    .trim();
  return t === '' ? null : t;
}

export interface UnitSetup {
  cardRef: string;
  displayName: string;
  roleId: string;
  signature: SignatureInstance;
  defects: Array<{ id: string; origin: string }>;
  values: Unit['values'];
  likes: string[];
  dislikes: string[];
  triggers: string[];
  baseline: { trust: number; affinity: number; attraction: number };
  /** P7: up to 3 ids of registry `tastes` (how the unit reads the commander's looks and build). */
  tastes?: string[];
}

export interface SetupResult {
  commanderName: string;
  startId: string;
  crimeId: string;
  units: UnitSetup[];
  /** P7: the COMMANDER FILE; absent = the defaults (3/3/2, expression 3, seasoning 3, no traits). */
  commander?: CommanderSetup;
  /** P8: the world the player set up; absent = every default. */
  world?: { options: Record<string, string> };
}

interface Effect { type?: unknown; [k: string]: unknown }
const effectsOf = (part: unknown): Effect[] => {
  const list = (part as { effects?: unknown } | undefined)?.effects;
  return Array.isArray(list) ? (list.filter((e) => typeof e === 'object' && e !== null) as Effect[]) : [];
};

const inRange = (n: unknown, [lo, hi]: readonly [number, number]): n is number =>
  typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

function validateUnit(
  u: UnitSetup, label: string, reg: Registries, opts: { desireBondDefects: boolean }, out: string[],
  withBaseline = true,
): void {
  if (typeof u.displayName !== 'string' || u.displayName.trim() === '') out.push(`${label}: display name is empty`);
  if (!reg.roles.has(u.roleId)) out.push(`${label}: unknown role "${u.roleId}"`);
  if (!reg.signatures.has(u.signature?.templateId)) {
    out.push(`${label}: unknown signature template "${u.signature?.templateId}"`);
  }

  const sig = u.signature;
  if (typeof sig?.name !== 'string' || sig.name.trim() === '' || sig.name.length > 40) {
    out.push(`${label}: signature skill name must be 1 to 40 characters`);
  }
  if (typeof sig?.description !== 'string' || sig.description.trim() === '' || sig.description.length > 240) {
    out.push(`${label}: signature skill description must be 1 to 240 characters`);
  }

  const defects = u.defects ?? [];
  if (defects.length < 1 || defects.length > SETUP_LIMITS.maxDefects) {
    out.push(`${label}: needs 1 to ${SETUP_LIMITS.maxDefects} defects (has ${defects.length})`);
  }
  const seen = new Set<string>();
  for (const d of defects) {
    const def = reg.defects.get(d.id);
    if (!def) out.push(`${label}: unknown defect "${d.id}"`);
    else if (def.category === 'desire_bond' && !opts.desireBondDefects) {
      out.push(`${label}: defect "${d.id}" is a Desire/Bond defect and that setting is off`);
    }
    if (seen.has(d.id)) out.push(`${label}: defect "${d.id}" is chosen twice`);
    seen.add(d.id);
  }

  for (const axis of VALUE_AXES) {
    if (!inRange(u.values?.[axis], SETUP_LIMITS.value)) {
      out.push(`${label}: value "${axis}" must be an integer from -3 to 3`);
    }
  }

  if (u.tastes !== undefined) {
    if (!Array.isArray(u.tastes)) out.push(`${label}: tastes must be a list`);
    else {
      if (u.tastes.length > TUNING.commander.maxTastes) out.push(`${label}: at most ${TUNING.commander.maxTastes} tastes (has ${u.tastes.length})`);
      const seenTastes = new Set<string>();
      for (const t of u.tastes) {
        if (!reg.tastes.has(t)) out.push(`${label}: unknown taste "${String(t)}"`);
        if (seenTastes.has(t)) out.push(`${label}: taste "${String(t)}" is chosen twice`);
        seenTastes.add(t);
      }
    }
  }

  const tagCaps = { likes: SETUP_LIMITS.likes, dislikes: SETUP_LIMITS.dislikes, triggers: SETUP_LIMITS.triggers } as const;
  for (const [field, cap] of Object.entries(tagCaps) as Array<[keyof typeof tagCaps, number]>) {
    const tags = u[field] ?? [];
    if (tags.length > cap) out.push(`${label}: at most ${cap} ${field} (has ${tags.length})`);
    for (const t of tags) {
      if (normalizeTag(t) !== t) out.push(`${label}: ${field} entry "${t}" is not a normalized tag`);
    }
  }

  for (const [axis, range] of withBaseline
    ? (Object.entries(SETUP_LIMITS.baseline) as Array<[keyof UnitSetup['baseline'], readonly [number, number]]>)
    : []) {
    if (!inRange(u.baseline?.[axis], range)) {
      out.push(`${label}: baseline ${axis} must be an integer from ${range[0]} to ${range[1]}`);
    }
  }
}

/** The per-unit rules of `validateSetup`, minus the baseline (re-sync never touches relationship axes). */
export function validateUnitProfile(
  u: Omit<UnitSetup, 'baseline'>, label: string, reg: Registries, opts: { desireBondDefects: boolean },
): string[] {
  const out: string[] = [];
  validateUnit(u as UnitSetup, label, reg, opts, out, false);
  return out;
}

/** One readable message per problem; an empty list means the setup can be built. */
export function validateSetup(r: SetupResult, reg: Registries, opts: { desireBondDefects: boolean }): string[] {
  const out: string[] = [];
  const name = typeof r.commanderName === 'string' ? r.commanderName.trim() : '';
  if (name === '' || name.length > 60) out.push('Commander name must be 1 to 60 characters');

  const start = reg.starts.get(r.startId);
  if (!start) out.push(`Unknown start "${r.startId}"`);
  else {
    const corp = reg.corporations.get(String(start.corporationId));
    if (!corp) out.push(`Start "${r.startId}" uses unknown corporation "${String(start.corporationId)}"`);
    else if (corp.playable !== true) out.push(`Start "${r.startId}" uses non-playable corporation "${corp.id}"`);
  }
  if (!reg.crimes.has(r.crimeId)) out.push(`Unknown crime "${r.crimeId}"`);
  if (r.commander !== undefined) out.push(...validateCommanderSetup(r.commander, reg, opts));
  if (r.world !== undefined) out.push(...validateWorldOptions(r.world.options, reg));

  const units = r.units ?? [];
  if (units.length > SETUP_LIMITS.maxUnits) out.push(`At most ${SETUP_LIMITS.maxUnits} units (has ${units.length})`);
  const cards = new Set<string>();
  units.forEach((u, i) => {
    if (cards.has(u.cardRef)) out.push(`Card "${u.cardRef}" is selected twice`);
    cards.add(u.cardRef);
    validateUnit(u, `Unit ${i + 1} (${u.displayName})`, reg, opts, out);
  });
  return out;
}

const slug = (name: string): string => {
  const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return s === '' ? 'unit' : s;
};

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Perk and flaw effects of a crime. */
export const crimeEffectsOf = (crime: Entry): Effect[] => [...effectsOf(crime.perk), ...effectsOf(crime.flaw)];

/** Whether every unit starts with `knows_crime` (the crime or the start says so). */
export const crimeKnownByDefault = (crime: Entry, start: Entry | undefined): boolean =>
  crime.knownByDefault === true || start?.crimeKnownByDefault === true;

/** Sum of the crime's `starting_trust` effects that apply to a unit with these values. */
export function startingTrustAdjust(effects: Effect[], values: Unit['values']): number {
  let sum = 0;
  for (const fx of effects) {
    if (fx.type !== 'starting_trust') continue;
    const iv = fx.ifValue as { axis: keyof Unit['values']; sign: '+' | '-' } | undefined;
    if (iv) {
      const v = values[iv.axis];
      if (iv.sign === '+' ? !(v > 0) : !(v < 0)) continue;
    }
    sum += fx.amount as number;
  }
  return sum;
}

/** A fresh relation in the entry state of the relationship graph; trust decides the loyalty band. */
export function initialRelation(o: { trust: number; affinity: number; attraction: number; knowsCrime: boolean; since?: number }): Relation {
  const trust = clamp(o.trust, 0, 100);
  return {
    trust,
    affinity: o.affinity,
    attraction: o.attraction,
    stateId: INITIAL_RELATION_STATE,
    stateSince: o.since ?? 1,
    history: [],
    flags: o.knowsCrime ? ['knows_crime'] : [],
    dailyGain: { trust: 0, affinity: 0, attraction: 0 },
    loyaltyBand: initialLoyaltyBand(trust),
    marks: [],
    metDay: o.since ?? 1,
  };
}

/**
 * A fresh named unit at level 1 from a validated profile. Its id follows the `unit_<slug>` rule and is made unique
 * against `usedIds`, which this call extends. Relationship data is the caller's business.
 */
export function makeNamedUnit(u: UnitSetup, reg: Registries, usedIds: Set<string>): Unit {
  const base = `unit_${slug(u.displayName)}`;
  let id = base;
  for (let n = 2; usedIds.has(id); n++) id = `${base}_${n}`;
  usedIds.add(id);
  const stats = (reg.roles.get(u.roleId) as Entry).baseStats as Unit['baseStats'];
  return {
    id,
    kind: 'named',
    cardRef: u.cardRef,
    displayName: u.displayName,
    roleId: u.roleId,
    level: 1,
    xp: 0,
    skillPoints: 0,
    unlockedNodes: [],
    signatureSkill: { ...u.signature },
    baseStats: { ...stats },
    currentHp: stats.hp,
    stress: 0,
    defects: u.defects.map((d) => ({ id: d.id, origin: d.origin })),
    values: { ...u.values },
    likes: [...u.likes],
    dislikes: [...u.dislikes],
    triggers: [...u.triggers],
    equipment: {},
    injuries: [],
    status: 'active',
    ...(u.tastes && u.tastes.length > 0 ? { commanderTastes: [...u.tastes] } : {}),
  };
}

/** Every problem of a unit joining a running campaign: the profile rules and the baseline ranges of `validateSetup`. */
export function validateIncomingUnit(u: UnitSetup, reg: Registries, opts: { desireBondDefects: boolean }): string[] {
  const out: string[] = [];
  if (typeof u?.cardRef !== 'string' || u.cardRef.trim() === '') out.push('The unit has no character card');
  validateUnit(u, `Unit (${String(u?.displayName)})`, reg, opts, out);
  return out;
}

export function buildCampaign(
  r: SetupResult, reg: Registries, opts: { desireBondDefects: boolean; seed: number },
): { ok: true; state: CampaignState } | { ok: false; errors: string[] } {
  const errors = validateSetup(r, reg, opts);
  if (errors.length > 0) return { ok: false, errors };

  const start = reg.starts.get(r.startId) as Entry;
  const corp = reg.corporations.get(String(start.corporationId)) as Entry;
  const crime = reg.crimes.get(r.crimeId) as Entry;

  const state = createCampaign({ seed: opts.seed, commanderName: r.commanderName.trim() });
  state.commander.corporationId = corp.id;
  state.commander.crimeId = crime.id;
  state.commander.socialStats = { authority: 1, insight: 1, empathy: 1, cunning: 1 };
  // P7: the commander's body is in place before any unit joins.
  applyCommanderSetup(state.commander, r.commander ?? defaultCommanderSetup());
  state.commander.fileReviewed = true;
  state.world.startId = start.id;
  // P8: every option is stored (missing keys take their default) before anything reads them; they are fixed from here on
  state.world.options = { ...defaultWorldOptions(reg), ...(r.world?.options ?? {}) };
  state.settings = { desireBondDefects: opts.desireBondDefects };

  const base = start.startingResources as Partial<Record<keyof CampaignState['resources'], number>> | undefined;
  for (const k of ['credits', 'supplies', 'plyx'] as const) state.resources[k] += base?.[k] ?? 0;

  const crimeEffects = crimeEffectsOf(crime);
  for (const fx of [...effectsOf(corp.startingBonus), ...crimeEffects]) {
    if (fx.type === 'social_rank') {
      const stat = fx.stat as keyof typeof state.commander.socialStats;
      state.commander.socialStats[stat] = Math.max(state.commander.socialStats[stat], fx.rank as number);
    } else if (fx.type === 'resource') {
      state.resources[fx.resource as keyof typeof state.resources] += fx.amount as number;
    }
  }
  applyStartTraitEffects(state, reg); // P7: before any unit joins, so presence sees them
  syncTraitSettings(state, reg);
  const knowsCrime = crimeKnownByDefault(crime, start);

  const used = new Set<string>();
  for (const u of r.units) {
    const unit = makeNamedUnit(u, reg, used);
    const id = unit.id;
    state.squad.push(unit);

    state.relations[id] = initialRelation({
      trust: u.baseline.trust + startingTrustAdjust(crimeEffects, u.values),
      affinity: u.baseline.affinity,
      attraction: u.baseline.attraction,
      knowsCrime,
    });
    applyFirstImpression(state, reg, unit, state.relations[id]);
  }
  state.roster.activeIds = state.squad.map((u) => u.id);
  seedWorld(state, reg);
  applyFactionTraitEffects(state, reg); // after the seed: it keeps a standing that is already set
  ensureLeash(state, reg);
  return { ok: true, state };
}
