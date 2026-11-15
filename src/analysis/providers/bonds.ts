import { bondOf, enabledCategories, leadScoreParts, rulesOf, wantBand, wantEligible, wantOf } from '../../engine/bonds';
import type { Registries } from '../../content/types';
import { TUNING } from '../../engine/tuning';
import type { Knowledge } from '../knowledge';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';
import type { AnalyzeEnv } from '../model';

/**
 * Readings of the bond layer (P9d): which content categories are on, and a unit's bond profile. Everything here is the
 * player's own choice or her card's profile, shown as words; Want, lead and publicity readings come with their own tasks and
 * read through `Knowledge`.
 */

const orderedCategories = (reg: Registries) => [...reg.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order));
const link = (id: string, label: string) => `[[contentCategories:${id}|${label}]]`;
/** Text from a card or the player must never become a link. */
const plain = (t: string): string => t.replace(/\[\[|\]\]/g, '').replace(/\s+/g, ' ').trim();

function categoryProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  if (!env.state || !env.registries.contentCategories.has(subject.id)) return null;
  return { lines: [enabledCategories(env.state).includes(subject.id) ? 'In this campaign: switched on.' : 'In this campaign: off. It is excluded from every generation.'] };
}

function categoriesGlossaryProvider(_subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  if (!env.state) return null;
  const on = enabledCategories(env.state);
  const list = orderedCategories(env.registries).filter((c) => on.includes(String(c.id))).map((c) => link(String(c.id), String(c.label)));
  return { lines: [list.length === 0 ? 'Switched on: nothing. Every category is off.' : `Switched on: ${list.join(', ')}.`] };
}

function bondProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const unit = env.state && unitId !== null ? env.state.squad.find((u) => u.id === unitId) : undefined;
  const bond = unit ? bondOf(unit) : null;
  if (!bond) return null;
  const lines = [`Leads: ${bond.leadStyle}. Attaches: ${bond.attachment}. Desire: ${bond.desire}.`];
  if (bond.caretaker) lines.push('A caretaker: she looks after others at her own cost.');
  lines.push(`She wants a relationship to be: ${bond.publicity}.`);
  const cats = orderedCategories(env.registries).filter((c) => bond.ownLimits.categories.includes(String(c.id))).map((c) => link(String(c.id), String(c.label)));
  const note = plain(bond.ownLimits.note ?? '');
  if (cats.length > 0) lines.push(`She will not take part in: ${cats.join(', ')}.${note !== '' ? ` ${note}` : ''}`);
  else if (note !== '') lines.push(`Her own limit: ${note}`);
  return { lines };
}

/** Who leads the open scene and why, in words; the score and its parts only with raw values on (through `Knowledge`). */
function leadProvider(_subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const scene = env.state?.scene;
  const lead = scene?.lead;
  const unit = lead ? env.state!.squad.find((u) => u.id === lead.unitId) : undefined;
  if (!scene || !lead || !unit) return null;
  const parts = leadScoreParts(env.state!, env.registries, unit.id);
  const bond = bondOf(unit);
  const who = lead.by === 'unit' ? `${unit.displayName} leads.` : lead.by === 'commander' ? `The commander leads; ${unit.displayName} follows.` : `${unit.displayName} and the commander share the lead.`;
  const lines = [`This scene: ${who}`];
  if (bond) lines.push(`Her style: ${bond.leadStyle}.`);
  const score = k.raw(lead.score);
  if (score !== null && parts) {
    const signed = (n: number) => `${n < 0 ? '−' : '+'}${k.raw(Math.round(Math.abs(n)))}`;
    lines.push(`Score: ${score} (leads at ${TUNING.bonds.lead.unitAtLeast} or more, follows at ${TUNING.bonds.lead.commanderAtMost} or less).`);
    lines.push(`Style: ${signed(parts.styleBase)}, Impunity: ${signed(parts.impunity)}, defects: ${signed(parts.defect)}, recent yields: ${signed(parts.yielded)}, recent enforcement: ${signed(parts.enforced)}, relationship: ${signed(parts.state)}.`);
  }
  return { lines };
}

/** What the band does, in words (the numbers behind them are draft balance values). */
const WANT_EFFECT: Record<string, string> = {
  calm: '',
  restless: 'She writes first more often and may come to the door.',
  aching: 'She is irritable and under stress, and it colours how she speaks to the commander.',
  desperate: 'Her defect may break her for a day.',
};

/** Her Want as a band word; the number only through `Knowledge` (raw values on). */
function wantProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const state = env.state;
  if (!state || unitId === null || (!wantEligible(state, env.registries, unitId) && wantOf(state, unitId) === 0)) return null;
  const n = wantOf(state, unitId);
  const band = wantBand(n);
  const raw = k.raw(n);
  const lines = [`Her want: ${band}${raw !== null ? ` (${raw})` : ''}.`];
  if (WANT_EFFECT[band] !== '') lines.push(WANT_EFFECT[band]);
  return { lines };
}

const CHECK_TEXT: Record<string, string> = {
  daily_contact: 'The game checks it: a day without a scene or a message to her breaks it.',
  run_without_asking: 'The game checks it: sending a romantic partner of someone else on a run without her breaks it.',
  intent: 'The game reads it from what you say and do in a talk.',
};

/** One of her rules: its status, how often it was broken and how the game judges it. */
function ruleProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  const ruleId = typeof subject.data.ruleId === 'string' ? subject.data.ruleId : null;
  const rule = state && ruleId !== null ? rulesOf(state).find((r) => r.id === ruleId) : undefined;
  if (!rule) return null;
  const status = rule.status === 'negotiating' ? 'being negotiated' : rule.status;
  const broken = rule.brokenCount === 0 ? 'Never broken.' : rule.brokenCount === 1 ? 'Broken once.' : `Broken ${rule.brokenCount} times.`;
  const check = String(env.registries.relationshipRuleTemplates.get(rule.templateId)?.check ?? '');
  return { lines: [`Her rule: ${status}. ${broken}`, ...(CHECK_TEXT[check] ? [CHECK_TEXT[check]] : [])] };
}

/** How open her relationship is, her preference and what happens when it changes; the reveal chance only with raw values on. */
function publicityProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const state = env.state;
  const unit = state && unitId !== null ? state.squad.find((u) => u.id === unitId) : undefined;
  const open = unitId !== null ? state?.relations[unitId]?.publicity : undefined;
  if (!state || !unit || !open) return null;
  const pref = bondOf(unit)?.publicity;
  const lines = [`The relationship is ${open.level}${pref !== undefined ? `; she prefers ${pref}` : ''}.`];
  if (pref !== undefined && pref !== open.level) lines.push('She would like to talk about it.');
  if (open.level === 'secret') {
    const T = TUNING.relations.affair;
    const chance = k.raw(Math.round((T.base + T.perOther) * 100));
    lines.push(chance !== null ? `It can come out when others are with her: about ${chance} % with one other present.` : 'It can come out when others are with her.');
  }
  return { lines };
}

/** Registers the P9d readings (called from `registerCoreProviders`). */
export function registerBondsProviders(): void {
  registerAnalyzeProvider('contentCategories', categoryProvider);
  registerAnalyzeProvider('glossary:content_categories', categoriesGlossaryProvider);
  registerAnalyzeProvider('glossary:bond_profile', bondProvider);
  registerAnalyzeProvider('glossary:lead', leadProvider);
  registerAnalyzeProvider('glossary:want', wantProvider);
  registerAnalyzeProvider('glossary:publicity', publicityProvider);
  registerAnalyzeProvider('relationshipRuleTemplates', ruleProvider);
}
