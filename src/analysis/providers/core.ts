import type { CombatEffect } from '../../content/schemas';
import { stressBand } from '../../engine/combat/stress';
import { unitStatSteps, unitStats } from '../../engine/combat/stats';
import { STATS, type StatName } from '../../engine/combat/types';
import { upkeepNeeded } from '../../engine/economy';
import { wornItems } from '../../engine/items';
import { affinityBand, attractionBand, trustBand } from '../../engine/relations/bands';
import { intimacyOf } from '../../engine/relations/gain';
import { socialRank, type SocialStat } from '../../engine/social';
import type { CampaignState, Relation, Unit } from '../../engine/state/types';
import { humanize, signed, summarizeCombatEffect } from '../effects';
import type { Knowledge } from '../knowledge';
import { ledgerFor, ledgerLabel } from '../ledger';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider, type AnalyzeProvider } from '../providers';

/** Core readings (P7a §3): relationship axes, stress, unit stats, resources, settings and decision options. */

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

// ---------------------------------------------------------------------------------------------
// unit stats

/** The effects of her worn items, their affixes and her defects that touch `stat`, each followed by its source link. */
function combatLines(state: CampaignState, env: AnalyzeEnv, unit: Unit, stat: StatName): string[] {
  const reg = env.registries;
  const touches = (e: { type?: string; stat?: string }): boolean =>
    (e.type === 'stat' && (e.stat === stat || e.stat === 'all')) || (e.type === 'outgoing' && stat === 'atk') || (e.type === 'incoming' && stat === 'def');
  const out: string[] = [];
  const add = (list: unknown, source: string): void => {
    if (!Array.isArray(list)) return;
    for (const e of list) if (e && typeof e === 'object' && touches(e)) out.push(`${summarizeCombatEffect(e as CombatEffect, reg)} (${source})`);
  };
  for (const { inst } of wornItems(state, reg, unit)) {
    add(reg.items.get(inst.itemId)?.effects, `[[items:${inst.itemId}]]`);
    for (const id of inst.affixes) add(reg.affixes.get(id)?.effects, `[[affixes:${id}]]`);
  }
  for (const d of unit.defects) {
    const combat = reg.defects.get(d.id)?.combat as { upside?: unknown; downside?: unknown } | undefined;
    add(combat?.upside, `[[defects:${d.id}]]`);
    add(combat?.downside, `[[defects:${d.id}]]`);
  }
  return out;
}

const statProvider = (stat: StatName): AnalyzeProvider => (subject, env) => {
  const state = env.state!;
  const unit = typeof subject.data.unitId === 'string' ? state.squad.find((u) => u.id === subject.data.unitId) : undefined;
  if (!unit) return null;
  const steps = unitStatSteps(state, env.registries, unit, stat);
  const total = unitStats(state, env.registries, unit)[stat];
  const lines = [`${unit.displayName}: ${stat.toUpperCase()} ${total}`];
  steps.forEach((step, i) => lines.push(i === 0 ? `${step.label} ${step.total}` : `${step.label} → ${step.total}`));
  const combat = combatLines(state, env, unit, stat);
  if (combat.length > 0) lines.push('In combat:', ...combat);
  return { lines };
};

// ---------------------------------------------------------------------------------------------
// resources

type Resource = 'credits' | 'supplies' | 'plyx';

const resourceProvider = (resource: Resource): AnalyzeProvider => (_subject, env) => {
  const state = env.state!;
  const lines = [`Now ${state.resources[resource]}`];
  if (resource === 'supplies') {
    const { units, needed } = upkeepNeeded(state, env.registries);
    lines.push(`Daily upkeep ${needed} (${units} units and you)`);
  } else {
    lines.push('No daily upkeep');
  }
  const recent = ledgerFor(state, `res:${resource}`, 0).slice(0, 5);
  if (recent.length === 0) lines.push('No recent changes');
  for (const e of recent) lines.push(`${signed(e.delta)} — ${ledgerLabel(e.action)}, day ${e.day}`);
  return { lines };
};

// ---------------------------------------------------------------------------------------------
// settings

/** Labels of the SYS selects (mirrors `ui/shell/sysTab.ts`; a value without an entry reads as itself). */
const SETTING_LABELS: Record<string, Record<string, string>> = {
  mechanicThink: { min: 'minimal', low: 'low', auto: 'provider default' },
  spriteMode: { native: 'Native Expressions', emotion_pick: 'Mechanic emotion pick' },
  intentMode: { exchange: 'after every exchange', every_n: 'every N exchanges', scene_end: 'at scene end only' },
  romanticInitiative: { low: 'low', med: 'medium', high: 'high' },
};

/** Settings whose lock line is left out: they apply at once and a "takes effect" line would only be noise. */
const SILENT_SETTINGS = new Set(['analyzeEnabled', 'analyzeAnimation', 'analyzeHoverDelay']);

/** A lock line for settings the campaign can override or freeze; `undefined` = no lock applies. */
const SETTING_LOCKS: Record<string, (state: CampaignState, settings: Record<string, unknown>) => string | undefined> = {
  desireBondDefects: (state, settings) => {
    const own = state.settings.desireBondDefects;
    return typeof own === 'boolean' && own !== settings.desireBondDefects ? `This campaign keeps its own value: ${own ? 'on' : 'off'}` : undefined;
  },
  difficulty: (state) => (state.combat ? 'Locked while a combat is open' : undefined),
};

function settingValue(key: string, value: unknown, state: CampaignState): string {
  if (key === 'difficulty') return String(state.difficulty);
  if (key === 'budgets') return 'per call type';
  if (typeof value === 'boolean') return value ? 'on' : 'off';
  if (key === 'mechanicProfileId') return value === '' || value === undefined ? 'none' : String(value);
  return SETTING_LABELS[key]?.[String(value)] ?? String(value);
}

const settingProvider: AnalyzeProvider = (subject, env) => {
  const state = env.state!;
  const key = subject.id;
  const settings = env.settings as unknown as Record<string, unknown>;
  if (key !== 'difficulty' && !(key in settings)) return null;
  const lines = [`Now: ${settingValue(key, settings[key], state)}`];
  if (SILENT_SETTINGS.has(key)) return { lines };
  lines.push(SETTING_LOCKS[key]?.(state, settings) ?? 'Takes effect at once.');
  return { lines };
};

// ---------------------------------------------------------------------------------------------
// decision options: only the tags, never what the option would change

const SOCIAL_STATS: readonly string[] = ['authority', 'insight', 'empathy', 'cunning'];
const SCALES: readonly string[] = ['minor', 'major', 'defining'];

function tag(value: unknown): { stat: SocialStat; rank: number } | null {
  if (!value || typeof value !== 'object') return null;
  const { stat, rank } = value as { stat?: unknown; rank?: unknown };
  return typeof stat === 'string' && SOCIAL_STATS.includes(stat) && typeof rank === 'number' && Number.isFinite(rank)
    ? { stat: stat as SocialStat, rank }
    : null;
}

const decisionProvider: AnalyzeProvider = (subject, env) => {
  const state = env.state!;
  const lines: string[] = [];
  const requires = tag(subject.data.requires);
  if (requires) lines.push(`Requires [[${requires.stat}]] rank ${requires.rank} (yours: ${socialRank(state, requires.stat)})`);
  const check = tag(subject.data.check);
  if (check) lines.push(`Check: [[${check.stat}]] rank ${check.rank} — rolled when you choose; if it fails, only the costs remain.`);
  if (typeof subject.data.scale === 'string' && SCALES.includes(subject.data.scale)) lines.push(`[[decision_${subject.data.scale}]]`);
  lines.push('What it changes stays uncertain until you choose.');
  return { lines };
};

let registered = false;

/** Registers the core providers; safe to call more than once. */
export function registerCoreProviders(): void {
  if (registered) return;
  registered = true;
  for (const axis of ['trust', 'affinity', 'attraction'] as const) registerAnalyzeProvider(`glossary:${axis}`, axisProvider(axis));
  registerAnalyzeProvider('glossary:stress', stressProvider);
  for (const stat of STATS) registerAnalyzeProvider(`glossary:stat_${stat}`, statProvider(stat));
  for (const resource of ['credits', 'supplies', 'plyx'] as const) registerAnalyzeProvider(`glossary:${resource}`, resourceProvider(resource));
  registerAnalyzeProvider('setting', settingProvider);
  registerAnalyzeProvider('glossary:decision_option', decisionProvider);
}
