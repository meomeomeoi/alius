/**
 * The craft's readings (P16b, plan Task 5). Everything goes through `Knowledge.craft`: the disciplines as words (the xp only with "show raw values"), and for each pair her
 * rhythm as a word, the foot signals she has named, the postures known and the records in fiction time. The settling-in count, an unnamed signal, the lesson word before she says
 * it, a slip waiting for her discipline and every rate of decay are not in the view, so they have no reading. No pronoun for the commander (lore section 0).
 */
import { DISCIPLINES } from '../../engine/craft/state';
import { spanText } from '../../engine/craft/state';
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
  const physics = env.registries.contactPhysics.get(r.key);
  return `${nameOf(env, v.unitId)}: day ${r.day}, ${spanText(r.seconds)} ${physics !== undefined ? String(physics.label).toLowerCase() : r.key}${KIND_WORDS[r.kind] ?? ''}.`;
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

/** Registers the craft's readings (called from `registerCoreProviders`). */
export function registerCraftProviders(): void {
  registerAnalyzeProvider('glossary:craft', craftProvider);
  for (const d of DISCIPLINES) registerAnalyzeProvider(`glossary:craft_${d}`, disciplineProvider(d));
  registerAnalyzeProvider('glossary:craft_record', recordProvider);
}
