import type { Registries } from '../content/types';
import { wantBandOf } from './bonds/want';
import { slotIndex } from './calendar';
import { stressBand } from './combat/stress';
import { isLiving } from './economy';
import type { CampaignState, LedgerEntry, Slot, Unit } from './state/types';
import { TUNING } from './tuning';

/**
 * The squad's biotelemetry (P10b §1), derived from state: nothing is stored and nothing is drawn. The corporate implants
 * report a pattern and two bands; the UI words them in illustrative texts, never as a number read from hidden state.
 * Ledger amounts are only triggers here, they never reach the result.
 */

export type VitalsPattern = 'steady' | 'elevated' | 'spiking' | 'flat' | 'erratic';
export type SpikeCause = 'combat' | 'conflict' | 'commander_near' | 'want';
export type HeartBand = 'low' | 'resting' | 'raised' | 'racing';
export type TempBand = 'cool' | 'normal' | 'warm' | 'fever';

export interface Vitals {
  unitId: string;
  pattern: VitalsPattern;
  heart: HeartBand;
  temp: TempBand;
  spikes: SpikeCause[];
  /** A flat unit's line broke in the current or the previous slot. */
  flicker: boolean;
}

const unitOf = (state: CampaignState, id: string): Unit | undefined => state.squad.find((u) => u.id === id);
const isInjured = (u: Unit): boolean => u.status === 'injured' || (u.injuryDays ?? 0) > 0;

/**
 * Does she keep an injury from the commander? A kept hidden-injury secret that names her (read by the kind's `source`, never
 * by id). Her VITALS then show no fever: the roster would show nothing either (P9c).
 */
export function hidesInjury(state: CampaignState, reg: Registries, unitId: string): boolean {
  return (state.personal?.secrets ?? []).some((x) => x.status === 'kept' && x.subjectId === unitId && reg.secretKinds.get(x.kindId)?.source === 'hidden_injury');
}

const isFlat = (reg: Registries, u: Unit): boolean => u.defects.some((d) => reg.defects.get(d.id)?.vitals === 'flat');

/** A trust or affinity drop of `TUNING.vitals.conflictDelta` or more, within `slots` slots of now (0 = this slot). */
export function conflictWithin(state: CampaignState, unitId: string, slots: number): boolean {
  const keys = new Set([`axis:${unitId}:trust`, `axis:${unitId}:affinity`]);
  const now = slotIndex(state.day, state.slot);
  return (state.ledger ?? []).some((e) => keys.has(e.key) && e.delta <= -TUNING.vitals.conflictDelta && now - slotIndex(e.day, e.slot) <= slots);
}

function spikesOf(state: CampaignState, reg: Registries, unitId: string): SpikeCause[] {
  const out: SpikeCause[] = [];
  const stressKey = `stress:${unitId}`;
  const ledger = state.ledger ?? [];
  if (ledger.some((e) => e.key === stressKey && e.day === state.day && e.delta > 0 && (e.action.startsWith('combat/') || e.action.startsWith('expedition/')))) out.push('combat');
  if (conflictWithin(state, unitId, 0)) out.push('conflict');
  if (state.scene?.participants.includes(unitId)) out.push('commander_near');
  const want = wantBandOf(state, reg, unitId);
  if (want === 'aching' || want === 'desperate') out.push('want');
  return out;
}

const isFlicker = (e: LedgerEntry, unitId: string): boolean =>
  (e.key === `axis:${unitId}:affinity` || e.key === `axis:${unitId}:attraction`) && e.delta >= TUNING.vitals.flickerDelta;

/** The logged moments of a flat unit's line breaking (7-day ledger), newest first, one per slot, at most `TUNING.vitals.flickerLog`. */
export function flickersOf(state: CampaignState, unitId: string): Array<{ day: number; slot: Slot }> {
  const seen = new Map<number, { day: number; slot: Slot }>();
  for (const e of state.ledger ?? []) if (isFlicker(e, unitId)) seen.set(slotIndex(e.day, e.slot), { day: e.day, slot: e.slot });
  return [...seen.entries()].sort((a, b) => b[0] - a[0]).slice(0, TUNING.vitals.flickerLog).map(([, at]) => at);
}

/** `null` for a grunt, a unit who is gone or one that does not exist. */
export function vitalsOf(state: CampaignState, reg: Registries, unitId: string): Vitals | null {
  const unit = unitOf(state, unitId);
  if (!unit || unit.kind !== 'named' || !isLiving(unit)) return null;
  const spikes = spikesOf(state, reg, unitId);
  const band = stressBand(unit.stress);
  const flat = isFlat(reg, unit);
  const pattern: VitalsPattern = unit.breakdown !== undefined || band === 'breaking' || band === 'breakdown' ? 'erratic'
    : flat ? 'flat'
    : spikes.length > 0 ? 'spiking'
    : band === 'strained' ? 'elevated'
    : 'steady';
  const heart: HeartBand = { steady: 'resting', elevated: 'raised', spiking: 'racing', erratic: 'racing', flat: 'low' }[pattern] as HeartBand;
  const temp: TempBand = isInjured(unit) && !hidesInjury(state, reg, unitId) ? 'fever'
    : pattern === 'spiking' && (spikes.includes('want') || spikes.includes('commander_near')) ? 'warm'
    : pattern === 'flat' ? 'cool'
    : 'normal';
  const now = slotIndex(state.day, state.slot);
  const flicker = pattern === 'flat' && (state.ledger ?? []).some((e) => isFlicker(e, unitId) && now - slotIndex(e.day, e.slot) <= 1);
  return { unitId, pattern, heart, temp, spikes, flicker };
}
