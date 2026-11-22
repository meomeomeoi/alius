/**
 * The dynamic's readings (P15, plan R25). Every reading goes through `Knowledge.dynamic`: her frame and hold as words and bands (the number only with raw values, and in
 * immersive mode only `[[dynamic_felt]]`), the domains she holds and may claim, her tracks as bands, her reading in her own word, the compromat she has mentioned, what others have shown
 * they know of her, and what the body map shows (an attitude only once a fact has shown it; mastery as a level, never the xp). Regard, suspicion, mastery xp, the profile she has not shown,
 * unmentioned compromat, the stage of an aftermath and her override chance have no reading: they are not in the view. The facts of the squad's knowledge (`suspects_close`, `suspects_dynamic`,
 * `knows_dynamic`) are written hidden from the commander and the engine drops the flag once the observer has shown it in a later scene or DM (`revealKnown`, review I7), so the ordinary
 * fact rule of `Knowledge` reads the same flag. No pronoun for the commander (lore §0).
 */
import { dynamicOn } from '../../engine/dynamic/gate';
import type { DynamicView } from '../../engine/dynamic/view';
import type { KnowledgeLevel } from '../../engine/dynamic/types';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

const unitIdOf = (s: Subject): string | null => (typeof s.data.unitId === 'string' ? s.data.unitId : null);
const nameOf = (env: AnalyzeEnv, unitId: string): string => env.state?.squad.find((u) => u.id === unitId)?.displayName ?? 'She';
const FELT_LINE = '[[dynamic_felt]]';
const plain = (text: string): string => text.replace(/^\s*AUTHOR TO WRITE:\s*/, '').trim();

/** What an observer has shown she knows, in words (never the suspicion behind it). */
const LEVEL_WORDS: Readonly<Record<KnowledgeLevel, string>> = { suspects_close: 'has noticed something', suspects_dynamic: 'suspects', knows_dynamic: 'knows' };
const MASTERY_WORDS = ['no', 'one', 'two', 'three', 'four', 'five'] as const;

type Reader = (s: Subject, env: AnalyzeEnv, view: DynamicView, unitId: string) => string[];

/** A provider for the subject's unit: the view is built once; no unit or no dynamic, no reading. */
function viewed(read: Reader) {
  return (s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null => {
    const unitId = unitIdOf(s);
    if (!env.state || unitId === null) return null;
    const lines = read(s, env, k.dynamic(unitId, env.registries), unitId);
    return lines.length > 0 ? { lines } : null;
  };
}

/** `glossary:hold`: the band, and the number only with raw values. */
const holdReading: Reader = (_s, env, v, unitId) => {
  if (v.band === undefined) return [];
  if (v.band === 'felt') return [FELT_LINE];
  return [`${nameOf(env, unitId)}: ${v.band}${v.raw !== undefined ? ` (${v.raw})` : ''}.`];
};

/** `glossary:frame`: her frame. */
const frameReading: Reader = (_s, env, v, unitId) => (v.band === 'felt' ? [FELT_LINE] : v.frame !== undefined ? [`${nameOf(env, unitId)}: ${v.frame}.`] : []);

/** `dynamicFrames:<id>`: only the frame she is in says so. */
const frameRowReading: Reader = (s, env, v, unitId) => {
  if (v.band === 'felt') return [FELT_LINE];
  return v.frame !== undefined && v.frame === String(env.registries.dynamicFrames.get(s.id)?.label) ? [`${nameOf(env, unitId)} is here.`] : [];
};

/** `dynamicDomains:<id>`: held (and in part), asked for, or something she may claim. */
const domainReading: Reader = (s, env, v, unitId) => {
  const d = v.domains.find((x) => x.id === s.id);
  const name = nameOf(env, unitId);
  if (d?.claimed === true) return [`${name} holds it${d.partial === true ? ', in part' : ''}.`];
  if (v.asked.includes(s.id)) return [`${name} has asked for it. The card waits.`];
  return d !== undefined ? [`${name} may claim it.`] : [];
};

/** `dynamicTracks:<id>`: how far she has gone in it, as a band. */
const trackReading: Reader = (s, env, v, unitId) => {
  const t = v.tracks.find((x) => x.id === s.id);
  return t === undefined ? [] : t.band === 'felt' ? [FELT_LINE] : [`${nameOf(env, unitId)}: ${t.band}.`];
};

/** `glossary:her_reading`: her word for the commander's position, hers alone. */
const readingReading: Reader = (_s, env, v, unitId) => (v.reading !== undefined ? [`${nameOf(env, unitId)} takes the commander to be: ${v.reading}.`] : []);

/** `glossary:dynamic`: the whole of it in a few lines. */
const dynamicReading: Reader = (s, env, v, unitId) => {
  const name = nameOf(env, unitId);
  const lines: string[] = [];
  if (v.band === 'felt') lines.push(FELT_LINE);
  else if (v.band !== undefined) lines.push(`${name}: ${v.frame ?? ''}${v.frame !== undefined ? ', ' : ''}${v.band}${v.raw !== undefined ? ` (${v.raw})` : ''}.`);
  const held = v.domains.filter((d) => d.claimed).map((d) => d.label);
  if (held.length > 0) lines.push(`Holds: ${held.join(', ')}.`);
  if (v.sworn) lines.push(`${name} has sworn.`);
  lines.push(...readingReading(s, env, v, unitId));
  for (const sign of v.signs) lines.push(`${name}: ${sign}.`);
  for (const k of v.knownLevels) lines.push(`${nameOf(env, k.observerId)} ${LEVEL_WORDS[k.level]}.`);
  return lines;
};

/** `glossary:compromat`: what she has mentioned that she keeps of the commander's. */
const compromatReading: Reader = (_s, env, v, unitId) => v.compromat.map((f) => `${nameOf(env, unitId)} keeps: ${plain(f.text)}`);

/** `worshipTargets:<id>`: what a fact has shown of how she takes the commander's attention there, and the commander's mastery of it as a level. */
const zoneReading: Reader = (s, env, v, unitId) => {
  if (!dynamicOn(env.state!, env.registries)) return [];
  const shown = v.expectations.worship?.[s.id];
  const zone = v.zones[s.id]; // the level and the facts that showed it, from the view (the commander's own facts, never the xp)
  const level = zone?.mastery ?? 0;
  return [
    shown === undefined ? 'Not known yet.' : `${nameOf(env, unitId)}: ${shown.attitude}${shown.meaning !== undefined ? `, ${shown.meaning}` : ''}.`,
    ...(zone?.facts ?? []).map((f) => `Shown: ${plain(f)}`),
    ...(level > 0 ? [`Mastery: ${MASTERY_WORDS[level]} of five.`] : []),
  ];
};

/** Registers the dynamic's readings (called from `registerCoreProviders`). */
export function registerDynamicProviders(): void {
  registerAnalyzeProvider('glossary:hold', viewed(holdReading));
  registerAnalyzeProvider('glossary:frame', viewed(frameReading));
  registerAnalyzeProvider('glossary:her_reading', viewed(readingReading));
  registerAnalyzeProvider('glossary:dynamic', viewed(dynamicReading));
  registerAnalyzeProvider('glossary:compromat', viewed(compromatReading));
  registerAnalyzeProvider('dynamicFrames', viewed(frameRowReading));
  registerAnalyzeProvider('dynamicDomains', viewed(domainReading));
  registerAnalyzeProvider('dynamicTracks', viewed(trackReading));
  registerAnalyzeProvider('worshipTargets', viewed(zoneReading));
}
