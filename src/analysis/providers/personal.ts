import type { DeviceAccessBranch } from '../../content/schemas';
import { contentAllowed } from '../../engine/bonds/content';
import { impunityOf } from '../../engine/discipline/impunity';
import { sparringOdds } from '../../engine/combat/sparring';
import { bookingChance } from '../../engine/personal/bookings';
import { obedienceOf } from '../../engine/personal/state';
import { stakeOffered } from '../../engine/personal/wagers';
import { STAKE_WORDS } from '../../engine/personal/words';
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

// ---------------------------------------------------------------------------------------------
// Chunk (b): tokens, wagers, the day of obedience

/** The commander's chance in a game that has odds of its own, as a percentage (the rng-only games). */
const GAME_ODDS: Record<string, number> = { coin: 50, rps: 44, high_card: 46 };

const bandWord = (p: number): string => (p < 0.05 ? 'hopeless' : p < 0.25 ? 'a long shot' : p < 0.55 ? 'an even fight' : 'likely');

const HANDS_NAMES: Record<string, string> = { kills: 'she lands at least three killing blows', no_damage: 'she takes no damage', objective: 'the run\'s objective is done' };

/** One line per winner for the stake of an entry. */
function stakeLines(reg: AnalyzeEnv['registries'], stakeId: string): string[] {
  const stake = reg.wagerStakes.get(stakeId);
  const words = STAKE_WORDS[String(stake?.effect)];
  return words ? [`If she wins: ${words.she}.`, `If the commander wins: ${words.commander}.`] : [];
}

/** The odds line of a game: a band for sparring (measured), the percentage only through `Knowledge`. */
function oddsLine(state: NonNullable<AnalyzeEnv['state']>, reg: AnalyzeEnv['registries'], k: Knowledge, gameId: string, unitId: string, pick?: string): string | null {
  const kind = String(reg.wagerGames.get(gameId)?.kind);
  if (kind === 'sparring') {
    if (pick === undefined) return null;
    const odds = sparringOdds(state, reg, unitId, pick);
    const pct = k.raw(Math.round(odds * 100));
    return `The commander's chance in the bout: ${bandWord(odds)}${pct !== null ? ` (about ${pct} %)` : ''}.`;
  }
  const pct = GAME_ODDS[kind] !== undefined ? k.raw(GAME_ODDS[kind]) : null;
  return pct !== null ? `The commander wins about ${pct} % of the time.` : null;
}

/** A token (by id), or what a soldier has given. */
function tokenProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const tokenId = typeof subject.data.tokenId === 'string' ? subject.data.tokenId : null;
  const owned = state.personal?.tokens?.owned ?? [];
  const unitId = (tokenId !== null ? owned.find((t) => t.id === tokenId)?.giverId : undefined) ?? unitIdOf(subject);
  if (unitId === null || !state.squad.some((u) => u.id === unitId)) return null;
  const token = tokenId !== null ? owned.find((t) => t.id === tokenId) : owned.find((t) => t.giverId === unitId);
  const name = nameOf(state, unitId);
  if (!token) {
    const given = (state.personal?.tokens?.given ?? []).includes(unitId);
    return { lines: [given ? `${name} has given the commander a token.` : `${name} has not given a token: a close soldier gives one, once.`] };
  }
  const lines = [`${token.label}: ${token.worn ? 'worn' : 'kept, not worn'}.`];
  const gain = k.raw(TUNING.personal.token.giverAffinityPerDay);
  lines.push(token.worn
    ? `While worn it pleases ${name}${gain !== null ? ` (Affinity +${gain} a day)` : ''}; to take it off is to hurt her: it costs Affinity and stress.`
    : `Worn, it pleases ${name} a little every day; to take it off later costs her Affinity and stress.`);
  if (token.lockedUntil !== undefined && token.lockedUntil > state.day) lines.push(`It is locked until day ${token.lockedUntil}: to take it off early also breaks a promise.`);
  return { lines };
}

/** The kind of a token: who may give it. */
function tokenKindProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const kind = env.registries.tokenKinds.get(subject.id);
  if (!kind) return null;
  return { lines: [kind.minTier === 'romantic' ? 'Only a soldier in a romantic relationship with the commander gives this kind.' : 'A close or romantic soldier may give this kind.'] };
}

/** A wager (by id), or what a soldier has open. */
function wagerProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const reg = env.registries;
  const wagerId = typeof subject.data.wagerId === 'string' ? subject.data.wagerId : null;
  const open = state.personal?.wagers?.open ?? [];
  const w = wagerId !== null ? open.find((x) => x.id === wagerId) : open.find((x) => unitIdOf(subject) === null || x.unitId === unitIdOf(subject));
  const unitId = w?.unitId ?? unitIdOf(subject);
  if (unitId === null || !state.squad.some((u) => u.id === unitId)) return null;
  const name = nameOf(state, unitId);
  if (!w) return { lines: [`${name} has no wager open: a soldier with a will of her own may challenge the commander, and the commander may challenge her.`] };
  const game = reg.wagerGames.get(w.gameId);
  const stake = reg.wagerStakes.get(w.stakeId);
  const lines = [`${w.by === 'unit' ? `${name} challenged the commander` : `The commander challenged ${name}`}: ${String(game?.label ?? w.gameId)}, for ${String(stake?.text ?? w.stakeId)}.`, ...stakeLines(reg, w.stakeId)];
  if (game?.kind === 'expedition_bet' && w.pick !== undefined) lines.push(`She bets it happens: ${HANDS_NAMES[w.pick] ?? w.pick}. It waits for the next run with her.`);
  const odds = oddsLine(state, reg, k, w.gameId, unitId, w.pick);
  if (odds !== null) lines.push(odds);
  return { lines };
}

/** A game: how it is played, and its odds through `Knowledge`. */
function gameProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const game = env.registries.wagerGames.get(subject.id);
  if (!game) return null;
  const HOW: Record<string, string> = {
    coin: 'One toss; no skill is involved.', rps: 'The commander picks a hand and hers is thrown; a tie is thrown again once, and a second tie is void.',
    high_card: 'Each draws a card from one to thirteen; the higher wins and a tie is void.',
    sparring: 'A bout on the combat rules with a handicap she allows; it takes a slot and trains strength. A weak body really is weaker.',
    expedition_bet: 'She bets on the next run with her: killing blows, no damage taken or the objective. It is void after a week.',
  };
  const lines = [HOW[String(game.kind)] ?? ''];
  const pct = GAME_ODDS[String(game.kind)] !== undefined ? k.raw(GAME_ODDS[String(game.kind)]) : null;
  if (pct !== null) lines.push(`The commander wins about ${pct} % of the time.`);
  return { lines: lines.filter((l) => l !== '') };
}

/** A stake: what each winner gets, and whether it is offered to a soldier now. */
function stakeProvider(subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const stake = env.registries.wagerStakes.get(subject.id);
  const state = env.state;
  if (!stake || !state) return null;
  const lines = stakeLines(env.registries, subject.id);
  const unitId = unitIdOf(subject);
  if (unitId !== null && state.squad.some((u) => u.id === unitId)) {
    const name = nameOf(state, unitId);
    if (stakeOffered(state, env.registries, unitId, stake)) lines.push(`It is offered to ${name} now.`);
    else lines.push(contentAllowed(state, env.registries, stake, unitId)
      ? `It is not offered to ${name} now: what it asks for is not possible.`
      : `It is not offered to ${name}: its content category is switched off, or one of her own limits.`);
  }
  return { lines };
}

/** Who follows whom today. */
function obedienceProvider(_subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const o = obedienceOf(state);
  if (o === null) return { lines: ['No day of obedience is under way.'] };
  const name = nameOf(state, o.unitId);
  return {
    lines: o.who === 'commander'
      ? [`Today the commander follows ${name}'s choices outside combat: her pick is pre-selected, and choosing against it counts as overriding her (Trust and Affinity fall, her Impunity rises).`]
      : [`Today ${name} is under the commander's orders: she follows the commander's non-combat orders, refuses nothing and asks for nothing on her own.`],
  };
}

/** Registers the P9c readings (called from `registerCoreProviders`). */
export function registerPersonalProviders(): void {
  registerAnalyzeProvider('glossary:device_access', deviceAccessProvider);
  registerAnalyzeProvider('glossary:booking', bookingProvider);
  registerAnalyzeProvider('glossary:courtship', courtshipProvider);
  registerAnalyzeProvider('glossary:claimed', claimedProvider);
  registerAnalyzeProvider('deviceAccessRules', ruleProvider);
  registerAnalyzeProvider('bookingKinds', kindProvider);
  registerAnalyzeProvider('glossary:token', tokenProvider);
  registerAnalyzeProvider('glossary:wager', wagerProvider);
  registerAnalyzeProvider('glossary:obedience', obedienceProvider);
  registerAnalyzeProvider('tokenKinds', tokenKindProvider);
  registerAnalyzeProvider('wagerGames', gameProvider);
  registerAnalyzeProvider('wagerStakes', stakeProvider);
}
