import { analyzeProviders, readingFor } from '../../src/analysis/providers';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { parseSubject } from '../../src/analysis/subject';
import type { Sentinels } from '../fixtures/analyze/hidden';

/** An address for every provider registered under a bare source (not an exact address). */
export const SAMPLE_ADDRESS: Record<string, string> = {
  setting: 'setting:showRawValues',
  worldOptions: 'worldOptions:oversight', // P8
  commandStances: 'commandStances:disciplined', // P9
  punishments: 'punishments:verbal', // P9
  wardenExpectations: 'wardenExpectations:warden_meet_quota', // P13
  reputations: 'reputations:iron_rule', // P9
  contentCategories: 'contentCategories:restraint', // P9d
  relationshipRuleTemplates: 'relationshipRuleTemplates:report_evening', // P9d
  deviceAccessRules: 'deviceAccessRules:decor', // P9c
  bookingKinds: 'bookingKinds:evening_with_me', // P9c
  tokenKinds: 'tokenKinds:dog_tag', // P9c
  wagerGames: 'wagerGames:coin', // P9c
  wagerStakes: 'wagerStakes:privilege', // P9c
  secretKinds: 'secretKinds:hidden_injury', // P9c
  developmentAxes: 'developmentAxes:value:mercy', // P14b
  opinionTopics: 'opinionTopics:corporations', // P14c
  hobbies: 'hobbies:reading', // P14c
  lifeEvents: 'lifeEvents:wrote_journal', // P14c: an event she keeps to herself: the reading must stay empty
  pastimes: 'pastimes:patch_each_other', // P14c
};

/** The address a registered provider key is run with: the key itself when it is an address, else its sample. */
export function addressForKey(key: string): string | null {
  return key.includes(':') ? key : SAMPLE_ADDRESS[key] ?? null;
}

/** Bare-source keys that have no sample address yet. */
export function keysWithoutSample(): string[] {
  return [...analyzeProviders().keys()].filter((k) => addressForKey(k) === null);
}

/** Every registered provider run once with `data: { unitId }`, all reading lines joined. */
export function allReadings(env: AnalyzeEnv, unitId: string): string {
  const out: string[] = [];
  for (const key of analyzeProviders().keys()) {
    const address = addressForKey(key);
    if (!address) continue;
    const subject = parseSubject(address, JSON.stringify({ unitId }));
    if (subject) out.push(...(readingFor(subject, env)?.lines ?? []));
  }
  return out.join('\n');
}

/** Sentinels found in a text: numbers as whole numbers (not inside a longer number), texts as substrings. */
export function leaks(text: string, sentinels: Sentinels): string[] {
  const found = sentinels.texts.filter((t) => text.includes(t));
  for (const n of sentinels.numbers) {
    if (new RegExp(`(?<![\\d.])${n}(?!\\d)`).test(text)) found.push(String(n));
  }
  return found;
}
