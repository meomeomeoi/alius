/**
 * What the craft drops when a unit leaves the squad for good (P16b, plan Task 22): called by `removeFromService`. A leaf: it imports only types, so the leash layer may call it. Her pair
 * book goes whole (`Relation.craft`: postures, rhythm, signals, records, the norms and the exam waiting, the praise log, the sentence, the cares), so the sentence's echo and the forced editor stop; the
 * bookings the programmes made for her (a `practice` booking with no hold or task of P16 behind it: the exam and the sessions) are cancelled with no cost to the commander; a posture hold that was
 * hers ends with no pay. The commander's own book (`Commander.craft`) is the commander's and stays. Draws nothing and changes no relation.
 */
import type { CampaignState } from '../state/types';

/** Does anything of the craft still point at her? */
export function holdsCraft(state: Pick<CampaignState, 'relations' | 'personal' | 'practices'>, unitId: string): boolean {
  return state.relations[unitId]?.craft !== undefined || state.practices?.postureRun?.holderId === unitId
    || (state.personal?.bookings ?? []).some((b) => b.unitId === unitId && b.status === 'booked' && b.source === 'practice' && b.practiceId === undefined);
}

export function forgetCraft(draft: CampaignState, unitId: string): void {
  if (!holdsCraft(draft, unitId)) return;
  const rel = draft.relations[unitId];
  if (rel !== undefined) delete rel.craft;
  const bookings = draft.personal?.bookings ?? [];
  const mine = bookings.filter((b) => b.unitId === unitId && b.status === 'booked' && b.source === 'practice' && b.practiceId === undefined);
  for (const b of mine) b.status = 'cancelled';
  for (const t of mine) { // the slot they left is no conflict any more (the personal layer's own rule, copied so this file stays a leaf)
    const same = bookings.filter((b) => b.status === 'booked' && b.day === t.day && b.slot === t.slot);
    for (const b of same) if (same.length > 1) b.conflict = true; else delete b.conflict;
  }
  if (draft.practices?.postureRun?.holderId === unitId) delete draft.practices.postureRun;
}
