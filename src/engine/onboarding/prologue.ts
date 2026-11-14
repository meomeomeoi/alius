import { WIZARD_KINDS, type PrologueStep } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';

/** A prologue step with its id (the key it has in the entry's `steps`). */
export type StepWithId = PrologueStep & { id: string };

/** The prologue entry a start uses (the one whose `startId` matches), or `null`. */
export function prologueFor(reg: Registries, startId: string): Entry | null {
  for (const p of reg.prologues.values()) if (p.startId === startId) return p;
  return null;
}

/** The steps of a prologue in `order`. The schema guarantees every id in `order` has a step. */
export function stepsOf(entry: Entry): StepWithId[] {
  const steps = (entry.steps ?? {}) as Record<string, PrologueStep>;
  return ((entry.order ?? []) as string[]).filter((id) => id in steps).map((id) => ({ ...steps[id], id }));
}

/** Wizard steps (`paper_form`, `dossier`) are played before deployment, in memory; the rest live in the campaign. */
export const isWizardStep = (step: Pick<PrologueStep, 'kind'>): boolean => WIZARD_KINDS.includes(step.kind);
