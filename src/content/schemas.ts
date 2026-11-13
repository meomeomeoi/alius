import { z } from 'zod';
import { EFFECT_TARGETS, STATS, TRIGGERS, ALWAYS_ON_TYPES } from '../engine/combat/types';
import { EVENT_TYPES, PROPOSAL_KINDS, SEVERITIES } from '../engine/relations/vocab';
import { VALUE_AXES } from '../engine/state/types';
import { DILEMMA_CONTEXTS } from '../engine/dilemma/types';
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
const valueAxis = z.enum(VALUE_AXES);

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
    event: z.enum(EVENT_TYPES),
    severity: z.enum(['minor', 'moderate', 'major', 'extreme']),
    targets: z.enum(['party', 'named']),
    valueAxes: z.array(z.object({ axis: z.enum(VALUE_AXES), direction: z.union([z.literal(-1), z.literal(1)]) }).strict()).optional(),
  }).strict(),
  z.object({ type: z.literal('incoming_unit') }).strict(),
  z.object({ type: z.literal('fact'), text: str.max(200), tags: z.array(str), importance: worldInt.min(1).max(5) }).strict(),
  z.object({
    type: z.literal('offer_mission'), templateId: str, regionId: str.optional(), source: z.enum(['command', 'story', 'rumor', 'side']),
  }).strict(),
  // P6: a dynamic flag in the namespace of the thread it belongs to (overview §6.1)
  z.object({ type: z.literal('thread_flag'), threadId: str, flagId: z.string().regex(/^thread:[^:]+:[a-z0-9_]+$/, 'flagId must be thread:<threadId>:<slug>'), description: str.max(120) }).strict(),
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
  fx('outgoing', { pct: num, vs: z.enum(['any', 'marked', 'locked']).optional(), scale: ScaleSchema.optional() }),
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
  z.object({ type: z.literal('defect_upkeep'), target: z.enum(['selected', 'companion']), ...amountFields }).strict(),
  z.object({ type: z.literal('relation'), axis: z.enum(['trust', 'affinity', 'attraction']), amount: int, ...amountFields }).strict(),
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
  }).strict()).optional(),
  effects: z.array(ActivityEffectSchema),
  companionEffects: z.array(ActivityEffectSchema),
  flavor: z.enum(['none', 'short']),
  /** The activity opens a scene (P3); the slot is consumed when the scene ends, not here. */
  startsScene: z.boolean().optional(),
  blockedWhenCommanderInjured: z.boolean().optional(),
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
  id: z.enum(EVENT_TYPES),
  /** P7a: one-line cause shown in relationship history readings; absent = the humanized event id. */
  cause: str.max(80).optional(),
  rows: z.object({ minor: eventRow, moderate: eventRow, major: eventRow, extreme: eventRow }).strict(),
  /** The row holds magnitudes; the sign comes from value alignment (decision events). */
  valueAligned: z.boolean().optional(),
  /** Attraction gains are scaled by the unit's receptivity (romance on, Affinity ≥ 0, Trust ≥ 20). */
  attractionUsesReceptivity: z.boolean().optional(),
});

export const LocationSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  ascii: z.array(z.string()).min(1).max(12),
  /** Asset paths relative to the extension folder; v1 ships none. */
  background: str.optional(),
  backgroundNight: str.optional(),
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
  arc: z.object({ cure: str, manage: str, embrace: str }),
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
  label: str.max(80),
  requires: z.object({ stat: socialStat, rank: int.min(1).max(5) }).strict().optional(),
  /** P7: authored options only; generated dilemma options never carry one. */
  routeCheck: RouteCheckSchema.optional(),
  effects: z.array(WorldEffectSchema),
}).passthrough();

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
}).superRefine((d, ctx) => {
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
  const options = d.fixed.options as Array<{ effects: WorldEffect[] }>;
  if (!d.contexts.includes('expedition_event')) {
    options.forEach((o, i) => o.effects.forEach((e, j) => {
      if (EXPEDITION_ONLY_EFFECTS.includes(e.type)) {
        ctx.addIssue({ code: 'custom', path: ['fixed', 'options', i, 'effects', j, 'type'], message: `"${e.type}" is only meaningful in an expedition event` });
      }
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

/** Player-visible registries whose entries carry an optional `description` (skills and statuses already require one). */
export const DESCRIBED_REGISTRIES = [
  'roles', 'skills', 'signatures', 'statuses', 'defects', 'items', 'affixes', 'enemies',
  'enemyCategories', 'regions', 'nodeTypes', 'activities', 'facilities', 'crimes',
  'corporations', 'starts', 'relationshipStates', 'locations', 'orders', 'synergies',
] as const satisfies readonly RegistryName[];

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
