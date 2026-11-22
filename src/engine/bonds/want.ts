import type { Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { intimacyOf } from '../relations/gain';
import type { CampaignState, SceneRecord, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { bondOf, bondTierOf, desireRank } from './profile';

/** How strong her unmet want is: below 40, below 70, below 90, 90 and above. */
export type WantBand = 'calm' | 'restless' | 'aching' | 'desperate';

const B = TUNING.bonds.want;

export const wantBand = (n: number): WantBand => (n >= B.bands.desperate ? 'desperate' : n >= B.bands.aching ? 'aching' : n >= B.bands.restless ? 'restless' : 'calm');

/** Her stored Want, 0 when none. */
export const wantOf = (state: Pick<CampaignState, 'relations'>, unitId: string): number => state.relations[unitId]?.want ?? 0;

/**
 * Does Want run for her? A named living unit with `desire ≥ medium`, romance on, and either a relationship state of the
 * romantic tier or Attraction ≥ 60 with an attachment that is not avoidant. Everyone else's Want only fades.
 */
export function wantEligible(state: CampaignState, reg: Registries, unitId: string): boolean {
  const unit = state.squad.find((u) => u.id === unitId);
  const rel = state.relations[unitId];
  const bond = unit ? bondOf(unit) : null;
  if (!unit || !rel || !bond || !isLiving(unit) || !intimacyOf(state).romance) return false;
  if (desireRank(bond.desire) < desireRank('medium')) return false;
  return bondTierOf(state, reg, unitId) === 'romantic' || (rel.attraction >= B.attractionMin && bond.attachment !== 'avoidant');
}

/** Her Want as the bands read it: 0 while Want does not run for her (romance off, a modest profile). */
export const effectiveWant = (state: CampaignState, reg: Registries, unitId: string): number => (wantEligible(state, reg, unitId) ? wantOf(state, unitId) : 0);

/** The band the effects read. */
export const wantBandOf = (state: CampaignState, reg: Registries, unitId: string): WantBand => wantBand(effectiveWant(state, reg, unitId));

/**
 * P15 (R19): the factor her `drive`, her mood and her day put on the growth of her Want. `exchange.ts` registers the reader (it reads the dynamic, which reads Want); with none
 * registered, or while the dynamic is off, the factor is 1 and Want grows as before.
 */
type GrowthReader = (state: CampaignState, reg: Registries, unitId: string) => number;
let growthReader: GrowthReader | null = null;
export function registerWantGrowth(reader: GrowthReader): void { growthReader = reader; }

/** What one day adds: the base of her desire × the factor of her attachment, rounded half up. */
export function wantRise(unit: Pick<Unit, 'kind' | 'bond'>): number {
  const bond = bondOf(unit);
  if (!bond || bond.desire === 'low') return 0;
  return Math.round(B.rise[bond.desire] * B.attachmentFactor[bond.attachment]);
}

/** Stores a Want value (a zero is not stored) and drops the crossing mark once it is below the breakdown band. */
function setWant(rel: CampaignState['relations'][string], value: number): void {
  const v = Math.min(B.max, Math.max(0, Math.round(value)));
  if (v === 0) delete rel.want;
  else rel.want = v;
  if (v < B.bands.desperate) delete rel.wantBreakDay;
}

/** Lowers her Want (never below 0). Emits `want_changed` when it moved. */
export function relieveWant(draft: CampaignState, unitId: string, amount: number, cause: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (!rel || (rel.want ?? 0) <= 0 || amount <= 0) return [];
  const from = rel.want!;
  setWant(rel, from - amount);
  return [{ type: 'want_changed', unitId, from, to: rel.want ?? 0, cause }];
}

/** Raises her Want (never past the maximum; P15's grief). Emits `want_changed` when it moved. Stored whether or not Want runs for her: it is read only while it does (`effectiveWant`). */
export function raiseWant(draft: CampaignState, unitId: string, amount: number, cause: string): EngineEvent[] {
  const rel = draft.relations[unitId];
  if (!rel || amount <= 0) return [];
  const from = rel.want ?? 0;
  setWant(rel, from + amount);
  return (rel.want ?? 0) === from ? [] : [{ type: 'want_changed', unitId, from, to: rel.want ?? 0, cause }];
}

/** A finished scene with her lowers it: intimate by 60, romantic by 25 (draft). The tone only exists in a scene with one partner. */
export function relieveAtSceneEnd(draft: CampaignState, scene: SceneRecord): EngineEvent[] {
  const unitId = scene.participants[0];
  if (!scene.tone || scene.participants.length !== 1 || unitId === undefined) return [];
  return relieveWant(draft, unitId, scene.tone === 'intimate' ? B.relief.intimateScene : B.relief.romanticScene, `scene_${scene.tone}`);
}

/**
 * The daily movement of Want: it rises for who is eligible, fades 5 a day for who is not (down to nothing), and from the
 * `aching` band costs 2 stress a day. A unit who is not living is skipped. Draws no rng.
 */
export function wantStep(draft: CampaignState, reg: Registries): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    const rel = draft.relations[unit.id];
    if (unit.kind !== 'named' || !rel || !isLiving(unit)) continue;
    const from = rel.want ?? 0;
    if (wantEligible(draft, reg, unit.id)) setWant(rel, from + wantRise(unit) * (growthReader?.(draft, reg, unit.id) ?? 1));
    else if (from > 0) setWant(rel, from - B.decayPerDay);
    else continue;
    if (wantEligible(draft, reg, unit.id) && wantBand(rel.want ?? 0) !== 'calm' && wantBand(rel.want ?? 0) !== 'restless') {
      const next = Math.min(100, unit.stress + B.stressPerDay);
      if (next !== unit.stress) events.push({ type: 'stress_changed', unitId: unit.id, delta: next - unit.stress });
      unit.stress = next;
    }
    if ((rel.want ?? 0) !== from) events.push({ type: 'want_changed', unitId: unit.id, from, to: rel.want ?? 0, cause: 'day' });
  }
  return events;
}

/** Is she in a breakdown that seizes command (read from her defect's `wantBreakdown.kind`, never from an id)? */
export function seizing(unit: Pick<Unit, 'breakdown'>, reg: Registries): boolean {
  const d = unit.breakdown ? reg.defects.get(unit.breakdown.defectId) : undefined;
  return (d?.wantBreakdown as { kind?: string } | undefined)?.kind === 'seize';
}
