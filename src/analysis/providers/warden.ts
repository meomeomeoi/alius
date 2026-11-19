import { wardenOf } from '../../engine/warden';
import { TUNING } from '../../engine/tuning';
import type { Knowledge, KnowledgeRule } from '../knowledge';
import { registerKnowledgeRule } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of LEASHSWAP (P13). The warden's satisfaction and defiance come as bands (numbers only with raw values on, through
 * `Knowledge`); an expectation reads only once the commander knows it; the hidden things (an unknown expectation, the intrigue suspicion,
 * her co-sign chance, a verdict's chance) never reach a line. Registered by `registerCoreProviders`.
 */

type Reading = { lines: string[] } | null;

const SATISFACTION_WORDS = (n: number): string => (n < 20 ? 'hostile' : n < 40 ? 'cold' : n < 60 ? 'wary' : n < 80 ? 'satisfied' : 'pleased');

function satisfactionProvider(_s: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  const w = env.state ? wardenOf(env.state) : null;
  if (!w) return null;
  const raw = k.raw(w.satisfaction);
  return { lines: [`She is ${SATISFACTION_WORDS(w.satisfaction)} with the commander${raw !== null ? ` (${raw})` : ''}.`, w.satisfaction < 40 ? 'She is likely to override.' : 'She seldom overrides.'] };
}

function defianceProvider(_s: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  const w = env.state ? wardenOf(env.state) : null;
  if (!w) return null;
  const E = TUNING.warden.escalation;
  const raw = k.raw(w.defiance);
  const lines = [w.defiance >= E.warning2 ? 'Open defiance is near the limit.' : w.defiance >= E.warning1 ? 'Open defiance is on the record.' : 'Open defiance is low.'];
  if (raw !== null) lines.push(`Defiance: ${raw}.`);
  if (w.warnings.length > 0) lines.push(`${w.warnings.length === 1 ? 'One warning' : 'Two warnings'} given.`);
  return { lines };
}

const WEIGHT_WORDS = (w: number): string => (w < 0.2 ? 'low' : w < 0.35 ? 'medium' : 'high');

/** `wardenExpectations:<id>`: the entry's kind, and only when the commander knows an expectation of that kind. An unknown one reads nothing. */
function expectationProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  const w = env.state ? wardenOf(env.state) : null;
  const entry = env.registries.wardenExpectations.get(subject.id);
  if (!w || !entry) return null;
  const x = w.expectations.find((e) => e.kind === entry.kind && e.known);
  if (!x) return null;
  const raw = k.raw(x.weight);
  return { lines: [`She weighs this ${WEIGHT_WORDS(x.weight)}${raw !== null ? ` (${raw})` : ''}.`] };
}

/** What the commander may not read: the warden's knowledge of an ally (`warden_knows_ally`). */
export const wardenKnowledgeRule: KnowledgeRule = {
  flag: (id) => id !== 'warden_knows_ally',
};

let registered = false;

/** Registers the knowledge rule and the readings; safe to call more than once (the core registration calls it). */
export function registerWardenProviders(): void {
  if (registered) return;
  registered = true;
  registerKnowledgeRule(wardenKnowledgeRule);
  registerAnalyzeProvider('glossary:warden_satisfaction', satisfactionProvider);
  registerAnalyzeProvider('glossary:warden_defiance', defianceProvider);
  registerAnalyzeProvider('wardenExpectations', expectationProvider);
}
