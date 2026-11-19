import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import type { CampaignState } from '../state/types';
import { VALUE_AXES } from '../state/types';
import { EXPECTATION_KINDS, leashswapOf, wardenOf, type Expectation, type ExpectationKind, type WardenState } from './state';

/**
 * The warden's agenda (P13 §2): 3–5 expectations whose weights sum to 1. The engine writes a fallback agenda at seeding from her
 * values alone (no model, no draw); the model may replace it once with its own. The model proposes kinds from a closed list and a
 * weight as an enum; the engine validates every kind and sets every number.
 */

const WEIGHT_POINTS = { low: 1, medium: 2, high: 3 } as const;
type WeightWord = keyof typeof WEIGHT_POINTS;
const isWeightWord = (w: unknown): w is WeightWord => w === 'low' || w === 'medium' || w === 'high';
const SOURCES: ReadonlyArray<Expectation['source']> = ['card', 'values', 'corporate'];

export const AGENDA_MIN = 3;
export const AGENDA_MAX = 5;
export const PERSONAL_MAX = 2;
export const PERSONAL_TEXT_MAX = 80;
const round2 = (n: number): number => Math.round(n * 100) / 100;
/** The commander gets no pronoun in any text a player or the main model reads (lore §0). */
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;

interface Draft { kind: ExpectationKind; points: number; source: Expectation['source']; text?: string }

/** Weights `1/2/3` normalized to sum 1, rounded to 0.01 with the last item absorbing the rest; the first heaviest is the one she shows. */
function finish(drafts: Draft[]): Expectation[] {
  const total = drafts.reduce((n, d) => n + d.points, 0);
  let left = 1;
  const heaviest = drafts.reduce((best, d, i) => (d.points > drafts[best].points ? i : best), 0);
  return drafts.map((d, i): Expectation => {
    const weight = i === drafts.length - 1 ? round2(left) : round2(d.points / total);
    left -= weight;
    return { id: `x${i + 1}`, kind: d.kind, weight, source: d.source, known: i === heaviest, ...(d.text !== undefined ? { text: d.text } : {}) };
  });
}

/**
 * Her agenda from her values alone. Each registry entry scores `Σ values[axis] × her value` (+ her corporate value for a
 * `corporate` entry); the top 3 (registry order breaks ties) are taken, plus `obey_oversight` when her corporate value is 1 or more.
 * Draws nothing. An empty registry or an unknown unit gives an empty agenda.
 */
export function fallbackAgenda(state: CampaignState, reg: Registries, unitId: string): Expectation[] {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit) return [];
  const scored = [...reg.wardenExpectations.values()].map((e, order) => {
    const pull = (e.values ?? {}) as Partial<Record<(typeof VALUE_AXES)[number], number>>;
    const score = VALUE_AXES.reduce((n, a) => n + (pull[a] ?? 0) * unit.values[a], 0) + (e.corporate === true ? unit.values.corporate : 0);
    return { entry: e, order, score };
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  const picked = scored.slice(0, AGENDA_MIN);
  const obey = scored.find((x) => x.entry.kind === 'obey_oversight');
  if (obey && unit.values.corporate >= 1 && !picked.includes(obey)) picked.push(obey);
  return finish(picked.map((x): Draft => ({
    kind: x.entry.kind as ExpectationKind, points: WEIGHT_POINTS[x.entry.weight as WeightWord],
    source: x.entry.corporate === true && unit.values.corporate >= 1 ? 'corporate' : 'values',
  })));
}

/**
 * The model's answer as an agenda, or `null` (refused). Unknown kinds, a second item of one kind, items whose weight is not
 * `low`/`medium`/`high` and personal items with no text, text over 80 characters or a pronoun for the commander are dropped; at most
 * two personal items stay; fewer than 3 items left refuses the answer, more than 5 are cut to the first 5. Never reads a number.
 */
export function normalizeAgenda(raw: unknown, reg: Registries): Expectation[] | null {
  if (!Array.isArray(raw)) return null;
  const known = new Set([...reg.wardenExpectations.values()].map((e) => String(e.kind)));
  const seen = new Set<string>();
  const out: Draft[] = [];
  let personal = 0;
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue;
    const { kind, weight, source, text } = item as { kind?: unknown; weight?: unknown; source?: unknown; text?: unknown };
    if (typeof kind !== 'string' || !(EXPECTATION_KINDS as readonly string[]).includes(kind) || !isWeightWord(weight)) continue;
    const src = SOURCES.find((x) => x === source) ?? 'card';
    if (kind === 'personal') {
      const t = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
      if (t === '' || t.length > PERSONAL_TEXT_MAX || COMMANDER_PRONOUN.test(t) || personal >= PERSONAL_MAX) continue;
      personal++;
      out.push({ kind, points: WEIGHT_POINTS[weight], source: src, text: t });
      continue;
    }
    if (!known.has(kind) || seen.has(kind)) continue;
    seen.add(kind);
    out.push({ kind: kind as ExpectationKind, points: WEIGHT_POINTS[weight], source: src });
  }
  if (out.length < AGENDA_MIN) return null;
  return finish(out.slice(0, AGENDA_MAX));
}

/** Is a list of expectations well formed (what `warden/agenda` checks before it stores one)? The first problem, or `null`. */
export function agendaProblem(list: unknown, reg: Registries): string | null {
  if (!Array.isArray(list) || list.length < AGENDA_MIN || list.length > AGENDA_MAX) return `An agenda has ${AGENDA_MIN} to ${AGENDA_MAX} expectations.`;
  const known = new Set([...reg.wardenExpectations.values()].map((e) => String(e.kind)));
  const kinds = new Set<string>();
  const ids = new Set<string>();
  let personal = 0;
  let total = 0;
  for (const x of list as Array<Partial<Expectation>>) {
    if (typeof x !== 'object' || x === null || typeof x.id !== 'string' || ids.has(x.id)) return 'An expectation needs its own id.';
    ids.add(x.id);
    if (typeof x.kind !== 'string' || !(EXPECTATION_KINDS as readonly string[]).includes(x.kind)) return 'An expectation has an unknown kind.';
    if (typeof x.weight !== 'number' || !(x.weight > 0 && x.weight <= 1)) return 'An expectation weight is between 0 and 1.';
    total += x.weight;
    if (x.kind === 'personal') {
      personal++;
      if (typeof x.text !== 'string' || x.text.trim() === '' || x.text.length > PERSONAL_TEXT_MAX || COMMANDER_PRONOUN.test(x.text)) return 'A personal expectation needs plain text of at most 80 characters.';
    } else {
      if (!known.has(x.kind) || kinds.has(x.kind)) return 'An expectation kind is used once.';
      kinds.add(x.kind);
    }
  }
  if (personal > PERSONAL_MAX) return `At most ${PERSONAL_MAX} personal expectations.`;
  if (Math.abs(total - 1) > 0.02) return 'The weights of an agenda sum to 1.';
  return null;
}

/**
 * Stores the model's agenda in place of the fallback. The engine decides which one is known (the heaviest) whatever the payload
 * says. Only while the agenda is the fallback and no override has fired.
 */
export function setAgenda(draft: CampaignState, reg: Registries, list: unknown): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w || !leashswapOf(draft)) throw new Error('warden/agenda: nobody holds the leash.');
  if (w.agenda !== 'fallback' || w.overrideFired === true) throw new Error('The agenda is already in play.');
  const problem = agendaProblem(list, reg);
  if (problem) throw new Error(`warden/agenda: ${problem}`);
  const items = list as Expectation[];
  const heaviest = items.reduce((best, x, i) => (x.weight > items[best].weight ? i : best), 0);
  w.expectations = items.map((x, i): Expectation => ({ id: x.id, kind: x.kind, weight: x.weight, source: SOURCES.includes(x.source) ? x.source : 'card', known: i === heaviest, ...(x.kind === 'personal' ? { text: x.text!.trim() } : {}) }));
  w.agenda = 'model';
  return [{ type: 'warden_agenda_set', count: w.expectations.length }];
}

const EXPECTATION_STEP = { minor: 0, moderate: 1, major: 2, extreme: 2 } as const;
const clamp100 = (n: number): number => Math.min(100, Math.max(0, n));

/**
 * The commander kept or broke an expectation (the model reported it in a scene): kept → satisfaction +3 / +5 / +8 (minor / moderate /
 * major and up); broken → satisfaction −5 / −10 / −15 and defiance +5 / +10 / +15. Either teaches the commander that expectation.
 * An id that is not one of hers changes nothing. Draws nothing; the relation event itself is applied by `applyEventToUnit`.
 */
export function expectationEvent(draft: CampaignState, expectationId: string, kept: boolean, severity: 'minor' | 'moderate' | 'major' | 'extreme'): EngineEvent[] {
  const w = wardenOf(draft);
  if (!w || !w.expectations.some((x) => x.id === expectationId)) return [];
  const step = EXPECTATION_STEP[severity];
  if (kept) w.satisfaction = clamp100(w.satisfaction + [3, 5, 8][step]);
  else {
    w.satisfaction = clamp100(w.satisfaction - [5, 10, 15][step]);
    w.defiance = clamp100(w.defiance + [5, 10, 15][step]);
  }
  return learnExpectation(draft, expectationId);
}

/** An expectation becomes known to the commander (an override cites it, a report names it, a dig finds it). Says so once; the event carries the id only. */
export function learnExpectation(draft: CampaignState, expectationId: string): EngineEvent[] {
  const x = wardenOf(draft)?.expectations.find((e) => e.id === expectationId);
  if (!x || x.known) return [];
  x.known = true;
  return [{ type: 'expectation_learned', expectationId }];
}

export type { WardenState };
