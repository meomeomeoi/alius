/**
 * What the player may read of the commander's craft (P16b, plan Task 5): the engine side of `Knowledge.craft`. Disciplines as words (the xp behind them only with
 * "show raw values"), and for each pair what the commander has learnt of her: her rhythm as a word, the foot signals she has NAMED and the postures known, and
 * the records in fiction time. The settling-in count, a signal she has not named, the lesson word before she says it, the waiting slips and every rate of decay
 * never appear here. Pure; draws nothing; no number leaves it unless `raw`.
 */
import type { Registries } from '../../content/types';
import { levelForXp } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { normText } from './programmes/drill';
import { daysLeft, sentenceOf } from './programmes/vindictive';
import { craftWord, DISCIPLINES, ENDURANCE_PREFIX } from './state';
import { craftLevel, craftXp } from './book';
import type { RecordKind } from './records';

export interface CraftView {
  /** The disciplines in a fixed order (the written ones of `DISCIPLINES`, then the endurance of each physics that has one), each as a word. `xp` only with raw values. */
  disciplines: Array<{ key: string; word: string; xp?: number }>;
  /** What the commander has learnt of each woman (a pair appears only when something of it is written and may be shown). */
  pairs: Array<{
    unitId: string;
    /** The postures known with her, as ids (the UI gives them their names). */
    postures: string[];
    /** How well each is known, as the word of its level (never the xp): by preset id. */
    postureWords?: Record<string, string>;
    /** Her rhythm as a word of the same scale. */
    rhythm: string;
    /** The foot signals she has named, as motions. */
    signals: string[];
    /** The records in fiction time: the most specific kind that holds the longest time, and any lesser kind below it. */
    records: Array<{ key: string; kind: RecordKind; seconds: number; day: number }>;
    /** A `drill` holder's norms in words (never the pass mark or what an exam in progress has come to). */
    norm?: string;
    /** A running sentence: the days left (never the crime, the echo or what slips added). */
    sentence?: { daysLeft: number };
  }>;
}

/** An empty view (no campaign). */
export const emptyCraftView = (): CraftView => ({ disciplines: [], pairs: [] });

/** The records of one key as the rows a margin shows: the longest time under the kind that holds it, then a lesser kind only when it is lower and set. */
export function recordRows(key: string, rec: { longest: number; clean: number; noTap: number; day: number }): Array<{ key: string; kind: RecordKind; seconds: number; day: number }> {
  if (!(rec.longest > 0)) return [];
  const top: RecordKind = rec.clean === rec.longest ? 'clean' : rec.noTap === rec.longest ? 'noTap' : 'longest';
  const rows = [{ key, kind: top, seconds: rec.longest, day: rec.day }];
  for (const kind of ['noTap', 'clean'] as const) if (kind !== top && rec[kind] > 0 && rec[kind] < rec.longest) rows.push({ key, kind, seconds: rec[kind], day: rec.day });
  return rows;
}

export function craftView(state: CampaignState, reg: Registries, opts: { raw: boolean }): CraftView {
  const disciplines: CraftView['disciplines'] = [];
  const add = (key: string): void => {
    const level = craftLevel(state, key);
    disciplines.push({ key, word: craftWord(level), ...(opts.raw ? { xp: craftXp(state, key) } : {}) });
  };
  // a discipline nothing in the game can train yet (`depth`) is listed once it has been written
  for (const d of DISCIPLINES) if (d !== 'depth' || state.commander.craft?.depth !== undefined) add(d);
  for (const e of reg.contactPhysics.values()) if (e.skill === true) add(`${ENDURANCE_PREFIX}${e.id}`);
  const pairs: CraftView['pairs'] = [];
  for (const unit of state.squad) {
    const c = state.relations[unit.id]?.craft;
    if (c === undefined || unit.kind !== 'named') continue;
    const postures = Object.keys(c.postures ?? {});
    const postureWords = Object.fromEntries(Object.entries(c.postures ?? {}).map(([id, k]) => [id, craftWord(levelForXp(k.xp))]));
    const signals = Object.entries(c.signals ?? {}).filter(([, s]) => s.named).map(([motion]) => motion);
    const records = Object.entries(c.records ?? {}).flatMap(([key, rec]) => recordRows(key, rec));
    const rhythm = c.rhythm !== undefined ? craftWord(levelForXp(c.rhythm.xp)) : null;
    const norm = c.drill !== undefined ? normText(reg, c.drill.norms) : null;
    const sentence = sentenceOf(state, unit.id);
    if (postures.length === 0 && signals.length === 0 && records.length === 0 && norm === null && sentence === undefined && (rhythm === null || rhythm === 'untrained')) continue;
    pairs.push({ unitId: unit.id, postures, ...(postures.length > 0 ? { postureWords } : {}), rhythm: rhythm ?? 'untrained', signals, records, ...(norm !== null ? { norm } : {}), ...(sentence !== undefined ? { sentence: { daysLeft: daysLeft(state, sentence) } } : {}) });
  }
  return { disciplines, pairs };
}
