import type { Entry, Registries } from '../content/types';
import { createCampaign } from './state/create';
import {
  VALUE_AXES, type CampaignState, type LoyaltyBand, type Relation, type SignatureInstance, type Unit,
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
}

export interface SetupResult {
  commanderName: string;
  startId: string;
  crimeId: string;
  units: UnitSetup[];
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

const bandFor = (trust: number): LoyaltyBand => (trust < 10 ? 'breaking' : trust < 25 ? 'wavering' : 'steady');
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

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
  state.world.startId = start.id;
  state.settings = { desireBondDefects: opts.desireBondDefects };

  const crimeEffects = [...effectsOf(crime.perk), ...effectsOf(crime.flaw)];
  for (const fx of [...effectsOf(corp.startingBonus), ...crimeEffects]) {
    if (fx.type === 'social_rank') {
      const stat = fx.stat as keyof typeof state.commander.socialStats;
      state.commander.socialStats[stat] = Math.max(state.commander.socialStats[stat], fx.rank as number);
    } else if (fx.type === 'resource') {
      state.resources[fx.resource as keyof typeof state.resources] += fx.amount as number;
    }
  }
  const trustEffects = crimeEffects.filter((fx) => fx.type === 'starting_trust');
  const knowsCrime = crime.knownByDefault === true || start.crimeKnownByDefault === true;

  const used = new Set<string>();
  for (const u of r.units) {
    const base = `unit_${slug(u.displayName)}`;
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}_${n}`;
    used.add(id);

    const role = reg.roles.get(u.roleId) as Entry;
    const stats = role.baseStats as Unit['baseStats'];
    state.squad.push({
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
    });

    let trust = u.baseline.trust;
    for (const fx of trustEffects) {
      const iv = fx.ifValue as { axis: keyof Unit['values']; sign: '+' | '-' } | undefined;
      if (iv) {
        const v = u.values[iv.axis];
        if (iv.sign === '+' ? !(v > 0) : !(v < 0)) continue;
      }
      trust += fx.amount as number;
    }
    trust = clamp(trust, 0, 100);

    const relation: Relation = {
      trust,
      affinity: u.baseline.affinity,
      attraction: u.baseline.attraction,
      stateId: INITIAL_RELATION_STATE,
      stateSince: 1,
      history: [],
      flags: knowsCrime ? ['knows_crime'] : [],
      dailyGain: { trust: 0, affinity: 0, attraction: 0 },
      loyaltyBand: bandFor(trust),
      marks: [],
    };
    state.relations[id] = relation;
  }
  state.roster.activeIds = state.squad.map((u) => u.id);
  return { ok: true, state };
}
