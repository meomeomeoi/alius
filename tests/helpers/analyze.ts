import { analyzeProviders, readingFor } from '../../src/analysis/providers';
import type { AnalyzeEnv } from '../../src/analysis/model';
import { parseSubject } from '../../src/analysis/subject';
import type { Sentinels } from '../fixtures/analyze/hidden';

/** An address for every provider registered under a bare source (not an exact address). */
export const SAMPLE_ADDRESS: Record<string, string> = {
  setting: 'setting:showRawValues',
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
