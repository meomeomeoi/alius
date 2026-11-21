import type { PastimeEntry } from '../../engine/life/types';
import { plainText } from '../../engine/life/facts';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Her life, as the commander may read it (P14c). Every reading goes through `Knowledge.life`: the opinions she has voiced, the milestones she has
 * told and a word for how keen she is, the hub line, what she has told, her three temperament words and the commander's own learning as words.
 * An untold or kept event, an opinion she has not voiced, skill, interest, aptitude, the queue, a persuasion count and a joke count are never
 * read here; "nothing yet" reads the same whether there is nothing or something she has not said. No pronoun for the commander (lore §0).
 */

const unitIdOf = (s: Subject): string | null => (typeof s.data.unitId === 'string' ? s.data.unitId : null);
const nameOf = (env: AnalyzeEnv, unitId: string): string => env.state?.squad.find((u) => u.id === unitId)?.displayName ?? 'She';

/** `opinionTopics:<id>` with `{ unitId }`: her view when she has said it (and what she used to think), else one neutral line. */
function opinionProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const heard = k.life(unitId, env.registries).opinions.find((o) => o.topicId === s.id);
  if (!heard) return { lines: ['Nothing she has said yet.'] };
  return { lines: [`${nameOf(env, unitId)}: ${heard.text}`, ...heard.history.map((was) => `She used to think: ${was}`)] };
}

/** `hobbies:<id>` with `{ unitId }`: how keen she is, as a word, and the milestones she has told (and the trace they left). */
function hobbyProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const hb = k.life(unitId, env.registries).hobbies.find((x) => x.id === s.id);
  if (!hb) return { lines: ['Nothing she has shown yet.'] };
  return { lines: [`${nameOf(env, unitId)}: ${hb.word.toUpperCase()}`, ...hb.milestones, ...hb.traces] };
}

/** `lifeEvents:<id>` with `{ unitId }`: the line on the hub, only for the event that stands there (nothing for the others, and nothing she keeps). */
function eventProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const hub = k.life(unitId, env.registries).hub;
  return hub !== null && hub.eventId === s.id ? { lines: [hub.text] } : null;
}

/** `pastimes:<id>`: when it is held and what it asks, from the entry alone. */
function pastimeProvider(s: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const p = env.registries.pastimes.get(s.id) as unknown as PastimeEntry | undefined;
  if (!env.state || !p) return null;
  const needs = [
    ...(p.requires?.afterRun === true ? ['after a run'] : []), ...(p.requires?.firstSlot === true ? ['the first slot of the day'] : []),
    ...(p.requires?.hobby !== undefined || p.hobby === true ? ['a hobby of hers'] : []),
  ];
  return { lines: [`Held in the ${p.slots.join(', ')}.`, p.talk === 'quiet' ? 'Quiet: not much is said.' : 'Some talk.', ...(needs.length > 0 ? [`Needs ${needs.join(' and ')}.`] : [])] };
}

/** `glossary:temperament` with `{ unitId }`: her three words. */
function temperamentProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const t = k.life(unitId, env.registries).temperWords;
  return { lines: [`${nameOf(env, unitId)}: ${t.talkativeness}, ${t.volatility}, ${t.humor}.`] };
}

/** `glossary:setting_life_events`: the frequency; an old save never turned it on. */
function settingProvider(_s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const mode = k.life(state.squad[0]?.id ?? '', env.registries).mode;
  return { lines: [`Life events are ${mode}${state.settings.lifeEvents === undefined ? ' (this campaign never turned them on)' : ''}.`] };
}

/** `glossary:commander_hobby_skill` (with `{ hobbyId }` for one): what the commander has learned from her, in words. */
function skillProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  if (!env.state) return null;
  const first = env.state.squad.find((u) => u.kind === 'named')?.id ?? '';
  const only = typeof s.data.hobbyId === 'string' ? s.data.hobbyId : null;
  const skills = k.life(first, env.registries).commanderSkills.filter((x) => only === null || x.id === only);
  return { lines: skills.length === 0 ? ['Nothing yet.'] : skills.map((x) => `${x.label}: ${x.word === 'none' ? 'not yet' : x.word}`) };
}

/** `glossary:life_events` with `{ unitId }`: what she has told of her days (the news the commander has heard). */
function toldProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const told = k.life(unitId, env.registries).told;
  return { lines: told.length === 0 ? ['Nothing she has told yet.'] : told.map((t) => plainText(t)) };
}

export function registerLifeProviders(): void {
  registerAnalyzeProvider('opinionTopics', opinionProvider);
  registerAnalyzeProvider('hobbies', hobbyProvider);
  registerAnalyzeProvider('lifeEvents', eventProvider);
  registerAnalyzeProvider('pastimes', pastimeProvider);
  registerAnalyzeProvider('glossary:temperament', temperamentProvider);
  registerAnalyzeProvider('glossary:setting_life_events', settingProvider);
  registerAnalyzeProvider('glossary:commander_hobby_skill', skillProvider);
  registerAnalyzeProvider('glossary:life_events', toldProvider);
}
