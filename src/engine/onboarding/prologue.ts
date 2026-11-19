import { WIZARD_KINDS, type PrologueStep } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';

/** A prologue step with its id (the key it has in the entry's `steps`). */
export type StepWithId = PrologueStep & { id: string };

/**
 * The prologue entry a start uses (the one whose `startId` matches), or `null`. With a `mode` (P13) the entry for that mode is
 * preferred and the one without a mode is the fallback; without a mode only an entry without one is returned.
 */
export function prologueFor(reg: Registries, startId: string, mode?: 'leashswap'): Entry | null {
  let plain: Entry | null = null;
  for (const p of reg.prologues.values()) {
    if (p.startId !== startId) continue;
    if (p.mode === undefined) plain ??= p;
    else if (p.mode === mode) return p;
  }
  return plain;
}

/** The steps of a prologue in `order`. The schema guarantees every id in `order` has a step. */
export function stepsOf(entry: Entry): StepWithId[] {
  const steps = (entry.steps ?? {}) as Record<string, PrologueStep>;
  return ((entry.order ?? []) as string[]).filter((id) => id in steps).map((id) => ({ ...steps[id], id }));
}

/** Wizard steps (`paper_form`, `dossier`) are played before deployment, in memory; the rest live in the campaign. */
export const isWizardStep = (step: Pick<PrologueStep, 'kind'>): boolean => WIZARD_KINDS.includes(step.kind);
