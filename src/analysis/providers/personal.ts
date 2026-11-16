import type { DeviceAccessBranch } from '../../content/schemas';
import { contentAllowed } from '../../engine/bonds/content';
import { impunityOf } from '../../engine/discipline/impunity';
import { bookingChance } from '../../engine/personal/bookings';
import { CAPABILITIES, deviceAccess, deviceAccessWhy } from '../../engine/personal/access';
import { HUMILIATION_TAG } from '../../engine/personal/courtship';
import { pressureGate } from '../../engine/personal/gates';
import { TUNING } from '../../engine/tuning';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of the personal pressure of individual soldiers (P9c). Words first: why she has the access she has, what a booking
 * costs to cancel and whether a claim can be refused. Her Impunity and the chance she books show only through `Knowledge`
 * (raw values on). Nothing here is stored or invented.
 */

const LEVEL_WORD = ['no access', 'decor', 'notes', 'calendar', 'messages'] as const;
const nameOf = (state: NonNullable<AnalyzeEnv['state']>, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
const unitIdOf = (subject: Subject): string | null => (typeof subject.data.unitId === 'string' ? subject.data.unitId : null);
const SLOT_WORD: Record<string, string> = { morning: 'morning', afternoon: 'afternoon', evening: 'evening', night: 'night' };

/** The conditions of the branch that holds, in words (never numbers). */
function branchWords(b: DeviceAccessBranch): string {
  const parts: string[] = [];
  if (b.tiers !== undefined) parts.push('the closeness of her relationship with the commander');
  if (b.states !== undefined) parts.push('the state of her relationship');
  if (b.minAffinity !== undefined) parts.push('her warmth toward the commander');
  if (b.minLeadRank !== undefined) parts.push('how much she takes the lead');
  if (b.minImpunity !== undefined) parts.push('how little she fears the commander\'s reaction');
  return parts.join(', ').replace(/, ([^,]*)$/, ' and $1');
}

/** One soldier's device access (why, what it allows), or who has some. */
function deviceAccessProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const unitId = unitIdOf(subject);
  if (unitId === null) {
    const holders = state.squad.filter((u) => u.kind === 'named').map((u) => ({ u, level: deviceAccess(state, env.registries, u.id) })).filter((x) => x.level > 0);
    return holders.length === 0 ? { lines: [] } : { lines: [`Soldiers with access: ${holders.map((x) => `${x.u.displayName} (${LEVEL_WORD[x.level]})`).join(', ')}.`] };
  }
  if (!state.squad.some((u) => u.id === unitId)) return null;
  const name = nameOf(state, unitId);
  const why = deviceAccessWhy(state, env.registries, unitId);
  if (!why) return { lines: [`${name} has no access to the commander's device.`] };
  const lines = [`${name}: level ${why.level} (${LEVEL_WORD[why.level]}).`, `It comes from ${branchWords(why.branch)}.`];
  lines.push(`She can: ${CAPABILITIES.slice(0, why.level).join(', ')}.`);
  const impunity = k.raw(impunityOf(state, env.registries, unitId)?.value ?? 0);
  if (impunity !== null && why.branch.minImpunity !== undefined) lines.push(`Impunity ${impunity}.`);
  return { lines };
}

/** A booking, or the next one of a soldier: who, when, what cancelling costs at her Impunity. */
function bookingProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const bookings = state.personal?.bookings ?? [];
  const bookingId = typeof subject.data.bookingId === 'string' ? subject.data.bookingId : null;
  const unitId = unitIdOf(subject);
  const booking = bookingId !== null ? bookings.find((b) => b.id === bookingId) : bookings.find((b) => b.status === 'booked' && (unitId === null || b.unitId === unitId));
  const who = booking?.unitId ?? unitId;
  if (who === null || !state.squad.some((u) => u.id === who)) return null;
  const name = nameOf(state, who);
  const lines: string[] = [];
  if (booking) {
    const kind = env.registries.bookingKinds.get(booking.kindId);
    lines.push(`${name} has booked the ${SLOT_WORD[booking.slot]} of day ${booking.day}: ${String(kind?.label ?? booking.kindId).toLowerCase()}.`);
    const high = (impunityOf(state, env.registries, who)?.value ?? 0) >= TUNING.impunity.stance.impunityHigh;
    lines.push(high
      ? 'Cancelling counts as a refused demand, and because she does not fear the commander\'s reaction it lands harder and she holds it as a defiance.'
      : 'Cancelling counts as a refused demand.');
    if (booking.source === 'wager') lines.push('It was won in a wager: cancelling it also breaks a promise.');
  } else {
    lines.push(deviceAccess(state, env.registries, who) >= 3
      ? `${name} has no booking now; she may book a slot of the commander's time.`
      : `${name} has no booking, and no access to the calendar to make one.`);
  }
  const chance = pressureGate(state, env.registries, who, 'booking') === null ? k.raw(Math.round(bookingChance(state, env.registries, who) * 100)) : null;
  if (chance !== null) lines.push(`She books about ${chance} % of days.`);
  return { lines };
}

/** Whether she courts the commander, and what that does. */
function courtshipProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  const unitId = unitIdOf(subject);
  if (!state || unitId === null || !state.squad.some((u) => u.id === unitId)) return null;
  const name = nameOf(state, unitId);
  return {
    lines: pressureGate(state, env.registries, unitId, 'courtship') === null
      ? [`${name} courts the commander: she writes and knocks twice as often, may propose the next step herself and may claim the commander in public.`]
      : [`${name} does not court the commander.`],
  };
}

/** Her latest claim and whether the commander can refuse her in public. */
function claimedProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  const unitId = unitIdOf(subject);
  if (!state || unitId === null || !state.squad.some((u) => u.id === unitId)) return null;
  const name = nameOf(state, unitId);
  const claim = [...(state.personal?.claims ?? [])].reverse().find((c) => c.unitId === unitId);
  if (!claim) return { lines: [`${name} has not claimed the commander in public.`] };
  const lines = [`${name} claimed the commander in public on day ${claim.day}${claim.refused ? ' and was refused in front of the squad' : ''}.`];
  lines.push(contentAllowed(state, env.registries, { contentTags: [HUMILIATION_TAG] }, unitId)
    ? 'The commander can refuse her in public, which hurts her badly.'
    : 'The commander cannot refuse her in public: that is switched off, or one of her own limits.');
  return { lines };
}

/** A device-access rule: how many soldiers hold its level or more. */
function ruleProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const rule = env.registries.deviceAccessRules.get(subject.id);
  if (!rule || !env.state) return null;
  const state = env.state;
  const n = state.squad.filter((u) => u.kind === 'named' && deviceAccess(state, env.registries, u.id) >= Number(rule.level)).length;
  const who = n === 0 ? 'No soldier has this level now.' : `${n} soldier${n === 1 ? ' has' : 's have'} this level or more now.`;
  return { lines: [`${String(rule.name)} (level ${String(rule.level)}): ${who}`] };
}

/** A booking kind: when and where it is played. */
function kindProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const kind = env.registries.bookingKinds.get(subject.id);
  if (!kind) return null;
  const place = String(env.registries.locations.get(String(kind.locationId))?.name ?? kind.locationId);
  const lines = [`Played in the ${SLOT_WORD[String(kind.slot)]} at ${place}.${kind.tier === 'romantic' ? ' Only for a romantic relationship.' : ''}`];
  const relief = k.raw(Number(kind.wantRelief));
  if (relief !== null) lines.push(`It lowers her want by ${relief}.`);
  return { lines };
}

/** Registers the P9c readings (called from `registerCoreProviders`). */
export function registerPersonalProviders(): void {
  registerAnalyzeProvider('glossary:device_access', deviceAccessProvider);
  registerAnalyzeProvider('glossary:booking', bookingProvider);
  registerAnalyzeProvider('glossary:courtship', courtshipProvider);
  registerAnalyzeProvider('glossary:claimed', claimedProvider);
  registerAnalyzeProvider('deviceAccessRules', ruleProvider);
  registerAnalyzeProvider('bookingKinds', kindProvider);
}
