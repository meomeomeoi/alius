import { affinityBand, attractionBand, trustBand } from '../../engine/relations/bands';
import { intimacyOf } from '../../engine/relations/gain';
import { stressBand } from '../../engine/combat/stress';
import type { CampaignState, Relation, Unit } from '../../engine/state/types';
import { humanize } from '../effects';
import type { Knowledge } from '../knowledge';
import { ledgerFor, ledgerLabel } from '../ledger';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider, type AnalyzeProvider } from '../providers';

/** Core readings (P7a §3): relationship axes and stress here; stats, resources, settings and decisions are added in Task 11. */

const MINUS = '−';
const cap = (s: string): string => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** ` (37)` with raw values on, nothing otherwise. */
const rawSuffix = (k: Knowledge, n: number): string => {
  const r = k.raw(n);
  return r === null ? '' : ` (${r})`;
};

/** `▲`/`▼`/`▬` for a net change, with the signed amount only when raw values are on. */
function arrow(k: Knowledge, net: number): string {
  if (net === 0) return '▬';
  const r = k.raw(Math.abs(net));
  return `${net > 0 ? '▲' : '▼'}${r === null ? '' : ` (${net > 0 ? '+' : MINUS}${r})`}`;
}

/** The unit named by `data.unitId`, with its relation, or `null`. */
function unitOf(state: CampaignState, data: Record<string, unknown>): { unit: Unit; relation: Relation } | null {
  const id = data.unitId;
  if (typeof id !== 'string') return null;
  const unit = state.squad.find((u) => u.id === id);
  const relation = state.relations[id];
  return unit && relation ? { unit, relation } : null;
}

type Axis = 'trust' | 'affinity' | 'attraction';
const BAND: Record<Axis, (n: number) => string> = { trust: trustBand, affinity: affinityBand, attraction: attractionBand };

const axisProvider = (axis: Axis): AnalyzeProvider => (subject, env: AnalyzeEnv, knowledge) => {
  const state = env.state!;
  const found = unitOf(state, subject.data);
  if (!found) return null;
  const { unit, relation } = found;
  if (axis !== 'trust' && unit.kind === 'grunt') return { lines: ['Grunts track Trust only.'] };
  if (axis === 'attraction' && !intimacyOf(state).romance) return { lines: ['Romance is off.'] };

  const value = relation[axis];
  const lines = [`${unit.displayName}: ${BAND[axis](value).toUpperCase()}${rawSuffix(knowledge, value)}`];

  const net = ledgerFor(state, `axis:${unit.id}:${axis}`, state.day - 2).reduce((sum, e) => sum + e.delta, 0);
  lines.push(`Trend ${arrow(knowledge, net)}`);

  const events = relation.history.filter((h) => h.kind === 'event').slice(-3).reverse();
  for (const h of events) {
    const cause = typeof env.registries.eventDeltas.get(h.type)?.cause === 'string'
      ? (env.registries.eventDeltas.get(h.type)!.cause as string)
      : cap(humanize(h.type));
    lines.push(`${cause}${h.severity ? ` — ${h.severity}` : ''}, day ${h.day}`);
  }
  lines.push(`State: [[relationshipStates:${relation.stateId}]]`);
  return { lines };
};

/** The band a unit enters next as its stress rises (thresholds of the combat bands). */
function nextStressBand(stress: number): string | null {
  return stress < 50 ? 'strained' : stress < 80 ? 'breaking' : stress < 100 ? 'breakdown' : null;
}

const stressProvider: AnalyzeProvider = (subject, env, knowledge) => {
  const state = env.state!;
  const found = unitOf(state, subject.data);
  if (!found) return null;
  const { unit } = found;
  const lines = [`${unit.displayName}: ${stressBand(unit.stress).toUpperCase()}${rawSuffix(knowledge, unit.stress)}`];

  // what moved her stress since yesterday, grouped by cause (newest cause first)
  const groups = new Map<string, number>();
  for (const e of ledgerFor(state, `stress:${unit.id}`, state.day - 1)) {
    const label = ledgerLabel(e.action);
    groups.set(label, (groups.get(label) ?? 0) + e.delta);
  }
  const moved = [...groups].filter(([, delta]) => delta !== 0);
  if (moved.length === 0) lines.push('No recent changes');
  for (const [label, delta] of moved) {
    const r = knowledge.raw(Math.abs(delta));
    lines.push(r === null ? `${delta > 0 ? 'rose' : 'fell'} — ${label}` : `${delta > 0 ? '+' : MINUS}${r} ${label}`);
  }

  const next = nextStressBand(unit.stress);
  if (next) {
    const short = env.registries.glossary.get(`stress_${next}`)?.short;
    lines.push(`Next: ${typeof short === 'string' ? short : next.toUpperCase()}`);
  }
  return { lines };
};

let registered = false;

/** Registers the core providers; safe to call more than once. */
export function registerCoreProviders(): void {
  if (registered) return;
  registered = true;
  for (const axis of ['trust', 'affinity', 'attraction'] as const) registerAnalyzeProvider(`glossary:${axis}`, axisProvider(axis));
  registerAnalyzeProvider('glossary:stress', stressProvider);
}
