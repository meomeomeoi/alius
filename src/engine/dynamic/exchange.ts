/**
 * What a dynamic does outside the two of them (P15, plan R19, spec §15.5, §16.7): a holder's satisfaction, which steadies or unsettles her in a fight and the squad in
 * the days between; the protection her standing gives the commander before the other units' Impunity; and how fast her Want grows (her `drive`, her mood, her day).
 * Reads state and draws nothing: the noise on Want is hashed (`dynamicRoll`), the same on the same day. The three readers reach their layers through the registration
 * hooks `installDynamicHooks` calls (`registerCombatPassive`, `registerProtection`, `registerWantGrowth`), so those layers import nothing of the dynamic.
 */
import type { Registries } from '../../content/types';
import { wantBandOf } from '../bonds/want';
import type { EffectSpec } from '../combat/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { temperamentOf } from '../life/state';
import { standingOf } from '../power/standing';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { dynamicOn, holdersAtPlay } from './gate';
import { practiceOf } from './profile';
import { dynamicOf } from './state';
import { dynamicRoll } from './witness';

export type Satisfaction = 'content' | 'neutral' | 'frustrated';

/** Is she a holder the exchange reads: the dynamic is on and her frame is `play` or beyond. */
const holds = (state: CampaignState, reg: Registries, unitId: string): boolean => dynamicOn(state, reg) && holdersAtPlay(state).includes(unitId) && dynamicOf(state, unitId) !== undefined;

/**
 * How she stands with what the commander gives her (R19). `frustrated`: favour of -5 or less, a Want of aching or more, or a refusal of hers within 2 days. `content`: favour
 * of 5 or more with a Want no higher than restless. Anything else, and anyone who holds nothing, is `neutral`. A frustrated reading outranks a content one.
 */
export function satisfactionOf(state: CampaignState, reg: Registries, unitId: string): Satisfaction {
  const T = TUNING.exchange;
  if (!holds(state, reg, unitId)) return 'neutral';
  const dyn = dynamicOf(state, unitId)!;
  const want = wantBandOf(state, reg, unitId);
  const refused = dyn.refusals.some((day) => state.day - day <= T.refusalDays);
  if (dyn.favour <= -T.favourAt || want === 'aching' || want === 'desperate' || refused) return 'frustrated';
  return dyn.favour >= T.favourAt ? 'content' : 'neutral';
}

/**
 * The share of the other units' positive Impunity the commander is shielded from (R19): the strongest holder's standing x 0.3 %, at most 30 %. 0 with the dynamic off
 * and while nobody holds at `play` or beyond. Reads standings; draws nothing.
 */
export function protectionOf(state: CampaignState, reg: Registries): number {
  if (!dynamicOn(state, reg)) return 0;
  const T = TUNING.exchange.protection;
  let best = 0;
  for (const id of holdersAtPlay(state)) best = Math.max(best, standingOf(state, reg, id) ?? 0);
  return Math.min(T.max, best * T.perStanding);
}

/** The protection `impunityOf` subtracts for this unit: the share above for anyone who is no holder herself (a holder's own Impunity is never shielded), else 0. */
export function protectionFor(state: CampaignState, reg: Registries, unitId: string): number {
  return holds(state, reg, unitId) ? 0 : protectionOf(state, reg);
}

/** Her combat form (R19, a hit chance does not exist, so the percent goes on damage): content `outgoing +5` / `incoming -5`, frustrated the reverse, else nothing. */
export function combatEffects(state: CampaignState, reg: Registries, unitId: string): EffectSpec[] {
  const mood = satisfactionOf(state, reg, unitId);
  if (mood === 'neutral') return [];
  const pct = TUNING.exchange.combatPct * (mood === 'content' ? 1 : -1);
  return [{ type: 'outgoing', pct }, { type: 'incoming', pct: -pct }];
}

/** Is the commander in another holder's booking today, has a rival been favoured over her today, or did the commander share a drill with another woman today (P16b): a day of jealousy (R19). */
function jealous(state: CampaignState, unitId: string): boolean {
  if (state.relations[unitId]?.history.some((h) => h.day === state.day && h.type === 'rival_favoured') === true) return true;
  if (Object.entries(state.relations).some(([id, r]) => id !== unitId && r.craft?.partnerDay === state.day)) return true;
  const others = holdersAtPlay(state).filter((id) => id !== unitId);
  return (state.personal?.bookings ?? []).some((b) => b.day === state.day && others.includes(b.unitId) && (b.status === 'booked' || b.status === 'played'));
}

/**
 * The factor on the growth of her Want (R19): her `drive` x a hashed noise (1 +/- 0.2, doubled when she is moody) x 1.3 on a day of jealousy or a content mood x 0.7 at stress 70 or more, while
 * injured or on a day she lost a run. 1 while the dynamic is off or she has no practice section. Draws nothing.
 */
export function wantGrowthMult(state: CampaignState, reg: Registries, unitId: string): number {
  if (!dynamicOn(state, reg) || practiceOf(state, reg, unitId) === null) return 1;
  const T = TUNING.exchange;
  const unit = state.squad.find((u) => u.id === unitId)!;
  const spread = T.noise * (temperamentOf(state, unitId).volatility === 'moody' ? T.moody : 1);
  let mult = T.drive[practiceOf(state, reg, unitId)!.drive] * (1 + (dynamicRoll(state, unitId, 'want') * 2 - 1) * spread);
  if (jealous(state, unitId) || satisfactionOf(state, reg, unitId) === 'content') mult *= T.lift;
  const lost = state.lastExpedition?.outcome === 'failed' && state.lastExpedition.day === state.day;
  if (unit.stress >= T.dragStress || unit.status === 'injured' || lost) mult *= T.drag;
  return mult;
}

/**
 * The squad half of the exchange (day step 12, R19): every 2 days each holder who is content takes 1 stress off the units whose Trust is 50 or more, and a frustrated one adds 1. A unit with
 * several holders gets the net. The holder's own stress is not touched. Draws nothing.
 */
export function exchangeDayStep(draft: CampaignState, reg: Registries): EngineEvent[] {
  const T = TUNING.exchange.stress;
  if (draft.day % T.every !== 0) return [];
  const mood = holdersAtPlay(draft).map((id) => ({ id, mood: satisfactionOf(draft, reg, id) })).filter((h) => h.mood !== 'neutral');
  if (mood.length === 0) return [];
  const events: EngineEvent[] = [];
  for (const unit of draft.squad) {
    if (unit.kind !== 'named' || !isLiving(unit) || (draft.relations[unit.id]?.trust ?? 0) < T.trust) continue;
    const delta = mood.filter((h) => h.id !== unit.id).reduce((sum, h) => sum + (h.mood === 'content' ? -T.step : T.step), 0);
    const next = Math.min(100, Math.max(0, unit.stress + delta));
    if (next === unit.stress) continue;
    events.push({ type: 'stress_changed', unitId: unit.id, delta: next - unit.stress });
    unit.stress = next;
  }
  return events;
}
