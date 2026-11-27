import { z } from 'zod';
import { EFFECT_TARGETS, STATS, TRIGGERS, ALWAYS_ON_TYPES } from '../engine/combat/types';
import { ALL_EVENT_TYPES, EVENT_TYPES, PROPOSAL_KINDS, SEVERITIES, WORLD_EFFECT_EVENT_TYPES } from '../engine/relations/vocab';
import { DEED_COUNTERS, RARITIES } from '../engine/state/types';
import { BALLOT_TERMS, OUTSIDE_TRIGGERS, VALUE_AXES, VOTE_KINDS } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import { EXPECTATION_KINDS } from '../engine/warden/state';
import { DILEMMA_CONTEXTS } from '../engine/dilemma/types';
import {
  ANCHOR_KINDS, ATTENTIONS, CONTACT_DIRS, CUE_KINDS, ESCALATION_ORDER, GAUGE_KINDS, INTERACTIONS, LIVE_KINDS, PAIR_TAGS, RESPONSE_TYPES, SCOPES, SEALS, STAGES, STIMULUS_FAMILIES, WORN_SLOTS,
} from '../engine/blocking/types';
import { LIFE_CATEGORIES, LIFE_MOODS, LIFE_SHARES, LIFE_SIZES, TALK_LEVELS, TOPIC_GROUPS, TRACE_KINDS } from '../engine/life/types';
import {
  AFTERMATH_DEMAND_KINDS, AFTERMATH_KINDS, CAPABILITIES, CLAIM_FORMS, DRAWN_BY, DYNAMIC_EVENT_TYPES, MANNER_AXES, MILESTONE_OFFERS, MOTIVES, OUTSIDE_REACH, PROFILE_STYLES, REFUSAL_COSTS,
  REGARD_SPEEDS, REGION_RANKS, SIGN_KINDS, SURFACE_CONDITIONS,
} from '../engine/dynamic/types';
import { FRAMES } from '../engine/blocking/state';
import { CONTACT_FACES, HER_LEGS, OCCLUSION_KINDS, OCCLUSION_VIEWS } from '../engine/physics/occlusion';
import { CRAFT_EVENT_TYPES } from '../engine/craft/state';
import { CEREMONY_CHECKS, CHECK_KINDS, EFFECT_NEEDS, PRACTICE_EVENT_TYPES, PRACTICE_KINDS, PROOFS, SEED_AUDIENCE, STAKES } from '../engine/practice/state';
import type { WorldEffect } from '../engine/world/types';
import { REGISTRY_NAMES, type RegistryName } from './types';
import { stripLinks } from './links';

export const ID_PATTERN = /^[a-z0-9_:.-]+$/;

/** Checked on every raw entry before `extends` is resolved (so partial entries pass). */
export const BaseEntrySchema = z
  .object({
    id: z.string().regex(ID_PATTERN, 'id must match ^[a-z0-9_:.-]+$'),
    extends: z.string().optional(),
  })
  .passthrough();

export const FlagSchema = BaseEntrySchema.extend({
  scope: z.enum(['world', 'commander', 'relation']),
  description: z.string().min(1),
  mutuallyExclusiveWith: z.array(z.string()).optional(),
  setBy: z.array(z.string()).optional(),
  /** P9: a relation flag that is something the unit holds over the commander (a secret): +5 Impunity each, whoever else does not know. */
  leverage: z.boolean().optional(),
});

/** Checked on the resolved (merged) entry. Later packages replace the base schemas below. */
export const registrySchemas: Record<RegistryName, z.ZodTypeAny> = Object.fromEntries(
  REGISTRY_NAMES.map((n) => [n, BaseEntrySchema]),
) as unknown as Record<RegistryName, z.ZodTypeAny>;
registrySchemas.flags = FlagSchema;

// ---------------------------------------------------------------------------------------------
// P1 registries (setup content). Effects are validated only for the three start-time types; every
// other `type` belongs to a later package and passes through unchanged.

const str = z.string().min(1);
const int = z.number().int();

/** P14b: how a soldier reads an event (the registry's own reading for an engine-made event, or for an activity or a dilemma). */
export const ReadingSchema = z.object({
  wanted: z.enum(['yes', 'no', 'unclear']),
  initiator: z.enum(['target', 'actor', 'mutual']),
  harm: z.enum(['none', 'minor', 'serious']),
  outcome: z.enum(['good', 'mixed', 'bad']),
}).strict();

const valueAxis = z.enum(VALUE_AXES);
/** P9b: how a decision leans on each value axis, −2…2 (absent axis = 0). A ballot adds `Σ value × lean`. */
export const VoteLeanSchema = z.object(
  Object.fromEntries(VALUE_AXES.map((a) => [a, z.number().min(-2).max(2).optional()])) as Record<(typeof VALUE_AXES)[number], z.ZodOptional<z.ZodNumber>>,
).strict();
export type VoteLean = z.infer<typeof VoteLeanSchema>;
/** P9d: content categories (registry `contentCategories`) this entry belongs to; checked against the registry and the gated registries at load. */
const contentTags = z.array(z.string().min(1)).optional();

export const ValuesSchema = z.object(
  Object.fromEntries(VALUE_AXES.map((a) => [a, int.min(-3).max(3)])) as Record<
    (typeof VALUE_AXES)[number],
    z.ZodNumber
  >,
);

const SocialRankEffect = z.object({
  stat: z.enum(['authority', 'insight', 'empathy', 'cunning']),
  rank: int.min(1).max(5),
});
const ResourceEffect = z.object({ resource: z.enum(['credits', 'supplies', 'plyx']), amount: int });
const StartingTrustEffect = z.object({
  amount: int.min(-40).max(40),
  ifValue: z.object({ axis: valueAxis, sign: z.enum(['+', '-']) }).optional(),
});
const startTimeEffects: Record<string, z.ZodTypeAny> = {
  social_rank: SocialRankEffect,
  resource: ResourceEffect,
  starting_trust: StartingTrustEffect,
};

export const EffectSchema = z
  .object({ type: str })
  .passthrough()
  .superRefine((fx, ctx) => {
    const schema = startTimeEffects[fx.type];
    if (!schema) return;
    const parsed = schema.safeParse(fx);
    if (parsed.success) return;
    for (const issue of parsed.error.issues) ctx.addIssue({ ...issue });
  });
export type Effect = z.infer<typeof EffectSchema>;

const textWithEffects = z.object({ text: str, effects: z.array(EffectSchema) });

// ---------------------------------------------------------------------------------------------
// P5: the world-effect vocabulary (every consequence outside combat is one of these).

const worldInt = z.number().int();
const WorldEffectUnion = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resource'), resource: z.enum(['credits', 'supplies', 'plyx']), amount: worldInt }).strict(),
  z.object({ type: z.literal('carried_supplies'), amount: worldInt }).strict(),
  z.object({ type: z.literal('faction'), factionId: str, amount: worldInt.min(-30).max(30) }).strict(),
  z.object({ type: z.literal('clock'), clockId: str, by: worldInt.min(-2).max(2).refine((n) => n !== 0, 'by must not be 0') }).strict(),
  z.object({ type: z.literal('flag'), flagId: str }).strict(),
  z.object({ type: z.literal('clearance'), tier: z.union([z.literal(1), z.literal(2), z.literal(3)]) }).strict(),
  z.object({ type: z.literal('party_stress'), amount: worldInt }).strict(),
  z.object({ type: z.literal('party_hp'), pct: worldInt.min(-90).max(100) }).strict(),
  z.object({ type: z.literal('loot'), tableId: str, rolls: worldInt.min(1).max(3).optional() }).strict(),
  z.object({ type: z.literal('leash'), amount: z.union([z.literal(-1), z.literal(1)]) }).strict(),
  z.object({ type: z.literal('thread'), threadId: str, status: z.enum(['open', 'resolved', 'failed', 'dormant']) }).strict(),
  z.object({
    type: z.literal('unit_event'),
    event: z.enum(WORLD_EFFECT_EVENT_TYPES),
    severity: z.enum(['minor', 'moderate', 'major', 'extreme']),
    /** P9b: `subject` and `witnesses` only inside a `scapegoat` dilemma (the unit who answers for it, the others who backed it). */
    targets: z.enum(['party', 'named', 'subject', 'witnesses']),
    valueAxes: z.array(z.object({ axis: z.enum(VALUE_AXES), direction: z.union([z.literal(-1), z.literal(1)]) }).strict()).optional(),
  }).strict(),
  /** P9b: oversight confines the scapegoat's subject for a few days and strains her; no Impunity record, not a punishment of the commander's. */
  z.object({ type: z.literal('oversight_punish'), days: worldInt.min(1).max(3), stress: worldInt.min(0).max(20) }).strict(),
  z.object({ type: z.literal('incoming_unit') }).strict(),
  z.object({ type: z.literal('fact'), text: str.max(200), tags: z.array(str), importance: worldInt.min(1).max(5) }).strict(),
  z.object({
    type: z.literal('offer_mission'), templateId: str, regionId: str.optional(), source: z.enum(['command', 'story', 'rumor', 'side']),
  }).strict(),
  // P6: a dynamic flag in the namespace of the thread it belongs to (overview §6.1)
  z.object({ type: z.literal('stigma_news'), amount: worldInt.min(1).max(30) }).strict(),
  z.object({ type: z.literal('thread_flag'), threadId: str, flagId: z.string().regex(/^thread:[^:]+:[a-z0-9_]+$/, 'flagId must be thread:<threadId>:<slug>'), description: str.max(120) }).strict(),
  // P9c: the squad keeps something from the commander (a `secretKinds` entry; `party` = who is on the run, `squad` = every named unit)
  z.object({ type: z.literal('squad_secret'), kindId: str, knownBy: z.enum(['party', 'squad']) }).strict(),
]);

export const WorldEffectSchema = WorldEffectUnion.superRefine((fx, ctx) => {
  if (fx.type === 'thread_flag' && !fx.flagId.startsWith(`thread:${fx.threadId}:`)) {
    ctx.addIssue({ code: 'custom', path: ['flagId'], message: `flagId must be in the namespace of thread "${fx.threadId}"` });
  }
});

const COST_EVENTS: readonly string[] = ['sided_against', 'decision_violated', 'endangered', 'coerced', 'dismissed'];
/** True when the effect costs the player something (a minor event option must contain at least one). */
export function isCostEffect(e: WorldEffect): boolean {
  switch (e.type) {
    case 'resource': case 'carried_supplies': case 'faction': return e.amount < 0;
    case 'party_hp': return e.pct < 0;
    case 'leash': return e.amount < 0;
    case 'party_stress': return e.amount > 0;
    case 'stigma_news': case 'oversight_punish': return true;
    case 'clock': return e.by > 0;
    case 'unit_event': return COST_EVENTS.includes(e.event);
    default: return false;
  }
}

const SpineBeatSchema = z.object({
  id: str,
  title: str,
  goal: str,
  /** P5: when the director may propose the beat. */
  conditions: z.object({
    minDay: worldInt.min(1).optional(),
    flagsAll: z.array(str).optional(),
    flagsNone: z.array(str).optional(),
    clearanceMin: worldInt.min(1).max(3).optional(),
    threads: z.array(z.object({ id: str, status: z.enum(['open', 'resolved', 'failed', 'dormant']) }).strict()).optional(),
  }).strict().optional(),
  /** When the beat counts as done (default `auto`: as soon as it is proposed). */
  completion: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('auto') }).strict(),
    z.object({ kind: z.literal('mission'), templateId: str, regionId: str }).strict(),
    z.object({ kind: z.literal('flag'), anyOf: z.array(str).min(1) }).strict(),
  ]).optional(),
  onComplete: z.array(WorldEffectSchema).optional(),
});

export const CorporationSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  values: ValuesSchema,
  oversightStyle: str,
  playable: z.boolean(),
  startingBonus: textWithEffects,
  startingRegionId: str.optional(),
  /** P6: oversight numbers: authorizations per week and the Terminate approval base chance. */
  leash: z.object({ weekly: int.min(0).max(5), approval: z.number().min(0).max(1) }).strict(),
});

export const StartSchema = BaseEntrySchema.extend({
  name: str,
  corporationId: str,
  summary: str,
  situation: str,
  spine: z.array(SpineBeatSchema).min(5).max(8),
  crimeKnownByDefault: z.boolean().optional(),
  /** Base amounts the campaign begins with; corporation and crime effects are added on top (P2). */
  startingResources: z
    .object({ credits: int.min(0).optional(), supplies: int.min(0).optional(), plyx: int.min(0).optional() })
    .strict()
    .optional(),
});

export const CrimeSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  perk: textWithEffects,
  flaw: textWithEffects,
  valueReactions: z.array(z.object({ axis: valueAxis, sign: z.enum(['+', '-']), weight: int.min(-3).max(3) })),
  knownByDefault: z.boolean(),
  /** P9: `false` = knowing this crime gives a unit no leverage (default: it is damaging). */
  damaging: z.boolean().optional(),
});


// ---------------------------------------------------------------------------------------------
// P4: the combat effect vocabulary (see `engine/combat/types.ts`) and the schemas built on it.

const num = z.number();
const rowEnum = z.enum(['front', 'back']);

export const ConditionSchema = z.object({
  hpBelowPct: num.optional(), hpAbovePct: num.optional(), stressMin: num.optional(), stressMax: num.optional(),
  roundMin: num.optional(), targetHasStatus: str.optional(), selfHasStatus: str.optional(),
  aloneInRow: z.boolean().optional(), sameRowAndSkill: z.boolean().optional(), rowChanged: z.boolean().optional(),
  commanderExposed: z.boolean().optional(), notOrderedThisRound: z.boolean().optional(),
  orderedThisRound: z.boolean().optional(), commanderBuildIn: z.array(str).min(1).optional(),
  upkeepWithinDays: num.optional(), upkeepOlderThanDays: num.optional(),
}).strict();

const ScaleSchema = z.object({
  by: z.enum(['stress_above', 'own_hp_missing_pct', 'allies_hp_missing_pct']), per: num, base: num.optional(),
}).strict();

const effectCommon = {
  trigger: z.enum(TRIGGERS).optional(),
  scope: z.enum(['self', 'ally']).optional(),
  threshold: z.union([z.literal(50), z.literal(80), z.literal(100)]).optional(),
  target: z.enum(EFFECT_TARGETS).optional(),
  when: ConditionSchema.optional(),
  chance: num.min(0).max(1).optional(),
  downside: z.boolean().optional(),
  limit: z.enum(['round', 'combat']).optional(),
};
const fx = <T extends string, S extends z.ZodRawShape>(type: T, shape: S) =>
  z.object({ type: z.literal(type), ...effectCommon, ...shape }).strict();
const statEnum = z.enum(STATS);

const EffectUnion = z.discriminatedUnion('type', [
  fx('damage', { mult: num.positive().optional(), pctMaxHp: num.positive().optional(), hits: int.min(1).optional(), ignoreRows: z.boolean().optional(), critBonus: num.optional(), scale: ScaleSchema.optional() }),
  fx('heal', { pctMaxHp: num.positive() }),
  fx('revive', { pctMaxHp: num.positive() }),
  fx('status', { statusId: str, turns: int.min(1).optional(), stacks: int.min(1).optional() }),
  fx('cleanse', { kind: z.enum(['buff', 'debuff']), count: int.min(1) }),
  fx('stat', { stat: z.union([statEnum, z.literal('all')]), pct: num, turns: int.min(1).optional(), scale: ScaleSchema.optional() }),
  fx('outgoing', { pct: num, vs: z.enum(['any', 'marked', 'locked', 'heal']).optional(), scale: ScaleSchema.optional() }),
  fx('incoming', { pct: num }),
  fx('stress', { amount: num }),
  fx('stress_taken', { pct: num, direction: z.enum(['gain', 'relief']) }),
  fx('cp', { amount: int }),
  fx('move', { to: z.enum(['front', 'back', 'swap']) }),
  fx('extra_action', {}),
  fx('redirect', { pct: num.min(0).max(100), turns: int.min(1), from: z.enum(['ally', 'commander']) }),
  fx('intercept_lethal', { protect: z.enum(['commander', 'ally']) }),
  fx('summon', { enemyId: str, max: int.min(1) }),
  fx('follow_up', { mult: num.positive() }),
  fx('misfire', {}),
  fx('override_action', { policy: z.literal('aggressive') }),
  fx('lock_target', { turns: int.min(1) }),
  fx('loot_roll', { extra: int.min(1) }),
  fx('repeat_order', {}),
  fx('contingency', {}),
  fx('hp_set', { value: int.min(1) }),
  fx('immune', { statusId: str }),
  fx('order_cost', { delta: int, orders: z.array(str).optional() }),
  fx('order_refusal', { orders: z.array(str).optional() }),
  fx('loadout_slots', { amount: int.min(1) }),
  fx('injury_days', { pct: num }),
]);

/** One combat effect: strict per type, with the cross-field rules of the vocabulary. */
export const CombatEffectSchema = EffectUnion.superRefine((e, ctx) => {
  const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
  if (e.threshold !== undefined && e.trigger !== 'onStressThreshold') issue('threshold', 'threshold needs trigger onStressThreshold');
  if (e.trigger === 'onStressThreshold' && e.threshold === undefined) issue('threshold', 'onStressThreshold needs a threshold (50, 80 or 100)');
  if (e.scope === 'ally' && !(e.trigger === 'onHit' || e.trigger === 'onCrit' || e.trigger === 'onKill')) {
    issue('scope', 'scope "ally" is only valid with onHit, onCrit or onKill');
  }
  if ((e.type === 'misfire' || e.type === 'order_refusal') && e.chance === undefined) issue('chance', `${e.type} needs a chance`);
  if (e.type === 'damage' && (e.mult === undefined) === (e.pctMaxHp === undefined)) issue('mult', 'damage needs exactly one of mult and pctMaxHp');
});
export type CombatEffect = z.infer<typeof CombatEffectSchema>;
const effects = z.array(CombatEffectSchema);

export const SKILL_KINDS = ['active', 'passive', 'ultimate', 'enemy', 'signature'] as const;
export const AI_PROFILES = ['aggressive', 'predator', 'protector', 'disruptor', 'stressor', 'erratic'] as const;
const aiProfile = z.enum(AI_PROFILES);
const aiProfileForRoles = z.enum(['aggressive', 'predator', 'protector', 'disruptor']);

export const SkillSchema = BaseEntrySchema.extend({
  name: str,
  kind: z.enum(SKILL_KINDS),
  description: str,
  /** Passives carry no use rules; every other kind needs `cooldown`, `usableFrom` and `targets`. */
  cooldown: int.min(0).optional(),
  cp: int.min(0).optional(),
  stressCost: int.min(0).optional(),
  usableFrom: z.array(rowEnum).min(1).optional(),
  targets: z.object({
    side: z.enum(['enemy', 'ally', 'self']),
    rows: z.array(rowEnum),
    count: z.enum(['one', 'row', 'all']),
    melee: z.boolean().optional(),
  }).strict().optional(),
  effects: effects.min(1),
  tags: z.array(str),
}).superRefine((s, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (s.kind === 'passive') {
    s.effects.forEach((e, i) => {
      if (e.trigger === undefined && !ALWAYS_ON_TYPES.includes(e.type)) {
        issue(['effects', i, 'trigger'], `a passive "${e.type}" effect needs a trigger`);
      }
    });
    return;
  }
  if (s.cooldown === undefined) issue(['cooldown'], 'cooldown is required');
  if (s.usableFrom === undefined) issue(['usableFrom'], 'usableFrom is required');
  if (s.targets === undefined) issue(['targets'], 'targets is required');
});
export type Skill = z.infer<typeof SkillSchema>;

const statsShape = { hp: num, atk: num, def: num, spd: num, crit: num };
const PartialStatsSchema = z.object({
  hp: num.optional(), atk: num.optional(), def: num.optional(), spd: num.optional(), crit: num.optional(),
}).strict();
const GrowthSchema = z.object(statsShape).strict();

export const TreeNodeSchema = z.object({
  id: z.string().regex(ID_PATTERN),
  branch: z.union([z.literal(0), z.literal(1), z.literal(2), z.null()]),
  tier: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.null()]),
  cost: int.min(1),
  requires: z.array(str),
  grants: z.union([
    z.object({ skill: str }).strict(),
    z.object({
      upgrade: z.object({
        skillId: str,
        cooldownDelta: int.optional(),
        multPct: num.optional(),
        addEffects: effects.optional(),
      }).strict(),
    }).strict(),
  ]),
}).strict();
export type TreeNode = z.infer<typeof TreeNodeSchema>;

export const RoleSchema = BaseEntrySchema.extend({
  name: str,
  row: z.enum(['front', 'back', 'either']),
  baseStats: z.object({
    hp: int.min(1), atk: int.min(1), def: int.min(1), spd: int.min(1), crit: int.min(0).max(100),
  }),
  weaponClasses: z.array(str).min(1),
  armorWeights: z.array(z.enum(['light', 'medium', 'heavy'])).min(1),
  identity: str,
  /** One line, used in prompts. */
  summary: str,
  /** P13: a role with the know-how to work on the controller implant (read by this field, never by id). */
  tech: z.boolean().optional(),
  branches: z.array(z.object({ name: str, summary: str })),
  // P4
  growth: GrowthSchema,
  aiProfile: aiProfileForRoles,
  starterSkills: z.array(str).length(2),
  tree: z.array(TreeNodeSchema),
}).superRefine((r, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (r.tree.length !== 16) issue(['tree'], `a tree has exactly 16 nodes, this one has ${r.tree.length}`);
  const ultimates = r.tree.filter((n) => n.branch === null);
  if (ultimates.length !== 1) issue(['tree'], `a tree has exactly one ultimate node (branch null), this one has ${ultimates.length}`);
  const ids = new Set<string>();
  const slots = new Set<string>();
  r.tree.forEach((n, i) => {
    if (ids.has(n.id)) issue(['tree', i, 'id'], `duplicate node id "${n.id}"`);
    ids.add(n.id);
    if ((n.branch === null) !== (n.tier === null)) issue(['tree', i], 'branch and tier are both null (ultimate) or both set');
    if (n.branch !== null) {
      const key = `${n.branch}/${n.tier}`;
      if (slots.has(key)) issue(['tree', i], `branch ${n.branch} already has a tier ${n.tier} node`);
      slots.add(key);
    }
  });
  r.tree.forEach((n, i) => n.requires.forEach((req, j) => {
    if (!ids.has(req)) issue(['tree', i, 'requires', j], `requires "${req}", which is not a node of this role`);
    if (req === n.id) issue(['tree', i, 'requires', j], 'a node cannot require itself');
  }));
});

export const SignatureSchema = BaseEntrySchema.extend({
  id: z.string().regex(/^sig_[a-z0-9_:.-]*$/, 'signature id must start with sig_'),
  name: str,
  mechanic: str,
  fits: str,
  /** P4: the `skills` entry that implements the template (by convention the same id). */
  skill: str,
});

// `DefectSchema` is defined after the P3 pieces below it depends on.

export const StatusSchema = BaseEntrySchema.extend({
  name: str,
  kind: z.enum(['buff', 'debuff']),
  description: str,
  // P4 mechanics
  turns: int.min(1),
  maxStacks: int.min(1),
  stackMode: z.enum(['add', 'refresh']),
  /** Effects run at the owner's turn start, once per stack; `target: 'self'` is the owner. */
  tick: z.array(CombatEffectSchema).optional(),
  /** Stat multipliers per stack, in percent. */
  mods: z.record(statEnum, num).optional(),
  incomingPct: num.optional(),
  flags: z.array(z.enum(['skipTurn', 'taunt', 'untargetable', 'absorb', 'rooted'])).optional(),
});

/** Compact lorebook shipped by a pack; converted to SillyTavern's format by the adapter. */
export const LorebookSchema = z.object({
  name: str,
  entries: z.array(z.object({
    key: z.array(z.string()),
    comment: z.string(),
    content: str,
    constant: z.boolean(),
    order: int.optional(),
  })),
});
export type PackLorebook = z.infer<typeof LorebookSchema>;

Object.assign(registrySchemas, {
  corporations: CorporationSchema,
  starts: StartSchema,
  crimes: CrimeSchema,
  roles: RoleSchema,
  signatures: SignatureSchema,
  statuses: StatusSchema,
});

// ---------------------------------------------------------------------------------------------
// P2 registries: activities and facilities.

/** Event types the engine itself emits; content may not impersonate them with `emit_event`. */
export const RESERVED_EVENT_TYPES: readonly string[] = [
  'error', 'autosave', 'activity_done', 'slot_advanced', 'day_started', 'day_end_step', 'day_end_step_failed',
  'night_started', 'upkeep', 'supply_shortage', 'trust_penalty_event', 'unit_recovered', 'facility_upgraded',
  'resource_changed', 'social_gained', 'xp_gained', 'stress_changed', 'relation_changed', 'defect_upkeep',
  'commander_injury_changed', 'commander_injured', 'scene_cancelled', 'grunt_recruited', 'upgrade_started',
  'requisitioned', 'roster_changed', 'unit_flavored', 'unit_resynced',
  // P3
  'scene_started', 'scene_exchange', 'scene_ended', 'scene_aborted', 'intents_applied', 'relation_state_changed',
  'loyalty_band_changed', 'proposal_offered', 'proposal_resolved', 'affair_discovered', 'crime_known', 'dm_sent',
  'dm_received', 'dm_initiative', 'night_opened', 'defect_social', 'chronicle_compacted', 'intimacy_changed', 'proposals_expired',
  'proposal_answered', 'night_queued', 'night_ignored', 'dm_read',
  // P4
  'combat_started', 'combat_log', 'combat_awaiting', 'combat_ended', 'combat_cutin', 'order_refused', 'level_up',
  'node_unlocked', 'loot_banked', 'item_crafted', 'item_upgraded', 'item_equipped', 'breakdown', 'breakdown_released',
  'workshop_opened', 'unit_respec', 'loadout_changed', 'combat_lost_pending', 'item_rerolled', 'item_dismantled', 'enemy_named', 'difficulty_changed',
  // P5
  'world_seeded', 'clock_advanced', 'clock_filled', 'faction_changed', 'flag_set', 'clearance_raised', 'thread_changed',
  'mission_offered', 'mission_completed', 'mission_failed', 'mission_expired', 'rumor_posted', 'rumor_followed', 'beat_proposed',
  'beat_completed', 'incoming_unit_offered', 'unit_joined', 'director_requested', 'director_applied', 'director_rejected',
  'expedition_started', 'expedition_moved', 'expedition_node', 'expedition_combat', 'expedition_event', 'expedition_choice',
  'expedition_treated', 'expedition_ended', 'expedition_recap_set', 'leash_changed',
  // P6
  'leash_seeded', 'leash_refreshed', 'leash_used', 'scene_compelled', 'unit_terminated',
  'scene_order', 'combat_compelled', 'loyalty_sign', 'desertion_attempt', 'loyalty_talk_down', 'unit_deserted',
  'deserter_returned', 'deserter_answered', 'mutiny_started', 'mutiny_subdued', 'mutiny_escaped',
  'thread_flag_set', 'dilemma_requested', 'dilemma_rejected', 'dilemma_presented', 'dilemma_resolved',
  'arc_decided', 'arc_step', 'arc_completed', 'arc_unlocked',
  // P9
  'impunity_changed', 'defiance_noted', 'defiance_settled', 'threat_registered', 'threat_kept', 'threat_lapsed',
  'discipline_applied', 'discipline_undone', 'restriction_started', 'restriction_ended', 'covert_sabotage',
  'demand_opened', 'demand_delivered', 'demand_resolved', 'nickname_pending', 'nickname_given', 'nickname_dropped',
  // P9e
  'her_call', 'her_call_acknowledged', 'ask_first_set',
  // P9c
  'decor_placed', 'decor_faded', 'decor_removed_by_commander', 'device_intercept', 'intercept_resolved',
  'booking_made', 'booking_conflict', 'booking_resolved', 'booking_cancelled', 'booking_played', 'booking_lapsed',
  'token_offered', 'token_accepted', 'token_declined', 'token_worn', 'token_taken_off',
  'wager_offered', 'wager_refused', 'wager_accepted', 'wager_declined', 'wager_resolved', 'mark_set', 'mark_ended', 'wager_question', 'truth_told', 'demand_dropped',
  'secret_kept', 'secret_found', 'secret_answered',
  // P12
  'frequency_intercept', 'frequency_worded', 'frequency_static', 'frequency_discovered', 'implant_burned', 'commander_stress_changed', 'premonition', 'premonition_acted', 'bloom_nightmare', 'handler_visit', 'intel_answered', 'handler_threat', 'handler_leak', 'debts_consequence', 'debts_discovered', 'defector_arc',
  // P14b
  'appraisal_recorded', 'appraisal_revised', 'development_review', 'development_shift', 'development_moment', 'development_fact', 'habit_formed',
  // P10b
  'door_said', 'door_replied', 'hand_set', 'note_left', 'note_read', 'notes_expired',
  // P15a (the scene blocking, moments and contact physics)
  'blocking_changed', 'blocking_rolled_back', 'moment_fired', 'moment_answered', 'moment_lapsed', 'moment_escalated',
  'physics_started', 'physics_segment', 'physics_signal', 'physics_slip', 'physics_cheat', 'physics_caught', 'physics_noise', 'physics_outcome', 'blackout',
  'endurance_gained', 'her_skill_gained', 'marathon_phase', 'marathon_done', 'reflex', 'stimulus_stage_changed', 'stimulus_way', 'mouth_act', 'mouth_act_done', 'mouth_act_restart', 'condition_set', 'condition_ended',
  // P10e-e (scent's question, R20)
  'scent_answer', 'scent_lie_caught',
  // P10e-e (her frame, R28; the throne's decision, 24b)
  'forgotten_end', 'found_posed', 'physics_got_up', 'physics_decided', 'physics_noticed', 'physics_woke', 'physics_buckle',
  // P10c
  'quarters_set',
  // P13
  'leashswap_started', 'warden_assigned', 'warden_revealed', 'warden_agenda_set', 'expectation_learned',
  'warden_override', 'override_answered', 'override_compromise', 'override_argue_roll',
  'commander_punished', 'commander_restricted', 'commander_leashed', 'leash_cosigned', 'leash_cosign_denied',
  'warden_warning', 'commander_terminated', 'commander_died', 'campaign_ended',
  'intrigue_action', 'ally_won', 'ally_refused', 'kompromat_found', 'hack_step', 'controller_dark', 'intrigue_discovered',
  'warden_removed', 'investigation_opened', 'remote_control_started', 'verdict',
  // P14
  'generation_failed', 'generation_closed', 'generation_expired', 'scene_summarized_late', 'dilemma_reworded', 'demand_reworded', 'rule_reworded',
  // P11b
  'head_start_applied', 'head_start_moment',
  // P14c
  'life_event', 'life_shared', 'life_noted', 'life_frequency_set', 'news_queued', 'news_delivered', 'news_stale',
  'hobby_started', 'hobby_progress', 'hobby_plateau', 'hobby_breakthrough', 'hobby_milestone', 'hobby_cooling', 'hobby_dropped',
  'hobby_rekindled', 'hobby_mastered', 'hobby_taught', 'opinion_formed', 'opinion_changed', 'opinion_hardened', 'first_moment_kept',
  'joke_counted', 'pastime_set', 'temperament_set', 'hobbies_set', 'opinion_set',
  // P15 (the dynamic; the list is `DYNAMIC_EVENT_TYPES`)
  ...DYNAMIC_EVENT_TYPES,
  // P16 (practices; the list is `PRACTICE_EVENT_TYPES`)
  ...PRACTICE_EVENT_TYPES,
  // P16b (the craft; the list is `CRAFT_EVENT_TYPES`)
  ...CRAFT_EVENT_TYPES,
];

const slotEnum = z.enum(['morning', 'afternoon', 'evening', 'night']);
const socialStat = z.enum(['authority', 'insight', 'empathy', 'cunning']);
const amountFields = {
  /** Multiplies `amount` by (1 + facility effect / 100). */
  scale: z.object({ facility: str, key: str }).strict().optional(),
  when: z.object({ focus: str.optional(), companionLikes: str.optional() }).strict().optional(),
};

export const ActivityEffectSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('resource'),
    resource: z.enum(['credits', 'supplies', 'plyx']),
    amount: int,
    /** Adds `per` × the commander's rank in `stat`. */
    perStat: z.object({ stat: socialStat, per: int }).strict().optional(),
    ...amountFields,
  }).strict(),
  z.object({ type: z.literal('commander_stat'), stat: socialStat, amount: int, ...amountFields }).strict(),
  z.object({ type: z.literal('unit_xp'), target: z.enum(['selected', 'companion']), amount: int, ...amountFields }).strict(),
  z.object({ type: z.literal('unit_stress'), target: z.enum(['selected', 'companion', 'roster']), amount: int, ...amountFields }).strict(),
  z.object({ type: z.literal('injury_days'), target: z.enum(['selected', 'companion']), amount: int, ...amountFields }).strict(),
  z.object({ type: z.literal('commander_injury_days'), amount: int, ...amountFields }).strict(),
  /** P7: one body training session (tenths of XP come from `TUNING.commander`); the amount is not authored. */
  z.object({ type: z.literal('commander_body_xp'), stat: z.enum(['strength', 'endurance', 'reflexes']), ...amountFields }).strict(),
  /** P15a: one endurance drill of the commander for a contact physics (the xp is `TUNING.physics.endurance.training`, once a day per physics); the amount is not authored. */
  z.object({ type: z.literal('commander_endurance_xp'), physics: z.string().min(1), ...amountFields }).strict(),
  /** P16b: one drill of a discipline of the craft (the xp is `TUNING.craft.xp.drill`, once a day per key; nothing while no holder runs the craft); the amount is not authored. */
  z.object({ type: z.literal('commander_craft_xp'), key: z.string().min(1), ...amountFields }).strict(),
  z.object({ type: z.literal('defect_upkeep'), target: z.enum(['selected', 'companion']), ...amountFields }).strict(),
  z.object({ type: z.literal('relation'), axis: z.enum(['trust', 'affinity', 'attraction']), amount: int, ...amountFields }).strict(),
  /** P12: moves the commander's own stress (a negative amount relieves it). */
  z.object({ type: z.literal('commander_stress'), amount: int, ...amountFields }).strict(),
  /** P12: burns out the secret frequency implant for good (the focus that carries it asks first). */
  z.object({ type: z.literal('burn_frequency_implant'), ...amountFields }).strict(),
  z.object({
    type: z.literal('emit_event'),
    event: str.refine((e) => !RESERVED_EVENT_TYPES.includes(e), 'this event name belongs to the engine'),
    ...amountFields,
  }).strict(),
]);
export type ActivityEffect = z.infer<typeof ActivityEffectSchema>;

export const ActivitySchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  slotRules: z.array(slotEnum).min(1),
  facilityReq: z.object({ id: str, level: int.min(1) }).strict().optional(),
  cost: z.object({ credits: int.min(0).optional(), supplies: int.min(0).optional(), plyx: int.min(0).optional() }).strict(),
  companion: z.enum(['none', 'optional', 'required']),
  /** Choices for the alone variant; `units` says how many squad units the player picks for that choice. */
  focus: z.array(z.object({
    id: str,
    label: str,
    units: z.object({ min: int.min(1), max: int.min(1) }).strict().optional(),
    /**
     * P12: the focus is offered, and allowed, only to a commander whose traits have this effect type. P15: or (`capabilityHeldBy`) only while some
     * holder holds this capability (the Leash terminal: while a block stands). One of the two at least.
     */
    requires: z.object({ traitEffect: str.optional(), capabilityHeldBy: z.enum(CAPABILITIES).optional() }).strict()
      .refine((r) => r.traitEffect !== undefined || r.capabilityHeldBy !== undefined, 'a focus requirement names a traitEffect or a capabilityHeldBy').optional(),
    /** P12: a one-way choice: the app asks this question first (the activity runs only on a yes). */
    confirm: str.max(200).optional(),
    /** P16b: a drill of the craft: the discipline it trains (`endurance:<physics>` or a discipline), and `partner` when a companion may share it (only a drill with an instrument). */
    drill: z.object({ key: str, partner: z.literal(true).optional() }).strict().optional(),
  }).strict()).optional(),
  effects: z.array(ActivityEffectSchema),
  companionEffects: z.array(ActivityEffectSchema),
  flavor: z.enum(['none', 'short']),
  /** The activity opens a scene (P3); the slot is consumed when the scene ends, not here. */
  startsScene: z.boolean().optional(),
  blockedWhenCommanderInjured: z.boolean().optional(),
  /** P9d: how much a companion's Want falls when she shares this activity (absent: the default of `TUNING.bonds.want.relief`). */
  wantRelief: int.min(0).max(100).optional(),
  /** P9b: the squad leader may countermand this minor, non-combat order when it names another unit. */
  countermandable: z.boolean().optional(),
  /** P13: an idle activity (the warden's `meet_quota` expectation frowns on it while a mission is due). Read by this field, never by id. */
  idle: z.boolean().optional(),
  /** P13: an activity that serves the quota (the warden's alternative to an idle one). */
  quota: z.boolean().optional(),
  /** P14b: how the companion reads the activity (character development); absent = nothing is recorded. */
  appraisal: ReadingSchema.optional(),
  /** P14b: the tags a rule may turn into a like (`like:{tag}`), normalized like imported likes. */
  appraisalTags: z.array(str.max(32)).max(3).optional(),
  /** P14c: the activity a quiet meeting (a pastime) runs through. Read by this field, never by id; exactly one activity carries it. */
  pastime: z.literal(true).optional(),
}).superRefine((a, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (a.companion === 'none' && a.companionEffects.length > 0) issue(['companionEffects'], 'companion "none" cannot have companionEffects');
  if (a.companion === 'required' && a.companionEffects.length === 0) issue(['companionEffects'], 'companion "required" needs companionEffects');
  const focusIds = new Set((a.focus ?? []).map((f) => f.id));
  if (focusIds.size !== (a.focus ?? []).length) issue(['focus'], 'focus ids must be unique');
  (a.focus ?? []).forEach((f, i) => {
    if (f.units && f.units.min > f.units.max) issue(['focus', i, 'units'], 'units.min must not exceed units.max');
  });
  if (a.startsScene === true) {
    [...a.effects, ...a.companionEffects].forEach((fx) => {
      if (fx.type !== 'emit_event') issue(['startsScene'], 'a scene-starting activity may only emit events; its slot is not consumed here');
    });
  }
  a.effects.forEach((fx, i) => {
    const f = fx as { target?: string; type: string; when?: { focus?: string; companionLikes?: string } };
    if (f.when?.focus !== undefined && !focusIds.has(f.when.focus)) issue(['effects', i, 'when', 'focus'], `unknown focus "${f.when.focus}"`);
    if (f.target === 'companion') issue(['effects', i, 'target'], 'effects (alone) cannot target the companion');
    if (f.type === 'relation') issue(['effects', i, 'type'], 'relation effects need a companion; use companionEffects');
    if (f.when?.companionLikes !== undefined) issue(['effects', i, 'when', 'companionLikes'], 'companionLikes only applies to companionEffects');
  });
  a.companionEffects.forEach((fx, i) => {
    const f = fx as { target?: string; when?: { focus?: string } };
    if (f.target === 'selected') issue(['companionEffects', i, 'target'], 'companionEffects cannot target "selected"');
    if (f.when?.focus !== undefined) issue(['companionEffects', i, 'when', 'focus'], 'focus is ignored when a companion is present');
  });
});

export const FacilitySchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  maxLevel: int.min(1).max(5),
  /** P9b: how the squad leans on voting for an upgrade of this facility. */
  voteLean: VoteLeanSchema.optional(),
  /** `levels[0]` is level 1 (the starting level, no upgrade cost); later levels carry the cost to reach them. */
  levels: z.array(z.object({
    effects: z.record(z.number()),
    upgrade: z.object({ credits: int.min(0), plyx: int.min(0), days: int.min(1) }).strict().optional(),
  }).strict()),
}).superRefine((f, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (f.levels.length !== f.maxLevel) issue(['levels'], `needs exactly maxLevel (${f.maxLevel}) levels, has ${f.levels.length}`);
  const keys = Object.keys(f.levels[0]?.effects ?? {}).sort().join(',');
  f.levels.forEach((l, i) => {
    if (i === 0 && l.upgrade) issue(['levels', 0, 'upgrade'], 'level 1 has no upgrade cost');
    if (i > 0 && !l.upgrade) issue(['levels', i, 'upgrade'], `level ${i + 1} needs an upgrade cost`);
    if (Object.keys(l.effects).sort().join(',') !== keys) issue(['levels', i, 'effects'], 'every level must list the same effect keys');
  });
});

Object.assign(registrySchemas, { activities: ActivitySchema, facilities: FacilitySchema });

// ---------------------------------------------------------------------------------------------
// P3 registries: relationship states, event deltas, locations and the defect social data.

const axisName = z.enum(['trust', 'affinity', 'attraction']);
const severityEnum = z.enum(SEVERITIES as [string, ...string[]]);
const range = z.tuple([int, int]).refine(([lo, hi]) => lo <= hi, 'range minimum must not exceed maximum');

export interface Conditions {
  axes?: { trust?: [number, number]; affinity?: [number, number]; attraction?: [number, number] };
  stressMin?: number;
  flagsAll?: string[];
  flagsNone?: string[];
  defectsAny?: string[];
  inStates?: string[];
  minDaysInState?: number;
  eventCount?: { type: string; min: number; withinDays?: number };
  leashUsesMin?: number;
  /** At least one alternative holds; an empty list never holds. */
  anyOf?: Conditions[];
}

/** Conditions of the relationship graph (P3). Every key is optional; all present keys must hold. */
export const ConditionsSchema: z.ZodType<Conditions> = z.lazy(() =>
  z.object({
    axes: z.object({ trust: range.optional(), affinity: range.optional(), attraction: range.optional() }).strict().optional(),
    stressMin: int.min(0).max(100).optional(),
    flagsAll: z.array(str).optional(),
    flagsNone: z.array(str).optional(),
    defectsAny: z.array(str).optional(),
    inStates: z.array(str).optional(),
    minDaysInState: int.min(0).optional(),
    eventCount: z.object({ type: str, min: int.min(1), withinDays: int.min(1).optional() }).strict().optional(),
    leashUsesMin: int.min(1).optional(),
    anyOf: z.array(ConditionsSchema).optional(),
  }).strict(),
) as z.ZodType<Conditions>;

const gainLoss = z.object({ gain: z.record(axisName, z.number().min(0)).optional(), loss: z.record(axisName, z.number().min(0)).optional() }).strict();

export const NightSpecSchema = z.object({
  id: str,
  kind: str,
  chance: z.number().min(0).max(1),
  priority: int,
  trigger: z.enum(['daily', 'commander_injured']),
  /** Shown as the knock; `{name}` is replaced by the unit's name. */
  framing: str,
  /** What ignoring the knock does: an intent event from the commander's side. */
  ignore: z.object({ event: str, severity: severityEnum }).strict(),
  /** P9d: the spec is never queued while one of these categories is off, or is among her own limits. */
  contentTags,
}).strict();
export type NightSpec = z.infer<typeof NightSpecSchema>;

export const RelationshipStateSchema = BaseEntrySchema.extend({
  name: str,
  group: z.enum(['base', 'platonic', 'romantic', 'complex', 'negative']),
  /** Romance off hides every state with `romance: true`. */
  romance: z.boolean(),
  glyph: z.string().min(1).max(2),
  /** Among several automatic entries that hold, the highest priority wins. */
  priority: int,
  /** Available to grunts (Trust-only units); default false. */
  grunts: z.boolean().optional(),
  /** P15: the state a romantic one falls to when the commander leaves a dynamic she held (R17): one rung down, never out of romance. Refs-checked; a romantic state without one stays where it is. */
  stepDown: str.optional(),
  /** P9: how much of her Impunity this state takes away (she needs the commander). */
  dependency: int.min(0).max(40).optional(),
  /** P7: only a commander with this trait can reach the state. */
  requiresTrait: str.optional(),
  /** P9d: `romantic` states carry Want, publicity and a scene lead; `close` ones let her propose rules. Code reads the tier, never the id. */
  bondTier: z.enum(['romantic', 'close']).optional(),
  /** P9d: added to the lead score of her scenes while her lead style is at least assertive. */
  leadBonus: int.min(0).max(40).optional(),
  /** P9c: a unit in this state lets a squad secret slip at the end of a scene. */
  secretSlip: z.boolean().optional(),
  entry: z.object({
    via: z.array(z.enum(['automatic', 'event', 'proposal'])).min(1),
    /** Empty or absent = from any state. */
    fromStates: z.array(str).optional(),
    events: z.array(z.enum(EVENT_TYPES)).optional(),
    proposals: z.array(z.enum(PROPOSAL_KINDS)).optional(),
    when: ConditionsSchema.optional(),
  }).strict(),
  /** Checked first, in order; the first rule that holds moves the unit to `to`. */
  exit: z.array(z.object({ when: ConditionsSchema, to: str }).strict()),
  modifiers: gainLoss.optional(),
  unlocks: z.object({
    synergies: z.array(str),
    activities: z.array(str),
    nightEvents: z.array(NightSpecSchema),
    defectArcStages: z.array(str),
  }).strict(),
  /** Base chance per slot transition that the unit starts a DM. */
  dmChance: z.number().min(0).max(1),
  promptHint: str,
}).superRefine((st, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  const via = st.entry.via;
  if (via.includes('event') !== (st.entry.events?.length ?? 0) > 0) issue(['entry', 'events'], 'via "event" needs a non-empty events list, and events need via "event"');
  if (via.includes('proposal') !== (st.entry.proposals?.length ?? 0) > 0) issue(['entry', 'proposals'], 'via "proposal" needs a non-empty proposals list, and proposals need via "proposal"');
});

const eventRow = z.object({
  trust: z.number().optional(), affinity: z.number().optional(), attraction: z.number().optional(), stress: z.number().optional(),
}).strict();

export const EventDeltaSchema = BaseEntrySchema.extend({
  id: z.enum(ALL_EVENT_TYPES),
  /** P7a: one-line cause shown in relationship history readings; absent = the humanized event id. */
  cause: str.max(80).optional(),
  /** P3b: the event as the relation journal words it, in the third person ("the commander praised her"); absent = the humanized event id. */
  journal: str.max(100).optional(),
  rows: z.object({ minor: eventRow, moderate: eventRow, major: eventRow, extreme: eventRow }).strict(),
  /** The row holds magnitudes; the sign comes from value alignment (decision events). */
  valueAligned: z.boolean().optional(),
  /** Attraction gains are scaled by the unit's receptivity (romance on, Affinity ≥ 0, Trust ≥ 20). */
  attractionUsesReceptivity: z.boolean().optional(),
  /** P14b: how a soldier reads this event when no model read it (character development). Absent = nothing is recorded. */
  appraisal: ReadingSchema.optional(),
});

export const LocationSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  ascii: z.array(z.string()).min(1).max(12),
  /** Asset paths relative to the extension folder (P10c: `background` is the day file, the others the slot's own; read through `sceneBackdrop`). */
  background: str.optional(),
  backgroundEvening: str.optional(),
  backgroundNight: str.optional(),
  /** P10c: the floor and ceiling finish (a `backdrops` surface `finish`), for P17c's low and high views. */
  floor: str.optional(),
  ceiling: str.optional(),
  /** One location per unit (`quarters_unit`). */
  perUnit: z.boolean().optional(),
  /** Slots the location is available in; absent = all. */
  slots: z.array(slotEnum).min(1).optional(),
});

export const DefectSchema = BaseEntrySchema.extend({
  name: str,
  category: z.enum(['neural', 'somatic', 'cybernetic', 'desire_bond']),
  lore: str,
  upside: str,
  downside: str,
  breakdown: z.object({ name: str, text: str }),
  social: str,
  /** A path without text is hidden (not offered, not shown) until it is written. */
  arc: z.object({ cure: str.optional(), manage: str.optional(), embrace: str.optional() }),
  /** P3: multipliers applied after state modifiers; `events` multiplies the whole delta of one event type. */
  relationModifiers: gainLoss.extend({ events: z.record(z.number().min(0)).optional() }).strict().optional(),
  /** P3: activity-driven social effects (e.g. Hunger Loop meals give Affinity). */
  socialHooks: z.array(z.object({
    activity: str,
    who: z.enum(['companion', 'roster']),
    axis: axisName.optional(),
    amount: int.optional(),
    setFlag: str.optional(),
  }).strict()).optional(),
  dmChanceBonus: z.number().min(0).max(1).optional(),
  /** P6: Leash cost multiplier (Compel) and the chance a Compel fails. */
  leash: z.object({ costMult: z.number().min(0).max(4), failChance: z.number().min(0).max(1).optional() }).strict().optional(),
  /** P6: added to the daily desertion chance. */
  desertionMod: z.number().min(-0.3).max(0.3).optional(),
  /** P6: a relation flag that must be set before the defect arc can start. */
  arcFlag: str.optional(),
  /** P9d: the bond traits a unit needs to take this defect (import candidates, the manual list and validation read it). */
  requiresBond: z.object({ caretaker: z.literal(true).optional() }).strict().optional(),
  /** P9d: added to the lead score of her scenes (not while her arc is cure). */
  leadBonus: int.min(0).max(40).optional(),
  /** P9d: stress her defect adds when the event lands on her (a negative value relieves). */
  eventStress: z.record(z.enum(ALL_EVENT_TYPES), z.number().int().min(-10).max(10)).optional(),
  /** P9d: deciding the Embrace path writes this relation flag (a stand-in for a formal arrangement); while it is set the defect's positive `eventStress` values are halved. */
  embraceFlag: str.optional(),
  /** P9c: how hard her personal pressure lands (booking, token, claim and challenge chances, and the deltas toward her); the product over her defects. */
  pressureMult: z.number().min(1).max(2).optional(),
  /** P9d: what her unmet want does at the top band: an off-combat breakdown of this kind for 1 to 3 days. */
  wantBreakdown: z.object({ kind: z.enum(['withdrawal', 'binge', 'smother', 'seize']), days: int.min(1).max(3) }).strict().optional(),
  /** P12: she is awake at night, so she may notice the handler's visit (read by this field, never by defect id). */
  nightAware: z.boolean().optional(),
  /** P13: a defect that gives the know-how to work on the controller implant (read by this field, never by id). */
  tech: z.boolean().optional(),
  /** P12: how readily she notices a leak of the commander's secret frequency (the suspicion gain is multiplied by it, and above 50 she senses static). Read by this field, never by defect id. */
  frequencySense: z.number().min(1).max(2).optional(),
  /** P10b: `flat` draws her VITALS as a flat line (rare flickers break it). Read by this field, never by defect id. */
  vitals: z.enum(['flat']).optional(),
  nightEvents: z.array(NightSpecSchema).optional(),
  /** P5: one more node revealed ahead on the expedition map (Echo Bleed). */
  expedition: z.object({ reveal: z.literal(1) }).strict().optional(),
  /** P4: combat data. Downside effects are amplified while the unit is strained, so each must say so. */
  combat: z.object({
    upside: z.array(CombatEffectSchema),
    downside: z.array(CombatEffectSchema),
    breakdown: z.object({
      policy: z.enum(['skip', 'repeat_last', 'random_skill', 'attack', 'await_order', 'twice_then_shutdown', 'normal']),
      target: z.enum(['nearest_enemy', 'strongest_enemy', 'nearest_any', 'nearest_ally']).optional(),
      ignoresOrders: z.boolean(),
      once: z.boolean().optional(),
      onEnter: z.array(CombatEffectSchema),
      actionEffects: z.array(CombatEffectSchema),
    }).strict(),
  }).strict().superRefine((c, ctx) => {
    c.downside.forEach((e, i) => {
      if (e.downside !== true) ctx.addIssue({ code: 'custom', path: ['downside', i, 'downside'], message: 'every downside effect must carry downside: true' });
    });
  }),
});

Object.assign(registrySchemas, {
  relationshipStates: RelationshipStateSchema,
  eventDeltas: EventDeltaSchema,
  locations: LocationSchema,
  defects: DefectSchema,
});

// ---------------------------------------------------------------------------------------------
// P4 registries: orders, synergies, enemies, affixes, items, recipes, loot tables.

export const OrderSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  cost: int.min(1).max(5),
  target: z.enum(['none', 'ally', 'enemy']),
  /** P12: offered only to a commander whose traits have an `unlock_order` effect naming it. */
  requiresUnlock: z.boolean().optional(),
  /** P13: how the warden reads this order: `retreat` (obey_oversight frowns on it) or `risk` (protect_squad frowns on it while an ally is nearly down). */
  wardenRule: z.enum(['retreat', 'risk']).optional(),
  effects: effects.min(1),
});

export const SynergySchema = BaseEntrySchema.extend({ name: str, summary: str, effects: effects.min(1) });

export const EnemyCategorySchema = BaseEntrySchema.extend({
  name: str,
  frequency: z.enum(['common', 'rare', 'very_rare']),
  summary: str,
});

export const EnemySchema = BaseEntrySchema.extend({
  categoryId: str,
  name: str,
  stats: z.object({
    base: z.object({ hp: num.min(1), atk: num.min(1), def: num.min(0), spd: num.min(1), crit: num.min(0).max(100) }).strict(),
    growth: GrowthSchema,
  }).strict(),
  skills: z.array(str).min(1),
  eliteSkill: str.optional(),
  aiProfile,
  rowPreference: rowEnum,
  /** Budget weight of the enemy in the encounter generator: cost = stat power × `power`. */
  power: num.positive(),
  portrait: z.object({ ascii: z.array(z.string()).min(1).max(8), image: str.optional() }).strict(),
  tags: z.array(str),
});

export const AffixSchema = BaseEntrySchema.extend({
  name: str,
  appliesTo: z.enum(['enemy', 'item']),
  /** Enemy affixes: the word in the default name ("Armored Husk"). */
  adjective: str.optional(),
  /** Item affixes: slots the affix may roll on; absent = any. */
  slots: z.array(z.enum(['weapon', 'upper', 'lower'])).min(1).optional(),
  drawback: z.boolean().optional(),
  statPct: PartialStatsSchema.optional(),
  effects: effects,
  /** Enemy affix: the enemy also gets its `eliteSkill`. */
  extraSkill: z.boolean().optional(),
});

export const RARITY_IDS = ['standard', 'refined', 'prototype', 'corporate', 'anomalous'] as const;
const rarityEnum = z.enum(RARITY_IDS);

export const ItemSchema = BaseEntrySchema.extend({
  name: str,
  slot: z.enum(['weapon', 'upper', 'lower']),
  /** A weapon class or an armor weight; checked against the roles' lists. */
  class: str,
  /** The template's minimum rarity. */
  rarity: rarityEnum,
  baseStats: PartialStatsSchema,
  affixSlots: int.min(0).max(3).optional(),
  effects: effects,
  value: int.min(0),
});

export const RecipeSchema = BaseEntrySchema.extend({
  itemId: str,
  rarity: rarityEnum,
  cost: z.object({ credits: int.min(0), plyx: int.min(0) }).strict(),
});

export const LootTableSchema = BaseEntrySchema.extend({
  rolls: int.min(0),
  entries: z.array(z.object({
    weight: num.positive(),
    kind: z.enum(['item', 'credits', 'plyx', 'supplies']),
    itemId: str.optional(),
    rarityWeights: z.record(rarityEnum, num.positive()).optional(),
    amount: z.tuple([int.min(0), int.min(0)]).optional(),
  }).strict().superRefine((e, ctx) => {
    if (e.kind === 'item' && e.itemId === undefined) ctx.addIssue({ code: 'custom', path: ['itemId'], message: 'kind "item" needs an itemId' });
    if (e.kind !== 'item' && e.amount === undefined) ctx.addIssue({ code: 'custom', path: ['amount'], message: `kind "${e.kind}" needs an amount [min, max]` });
    if (e.amount && e.amount[0] > e.amount[1]) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'amount minimum must not exceed maximum' });
  })),
});

Object.assign(registrySchemas, {
  skills: SkillSchema,
  orders: OrderSchema,
  synergies: SynergySchema,
  enemyCategories: EnemyCategorySchema,
  enemies: EnemySchema,
  affixes: AffixSchema,
  items: ItemSchema,
  recipes: RecipeSchema,
  lootTables: LootTableSchema,
});

// ---------------------------------------------------------------------------------------------
// P5 registries: regions, node types, clocks, reward tiers, mission templates, minor events.

const idKeyed = z.record(str, z.number().positive());
const wordCount = (t: string) => t.trim().split(/\s+/).filter(Boolean).length;
const hotspotPoint = z.tuple([num.min(0).max(100), num.min(0).max(100)]);

export const RegionSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  environmentPrompt: str,
  danger: int.min(1).max(5),
  travelSlots: z.union([z.literal(2), z.literal(3)]),
  enemyTable: z.object({ categories: idKeyed, archetypes: z.array(str).optional() }).strict(),
  modifiers: z.array(str),
  mapHotspot: z.array(hotspotPoint).min(3),
  mapCell: z.object({ x: int.min(0).max(2), y: int.min(0).max(2) }).strict(),
  layers: z.tuple([int.min(3).max(5), int.min(3).max(5)]).refine(([a, b]) => a <= b, 'layers minimum must not exceed maximum'),
  nodeWeights: idKeyed,
  pointsOfInterest: z.array(z.object({ id: str, name: str, summary: str, templateId: str }).strict()),
  /** P10e-e Task 27 (R30): the dirt a run here leaves on her footwear (shoe service's `dirtOfDay`); absent: the rest of her day decides. */
  dirt: z.enum(['ash', 'oil', 'spores', 'mud']).optional(),
  rumors: z.array(str.refine((t) => wordCount(t) <= 40, 'a rumor line is at most 40 words')),
  knownFromStart: z.boolean().optional(),
  unlockedBy: z.object({ flag: str.optional(), clearanceMin: int.min(1).max(3).optional() }).strict().optional(),
});

export const NodeTypeSchema = BaseEntrySchema.extend({
  name: str,
  glyph: z.string().refine((g) => [...g].length === 1, 'glyph must be one character'),
  kind: z.enum(['combat', 'event', 'cache', 'rest', 'objective', 'unknown']),
  combat: z.object({ dangerDelta: int.min(-1).max(2), lootTableId: str, exposesCommander: z.boolean().optional() }).strict().optional(),
  rest: z.object({ suppliesPerUnit: int.min(0), hpPct: num, stress: num }).strict().optional(),
  resolvesTo: idKeyed.optional(),
  firstLayer: z.boolean().optional(),
  maxPerMap: int.min(1).optional(),
  minDanger: int.min(1).max(5).optional(),
}).superRefine((n, ctx) => {
  const need = (field: 'combat' | 'rest' | 'resolvesTo', kind: string) => {
    if (n.kind === kind && n[field] === undefined) ctx.addIssue({ code: 'custom', path: [field], message: `kind "${kind}" needs a ${field} block` });
    if (n.kind !== kind && n[field] !== undefined) ctx.addIssue({ code: 'custom', path: [field], message: `${field} is only for kind "${kind}"` });
  };
  need('combat', 'combat');
  need('rest', 'rest');
  need('resolvesTo', 'unknown');
});

export const ClockSchema = BaseEntrySchema.extend({
  label: str,
  segments: int.min(4).max(12),
  startFilled: int.min(0),
  regionId: str.optional(),
  visibleToPlayer: z.boolean(),
  onFill: z.array(WorldEffectSchema),
  repeat: z.boolean().optional(),
  /** P8: the entry exists only while some world choice enables this family. */
  family: str.optional(),
  /** P15: the engine makes this clock up when it needs it (the oversight inquiry): the world does not seed it and the director never moves it. */
  engine: z.literal(true).optional(),
  contentTags,
}).superRefine((c, ctx) => {
  if (c.startFilled >= c.segments) ctx.addIssue({ code: 'custom', path: ['startFilled'], message: 'startFilled must be below segments' });
});

const orderedRange = z.tuple([int.min(0), int.min(0)]).refine(([a, b]) => a <= b, 'range minimum must not exceed maximum');
export const RewardTierSchema = BaseEntrySchema.extend({
  rank: int.min(1).max(5),
  credits: orderedRange,
  plyx: orderedRange,
  lootTableId: str.optional(),
  lootRolls: int.min(1).max(3).optional(),
  faction: int.min(0).max(15).optional(),
});

export const MissionTemplateSchema = BaseEntrySchema.extend({
  name: str,
  sources: z.array(z.enum(['command', 'story', 'rumor', 'side'])).min(1),
  regions: z.array(str).optional(),
  objectives: z.array(z.object({ node: str, condition: z.enum(['win', 'reach']) }).strict()).min(1),
  dangerRange: z.tuple([int.min(1).max(5), int.min(1).max(5)]).refine(([a, b]) => a <= b, 'dangerRange minimum must not exceed maximum'),
  tiers: z.array(str).min(1),
  factionId: str.optional(),
  clearance: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  objectiveEventId: str.optional(),
  failureEffects: z.array(WorldEffectSchema),
  onSuccess: z.array(WorldEffectSchema).optional(),
  titles: z.array(str.max(60)).min(1),
  briefs: z.array(str.max(300)).min(1),
  /** P8: see ClockSchema. */
  family: str.optional(),
  contentTags,
  /** P9b: how the squad leans on voting for a run of this template. */
  voteLean: VoteLeanSchema.optional(),
  /** P11: the tutorial run of the prologue. Never offered by the director, the fallback or rumors; needs a `fixedMap`. */
  tutorial: z.literal(true).optional(),
  /** P11: an authored node map: 1 to 4 layers of 1 to 3 nodes, then the objective node. `eventId` pins an event node's template. */
  fixedMap: z.object({
    layers: z.array(z.array(z.object({ type: str, eventId: str.optional() }).strict()).min(1).max(3)).min(1).max(4),
  }).strict().optional(),
}).superRefine((t, ctx) => {
  if (t.tutorial === true && t.fixedMap === undefined) {
    ctx.addIssue({ code: 'custom', path: ['fixedMap'], message: 'a tutorial template needs a fixedMap' });
  }
});

const TRUST_BANDS = ['none', 'low', 'guarded', 'solid', 'high'] as const;

/** P7: one way to get a check done. Body routes are deterministic (stat ≥ min), like social ones. */
export const CheckRouteSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('body'), stat: z.enum(['strength', 'endurance', 'reflexes']), min: int.min(1).max(5) }).strict(),
  z.object({
    kind: z.literal('delegate'),
    unitFilter: z.object({ roles: z.array(str).min(1).optional() }).strict().optional(),
    cost: z.object({
      trustCheck: z.enum(TRUST_BANDS).optional(),
      affinityCost: int.min(0).max(20).optional(),
      stress: int.min(0).max(30).optional(),
    }).strict(),
  }).strict(),
  z.object({ kind: z.literal('social'), stat: socialStat, min: int.min(1).max(5) }).strict(),
  z.object({ kind: z.literal('item'), itemId: str }).strict(),
  z.object({
    kind: z.literal('bypass'),
    cost: z.object({ resource: z.enum(['credits', 'supplies', 'plyx']), amount: int.min(1) }).strict(),
  }).strict(),
]);
export type CheckRoute = z.infer<typeof CheckRouteSchema>;

/** P7 / overview P10: a check that needs a body stat always declares a route that is not a body stat. */
export const RouteCheckSchema = z.object({
  id: str,
  routes: z.array(CheckRouteSchema).min(1).max(5),
}).strict().refine((c) => c.routes.some((r) => r.kind !== 'body'), {
  message: 'a check needs at least one route that is not body (overview P10)',
  path: ['routes'],
});
export type RouteCheck = z.infer<typeof RouteCheckSchema>;

const EventOptionSchema = z.object({
  /** P9b: the scapegoat's two answers are told apart by this slug (`take_blame`, `shift_blame`); other options carry none. */
  id: z.string().regex(ID_PATTERN, 'id must match ^[a-z0-9_:.-]+$').optional(),
  label: str.max(80),
  requires: z.object({ stat: socialStat, rank: int.min(1).max(5) }).strict().optional(),
  /** P7: authored options only; generated dilemma options never carry one. */
  routeCheck: RouteCheckSchema.optional(),
  effects: z.array(WorldEffectSchema),
}).passthrough();

/**
 * P9e: a her-call template. At an expedition event node a soldier with a will of her own may act on her own; the node then resolves
 * itself to one of two outcomes (one good, one bad), read from her values against each `lean`. `fixed` stays the commander's version.
 */
export const HerCallSchema = z.object({
  /** Who may act: a lead rank (0 yielding … 3 dominant), or one of these command stances at the Impunity floor. Stance ids are checked at load. */
  trigger: z.object({
    minLeadRank: int.min(0).max(3).optional(),
    stances: z.array(str).optional(),
    minImpunity: int.min(0).max(100).optional(),
  }).strict().refine((t) => t.minLeadRank !== undefined || (t.stances?.length ?? 0) > 0, 'a trigger needs minLeadRank or stances'),
  outcomes: z.array(z.object({
    id: z.enum(['good', 'bad']),
    lean: VoteLeanSchema,
    text: str.max(160),
    effects: z.array(WorldEffectSchema),
  }).strict()).length(2),
  /** A defect of this category shifts the odds of a good outcome (read by category, never by id). */
  defectTilt: z.array(z.object({
    category: z.enum(['neural', 'somatic', 'cybernetic', 'desire_bond']),
    shift: z.number().min(-0.2).max(0.2),
  }).strict()).optional(),
}).strict();
export type HerCallSpec = z.infer<typeof HerCallSchema>;

/** Effect types that only make sense inside an expedition run. */
const EXPEDITION_ONLY_EFFECTS: readonly string[] = ['carried_supplies', 'party_hp', 'loot'];

export const DilemmaTemplateSchema = BaseEntrySchema.extend({
  scale: z.enum(['minor', 'major', 'defining']),
  contexts: z.array(z.enum(DILEMMA_CONTEXTS)).min(1),
  regions: z.array(str).optional(),
  flavor: z.boolean().optional(),
  fixed: z.object({
    title: str,
    setup: str.max(600),
    options: z.array(EventOptionSchema).min(1).max(4),
    /** P9e: a `scapegoat` template fills its `{because}` placeholder from here, by where the decision came from (squad vote or her call). */
    because: z.object({ vote: str.max(200).optional(), her_call: str.max(200).optional() }).strict().optional(),
  }).passthrough().optional(),
  /** P6: the mechanic model writes the dilemma from this brief; `fixed` is the authored fallback. */
  generate: z.object({ brief: str.max(300) }).strict().optional(),
  optionCount: int.min(2).max(4).optional(),
  requiredRefs: z.object({
    units: int.min(1).max(4).optional(),
    factions: z.array(str).optional(),
    regions: z.array(str).optional(),
    clocks: z.array(str).optional(),
  }).strict().optional(),
  /** Declared flags the model may pick among (rule 6). */
  allowedFlags: z.array(str).optional(),
  constraints: z.object({ flagPerOption: z.boolean().optional() }).strict().optional(),
  /** P8: see ClockSchema. */
  family: str.optional(),
  /** P9e: the node may resolve itself when a soldier acts on her own. */
  herCall: HerCallSchema.optional(),
  /** P14b: how the units named in the resolved dilemma read it (character development); absent = nothing is recorded. */
  appraisal: ReadingSchema.optional(),
  contentTags,
}).superRefine((d, ctx) => {
  if (d.herCall !== undefined) {
    const bad = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path: ['herCall', ...path], message });
    if (d.scale !== 'minor' || d.contexts.length !== 1 || d.contexts[0] !== 'expedition_event' || d.generate !== undefined || d.flavor === true) {
      ctx.addIssue({ code: 'custom', path: ['herCall'], message: 'a her-call is only for a minor expedition_event template without generate or flavor' });
    }
    const ids = d.herCall.outcomes.map((o) => o.id).sort().join(',');
    if (ids !== 'bad,good') bad(['outcomes'], 'a her-call needs exactly one good and one bad outcome');
    d.herCall.outcomes.forEach((o, i) => {
      const costs = o.effects.some(isCostEffect);
      if (o.id === 'bad' && !costs) bad(['outcomes', i, 'effects'], 'the bad outcome needs at least one cost effect');
      if (o.id === 'good' && costs) bad(['outcomes', i, 'effects'], 'the good outcome carries no cost effect');
      o.effects.forEach((e, j) => {
        if (e.type === 'oversight_punish') bad(['outcomes', i, 'effects', j, 'type'], '"oversight_punish" only exists in a scapegoat dilemma');
        if (e.type === 'unit_event' && (e.targets === 'subject' || e.targets === 'witnesses')) bad(['outcomes', i, 'effects', j, 'targets'], `"${e.targets}" targets only exist in a scapegoat dilemma`);
      });
    });
  }
  if (d.scale === 'minor' && d.contexts.includes('expedition_event') && d.fixed === undefined) {
    ctx.addIssue({ code: 'custom', path: ['fixed'], message: 'a minor expedition event needs a fixed block' });
  }
  if (d.generate !== undefined) {
    const n = d.fixed?.options.length ?? 0;
    if (d.fixed === undefined || d.flavor === true || n < 2) {
      ctx.addIssue({ code: 'custom', path: ['fixed'], message: 'a generating template needs an authored fixed block (not flavor) with at least 2 options' });
    }
  }
  if (d.constraints?.flagPerOption === true && (d.allowedFlags?.length ?? 0) < (d.optionCount ?? 3)) {
    ctx.addIssue({ code: 'custom', path: ['allowedFlags'], message: 'flagPerOption needs at least as many allowedFlags as options' });
  }
  if (d.fixed === undefined) return;
  if (d.fixed.because !== undefined && !d.contexts.includes('scapegoat')) {
    ctx.addIssue({ code: 'custom', path: ['fixed', 'because'], message: '"because" only exists in a scapegoat dilemma' });
  }
  const options = d.fixed.options as Array<{ effects: WorldEffect[] }>;
  if (!d.contexts.includes('expedition_event')) {
    options.forEach((o, i) => o.effects.forEach((e, j) => {
      if (EXPEDITION_ONLY_EFFECTS.includes(e.type)) {
        ctx.addIssue({ code: 'custom', path: ['fixed', 'options', i, 'effects', j, 'type'], message: `"${e.type}" is only meaningful in an expedition event` });
      }
    }));
  }
  if (!d.contexts.includes('scapegoat')) {
    options.forEach((o, i) => o.effects.forEach((e, j) => {
      if (e.type === 'unit_event' && (e.targets === 'subject' || e.targets === 'witnesses')) {
        ctx.addIssue({ code: 'custom', path: ['fixed', 'options', i, 'effects', j, 'targets'], message: `"${e.targets}" targets only exist in a scapegoat dilemma` });
      }
      if (e.type === 'oversight_punish') ctx.addIssue({ code: 'custom', path: ['fixed', 'options', i, 'effects', j, 'type'], message: '"oversight_punish" only exists in a scapegoat dilemma' });
    }));
  }
  if (d.flavor === true) {
    if (options.length !== 1) ctx.addIssue({ code: 'custom', path: ['fixed', 'options'], message: 'a flavor event has exactly one option' });
    options.forEach((o, i) => {
      if (o.effects.length > 0) ctx.addIssue({ code: 'custom', path: ['fixed', 'options', i, 'effects'], message: 'a flavor option has no effects' });
    });
    return;
  }
  if (options.length < 2) ctx.addIssue({ code: 'custom', path: ['fixed', 'options'], message: 'an event needs 2 to 4 options' });
  options.forEach((o, i) => {
    if (!o.effects.some(isCostEffect)) {
      ctx.addIssue({ code: 'custom', path: ['fixed', 'options', i, 'effects'], message: 'every option must carry at least one cost effect' });
    }
  });
});

export const LoyaltySignSchema = BaseEntrySchema.extend({
  about: z.enum(['doubt', 'desertion', 'mutiny']),
  kind: z.enum(['dm', 'fact', 'talk']),
  level: z.union([z.literal(1), z.literal(2)]).optional(),
  text: str.max(200),
}).superRefine((s, ctx) => {
  if (s.about === 'mutiny' && s.level === undefined) {
    ctx.addIssue({ code: 'custom', path: ['level'], message: 'a mutiny sign needs a level (1 or 2)' });
  }
});

Object.assign(registrySchemas, {
  regions: RegionSchema,
  nodeTypes: NodeTypeSchema,
  clocks: ClockSchema,
  rewardTiers: RewardTierSchema,
  missionTemplates: MissionTemplateSchema,
  dilemmaTemplates: DilemmaTemplateSchema,
  loyaltySigns: LoyaltySignSchema,
});

// ---------------------------------------------------------------------------------------------
// P7a: glossary and entry descriptions. Both may carry `[[target]]` links (see `links.ts`); the
// length limits count the displayed text.

export const GLOSSARY_SHORT_MAX = 160;
export const GLOSSARY_LONG_MAX = 600;
export const DESCRIPTION_MAX = 600;

export const GlossarySchema = BaseEntrySchema.extend({
  term: str,
  short: str,
  long: str.optional(),
  see: z.array(str).optional(),
}).superRefine((g, ctx) => {
  if (stripLinks(g.short).length > GLOSSARY_SHORT_MAX) {
    ctx.addIssue({ code: 'custom', path: ['short'], message: `short is at most ${GLOSSARY_SHORT_MAX} characters` });
  }
  if (g.long !== undefined && stripLinks(g.long).length > GLOSSARY_LONG_MAX) {
    ctx.addIssue({ code: 'custom', path: ['long'], message: `long is at most ${GLOSSARY_LONG_MAX} characters` });
  }
});

// ---------------------------------------------------------------------------------------------
// P7: presence and unit tastes

const ARCHETYPES = ['frail', 'slight', 'average', 'fit', 'hardened'] as const;
const rank5 = int.min(1).max(5);
const rangeOf5 = z.tuple([rank5, rank5]).refine(([lo, hi]) => lo <= hi, 'range minimum must not exceed maximum');

/** One row of the presence table: what a factor of the commander contributes to P ∈ [−15, +15]. */
export const PresenceSchema = BaseEntrySchema.extend({
  factor: z.enum(['archetype', 'seasoning', 'authority']),
  /** An archetype id, or the rank/seasoning value as a string. */
  key: str,
  presence: int.min(-15).max(15),
}).strict();

/** How a unit reads the commander. Without `match` it always applies. Expression has no mechanical value except through these. */
export const TasteSchema = BaseEntrySchema.extend({
  name: str,
  description: str,
  match: z.object({
    archetypes: z.array(z.enum(ARCHETYPES)).min(1).optional(),
    expression: rangeOf5.optional(),
    seasoning: rangeOf5.optional(),
  }).strict().optional(),
  offsets: z.object({ trust: int.min(-20).max(20).optional(), affinity: int.min(-20).max(20).optional(), attraction: int.min(-20).max(20).optional() }).strict().optional(),
  /** Scales the commander's presence for this unit (0 = looks do not matter). */
  presenceMult: z.number().min(0).max(2).optional(),
  /** Scales how hard an off-image event lands with this unit. */
  imageMult: z.number().min(0).max(2).optional(),
}).strict();

/**
 * Which event types fit (`inImage`, data for the analysis text) or contradict (`offImage`) the picture a commander's
 * build gives. An archetype belongs to exactly one group (checked across the registry by the loader).
 */
export const ImageConsistencySchema = BaseEntrySchema.extend({
  archetypes: z.array(z.enum(ARCHETYPES)).min(1),
  inImage: z.array(str),
  offImage: z.array(str),
}).strict().superRefine((g, ctx) => {
  g.offImage.forEach((e, i) => {
    if (g.inImage.includes(e)) ctx.addIssue({ code: 'custom', path: ['offImage', i], message: `"${e}" cannot be both in-image and off-image` });
  });
});

// ---------------------------------------------------------------------------------------------
// P7: commander traits

const traitSocialStat = z.enum(['authority', 'insight', 'empathy', 'cunning']);

/**
 * What a trait does. The effects are read by the engine at a few hook points (start, join, growth, Crisis, calendar,
 * Leash, requisition); a trait changes the approach, not the power (the defect rule).
 */
export const TraitEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('social_rank'), stat: traitSocialStat, rank: rank5 }).strict(),
  z.object({
    type: z.literal('starting_trust'),
    amount: int.min(-40).max(40),
    ifValue: z.object({ axis: valueAxis, sign: z.enum(['+', '-']) }).strict().optional(),
  }).strict(),
  z.object({ type: z.literal('leash_weekly'), amount: int.min(-3).max(3) }).strict(),
  z.object({ type: z.literal('seasoning_start'), amount: int.min(-4).max(4) }).strict(),
  z.object({ type: z.literal('faction_start'), amount: int.min(-40).max(40) }).strict(),
  z.object({ type: z.literal('taste_attraction'), amount: int.min(-20).max(20) }).strict(),
  z.object({ type: z.literal('social_growth'), stat: traitSocialStat, mult: z.number().min(0.1).max(3) }).strict(),
  z.object({ type: z.literal('body_growth'), mult: z.number().min(0.1).max(3) }).strict(),
  z.object({ type: z.literal('early_trust_gain'), pct: int.min(-100).max(100) }).strict(),
  z.object({ type: z.literal('crisis_hp'), amount: int.min(-30).max(30) }).strict(),
  z.object({ type: z.literal('terminate_approval'), amount: z.number().min(-1).max(1) }).strict(),
  z.object({ type: z.literal('requisition_price'), pct: int.min(-90).max(100) }).strict(),
  z.object({ type: z.literal('activity_cost'), activityId: str, resource: z.enum(['credits', 'supplies', 'plyx']), amount: int.min(-5).max(5) }).strict(),
  z.object({ type: z.literal('activity_relation'), activityId: str, axis: z.enum(['trust', 'affinity', 'attraction']), amount: int.min(-10).max(10) }).strict(),
  z.object({ type: z.literal('relation_event_mult'), event: str, mult: z.number().min(0).max(3), ifTrigger: str.optional() }).strict(),
  z.object({ type: z.literal('night_slot') }).strict(),
  z.object({ type: z.literal('sleepless_rank'), stat: traitSocialStat, amount: int.min(-2).max(0) }).strict(),
  z.object({ type: z.literal('no_romance') }).strict(),
  z.object({ type: z.literal('platonic_threshold'), states: z.array(str).min(1), pct: int.min(0).max(50) }).strict(),
  z.object({ type: z.literal('unlock_state'), stateId: str }).strict(),
  // P12: special traits. The first three switch a whole system on; the engine asks `hasTraitEffect`, never the trait id.
  z.object({ type: z.literal('frequency') }).strict(),
  z.object({ type: z.literal('paranoia') }).strict(),
  z.object({ type: z.literal('debts') }).strict(),
  z.object({ type: z.literal('commander_flag'), flag: str }).strict(),
  z.object({ type: z.literal('unlock_order'), orderId: str }).strict(),
]);
export type TraitEffect = z.infer<typeof TraitEffectSchema>;

export const CommanderTraitSchema = BaseEntrySchema.extend({
  name: str,
  kind: z.enum(['regular', 'special']),
  description: str,
  upside: str,
  downside: str,
  effects: z.array(TraitEffectSchema),
  /** Free-form notes on where the engine looks at the trait (for authors). */
  hooks: z.array(str).optional(),
  exclusiveWith: z.array(str).optional(),
  requiresSettings: z.object({ desireBondDefects: z.literal(true).optional() }).strict().optional(),
  /** P12: the world must hold at least one corporation other than the commander's own. */
  requires: z.object({ otherCorporation: z.literal(true).optional() }).strict().optional(),
  /** P12: the "WHAT THIS CHANGES" lines of a special trait's card (no pronoun for the commander, lore §0). */
  changes: z.array(str.max(200)).min(1).max(8).optional(),
}).strict();

Object.assign(registrySchemas, {
  presence: PresenceSchema, tastes: TasteSchema, imageConsistency: ImageConsistencySchema, commanderTraits: CommanderTraitSchema,
});

// ---------------------------------------------------------------------------------------------
// P8: world options, disposition levels, stance effects and presets

const BREAKDOWN_TARGETS = ['self', 'default', 'allies', 'allies_commander', 'everyone'] as const;

/**
 * What a world choice does. The vocabulary is closed: the engine reads effects by type (`worldEffects`), never by
 * option or choice id. Tone of corporate messages and NPC reactions are lore lines and scene directives, not code.
 */
export const WorldOptionEffectSchema = z.discriminatedUnion('type', [
  /** The disposition level the world starts with. Exactly one option carries these. */
  z.object({ type: z.literal('disposition'), levelId: str }).strict(),
  /** Added to the corporation's weekly Leash authorizations (before the 0…5 clamp). */
  z.object({ type: z.literal('leash_weekly'), amount: int.min(-3).max(3) }).strict(),
  z.object({ type: z.literal('terminate_approval'), amount: z.number().min(-1).max(1) }).strict(),
  /** Multiplies the negative faction amounts of a failed command mission. */
  z.object({ type: z.literal('command_failure_mult'), mult: z.number().min(0.1).max(3) }).strict(),
  /** P12: multiplies how fast oversight traces a leak of sold intel back to the commander (the Web of Debts' `oversightSuspicion` gain). */
  z.object({ type: z.literal('oversight_scrutiny'), mult: z.number().min(0.1).max(3) }).strict(),
  z.object({ type: z.literal('mission_reward_pct'), pct: int.min(-90).max(100) }).strict(),
  /** The expression the world expects (1 very feminine … 5 very masculine); the commander's distance costs own-corporation standing. */
  z.object({ type: z.literal('expression_norm'), norm: rank5, standingPerStep: int.min(-10).max(10) }).strict(),
  z.object({ type: z.literal('enable_family'), family: str }).strict(),
  z.object({ type: z.literal('director_hint'), text: str.max(200) }).strict(),
  z.object({ type: z.literal('scene_directive'), text: str.max(300) }).strict(),
  /** P9: days after she first met the commander during which a soldier does no covert sabotage (0 = none). */
  z.object({ type: z.literal('acquaintance_grace'), days: int.min(0).max(14) }).strict(),
  /** P9b: how pushy the squad is: scales a leader's privileges, the demand chance and (the commander's side of) a vote. */
  z.object({
    type: z.literal('squad_power'),
    privilegeMult: z.number().min(0.25).max(3), demandMult: z.number().min(0.25).max(3), commanderVoteMult: z.number().min(0.25).max(2),
    /** DRAFT: the weight of each named soldier's own ballot (absent = 1). */
    soldierVoteMult: z.number().min(0.5).max(2).optional(),
  }).strict(),
  /** P9b: some of the commander's decisions go to a squad vote. */
  z.object({ type: z.literal('voting') }).strict(),
  /** Weights for the stance a generated grunt rolls under this choice. */
  z.object({
    type: z.literal('grunt_stances'),
    shares: z.number().min(0).max(20), indifferent: z.number().min(0).max(20), opposes: z.number().min(0).max(20),
  }).strict(),
]);
export type WorldOptionEffect = z.infer<typeof WorldOptionEffectSchema>;

export const WorldChoiceSchema = z.object({
  id: z.string().regex(ID_PATTERN, 'id must match ^[a-z0-9_:.-]+$'),
  label: str,
  description: str.max(DESCRIPTION_MAX),
  /** One short line of the WORLD SETTINGS context block; a choice without one (the acquaintance period) adds nothing to the prompt. */
  lore: str.max(TUNING.disposition.loreMaxChars).optional(),
  effects: z.array(WorldOptionEffectSchema),
}).strict();
export type WorldChoice = z.infer<typeof WorldChoiceSchema>;

export const WorldOptionSchema = BaseEntrySchema.extend({
  label: str,
  group: str,
  /** A live option can change during the campaign; every other option is fixed when the campaign is built. */
  live: z.boolean(),
  /** The option sets each unit's own stance toward it (P8 §3.1). */
  squadStance: z.boolean().optional(),
  default: str,
  description: str.max(DESCRIPTION_MAX),
  choices: z.array(WorldChoiceSchema).min(2),
}).strict();

export const DispositionLevelSchema = BaseEntrySchema.extend({
  name: str,
  description: str.max(DESCRIPTION_MAX),
  rank: int.min(1).max(5),
  start: z.object({ trust: int.min(-40).max(40), affinity: int.min(-40).max(40) }).strict(),
  gainMult: z.number().min(0.1).max(3),
  lossMult: z.number().min(0.1).max(3),
  minConfidence: z.object({ gain: z.number().min(0).max(1), loss: z.number().min(0).max(1) }).strict(),
  bandShift: int.min(-20).max(20),
  bandExitExtra: int.min(0).max(20),
  stageDaysMult: z.number().min(0.1).max(4),
  refusalMult: z.number().min(0).max(4),
  desertionMult: z.number().min(0).max(4),
  mutiny: z.object({
    enabled: z.boolean(),
    states: z.array(str),
    minDaysInState: int.min(0).max(14),
    minSigns: int.min(1).max(6),
  }).strict(),
  breakdownTarget: z.enum(BREAKDOWN_TARGETS),
  bigGestureMult: z.number().min(1).max(4),
  /** P9: the unit's Impunity base (0…100; a pack that omits it reads `TUNING.impunity.defaultBase`). */
  impunityBase: z.number().min(0).max(100).optional(),
}).strict();

export const STANCES = ['shares', 'indifferent', 'opposes'] as const;
export type Stance = (typeof STANCES)[number];

/** What a unit's own stance toward a world option does to her. Closed vocabulary, read by `stanceEffects`. */
export const StanceEffectSchema = z.discriminatedUnion('type', [
  /** Start offsets; with `perNormStep` they are multiplied by the commander's distance from the norm. */
  z.object({ type: z.literal('start_offset'), trust: int.min(-40).max(40).optional(), affinity: int.min(-40).max(40).optional(), perNormStep: z.boolean().optional() }).strict(),
  /** Trust and Affinity gains of commander events shrink by this share per step of distance (fading with days known). */
  z.object({ type: z.literal('gain_damp'), pctPerStep: int.min(0).max(100) }).strict(),
  /** A start offset for a commander who breaks the norm by at least `minSteps`. */
  z.object({ type: z.literal('distance_bonus'), minSteps: int.min(1).max(4), affinity: int.min(-40).max(40) }).strict(),
  z.object({ type: z.literal('value_shift'), axis: valueAxis, amount: int.min(-3).max(3) }).strict(),
  z.object({ type: z.literal('event_stress'), events: z.array(str).min(1), amount: int.min(0).max(20) }).strict(),
  z.object({ type: z.literal('news_stress_mult'), mult: z.number().min(0).max(4) }).strict(),
  /** `{name}` is the unit's name; `whileEarly` shows it only while the first-impression weight is above 0.5. */
  z.object({ type: z.literal('directive'), text: str.max(300), whileEarly: z.boolean().optional() }).strict(),
  /** Shown when a `shares` and an `opposes` unit are both present (narration only in v1). */
  z.object({ type: z.literal('friction_directive'), text: str.max(300) }).strict(),
]);
export type StanceEffect = z.infer<typeof StanceEffectSchema>;

export const StanceEntrySchema = BaseEntrySchema.extend({
  option: str,
  stance: z.enum(STANCES),
  strength: z.union([z.literal(1), z.literal(2)]),
  effects: z.array(StanceEffectSchema),
}).strict();

export const WorldPresetSchema = BaseEntrySchema.extend({
  name: str,
  description: str.max(DESCRIPTION_MAX),
  choices: z.record(str, str),
}).strict();

export const COMMAND_STANCE_IDS = ['disciplined', 'defiant_loyal', 'fearful', 'open_defiance', 'indifferent'] as const;

/** P9: one of the five stances Trust × Impunity gives a unit. `{name}` is the unit's name, `{reason}` the reason of a refusal. */
export const CommandStanceSchema = BaseEntrySchema.extend({
  id: z.enum(COMMAND_STANCE_IDS),
  name: str,
  description: str.max(DESCRIPTION_MAX),
  directive: str.max(300),
  refusal: str.max(300),
  /** The unit hides her refusals and sabotages quietly instead. */
  covert: z.boolean().optional(),
  demandWeight: z.number().min(0).max(3),
  /** P9b: added to her ballot in a squad vote (a disciplined or fearful unit goes along, an openly defiant one does not). */
  voteBias: z.number().min(-3).max(3).optional(),
  /** P9c: a unit in this stance hides a bad injury from the commander (a squad secret when a run ends). */
  hidesInjury: z.boolean().optional(),
  /** P9c: a unit in this stance lets a squad secret slip at the end of a scene. */
  secretSlip: z.boolean().optional(),
}).strict();

/** What a punishment does besides moving numbers. The vocabulary is closed; the engine reads effects by type, never by id. */
export const PunishmentEffectSchema = z.discriminatedUnion('type', [
  /** The unit is locked up: no scene, companion or expedition for a number of days the commander picks in this range. */
  z.object({ type: z.literal('confine'), minDays: int.min(1).max(7), maxDays: int.min(1).max(7) }).strict(),
  /** No leave: she cannot be the companion of an activity except `talk` and `medbay`. */
  z.object({ type: z.literal('no_leave'), days: int.min(1).max(7) }).strict(),
  /** Excluded from the next expedition. */
  z.object({ type: z.literal('bench') }).strict(),
  /** Works one slot: no scene, companion or expedition during it. */
  z.object({ type: z.literal('duty') }).strict(),
  /** The base gains (or pays) a resource. */
  z.object({ type: z.literal('resource'), resource: z.enum(['credits', 'supplies', 'plyx']), amount: int }).strict(),
]);
export type PunishmentEffect = z.infer<typeof PunishmentEffectSchema>;

const EXCLUSIVE_EFFECTS: readonly string[] = ['confine', 'no_leave', 'bench', 'duty'];

export const PunishmentSchema = BaseEntrySchema.extend({
  label: str,
  description: str.max(DESCRIPTION_MAX),
  severity: int.min(1).max(4),
  /** Added to her Impunity record (negative: it deters). */
  impunityDelta: int.min(-40).max(0),
  deltas: z.object({ trust: z.number(), affinity: z.number(), stress: z.number() }).strict(),
  sideEffects: z.array(PunishmentEffectSchema),
  /** A tag among her likes, dislikes or triggers multiplies the deltas and the deterrence (the highest match wins). */
  perception: z.array(z.object({ tag: str, multiplier: z.number().min(0.5).max(3) }).strict()),
  /** `none` skips the disposition's loss multiplier (a cost the world cannot soften or sharpen). */
  dispositionScaling: z.enum(['loss', 'none']),
  contentTags,
}).strict().superRefine((p, ctx) => {
  if (p.sideEffects.filter((e) => EXCLUSIVE_EFFECTS.includes(e.type)).length > 1) {
    ctx.addIssue({ code: 'custom', path: ['sideEffects'], message: 'at most one of confine, no_leave, bench and duty per punishment' });
  }
  p.sideEffects.forEach((e, i) => {
    if (e.type === 'confine' && e.minDays > e.maxDays) ctx.addIssue({ code: 'custom', path: ['sideEffects', i], message: 'minDays must not exceed maxDays' });
  });
});

/** What granting a demand costs. The vocabulary is closed; the engine reads costs by type, never by template id. */
export const DemandCostSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('resource'), resource: z.enum(['credits', 'supplies', 'plyx']), amount: int.min(1).max(500) }).strict(),
  /** Every other living unit gains this much stress. */
  z.object({ type: z.literal('squad_stress'), amount: int.min(1).max(30) }).strict(),
  z.object({ type: z.literal('relation_flag'), flagId: str }).strict(),
  /** She is left out of the next expedition. */
  z.object({ type: z.literal('bench_self') }).strict(),
  /** An unworn item of the commander's stash of at least this rarity goes to her. */
  z.object({ type: z.literal('equip_item'), slot: z.enum(['weapon', 'upper', 'lower']), minRarity: z.enum(RARITIES) }).strict(),
  z.object({ type: z.literal('reveal_crime') }).strict(),
  /** P9d: she comes to the commander tonight (a `want_visit` night knock at priority 90). */
  z.object({ type: z.literal('night_visit') }).strict(),
  /** One other named living unit (the one with the lowest Affinity) takes an event from the commander. */
  z.object({ type: z.literal('other_unit_event'), event: z.enum(EVENT_TYPES), severity: z.enum(['minor', 'moderate', 'major', 'extreme']) }).strict(),
]);
export type DemandCost = z.infer<typeof DemandCostSchema>;

const intRange = (lo: number, hi: number) => z.tuple([int.min(lo).max(hi), int.min(lo).max(hi)]).refine(([a, b]) => a <= b, 'the range must run from low to high');

export const DemandTemplateSchema = BaseEntrySchema.extend({
  kind: z.enum(['resource', 'privilege', 'exclusion', 'item', 'information', 'interpersonal', 'desire']),
  /** Her words, a fallback when the wording call is off or fails. `{name}` is her name. */
  text: str.max(TUNING.demands.textMax),
  description: str.max(DESCRIPTION_MAX),
  grantCost: z.array(DemandCostSchema),
  grantDeltas: z.object({ trust: z.number(), affinity: z.number() }).strict(),
  refuseDeltas: z.object({ trust: z.number(), affinity: z.number(), stress: z.number() }).strict(),
  /** A costly grant counts as a big gesture of the commander. */
  costly: z.boolean().optional(),
  conditions: z.object({
    stances: z.array(z.enum(COMMAND_STANCE_IDS)).optional(),
    impunity: intRange(0, 100).optional(),
    dispositionRanks: intRange(1, 5).optional(),
    tagsAny: z.array(str).optional(),
    statesAny: z.array(str).optional(),
    flagsNone: z.array(str).optional(),
    /** P9d: only while her publicity preference differs from the relationship's level. */
    publicityMismatch: z.literal(true).optional(),
  }).strict(),
  weight: z.number().min(0.1).max(20),
  /** P9d: granting it lowers her Want by this much at once. */
  wantRelief: int.min(0).max(100).optional(),
  contentTags,
}).strict();

const deedCounter = z.enum(DEED_COUNTERS);

/** A nickname the squad can give the commander from counted deeds (P9 §6). */
export const ReputationSchema = BaseEntrySchema.extend({
  name: str,
  /** One nickname per group is active at a time. */
  group: str,
  description: str.max(DESCRIPTION_MAX),
  /** P15: the squad's average Regard it fits (a nickname of the dynamic; absent = any). `reputationDayStep` queues only the one whose tone matches. */
  tone: z.enum(['respectful', 'pitying', 'mocking']).optional(),
  pattern: z.object({
    sum: z.array(deedCounter).min(1),
    min: int.min(1),
    against: z.array(deedCounter).min(1).optional(),
    /** With `against`: `Σ sum / (Σ sum + Σ against)` must reach this. */
    minShare: z.number().min(0).max(1).optional(),
  }).strict(),
  effects: z.object({
    impunityBase: z.number().min(-40).max(40).optional(),
    directive: str.max(200).optional(),
    valueReactions: z.array(z.object({ axis: valueAxis, sign: z.enum(['+', '-']), weight: int.min(-3).max(3) }).strict()).optional(),
  }).strict(),
}).strict().superRefine((r, ctx) => {
  if (r.pattern.minShare !== undefined && r.pattern.against === undefined) ctx.addIssue({ code: 'custom', path: ['pattern', 'minShare'], message: 'minShare needs against' });
});

Object.assign(registrySchemas, {
  commandStances: CommandStanceSchema,
  reputations: ReputationSchema,
  demandTemplates: DemandTemplateSchema,
  punishments: PunishmentSchema,
  worldOptions: WorldOptionSchema, dispositionLevels: DispositionLevelSchema, stanceEffects: StanceEntrySchema, worldPresets: WorldPresetSchema,
});

// ---------------------------------------------------------------------------------------------
// P10: hub rooms

/** Who a room can be asked to host regardless of the routine: the injured, the confined, the soldier on duty, anyone at night. */
export const HUB_HOSTS = ['injured', 'confined', 'duty', 'night'] as const;
export type HubHost = (typeof HUB_HOSTS)[number];

const pct = z.number().min(0).max(100);

/** A room of the outpost cross-section. Code reads rooms by `hosts`, `activityIds` and `sceneLocationId`, never by id. */
export const HubRoomSchema = BaseEntrySchema.extend({
  label: str,
  description: str.max(DESCRIPTION_MAX),
  sceneLocationId: str,
  /** The room is skipped by the routine pick while this facility is below level 1 (absent = always there). */
  facilityId: str.optional(),
  /** Activities offered in the room panel. */
  activityIds: z.array(str).optional(),
  /** Routine weight per slot (0 = nobody picks it then). */
  weights: z.object({
    morning: int.min(0).max(5).optional(), afternoon: int.min(0).max(5).optional(),
    evening: int.min(0).max(5).optional(), night: int.min(0).max(5).optional(),
  }).strict(),
  /** A soldier who likes one of these tags weighs the room up. */
  likeTags: z.array(str).optional(),
  hosts: z.array(z.enum(HUB_HOSTS)).optional(),
  commanderCell: z.boolean().optional(),
}).strict();

Object.assign(registrySchemas, { hubRooms: HubRoomSchema });

// ---------------------------------------------------------------------------------------------
// P10d: the plan of the base (every room, corridor and staircase of every floor; geometry in plan units)

export const PLAN_FLOORS = ['ground', 'upper', 'roof'] as const;
export type PlanFloor = (typeof PLAN_FLOORS)[number];
/** The plan's box: 1000 × 625 units, the 16:10 hub stage. */
export const PLAN_W = 1000;
export const PLAN_H = 625;
/** Kinds whose walls are the outline of their union (no wall where two meet); a staircase may also sit inside another room. */
export const PLAN_OPEN_KINDS = ['corridor', 'lobby'] as const;

const planNum = z.number().min(0);
const PlanDoorSchema = z.object({ x: planNum, y: planNum, side: z.enum(['n', 's', 'e', 'w']), size: z.number().min(4).max(40) }).strict();

/**
 * One place on the plan. Open (clickable, lit) when `hubRoomId` resolves, or it is a cabin, an open space or a staircase;
 * otherwise drawn closed. A door's `side` is the way its leaf swings; the door lies on an edge of its room. Read by
 * `floor`, `kind`, `hubRoomId`, `cabin`, `stairTo`, never by id.
 */
export const PlanRoomSchema = BaseEntrySchema.extend({
  label: str.max(24),
  shortLabel: str.max(10).optional(),
  floor: z.enum(PLAN_FLOORS),
  rect: z.object({ x: planNum, y: planNum, w: z.number().gt(0), h: z.number().gt(0) }).strict()
    .refine((r) => r.x + r.w <= PLAN_W && r.y + r.h <= PLAN_H, `the rect must stay inside the plan (x + w at most ${PLAN_W}, y + h at most ${PLAN_H})`),
  kind: z.string().regex(/^[a-z_]+$/, 'a kind is lower-case letters and underscores'),
  description: str.max(DESCRIPTION_MAX),
  hubRoomId: str.optional(),
  sceneLocationId: str.optional(),
  cabin: z.enum(['unit', 'commander']).optional(),
  stairTo: z.enum(PLAN_FLOORS).optional(),
  doors: z.array(PlanDoorSchema).max(8).optional(),
  labelAt: z.object({ x: planNum, y: planNum }).strict().optional(),
  /** P17 §2 / P15a: what the place offers (`desk`, `bunk`, `lock`, `thin_walls`, …). Data only in P10d. */
  affordances: z.array(z.string().regex(/^[a-z_]+$/)).max(16).optional(),
}).strict().superRefine((e, ctx) => {
  if (e.cabin !== undefined && e.kind !== 'cabin') ctx.addIssue({ code: 'custom', path: ['cabin'], message: 'only a room of kind "cabin" is a cabin' });
  if (e.stairTo !== undefined && e.kind !== 'stair') ctx.addIssue({ code: 'custom', path: ['stairTo'], message: 'only a room of kind "stair" leads to another floor' });
  if (e.stairTo !== undefined && e.stairTo === e.floor) ctx.addIssue({ code: 'custom', path: ['stairTo'], message: 'a staircase leads to another floor' });
  const { x, y, w, h } = e.rect;
  (e.doors ?? []).forEach((d, i) => {
    const near = (a: number, b: number): boolean => Math.abs(a - b) < 0.01;
    const horizontal = d.side === 'n' || d.side === 's';
    const onEdge = horizontal
      ? (near(d.y, y) || near(d.y, y + h)) && d.x >= x - 0.01 && d.x + d.size <= x + w + 0.01
      : (near(d.x, x) || near(d.x, x + w)) && d.y >= y - 0.01 && d.y + d.size <= y + h + 0.01;
    if (!onEdge) ctx.addIssue({ code: 'custom', path: ['doors', i], message: `the door must lie on ${horizontal ? 'the top or bottom' : 'the left or right'} edge of the room, within it` });
  });
});
registrySchemas.planRooms = PlanRoomSchema;

// ---------------------------------------------------------------------------------------------
// P10: device skins

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'a color is #rrggbb');
export const CSS_PRESETS = ['ccp_standard', 'kestrel', 'vesper'] as const;

/**
 * The casing of the PDA. A `css` skin names one of the presets the stylesheet draws; an `image` skin is a rendered frame
 * with a transparent cut-out, and `screenRect` (pixels in the frame image) says where the screen sits, so the screen
 * keeps its place at any window size. Code reads skins by `bindTo` and `kind`, never by id (the fallback `ccp_standard`
 * excepted).
 */
export const DeviceSkinSchema = BaseEntrySchema.extend({
  name: str,
  description: str.max(DESCRIPTION_MAX),
  kind: z.enum(['css', 'image']),
  cssPreset: z.enum(CSS_PRESETS).optional(),
  frameImage: str.optional(),
  frameSize: z.object({ w: int.min(1), h: int.min(1) }).strict().optional(),
  screenRect: z.object({ x: int.min(0), y: int.min(0), w: int.min(1), h: int.min(1) }).strict().optional(),
  overlay: z.object({ image: str, blend: z.enum(['overlay', 'multiply']), opacity: z.number().min(0).max(1) }).strict().optional(),
  ledColor: hex,
  accent: hex,
  /** The model name engraved on the casing. */
  label: str.optional(),
  /** P10b: where stickers sit on the casing, in percent of the device (`rot` in degrees); absent = none (an image skin must declare its own). */
  stickerSpots: z.array(z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), rot: z.number().min(-45).max(45) }).strict()).max(6).optional(),
  /** At most one key: the corporation, commander trait or unlock flag that brings the skin. */
  bindTo: z.object({ corporationId: str.optional(), traitId: str.optional(), unlockFlag: str.optional() }).strict()
    .refine((b) => Object.values(b).filter((v) => v !== undefined).length <= 1, 'bindTo takes at most one of corporationId, traitId and unlockFlag').optional(),
}).strict().superRefine((skin, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  if (skin.kind === 'css') {
    if (skin.cssPreset === undefined) issue(['cssPreset'], 'a css skin needs a cssPreset');
    return;
  }
  if (skin.frameImage === undefined) issue(['frameImage'], 'an image skin needs a frameImage');
  if (skin.frameSize === undefined) issue(['frameSize'], 'an image skin needs a frameSize');
  if (skin.screenRect === undefined) issue(['screenRect'], 'an image skin needs a screenRect');
  if (skin.frameSize && skin.screenRect && (skin.screenRect.x + skin.screenRect.w > skin.frameSize.w || skin.screenRect.y + skin.screenRect.h > skin.frameSize.h)) {
    issue(['screenRect'], 'the screenRect must stay inside the frame (x + w and y + h within frameSize)');
  }
});

Object.assign(registrySchemas, { deviceSkins: DeviceSkinSchema });

// ---------------------------------------------------------------------------------------------
// P10: UI sounds (not player-visible: no description, not in DESCRIBED_REGISTRIES)

/** The sounds the shell knows how to ask for; code names these ids, never an entry's contents. */
export const SOUND_IDS = ['open', 'close', 'tab', 'notify', 'alert', 'stamp', 'typing', 'hum', 'knock', 'bell', 'steps'] as const; // P15a: bell (a bell collar) and steps (someone at the door)

/**
 * One UI sound. v1 ships no audio files: `synth` describes a WebAudio fallback (a wave, a frequency sweep, a length and a
 * peak gain), and `file` (a path under the extension) is played instead when present and it loads.
 */
export const UiSoundSchema = BaseEntrySchema.extend({
  id: z.enum(SOUND_IDS),
  file: str.optional(),
  synth: z.object({
    wave: z.enum(['sine', 'square', 'triangle', 'sawtooth']),
    freq: z.number().positive().max(20000),
    endFreq: z.number().positive().max(20000).optional(),
    ms: int.min(1).max(5000),
    gain: z.number().min(0).max(1),
  }).strict(),
}).strict();

Object.assign(registrySchemas, { uiSounds: UiSoundSchema });

// ---------------------------------------------------------------------------------------------
// P11: prologues and UI unlocks

/** The commander-creation fields an intake step can own (a closed enum: the wizard methods behind them are fixed code). */
export const PROLOGUE_FIELDS = ['crime', 'name', 'body', 'expression', 'seasoning', 'traits'] as const;
export type PrologueField = (typeof PROLOGUE_FIELDS)[number];
export const STEP_KINDS = ['paper_form', 'scene', 'expedition', 'dossier', 'guided_slot', 'free'] as const;
export type StepKind = (typeof STEP_KINDS)[number];
/** What the engine checks before it lets a step complete (see `onboarding/complete_step`). */
export const COMPLETIONS = ['manual', 'no_open_scene', 'all_spoken', 'tutorial_returned', 'debriefed', 'next_day'] as const;
export type Completion = (typeof COMPLETIONS)[number];
/** Steps played in the setup wizard (in memory) rather than in the campaign. */
export const WIZARD_KINDS: readonly StepKind[] = ['paper_form', 'dossier'];
const isWizardKind = (k: StepKind): boolean => WIZARD_KINDS.includes(k);

/** The tabs of the PDA. Kept in step with `TAB_IDS` in `ui/shell/tabs.ts` by a test (the content layer must not import the UI). */
export const UI_TAB_IDS = ['squad', 'ops', 'map', 'comms', 'base', 'inv', 'log', 'sys'] as const;

export const PrologueStepSchema = z.object({
  kind: z.enum(STEP_KINDS),
  voice: z.enum(['terminal', 'corporate', 'paper', 'personal']),
  title: str.max(60).optional(),
  authoredText: z.array(str.max(400)).max(8).optional(),
  /** P11b: the text a cold open shows instead of `title` and `authoredText` when the campaign starts with a head start (the squad already knows the commander). */
  headStartTitle: str.max(60).optional(),
  headStartText: z.array(str.max(400)).max(8).optional(),
  /** Named lines the screens look up by key (`ask_crime`, `dictate`...); `{KEY}` placeholders are filled by code. */
  lines: z.record(z.string().regex(ID_PATTERN), str.max(200)).optional(),
  /** P11b: lines that replace the same keys of `lines` when the campaign starts with a head start (the others stay). */
  headStartLines: z.record(z.string().regex(ID_PATTERN), str.max(200)).optional(),
  /** The scene goal, injected as a hard directive while the step's scene runs. */
  directive: str.max(400).optional(),
  fields: z.array(z.enum(PROLOGUE_FIELDS)).optional(),
  expeditionId: str.optional(),
  regionId: str.optional(),
  locationId: str.optional(),
  exchangeCap: int.min(1).max(12).optional(),
  /** One scene per living named unit instead of one scene for all. */
  perUnit: z.boolean().optional(),
  /** P13: the scene is held with the warden alone (the step is skipped while nobody holds the leash). */
  participants: z.literal('warden').optional(),
  objective: str.max(100).optional(),
  hints: z.array(z.object({
    id: str, screen: z.enum(['combat', 'expedition']), glossaryId: str, text: str.max(200),
  }).strict()).max(4).optional(),
  nightKnock: z.object({
    framing: str.max(200),
    ignore: z.object({ event: str, severity: severityEnum }).strict(),
  }).strict().optional(),
  completion: z.enum(COMPLETIONS),
  skippable: z.boolean(),
}).strict();
export type PrologueStep = z.infer<typeof PrologueStepSchema>;

/**
 * One prologue: wizard steps first (the last of them the only dossier), campaign steps next, `free` last. A prologue is
 * an object of steps plus `order` so that `extends` can merge a skeleton with per-start overrides (arrays are replaced
 * by the loader, objects merge). `startId` is absent on the skeleton and present on an entry a start uses.
 */
export const PrologueSchema = BaseEntrySchema.extend({
  startId: str.optional(),
  /** P13: the entry a start uses when the campaign is in this mode (`prologueFor` falls back to the one without a mode). */
  mode: z.literal('leashswap').optional(),
  order: z.array(str).min(2),
  steps: z.record(z.string().regex(ID_PATTERN), PrologueStepSchema),
}).superRefine((p, ctx) => {
  const issue = (path: Array<string | number>, message: string) => ctx.addIssue({ code: 'custom', path, message });
  let broken = false;
  p.order.forEach((id, i) => {
    if (!(id in p.steps)) { issue(['order'], `order lists "${id}" (position ${i + 1}), which is not in steps`); broken = true; }
  });
  for (const id of Object.keys(p.steps)) {
    if (!p.order.includes(id)) issue(['order'], `step "${id}" is missing from order`);
  }
  if (new Set(p.order).size !== p.order.length) issue(['order'], 'order lists a step twice');
  if (broken) return;
  const list = p.order.map((id) => ({ id, step: p.steps[id] }));

  // wizard steps first, exactly one dossier and it ends them
  const firstCampaign = list.findIndex((x) => !isWizardKind(x.step.kind));
  const lateWizard = list.findIndex((x, i) => firstCampaign >= 0 && i > firstCampaign && isWizardKind(x.step.kind));
  if (lateWizard >= 0) issue(['order'], `wizard step "${list[lateWizard].id}" comes after a campaign step (paper forms and the dossier must all be first)`);
  const dossiers = list.filter((x) => x.step.kind === 'dossier');
  const wizardSteps = list.filter((x) => isWizardKind(x.step.kind));
  if (dossiers.length !== 1) issue(['order'], `a prologue has exactly one dossier step (found ${dossiers.length})`);
  else if (wizardSteps[wizardSteps.length - 1].id !== dossiers[0].id) issue(['order'], `the dossier "${dossiers[0].id}" must be the last wizard step`);
  const frees = list.filter((x) => x.step.kind === 'free');
  if (frees.length !== 1 || list[list.length - 1].step.kind !== 'free') issue(['order'], 'a prologue ends with exactly one free step');

  // each creation field at most once; every field once for an entry a start uses
  const seen = new Map<string, number>();
  for (const { step } of list) for (const f of step.fields ?? []) seen.set(f, (seen.get(f) ?? 0) + 1);
  for (const [f, n] of seen) if (n > 1) issue(['steps'], `field "${f}" is listed more than once`);
  if (p.startId !== undefined) {
    for (const f of PROLOGUE_FIELDS) if (!seen.has(f)) issue(['steps'], `no step asks for the field "${f}" (an entry with startId covers every field once)`);
  }

  for (const { id, step } of list) {
    const at = (field: string) => ['steps', id, field];
    if (step.kind === 'scene') {
      if (step.locationId === undefined) issue(at('locationId'), 'a scene step needs a locationId');
      if (step.exchangeCap === undefined) issue(at('exchangeCap'), 'a scene step needs an exchangeCap');
    }
    if (step.kind === 'expedition') {
      if (step.expeditionId === undefined) issue(at('expeditionId'), 'an expedition step needs an expeditionId');
      if (step.regionId === undefined) issue(at('regionId'), 'an expedition step needs a regionId');
    }
    if (step.kind === 'paper_form' && step.completion !== 'manual') issue(at('completion'), 'a paper_form completes manually');
    if (step.perUnit === true && step.completion !== 'all_spoken') issue(at('completion'), 'a perUnit step completes with all_spoken');
  }
});
export type Prologue = z.infer<typeof PrologueSchema>;

/** A PDA tab opens when its condition holds; a tab with no row is always open. */
export const UiUnlockSchema = BaseEntrySchema.extend({
  target: z.object({ tab: z.enum(UI_TAB_IDS) }).strict(),
  condition: z.object({ minDay: int.min(1).optional(), afterStep: str.optional() }).strict()
    .refine((c) => c.minDay !== undefined || c.afterStep !== undefined, 'a condition needs minDay or afterStep'),
  /** Shown in the terminal voice when the tab opens. */
  notice: str.max(160),
}).strict();

Object.assign(registrySchemas, { prologues: PrologueSchema, uiUnlocks: UiUnlockSchema });

// ---------------------------------------------------------------------------------------------
// P9d: content categories. Every category is off until the player turns it on (campaign `content.enabled`).

export const ContentCategorySchema = BaseEntrySchema.extend({
  label: str.max(40),
  description: str.max(200),
  /** Display order (setup and SYS list them by it). */
  order: int,
  /** P15a: categories that must be on for this one to be (watersports needs bodily fluids). Checked in `refs.ts`: known ids, no cycle. */
  requires: z.array(str).optional(),
}).strict();

registrySchemas.contentCategories = ContentCategorySchema;

/**
 * A rule a leading partner can propose to the commander (P9d §5). `check` says how compliance is judged: the engine itself
 * (`daily_contact`, `run_without_asking`, and P9c's `token_wear`: wearing another soldier's token) or only what the mechanic model reads in the talk (`intent`). `keepDeltas` and
 * `breakDeltas` are what a kept and a broken rule do to her.
 */
export const RelationshipRuleTemplateSchema = BaseEntrySchema.extend({
  text: str.max(160),
  description: str.max(DESCRIPTION_MAX),
  check: z.enum(['daily_contact', 'run_without_asking', 'intent', 'token_wear']),
  keepDeltas: z.object({ trust: z.number(), affinity: z.number() }).strict(),
  breakDeltas: z.object({ trust: z.number(), affinity: z.number(), stress: z.number() }).strict(),
  conditions: z.object({
    minLead: z.enum(['assertive', 'dominant']).optional(),
    tiers: z.array(z.enum(['romantic', 'close'])).min(1).optional(),
  }).strict(),
  weight: z.number().min(0.1).max(20),
  contentTags,
  /** P16: a rule that asks for permission (read by field, never by id): the commander asks before something it covers. */
  asks: z.literal('permission').optional(),
  /** P16: a rule only a holder's practices propose (a protocol, a denial): P9d's own daily roll and P15's aftermath never offer it. */
  practice: z.literal(true).optional(),
}).strict();

registrySchemas.relationshipRuleTemplates = RelationshipRuleTemplateSchema;

/**
 * A decision the squad can vote on (P9b §2). `lean` is the kind's base lean; `features` and `subjects` add to it for a mission's
 * danger and command source, and for a ration mode or a scapegoat option. `reasons` are the one-line templates of a ballot,
 * by the term that moved it most; every line names the voter (`{name}`) and the values line may name the axis (`{axis}`).
 */
const ReasonLine = z.object({ for: str.max(120), against: str.max(120) }).strict();
export const VoteKindSchema = BaseEntrySchema.extend({
  id: z.enum(VOTE_KINDS),
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  lean: VoteLeanSchema,
  features: z.object({ danger: VoteLeanSchema.optional(), command: VoteLeanSchema.optional() }).strict().optional(),
  subjects: z.record(VoteLeanSchema).optional(),
  reasons: z.object(Object.fromEntries(BALLOT_TERMS.map((t) => [t, ReasonLine])) as Record<(typeof BALLOT_TERMS)[number], typeof ReasonLine>).strict(),
}).strict().superRefine((k, ctx) => {
  for (const term of BALLOT_TERMS) {
    for (const side of ['for', 'against'] as const) {
      if (!k.reasons[term][side].includes('{name}')) ctx.addIssue({ code: 'custom', path: ['reasons', term, side], message: 'a reason line must name the voter with {name}' });
    }
  }
});
export type VoteKindEntry = z.infer<typeof VoteKindSchema>;

registrySchemas.voteKinds = VoteKindSchema;

/** A visible feat that restores the commander's authority in the eyes of outsiders for 14 days (P9b §4). `trigger` is a closed vocabulary the engine reads. */
export const OutsideFeatSchema = BaseEntrySchema.extend({
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  trigger: z.enum(OUTSIDE_TRIGGERS),
}).strict();
registrySchemas.outsideFeats = OutsideFeatSchema;

/**
 * P13: what a commander punishment does (a closed vocabulary the engine reads by `type`, never by the punishment's id): stress on the
 * commander, a restriction (`no_leave`: no activity with a companion but talk and medbay; `no_dms`: no messages), lost slots (at most to the
 * evening), a rise of every other unit's Impunity record, an injury chance that falls with endurance, or the Leash on the commander.
 */
export const CommanderPunishmentEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('commander_stress'), amount: int.min(1).max(100) }).strict(),
  z.object({ type: z.literal('restrict'), what: z.enum(['no_leave', 'no_dms']), days: int.min(1).max(7) }).strict(),
  z.object({ type: z.literal('lose_slots'), min: int.min(1).max(3), max: int.min(1).max(3) }).strict(),
  z.object({ type: z.literal('squad_record'), amount: int.min(1).max(30) }).strict(),
  z.object({ type: z.literal('injury'), chance: num.min(0).max(1), perEndurance: num.min(0).max(1), days: int.min(1).max(14) }).strict(),
  z.object({ type: z.literal('leash'), kind: z.enum(['compel', 'suppress']) }).strict(),
]);
export type CommanderPunishmentEffect = z.infer<typeof CommanderPunishmentEffectSchema>;

/** P13: what the warden may do to the commander (the mirror of `punishments`). `defianceDelta` deters (≤ 0); `satisfactionDelta` pleases her (≥ 0). */
export const CommanderPunishmentSchema = BaseEntrySchema.extend({
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  severity: int.min(1).max(4),
  defianceDelta: int.max(0),
  satisfactionDelta: int.min(0),
  effects: z.array(CommanderPunishmentEffectSchema).min(1),
  /** P9d gate: the warden never picks it while a tag is switched off or among her own limits (`pickPunishment`). */
  contentTags,
}).strict().superRefine((p, ctx) => {
  p.effects.forEach((e, i) => {
    if (e.type === 'lose_slots' && e.min > e.max) ctx.addIssue({ code: 'custom', path: ['effects', i], message: 'min is at most max' });
  });
});
export type CommanderPunishmentEntry = z.infer<typeof CommanderPunishmentSchema>;
registrySchemas.commanderPunishments = CommanderPunishmentSchema;

/**
 * P13: one kind of thing a warden can expect (the personal kind has no entry: its text is the warden's own). `weight` is the default
 * (`low` 1, `medium` 2, `high` 3); `values` says how a unit's own values pull her toward it (`Σ values[axis] × her value`), and
 * `corporate` adds her corporate value. Code reads the entry by its `kind`, never by id.
 */
export const WardenExpectationSchema = BaseEntrySchema.extend({
  kind: z.enum(EXPECTATION_KINDS.filter((k) => k !== 'personal') as [string, ...string[]]),
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  weight: z.enum(['low', 'medium', 'high']),
  values: VoteLeanSchema.optional(),
  corporate: z.boolean().optional(),
}).strict();
export type WardenExpectationEntry = z.infer<typeof WardenExpectationSchema>;
registrySchemas.wardenExpectations = WardenExpectationSchema;

/**
 * P9c: one branch of a device-access level. Every field that is present must hold; a level is reached when any branch holds.
 * `tiers` are bond tiers (never state ids), `states` are relationship states as data, leads and Impunity are numbers.
 */
export const DeviceAccessBranchSchema = z.object({
  tiers: z.array(z.enum(['romantic', 'close'])).min(1).optional(),
  states: z.array(str).min(1).optional(),
  minLeadRank: int.min(0).max(3).optional(),
  minImpunity: int.min(0).max(100).optional(),
  minAffinity: int.min(-100).max(100).optional(),
}).strict().refine((b) => Object.keys(b).length > 0, 'a branch needs at least one condition');
export type DeviceAccessBranch = z.infer<typeof DeviceAccessBranchSchema>;

/** P9c §1: what a unit can do inside the commander's device at each level 1 to 4 (exactly one entry per level; checked at load). */
export const DeviceAccessRuleSchema = BaseEntrySchema.extend({
  level: int.min(1).max(4),
  name: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  anyOf: z.array(DeviceAccessBranchSchema).min(1),
  /** Level 1: names her contact gets in COMMS (`{name}` = hers). */
  contactNames: z.array(str.max(40)).min(1).optional(),
  /** Level 2: one-line notes she pins (`{name}` = hers). */
  notes: z.array(str.max(120)).min(1).optional(),
  /** Level 4: the fallback wording of an edited DM (`{text}` = the original, `{name}` = hers). */
  editLines: z.array(str.max(300).refine((l) => l.includes('{text}'), 'an edit line must contain {text}')).min(1).optional(),
}).strict();
export type DeviceAccessRuleEntry = z.infer<typeof DeviceAccessRuleSchema>;
registrySchemas.deviceAccessRules = DeviceAccessRuleSchema;

/** P9c §2: what a unit books of the commander's time (`slot` is when, `locationId` where the scene is, `tier` limits it to romantic relationships). */
export const BookingKindSchema = BaseEntrySchema.extend({
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  slot: z.enum(['morning', 'afternoon', 'evening']),
  locationId: str,
  tier: z.literal('romantic').optional(),
  /** What she DMs when she books it (`{name}` = hers). */
  text: str.max(200).refine((t) => t.includes('{name}'), 'the booking text must contain {name}'),
  /** How much her Want falls when the booking is played. */
  wantRelief: int.min(0).max(100),
  /** P16: a `held` kind is a hold (a practice puts it in the calendar); its weight is 0 so the day step's roll never picks it. */
  weight: int.min(0).max(100),
  contentTags,
  held: z.literal(true).optional(),
}).strict().superRefine((k, ctx) => {
  if (k.held === true && k.weight !== 0) ctx.addIssue({ code: 'custom', path: ['weight'], message: 'a held booking kind is never rolled: its weight is 0' });
  if (k.held !== true && k.weight < 1) ctx.addIssue({ code: 'custom', path: ['weight'], message: 'a booking kind that is rolled has a weight of at least 1' });
});
export type BookingKindEntry = z.infer<typeof BookingKindSchema>;
registrySchemas.bookingKinds = BookingKindSchema;

/** P9c §4: a keepsake a soldier may give the commander (`label` and `text` carry `{name}`, `text` also `{label}`; `minTier` limits it to romantic relationships). */
export const TokenKindSchema = BaseEntrySchema.extend({
  label: str.max(60).refine((t) => t.includes('{name}'), 'the label must contain {name}'),
  description: str.max(DESCRIPTION_MAX),
  minTier: z.literal('romantic').optional(),
  /** What she DMs when she offers it. */
  text: str.max(200).refine((t) => t.includes('{label}'), 'the offer text must contain {label}'),
  weight: int.min(1).max(100),
}).strict();
export type TokenKindEntry = z.infer<typeof TokenKindSchema>;
registrySchemas.tokenKinds = TokenKindSchema;

/** P9c §6: one handicap of a sparring game: what her attack, HP and speed are multiplied by, and the Affinity she needs to allow it. */
export const WagerHandicapSchema = z.object({
  id: str, label: str.max(40),
  herAtk: z.number().min(0.1).max(2), herHp: z.number().min(0.1).max(2), herSpd: z.number().min(0.1).max(2),
  minAffinity: int.min(-100).max(100),
}).strict();
export type WagerHandicap = z.infer<typeof WagerHandicapSchema>;

/** P9c §6: a game the commander and a soldier can bet on. `kind` is the closed vocabulary the engine plays; `handicaps` belong to sparring only. */
export const WagerGameSchema = BaseEntrySchema.extend({
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  kind: z.enum(['coin', 'rps', 'high_card', 'sparring', 'expedition_bet']),
  /** The game takes a slot of the commander's time. */
  spendsSlot: z.boolean().optional(),
  handicaps: z.array(WagerHandicapSchema).min(1).optional(),
}).strict().superRefine((g, ctx) => {
  if (g.kind === 'sparring' && g.handicaps === undefined) ctx.addIssue({ code: 'custom', path: ['handicaps'], message: 'a sparring game needs handicaps' });
  if (g.kind !== 'sparring' && g.handicaps !== undefined) ctx.addIssue({ code: 'custom', path: ['handicaps'], message: 'only sparring has handicaps' });
});
export type WagerGameEntry = z.infer<typeof WagerGameSchema>;
registrySchemas.wagerGames = WagerGameSchema;

/** P9c §6: what a wager is for. `effect` is the closed vocabulary the engine applies, for either winner; `contentTags` gate the stake (it joins `CONTENT_GATED_REGISTRIES`). */
export const WagerStakeSchema = BaseEntrySchema.extend({
  label: str.max(40),
  description: str.max(DESCRIPTION_MAX),
  effect: z.enum(['obedience', 'slot', 'privilege', 'drop_demand', 'token', 'question', 'mark']),
  /** What she says the wager is for. */
  text: str.max(120),
  contentTags,
}).strict();
export type WagerStakeEntry = z.infer<typeof WagerStakeSchema>;
registrySchemas.wagerStakes = WagerStakeSchema;

/** P9c §5: what the squad can keep from the commander. `source` is the closed vocabulary of the engine's hooks (`hidden_injury`: a run ends; `event`: a `squad_secret` world effect; `successor`: a leader's week). The text carries `{name}` (the unit it is about) or `{leader}`. */
export const SecretKindSchema = BaseEntrySchema.extend({
  description: str.max(DESCRIPTION_MAX),
  source: z.enum(['hidden_injury', 'event', 'successor', 'debts']),
  reason: z.enum(['protect_commander', 'self_interest', 'leader_order']),
  text: str.max(200),
  importance: int.min(1).max(5),
}).strict().superRefine((k, ctx) => {
  if (k.source === 'hidden_injury' && !k.text.includes('{name}')) ctx.addIssue({ code: 'custom', path: ['text'], message: 'a hidden-injury secret must contain {name}' });
  if (k.source === 'successor' && !k.text.includes('{leader}')) ctx.addIssue({ code: 'custom', path: ['text'], message: 'a successor secret must contain {leader}' });
});
export type SecretKindEntry = z.infer<typeof SecretKindSchema>;
registrySchemas.secretKinds = SecretKindSchema;

/**
 * P12 §1: the fallback wording of an intercepted fragment, one entry per candidate kind (hidden wording: the player never browses it).
 * `lines` carry `{name}` and `{value}`; `subjectOnly` is used for a partial fragment (only the subject, not the conclusion).
 */
export const FrequencyFragmentSchema = BaseEntrySchema.extend({
  description: str.max(DESCRIPTION_MAX).optional(),
  kind: z.enum(['stance', 'impunity', 'demand', 'loyalty', 'fact', 'attraction', 'refusal', 'secret']),
  lines: z.array(str.max(160)).min(1),
  subjectOnly: z.array(str.max(160)).min(1),
}).strict();
export type FrequencyFragmentEntry = z.infer<typeof FrequencyFragmentSchema>;
registrySchemas.frequencyFragments = FrequencyFragmentSchema;

/** P12 §2: the wording of a PREMONITION notice, one entry per warning kind (hidden wording; `{name}` is filled). A real and a false one read the same. */
export const PremonitionLineSchema = BaseEntrySchema.extend({
  description: str.max(DESCRIPTION_MAX).optional(),
  about: z.enum(['doubt', 'desertion', 'mutiny', 'defiance']),
  lines: z.array(str.max(160)).min(1),
}).strict();
export type PremonitionLineEntry = z.infer<typeof PremonitionLineSchema>;
registrySchemas.premonitionLines = PremonitionLineSchema;

/**
 * P12 §3: the handler of a rival corporation (an NPC without a card). `corporations` empty = serves any; `lines` are what she says at the
 * four moments (the visit, a threat, a cut payment, the leak). Visible to the player, so it carries a description.
 */
export const DebtHandlerSchema = BaseEntrySchema.extend({
  name: str,
  description: str.max(DESCRIPTION_MAX),
  corporations: z.array(str).optional(),
  lines: z.object({ greet: str.max(200), threat: str.max(200), cut: str.max(200), leak: str.max(200) }).strict(),
}).strict();
export type DebtHandlerEntry = z.infer<typeof DebtHandlerSchema>;
registrySchemas.debtHandlers = DebtHandlerSchema;

/**
 * P3b: an engine event worth remembering. The `event` has a resolver (`engine/memory/resolvers.ts`); `about`, `audience`, `when` and the
 * `{vars}` of `text` are checked against that resolver's shape at load (`refs.ts`). `AUTHOR TO WRITE`: the texts are drafts.
 */
export const MemoryRuleSchema = BaseEntrySchema.extend({
  event: str,
  when: z.record(z.union([z.string(), z.boolean()])).optional(),
  text: str.max(200),
  importance: int.min(1).max(5),
  about: str,
  audience: z.union([str, z.array(str).min(1)]),
  spread: z.enum(['none', 'slow', 'fast']),
  hiddenFromCommander: z.literal(true).optional(),
  /** P15: the fact it writes is pinned (the fold never takes it): the vow. */
  pinned: z.literal(true).optional(),
  tags: z.array(str),
});
export type MemoryRuleEntry = z.infer<typeof MemoryRuleSchema>;
registrySchemas.memoryRules = MemoryRuleSchema;

/** P10b §2: the behaviours of a living DM, a closed vocabulary the UI and the engine read by `kind`, never by id. */
export const DM_BEHAVIOUR_KINDS = ['hesitate', 'deleted', 'burst', 'late', 'voice', 'curt'] as const;
export type DmBehaviourKind = (typeof DM_BEHAVIOUR_KINDS)[number];

/** All optional, all must hold (P10b §2). `states` are relationship-state ids (checked by the loader), `stateGroups` their `group`. */
export const DmBehaviourWhenSchema = z.object({
  minWant: int.min(0).max(100).optional(),
  wantBands: z.array(z.enum(['calm', 'restless', 'aching', 'desperate'])).min(1).optional(),
  attachment: z.array(z.enum(['slow', 'steady', 'intense', 'avoidant'])).min(1).optional(),
  stateGroups: z.array(z.enum(['base', 'platonic', 'romantic', 'complex', 'negative'])).min(1).optional(),
  states: z.array(str).min(1).optional(),
  /** A conflict (a drop of trust or affinity) in the ledger within this many slots. */
  afterConflictSlots: int.min(1).max(12).optional(),
  /** The sum of her affinity losses today is at least this much. */
  affinityDrop: int.min(1).max(100).optional(),
  slots: z.array(z.enum(['morning', 'afternoon', 'evening', 'night'])).min(1).optional(),
  initiated: z.boolean().optional(),
}).strict();
export type DmBehaviourWhen = z.infer<typeof DmBehaviourWhenSchema>;

/** P10b §2: one rule of a living DM: what it does (`kind`), how likely (`chance`, hashed, never rolled) and when it may. */
export const DmBehaviourSchema = BaseEntrySchema.extend({
  name: str.max(60),
  description: str.max(DESCRIPTION_MAX),
  kind: z.enum(DM_BEHAVIOUR_KINDS),
  chance: z.number().min(0).max(1),
  when: DmBehaviourWhenSchema.optional(),
}).strict();
export type DmBehaviourEntry = z.infer<typeof DmBehaviourSchema>;
registrySchemas.dmBehaviours = DmBehaviourSchema;

/** P10b §4: a bundled hand font (`family` is the CSS family name of its `@font-face` in `css/01-fonts.css`). Registry order decides the default hand. */
export const HandFontSchema = BaseEntrySchema.extend({
  name: str.max(60),
  family: str.max(60).regex(/^[A-Za-z0-9 ]+$/, 'a plain CSS family name'),
  /**
   * P10e-e: the hand's size factor against Caveat (1), measured once by `scripts/measure-hands.mjs`; every size in her hand is multiplied by it.
   * Final review Minor 9: a (local) entry without it loads at 1 and the loader warns (`loadPacks`), so the hand is never lost silently.
   */
  scale: z.number().min(0.6).max(1.7).default(1),
  description: str.max(DESCRIPTION_MAX),
}).strict();
export type HandFontEntry = z.infer<typeof HandFontSchema>;
registrySchemas.handFonts = HandFontSchema;

// ---------------------------------------------------------------------------------------------
// P10c: scene backdrops

/** A room style of a soldier's quarters: her quarters scene shows `background`; the model reads `summary`. Read by registry order (`quartersOf`), never by id. */
export const QuartersStyleSchema = BaseEntrySchema.extend({
  name: str.max(40),
  /** One line of what the room looks like, for the scene header the model reads. */
  summary: str.max(200),
  description: str.max(DESCRIPTION_MAX),
  background: str,
  floor: str.optional(),
  ceiling: str.optional(),
}).strict();
registrySchemas.quartersStyles = QuartersStyleSchema;

/** Art with no reader in 0.1 (P17c reads it): floor and ceiling surfaces by `finish`, cut-out frames, places of their own. Hidden. */
export const BackdropSchema = BaseEntrySchema.extend({
  kind: z.enum(['surface', 'frame', 'place']),
  file: str,
  surface: z.enum(['floor', 'ceiling']).optional(),
  finish: str.optional(),
  /** Slots a surface suits (a night sky); absent = all. */
  slots: z.array(slotEnum).min(1).optional(),
}).strict().refine((e) => e.kind !== 'surface' || (e.surface !== undefined && e.finish !== undefined), 'a surface needs `surface` and `finish`');
registrySchemas.backdrops = BackdropSchema;

/** P10b §4: when a stored hand note may be written. All optional, all must hold; `trigger` is when it is considered (default `daily`). */
export const HandNoteWhenSchema = z.object({
  /** The device access level she has (P9c, 0–4) at least. */
  minAccess: int.min(1).max(4).optional(),
  tiers: z.array(z.enum(['close', 'romantic'])).min(1).optional(),
  wantBands: z.array(z.enum(['calm', 'restless', 'aching', 'desperate'])).min(1).optional(),
  states: z.array(str).min(1).optional(),
  trigger: z.enum(['daily', 'knock_unanswered']).optional(),
}).strict();
export type HandNoteWhen = z.infer<typeof HandNoteWhenSchema>;

/** P10b §4: a note she may leave, in her hand: in the quarters, in the gear or under the door. `text` may carry `{name}`. */
export const HandNoteSchema = BaseEntrySchema.extend({
  name: str.max(60),
  description: str.max(DESCRIPTION_MAX),
  where: z.enum(['quarters', 'gear', 'door']),
  text: str.max(200),
  chance: z.number().min(0).max(1),
  when: HandNoteWhenSchema.optional(),
}).strict().superRefine((n, ctx) => {
  const door = n.where === 'door';
  const trigger = n.when?.trigger ?? 'daily';
  if (door && trigger !== 'knock_unanswered') ctx.addIssue({ code: 'custom', path: ['when', 'trigger'], message: 'a door note is written by an unanswered knock' });
  if (!door && trigger === 'knock_unanswered') ctx.addIssue({ code: 'custom', path: ['when', 'trigger'], message: 'only a door note is written by an unanswered knock' });
});
export type HandNoteEntry = z.infer<typeof HandNoteSchema>;
registrySchemas.handNotes = HandNoteSchema;

/** P10b §5: a sticker a soldier puts on the PDA casing: one `path` `d` string (viewBox 0 0 24 24) or a glyph of at most two characters. `likeTags` are matched against `unit.likes`. */
export const StickerArtSchema = BaseEntrySchema.extend({
  name: str.max(60),
  description: str.max(DESCRIPTION_MAX),
  likeTags: z.array(str).optional(),
  svg: z.string().min(1).max(600).regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s+-]+$/, 'an svg path d string').optional(),
  glyph: z.string().min(1).max(2).optional(),
}).strict().refine((e) => (e.svg === undefined) !== (e.glyph === undefined), 'a sticker has an svg path or a glyph, not both and not neither');
export type StickerArtEntry = z.infer<typeof StickerArtSchema>;
registrySchemas.stickerArt = StickerArtSchema;

/** Player-visible registries whose entries carry an optional `description` (skills and statuses already require one). */
export const DESCRIBED_REGISTRIES = [
  'roles', 'skills', 'signatures', 'statuses', 'defects', 'items', 'affixes', 'enemies',
  'enemyCategories', 'regions', 'nodeTypes', 'activities', 'facilities', 'crimes',
  'corporations', 'starts', 'relationshipStates', 'locations', 'orders', 'synergies',
  // P7
  'commanderTraits', 'tastes',
  // P8
  'worldOptions', 'dispositionLevels', 'worldPresets',
  // P9
  'commandStances', 'punishments', 'demandTemplates', 'reputations',
  // P10
  'hubRooms', 'deviceSkins',
  // P9d
  'contentCategories', 'relationshipRuleTemplates',
  // P9b
  'voteKinds', 'outsideFeats',
  // P9c
  'deviceAccessRules', 'bookingKinds', 'tokenKinds', 'wagerGames', 'wagerStakes', 'secretKinds',
  // P10b
  'dmBehaviours', 'handFonts', 'handNotes', 'stickerArt',
  // P12 (the handler is shown to the player; the fragment and premonition wording is hidden)
  'debtHandlers',
  // P13
  'wardenExpectations', 'commanderPunishments',
  // P11b
  'headStartMoments',
  // P14b
  'developmentAxes', 'developmentRules', 'habits',
  // P10c
  'quartersStyles',
  // P10d
  'planRooms',
  // P14c
  'lifeEvents', 'hobbies', 'opinionTopics', 'pastimes',
  // P15a (every row carries a description; `physicsCues` and `escalationVerbs` are not shown to the player: `PLAYER_VISIBLE` leaves them out)
  'worshipTargets', 'blockingPostures', 'blockingAnchors', 'blockingContacts', 'blockingItems', 'blockingActivities', 'momentSources',
  'contactPhysics', 'physicsCues', 'stimulusKinds', 'escalationVerbs', 'commanderConditions',
  // P15 (`positionRegions` is her wording and is not shown to the player: `PLAYER_VISIBLE` leaves it out)
  'practiceStyles', 'holdBands', 'dynamicFrames', 'dynamicMilestones', 'dynamicDomains', 'dynamicTracks', 'probeAxes', 'positionRegions',
  'aftermaths', 'regardBands', 'dynamicSigns',
  // P16 (`practiceSeeds` are examples for the model and are not shown to the player: `PLAYER_VISIBLE` leaves them out)
  'practiceSeeds', 'holderPunishments', 'implements', 'ceremonySteps',
  // P16b
  'craftLessons', 'craftLines', 'servicePostures',
] as const satisfies readonly RegistryName[];

// ---------------------------------------------------------------------------------------------
// P11b: head start moments

/**
 * A remembered moment of the weeks before day 1 (the picker reads `sign`, `requires` and `tags`, never the id). `eventDelta` names an
 * `eventDeltas` row (checked at load); `actor` says who did it. `fallback` is the template line when the model gives none (`{name}` is
 * her name). `AUTHOR TO WRITE`: every text is a draft. An entry tagged `probe` is a probe-like moment (P15 §15.14): it names the probe `axis` it shows (a `probeAxes` id, checked at load) and the picker never takes it; only the dynamic's own head start adds it to a recap. Only a probe entry has an `axis`.
 */
export const HeadStartMomentSchema = BaseEntrySchema.extend({
  sign: z.enum(['positive', 'negative', 'any']),
  requires: z.object({
    values: z.record(z.enum(['+', '-'])).optional(),
    knowsCrime: z.boolean().optional(),
    minDays: z.union([z.literal(7), z.literal(14), z.literal(30)]).optional(),
  }).strict().optional(),
  eventDelta: z.object({ type: str, severity: severityEnum, actor: z.enum(['commander', 'unit']) }).strict(),
  importance: int.min(1).max(5),
  tags: z.array(str).optional(),
  axis: str.optional(),
  fallback: str.max(240),
  description: str,
}).strict().superRefine((m, ctx) => {
  const probe = (m.tags ?? []).includes('probe');
  if (probe && m.axis === undefined) ctx.addIssue({ code: 'custom', path: ['axis'], message: 'a probe moment names its axis (a probeAxes id)' });
  if (!probe && m.axis !== undefined) ctx.addIssue({ code: 'custom', path: ['axis'], message: 'only a probe moment (tagged "probe") has an axis' });
});
export type HeadStartMomentEntry = z.infer<typeof HeadStartMomentSchema>;
registrySchemas.headStartMoments = HeadStartMomentSchema;

// ---------------------------------------------------------------------------------------------
// P14b: character development

/**
 * `id` is an axis key (`value:mercy`, `bond:lead_style`) or the kind's wildcard (`taste:.any`, `like:.any`, `dislike:.any`; a dot cannot
 * be part of a normalized tag). Registry ids are lowercase snake case (`ID_PATTERN`), so the bond field `leadStyle` is `lead_style` here.
 * `ownLimits` and `publicity` never drift, so no axis names them.
 */
export const DevelopmentAxisSchema = BaseEntrySchema.extend({
  id: z.string().regex(/^(value|bond|taste|like|dislike|practice|expect|manner):[a-z0-9_.-]+$/, 'an axis id is <kind>:<name> or <kind>:.any'),
  kind: z.enum(['value', 'bond', 'taste', 'like', 'dislike', 'practice', 'expect', 'manner']),
  up: str.max(120),
  down: str.max(120),
  description: str,
}).strict().superRefine((a, ctx) => {
  const [kind, name] = a.id.split(':');
  if (kind !== a.kind) ctx.addIssue({ code: 'custom', path: ['kind'], message: `the id "${a.id}" is a ${kind} axis but kind is "${a.kind}"` });
  if (name === '.any' && !['taste', 'like', 'dislike'].includes(a.kind)) ctx.addIssue({ code: 'custom', path: ['id'], message: 'only taste, like and dislike axes may be wildcards' });
  if (a.kind === 'bond' && !['attachment', 'desire', 'caretaker', 'lead_style'].includes(name)) ctx.addIssue({ code: 'custom', path: ['id'], message: `"${a.id}" cannot drift (her own limits and her publicity preference never do)` });
  if (a.kind === 'value' && !(VALUE_AXES as readonly string[]).includes(name)) ctx.addIssue({ code: 'custom', path: ['id'], message: `"${name}" is not a value axis` });
  // P15: the practice and the profile have a fixed set of entries (a wildcard is `practice:.any.as`, `practice:.any.witness` or `expect:worship.any`); fairness, hint style and drive never drift
  if (a.kind === 'practice' && !['.any.as', '.any.witness', 'style.secondary'].includes(name)) ctx.addIssue({ code: 'custom', path: ['id'], message: `"${a.id}" cannot drift (a practice axis is practice:.any.as, practice:.any.witness or practice:style.secondary)` });
  // P15b: her manner has eight entries: the six axes, what draws her and the turn of her style
  if (a.kind === 'manner' && ![...MANNER_AXES, 'drawn_by', 'turn'].includes(name)) ctx.addIssue({ code: 'custom', path: ['id'], message: `"${a.id}" cannot drift (a manner axis is manner:<${MANNER_AXES.join('|')}>, manner:drawn_by or manner:turn)` });
  if (a.kind === 'expect' && !['holds_until', 'worship.any'].includes(name)) ctx.addIssue({ code: 'custom', path: ['id'], message: `"${a.id}" cannot drift (an expectation axis is expect:holds_until or expect:worship.any)` });
});
export type DevelopmentAxisEntryT = z.infer<typeof DevelopmentAxisSchema>;
registrySchemas.developmentAxes = DevelopmentAxisSchema;

const readingWords = <T extends [string, ...string[]]>(values: T) => z.array(z.enum(values)).min(1);

/** What an appraised event adds to which accumulators. The engine reads `match` and `by` only, never the id. `contentTags` gate it like any gated entry. */
export const DevelopmentRuleSchema = BaseEntrySchema.extend({
  match: z.object({
    kind: z.array(str).min(1).optional(),
    role: readingWords(['subject', 'actor', 'witness']).optional(),
    target: readingWords(['her', 'commander', 'unit', 'squad']).optional(),
    wanted: readingWords(['yes', 'no', 'unclear']).optional(),
    initiator: readingWords(['target', 'actor', 'mutual']).optional(),
    harm: readingWords(['none', 'minor', 'serious']).optional(),
    outcome: readingWords(['good', 'mixed', 'bad']).optional(),
  }).strict(),
  by: z.object({
    values: z.record(z.enum(['+', '-'])).optional(),
    caretaker: z.boolean().optional(),
    leadStyle: readingWords(['dominant', 'assertive', 'balanced', 'yielding']).optional(),
    attachment: readingWords(['slow', 'steady', 'intense', 'avoidant']).optional(),
    insight: readingWords(['low', 'mid', 'high']).optional(),
  }).strict().optional(),
  push: z.array(z.object({ axis: str, amount: z.number().refine((n) => n !== 0 && Math.abs(n) <= 3, 'an amount is not 0 and at most 3 either way') }).strict()).min(1).max(4),
  contentTags: z.array(str).optional(),
  description: str,
}).strict();
registrySchemas.developmentRules = DevelopmentRuleSchema;

/** A counter that reaches `threshold` forms the habit. `fallback` is the fact text (`{name}`, and `{other}` for a companion habit). */
export const HabitSchema = BaseEntrySchema.extend({
  counter: z.object({ kind: z.enum(['activity', 'companion', 'region', 'joke', 'meeting', 'run']), id: str.optional() }).strict(),
  threshold: int.min(2).max(60),
  fallback: str.max(140),
  effect: z.object({ type: z.enum(['unit_stress', 'unit_xp']), amount: int.min(-20).max(20).refine((n) => n !== 0, 'an effect amount is not 0'), activityId: str }).strict().optional(),
  contentTags: z.array(str).optional(),
  /** P15: what kind of habit it is (`respect`: the small habits of respect a disappointed woman lets lapse). */
  tags: z.array(str).optional(),
  description: str,
}).strict();
registrySchemas.habits = HabitSchema;

// ---------------------------------------------------------------------------------------------
// P14c: her life (life events, hobbies, opinion topics, pastimes). `AUTHOR TO WRITE`: every text is a draft. The engine reads these by
// field (`requires`, `share`, `size`, `category`, `becomes`, `locations`, `teachable`, `milestones[].trace`, `group`, `axis`, `triggers`,
// `slots`, `talk`), never by id.

const trueFlag = z.literal(true);
const lifeText = str.max(300);
const linePair = z.tuple([lifeText, lifeText]);

/** The closed vocabulary of life event conditions; every listed field must hold. Cross-registry names are checked in `refs.ts`. */
export const LifeRequiresSchema = z.object({
  hobby: str.optional(),
  location: z.array(str).min(1).optional(),
  activity: z.array(str).min(1).optional(),
  afterRun: z.object({ hurt: trueFlag.optional() }).strict().optional(),
  noRunDays: int.min(1).max(60).optional(),
  stressMin: int.min(0).max(100).optional(),
  stressMax: int.min(0).max(100).optional(),
  defectCategory: str.optional(),
  injured: trueFlag.optional(),
  otherNamed: trueFlag.optional(),
  affinityMin: int.min(-100).max(100).optional(),
  trustMin: int.min(0).max(100).optional(),
  romantic: trueFlag.optional(),
  leaderNotHer: trueFlag.optional(),
  gruntDiedDays: int.min(1).max(60).optional(),
  deathAgo: int.min(1).max(360).optional(),
  rumour: trueFlag.optional(),
  rationsShort: trueFlag.optional(),
  sparring: z.enum(['won', 'lost']).optional(),
  bloomHalf: trueFlag.optional(),
  missionBoard: trueFlag.optional(),
  afterEvent: str.optional(),
  otherHadThisWeek: str.optional(),
}).strict();

export const LifeEventSchema = BaseEntrySchema.extend({
  size: z.enum(LIFE_SIZES),
  category: z.enum(LIFE_CATEGORIES),
  /** P15b: the colour the event gives her day for a holder with a manner (absent: none). */
  mood: z.enum(LIFE_MOODS).optional(),
  tags: z.array(str.max(32)).max(6).optional(),
  share: z.enum(LIFE_SHARES),
  keepsUnless: z.object({ affinityMin: int.min(-100).max(100).optional(), romantic: trueFlag.optional() }).strict().optional(),
  requires: LifeRequiresSchema.optional(),
  becomes: z.object({ hobby: str.optional(), milestone: trueFlag.optional(), opinionTopic: str.optional() }).strict().optional(),
  cooldownDays: int.min(1).max(720).optional(),
  yearly: trueFlag.optional(),
  urgent: trueFlag.optional(),
  description: str,
  /** A short third-person line shown when hovering her on the hub. */
  hub: lifeText,
  /** Two fallback lines in her voice (her DM or her news); the model words the real one. */
  lines: linePair,
}).strict().superRefine((e, ctx) => {
  if (e.keepsUnless !== undefined && e.share !== 'keeps') ctx.addIssue({ code: 'custom', path: ['keepsUnless'], message: 'keepsUnless only turns a "keeps" event into a shared one' });
});
export type LifeEventSchemaT = z.infer<typeof LifeEventSchema>;

export const HobbySchema = BaseEntrySchema.extend({
  label: str.max(40),
  locations: z.array(str).min(1),
  activityIds: z.array(str),
  teachable: z.boolean(),
  /** Exactly four, with unique ids (checked in `refs.ts`). */
  milestones: z.array(z.object({ id: str, line: lifeText, trace: z.enum(TRACE_KINDS).optional() }).strict()).min(1),
  opinionTopic: str.optional(),
  description: str,
  traceText: lifeText.optional(),
}).strict();

export const OpinionTopicSchema = BaseEntrySchema.extend({
  label: str.max(40),
  group: z.enum(TOPIC_GROUPS),
  axis: z.object({ id: valueAxis, sign: z.union([z.literal(1), z.literal(-1)]) }).strict().optional(),
  positions: z.array(z.object({ id: str, description: lifeText, lines: linePair }).strict()).min(2).max(5),
  triggers: z.object({
    locations: z.array(str).min(1).optional(),
    activities: z.array(str).min(1).optional(),
    lifeEvents: z.array(str).min(1).optional(),
    keywords: z.array(str.max(32)).min(1).max(8).optional(),
  }).strict(),
  description: str,
}).strict().superRefine((t, ctx) => {
  const seen = new Set<string>();
  t.positions.forEach((p, i) => {
    if (seen.has(p.id)) ctx.addIssue({ code: 'custom', path: ['positions', i, 'id'], message: `position id "${p.id}" is used twice in this topic` });
    seen.add(p.id);
  });
});

export const PastimeSchema = BaseEntrySchema.extend({
  label: str.max(40),
  /** Scene location ids (the first one open for the slot is used); empty only for the pastime that is her hobby. */
  locations: z.array(str),
  slots: z.array(slotEnum).min(1),
  requires: z.object({ afterRun: trueFlag.optional(), firstSlot: trueFlag.optional(), hobby: str.optional() }).strict().optional(),
  hobby: trueFlag.optional(),
  talk: z.enum(TALK_LEVELS),
  herActivity: str,
  commanderActivity: str,
  sensoryTag: str,
  momentSources: z.array(str),
  description: str,
  opening: lifeText,
  lines: linePair,
}).strict().superRefine((p, ctx) => {
  if (p.locations.length === 0 && p.hobby !== true) ctx.addIssue({ code: 'custom', path: ['locations'], message: 'a pastime needs a location (only the one that is her hobby uses her hobby\'s)' });
});

Object.assign(registrySchemas, { lifeEvents: LifeEventSchema, hobbies: HobbySchema, opinionTopics: OpinionTopicSchema, pastimes: PastimeSchema });

// ---------------------------------------------------------------------------------------------
// P15a: scene blocking, moments and contact physics (twelve registries). `AUTHOR TO WRITE`: every text is a draft. The engine reads them
// by FIELD and by effect type, never by id (`engine/blocking/types.ts` holds the closed enums). Names that point into other registries
// are checked in `refs.ts`.

const blockLabel = str.max(40);
const blockHint = str.max(120);
const lowerId = z.string().regex(/^[a-z_]+$/, 'lower-case letters and underscores');
const scopeEnum = z.enum(SCOPES);
const tagList = z.array(str).min(1).optional();
const sealEnum = z.enum(SEALS);
const physicsLink = z.object({ id: str, seal: z.array(sealEnum).min(1).optional(), pressure: z.number().min(0).max(3).optional() }).strict();
const sourceWeights = z.record(str, z.number().positive().max(5));
const sideSchema = z.object({ posture: str.optional(), anchor: str.optional() }).strict();
const bodyPoint = z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100), r: z.number().min(1).max(50) }).strict();

/** The closed effect vocabulary (plan R5): an unknown `type`, an unknown key or a bad value is refused. */
export const BlockingEffectSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('camera'), mode: z.enum(['from_below', 'face_close', 'ignored', 'pov_floor', 'pov_dark', 'ceiling']) }).strict(),
  z.object({ type: z.literal('backdrop'), id: lowerId }).strict(),
  z.object({ type: z.literal('pose_shot'), kind: lowerId }).strict(),
  z.object({ type: z.literal('filter'), kind: z.enum(['sensory_dark', 'alarm']) }).strict(),
  z.object({ type: z.literal('perception'), self: z.literal('obscured').optional(), others: z.literal('obscured').optional() }).strict(),
  z.object({ type: z.literal('input'), limit: z.enum(['muffled', 'garbled', 'no_speech', 'gestures_only', 'no_hands', 'action_only']), strength: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() }).strict(),
  z.object({ type: z.literal('gestures'), variant: z.enum(['pet', 'head_only']) }).strict(),
  z.object({ type: z.literal('device'), lock: z.literal('tabs') }).strict(),
  z.object({ type: z.literal('sensory'), kind: z.enum(['scent', 'touch', 'sound', 'temp']), intensity: z.enum(['low', 'high', 'overwhelming']) }).strict(),
  z.object({ type: z.literal('sound'), muffle: z.literal(true).optional(), id: lowerId.optional() }).strict(),
  z.object({ type: z.literal('visibility'), hiddenFromDoor: z.literal(true).optional(), exposing: z.literal(true).optional(), hideable: z.literal(false).optional(), unlessPosture: z.array(str).min(1).optional() }).strict(),
  z.object({ type: z.literal('mobility'), level: z.enum(['none', 'limited', 'crawl', 'follows']) }).strict(),
  z.object({ type: z.literal('strain'), condition: z.enum(['stillness', 'silence', 'posture', 'endurance']), rate: z.number().positive().max(10) }).strict(),
  z.object({ type: z.literal('escalation'), verb: z.enum(ESCALATION_ORDER) }).strict(),
  z.object({ type: z.literal('physics'), id: str }).strict(),
  z.object({ type: z.literal('rule'), template: lowerId }).strict(),
  z.object({ type: z.literal('notice'), kind: z.enum(['knows_dynamic', 'seen']) }).strict(),
  z.object({ type: z.literal('status_after'), id: str, afterExchanges: int.min(1).max(60) }).strict(),
]).superRefine((fx, ctx) => {
  if (fx.type === 'perception' && fx.self === undefined && fx.others === undefined) ctx.addIssue({ code: 'custom', message: 'a perception effect sets self, others or both' });
  if (fx.type === 'sound' && (fx.muffle === undefined) === (fx.id === undefined)) ctx.addIssue({ code: 'custom', message: 'a sound effect is either muffle or an id, not both and not neither' });
  if (fx.type === 'visibility' && fx.hiddenFromDoor === undefined && fx.exposing === undefined && fx.hideable === undefined && fx.unlessPosture === undefined) ctx.addIssue({ code: 'custom', message: 'a visibility effect sets at least one field' });
  if (fx.type === 'visibility' && fx.unlessPosture !== undefined && fx.hideable !== false) ctx.addIssue({ code: 'custom', message: 'unlessPosture only qualifies hideable: false' });
});
const effectList = z.array(BlockingEffectSchema).optional();

export const WorshipTargetSchema = BaseEntrySchema.extend({
  contentTags: z.array(str).min(1),
  side: z.enum(['front', 'back', 'both']),
  /** Body-map coordinates (0–100) for each side the target is on; `AUTHOR TO TUNE`. */
  zone: z.object({ front: bodyPoint.optional(), back: bodyPoint.optional() }).strict(),
  /** The stimulus kinds a contact with it exposes (`stimulusKinds` ids). */
  stimuli: z.array(str).min(1),
  /** P10e-e Task 27: her footwear (boots or heels, `footwearOf`): a contact on it is shoe service (`isShoeRun`). */
  footwear: z.literal(true).optional(),
  label: blockLabel,
  description: str,
}).strict().superRefine((t, ctx) => {
  const need = t.side === 'both' ? ['front', 'back'] : [t.side];
  for (const side of need) if (t.zone[side as 'front' | 'back'] === undefined) ctx.addIssue({ code: 'custom', path: ['zone', side], message: `a ${t.side}-side target needs a ${side} zone` });
  for (const side of ['front', 'back'] as const) if (t.zone[side] !== undefined && !need.includes(side)) ctx.addIssue({ code: 'custom', path: ['zone', side], message: `a ${t.side}-side target has no ${side} zone` });
});

export const PostureSchema = BaseEntrySchema.extend({
  label: blockLabel, description: str, promptHint: blockHint, effects: effectList,
}).strict();

export const AnchorSchema = BaseEntrySchema.extend({
  kind: z.enum(ANCHOR_KINDS),
  requires: z.object({ affordances: z.array(lowerId).min(1) }).strict().optional(),
  label: blockLabel, description: str, promptHint: blockHint, effects: effectList,
}).strict().superRefine((a, ctx) => {
  if (a.kind === 'furniture' && a.requires === undefined) ctx.addIssue({ code: 'custom', path: ['requires'], message: 'a furniture anchor requires the affordance of its furniture' });
});

export const ContactSchema = BaseEntrySchema.extend({
  scope: scopeEnum,
  contentTags: tagList,
  dir: z.enum(CONTACT_DIRS),
  target: z.array(str).min(1).optional(),
  implies: z.object({ actor: sideSchema.optional(), receiver: sideSchema.optional() }).strict().optional(),
  requires: z.object({ affordances: z.array(lowerId).min(1).optional() }).strict().optional(),
  physics: z.array(physicsLink).min(1).max(2).optional(),
  stimuli: z.array(str).min(1).optional(),
  sources: sourceWeights.optional(),
  mouth: z.literal(true).optional(),
  /** P10e-e: the shape of the dark while a breathing physics runs on this contact (`occlusionOf`; absent: the slit and the ceiling). */
  occlusion: z.object({
    kind: z.enum(OCCLUSION_KINDS), side: z.enum(['left', 'right']).optional(), angle: z.number().min(-90).max(90).optional(), view: z.enum(OCCLUSION_VIEWS).optional(),
  }).strict().optional(),
  /** P10e-e: which way the commander faces under a weight (`contactFaceOf`: up sees her and the ceiling, down the floor; absent: down). */
  face: z.enum(CONTACT_FACES).optional(),
  /** P10e-e: her legs hang in the face-down view (`herLegsOf`; absent: she is out of view). */
  legs: z.enum(HER_LEGS).optional(),
  /** P16b: it needs a posture of the commander's whose preset `supports` it (the hands held out for her foot): offered and allowed only while one is held. */
  supported: z.literal(true).optional(),
  /** P16b (Task 16): her foot is what touches the commander in this contact (a foot signal may be answered while it is live). */
  foot: z.literal(true).optional(),
  label: blockLabel, description: str, promptHint: blockHint, effects: effectList,
}).strict();

export const BlockingItemSchema = BaseEntrySchema.extend({
  scope: scopeEnum,
  contentTags: tagList,
  slots: z.array(z.enum(WORN_SLOTS)).min(1),
  /** `all`: wearing it takes every slot (a hood: eyes and ears); `one`: it takes one of them. Default `all`. */
  slotMode: z.enum(['all', 'one']).optional(),
  wornBy: z.enum(['commander', 'her']).optional(),
  physics: z.array(physicsLink).min(1).max(2).optional(),
  stimuli: z.array(str).min(1).optional(),
  sources: sourceWeights.optional(),
  label: blockLabel, description: str, promptHint: blockHint, effects: effectList,
}).strict().superRefine((i, ctx) => {
  if (new Set(i.slots).size !== i.slots.length) ctx.addIssue({ code: 'custom', path: ['slots'], message: 'a slot is listed twice' });
});

export const BlockingActivitySchema = BaseEntrySchema.extend({
  scope: scopeEnum,
  contentTags: tagList,
  actor: z.enum(['her', 'commander']),
  attention: z.enum(ATTENTIONS).optional(),
  interruptible: z.boolean().optional(),
  impliedPosture: str.optional(),
  pairTags: z.array(z.enum(PAIR_TAGS)).min(1).optional(),
  /** Her pair tags this activity fits, or `any`. */
  fits: z.array(z.enum([...PAIR_TAGS, 'any'])).min(1).optional(),
  presence: z.enum(['unnoticed', 'felt']).optional(),
  judged: z.literal(true).optional(),
  /** P16b (ruling 18): a care the commander can give while she is out, unasked (`care/unasked`); `notice` is how easily she sees it (`low` or `high`). Only a commander's dynamic row. */
  care: z.object({ notice: z.enum(['low', 'high']) }).strict().optional(),
  sources: sourceWeights.optional(),
  /** The P2 activity ids whose scene opens with this one (`scene.activityId`). */
  fromActivities: z.array(str).min(1).optional(),
  /**
   * P10e-e R24: the frame of her time (her_activity.html `ACTS`): how her presence drifts a phase (`absorb`), how well she hears the commander,
   * her light, her clock (`unit`, `total`, `per` the seconds between her marks), her legs under the desk, her hours (absent: unknown) and what
   * the activity brings (a call, a visitor, sleep, music, a drink). An activity with a frame starts `her_activity` when she placed the commander.
   */
  frame: z.object({
    absorb: z.number().min(-1).max(1), hear: z.number().min(0).max(1), light: z.enum(['lamp', 'screen', 'dark']), unit: str, total: z.number().positive(),
    per: z.tuple([z.number().positive(), z.number().positive()]), legs: z.enum(['swing', 'tap', 'still', 'asleep', 'beat']), hours: z.number().positive().optional(),
    call: z.literal(true).optional(), visitor: z.literal(true).optional(), sleep: z.literal(true).optional(), music: z.literal(true).optional(), drink: z.literal(true).optional(),
    audience: z.literal(true).optional(),
  }).strict().optional(),
  label: blockLabel, description: str, promptHint: blockHint, effects: effectList,
}).strict();

const momentOption = z.object({ type: z.enum(RESPONSE_TYPES), generic: str.max(40) }).strict();
export const MomentSourceSchema = BaseEntrySchema.extend({
  scope: scopeEnum,
  contentTags: tagList,
  /** Exactly three options: the frame's words are the generic labels shown until the reading words them. */
  frame: z.tuple([momentOption, momentOption, momentOption]),
  live: z.array(z.enum(LIVE_KINDS)).min(1),
  remember: z.array(z.object({ option: z.union([z.literal(0), z.literal(1), z.literal(2)]), importance: int.min(1).max(5) }).strict()).optional(),
  generalMeeting: z.literal(true).optional(),
  /** The moment names the commander's own giveaway (a leash, a posture) in its directive: someone could see it. */
  exposes: z.literal(true).optional(),
  description: str,
  /** What the main model is told when the moment fires: one clause, no pronoun for the commander (the description is the player's, never sent). */
  promptHint: blockHint.optional(),
}).strict();

export const ContactPhysicsSchema = BaseEntrySchema.extend({
  contentTags: tagList,
  gauge: z.object({ kind: z.enum(GAUGE_KINDS), start: z.number().min(0).max(100) }).strict(),
  interaction: z.enum(INTERACTIONS),
  skill: z.boolean(),
  segmentSeconds: int.min(5).max(300),
  chains: z.array(z.object({ on: z.literal('slip'), to: str, start: z.number().min(0).max(100).optional() }).strict()).optional(),
  label: blockLabel, description: str, promptHint: blockHint,
}).strict();

export const PhysicsCueSchema = BaseEntrySchema.extend({
  kind: z.enum(CUE_KINDS),
  physics: z.array(str).min(1).optional(),
  // three to five lines; only `surge` may hold fewer (P10e-e R32, review M6: gulp.html's `surge` is ritual's "now." alone)
  lines: z.array(str.max(160)).min(1).max(5),
  description: str,
}).strict().refine((e) => e.lines.length >= 3 || e.kind === 'surge', { message: 'a cue row has three to five lines (gulp\'s `surge` may hold fewer: gulp.html has one)', path: ['lines'] });

export const StimulusKindSchema = BaseEntrySchema.extend({
  contentTags: tagList,
  family: z.enum(STIMULUS_FAMILIES),
  label: blockLabel, description: str,
  /** One short word or phrase per stage of the commander's trajectory, and the one after a week apart. */
  perception: z.object(Object.fromEntries([...STAGES, 'separated'].map((k) => [k, str.max(80)])) as Record<(typeof STAGES)[number] | 'separated', z.ZodString>).strict(),
}).strict();

export const EscalationVerbSchema = BaseEntrySchema.extend({
  id: z.enum(ESCALATION_ORDER),
  label: blockLabel, promptHint: blockHint, description: str,
}).strict();

export const CommanderConditionSchema = BaseEntrySchema.extend({
  effects: z.array(z.union([
    z.object({ type: z.literal('social_rank'), delta: int.min(-3).max(3) }).strict(),
    z.object({ type: z.literal('stress'), amount: int.min(-50).max(50) }).strict(),
  ])),
  label: blockLabel, description: str, promptHint: blockHint,
}).strict();

Object.assign(registrySchemas, {
  worshipTargets: WorshipTargetSchema, blockingPostures: PostureSchema, blockingAnchors: AnchorSchema, blockingContacts: ContactSchema,
  blockingItems: BlockingItemSchema, blockingActivities: BlockingActivitySchema, momentSources: MomentSourceSchema,
  contactPhysics: ContactPhysicsSchema, physicsCues: PhysicsCueSchema, stimulusKinds: StimulusKindSchema,
  escalationVerbs: EscalationVerbSchema, commanderConditions: CommanderConditionSchema,
});

// ---------------------------------------------------------------------------------------------
// P15: the dynamic (eleven registries). `AUTHOR TO WRITE`: every text is a draft; `AUTHOR TO TUNE`: every number is. The engine reads
// them by field, by capability and by effect type, never by id (`engine/dynamic/types.ts` holds the closed enums). Names that point
// into other registries are checked in `refs.ts`.

const unit = (lo: number, hi: number) => z.number().min(lo).max(hi);
const frameEnum = z.enum(FRAMES);
const capabilityEnum = z.enum(CAPABILITIES);
const profileStyle = z.enum(PROFILE_STYLES);
const stylePlace = int.min(-3).max(3);
const aftermathKind = z.enum(AFTERMATH_KINDS);
const bandRange = (e: { min: number; max: number }, ctx: z.RefinementCtx) => {
  if (e.min > e.max) ctx.addIssue({ code: 'custom', path: ['max'], message: 'a band runs from low to high' });
};

export const PracticeStyleSchema = BaseEntrySchema.extend({
  id: profileStyle,
  label: blockLabel,
  description: str,
  surfacesWhen: z.array(z.enum(SURFACE_CONDITIONS)).min(1),
  point: z.object({ r: unit(-1, 1), f: unit(-1, 1), motive: z.enum(MOTIVES), notWith: z.literal('other_women').optional() }).strict().nullable(),
  regardForm: str.max(80),
  regardSpeed: z.enum(REGARD_SPEEDS),
  regardFloor: int.min(0).max(100),
  regardFactor: unit(0, 3),
  likesRegion: z.array(z.enum(REGION_RANKS)).optional(),
  despisesRegion: z.array(z.enum(REGION_RANKS)).optional(),
  /** P15b: the style's place on the six manner axes (hidden coordinates). */
  manner: z.object({ intensity: stylePlace, warmth: stylePlace, order: stylePlace, voice: stylePlace, tempo: stylePlace, curiosity: stylePlace }).strict().optional(),
}).strict();

const bandSchema = BaseEntrySchema.extend({ label: blockLabel, min: int.min(0).max(100), max: int.min(0).max(100), description: str }).strict().superRefine(bandRange);
export const HoldBandSchema = bandSchema;
export const RegardBandSchema = bandSchema;

export const DynamicFrameSchema = BaseEntrySchema.extend({
  id: frameEnum,
  label: blockLabel,
  rank: int.min(0).max(3),
  holdFloor: int.min(0).max(100),
  holdCeiling: int.min(0).max(100).optional(),
  refusal: z.enum(REFUSAL_COSTS),
  outside: z.enum(OUTSIDE_REACH),
  promptHint: blockHint,
  description: str,
}).strict().superRefine((e, ctx) => {
  if (e.rank !== FRAMES.indexOf(e.id)) ctx.addIssue({ code: 'custom', path: ['rank'], message: `the rank of "${e.id}" is ${FRAMES.indexOf(e.id)}` });
  if (e.holdCeiling !== undefined && e.holdCeiling < e.holdFloor) ctx.addIssue({ code: 'custom', path: ['holdCeiling'], message: 'the ceiling is below the floor' });
});

const milestoneEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('frame') }).strict(),
  z.object({ type: z.literal('sworn') }).strict(),
  z.object({ type: z.literal('claim'), capability: capabilityEnum }).strict(),
  z.object({ type: z.literal('drop_romance') }).strict(),
]);

export const DynamicMilestoneSchema = BaseEntrySchema.extend({
  from: frameEnum,
  to: frameEnum,
  requires: z.object({
    holdBand: str.optional(),
    tracks: z.record(str, int.min(1).max(5)).optional(),
    capabilities: z.array(capabilityEnum).min(1).optional(),
    categories: z.array(str).min(1).optional(),
    styles: z.array(profileStyle).min(1).optional(),
    romantic: z.boolean().optional(),
    coolingDays: int.min(1).max(365).optional(),
    formerHolder: z.literal(true).optional(),
    noCapability: capabilityEnum.optional(),
    /** P15b (spec §12.3): she has a `manner` block (the package's gate: a profile from before it keeps its old graph). */
    manner: z.literal(true).optional(),
  }).strict(),
  offer: z.enum(MILESTONE_OFFERS),
  sworn: z.literal(true).optional(),
  effects: z.array(milestoneEffect),
  text: str.max(300),
  promptHint: blockHint,
  contentTags: tagList,
  description: str,
}).strict().superRefine((m, ctx) => {
  const frame = m.effects.some((e) => e.type === 'frame');
  if (frame && m.from === m.to) ctx.addIssue({ code: 'custom', path: ['effects'], message: 'a milestone inside one frame cannot change the frame' });
  if (!frame && m.from !== m.to) ctx.addIssue({ code: 'custom', path: ['effects'], message: 'a milestone that changes the frame needs the frame effect' });
  if ((m.sworn === true) !== m.effects.some((e) => e.type === 'sworn')) ctx.addIssue({ code: 'custom', path: ['sworn'], message: '`sworn` and the sworn effect go together' });
});

export const DynamicDomainSchema = BaseEntrySchema.extend({
  label: blockLabel,
  requires: z.object({ frame: frameEnum, holdBand: str }).strict(),
  claim: z.enum(CLAIM_FORMS),
  grants: z.array(capabilityEnum).min(1),
  text: str.max(300),
  promptHint: blockHint,
  description: str,
}).strict();

export const DynamicTrackSchema = BaseEntrySchema.extend({
  label: blockLabel,
  category: str.optional(),
  thresholds: z.tuple([int.min(1), int.min(1), int.min(1), int.min(1), int.min(1)]).refine((t) => t.every((n, i) => i === 0 || n > t[i - 1]), 'the thresholds must rise'),
  description: str,
}).strict();

/**
 * P15b (spec §12.1): one alternative of a probe row's `needs`; every field present must hold. `likes` maps a practice category (read through `practiceOf`) or `worship.<targetId>` (read
 * through her expectation profile, planning ruling 9) to the least she must like it.
 */
const probeNeed = z.object({
  styles: z.array(profileStyle).min(1).optional(),
  drawnBy: z.array(z.enum(DRAWN_BY)).min(1).optional(),
  manner: z.record(z.enum(MANNER_AXES), z.tuple([int.min(-2).max(2), int.min(-2).max(2)])).optional(),
  likes: z.record(str, z.enum(['enjoys', 'craves'])).optional(),
}).strict().superRefine((n, ctx) => {
  if (n.styles === undefined && n.drawnBy === undefined && n.manner === undefined && n.likes === undefined) ctx.addIssue({ code: 'custom', message: 'an alternative needs at least one field' });
  for (const [axis, [lo, hi]] of Object.entries(n.manner ?? {})) if (lo > hi) ctx.addIssue({ code: 'custom', path: ['manner', axis], message: 'a bound runs from low to high' });
});

export const ProbeAxisSchema = BaseEntrySchema.extend({
  label: blockLabel,
  tier: z.union([z.literal(1), z.literal(2)]),
  promptHint: blockHint,
  /** P15b (§12.1): a row with `needs` enters her pool only with a `manner` and an alternative that holds; a `styles` alternative that holds takes two places. */
  needs: z.array(probeNeed).min(1).optional(),
  /** P15b (spec §12.3): the row's `needs` also say who a latent woman wakes for when she is admired (three praises in a fortnight): `latentCause` asks the rows that carry this. */
  wakesOnPraise: z.literal(true).optional(),
  description: str,
}).strict();

export const PositionRegionSchema = BaseEntrySchema.extend({ rank: z.enum(REGION_RANKS), label: blockLabel, description: str }).strict();

const aftermathEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('stress'), amount: int.min(-50).max(50) }).strict(),
  z.object({ type: z.literal('want'), amount: int.min(-50).max(50) }).strict(),
  z.object({ type: z.literal('night_knock') }).strict(),
  z.object({ type: z.literal('demand'), kind: z.enum(AFTERMATH_DEMAND_KINDS) }).strict(),
  z.object({ type: z.literal('booking') }).strict(),
  z.object({ type: z.literal('rule_interfere') }).strict(),
  z.object({ type: z.literal('threaten_tell'), audience: z.enum(['squad', 'outside']) }).strict(),
  z.object({ type: z.literal('rumor') }).strict(),
  z.object({ type: z.literal('squad_impunity'), amount: int.min(-50).max(50) }).strict(),
  z.object({ type: z.literal('vote_sabotage') }).strict(),
  z.object({ type: z.literal('defiance') }).strict(),
  z.object({ type: z.literal('trust'), amount: int.min(-50).max(50) }).strict(),
  z.object({ type: z.literal('return_offer') }).strict(),
  z.object({ type: z.literal('successor') }).strict(),
  z.object({ type: z.literal('protocol_slips'), days: int.min(1).max(30) }).strict(),
]);

const multiplier = z.number().min(0).max(5);
/** A value axis runs from low to high: the weight a side adds when she holds the axis on that side (at least one side). */
const valueSides = z.object({ high: z.number().min(0).max(20).optional(), low: z.number().min(0).max(20).optional() }).strict()
  .refine((v) => v.high !== undefined || v.low !== undefined, { message: 'a value weight names a side: high or low' });
export const AftermathWeightsSchema = z.object({
  base: z.number().min(0).max(20),
  styles: z.record(profileStyle, z.number().min(0).max(20)).optional(),
  values: z.record(z.enum(VALUE_AXES), valueSides).optional(),
  regard: z.record(str, multiplier).optional(),
  frames: z.record(frameEnum, multiplier).optional(),
  sworn: multiplier.optional(),
  command: multiplier.optional(),
  needsCompromat: z.literal(true).optional(),
  needsCommand: z.literal(true).optional(),
  mild: z.literal(true).optional(),
}).strict();

export const AftermathSchema = BaseEntrySchema.extend({
  kind: aftermathKind,
  label: blockLabel,
  weights: AftermathWeightsSchema,
  stages: z.array(z.object({ days: int.min(1).max(90), effects: z.array(aftermathEffect), directive: str.max(300), notice: str.max(160) }).strict()).min(1).max(4),
  contentTags: tagList,
  chainsTo: z.array(aftermathKind).min(1).optional(),
  description: str,
}).strict().superRefine((a, ctx) => {
  if (a.chainsTo?.includes(a.kind)) ctx.addIssue({ code: 'custom', path: ['chainsTo'], message: 'an aftermath cannot chain to its own kind' });
});

export const DynamicSignSchema = BaseEntrySchema.extend({
  kind: z.enum(SIGN_KINDS),
  amount: int.min(0).max(100),
  instant: z.literal(true).optional(),
  closenessOnly: z.literal(true).optional(),
  contentTags: tagList,
  description: str,
}).strict().superRefine((s, ctx) => {
  if (s.instant === true && s.closenessOnly === true) ctx.addIssue({ code: 'custom', path: ['instant'], message: 'a sign is instant or closeness-only, not both' });
  if (s.instant === true && s.amount !== 100) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'an instant sign is worth 100' });
  if (s.closenessOnly === true && s.amount !== 0) ctx.addIssue({ code: 'custom', path: ['amount'], message: 'a closeness-only sign adds no suspicion of a dynamic' });
});

Object.assign(registrySchemas, {
  practiceStyles: PracticeStyleSchema, holdBands: HoldBandSchema, dynamicFrames: DynamicFrameSchema, dynamicMilestones: DynamicMilestoneSchema,
  dynamicDomains: DynamicDomainSchema, dynamicTracks: DynamicTrackSchema, probeAxes: ProbeAxisSchema, positionRegions: PositionRegionSchema,
  aftermaths: AftermathSchema, regardBands: RegardBandSchema, dynamicSigns: DynamicSignSchema,
});

// ---------------------------------------------------------------------------------------------
// P16: practices. `AUTHOR TO WRITE`: every text is a draft. The engine reads seeds by `kind` / `tags` / `track` / `tier` / `needs`, punishments
// by `severity` and `effects[].type`, ceremony steps by `check`, never by id (`engine/practice/state.ts` holds the closed enums). What points
// into another registry is checked in `refs.ts`.

const stakeEnum = z.enum(STAKES);

/** An example of a practice for the model (not a list the player sees): `gist` is two to six words. */
export const PracticeSeedSchema = BaseEntrySchema.extend({
  kind: z.enum(PRACTICE_KINDS),
  contentTags: z.array(str).min(1),
  track: str,
  tier: int.min(1).max(5),
  gist: str.max(40).refine((g) => g.trim().split(/\s+/).length >= 2 && g.trim().split(/\s+/).length <= 6, 'a gist is two to six words'),
  stakes: stakeEnum,
  check: z.enum(CHECK_KINDS).optional(),
  proof: z.enum(PROOFS).optional(),
  audience: z.enum(SEED_AUDIENCE).optional(),
  romantic: z.literal(true).optional(),
  needs: capabilityEnum.optional(),
  /** A hold seed only: the hold it starts is a sensory one (the device dims, P16 R11). */
  sensory: z.literal(true).optional(),
  /** The days a task from this seed gives (1 to 7); none: `TUNING.practice.defaultDeadlineDays`. Every task has a deadline. */
  days: int.min(1).max(7).optional(),
  weight: z.number().min(0.1).max(20),
  description: str,
}).strict();
export type PracticeSeedEntry = z.infer<typeof PracticeSeedSchema>;

const punishmentEffect = z.discriminatedUnion('type', [
  z.object({ type: z.literal('slot_held'), slots: z.union([z.literal(1), z.literal(2), z.literal('day')]), sensory: z.literal(true).optional() }).strict(),
  z.object({ type: z.literal('privilege_revoked'), what: z.enum(['no_dms_others', 'no_free_activities', 'room']), days: int.min(1).max(14), arg: str.optional() }).strict(),
  z.object({ type: z.literal('protocol_extra'), days: int.min(1).max(14) }).strict(),
  z.object({ type: z.literal('cold_shoulder'), days: int.min(1).max(14) }).strict(),
  z.object({ type: z.literal('confession') }).strict(),
  z.object({ type: z.literal('mark'), days: int.min(1).max(14) }).strict(),
  z.object({ type: z.literal('stress'), amount: int.min(1).max(50) }).strict(),
  z.object({
    type: z.literal('injury_chance'), chance: z.number().min(0).max(1), perEndurance: z.number().min(0).max(1),
    perTrained: z.number().refine((n) => n > 0, 'a body route is not enough: `perTrained` must be above 0 (a trained skill lowers the risk too)'), days: int.min(1).max(14),
  }).strict(),
  z.object({ type: z.literal('physical') }).strict(),
  z.object({ type: z.literal('slap') }).strict(),
]);

/** What a holder does to the commander for an offence: a ladder of five severities, each effect needing the category that makes it allowed. */
export const HolderPunishmentSchema = BaseEntrySchema.extend({
  label: blockLabel,
  severity: int.min(1).max(5),
  effects: z.array(punishmentEffect).min(1),
  contentTags,
  public: z.literal(true).optional(),
  description: str,
}).strict().superRefine((p, ctx) => {
  const tags = p.contentTags ?? [];
  p.effects.forEach((fx, i) => {
    if (fx.type === 'privilege_revoked' && (fx.what === 'room') !== (fx.arg !== undefined)) {
      ctx.addIssue({ code: 'custom', path: ['effects', i, 'arg'], message: fx.what === 'room' ? 'a revoked room names its location in `arg`' : '`arg` (a location) is only for a revoked room' });
    }
    const needs = EFFECT_NEEDS[fx.type];
    if (needs.length > 0 && !needs.some((t) => tags.includes(t))) ctx.addIssue({ code: 'custom', path: ['effects', i], message: `the effect "${fx.type}" needs the content tag ${needs.map((t) => `"${t}"`).join(' or ')} on the row` });
  });
});
export type HolderPunishmentEntry = z.infer<typeof HolderPunishmentSchema>;

/** What a holder strikes with (R.2): data only in P16 (nothing reads it yet). */
export const ImplementSchema = BaseEntrySchema.extend({
  label: blockLabel,
  contentTags: z.array(str).min(1),
  force: int.min(1).max(5),
  mark: z.object({ kind: str, slots: int.min(1).max(12) }).strict(),
  sound: z.enum(SOUND_IDS).optional(),
  description: str,
}).strict();
export type ImplementEntry = z.infer<typeof ImplementSchema>;

/** One step of a ceremony of punishment (R.4): a chip, words, a number or a posture; the styles that keep it. */
export const CeremonyStepSchema = BaseEntrySchema.extend({
  order: int.min(1).max(20),
  check: z.enum(CEREMONY_CHECKS),
  posture: str.optional(),
  styles: z.array(profileStyle).min(1),
  label: blockLabel,
  promptHint: blockHint,
  description: str,
}).strict().superRefine((c, ctx) => {
  if ((c.check === 'posture') !== (c.posture !== undefined)) ctx.addIssue({ code: 'custom', path: ['posture'], message: 'a posture step names its posture, and only a posture step does' });
});
export type CeremonyStepEntry = z.infer<typeof CeremonyStepSchema>;

Object.assign(registrySchemas, { practiceSeeds: PracticeSeedSchema, holderPunishments: HolderPunishmentSchema, implements: ImplementSchema, ceremonySteps: CeremonyStepSchema });

// ---------------------------------------------------------------------------------------------
// P16b: the craft. `AUTHOR TO WRITE`: every text is a draft. The engine reads lessons by `slip` / `kind` / `interaction`, never by id.

/**
 * What she names after a slip (spec section 1.7): the point that failed, in her words. A row matches an engine event type (`slip`: `physics_slip`, `posture_slip_noted`, ...),
 * optionally the event's own `kind` and the interaction of the physics it came from; the most specific row wins (`kind` and `interaction` both, then one, then neither).
 * `point` is the engine's word for what failed (the hands, the windows, the gaze); `words` are her ways of saying it (one is picked by a hash, never drawn).
 */
export const CraftLessonSchema = BaseEntrySchema.extend({
  slip: str,
  kind: str.optional(),
  interaction: str.optional(),
  point: str,
  words: z.array(str).min(1),
  description: str,
}).strict();
export type CraftLessonEntry = z.infer<typeof CraftLessonSchema>;
registrySchemas.craftLessons = CraftLessonSchema;

/**
 * Her words for what the commander has learnt (spec section 4: records "in her hand", as margin lines of the CMDR file). Read by `kind`, never by id:
 * `record.longest` / `record.clean` / `record.noTap` (the line of a record, `{day}`, `{span}` in fiction time and `{where}`), `where.<physicsId>` (where the hold was,
 * `where.default` when nothing fits) and `signal.<motion>` (a foot signal she has named). No pronoun for the commander: the text is hers, in the first person.
 */
export const CRAFT_LINE_KIND = /^(record\.(longest|clean|noTap)|where\.[a-z0-9_]+|signal\.[a-z0-9_]+)$/;
export const CraftLineSchema = BaseEntrySchema.extend({
  kind: str.regex(CRAFT_LINE_KIND, 'a craft line kind is record.longest, record.clean, record.noTap, where.<physics> or signal.<motion>'),
  text: str.max(160),
  description: str,
}).strict();
export type CraftLineEntry = z.infer<typeof CraftLineSchema>;
registrySchemas.craftLines = CraftLineSchema;

/**
 * P16b (Task 9): the posture presets (docs/content/blocking.md section 7.2 and 7.3). A preset is a base position (`base`, one of the 13 of `blockingPostures`) with target states for
 * some of the points: only those it fixes are judged, the rest are free. The states are the dial's (`PointStates` in `src/ui/scene/dial/points.ts`, the code wins over the doc: the torso
 * also has `level` and `bent`, the arms `crossed`, `clasped_front`, `paws`, `tucked`, `lamp`, `desk_flat`). `drift` is how hard each judged point is to hold, in points per 10 s at
 * skill 0 (`AUTHOR TO TUNE`; the gaze is 0: it drifts by temptation, not fatigue); `variants` are the points she may set in a named posture; `supports` are the contacts (or physics)
 * the posture can carry; `signal` what a person walking in reads, `noise` how loud a correction is. Exactly one preset of each base has `default: true`: an old name on the base reads as it.
 * `tags` are content categories (the content gate reads them as `contentTags`). Read by field, never by id.
 */
export const POSTURE_POINTS = ['torso', 'hips', 'knees', 'arms', 'head', 'gaze', 'feet'] as const;
export const POSTURE_MEANINGS = [
  'attention', 'waiting', 'rest', 'casual', 'work', 'sleep', 'display', 'offering', 'request', 'apology', 'gratitude', 'worship', 'submission', 'punishment', 'endurance_test', 'object', 'pet',
] as const;
const postureStates = {
  torso: z.enum(['upright', 'forward', 'arched', 'level', 'bent']),
  hips: z.enum(['raised', 'on_heels', 'to_floor']),
  knees: z.enum(['together', 'apart']),
  arms: z.enum([
    'at_sides', 'behind_back', 'behind_head', 'on_thighs_down', 'on_thighs_up', 'forward_palms_up', 'out_sideways', 'raised', 'holding', 'on_floor', 'on_ankles', 'under_knees', 'bound',
    'crossed', 'clasped_front', 'paws', 'tucked', 'lamp', 'desk_flat',
  ]),
  head: z.enum(['up', 'bowed', 'back', 'to_floor']),
  gaze: z.enum(['down', 'at_her', 'straight', 'closed']),
  feet: z.enum(['flat', 'on_toes']),
} as const;
const postureStateMap = z.object({
  torso: postureStates.torso.optional(), hips: postureStates.hips.optional(), knees: postureStates.knees.optional(), arms: postureStates.arms.optional(),
  head: postureStates.head.optional(), gaze: postureStates.gaze.optional(), feet: postureStates.feet.optional(),
}).strict();
export const ServicePostureSchema = BaseEntrySchema.extend({
  base: lowerId,
  points: postureStateMap,
  variants: z.object({
    torso: z.array(postureStates.torso).min(2).optional(), hips: z.array(postureStates.hips).min(2).optional(), knees: z.array(postureStates.knees).min(2).optional(),
    arms: z.array(postureStates.arms).min(2).optional(), head: z.array(postureStates.head).min(2).optional(), gaze: z.array(postureStates.gaze).min(2).optional(),
    feet: z.array(postureStates.feet).min(2).optional(),
  }).strict().optional(),
  meaning: z.array(z.enum(POSTURE_MEANINGS)).min(1),
  humiliation: z.number().int().min(0).max(5),
  tags: z.array(str),
  requires: z.object({
    track: str.optional(), frame: z.enum(['play', 'role', 'rule']).optional(), affordances: z.array(lowerId).min(1).optional(),
    /** The commander must be at one of these places (any of). */
    anchor: z.array(lowerId).min(1).optional(),
    /** The commander must wear one of these items. */
    items: z.array(lowerId).min(1).optional(),
  }).strict().optional(),
  drift: z.object({
    torso: z.number().min(0).max(40).optional(), hips: z.number().min(0).max(40).optional(), knees: z.number().min(0).max(40).optional(), arms: z.number().min(0).max(40).optional(),
    head: z.number().min(0).max(40).optional(), gaze: z.number().min(0).max(40).optional(), feet: z.number().min(0).max(40).optional(),
  }).strict(),
  supports: z.array(str).min(1).optional(),
  signal: z.enum(['none', 'odd', 'telling', 'exposing']),
  noise: z.enum(['low', 'mid', 'high']),
  /** What the dial draws besides the body (an item, a place) and the restraint of a hogtie: hints only, read by the mannequin. */
  item: z.enum(['tray', 'lamp', 'rope', 'mouth']).optional(),
  hint: z.enum(['wall', 'wall_front', 'desk', 'feet']).optional(),
  hogtie: z.literal(true).optional(),
  default: z.literal(true).optional(),
  label: blockLabel,
  promptHint: blockHint,
  description: str,
}).strict();
export type ServicePostureEntry = z.infer<typeof ServicePostureSchema>;
registrySchemas.servicePostures = ServicePostureSchema;

/** Adds the optional `description` rule to a registry schema without changing its shape. */
function withDescription(schema: z.ZodTypeAny): z.ZodTypeAny {
  return schema.superRefine((entry: { description?: unknown }, ctx) => {
    const d = entry.description;
    if (d === undefined) return;
    if (typeof d !== 'string' || d.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: 'description must be a non-empty string' });
    } else if (stripLinks(d).length > DESCRIPTION_MAX) {
      ctx.addIssue({ code: 'custom', path: ['description'], message: `description is at most ${DESCRIPTION_MAX} characters` });
    }
  });
}

registrySchemas.glossary = GlossarySchema;
for (const name of DESCRIBED_REGISTRIES) {
  if (name === 'skills' || name === 'statuses') continue; // already require a `description`
  registrySchemas[name] = withDescription(registrySchemas[name]);
}

// ---------------------------------------------------------------------------------------------
// P14: model refusal patterns

/**
 * A phrase a model uses to refuse. `pattern` is a case-insensitive regular expression that must compile. `scope` `json` (the default)
 * is tried only on a JSON call whose answer holds no parsable JSON; `any` is also tried on prose, so it must be an AI-voice phrase
 * ("as an AI"), never something a character could say in the story.
 */
export const LlmRefusalSchema = BaseEntrySchema.extend({
  pattern: str.refine((p) => {
    try {
      new RegExp(p, 'i');
      return true;
    } catch {
      return false;
    }
  }, 'the pattern is not a valid regular expression'),
  lang: str,
  scope: z.enum(['json', 'any']).default('json'),
}).strict();

Object.assign(registrySchemas, { llmRefusals: LlmRefusalSchema });

// ---------------------------------------------------------------------------------------------
// P10e-e (R7): her voice on the scene cards

/**
 * The fixed kinds of her card lines (card-voice.md §1, §2, §5; the slap's of Task 11). A later kind (the throne's) is added here and
 * `VoiceKind` (`src/ui/scene/cards/voice.ts`) follows. The static words of §3 are `static.milestone.<id>`, `static.claim.<domainId>`,
 * `static.claim.submit` and `static.return.<terms>` (`CARD_VOICE_STATIC`).
 */
export const CARD_VOICE_KINDS = [
  'when', 'cost', 'costHold', 'lapse', 'lapseHidden', 'free', 'who', 'onlyMe',
  'proof.in_person', 'proof.witness', 'proof.report',
  'weight', 'punishLabel', 'noLength', 'sayIt', 'closes', 'hands', 'talked', 'sealed', 'sealedTrack',
  'demoWho', 'demoWhoMore', 'demoNone', 'demoWhere', 'demoAgain', 'order',
  'cerTitle', 'cerWords', 'cerPosture', 'cerNumber', 'moment', 'exposing',
  'call.right', 'call.wrong', 'call.slow',
  'grants',
  'slap.before', 'slap.feint', 'slap.again', 'slap.after.none', 'slap.after.braced', 'slap.after.flinched',
  // P10e-e ruling Q: breath's lines (breath.html `LINES`, card-voice.md §7); an empty row is a style that is silent there (cold)
  'breath.greedy', 'breath.entry', 'breath.now', 'breath.hold', 'breath.early', 'breath.tap', 'breath.low', 'breath.good', 'breath.poor',
  'breath.released', 'breath.stop', 'breath.wake', 'breath.fake', 'breath.again',
  // P10e-e ruling Q: weight's lines (weight.html `LINES`, card-voice.md §8); her first words are `weight.entry.<contact>` (CARD_VOICE_STATIC)
  'weight.released', 'weight.slip', 'weight.caught', 'weight.heavy', 'weight.good', 'weight.poor', 'weight.fall', 'weight.stop', 'weight.longer', 'weight.announce',
  // P10e-e ruling Q: scent's lines (saturation.html `LINES`, its `STYLES[].ask` and `judge`'s words, card-voice.md §9); her first words and her
  // named places by the contact are `scent.entry.<contact>` / `scent.here.<contact>` (CARD_VOICE_STATIC)
  'scent.deeper', 'scent.gently', 'scent.still', 'scent.moved', 'scent.good', 'scent.bad', 'scent.away', 'scent.cough', 'scent.liar', 'scent.caught',
  'scent.need', 'scent.end', 'scent.stop', 'scent.lost.low', 'scent.lost.high', 'scent.mouth', 'scent.answer.ok', 'scent.answer.bad', 'scent.answer.empty', 'scent.ask',
  'scent.miss.warm', 'scent.miss.admit', 'scent.miss.bad', 'scent.miss.want', 'scent.miss.place', 'scent.miss.strength', 'scent.miss.band',
  'scent.miss.intensity_wrong', 'scent.miss.intensity_missing', 'scent.miss.honest',
  // P10e-e ruling Q: the jaw's lines (jaw.html `LINES`, card-voice.md §10); her first words by what holds the mouth open are `jaw.entry.<contact>`
  // (CARD_VOICE_STATIC); `jaw.ask` lines are `question|word` (no word: any answer); `jaw.stop` is finish's line after the stop word
  'jaw.teeth', 'jaw.deeper', 'jaw.out', 'jaw.suck', 'jaw.wide', 'jaw.correct', 'jaw.restOk', 'jaw.restNo', 'jaw.ask', 'jaw.heard', 'jaw.lost', 'jaw.end',
  'jaw.slack', 'jaw.stop',
  // P10e-e ruling Q: her frame's fixed lines (her_activity.html `STYLES`: her name for the commander, and her lines by situation); `activity.stop`
  // is finish's line after the stop word
  'activity.name', 'activity.noticed', 'activity.correct', 'activity.call', 'activity.end', 'activity.askReply', 'activity.breach', 'activity.silent', 'activity.stop', 'activity.rest', 'activity.fall',
  // final review Minor 3: her spoken words the prototype writes inline (her waking words at `with` / `glancing` and elsewhere, her "come in." to a
  // visitor, "Stay." after her entry); her spoken order in an entry is `activity.entry.<view>` (CARD_VOICE_STATIC)
  'activity.woke', 'activity.wokeMumble', 'activity.comeIn', 'activity.stay',
  // P10e-e 24b: the throne's lines (throne.html `T_LINES`)
  'throne.spill', 'throne.skid', 'throne.thank', 'throne.thanked', 'throne.noThanks',
  // P10e-e Task 26: foot service's lines (her_activity.html `SVC_LINES`); her words for the zones are `service.zone.<zone>` (CARD_VOICE_STATIC, `ZONE_WORDS`)
  'service.good', 'service.poor', 'service.wrong', 'service.missed',
  // P10e-e Task 28: shoe service's lines (shoe.html `LINES`, card-voice.md §14); her words for the zones are `shoe.zone.<zone>` (CARD_VOICE_STATIC,
  // `ZONE_WORDS`); `shoe.stop` is finish's line after the stop word (the prototype's inline one)
  'shoe.entry', 'shoe.turn', 'shoe.sole', 'shoe.kiss', 'shoe.polish', 'shoe.other', 'shoe.caught', 'shoe.swallowed', 'shoe.good', 'shoe.poor',
  'shoe.missed', 'shoe.dull', 'shoe.stamp', 'shoe.end', 'shoe.stop',
  // P10e-e Task 30: gulp's lines (gulp.html `LINES`, card-voice.md §15); `gulp.surge` is ritual's word (the cue `surge` may take its place);
  // `gulp.stop` is finish's line after the stop word (the prototype's inline one)
  'gulp.entry', 'gulp.surge', 'gulp.tapped', 'gulp.spill', 'gulp.cough', 'gulp.done', 'gulp.clean', 'gulp.cleaned', 'gulp.missed', 'gulp.stop',
] as const;
/** The kinds of her static words (card-voice.md §3), keyed by a milestone id, a domain id (or `submit`) and the return's terms; her first words under a weight, by the contact (§8, `weight.entry.<contact>`); under her scent, her first words and her named places by the contact (§9); in the jaw, her first words by what holds the mouth open (§10, `jaw.entry.<contact>`). */
export const CARD_VOICE_STATIC = /^(static\.(milestone\.[a-z0-9_]+|claim\.[a-z0-9_]+|return\.[a-z0-9_]+)|weight\.entry\.[a-z0-9_]+|scent\.(entry|here)\.[a-z0-9_]+|jaw\.entry\.[a-z0-9_]+|activity\.(self|toYou|ask|exchange|entry)\.[a-z0-9_]+|service\.zone\.[a-z0-9_]+|shoe\.zone\.[a-z0-9_]+)$/;

/**
 * P10e-e R7: a table of her lines on the scene's cards (`docs/content/card-voice.md` is the readable copy, approved by the author). Read
 * by `kind` and `style` (`voiceLine`), never by id: a row with `style` is that holder style's own variants, a row without is the neutral
 * lines. `{x}` is the engine's value as it is, `{X}` capitalised where it opens a sentence.
 */
export const CardVoiceSchema = BaseEntrySchema.extend({
  kind: str.refine((k) => (CARD_VOICE_KINDS as readonly string[]).includes(k) || CARD_VOICE_STATIC.test(k), 'an unknown card voice kind'),
  style: str.optional(),
  lines: z.array(str.max(160)),
}).strict().refine((e) => e.lines.length > 0 || ((e.kind.startsWith('breath.') || e.kind.startsWith('weight.') || e.kind.startsWith('scent.') || e.kind.startsWith('jaw.') || e.kind.startsWith('activity.') || e.kind.startsWith('throne.') || e.kind.startsWith('shoe.') || e.kind.startsWith('gulp.')) && e.style !== undefined) || e.kind === 'gulp.surge', 'no lines (only a style\'s own breath, weight, scent, jaw, frame, shoe or gulp row may be empty: she is silent there; gulp\'s `surge` is empty for every style but ritual\'s)');
export type CardVoiceEntry = z.infer<typeof CardVoiceSchema>;
registrySchemas.cardVoice = CardVoiceSchema;
