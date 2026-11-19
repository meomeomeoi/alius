import { allies, hackProblem, investigationBand, kompromatOf, wardenOf } from '../../engine/warden';
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

/** `glossary:intrigue`: what the commander has done, and only that there is `An unseen threat` (the suspicion is the engine's alone and is always worded the same). */
function intrigueProvider(_s: Subject, env: AnalyzeEnv): Reading {
  const s = env.state;
  if (!s || !wardenOf(s)) return null;
  const n = allies(s).length;
  return { lines: ['An unseen threat.', n === 0 ? 'Nobody stands with the commander yet.' : `${n === 1 ? 'One unit stands' : `${n} units stand`} with the commander.`] };
}

function kompromatProvider(_s: Subject, env: AnalyzeEnv): Reading {
  const s = env.state;
  if (!s || !wardenOf(s)) return null;
  const need = TUNING.warden.kompromat.needed;
  const have = kompromatOf(s).length;
  return { lines: [`${have} of ${need} pieces gathered.`, have >= need ? 'Enough for a report to oversight.' : 'Not enough for a report yet.'] };
}

function hackProvider(_s: Subject, env: AnalyzeEnv): Reading {
  const s = env.state;
  const ls = s?.leashswap;
  if (!s || !ls || !wardenOf(s)) return null;
  const ally = allies(s).find((id) => hackProblem(s, env.registries, id) === null) ?? allies(s)[0];
  const why = hackProblem(s, env.registries, ally);
  return { lines: [`Step ${ls.intrigue.hack.step} of ${TUNING.warden.hack.steps}.`, ...(why ? [why] : ['Ready for the next step.'])] };
}

/** `glossary:investigation`: only that there is `An unseen threat`, and how far it has come as a band (the length of the clock is not shown). */
function investigationProvider(_s: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  const s = env.state;
  const ls = s?.leashswap;
  if (!s || !ls || ls.status !== 'investigation') return null;
  const clock = s.world.clocks.find((c) => c.id === (ls.removal?.clockId ?? 'investigation'));
  const raw = clock ? k.raw(clock.filled) : null;
  return { lines: ['An unseen threat.', `The investigation is ${clock ? investigationBand(clock.filled, clock.segments).toLowerCase() : 'under way'}.`, ...(raw !== null ? [`Segments filled: ${raw}.`] : [])] };
}

/**
 * What the commander may not read: the warden's knowledge of an ally (`warden_knows_ally`), and a kompromat fact the commander has not
 * found yet (it is hidden from the commander until a dig reveals it and drops the mark).
 */
export const wardenKnowledgeRule: KnowledgeRule = {
  flag: (id) => id !== 'warden_knows_ally',
  fact: (f) => !(f.hiddenFromCommander === true && f.tags.includes('kompromat')),
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
  registerAnalyzeProvider('glossary:intrigue', intrigueProvider);
  registerAnalyzeProvider('glossary:kompromat', kompromatProvider);
  registerAnalyzeProvider('glossary:implant_hack', hackProvider);
  registerAnalyzeProvider('glossary:investigation', investigationProvider);
}
