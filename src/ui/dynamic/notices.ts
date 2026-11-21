import type { EngineEvent } from '../../engine/dispatch';
import type { CampaignState } from '../../engine/state/types';

/**
 * The corporate-voice notices of oversight's inquiry into the commander's cancelled Leash requests (P15, plan R16). Every text is AUTHOR TO WRITE and
 * gives the commander no pronoun. A notice says what oversight did, never why in numbers: not the span, not the count, not the pick it made. The
 * first notices (the segments 3 and 5) name no one; the acts on a holder name her, since she is the one it happens to.
 */
export interface OversightNotice { kind: 'info' | 'warn'; title: string; text: string; /** A major moment the app draws as a cut-in too. */ cutIn?: boolean }

export function oversightNotice(e: EngineEvent, state: CampaignState): OversightNotice | null {
  if (e.type !== 'oversight_inquiry') return null;
  const name = (): string => state.squad.find((u) => u.id === e.unitId)?.displayName ?? 'The soldier';
  switch (e.stage) {
    case 'notice':
      return e.filled === 5
        ? { kind: 'warn', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: A formal inquiry into the commander\'s cancelled Leash requests is under way.', cutIn: true }
        : { kind: 'info', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: Oversight has noticed how many Leash requests from the commander\'s device were never filed.' };
    case 'reprimand':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: Oversight reprimands ${name()} for the requests held on the commander's device.` };
    case 'transfer_threat':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: Oversight threatens to transfer ${name()} unless the commander's Leash requests are released within the week.`, cutIn: true };
    case 'forced_leash':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: Oversight uses the controller on ${name()}. The Leash is theirs, not hers.`, cutIn: true };
    case 'reassigned':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: ${name()} is reassigned. She does not come back.`, cutIn: true };
    case 'lifted':
      return { kind: 'info', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: The threat of a transfer on ${name()} is withdrawn.` };
    default:
      return null;
  }
}
