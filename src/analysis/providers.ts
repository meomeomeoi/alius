import { buildKnowledge, type Knowledge } from './knowledge';
import type { AnalyzeEnv } from './model';
import type { Subject } from './subject';

/** The "Current reading" block of a panel: lines that may carry `[[links]]`. */
export interface Reading {
  lines: string[];
}

/** `ctx.state` is null only for providers registered `stateless`; `subject.data` is the element's `data-analyze-ctx`. */
export type AnalyzeProvider = (subject: Subject, ctx: AnalyzeEnv, knowledge: Knowledge) => Reading | null;

const providers = new Map<string, AnalyzeProvider[]>();
/** Providers that read nothing from the campaign (settings): they also run with no campaign loaded. */
const stateless = new WeakSet<AnalyzeProvider>();

/**
 * `key` is an exact address (`glossary:trust`) or a bare source (`setting`). Returns a function that
 * removes the provider again (tests).
 */
export function registerAnalyzeProvider(key: string, fn: AnalyzeProvider, opts?: { stateless?: boolean }): () => void {
  if (opts?.stateless) stateless.add(fn);
  const list = providers.get(key) ?? [];
  list.push(fn);
  providers.set(key, list);
  return () => {
    const cur = providers.get(key);
    if (!cur) return;
    const rest = cur.filter((p) => p !== fn);
    if (rest.length > 0) providers.set(key, rest);
    else providers.delete(key);
  };
}

export function analyzeProviders(): ReadonlyMap<string, AnalyzeProvider[]> {
  return providers;
}

/**
 * The reading for a subject: no state, no reading. Providers of the exact address run first, then those
 * of the bare source; their lines are concatenated. A provider that throws is skipped.
 */
export function readingFor(subject: Subject, env: AnalyzeEnv): Reading | null {
  const knowledge = buildKnowledge(env.state, env.settings);
  const lines: string[] = [];
  const keys = subject.address === subject.source ? [subject.address] : [subject.address, subject.source];
  let needsCampaign = false;
  for (const key of keys) {
    for (const provider of providers.get(key) ?? []) {
      if (!env.state && !stateless.has(provider)) {
        needsCampaign = true; // a pinned panel can outlive its campaign (chat switch): say why the reading is gone
        continue;
      }
      try {
        const reading = provider(subject, env, knowledge);
        if (reading) lines.push(...reading.lines);
      } catch (e) {
        console.warn(`analyze provider "${key}" failed`, e);
      }
    }
  }
  if (lines.length === 0 && needsCampaign) return { lines: ['No campaign loaded.'] };
  return lines.length > 0 ? { lines } : null;
}
