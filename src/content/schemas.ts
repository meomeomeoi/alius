import { z } from 'zod';
import { EVENT_TYPES, PROPOSAL_KINDS, SEVERITIES } from '../engine/relations/vocab';
import { VALUE_AXES } from '../engine/state/types';
import { REGISTRY_NAMES, type RegistryName } from './types';

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

export const CorporationSchema = BaseEntrySchema.extend({
  name: str,
  summary: str,
  values: ValuesSchema,
  oversightStyle: str,
  playable: z.boolean(),
  startingBonus: textWithEffects,
  // No reference check: `regions` stays empty until P5, which adds it.
  startingRegionId: str.optional(),
});

export const StartSchema = BaseEntrySchema.extend({
  name: str,
  corporationId: str,
  summary: str,
  situation: str,
  spine: z.array(z.object({ id: str, title: str, goal: str })).min(5).max(8),
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
});

export const SignatureSchema = BaseEntrySchema.extend({
  id: z.string().regex(/^sig_[a-z0-9_:.-]*$/, 'signature id must start with sig_'),
  name: str,
  mechanic: str,
  fits: str,
});

// `DefectSchema` is defined after the P3 pieces below it depends on.

export const StatusSchema = BaseEntrySchema.extend({
  name: str,
  kind: z.enum(['buff', 'debuff']),
  description: str,
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
  nightEvents: z.array(NightSpecSchema).optional(),
});

Object.assign(registrySchemas, {
  relationshipStates: RelationshipStateSchema,
  eventDeltas: EventDeltaSchema,
  locations: LocationSchema,
  defects: DefectSchema,
});
