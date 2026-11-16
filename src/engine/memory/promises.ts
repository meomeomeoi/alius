import type { EventIntent, PromiseIntent } from '../relations/intents';
import type { CampaignState, PromiseRecord } from '../state/types';
import { nextId } from './facts';
import { TUNING } from '../tuning';

const words = (s: string): Set<string> => new Set(s.toLowerCase().match(/[a-z0-9]+/g) ?? []);
function jaccard(a: string, b: string): number {
  const x = words(a);
  const y = words(b);
  if (x.size === 0 || y.size === 0) return 0;
  let both = 0;
  for (const w of x) if (y.has(w)) both++;
  return both / (x.size + y.size - both);
}

/**
 * `made` opens a promise; `kept`/`broken` closes the open promise with the same parties that best matches the text
 * (word overlap ≥ 0.3, else the newest). A commander promise yields the `kept_promise`/`broke_promise` event the caller
 * should apply (unless the intent list already carried one for that unit).
 */
export function recordPromise(
  draft: CampaignState, p: PromiseIntent, day: number, knownBy?: string[],
): { event: EventIntent | null; record?: PromiseRecord } {
  const list = (draft.memory.promises ??= []);
  if (p.kind === 'made') {
    const record: PromiseRecord = { id: nextId(draft, 'p'), by: p.by, to: p.to, text: p.text, status: 'open', day, ...(knownBy ? { knownBy: [...knownBy] } : {}) };
    list.push(record);
    return { event: null, record };
  }
  const open = list.filter((x) => x.status === 'open' && x.by === p.by && x.to === p.to);
  if (open.length === 0) return { event: null };
  const matching = open.filter((x) => jaccard(x.text, p.text) >= 0.3).sort((a, b) => jaccard(b.text, p.text) - jaccard(a.text, p.text));
  const target = matching[0] ?? open[open.length - 1];
  target.status = p.kind === 'kept' ? 'kept' : 'broken';
  pruneClosedPromises(draft);
  if (p.by !== 'commander') return { event: null, record: target };
  const event: EventIntent = {
    type: p.kind === 'kept' ? 'kept_promise' : 'broke_promise', actor: 'commander', targets: [p.to], severity: 'moderate',
    evidence: target.text.split(/\s+/).slice(0, 20).join(' ') || 'a promise', confidence: 1,
  };
  return { event, record: target };
}

/** Closed promises are only history: keep the newest `closedPromisesMax`. */
function pruneClosedPromises(draft: CampaignState): void {
  const list = draft.memory.promises ?? [];
  const extra = list.filter((x) => x.status !== 'open').length - TUNING.memory.closedPromisesMax;
  if (extra <= 0) return;
  let drop = extra;
  draft.memory.promises = list.filter((x) => !(x.status !== 'open' && drop-- > 0));
}

/**
 * Open promises that involve any of these units and that every viewer heard (a promise without `knownBy` is visible to
 * all). Pass the present participants as `viewers` for anything that reaches a shared prompt.
 */
export function openPromises(state: CampaignState, unitIds: string[], viewers: string[] = []): PromiseRecord[] {
  return (state.memory.promises ?? []).filter(
    (p) => p.status === 'open' && (unitIds.includes(p.by) || unitIds.includes(p.to))
      && (!p.knownBy || p.knownBy.includes('*') || viewers.every((v) => p.knownBy!.includes(v))),
  );
}

