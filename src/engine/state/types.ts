import type { CombatResult, CombatState } from '../combat/types';
import type { DilemmaState } from '../dilemma/types';
import type { RngState } from '../rng';
import type { SpecialState } from '../special/state';
import type { EndedState, LeashswapState } from '../warden/state';
import type { Clock, DirectorRequest, ExpeditionReport, ExpeditionState, Mission, RegionState, Rumor, Thread } from '../world/types';

export type Slot = 'morning' | 'afternoon' | 'evening' | 'night';
export type Difficulty = 'story' | 'normal' | 'hard';
export type UnitKind = 'named' | 'grunt';
export type UnitStatus = 'active' | 'reserve' | 'injured' | 'deserted' | 'dead' | 'terminated' | 'reassigned';
export type LoyaltyBand = 'steady' | 'wavering' | 'breaking';

/** Reserved in v1: `Relation.marks` is always empty (overview §10). */
export type MarkInstance = { id: string };

export const VALUE_AXES = ['pragmatism', 'autonomy', 'ingroup', 'mercy', 'corporate', 'sacrifice'] as const;
export type ValueAxis = (typeof VALUE_AXES)[number];

export const RARITIES = ['standard', 'refined', 'prototype', 'corporate', 'anomalous'] as const;
export type Rarity = (typeof RARITIES)[number];

/** One owned item (P4). `Unit.equipment[slot]` holds its `uid`; it is the only record of who wears it. */
export interface ItemInstance {
  uid: string;
  itemId: string;
  rarity: Rarity;
  /** Upgrade level 0–5. */
  upgrade: number;
  affixes: string[];
}

export type LootDrop =
  | { kind: 'item'; item: ItemInstance }
  | { kind: 'credits' | 'plyx' | 'supplies'; amount: number };

/** A resource key as the player reads it: PLYX is always written in capitals (the key stays `plyx`). */
export const resourceWord = (resource: string): string => (resource === 'plyx' ? 'PLYX' : resource);

export type LeashKind = 'compel' | 'suppress' | 'terminate';

/** One Leash use. P3's `resentful` state counts entries by `unitId`. */
export interface LeashLogEntry {
  no: number;
  unitId: string;
  kind: LeashKind;
  day: number;
  context: 'scene' | 'combat' | 'arc' | 'desertion' | 'mutiny' | 'pda';
  outcome: 'done' | 'failed' | 'denied';
  /** P9b: the squad leader oversight copied on the request (outside perception was active); absent otherwise. */
  cc?: string;
}

/** Per unit loyalty bookkeeping (P6). */
export interface LoyaltyRecord {
  signs: Array<{ day: number; about: 'doubt' | 'desertion' | 'mutiny'; kind: 'dm' | 'fact' | 'talk'; signId: string }>;
  attempts: number;
  nextCheckDay?: number;
  /** The earliest day of her next `doubt` sign while she is wavering (a unit that has just started wavering waits first). */
  nextDoubtDay?: number;
  trigger?: { kind: 'leash' | 'betrayal' | 'forced_cure'; day: number };
  cause?: { kind: 'attack' | 'desertion'; day: number };
  deniedDay?: number;
  desertedDay?: number;
  stance?: 'hostile' | 'ally';
  returned?: boolean;
}

/** A desertion, mutiny or return waiting for the commander's answer. */
export interface Confrontation {
  kind: 'desertion' | 'mutiny' | 'return';
  unitId: string;
  day: number;
  at: 'night' | 'mission_start';
  nightEntryId?: string;
  talkTried?: boolean;
  sympathizers?: string[];
  combatId?: string;
}

export interface DefectInstance {
  id: string;
  arc?: string;
  /** In-universe origin line written at import (P1). */
  origin?: string;
  /** Grunt defect: no arc (P2). */
  lite?: boolean;
  /** Day a Manage-arc defect was last maintained in the medbay (P2). */
  upkeepDay?: number;
  /** Progress of a defect arc path (P6). */
  arcSteps?: { done: number; needed: number; lastDay?: number };
}

/** The signature skill a unit owns: a template id plus the unit's own name and description. */
export interface SignatureInstance {
  templateId: string;
  name: string;
  description: string;
}

/** A unit's stance toward a world norm (P8 §3.1). */
export interface WorldStance {
  stance: 'shares' | 'indifferent' | 'opposes';
  strength: 1 | 2;
  reason: string;
}

/** P9d: how a unit leads and bonds, read from her card (absent = a modest profile, `bondOf`). */
export type LeadStyle = 'dominant' | 'assertive' | 'balanced' | 'yielding';
export type Attachment = 'slow' | 'steady' | 'intense' | 'avoidant';
export type DesireLevel = 'low' | 'medium' | 'high';
export type Publicity = 'secret' | 'known' | 'public';
export interface Bond {
  leadStyle: LeadStyle;
  attachment: Attachment;
  desire: DesireLevel;
  caretaker: boolean;
  /** What SHE would not do: `contentCategories` ids, and a note of at most 160 characters. */
  ownLimits: { categories: string[]; note?: string };
  /** HER preference for how open the relationship is. */
  publicity: Publicity;
}

/** P9d: a relationship rule a leading partner proposed (the registry `relationshipRuleTemplates` comes with chunk (b)). */
export interface Rule {
  id: string;
  unitId: string;
  templateId: string;
  text: string;
  status: 'proposed' | 'negotiating' | 'active' | 'suspended';
  day: number;
  brokenCount: number;
  lastBrokenDay?: number;
  /** The proposal reached the commander (a DM from her, or said in the scene); only a delivered proposal can be answered. */
  delivered?: boolean;
  dmId?: string;
}

/** P9d: who leads a romantic scene. */
export interface SceneLead {
  by: 'unit' | 'commander' | 'shared';
  unitId: string;
  score: number;
}

export interface Unit {
  id: string;
  kind: UnitKind;
  cardRef?: string;
  displayName: string;
  asciiPortrait?: string;
  /** Grunt designation such as `K-117` (P2); `displayName` may later become a generated name. */
  designation?: string;
  /** One-line generated bio of a grunt (P2). */
  bio?: string;
  /** Days left before an injured unit recovers (P2). */
  injuryDays?: number;
  roleId: string;
  level: number;
  xp: number;
  skillPoints: number;
  unlockedNodes: string[];
  signatureSkill: SignatureInstance;
  baseStats: { hp: number; atk: number; def: number; spd: number; crit: number };
  currentHp: number;
  stress: number;
  defects: DefectInstance[];
  values: {
    pragmatism: number;
    autonomy: number;
    ingroup: number;
    mercy: number;
    corporate: number;
    sacrifice: number;
  };
  likes: string[];
  dislikes: string[];
  triggers: string[];
  equipment: { weapon?: string; upper?: string; lower?: string };
  injuries: string[];
  status: UnitStatus;
  /** Equipped active skills (P4); absent = the role's starter skills. */
  loadout?: string[];
  /** Set while the unit is broken down: until the expedition ends (P4). */
  breakdown?: { defectId: string; day: number; /** P9d: an off-combat breakdown ends after this day (`wantBreakdown`). */ until?: number };
  /** P7: up to 3 taste ids (registry `tastes`) about how the unit reads the commander. */
  commanderTastes?: string[];
  /** P8: how far this named unit sits from the world's disposition level, −2…2 (absent = 0). Grunts use the world level. */
  dispositionOffset?: number;
  /** P8: the one-line reason for the offset, proposed at import. */
  dispositionReason?: string;
  /** P8: her own stance toward each `squadStance` world option (absent = indifferent). */
  worldStances?: Record<string, WorldStance>;
  /** P9d: the bond profile from her card; absent = modest (`bondOf`). */
  bond?: Bond;
  /** P10b: the `handFonts` entry her notes are written in (absent = the hashed default of her id; set by `squad/set_hand`). */
  hand?: string;
  /** P10c: the `quartersStyles` entry of her quarters (absent = the hashed default of her id; set by `squad/set_quarters`). */
  quarters?: string;
  /** P14b: what she has become since joining, on top of the imported profile (absent = nothing yet). Read through `development/profile`. */
  development?: Development;
  /** P14b: how well she reads what happens around her (from the import; absent = `mid`). A profile field. */
  insight?: Insight;
  /** P14c: how she talks and carries herself (absent = the defaults). Read through `temperamentOf`; a re-sync keeps the locked fields. */
  temperament?: Temperament;
  /** P14c: the temperament fields the player locked (a re-sync and a future drift leave them alone). */
  temperamentLocks?: Array<keyof Temperament>;
  /** P14c: her hobbies and how far each has come (absent = none). */
  hobbies?: HobbyState[];
  /** P14c: what she picks up quickly and what she does not (absent = every hobby is standard). */
  aptitudes?: { high: string[]; low: string[] };
  /** P14c: her formed opinions, by topic id (absent = none yet; they form lazily). */
  opinions?: Record<string, Opinion>;
}

/** P14c: the setting `lifeEvents`: how often her days off-screen bring something. */
export type LifeMode = 'off' | 'rare' | 'normal' | 'often';
export type Talkativeness = 'silent' | 'terse' | 'talkative';
export type Volatility = 'steady' | 'moody';
export type Humor = 'none' | 'dry' | 'mocking' | 'warm';
export interface Temperament { talkativeness: Talkativeness; volatility: Volatility; humor: Humor }

/** P14c: one hobby of hers. `skill` and `interest` are 0..100 and never shown as numbers. */
export interface HobbyState {
  id: string;
  skill: number;
  interest: number;
  state: 'active' | 'cooling' | 'dropped';
  since: number;
  lastPracticeDay?: number;
  coolingSince?: number;
  plateau?: { at: number; since: number };
  /** Ids of the milestones reached. */
  milestones: string[];
  ceiling?: true;
  mastered?: true;
  /** The day she reached her last milestone (bookkeeping: two women never reach the same milestone of the same hobby on one day). */
  lastMilestoneDay?: number;
}

/** P14c: a formed opinion on a topic of the library. */
export interface Opinion {
  position: string;
  strength: 'strong' | 'held' | 'loose';
  /** The position in her own words (at most 200 characters). */
  text?: string;
  formedDay: number;
  voicedDay?: number;
  history?: Array<{ day: number; from: string; to: string }>;
  push?: { toward: 'first' | 'last'; amount: number };
}

/** P14c: something waiting to reach the commander, in the news queue. */
export interface NewsItem {
  id: string;
  unitId: string;
  kind: 'event' | 'hobby';
  /** A life event id or a hobby id. */
  ref: string;
  what: 'event' | 'milestone' | 'breakthrough' | 'started' | 'dropped' | 'mastered';
  milestoneId?: string;
  factId?: string;
  category: string;
  day: number;
  notable?: true;
  urgent?: true;
  caused?: true;
}

/** P14c: what is kept of one woman's days off-screen. */
export interface LifeUnit {
  /** Life event id → the last day she had it. */
  last: Record<string, number>;
  week?: { n: number; events: number; notable: number };
  hub?: { eventId: string; day: number };
  firsts?: string[];
  jokes?: Record<string, { count: number; last: number }>;
  jokeDay?: number;
  meetingDay?: number;
  taught?: string[];
  /** The open scene's triggers and picks. */
  scene?: { sceneId: string; topics: string[]; topic?: string; joke?: string };
  /** Topics opened by an event or a trace, waiting to be formed. */
  pendingTopics?: string[];
}

/** P14c: the life systems (events off-screen, the news queue, hobbies' bookkeeping, running jokes). Created by `life/set_frequency` or by the setup; absent = nothing. */
export interface LifeState {
  /** The seed of every hash-picked chance: the setup seed, or a hash of the rng at the moment life was turned on. */
  salt: number;
  nextId: number;
  units: Record<string, LifeUnit>;
  queue: NewsItem[];
  /** The last 14 days of delivered news. */
  delivered: Array<{ day: number; unitId: string; category: string; hobby: boolean; caused?: true }>;
  outbox: Array<{ itemId: string; unitId: string; channel: 'dm' | 'note'; day: number }>;
  /** Pending news directives. */
  news: Array<{ itemId: string; unitId: string; until: number; passing?: true }>;
  /** The last 7 days of event kinds, for the squad-wide gap. */
  kinds: Array<{ kind: string; unitId: string; day: number }>;
  /** `old`: she was already dead when life was turned on, so the day is not the day she died (no event reads it as recent). */
  deaths: Array<{ unitId: string; day: number; grunt: boolean; old?: true }>;
  busy: Array<{ unitId: string; slot: number; activityId?: string }>;
  shortageDay?: number;
  /** Bookkeeping: the week (`floor(day / 7)`) a pair last shared a practice slot, keyed by the two ids sorted (a shared slot counts once a week). */
  shared?: Record<string, number>;
  /** A `time_together` waiting for its scene. */
  pending?: { unitId: string; pastimeId: string; locationId: string; day: number; slot: Slot };
}

/** P14b: the setting `characterDevelopment`. */
export type DevelopmentMode = 'off' | 'slow' | 'normal';
export type Insight = 'low' | 'mid' | 'high';

/** P14b: how she read an event (the model's reading of an intent, or a registry row for an engine event). */
export type Wanted = 'yes' | 'no' | 'unclear';
export type Initiator = 'target' | 'actor' | 'mutual';
export type Harm = 'none' | 'minor' | 'serious';
export type Outcome = 'good' | 'mixed' | 'bad';
export interface Reading { wanted: Wanted; initiator: Initiator; harm: Harm; outcome: Outcome }
export type AppraisalRole = 'subject' | 'actor' | 'witness';

/** P14b: one event as one soldier read it. Hidden from every panel (see `tests/fixtures/analyze/hidden.ts`). */
export interface Appraisal extends Reading {
  id: string;
  day: number;
  /** The event type, `activity:<id>` or `dilemma:<context>`. */
  kind: string;
  /** `her` | `commander` | `unit:<id>` | `squad`. */
  target: string;
  role: AppraisalRole;
  severity: Severity;
  sceneId?: string;
  /** `commander` or the unit it happened to. */
  subject: string;
  /** A witness read it wrong (`wanted` and `initiator` are the flipped ones; `truth` is the real reading). */
  misread?: true;
  truth?: Reading;
  /** What this appraisal added to the accumulators (kept for revision and UNDO). */
  pushes: Array<{ axis: string; amount: number }>;
  summary: string;
}

export interface DevFact {
  id: string;
  text: string;
  kind: 'attitude' | 'value' | 'habit' | 'skill' | 'memory';
  day: number;
  source: 'review' | 'habit' | 'life';
  /** The `habits` entry a habit fact was written for (so the view and the readings can show the habit with its line). */
  habitId?: string;
  sceneId?: string;
  shownDay?: number;
  edited?: true;
}

export interface DevMoment {
  id: string;
  axis: string;
  from: string;
  to: string;
  reason: string;
  day: number;
  sceneId?: string;
  shownDay?: number;
}

/** P14b: what the last applied review changed, so a REROLL before it was shown can restore it exactly. */
export interface ReviewInverse {
  drift: Partial<Record<ValueAxis, number>>;
  bond: Development['bond'];
  gained: Development['gained'];
  lost: Development['lost'];
  /** What the review took out of the accumulators, signed (UNDO adds it back; pushes recorded since stay). */
  acc: Record<string, number>;
  factIds: string[];
  momentIds: string[];
  /** Facts the review pushed out of the list (the oldest unedited ones). */
  droppedFacts?: DevFact[];
  lastReview?: number;
  pending: Appraisal[];
  habits?: string[];
}

export interface Development {
  /** Value axes only; fractional, inside the caps. */
  drift: Partial<Record<ValueAxis, number>>;
  /** Axis key → support, clamped to ±`TUNING.development.accCap`. */
  acc: Record<string, number>;
  /** Discrete changes, applied on top of the import. */
  bond?: Partial<Pick<Bond, 'attachment' | 'desire' | 'caretaker' | 'leadStyle'>>;
  gained?: { likes?: string[]; dislikes?: string[]; tastes?: string[] };
  lost?: { likes?: string[]; dislikes?: string[]; tastes?: string[] };
  /** Axis keys the card states strongly (from the import, at most 4). */
  anchors: string[];
  /** Axis keys the player froze (edit lock off only). */
  held?: string[];
  /** `activity:<id>` | `companion:<unitId>` | `region:<id>` → count. */
  counters: Record<string, number>;
  /** Appraisals since the last review, the oldest dropped past `pendingMax`. */
  pending: Appraisal[];
  /** Misread appraisals kept for revision (at most `misreadMax`, dropped after `misreadDays`). */
  misread?: Appraisal[];
  facts: DevFact[];
  moments: DevMoment[];
  habits: string[];
  /** The day of the last review (absent = 0). */
  lastReview?: number;
  lastApplied?: ReviewInverse;
  /** Per-unit id counter for `ap<n>`, `df<n>`, `dm<n>`. */
  nextId: number;
}

export interface DailyGain {
  trust: number;
  affinity: number;
  attraction: number;
}

export type Severity = 'minor' | 'moderate' | 'major' | 'extreme';

/** One line of a relation's story (P3). Trimmed to `TUNING.relations.historyMax`. */
export interface HistoryEntry {
  day: number;
  kind: 'event' | 'state' | 'proposal' | 'mark';
  type: string;
  severity?: Severity;
  detail?: string;
}

export interface Relation {
  trust: number;
  affinity: number;
  attraction: number;
  stateId: string;
  stateSince: number;
  history: HistoryEntry[];
  flags: string[];
  dailyGain: DailyGain;
  loyaltyBand: LoyaltyBand;
  marks: MarkInstance[];
  /** A concealed romance (P3): the state it will turn into when discovered, and who must not know. */
  affair?: { as: string; hiddenFrom: string[]; since: number };
  /** P7: the first day the unit knew the commander (absent in older saves until `commander/seed`). */
  metDay?: number;
  /** P9: the stored term `R` of her Impunity, −40…40 (absent = 0); decays 1 a day toward 0. */
  impunityRecord?: number;
  /** P9d: Want 0–100 (absent = 0). */
  want?: number;
  /** P9d: the day Want last crossed the breakdown band (so a breakdown starts once per crossing). */
  wantBreakDay?: number;
  /** P9d: the last day the commander shared a scene with her or wrote to her (judges a `daily_contact` rule). */
  contactDay?: number;
  /** P9d: how open the relationship is; set while she is in a `romantic` tier state. */
  publicity?: { level: Publicity; commanderPref?: Publicity; since: number };
}

/** A remembered fact (P3). `knownBy` holds unit ids or `'*'` for public; the commander always knows. */
export interface Fact {
  id: string;
  about: string[];
  text: string;
  tags: string[];
  importance: 1 | 2 | 3 | 4 | 5;
  day: number;
  sceneId?: string;
  knownBy: string[];
  /** P3b: never folded, never pruned, +2 in retrieval. */
  pinned?: true;
  /** P3b: units that know the fact only as a rumor, and the day each heard it. */
  heard?: Record<string, number>;
  /** P3b: the retold version (rumor mode `model`), shown to every hearer. */
  rumor?: { text: string };
  /** P3b: the commander does not know it (P12 writes these). Never shown by `Knowledge`. */
  hiddenFromCommander?: true;
  /** P3b: the player edited the text. */
  edited?: true;
  /** P3b: still spreading as a rumor (a rule's `spread`). */
  spread?: 'slow' | 'fast';
  /** P3b: the dossiers (unit ids or `*`) this fact was already folded into; it is removed once every one of its targets has it. */
  foldedInto?: string[];
}

/** P3b: how much memory a campaign keeps and shows. `custom` is a preset the player edited. */
export type MemoryPreset = 'short' | 'normal' | 'long' | 'custom';
export interface MemoryConfig {
  factsMax: number;
  foldAfterDays: number;
  recencyBase: number;
  retrievalK: number;
  memoryTokens: number;
  journalLines: number;
  dmLines: number;
  chronicleDays: number;
  rumorMode: 'plain' | 'model';
  hideScenesAfter: number;
  /** P11b: the longest text a fact keeps, in characters (the player's own choice, kept across presets; default 200). */
  factTextMax: number;
}

/** P3b: old facts of one unit (or the world, `'*'`) folded into two paragraphs. */
export interface Dossier {
  own: string;
  shared: string;
  day: number;
  folded: number;
}

/** P3b: where an ended scene sits in the ST chat, and whether its summary was stored. */
export interface SceneMark {
  sceneId: string;
  from: number;
  to: number;
  summarized: boolean;
  /** P14: the scene's day, place and people, written only while `summarized` is false, so a late summary can still be stored (`scene/late_summary`). */
  day?: number;
  locationId?: string;
  participants?: string[];
}

/** P14: why a model call failed; mirrors the `FailReason` of `src/llm/orchestrator.ts` (the engine does not import `llm/`). */
export type GenerationFailReason = 'no_profile' | 'network' | 'timeout' | 'truncated' | 'refused' | 'invalid_output' | 'empty';

/**
 * P14: one failed model call that can still be retried. It holds no prompt, no transcript and no model text: `detail` is a zod
 * issue path and message or an adapter error message, cut to `TUNING.generation.detailMax`.
 */
export interface GenerationRecord {
  /** `g<n>` from `generations.seq`. */
  id: string;
  /** The site (`scene.intents`, `flavor.demand`, …): what asked for the generation. */
  siteId: string;
  /** What the site generates for (a scene chunk, a dilemma id, a unit id), site-specific. */
  key: string;
  reason: GenerationFailReason | 'expired';
  detail: string;
  /** Model calls made for it so far (every automatic retry and every RETRY counts). */
  attempts: number;
  day: number;
  slot: Slot;
  /** The `llmLog` timestamp of the last attempt (matches the debug log entry). */
  at: number;
  /** The budget multiplier of the last attempt. */
  budgetMult: number;
  /** The site's fallback already ran next to this record. */
  fallbackApplied?: true;
  status: 'open' | 'expired';
  expiredWhy?: string;
  expiredDay?: number;
  /** A background site: listed in SYS only, never counted for the badge or the hub line. */
  quiet?: true;
}

export interface PromiseRecord {
  id: string;
  by: string;
  to: string;
  text: string;
  status: 'open' | 'kept' | 'broken';
  day: number;
  deadlineDay?: number;
  /** Unit ids (or `'*'`) who heard the promise; absent = visible to everyone (P2-era saves). The commander always knows. */
  knownBy?: string[];
}

export interface ChronicleEntry {
  id: string;
  kind: 'scene' | 'day' | 'week';
  day: number;
  toDay?: number;
  text: string;
  sceneId?: string;
  /** The slot a scene line belongs to (scene entries only; compacted entries have none). */
  slot?: Slot;
  /** P3b: who knows it: the unit ids that were there, or `'*'`. Absent = written before P3b: LOG only, never a prompt. A compacted entry inherits it. */
  audience?: string[] | '*';
}

export type SceneOrigin = 'activity' | 'night' | 'mess' | 'event' | 'debrief' | 'prologue';

/** The open scene (P3). The transcript stays in the ST chat; only the start index is stored. */
export interface SceneRecord {
  id: string;
  day: number;
  slot: Slot;
  locationId: string;
  participants: string[];
  mode: 'private' | 'group';
  origin: SceneOrigin;
  consumesSlot: boolean;
  startIndex: number;
  /** First chat index `intent_extract` has not read yet (survives a reload; absent in older saves = `startIndex`). */
  readIndex?: number;
  exchanges: number;
  nightEntryId?: string;
  /** P3b: the digest of the scene so far (the model's account of the chat up to `upTo`, an index into the ST chat). Gone with the scene. */
  digest?: { text: string; upTo: number };
  /** Orders a unit refused in this scene, with the exchange number (P6). */
  refusals?: Array<{ unitId: string; exchange: number }>;
  /** P9d: `romantic` or `intimate` once the scene has gone there (never lowered). */
  tone?: 'romantic' | 'intimate';
  /** P9d: who leads, decided when the tone is first set or raised. */
  lead?: SceneLead;
  /** P9d: the commander followed her lead in this scene (FOLLOW works once per scene). */
  followed?: true;
  /** P9d: in-fiction boundaries the commander set for this scene (SET A LIMIT), at most five. */
  limits?: string[];
  /** P9d: replies flagged for content that is switched off (`index` = the reply's chat index, so a rollback removes the mark). */
  violations?: Array<{ index: number; categories: string[] }>;
  /** P14c: this scene is a quiet meeting (a pastime with her); set when the scene starts, read at its end. */
  pastime?: { id: string; unitId: string };
}

export interface PendingProposal {
  id: string;
  unitId: string;
  kind: string;
  from: 'unit' | 'commander';
  day: number;
  channel: 'scene' | 'dm';
  targetState: string;
  needsDisclosure: boolean;
}

export interface DmMessage {
  id: string;
  from: 'commander' | string;
  text: string;
  day: number;
  slot: Slot;
  read: boolean;
  initiated?: boolean;
  /** P9d: a reply of hers that depicts content switched off (the category ids). */
  violation?: string[];
  /** P9c: the unit at device level 4 who edited this message before it was sent (the commander kept the edit). */
  editedBy?: string;
  /** P10b: the `dmBehaviours` entries stamped when the message arrived (never rewritten); absent = a plain message. */
  behaviours?: string[];
}

/** P11: a lead the director set (`objectiveHint`). At most one is open; the newest finished ones are kept for the log. */
export interface StoredObjective {
  id: string;
  text: string;
  source: 'director';
  /** The day it is due, when the director gave a number of days. */
  dueDay?: number;
  done: boolean;
}

/** P11: progress through a prologue (the registry entry `prologueId`). Wizard steps are already in `completed` or `skipped` when the campaign is built. */
export interface OnboardingState {
  prologueId: string;
  /** The current step; once `done` it stays on the last step (`free`). */
  stepId: string;
  /** The day the current step began (the `next_day` completion compares against it). */
  stepDay: number;
  completed: string[];
  skipped: string[];
  done: boolean;
  /** Named units the commander has had their first words with. */
  spoken?: string[];
  /** Coach hints the player dismissed. */
  hintsSeen?: string[];
  /** The soldier who leads the guided first evening. */
  guideUnitId?: string;
  /** The guide's first DM was sent (or asked for), so a reload does not send it twice or never. */
  guideDmSent?: true;
  /** The tutorial run the `expedition` step offered. */
  tutorialMissionId?: string;
}

/** P10b: a note a soldier left in her hand (the text is copied when it is written, `{name}` filled). */
export interface HandNote {
  id: string;
  unitId: string;
  noteId: string;
  where: 'quarters' | 'gear' | 'door';
  text: string;
  day: number;
  read?: true;
}

export interface NightEntry {
  id: string;
  unitId: string;
  kind: string;
  priority: number;
  framing: string;
  ignore: { event: string; severity: Severity };
  expiresDay: number;
  /** P9d: categories of the spec this entry came from; turning one off withdraws the entry. */
  contentTags?: string[];
  /** P10b: the one exchange through the closed door (what the commander said, what she answered). Absent = none yet. */
  door?: { said: string; reply?: string };
}

export interface Commander {
  name: string;
  corporationId: string | null;
  crimeId: string | null;
  /** Current ranks 1–5. */
  socialStats: { authority: number; insight: number; empathy: number; cunning: number };
  /** Points behind the ranks (P2); absent until the first gain, a rank then counts as its threshold. */
  socialPoints?: { authority: number; insight: number; empathy: number; cunning: number };
  /** The commander is injured while `day` is below this (P2). */
  injuredUntilDay?: number;
  flags: string[];
  /** P7: physical stats 1–5 (absent in a P0–P6 save until `commander/seed`; read through `commanderProfile`). */
  body?: Record<BodyStat, number>;
  /** P7: training progress in tenths of a session, per stat. */
  bodyXp?: Record<BodyStat, number>;
  /** P7: 1 very feminine … 5 very masculine. No mechanical value (overview P11). */
  expression?: number;
  /** P7: 1 green … 5 veteran. */
  seasoning?: number;
  /** P7: up to 2 regular traits and at most 1 special. */
  traits?: { regular: string[]; special?: string };
  /** P7: derived from the body sum, cached. */
  archetype?: Archetype;
  /** P7: false until the player has seen the "commander file incomplete" modal of a migrated save. */
  fileReviewed?: boolean;
  /** P7: the day (a quiet night's follower) on which the effective Empathy rank is lowered by `sleepless_rank`. */
  sleeplessDay?: number;
  /** P7: the rank changes that apply on `sleeplessDay` (copied from the `sleepless_rank` trait effects when the night was spent awake). */
  sleeplessRank?: Partial<Record<'authority' | 'insight' | 'empathy' | 'cunning', number>>;
  /** P12: the commander's own stress 0–100 (absent = 0). Read through `commanderStress`; `socialRank` reads it directly (it has no registry). */
  stress?: number;
  /** P9: counters of the commander's deeds (absent = all 0). Reputations are read from them. */
  deeds?: Partial<Record<DeedCounter, number>>;
  /** P14c: how well the commander has learned each hobby from her (0..100, by hobby id); shown only as a descriptor, no mechanical value. */
  hobbySkill?: Record<string, number>;
  /** P9: the nicknames the squad gives the commander (at most 2 active) and the one waiting for its scene. */
  reputation?: {
    active: Array<{ id: string; name: string; sinceDay: number; by?: string; /** The day its pattern stopped holding (it leaves a week later without a successor). */ lapsedDay?: number }>;
    pending?: { id: string; queuedDay: number; replaces?: string };
  };
}

export const DEED_COUNTERS = [
  'leash_compel', 'leash_suppress', 'leash_terminate', 'grunts_lost', 'protected', 'defiance_tolerated',
  'punish_1', 'punish_2', 'punish_3', 'punish_4', 'promises_kept', 'promises_broken',
  'demands_granted', 'demands_refused', 'threats_kept', 'threats_empty',
] as const;
export type DeedCounter = (typeof DEED_COUNTERS)[number];

export type DisciplineChannel = 'scene' | 'dm' | 'pda';

/** A defiance whose `R` gain waits for the commander's answer (P9): it settles when the scene ends or at the next day end. */
export interface PendingDefiance {
  unitId: string;
  severity: Severity;
  day: number;
  source: 'intent' | 'order' | 'demand';
  sceneId?: string;
}

/** A threat the commander made and has not carried out yet; it lapses into a yield at the end of the next day. */
export interface PendingThreat {
  id: string;
  unitId: string;
  /** A `punishments` id, `leash` or `unspecified`. */
  measure: string;
  day: number;
  deadlineDay: number;
  /** Fixed at registration: her Impunity was below `TUNING.impunity.believeBelow`. */
  believed: boolean;
  channel: DisciplineChannel;
  sceneId?: string;
  messageRef?: string;
  inverse: Inverse;
}

/** What an application changed, so UNDO can put exactly that back (P9). Every number is the applied delta after clamps. */
export interface Inverse {
  axes?: { trust?: number; affinity?: number; attraction?: number };
  stress?: number;
  record?: number;
  dailyGain?: { trust?: number; affinity?: number; attraction?: number };
  /** The state and loyalty band the application caused (put back only while she is still in them). */
  state?: { from: string; to: string; sinceFrom: number };
  loyaltyBand?: { from: LoyaltyBand; to: LoyaltyBand };
  /** P9d: her publicity before the application removed or changed it (UNDO puts it back together with the state). */
  publicity?: NonNullable<Relation['publicity']>;
  /** The history lines the application wrote (UNDO removes exactly these). */
  history?: HistoryEntry[];
  /** A full history drops its oldest lines when new ones arrive: the lines it dropped and where they were (UNDO puts them back). */
  historyDropped?: Array<{ at: number; line: HistoryEntry }>;
  /** `state.discipline` did not exist before: UNDO drops it again once it is empty, so the save looks untouched. */
  createdDiscipline?: true;
  restrictionIds?: string[];
  resources?: { credits?: number; supplies?: number; plyx?: number };
  deeds?: Partial<Record<DeedCounter, number>>;
  factId?: string;
  /** P14b: the appraisals the application recorded for her (UNDO removes them and takes their pushes back out of the accumulators). */
  appraisals?: Array<{ unitId: string; id: string }>;
  /** Copies of what the application removed. */
  defiance?: PendingDefiance;
  threat?: PendingThreat;
}

export interface Application {
  id: string;
  unitId: string;
  measure: string;
  source: 'menu' | 'dialogue';
  channel: DisciplineChannel;
  day: number;
  sceneId?: string;
  messageRef?: string;
  inverse: Inverse;
}

export interface Restriction {
  unitId: string;
  kind: 'confined' | 'no_leave' | 'benched' | 'duty';
  untilDay?: number;
  day?: number;
  slot?: Slot;
  applicationId?: string;
  demandId?: string;
  /** P9b: `oversight` = corporate oversight confined her (a scapegoat dilemma); no application, no Impunity record. */
  source?: 'oversight';
}

export interface Demand {
  id: string;
  unitId: string;
  templateId: string;
  text: string;
  day: number;
  expiresDay: number;
  status: 'undelivered' | 'open';
  /** Opened by a delegate that complied one Trust band short: refusing it adds a broken promise. */
  owed?: boolean;
  /** Her stance at opening was `open_defiance` or `defiant_loyal`: granting it gives `R` +4. */
  impunityDriven: boolean;
  dmId?: string;
}

/** P9b: the decisions the squad can vote on (the `voteKinds` registry has one entry each). */
export const VOTE_KINDS = ['mission', 'upgrade', 'punish', 'rations', 'scapegoat'] as const;
export type VoteKind = (typeof VOTE_KINDS)[number];
/** P9b: what the commander can do to restore authority in the eyes of outsiders (the `outsideFeats` registry has one entry each). */
export const OUTSIDE_TRIGGERS = ['crisis_cover', 'ordered_mission', 'negotiation'] as const;
export type OutsideTrigger = (typeof OUTSIDE_TRIGGERS)[number];
/** P9b: how a shortage is shared out. */
export type RationMode = 'equal' | 'fighters_first' | 'commander_short';
/** P9b: the term of a ballot that moved it most (it picks the reason line). */
export const BALLOT_TERMS = ['values', 'trust', 'stance', 'demand', 'affected'] as const;
export type BallotTerm = (typeof BALLOT_TERMS)[number];
export type VoteStatus = 'open' | 'passed' | 'failed' | 'overruled' | 'carried' | 'dropped';

export interface Ballot {
  unitId: string;
  vote: 'for' | 'against' | 'abstain';
  weight: number;
  score: number;
  term: BallotTerm;
}

export interface Vote {
  /** `v<seq>`. */
  id: string;
  kind: VoteKind;
  subject: string;
  day: number;
  ballots: Ballot[];
  commanderWeight: number;
  forWeight: number;
  againstWeight: number;
  passed: boolean;
  status: VoteStatus;
}

export interface VoteLogEntry {
  id: string;
  day: number;
  kind: VoteKind;
  subject: string;
  result: 'carried' | 'dropped' | 'overruled';
  forWeight: number;
  againstWeight: number;
}

/** P9b: one combat's worth of a unit's merit points (the last 14 days count). */
export interface MeritEntry { day: number; unitId: string; points: number }

export interface Hierarchy {
  /** Standing of every named living unit at `computedDay`. */
  standings: Record<string, number>;
  leaderId?: string;
  /** The commander has formally made the leader second-in-command. */
  endorsed: boolean;
  challengeCooldownUntil?: number;
  computedDay: number;
  /** A challenge she lost: she cannot lead until `untilDay`. */
  deposed?: { unitId: string; untilDay: number };
  /** A challenge she won: +`amount` standing until `untilDay`. */
  standingBonus?: { unitId: string; amount: number; untilDay: number };
  /** A feat keeps outsiders from addressing the leader until this day. */
  outsideSuppressedUntil?: number;
}

/** A leader's countermand of a companion activity, waiting for ACCEPT / OVERRULE. */
export interface Countermand { leaderId: string; unitId: string; payload: unknown; day: number; slot: Slot }

export interface PowerState {
  votes: { open?: Vote; log: VoteLogEntry[]; seq: number };
  /** Units overruled in a vote → the day it happened; the grudge ends at the next day end. */
  grudges?: Record<string, number>;
  hierarchy?: Hierarchy;
  merit?: MeritEntry[];
  countermand?: Countermand;
  scapegoatQueue?: Array<{ missionId: string; unitId: string; witnessIds: string[]; /** P9e: absent = a vote. */ source?: 'vote' | 'her_call' }>;
  /** P9e: the soldiers the commander ordered to ask first → the day it was ordered. While set she never acts on her own. */
  askFirst?: Record<string, number>;
}

export interface DisciplineState {
  defiance: PendingDefiance[];
  threats: PendingThreat[];
  /** The newest `TUNING.impunity.applicationsMax` applications. */
  applications: Application[];
  restrictions: Restriction[];
  sabotage?: { queued: Array<{ unitId: string; day: number }>; gear?: { unitId: string; day: number }; /** The day of the last sabotage (the cooldown of the random roll). */ lastDay?: number };
  demands: Demand[];
  /** Days on which a demand opened, per unit (the last 7 days), for the weekly cap. */
  demandLog: Array<{ unitId: string; day: number; /** Her last template is not picked again. */ templateId?: string }>;
}

// ---------------------------------------------------------------------------------------------
// P9c: personal pressure. Every field is optional; absent `CampaignState.personal` = nothing booked, given, wagered or kept.

export type DecorPart = 'sticker' | 'wallpaper' | 'contact';

/** Level-1 decor on the commander's device (P9c §1): stored per unit, the level itself is derived. */
export interface Decor {
  since: number;
  parts: DecorPart[];
  contactName: string;
  /** Her access fell to 0: the decor shows as a faded mark until this day, then it is deleted. */
  fadedUntil?: number;
  /** The day the commander peeled each part; it does not grow back for `TUNING.personal.decor.regrowDays`. */
  removed?: Partial<Record<DecorPart, number>>;
}

export type InterceptChannel = 'dm' | 'leash' | 'recruit';

/** A level-4 edit waiting for KEEP / REVERT. `status: 'kept'` = the commander kept it and the app has yet to send it. */
export interface Intercept {
  id: string;
  unitId: string;
  channel: InterceptChannel;
  toUnitId?: string;
  /** What the commander wrote (a DM, at most 1000 characters): the edit is worded again from it after a reload. Never the edited text. */
  original?: string;
  day: number;
  status: 'open' | 'kept';
}

export type BookingSource = 'roll' | 'wager' | 'smother';

/** A slot of the commander that a unit booked (P9c §2). */
export interface Booking {
  id: string;
  unitId: string;
  kindId: string;
  day: number;
  slot: Slot;
  status: 'booked' | 'played' | 'cancelled' | 'lapsed';
  source: BookingSource;
  /** The day she made it (the weekly cap counts these). */
  made?: number;
  conflict?: true;
}

export interface Token {
  id: string;
  giverId: string;
  kindId: string;
  /** The kind's label with her name filled (what the scene line and the dossier say). */
  label: string;
  /** The day the commander accepted it. */
  day: number;
  worn: boolean;
  /** A won wager: the token is worn and locked until this day (removing it early breaks a promise). */
  lockedUntil?: number;
  /** The day the commander took it off (the giver notices today and tomorrow). */
  removedDay?: number;
}

export interface TokenOffer { id: string; giverId: string; kindId: string; label: string; day: number; dmId?: string }

export type WagerStatus = 'offered' | 'accepted' | 'pending_run';

export interface Wager {
  id: string;
  unitId: string;
  by: 'unit' | 'commander';
  gameId: string;
  stakeId: string;
  day: number;
  status: WagerStatus;
  /** A game's choice: the commander's hand, the expedition bet's pick, the sparring handicap id. */
  pick?: string;
  /** The DM that carries her challenge. */
  dmId?: string;
}

export interface WagerLogEntry { id: string; unitId: string; gameId: string; stakeId: string; day: number; winner: 'unit' | 'commander' | 'void' }

export type SecretReason = 'protect_commander' | 'self_interest' | 'leader_order';
export type SecretStatus = 'kept' | 'found' | 'confronted' | 'pretend' | 'used';

/** A thing the squad keeps from the commander. Not a `Fact` while kept (P9c §5). */
export interface SquadSecret {
  id: string;
  kindId: string;
  text: string;
  subjectId?: string;
  knownBy: string[];
  reason: SecretReason;
  day: number;
  status: SecretStatus;
  foundRoute?: string;
  foundDay?: number;
  usedUntil?: number;
}

export interface PersonalState {
  /** Counter behind the ids of intercepts, bookings, tokens, wagers and secrets. */
  seq: number;
  decor?: Record<string, Decor>;
  intercepts?: { open?: Intercept; log: Array<{ unitId: string; day: number }> };
  bookings?: Booking[];
  /** A unit who lost a slot wager cannot book the commander until this day. */
  noBookUntil?: Record<string, number>;
  claims?: Array<{ unitId: string; day: number; refused?: true }>;
  tokens?: { owned: Token[]; offer?: TokenOffer; given: string[] };
  wagers?: { open: Wager[]; log: WagerLogEntry[] };
  obedience?: { unitId: string; day: number; who: 'commander' | 'unit' };
  /** A question wager was won and waits for its text: the commander's answer (she asked) or the commander's question (the commander asked). */
  pendingQuestion?: { wagerId: string; unitId: string; winner: 'commander' | 'unit' };
  truth?: { unitId: string; wagerId: string; question: string };
  mark?: { unitId: string; untilDay: number };
  secrets?: SquadSecret[];
  /** Who has led the squad since which day: the successor secret needs a leader who held for a week. */
  leaderSince?: { unitId: string; day: number };
}

export type BodyStat = 'strength' | 'endurance' | 'reflexes';
export type Archetype = 'frail' | 'slight' | 'average' | 'fit' | 'hardened';

/** One change of a resource, a unit's stress or a relation axis, recorded by `dispatch` (P7a). */
export interface LedgerEntry {
  day: number;
  slot: Slot;
  /** The action type that caused it, e.g. `activity/do`. */
  action: string;
  /** `res:<resource>`, `stress:<unitId>`, `axis:<unitId>:<axis>` or `body:<stat>` (P7). */
  key: string;
  delta: number;
}

/** P11b: the head start of a campaign. `units` lists every soldier who knew the commander before day 1 (new arrivals are not listed). */
export interface HeadStartState {
  days: 7 | 14 | 30;
  units: Array<{ unitId: string; impression: 'positive' | 'negative' | 'neutral'; moments: string[] }>;
  /** Set by the first `head_start/recap`; a reroll replaces the texts in place. */
  recap?: { source: 'model' | 'fallback'; chronicleId: string };
}

export interface CampaignState {
  version: number;
  rng: RngState;
  day: number;
  slot: Slot;
  difficulty: Difficulty;
  /** Snapshot of the settings the campaign was started with. */
  settings: Record<string, unknown>;
  commander: Commander;
  squad: Unit[];
  roster: { activeIds: string[]; capacity: number };
  relations: Record<string, Relation>;
  resources: { credits: number; supplies: number; plyx: number };
  base: {
    /** Facility levels; an absent key means level 1 (P2). */
    facilities: Record<string, number>;
    /** Pending facility upgrades (P2). */
    upgrades?: Array<{ facilityId: string; toLevel: number; daysLeft: number }>;
    /** P9b: how a shortage is shared out (absent = `equal`). Read through `rationsOf`. */
    rations?: RationMode;
  };
  inventory: ItemInstance[];
  /** Counter behind item uids `it_<n>` (P4). */
  itemSeq?: number;
  world: {
    regions: Record<string, RegionState>;
    clocks: Clock[];
    threads: Thread[];
    factions: Record<string, number>;
    flags: string[];
    spineProgress: number;
    /** Id of the start this campaign began with (P1). */
    startId?: string;
    /** Clearance tier 0–3 that raises the level cap (P5 writes it, P4 reads it). */
    clearanceTier?: number;
    /** `seedWorld` has run (P5). Older saves load without it and are seeded by `world/seed`. */
    seeded?: boolean;
    /** Spine bookkeeping (P5): the beat the director proposed and when. */
    spine?: { proposed?: string; proposedDay?: number; lastProposalDay?: number };
    /** The open director request, if any, and the last tick (P5). */
    director?: {
      pending?: DirectorRequest;
      lastTickDay?: number;
      seq?: number;
      /** The last day the fallback advanced a clock (it does so once per day). */
      lastClockDay?: number;
      /** A full request that arrived while a scout request was open: opened as soon as that one is answered. */
      after?: 'day_end' | 'expedition';
    };
    /** Named units the story offered that the player has not answered yet (P5). */
    incomingUnits?: number;
    lastExpeditionRegionId?: string;
    /** P8: the chosen world options, `{ [optionId]: choiceId }`. Absent in old saves, which read every default. */
    options?: Record<string, string>;
  };
  missions: { offered: Mission[]; active: Mission[]; completed: Mission[] };
  rumors: Rumor[];
  dms: Record<string, DmMessage[]>;
  /** Per unit: the day and how many commander DMs were sent that day (the unit's "social battery", P3). */
  dmMeta?: Record<string, { day: number; sent: number }>;
  memory: {
    facts: Fact[];
    chronicle: ChronicleEntry[];
    promises?: PromiseRecord[];
    nextId?: number;
    /** P3b: absent = the `normal` preset. Named presets store only `preset` (plus the two mode fields); `custom` stores overrides. */
    config?: { preset: MemoryPreset } & Partial<MemoryConfig>;
    /** P3b: per unit id (or `'*'` for the world) the folded old facts. */
    dossiers?: Record<string, Dossier>;
    /** P3b: ST message ranges Alius hid (`/hide`), so that turning hiding off unhides exactly these. */
    hidden?: Array<[number, number]>;
    /** P3b: the last 50 ended scenes with their chat range. */
    scenes?: SceneMark[];
    /** P3b: counter of the facts a memory rule writes (`fr1`, `fr2`, …); `nextId` is never advanced by P3b. */
    nextRememberId?: number;
  };
  /** Recent changes of resources, stress and relation axes (P7a): the newest 150 entries of the last 7 days. Absent in older saves. */
  ledger?: LedgerEntry[];
  /** P10b: the notes soldiers left (a counter and the list, oldest first); absent in older saves = none. */
  notes?: { seq: number; list: HandNote[] };
  /** P14: failed model calls that can be retried (at most `TUNING.generation.maxRecords`, oldest first); absent in older saves = none. */
  generations?: { seq: number; records: GenerationRecord[] };
  /** The open scene, if any (P3). */
  scene?: SceneRecord;
  /** Open proposals waiting for the commander's answer (P3). */
  proposals?: PendingProposal[];
  calendar: {
    scheduled: unknown[];
    nightEventsQueue: NightEntry[];
    /** Consecutive days with a supply shortage (P2). */
    shortageStreak?: number;
    /** The queue entry being played in the current Night slot (P2 moves it here; P3 reads it). */
    nightEvent?: NightEntry;
    /** A conversation requested by `talk` that has not ended yet; it holds its slot (P2). P3 ends it with `scene_end`. */
    pendingScene?: { unitId: string; day: number; slot: Slot };
    /** P7: the next day starts in the Afternoon (an exhausted commander slept through the morning). */
    loseMorning?: boolean;
  };
  /** `log` stays `unknown[]` on purpose: `leashLog(state)` filters the well-formed entries, older saves may hold others. */
  leash: { authorizationsLeft: number; refreshDay: number; log: unknown[]; seq?: number; seeded?: boolean };
  /** P9: pending defiance, threats, applications, restrictions, sabotage and demands. Created on first write; absent in older saves. */
  discipline?: DisciplineState;
  /** P9b: votes, the squad hierarchy, merit, a countermand and the scapegoat queue. Created on first write; absent in older saves. */
  power?: PowerState;
  /** P9c: decor, bookings, tokens, wagers, obedience and squad secrets. Created on first write; absent in older saves. */
  personal?: PersonalState;
  /** P12: the special-trait systems (Secret Frequency, Bloom-induced Paranoia, Web of Debts). Created by the seed; absent without a special trait. */
  special?: SpecialState;
  /** P13: the LEASHSWAP mode (the warden, her agenda, the intrigue, the removal). Absent = the default mode: no warden, no override, no co-sign, and the commander cannot die. */
  leashswap?: LeashswapState;
  /** P13: the campaign is over (the commander died under `campaign_end`, or was executed). Absent = running. Every action but `debug/*` and `campaign/epilogue` is refused. */
  ended?: EndedState;
  /** P9d: the content categories the player switched on (absent = none). Read through `enabledCategories`. */
  content?: { enabled: string[] };
  /** P9d: relationship rules and the smother hold (absent = none). */
  bonds?: { rules: Rule[]; smother?: { unitId: string; untilDay: number } };
  /** Loyalty, signs and open confrontations (P6). Absent in older saves. */
  disloyalty?: { units: Record<string, LoyaltyRecord>; open?: Confrontation };
  /** Dilemma bookkeeping and the open dilemma (P6). Absent in older saves. */
  dilemmas?: {
    seq: number;
    lastDay?: number;
    lastDefiningDay?: number;
    definingBeats?: string[];
    recent?: string[];
    open?: DilemmaState;
  };
  /** The open expedition (P5). Only expedition/combat/director/debug actions run while it is open. */
  expedition?: ExpeditionState;
  /** The last finished expedition's after-action report (P5). */
  lastExpedition?: ExpeditionReport;
  /** The open combat (P4). Only `combat` and `rng` change while it runs. */
  combat?: CombatState;
  /** The last finished combat, for P5's recap and debrief (P4). */
  lastCombat?: CombatResult;
  /**
   * P11: where the campaign is in its prologue. Absent = there is no prologue (an old campaign, or a start without one):
   * nothing is locked and no step is shown. Written by `buildCampaign`, moved only by the `onboarding/*` actions.
   */
  onboarding?: OnboardingState;
  /** P14c: her days off-screen, the news queue and the running jokes. Created when the setting is turned on; absent = nothing. */
  life?: LifeState;
  /** P11b: set only when the campaign began with a head start (`days > 0`); absent = 0. World time never moves: `day` is still 1 at the start. */
  headStart?: HeadStartState;
  /**
   * P11: only the director's hints are stored; prologue, spine and unit objectives are read from where they already
   * live (`objectiveList`). Absent in an older save.
   */
  objectives?: StoredObjective[];
  /** An open workshop session of a given day (P4). */
  workshopSession?: { day: number; opsLeft: number; companionId?: string };
  /** Cached display names of affixed enemies, keyed `enemyId|affixes` (P4; at most 100). */
  enemyNames?: Record<string, string>;
}
