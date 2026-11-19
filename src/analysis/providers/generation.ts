import type { GenerationRecord } from '../../engine/state/types';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of a failed generation and of REROLL (P14). A record holds no hidden value (no prompt, no model text, only a reason and counts),
 * and a site's label is generic, so nothing here goes through `Knowledge`; the record's `detail` is still never shown (the debug list has it).
 */

type Reading = { lines: string[] } | null;

const WHAT: Record<string, string> = {
  refused: 'The model declined to answer. It is never retried on its own (it would refuse again): pick the other model in the menu or change what is asked.',
  truncated: 'The answer ran past its token budget and was cut off. Automatic retries raise the budget by half each time; the menu can raise it further.',
  timeout: 'The model did not answer in time. A slow model needs a longer timeout in SYS › Generation, not a bigger budget.',
  network: 'The connection failed before an answer came.',
  invalid_output: 'An answer came but did not fit the form the game needs, so nothing was applied.',
  empty: 'Nothing came back at all.',
  no_profile: 'No mechanic profile is selected, so the call was not made.',
};

const find = (env: AnalyzeEnv, id: unknown): GenerationRecord | undefined =>
  typeof id === 'string' ? env.state?.generations?.records.find((r) => r.id === id) : undefined;

function recordProvider(subject: Subject, env: AnalyzeEnv): Reading {
  const rec = find(env, subject.data.recordId);
  if (!rec) return null;
  const tries = `${rec.attempts} ${rec.attempts === 1 ? 'try' : 'tries'}`;
  if (rec.status === 'expired') {
    return { lines: [`The moment passed: ${rec.expiredWhy ?? 'it can no longer be retried'}.`, `It had ${tries}. It stays listed for the rest of the day and the next, then goes.`] };
  }
  const lines = [WHAT[rec.reason] ?? 'The call failed.', `${tries} so far, the last with a budget of ×${rec.budgetMult}.`];
  if (rec.fallbackApplied) lines.push('A plain version already stands in its place; a later answer replaces it where that is allowed.');
  lines.push('RETRY runs it again; the menu offers a bigger budget, the other model or giving it up.');
  return { lines };
}

function rerollProvider(subject: Subject): Reading {
  const reason = typeof subject.data.reason === 'string' ? subject.data.reason.slice(0, 200) : null;
  if (reason !== null) return { lines: [`Not available now: ${reason}`] };
  return { lines: ['Asks the model again for the result that was already given, and replaces it.'] };
}

export function registerGenerationProviders(): void {
  registerAnalyzeProvider('glossary:generation_failed', recordProvider);
  registerAnalyzeProvider('glossary:generation_reroll', rerollProvider, { stateless: true });
}
