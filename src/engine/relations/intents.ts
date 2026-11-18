import { normalizeTag } from '../setup';
import { VALUE_AXES, type Severity, type ValueAxis } from '../state/types';
import { TUNING } from '../tuning';
import { EVENT_TYPES, PROPOSAL_KINDS, SEVERITIES, type EventType, type ProposalKind } from './vocab';

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
  /** P9d: the rule a `rule_kept` / `rule_broken` / `compromise_reached` is about, and the agreed text of a compromise. */
  ruleId?: string;
  text?: string;
  /** P12: the intercepted item a `knowledge_leak` is about (an id from the list the model was given). */
  itemId?: string;
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
  },
): Intents {
  const out = emptyIntents();
  if (!isObj(raw)) return out;
  const known = new Set(ctx.squad.map((u) => u.id));
  const present = new Set(ctx.participants.filter((id) => known.has(id)));
  const isUnit = (v: unknown): v is string => typeof v === 'string' && present.has(v);

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
    if (RULE_EVENTS.includes(type)) {
      // a rule event names a rule of one of the units it lands on; an unknown or missing id drops it
      const rule = typeof e.ruleId === 'string' ? (ctx.rules ?? []).find((r) => r.id === e.ruleId && targets.includes(r.unitId)) : undefined;
      if (actor !== 'commander' || !rule) continue;
      intent.ruleId = rule.id;
      if (type === 'compromise_reached') intent.text = typeof e.text === 'string' ? e.text.replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.rules.textMax).trim() : '';
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
    const text = f.text.trim().slice(0, TUNING.memory.factTextMax).trim();
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
    const text = typeof p.text === 'string' ? p.text.trim().slice(0, TUNING.memory.factTextMax).trim() : '';
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
