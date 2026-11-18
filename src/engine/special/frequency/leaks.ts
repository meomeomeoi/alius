import type { Registries } from '../../../content/types';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { hasTraitEffect } from '../../commander/traits';
import type { CampaignState, Severity } from '../../state/types';
import { TUNING } from '../../tuning';
import { NONE } from './candidates';
import { frequencyOf } from './intercepts';
import { interceptGist } from './fragments';

/** An intercepted item the model may be told about: an id, the unit it is about and its gist in words (true or false alike). */
export interface LeakCandidate { id: string; unitId: string; gist: string }

/** Her suspicion 0–100. Engine only: it never reaches a panel, an event or a reading. */
export const suspicionOf = (state: CampaignState, unitId: string): number => state.special?.frequency?.suspicion[unitId] ?? 0;

/** The strongest `frequencySense` among her defects (a number 1…2; none = 1). Read by field, never by defect id. */
export function frequencySenseOf(state: CampaignState, reg: Registries, unitId: string): number {
  const unit = state.squad.find((u) => u.id === unitId);
  return Math.max(1, ...(unit?.defects ?? []).map((d) => Number(reg.defects.get(d.id)?.frequencySense ?? 1)));
}

/** Is the item something the commander can know anyway (a fact now known, a demand already delivered, a secret already found)? */
function isPublic(state: CampaignState, x: { kind: string; value: string; refId?: string }): boolean {
  if (x.kind === 'fact') {
    if (x.value === NONE) return false;
    const f = state.memory.facts.find((y) => y.id === x.refId);
    return f === undefined || f.hiddenFromCommander !== true || f.knownBy.includes('*');
  }
  if (x.kind === 'demand') {
    if (x.value === NONE) return false;
    const d = state.discipline?.demands.find((y) => y.id === x.refId);
    return d === undefined || d.status !== 'undelivered';
  }
  if (x.kind === 'secret') {
    if (x.value === NONE) return false;
    const sx = state.personal?.secrets?.find((y) => y.id === x.refId);
    return sx === undefined || sx.status !== 'kept';
  }
  return false;
}

/**
 * The intercepted items `intent_extract` may be told about: the frequency is on and unburned, the item is about a present unit
 * who does not already know, is from the last 14 days and is not something the commander can know anyway. No rng.
 */
export function leakCandidates(state: CampaignState, reg: Registries, unitIds: string[]): LeakCandidate[] {
  if (!hasTraitEffect(state, reg, 'frequency')) return [];
  const f = state.special?.frequency;
  if (!f || f.burnedDay !== undefined) return [];
  return f.intercepts
    .filter((x) => unitIds.includes(x.unitId) && state.day - x.day <= TUNING.special.frequency.leakDays
      && state.relations[x.unitId]?.flags.includes('knows_frequency') !== true && !isPublic(state, x))
    .map((x) => ({ id: x.id, unitId: x.unitId, gist: interceptGist(state, reg, x) }));
}

/** What a scene or DM reading adds to its input: `{ intercepted }` when there are items, nothing at all otherwise (the input stays as it was). */
export function leakInput(state: CampaignState, reg: Registries, unitIds: string[]): { intercepted?: LeakCandidate[] } {
  const items = leakCandidates(state, reg, unitIds);
  return items.length > 0 ? { intercepted: items } : {};
}

const GAIN: Record<Severity, number> = { minor: 15, moderate: 25, major: 35, extreme: 35 };

/**
 * `static` crossing: above 50, a unit with a sense defect is armed once; going back to 50 or less arms it again. The event names only
 * the unit. Without a registry the caller can only disarm (decay).
 */
function syncStatic(state: CampaignState, reg: Registries | null, unitId: string): EngineEvent[] {
  const f = state.special?.frequency;
  if (!f) return [];
  const fired = (f.staticFired ??= []);
  if (suspicionOf(state, unitId) <= TUNING.special.frequency.staticAbove) {
    f.staticFired = fired.filter((id) => id !== unitId);
    return [];
  }
  if (reg === null || fired.includes(unitId) || !(frequencySenseOf(state, reg, unitId) > 1)) return [];
  fired.push(unitId);
  return [{ type: 'frequency_static', unitId }];
}

/**
 * The commander used something only the frequency could have told her. Her suspicion rises by 15 / 25 / 35 for minor / moderate /
 * major (extreme counts as major), halved when the item was false (her puzzlement still counts, so suspicion never betrays truth),
 * multiplied by her `frequencySense`, capped at 100. Nothing happens for an unknown item, one about someone else, a burned implant
 * or a campaign without the trait. No rng; the event of a crossing names only the unit.
 */
export function frequencyLeak(draft: CampaignState, ctx: EngineCtx, unitId: string, itemId: string, severity: Severity): EngineEvent[] {
  const reg = ctx.registries;
  if (!hasTraitEffect(draft, reg, 'frequency')) return [];
  const f = frequencyOf(draft);
  const x = f.intercepts.find((y) => y.id === itemId && y.unitId === unitId);
  if (!x || f.burnedDay !== undefined) return [];
  const gain = Math.round(GAIN[severity] * (x.true ? 1 : TUNING.special.frequency.falseLeakMult) * frequencySenseOf(draft, reg, unitId));
  f.suspicion[unitId] = Math.min(100, suspicionOf(draft, unitId) + gain);
  return syncStatic(draft, reg, unitId);
}

/** The day step: every suspicion falls by 2 (to 0, where the entry goes), after burning too. */
export function decayFrequency(draft: CampaignState): void {
  const f = draft.special?.frequency;
  if (!f) return;
  for (const id of Object.keys(f.suspicion)) {
    const next = f.suspicion[id] - TUNING.special.frequency.suspicionDecay;
    if (next <= 0) delete f.suspicion[id];
    else f.suspicion[id] = next;
    syncStatic(draft, null, id);
  }
  for (const id of f.staticFired ?? []) if (suspicionOf(draft, id) <= TUNING.special.frequency.staticAbove) syncStatic(draft, null, id);
}
