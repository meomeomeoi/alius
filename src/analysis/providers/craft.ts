/**
 * The craft's readings (P16b, plan Task 5). Everything goes through `Knowledge.craft`: the disciplines as words (the xp only with "show raw values"), and for each pair her
 * rhythm as a word, the foot signals she has named, the postures known and the records in fiction time. The settling-in count, an unnamed signal, the lesson word before she says
 * it, a slip waiting for her discipline and every rate of decay are not in the view, so they have no reading. No pronoun for the commander (lore section 0).
 */
import { presetOf } from '../../engine/blocking';
import { DISCIPLINES, postureOfRecordKey, spanText } from '../../engine/craft/state';
import type { CraftView } from '../../engine/craft/view';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

const unitIdOf = (s: Subject): string | null => (typeof s.data.unitId === 'string' ? s.data.unitId : null);
const nameOf = (env: AnalyzeEnv, unitId: string): string => env.state?.squad.find((u) => u.id === unitId)?.displayName ?? 'She';
const KIND_WORDS: Readonly<Record<string, string>> = { longest: '', clean: ', not a slip', noTap: ', no taps' };
const titled = (key: string, env: AnalyzeEnv): string => {
  const physics = key.startsWith('endurance:') ? env.registries.contactPhysics.get(key.slice('endurance:'.length)) : undefined;
  return physics !== undefined ? `${String(physics.label)} endurance` : key.charAt(0).toUpperCase() + key.slice(1);
};

/** One discipline as a line; the xp joins it only with raw values. */
const lineOf = (d: CraftView['disciplines'][number], env: AnalyzeEnv, k: Knowledge): string => {
  const raw = d.xp !== undefined ? k.raw(d.xp) : null;
  return `${titled(d.key, env)}: ${d.word}${raw !== null ? ` (${raw} xp)` : ''}.`;
};

/** The records of a pair as lines in fiction time (the day, the time, the kind). */
const recordLines = (v: CraftView['pairs'][number], env: AnalyzeEnv): string[] => v.records.map((r) => {
  const posture = postureOfRecordKey(env.registries, r.key);
  const physics = env.registries.contactPhysics.get(r.key);
  const what = posture !== undefined ? `the ${String(posture.label).toLowerCase()} posture` : physics !== undefined ? String(physics.label).toLowerCase() : r.key.replace(/_/g, ' ');
  return `${nameOf(env, v.unitId)}: day ${r.day}, ${spanText(r.seconds)} ${what}${KIND_WORDS[r.kind] ?? ''}.`;
});

/** `glossary:craft`: every discipline as a word, and what each pair has learnt. */
function craftProvider(_s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  if (!env.state) return null;
  const v = k.craft(env.registries);
  return { lines: [...v.disciplines.map((d) => lineOf(d, env, k)), ...v.pairs.flatMap((p) => [`${nameOf(env, p.unitId)}: her rhythm is ${p.rhythm}.`, ...(p.signals.length > 0 ? [`${nameOf(env, p.unitId)} has named ${p.signals.length === 1 ? 'a signal' : `${p.signals.length} signals`} of her foot.`] : [])])] };
}

/** `glossary:craft_<discipline>`: the commander's word for it. */
const disciplineProvider = (key: string) => (_s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null => {
  if (!env.state) return null;
  const d = k.craft(env.registries).disciplines.find((x) => x.key === key);
  return d === undefined ? { lines: [`${titled(key, env)}: not practised yet.`] } : { lines: [lineOf(d, env, k)] };
};

/** `glossary:craft_record`: the records of one pair (the subject's `unitId`), or of every pair that has one. */
function recordProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  if (!env.state) return null;
  const given = unitIdOf(s);
  const pairs = k.craft(env.registries).pairs.filter((p) => given === null || p.unitId === given);
  const lines = pairs.flatMap((p) => recordLines(p, env));
  return { lines: lines.length > 0 ? lines : ['No record yet.'] };
}

/** `glossary:craft_norm`: what a drill holder asks of the commander, in fiction time; never the mark an exam is judged by. */
function normProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  if (!env.state) return null;
  const given = unitIdOf(s);
  const pairs = k.craft(env.registries).pairs.filter((p) => p.norm !== undefined && (given === null || p.unitId === given));
  return { lines: pairs.length > 0 ? pairs.map((p) => `${nameOf(env, p.unitId)} asks for: ${p.norm}.`) : ['No norm is set.'] };
}

/** `glossary:craft_sentence`: the days left of a running sentence; never the echo before it has acted or what slips added (the crime is the commander's own and is on the card). */
function sentenceProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  if (!env.state) return null;
  const given = unitIdOf(s);
  const pairs = k.craft(env.registries).pairs.filter((p) => p.sentence !== undefined && (given === null || p.unitId === given));
  return { lines: pairs.length > 0 ? pairs.map((p) => `${nameOf(env, p.unitId)}'s sentence: ${daysWords(p.sentence!.daysLeft)} left.`) : ['No sentence is running.'] };
}

/** `glossary:her_postures`: the postures she has named (by her name) and how well the commander knows each, as a word; never the xp, never one she has not named. */
function herPosturesProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  if (!env.state) return null;
  const given = unitIdOf(s);
  if (given === null) return { lines: ['Her named postures are listed in her DYNAMIC section.'] };
  const named = k.practice(given, env.registries).postures;
  if (named.length === 0) return { lines: [`${nameOf(env, given)} has named no posture yet.`] };
  const words = k.craft(env.registries).pairs.find((p) => p.unitId === given)?.postureWords ?? {};
  return { lines: named.map((p) => `${p.name}: ${words[String(presetOf(env.registries, p.postureId)?.id ?? p.postureId)] ?? 'untrained'}.`) };
}

/** "9 days", "1 day". */
const daysWords = (n: number): string => `${n} ${n === 1 ? 'day' : 'days'}`;

/** Registers the craft's readings (called from `registerCoreProviders`). */
export function registerCraftProviders(): void {
  registerAnalyzeProvider('glossary:craft', craftProvider);
  for (const d of DISCIPLINES) registerAnalyzeProvider(`glossary:craft_${d}`, disciplineProvider(d));
  registerAnalyzeProvider('glossary:craft_record', recordProvider);
  registerAnalyzeProvider('glossary:craft_norm', normProvider);
  registerAnalyzeProvider('glossary:craft_sentence', sentenceProvider);
  registerAnalyzeProvider('glossary:her_postures', herPosturesProvider);
}
