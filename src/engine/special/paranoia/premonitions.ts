import type { Registries } from '../../../content/types';
import type { EngineCtx, EngineEvent } from '../../dispatch';
import { hasTraitEffect } from '../../commander/traits';
import { commandStance, stanceAt } from '../../discipline/stance';
import { impunityOf } from '../../discipline/impunity';
import { isLiving } from '../../economy';
import { fnv1a } from '../../hub';
import { loyaltyOf } from '../../loyalty/state';
import { mayMutiny, mutinyRules, mutinySigns, mutinyTrigger } from '../../loyalty/mutiny';
import { bandShift } from '../../worldOptions';
import { dispositionById } from '../../worldOptions';
import { socialRank } from '../../social';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import { newParanoia, PREMONITION_ABOUT, specialOf, type ParanoiaState, type Premonition, type PremonitionAbout } from '../state';

const T = () => TUNING.special.paranoia;

/** The paranoia state, created on first use. */
export const paranoiaOf = (draft: CampaignState): ParanoiaState => (specialOf(draft).paranoia ??= newParanoia());

/** A premonition that is still open: not acted on and not past its last day. */
export function openPremonition(state: CampaignState, unitId: string): Premonition | undefined {
  return (state.special?.paranoia?.premonitions ?? []).find((p) => p.unitId === unitId && p.acted === undefined && p.expiresDay >= state.day);
}

/** How many days ahead a real precursor shows for her today: 1 or 2, by a hash (no draw). */
const leadDays = (unitId: string, day: number): number => (fnv1a(`${unitId}|${day}`) % T().leadDays) + 1;

/** What a ledger key moved by over the last `lookbackDays` days (today included). */
function ledgerSum(state: CampaignState, key: string): number {
  const since = state.day - (T().lookbackDays - 1);
  return (state.ledger ?? []).filter((e) => e.key === key && e.day >= since).reduce((n, e) => n + e.delta, 0);
}

/**
 * What the engine can already see coming for her, 1–2 days ahead (read by field, no draw):
 *  - `doubt`: her next doubt sign is due within the lead;
 *  - `desertion`: wavering, Trust within 5 of her breaking line and lower than two days ago;
 *  - `mutiny`: a mutiny can come from her state and she is one sign short, or something has set her off;
 *  - `defiance`: ten more Impunity would make her defy openly, and hers has been rising.
 */
export function realPrecursors(state: CampaignState, reg: Registries): Array<{ unitId: string; about: PremonitionAbout }> {
  const out: Array<{ unitId: string; about: PremonitionAbout }> = [];
  for (const u of state.squad) {
    if (u.kind !== 'named' || !isLiving(u)) continue;
    const rel = state.relations[u.id];
    if (!rel) continue;
    const rec = loyaltyOf(state, u.id);
    const lead = leadDays(u.id, state.day);
    if (rec?.nextDoubtDay !== undefined && rec.nextDoubtDay - state.day >= 1 && rec.nextDoubtDay - state.day <= lead) out.push({ unitId: u.id, about: 'doubt' });
    const breakingLine = TUNING.relations.loyalty.breakingEnter + bandShift(dispositionById(state, reg, u.id)).enter;
    if (rel.loyaltyBand === 'wavering' && rel.trust - breakingLine <= T().desertionMargin && ledgerSum(state, `axis:${u.id}:trust`) < 0) out.push({ unitId: u.id, about: 'desertion' });
    if (mayMutiny(state, reg, u.id) && (mutinySigns(state, u.id).length === mutinyRules(state, reg, u.id).minSigns - 1 || mutinyTrigger(state, u.id) !== null)) {
      out.push({ unitId: u.id, about: 'mutiny' });
    }
    const impunity = impunityOf(state, reg, u.id)?.value;
    if (impunity !== undefined && commandStance(state, reg, u.id) !== 'open_defiance' && stanceAt(rel.trust, impunity + T().defianceBump) === 'open_defiance'
      && ledgerSum(state, `record:${u.id}`) > 0) {
      out.push({ unitId: u.id, about: 'defiance' });
    }
  }
  return out;
}

/** The chance of a false alarm for a unit with no warning: 8 % less 2 % per Insight rank above 1, and 5 % more the day after a nightmare. */
export function falseAlarmChance(state: CampaignState): number {
  const nightmare = state.special?.paranoia?.lastNightmareDay === state.day - 1;
  return Math.max(0, T().falseBase - T().falsePerInsight * (socialRank(state, 'insight') - 1)) + (nightmare ? T().falseAfterNightmare : 0);
}

function write(draft: CampaignState, unitId: string, about: PremonitionAbout, real: boolean): EngineEvent {
  const p = paranoiaOf(draft);
  p.seq += 1;
  const x: Premonition = { id: `pm${p.seq}`, unitId, about, day: draft.day, expiresDay: draft.day + T().openDays, real };
  p.premonitions.push(x);
  return { type: 'premonition', unitId, premonitionId: x.id, about };
}

/**
 * The paranoia day step, after P6's loyalty step. A precursor the engine can see writes a real premonition (a real one replaces a
 * false one; a real one is never written twice); then each living named unit with no open warning draws once for a false alarm, which
 * is stored `real: false` and is identical in every event and panel. Old ones are dropped after two weeks. Nothing without the trait.
 */
export function paranoiaDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  if (!hasTraitEffect(draft, reg, 'paranoia')) return [];
  const p = paranoiaOf(draft);
  p.premonitions = p.premonitions.filter((x) => x.day >= draft.day - T().keepDays);
  if (p.preempt) p.preempt = p.preempt.filter((x) => x.untilDay >= draft.day);
  const events: EngineEvent[] = [];
  for (const { unitId, about } of realPrecursors(draft, reg)) {
    const open = openPremonition(draft, unitId);
    if (open?.real) continue;
    if (open) p.premonitions = p.premonitions.filter((x) => x !== open);
    events.push(write(draft, unitId, about, true));
  }
  const chance = falseAlarmChance(draft);
  for (const u of draft.squad) {
    if (u.kind !== 'named' || !isLiving(u) || openPremonition(draft, u.id)) continue;
    if (ctx.rng.chance(chance)) events.push(write(draft, u.id, ctx.rng.pick(PREMONITION_ABOUT), false));
  }
  return events;
}

/** The present units the commander has an open warning about (true or false alike: the model is never told which). */
export function warnedUnits(state: CampaignState, unitIds: string[]): string[] {
  return unitIds.filter((id) => openPremonition(state, id) !== undefined);
}

/** What a reading adds to its input: `{ warned }` when a present unit has an open warning, nothing at all otherwise (the input stays as it was). */
export function warnedInput(state: CampaignState, unitIds: string[]): { warned?: string[] } {
  const warned = warnedUnits(state, unitIds);
  return warned.length > 0 ? { warned } : {};
}
