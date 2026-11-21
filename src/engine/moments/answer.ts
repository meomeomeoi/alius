/**
 * P15a: her answer to a moment (plan R10): what she expected, the gap to what the commander chose, the escalation channel and the
 * lapse. No relation axis moves here (user ruling: P16's favour and P15's position axes read `moment_answered`); the answer changes her
 * directive and the escalation roll only. A chip and a typed answer (the reading's) take the same path.
 */
import type { Registries } from '../../content/types';
import { personEffects, COMMANDER, pushLog } from '../blocking';
import { ESCALATION_ORDER, type EscalationVerb, type ResponseType } from '../blocking/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { momentsOf, type AnswerRecord, type Gap, type OpenMoment, type OptionKey } from './state';

export interface Expectation { key: string; strength: 1 | 2 | 3 }
type Expectations = (state: CampaignState, reg: Registries, moment: OpenMoment) => Expectation | null;

const expectations: Expectations[] = [];

/** P15 plugs in here: what she expects of an option, from her profile and her style. The first reader that answers wins. */
export function registerExpectation(fn: Expectations): void {
  expectations.push(fn);
}
/** Tests: forget every registered reader. */
export function resetExpectations(): void {
  expectations.length = 0;
}

const FRAME_KEYS: readonly OptionKey[] = ['0', '1', '2'];
const atOf = (scene: SceneRecord): number => scene.readIndex ?? scene.startIndex;

/**
 * The option she expects. A registered reader wins (P15); the neutral default is the frame's first option that takes the lead back
 * (`returned`), else the first that yields, with strength 1.
 */
export function expectedOption(state: CampaignState, reg: Registries, moment: OpenMoment): Expectation {
  for (const read of expectations) {
    const e = read(state, reg, moment);
    if (e !== null && moment.options.some((o) => o.key === e.key)) return e;
  }
  const frame = moment.options.filter((o) => FRAME_KEYS.includes(o.key));
  const pick = frame.find((o) => o.type === 'returned') ?? frame.find((o) => o.type === 'yielded') ?? frame[0];
  return { key: pick?.key ?? '0', strength: 1 };
}

/** The gap between the type she expected and the one chosen: the same is matched, the opposite pairs are opposite, the rest partial (AUTHOR TO TUNE). */
export function gapOf(expected: ResponseType, chosen: ResponseType): Gap {
  if (expected === chosen) return 'matched';
  const pair = new Set([expected, chosen]);
  return (pair.has('yielded') && pair.has('resisted')) || (pair.has('returned') && pair.has('deflected')) ? 'opposite' : 'partial';
}

/** The first of the escalation verbs, in the engine's order, that the commander's present values carry; `look` when none does. */
export function escalationVerb(state: CampaignState, reg: Registries): EscalationVerb {
  const carried = new Set(personEffects(state, reg, COMMANDER).flatMap((e) => (e.type === 'escalation' ? [e.verb] : [])));
  return ESCALATION_ORDER.find((v) => carried.has(v)) ?? 'look';
}

/**
 * Answers the open moment. A stale id or an unknown key is refused (nothing changes). The state before goes onto the staging log (a swipe
 * takes the answer back). On an `opposite` gap one chance is drawn (`escalation` × her expectation's strength); that is the only draw.
 */
export function answerMoment(
  draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>, momentId: string, key: string, via: 'chip' | 'text', tone?: string, opts: { at?: number } = {},
): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  const open = momentsOf(scene).open;
  if (!scene || !open || open.id !== momentId) throw new Error('Stale moment answer.');
  const option = open.options.find((o) => o.key === key);
  if (!option) throw new Error(`Moment ${momentId} has no option "${key}".`);
  const expected = expectedOption(draft, reg, open);
  const expectedType = open.options.find((o) => o.key === expected.key)?.type ?? option.type;
  const gap = gapOf(expectedType, option.type);
  pushLog(draft, opts.at ?? atOf(scene), { person: open.unitId, field: 'answer', value: open.sourceId, source: via === 'chip' ? 'chip' : 'reading' });
  const events: EngineEvent[] = [];
  let verb: EscalationVerb | undefined;
  if (gap === 'opposite' && ctx.rng.chance(TUNING.moments.escalation * expected.strength)) verb = escalationVerb(draft, reg);
  const record: AnswerRecord = {
    momentId, sourceId: open.sourceId, unitId: open.unitId, key: option.key, type: option.type, gap, via, exchange: scene.exchanges,
    ...(tone !== undefined ? { tone } : {}), ...(verb !== undefined ? { escalated: true, verb } : {}),
  };
  scene.moments!.lastAnswer = record;
  delete scene.moments!.open;
  events.push({
    type: 'moment_answered', momentId, sourceId: open.sourceId, unitId: open.unitId, key: option.key, responseType: option.type, gap, via,
    ...(tone !== undefined ? { tone } : {}), ...(verb !== undefined ? { escalated: true, verb } : {}),
    ...(open.visitorId !== undefined ? { visitorId: open.visitorId } : {}), present: [...scene.participants],
  });
  if (verb !== undefined) events.push({ type: 'moment_escalated', momentId, sourceId: open.sourceId, unitId: open.unitId, verb });
  return events;
}

/**
 * An unanswered moment waits `TUNING.moments.lapseExchanges` readings and then lapses (`moment_lapsed`, no directive). Call it once per
 * reading, before the pass that may open the next one.
 */
export function lapseMoments(draft: CampaignState): EngineEvent[] {
  const scene = draft.scene;
  const open = momentsOf(scene).open;
  if (!scene || !open) return [];
  const passes = (open.passes ?? 0) + 1;
  if (passes < TUNING.moments.lapseExchanges) {
    scene.moments!.open!.passes = passes;
    return [];
  }
  pushLog(draft, atOf(scene), { person: open.unitId, field: 'lapse', value: open.sourceId, source: 'engine' });
  delete scene.moments!.open;
  return [{ type: 'moment_lapsed', momentId: open.id, sourceId: open.sourceId, unitId: open.unitId }];
}

const QUOTES = /[\u0022\u201c\u201d]/g;
const EDGE_QUOTES = /^['\u2018\u2019`]+|['\u2018\u2019`]+$/g;
/** A pronoun for the commander is never shown (lore §0): a set of labels that has one is dropped whole. */
const COMMANDER_PRONOUN = /\b(he|him|his|himself)\b/i;

/**
 * The model's words for the three options, cleaned: exactly three, markup and control characters out, one line, quotes stripped, each cut at
 * `TUNING.moments.labelMax` characters. Nothing (`null`) when a label is empty or names the commander with a pronoun. Display only: the
 * engine never reads a label.
 */
export function cleanLabels(raw: unknown): [string, string, string] | null {
  if (!Array.isArray(raw) || raw.length !== 3 || !raw.every((l) => typeof l === 'string')) return null;
  const cleaned = (raw as string[]).map((l) =>
    l.replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001f\u007f<>`]/g, ' ').replace(QUOTES, '').replace(/\s+/g, ' ').trim().replace(EDGE_QUOTES, '').trim().slice(0, TUNING.moments.labelMax).trim());
  return cleaned.every((l) => l !== '' && !COMMANDER_PRONOUN.test(l)) ? (cleaned as [string, string, string]) : null;
}

/** Writes the model's words for the open moment's three options (display only). Nothing while no moment is open or the words are not usable. */
export function setLabels(draft: CampaignState, raw: unknown): void {
  const open = momentsOf(draft.scene).open;
  const labels = cleanLabels(raw);
  if (open && labels) draft.scene!.moments!.open!.labels = labels;
}

/** The answer a reading reported, if it still names the open moment's option with enough confidence. Returns the events of the answer. */
export function applyReadingAnswer(draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>, answer: unknown): EngineEvent[] {
  const open = momentsOf(draft.scene).open;
  if (!open || typeof answer !== 'object' || answer === null || Array.isArray(answer)) return [];
  const a = answer as { key?: unknown; confidence?: unknown; tone?: unknown };
  if (typeof a.key !== 'string' || typeof a.confidence !== 'number' || a.confidence < TUNING.moments.answerConfidence) return [];
  if (!open.options.some((o) => o.key === a.key)) return [];
  return answerMoment(draft, ctx, open.id, a.key, 'text', typeof a.tone === 'string' ? a.tone : undefined);
}

