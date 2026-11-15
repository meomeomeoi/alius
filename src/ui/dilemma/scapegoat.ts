import { summarizeWorldEffect } from '../../analysis/effects';
import type { Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';

/** What the dilemma panel shows of a scapegoat case (P9b §5): who answers for the decision, who backed it and what each answer does. */
export interface ScapegoatView {
  subject: string;
  witnesses: string[];
  /** Per option index: the answer's slug (`take_blame`, `shift_blame`) and its effects in words, through `summarizeWorldEffect`. */
  options: Array<{ answer: string; lines: string[] }>;
}

/** `null` unless the open dilemma is a presented scapegoat case. The effects are authored content, so they are shown openly. */
export function scapegoatView(state: CampaignState, reg: Registries): ScapegoatView | null {
  const open = state.dilemmas?.open;
  if (!open || open.context !== 'scapegoat' || open.status !== 'presented' || !open.options) return null;
  const nameOf = (id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
  return {
    subject: open.subjectId !== undefined ? nameOf(open.subjectId) : 'Unknown',
    witnesses: (open.witnessIds ?? []).map(nameOf),
    options: open.options.map((o) => ({
      answer: o.id ?? '',
      lines: o.effects.map((fx) => summarizeWorldEffect(fx, reg)).filter((l): l is string => l !== null),
    })),
  };
}
