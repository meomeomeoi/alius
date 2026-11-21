import { RESPONSE_TYPES, type ResponseType } from '../blocking/types';
import { OFFER_ANSWERS, TONES, type DynamicOffer, type OfferAnswer, type Tone } from '../dynamic/types';
import { normalizeTag } from '../setup';
import type { LifeOffer } from '../life/types';
import { VALUE_AXES, type Reading, type Severity, type ValueAxis } from '../state/types';
import { TUNING } from '../tuning';
import { DYNAMIC_INTENT_TYPES, EVENT_TYPES, FIRST_KINDS, LIFE_EVENT_TYPES, PROPOSAL_KINDS, SEVERITIES, type EventType, type ProposalKind } from './vocab';

export { EVENT_TYPES, PROPOSAL_KINDS, SEVERITIES };
export type { EventType, ProposalKind };

export interface EventIntent {
  type: EventType;
  actor: 'commander' | string;
  targets: string[];
  severity: Severity;
  valueAxes?: Array<{ axis: ValueAxis; direction: -1 | 1 }>;
  tags?: string[];
  /** P9: a `punishments` id, `leash` or `unspecified`; only on `commander_enforced` and `threatened`. */
  measure?: string;
  /** P9: the demand template of an engine-made `granted_demand` / `refused_demand`. */
  templateId?: string;
  /** P15: an engine-made `refused_demand` nobody chose (the demand ran out): it costs the holder nothing and is not a refusal of hers. Never set by a model. */
  lapsed?: true;
  /** P9d: the rule a `rule_kept` / `rule_broken` / `compromise_reached` is about, and the agreed text of a compromise. */
  ruleId?: string;
  text?: string;
  /** P13: the warden's override a `compromise_reached` settles (an id from the list the model was shown). */
  overrideId?: string;
  /** P13: the warden's expectation an `expectation_kept` / `expectation_broken` is about (an id from the list the model was shown). */
  expectationId?: string;
  /** P12: the intercepted item a `knowledge_leak` is about (an id from the list the model was given). */
  itemId?: string;
  /** P14c: the news item a `news_told` closes, the hobby a `hobby_praised` is about, the topic and the position an opinion event is about, the kind of a `first_moment` and the fact a `joke_returned` brings back (each an id from the list the model was shown). */
  newsId?: string;
  hobbyId?: string;
  topicId?: string;
  positionId?: string;
  kind?: string;
  factId?: string;
  /** P15: a probe answer's response and tone, the milestone, claim, exit or offer an event is about, her answer to an offer and its correction, and a compromat summary (each an id or a word from what the model was offered). */
  response?: ResponseType;
  tone?: Tone;
  axis?: string;
  milestoneId?: string;
  claimId?: string;
  exitId?: string;
  offerId?: string;
  answer?: OfferAnswer;
  correction?: string;
  summary?: string;
  /** P14b: how the person it happened to took it, read by the model (character development); only a complete, valid reading is kept. */
  reading?: Reading;
  evidence: string;
  /** 0–1; the LLM sanitizer drops low-confidence events, the engine keeps the number for the debug log. */
  confidence: number;
}

export interface FactIntent {
  about: string[] | 'world' | 'commander';
  text: string;
  importance: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface ProposalIntent {
  from: 'commander' | string;
  to: 'commander' | string;
  kind: ProposalKind;
  evidence: string;
}

export interface PromiseIntent {
  by: 'commander' | string;
  to: 'commander' | string;
  text: string;
  kind: 'made' | 'kept' | 'broken';
}

export interface StressHint {
  unitId: string;
  direction: -1 | 1;
  severity: Severity;
}

/** What the engine accepts from the mechanic model. Emotions are UI-only and never reach the engine. */
export interface Intents {
  events: EventIntent[];
  facts: FactIntent[];
  proposals: ProposalIntent[];
  promises: PromiseIntent[];
  stressHints: StressHint[];
}

export const emptyIntents = (): Intents => ({ events: [], facts: [], proposals: [], promises: [], stressHints: [] });

const EVIDENCE_WORDS = 20;
const EVIDENCE_CHARS = 400;
const MAX_TAGS = 8;
/** Per call: promises and proposals are capped like events, stress hints are one per unit. */
const MAX_PROMISES = 3;
const MAX_PROPOSALS = 3;
const DECISION_TYPES: readonly string[] = ['decision_aligned', 'decision_violated'];
/** P9d: events about a relationship rule. */
const RULE_EVENTS: readonly string[] = ['rule_kept', 'rule_broken', 'compromise_reached'];
/** P9: the commander is the actor and one unit the target. `defied` is the opposite: a unit is the actor and nobody is the target. */
const COMMANDER_DISCIPLINE: readonly string[] = ['commander_enforced', 'commander_yielded', 'threatened'];
/** Measure words that are not a registry id: the Leash is only ever filed through its form, and a threat may name no measure. */
const NO_MEASURE_ENFORCEMENT: readonly string[] = ['leash', 'unspecified'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const oneOf = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === 'string' && (list as readonly string[]).includes(v) ? (v as T) : null);

function evidenceOf(v: unknown): string {
  if (typeof v !== 'string') return '';
  return v.trim().split(/\s+/).filter(Boolean).slice(0, EVIDENCE_WORDS).join(' ').slice(0, EVIDENCE_CHARS);
}

const WANTED = ['yes', 'no', 'unclear'] as const;
const INITIATORS = ['target', 'actor', 'mutual'] as const;
const HARMS = ['none', 'minor', 'serious'] as const;
const OUTCOMES = ['good', 'mixed', 'bad'] as const;

/** P14b: a reading is kept only when all four words are valid; a partial one is dropped whole. */
function readingOf(v: unknown): Reading | null {
  if (!isObj(v)) return null;
  const wanted = oneOf(WANTED, v.wanted);
  const initiator = oneOf(INITIATORS, v.initiator);
  const harm = oneOf(HARMS, v.harm);
  const outcome = oneOf(OUTCOMES, v.outcome);
  return wanted && initiator && harm && outcome ? { wanted, initiator, harm, outcome } : null;
}

function tagsOf(v: unknown): string[] {
  const out: string[] = [];
  for (const t of arr(v)) {
    const n = normalizeTag(t);
    if (n !== null && !out.includes(n)) out.push(n);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}

const clamp01 = (n: unknown): number => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

/** P14c: the types a unit does (she tells, she says what she thinks): she is the actor and nobody the target. The commander's acts have her as the target. */
const UNIT_SIDE: readonly string[] = ['news_told', 'opinion_voiced'];
const COMMANDER_SIDE: readonly string[] = ['hobby_praised', 'opinion_challenged', 'opinion_agreed'];

/**
 * P14c: checks a reported event of her life against what the model was offered and writes its payload (`newsId`, `hobbyId`, `topicId`,
 * `positionId`, `kind`, `factId`) onto `intent`. The woman is the actor, or the target of the commander. Returns a key that is the same for the
 * same report (so a repeat in one answer can be dropped), or null when the report is not valid: nothing offered, an id that was not
 * offered for her, a kind outside `FIRST_KINDS`. A `positionId` that is not a position of the topic is removed and the event kept.
 */
function lifeFields(type: string, e: Record<string, unknown>, intent: EventIntent, life: LifeOffer | undefined): { key: string } | null {
  if (!life) return null;
  const candidates = intent.actor === 'commander' ? intent.targets : [intent.actor];
  const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
  let who: string | undefined;
  let key: string | null = null;
  const pick = <T extends { id: string; unitId: string }>(list: readonly T[], id: string | null): T | undefined => {
    const row = id === null ? undefined : list.find((x) => x.id === id && candidates.includes(x.unitId));
    who = row?.unitId;
    return row;
  };
  switch (type) {
    case 'news_told': {
      const row = pick(life.news, str(e.newsId));
      if (!row) return null;
      intent.newsId = row.id;
      key = row.id;
      break;
    }
    case 'hobby_praised': {
      const row = pick(life.hobbies, str(e.hobbyId));
      if (!row) return null;
      intent.hobbyId = row.id;
      key = row.id;
      break;
    }
    case 'opinion_voiced':
    case 'opinion_challenged':
    case 'opinion_agreed': {
      const row = pick(life.topics.filter((t) => (type === 'opinion_voiced' ? t.pick === true : t.voiced === true)), str(e.topicId));
      if (!row) return null;
      intent.topicId = row.id;
      const position = str(e.positionId);
      if (type === 'opinion_challenged' && position !== null && row.positions.includes(position)) intent.positionId = position;
      key = row.id;
      break;
    }
    case 'first_moment': {
      const open: readonly unknown[] = life.firstKinds ?? FIRST_KINDS; // only a kind the pair has not had
      const kind = (FIRST_KINDS as readonly unknown[]).includes(e.kind) && open.includes(e.kind) ? (e.kind as string) : null;
      who = candidates[0]; // the woman of a private scene
      if (!life.firsts || kind === null || who === undefined) return null;
      intent.kind = kind;
      key = kind;
      break;
    }
    case 'joke_returned': {
      const row = pick(life.jokes, str(e.factId));
      if (!row) return null;
      intent.factId = row.id;
      key = row.id;
      break;
    }
    default:
      return null;
  }
  if (who === undefined) return null;
  if (UNIT_SIDE.includes(type)) {
    intent.actor = who;
    intent.targets = [];
  } else if (COMMANDER_SIDE.includes(type) || intent.actor === 'commander') {
    intent.actor = 'commander';
    intent.targets = [who];
  } else {
    intent.actor = who;
    intent.targets = [];
  }
  return { key: `${type}|${who}|${key}` };
}

const oneLineText = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');

/**
 * P15: validates one event of the dynamic against what the model was offered (`DynamicOffer`), filling its fields. The unit is the one the event is
 * about, whichever side the model wrote her on; the commander is the actor. A response outside `RESPONSE_TYPES` drops a probe event, a tone outside
 * `TONES` only the tone. Returns a dedupe key, or `null` to drop the event.
 */
function dynamicFields(type: EventType, e: Record<string, unknown>, intent: EventIntent, offer: DynamicOffer | undefined): { key: string } | null {
  if (offer === undefined || !offer.types.includes(type)) return null;
  const who = intent.actor !== 'commander' ? intent.actor : intent.targets[0];
  if (who === undefined) return null;
  intent.actor = 'commander';
  intent.targets = [who];
  const D = TUNING.dynamic.intents;
  const response = (RESPONSE_TYPES as readonly unknown[]).includes(e.response) ? (e.response as ResponseType) : undefined;
  const tone = (TONES as readonly unknown[]).includes(e.tone) ? (e.tone as Tone) : undefined;
  switch (type) {
    case 'probe_answered':
    case 'probe_observed': {
      if (response === undefined || !(type === 'probe_answered' ? offer.probes : offer.observed ?? []).includes(who)) return null;
      intent.response = response;
      if (tone !== undefined) intent.tone = tone;
      if (typeof e.axis === 'string' && /^[a-z_]{1,32}$/.test(e.axis)) intent.axis = e.axis;
      return { key: `${type}|${who}` };
    }
    case 'milestone_accepted':
    case 'milestone_refused': {
      if (typeof e.milestoneId !== 'string' || !offer.milestones.includes(e.milestoneId)) return null;
      intent.milestoneId = e.milestoneId;
      return { key: `${type}|${who}|${e.milestoneId}` };
    }
    case 'compromat_mentioned': {
      const summary = oneLineText(e.summary, D.summaryMax);
      if (summary === '' || !offer.compromat.includes(who)) return null;
      intent.summary = summary;
      if (typeof e.factId === 'string' && /^[A-Za-z0-9_:-]{1,24}$/.test(e.factId)) intent.factId = e.factId;
      return { key: `${type}|${who}` };
    }
    case 'protocol_slip':
      return (offer.slips ?? []).includes(who) ? { key: `${type}|${who}` } : null;
    case 'offer_answered': {
      const answer = (OFFER_ANSWERS as readonly unknown[]).includes(e.answer) ? (e.answer as OfferAnswer) : undefined;
      if (typeof e.offerId !== 'string' || !offer.offers.includes(e.offerId) || answer === undefined) return null;
      intent.offerId = e.offerId;
      intent.answer = answer;
      const correction = oneLineText(e.correction, D.correctionMax);
      if (answer === 'corrected' && correction !== '') intent.correction = correction;
      return { key: `${type}|${who}|${e.offerId}` };
    }
    default:
      return null;
  }
}

/**
 * Re-validates whatever the mechanic model returned. Never throws; drops what it cannot trust: unknown enums,
 * ids that are not scene participants (or not in the squad), unit→unit events, events without evidence,
 * `valueAxes` on non-decision events. Text is length-capped and kept as text, nothing else is read.
 */
export function validateIntents(
  raw: unknown,
  ctx: {
    participants: string[]; squad: Array<{ id: string }>;
    /** Events kept; default `maxEventsPerExchange`. The P8 callers read more and let `applyIntents` cut after the judgement. */
    maxEvents?: number;
    /** P9: the words `measure` may take (`measureList`). Without a list only the fallbacks exist: `verbal` on an enforcement, `unspecified` on a threat. */
    measures?: string[];
    /** P9d: the rules the model may report on (active and negotiating ones). Without it a rule event is dropped. */
    rules?: Array<{ id: string; unitId: string }>;
    /** P12: the ids of the intercepted items the model was shown. Without them a `knowledge_leak` is dropped. */
    intercepted?: string[];
    /** P12: the present units the commander has an open warning about. Without any an `accused` is dropped. */
    warned?: string[];
    /** P13: the ids of the warden's open overrides the model was shown. Without them a `compromise_reached` that names one is dropped. */
    overrides?: string[];
    /** P13: the ids of the warden's expectations the model was shown. Without them an expectation event is dropped. */
    expectations?: string[];
    /** P13: the units a `conspired` may name (present, not the warden, not yet an ally). Without them the event is dropped. */
    conspire?: string[];
    /** P14c: what the model was offered about her life (`lifeIntentInput`). Without it, or for a list that is empty, a report of that type is dropped. */
    life?: LifeOffer;
    /** P15: what the model was offered about the dynamic (`dynamicIntentInput`). Without it, or for a type or an id it does not list, a report of the dynamic is dropped. */
    dynamic?: DynamicOffer;
    /** P11b: the longest text a fact or a promise keeps (the campaign's memory setting); default `TUNING.memory.factTextMax`. */
    factTextMax?: number;
  },
): Intents {
  const out = emptyIntents();
  if (!isObj(raw)) return out;
  const known = new Set(ctx.squad.map((u) => u.id));
  const present = new Set(ctx.participants.filter((id) => known.has(id)));
  const isUnit = (v: unknown): v is string => typeof v === 'string' && present.has(v);
  const seenLife = new Set<string>(); // the same item of her life reported twice in one answer counts once

  for (const e of arr(raw.events)) {
    if (!isObj(e)) continue;
    const type = oneOf(EVENT_TYPES, e.type);
    const severity = oneOf(SEVERITIES, e.severity);
    const evidence = evidenceOf(e.evidence);
    if (!type || !severity || evidence === '') continue;
    const actor = e.actor === 'commander' ? 'commander' : isUnit(e.actor) ? e.actor : null;
    if (actor === null) continue;
    const targets = [...new Set(arr(e.targets).filter(isUnit))].filter((t) => t !== actor);
    if (actor === 'commander' ? targets.length === 0 : arr(e.targets).some((t) => isUnit(t) && t !== actor)) continue;
    if (type === 'defied' ? actor === 'commander' : COMMANDER_DISCIPLINE.includes(type) && actor !== 'commander') continue;
    const intent: EventIntent = { type, actor, targets, severity, evidence, confidence: clamp01(e.confidence) };
    const reading = readingOf(e.reading);
    if (reading) intent.reading = reading;
    if (type === 'compromise_reached' && typeof e.overrideId === 'string') {
      // a compromise with the warden settles one of her open overrides, never a rule; an unknown id drops it
      if (actor !== 'commander' || !(ctx.overrides ?? []).includes(e.overrideId)) continue;
      const text = typeof e.text === 'string' ? e.text.replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.rules.textMax).trim() : '';
      if (text === '') continue;
      intent.overrideId = e.overrideId;
      intent.text = text;
    } else if (type === 'compromise_reached' && ctx.dynamic !== undefined
      && ((typeof e.claimId === 'string' && ctx.dynamic.claims.includes(e.claimId)) || (typeof e.exitId === 'string' && ctx.dynamic.exits.includes(e.exitId)))) {
      // P15: a compromise settles one of her open claims or an exit she was offered; only an id it was shown, and only the commander reaches it
      const claim = typeof e.claimId === 'string' && ctx.dynamic.claims.includes(e.claimId) ? e.claimId : undefined;
      const exit = typeof e.exitId === 'string' && ctx.dynamic.exits.includes(e.exitId) ? e.exitId : undefined;
      if (actor !== 'commander') continue;
      if (claim !== undefined) intent.claimId = claim;
      if (exit !== undefined) intent.exitId = exit;
      if (typeof e.text === 'string') intent.text = e.text.replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.rules.textMax).trim();
    } else if (RULE_EVENTS.includes(type)) {
      // a rule event names a rule of one of the units it lands on; an unknown or missing id drops it
      const rule = typeof e.ruleId === 'string' ? (ctx.rules ?? []).find((r) => r.id === e.ruleId && targets.includes(r.unitId)) : undefined;
      if (actor !== 'commander' || !rule) continue;
      intent.ruleId = rule.id;
      if (type === 'compromise_reached') intent.text = typeof e.text === 'string' ? e.text.replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.rules.textMax).trim() : '';
    }
    if (type === 'expectation_kept' || type === 'expectation_broken') {
      // the commander kept or broke something of hers: it names an expectation it was shown, and the warden is the target
      if (actor !== 'commander' || typeof e.expectationId !== 'string' || !(ctx.expectations ?? []).includes(e.expectationId)) continue;
      intent.expectationId = e.expectationId;
    }
    if (type === 'conspired') {
      // the commander enlists a unit against the warden: only a unit it was offered (she is never one), and only the commander does it
      const aimed = intent.targets.filter((t) => (ctx.conspire ?? []).includes(t));
      if (actor !== 'commander' || aimed.length === 0) continue;
      intent.targets = aimed;
    }
    if (type === 'accused') {
      // the commander accuses a unit she was warned about; an accusation of anyone else is not offered and is dropped
      const aimed = intent.targets.filter((t) => (ctx.warned ?? []).includes(t));
      if (actor !== 'commander' || aimed.length === 0) continue;
      intent.targets = aimed;
    }
    if (type === 'knowledge_leak') {
      // a leak names an item it was given; the commander is always the actor
      if (actor !== 'commander' || typeof e.itemId !== 'string' || !(ctx.intercepted ?? []).includes(e.itemId)) continue;
      intent.itemId = e.itemId;
    }
    if (LIFE_EVENT_TYPES.includes(type)) {
      // her life: the report names an id it was shown, for a woman who is here; the sides are the type's own, whichever way the model wrote them
      const life = lifeFields(type, e, intent, ctx.life);
      if (life === null || seenLife.has(life.key)) continue;
      seenLife.add(life.key);
    }
    if (DYNAMIC_INTENT_TYPES.includes(type)) {
      // the dynamic: the type and the ids it names must be among what was offered, for a woman who is here; the sides are the type's own
      const dyn = dynamicFields(type, e, intent, ctx.dynamic);
      if (dyn === null || seenLife.has(dyn.key)) continue;
      seenLife.add(dyn.key);
    }
    if (type === 'commander_enforced' || type === 'threatened') {
      const word = typeof e.measure === 'string' ? e.measure : '';
      const listed = (ctx.measures ?? []).includes(word);
      intent.measure = type === 'commander_enforced'
        ? (listed && !NO_MEASURE_ENFORCEMENT.includes(word) ? word : 'verbal')
        : (listed ? word : 'unspecified');
    }
    if (DECISION_TYPES.includes(type)) {
      const axes: NonNullable<EventIntent['valueAxes']> = [];
      for (const a of arr(e.valueAxes)) {
        if (!isObj(a)) continue;
        const axis = oneOf(VALUE_AXES, a.axis);
        if (axis && (a.direction === 1 || a.direction === -1)) axes.push({ axis, direction: a.direction });
      }
      if (axes.length > 0) intent.valueAxes = axes;
    }
    const tags = tagsOf(e.tags);
    if (tags.length > 0) intent.tags = tags;
    out.events.push(intent);
    if (out.events.length >= (ctx.maxEvents ?? TUNING.relations.maxEventsPerExchange)) break;
  }

  for (const f of arr(raw.facts)) {
    if (!isObj(f) || typeof f.text !== 'string') continue;
    const text = f.text.trim().slice(0, ctx.factTextMax ?? TUNING.memory.factTextMax).trim();
    if (text === '') continue;
    let about: FactIntent['about'];
    if (f.about === 'world' || f.about === 'commander') about = f.about;
    else {
      about = [...new Set(arr(f.about).filter(isUnit))];
      if (about.length === 0) continue;
    }
    const imp = typeof f.importance === 'number' && Number.isFinite(f.importance) ? Math.round(f.importance) : 3;
    out.facts.push({ about, text, importance: Math.min(5, Math.max(1, imp)) as FactIntent['importance'], tags: tagsOf(f.tags) });
  }

  for (const p of arr(raw.proposals)) {
    if (!isObj(p)) continue;
    const kind = oneOf(PROPOSAL_KINDS, p.kind);
    if (!kind) continue;
    const pair = (p.from === 'commander' && isUnit(p.to)) || (isUnit(p.from) && p.to === 'commander');
    if (!pair) continue;
    if (out.proposals.length < MAX_PROPOSALS) out.proposals.push({ from: p.from as string, to: p.to as string, kind, evidence: evidenceOf(p.evidence) });
  }

  for (const p of arr(raw.promises)) {
    if (!isObj(p)) continue;
    const kind = oneOf(['made', 'kept', 'broken'] as const, p.kind);
    const pair = (p.by === 'commander' && isUnit(p.to)) || (isUnit(p.by) && p.to === 'commander');
    if (!kind || !pair) continue;
    const text = typeof p.text === 'string' ? p.text.trim().slice(0, ctx.factTextMax ?? TUNING.memory.factTextMax).trim() : '';
    if (kind === 'made' && text === '') continue;
    if (out.promises.length < MAX_PROMISES) out.promises.push({ by: p.by as string, to: p.to as string, text, kind });
  }

  for (const h of arr(raw.stressHints)) {
    if (!isObj(h) || !isUnit(h.unitId)) continue;
    const severity = oneOf(SEVERITIES, h.severity);
    if (!severity || (h.direction !== 1 && h.direction !== -1)) continue;
    if (!out.stressHints.some((x) => x.unitId === h.unitId)) out.stressHints.push({ unitId: h.unitId, direction: h.direction, severity });
  }
  return out;
}
