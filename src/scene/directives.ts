import type { ProposalFailure } from '../engine/relations/graph';
import { SNAP_TEXT } from '../llm/calls/dmReply';
import type { Directive } from '../llm/context';

export type ProposalResult = { receptive: true } | { receptive: false; reason: ProposalFailure };

const REASON_TEXT: Record<ProposalFailure, string> = {
  too_soon: 'too soon',
  no_trust: 'she does not trust him enough',
  not_interested: 'she is not interested',
  committed: 'she is already committed',
  unavailable: 'it is not something she would consider',
};

/** What the engine decided about a proposal, as a hard constraint on the very next reply. */
export function proposalDirectiveText(unitName: string, kind: string, result: ProposalResult): string {
  const label = kind.replace(/_/g, ' ');
  if (result.receptive) return `${unitName} is receptive to the commander's proposal (${label}). Play her accepting it in her own way.`;
  return `${unitName} DECLINES the commander's proposal (${label}). Reason: ${REASON_TEXT[result.reason]}. She will not be talked into it this scene.`;
}

export const proposalDirective = (unitId: string, unitName: string, kind: string, result: ProposalResult): Directive => ({
  id: `proposal:${unitId}`, expiresAfter: 'next_reply', text: proposalDirectiveText(unitName, kind, result),
});

/** Frames a night scene: the unit came to the commander's door for a reason of her own. */
export const nightDirective = (unitName: string, framing: string): Directive => ({
  id: 'night', expiresAfter: 'scene',
  text: `It is night. ${framing} Open the scene with this moment: ${unitName} came for a reason of her own.`,
});

/** For DM replies: she is being spammed. */
export const snapDirective = (unitName: string): string => `${unitName}: ${SNAP_TEXT}`;
