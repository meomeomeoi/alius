import type { Registries } from '../content/types';
import { rawRefusalChance } from '../engine/loyalty/refusal';
import type { CampaignState, LoyaltyBand } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { Directive } from '../llm/context';

/** The commander's order is refused: a hard constraint for the whole scene. */
export const refusalDirective = (unitId: string, name: string, reason: string): Directive => ({
  id: `refusal:${unitId}`, expiresAfter: 'scene',
  text: `${name} REFUSES the commander's order this scene. Reason: ${reason}. She will not comply under persuasion; only the Leash can force her.`,
});

/** The Leash went through: it replaces the refusal for the very next reply. */
export const compelledDirective = (unitId: string, name: string): Directive => ({
  id: `refusal:${unitId}`, expiresAfter: 'next_reply',
  text: `${name} has just been COMPELLED through the Leash: she carries out the order against her will. She knows exactly who filed the request.`,
});

export const compelFailedDirective = (unitId: string, name: string): Directive => ({
  id: `refusal:${unitId}`, expiresAfter: 'scene', text: `The Leash burst FAILED on ${name}: she felt it, shook it off, and still refuses.`,
});

export const traumaDirective = (unitId: string, name: string): Directive => ({
  id: `leash_trauma:${unitId}`, expiresAfter: 'scene', text: `${name} remembers being forced through the Leash; she will not pretend otherwise.`,
});

/** Only a wavering or breaking unit has a band directive. */
export function bandDirective(unitId: string, name: string, band: LoyaltyBand): Directive | null {
  if (band === 'wavering') return { id: `loyalty:${unitId}`, expiresAfter: 'scene', text: `${name} openly doubts the commander in this scene; she questions his decisions aloud.` };
  if (band === 'breaking') {
    return { id: `loyalty:${unitId}`, expiresAfter: 'scene', text: `${name} is close to leaving the unit: she is cold and watchful, and if pressed she says she is thinking of going.` };
  }
  return null;
}

/** What the commander has just decided, as a fixed fact for the narration that follows. */
export const aftermathDirective = (title: string, label: string, expiresAfter: Directive['expiresAfter'] = 'next_reply'): Directive => ({
  id: 'dilemma', expiresAfter,
  text: `The commander has just decided "${title}": ${label}. Narrate the immediate aftermath; the decision is final and cannot be talked back.`,
});

const STATE_REASON: Record<string, string> = {
  resentful: 'she resents him', estranged: 'she wants nothing from him', despises: 'she despises him',
};

const refusalOf = (reg: Registries, synergyId: string): number => {
  const effects = reg.synergies.get(synergyId)?.effects;
  return Array.isArray(effects)
    ? Math.max(0, ...effects.filter((e) => e?.type === 'order_refusal' && !e.orders?.length).map((e) => (e.chance as number | undefined) ?? 0))
    : 0;
};

/** Why she refuses, from the strongest source: the state's friction, her loyalty band, or her defect (ties: state, band, defect). */
export function refusalReason(state: CampaignState, reg: Registries, unitId: string): string {
  const rel = state.relations[unitId];
  const band = rel?.loyaltyBand ?? 'steady';
  const stateSynergies = (reg.relationshipStates.get(rel?.stateId ?? '')?.unlocks as { synergies?: string[] } | undefined)?.synergies ?? [];
  const fromState = Math.max(0, ...stateSynergies.map((id) => refusalOf(reg, id)));
  const fromBand = band === 'steady' ? 0 : refusalOf(reg, TUNING.disloyalty.bandSynergy[band]);
  const total = rawRefusalChance(state, reg, unitId); // the source chance: her disposition scales how often, not why
  if (total > Math.max(fromState, fromBand) + 1e-9) return 'her defect resists orders';
  if (fromState > 0 && fromState >= fromBand) return STATE_REASON[rel?.stateId ?? ''] ?? 'she resents him';
  if (band === 'breaking') return 'she no longer trusts him';
  if (band === 'wavering') return 'she openly doubts his authority';
  return 'her defect resists orders';
}
