import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { consumeSlots } from '../calendar';
import { handicapOf, sparringBout } from '../combat/sparring';
import { addBodyXp, bodyGrowthMult } from '../commander/profile';
import { disciplineOf } from '../discipline';
import { answerDemand, grantProblem } from '../discipline/demands';
import { addRecord } from '../discipline/record';
import { impunityOf } from '../discipline/impunity';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { pushMessage } from '../dms';
import { addFact } from '../memory';
import { assertiveness } from '../power/options';
import type { CampaignState, Wager } from '../state/types';
import { TUNING } from '../tuning';
import { deviceGateReason } from './access';
import { book, bookingGuard, bookingKindsFor } from './bookings';
import { hitHer } from './events';
import { pressureGate, pressureMultOf } from './gates';
import { nextPersonalId, personalOf, unitObeys } from './state';
import { giveToken, removeTokenQuietly, wearToken } from './tokens';

const unitOf = (state: CampaignState, id: string) => state.squad.find((u) => u.id === id);
const openOf = (state: Pick<CampaignState, 'personal'>): Wager[] => state.personal?.wagers?.open ?? [];
const HANDS = ['rock', 'paper', 'scissors'] as const;

/** The game kinds the engine plays. */
export const PLAYABLE_KINDS: Set<string> = new Set(['coin', 'rps', 'high_card', 'sparring', 'expedition_bet']);

/** What she may bet happens on a run. */
export const BET_PICKS = ['kills', 'no_damage', 'objective'] as const;

/** The status a wager has once it is agreed: a bet waits for the run, every other game is played now. */
const agreedStatus = (reg: Registries, gameId: string): Wager['status'] => (reg.wagerGames.get(gameId)?.kind === 'expedition_bet' ? 'pending_run' : 'accepted');

/** Checks the pick a game needs (a handicap she allows, a bet on kills, no damage or the objective); throws when it is missing or illegal. */
function checkPick(state: CampaignState, reg: Registries, gameId: string, unitId: string, pick: string | undefined): void {
  const kind = reg.wagerGames.get(gameId)?.kind;
  if (kind === 'sparring') {
    const h = pick === undefined ? undefined : handicapOf(reg, pick);
    if (!h) throw new Error('Choose a handicap.');
    if ((state.relations[unitId]?.affinity ?? -100) < h.minAffinity) throw new Error('Her Affinity does not allow that handicap.');
  } else if (kind === 'expedition_bet' && !(BET_PICKS as readonly string[]).includes(pick ?? '')) {
    throw new Error('Choose what she bets on: kills, no damage or the objective.');
  }
}

/** The games a challenge may name, in registry order. */
export const gamesOffered = (reg: Registries): Entry[] => [...reg.wagerGames.values()].filter((g) => PLAYABLE_KINDS.has(String(g.kind)));

/**
 * May this stake be offered to her: the category it is tagged with is on and not among her limits (`contentAllowed`), and what
 * it asks for is possible. `drop_demand` needs an open demand of hers that can be granted now; `token` a token she has given, or
 * one she could (the token gate, never given); `slot` her booking gate; `obedience` no obedience under way today; `question` none
 * waiting.
 */
export function stakeOffered(state: CampaignState, reg: Registries, unitId: string, stake: Entry): boolean {
  if (!contentAllowed(state, reg, stake, unitId)) return false;
  const p = state.personal;
  switch (stake.effect) {
    case 'drop_demand': {
      const demand = state.discipline?.demands.find((d) => d.unitId === unitId && d.status === 'open');
      return demand !== undefined && grantProblem(state, reg, demand.id) === null;
    }
    case 'token':
      return (p?.tokens?.owned ?? []).some((t) => t.giverId === unitId) || (!(p?.tokens?.given ?? []).includes(unitId) && pressureGate(state, reg, unitId, 'token') === null);
    case 'slot':
      return pressureGate(state, reg, unitId, 'booking') === null;
    case 'obedience':
      return p?.obedience === undefined || p.obedience.day !== state.day;
    case 'question':
      return p?.pendingQuestion === undefined && p?.truth === undefined;
    default:
      return true;
  }
}

/** The stakes that may be offered to her, in registry order. */
export const offeredStakes = (state: CampaignState, reg: Registries, unitId: string): Entry[] =>
  [...reg.wagerStakes.values()].filter((s) => stakeOffered(state, reg, unitId, s));

/**
 * The day step's roll of her challenge: each unit passing the `wager` gate with no open wager and at least one stake to offer
 * draws once at `0.03 × demandMult × pressureMult`; a hit draws a game and a stake and delivers it as her DM (ACCEPT or DECLINE).
 * Nothing is drawn while nobody is eligible.
 */
export function rollChallenges(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const games = gamesOffered(reg);
  const events: EngineEvent[] = [];
  if (games.length === 0) return events;
  for (const u of draft.squad) {
    if (u.kind !== 'named' || openOf(draft).some((w) => w.unitId === u.id) || unitObeys(draft, u.id) || pressureGate(draft, reg, u.id, 'wager') !== null) continue;
    const stakes = offeredStakes(draft, reg, u.id);
    if (stakes.length === 0) continue;
    if (!ctx.rng.chance(TUNING.personal.wager.chance * assertiveness(draft, reg).demandMult * pressureMultOf(draft, reg, u.id))) continue;
    const game = games[ctx.rng.int(0, games.length - 1)];
    const stake = stakes[ctx.rng.int(0, stakes.length - 1)];
    let pick: string | undefined;
    if (game.kind === 'sparring') {
      const allowed = (game.handicaps as Array<{ id: string; minAffinity: number }>).filter((h) => (draft.relations[u.id]?.affinity ?? -100) >= h.minAffinity);
      pick = allowed[ctx.rng.int(0, allowed.length - 1)]?.id;
    } else if (game.kind === 'expedition_bet') {
      pick = BET_PICKS[ctx.rng.int(0, BET_PICKS.length - 1)];
    }
    const dm = pushMessage(draft, u.id, {
      from: u.id, text: `${u.displayName} challenges the commander: ${String(game.label)}, for ${String(stake.text)}.`, day: draft.day, slot: draft.slot, read: false, initiated: true,
    });
    const w: Wager = { id: nextPersonalId(draft, 'wg'), unitId: u.id, by: 'unit', gameId: String(game.id), stakeId: String(stake.id), day: draft.day, status: 'offered', ...(pick !== undefined ? { pick } : {}), dmId: dm.id };
    ((personalOf(draft).wagers ??= { open: [], log: [] }).open).push(w);
    events.push({ type: 'wager_offered', wagerId: w.id, unitId: u.id, gameId: w.gameId, stakeId: w.stakeId });
  }
  return events;
}

/**
 * The commander challenges her (from the dossier). She must be a named soldier with an imported profile and a lead style; the
 * game and the stake must be offered. She accepts when her Affinity is at least 0 or her Impunity at least 40, else she refuses
 * (`wager_refused`, nothing else changes).
 */
export function challenge(draft: CampaignState, ctx: EngineCtx, p: { unitId: string; gameId: string; stakeId: string; pick?: string }): EngineEvent[] {
  const reg = ctx.registries;
  const why = deviceGateReason(draft, p.unitId);
  if (why !== null) throw new Error('She will not take a bet from the commander.');
  const game = gamesOffered(reg).find((g) => g.id === p.gameId);
  const stake = reg.wagerStakes.get(p.stakeId);
  if (!game) throw new Error('That game is not available.');
  if (!stake || !stakeOffered(draft, reg, p.unitId, stake)) throw new Error('She is not offered that stake.');
  if (openOf(draft).some((w) => w.unitId === p.unitId)) throw new Error('She already has a wager open.');
  checkPick(draft, reg, String(game.id), p.unitId, p.pick);
  const T = TUNING.personal.wager;
  if ((draft.relations[p.unitId]?.affinity ?? -100) < T.acceptAffinity && (impunityOf(draft, reg, p.unitId)?.value ?? 0) < T.acceptImpunity) {
    return [{ type: 'wager_refused', unitId: p.unitId }];
  }
  const w: Wager = { id: nextPersonalId(draft, 'wg'), unitId: p.unitId, by: 'commander', gameId: String(game.id), stakeId: String(stake.id), day: draft.day, status: agreedStatus(reg, String(game.id)), ...(p.pick !== undefined ? { pick: p.pick } : {}) };
  ((personalOf(draft).wagers ??= { open: [], log: [] }).open).push(w);
  return [{ type: 'wager_accepted', wagerId: w.id, unitId: p.unitId, by: 'commander', gameId: w.gameId, stakeId: w.stakeId }];
}

/** The commander answers her challenge: accept makes it playable; decline is `dismissed` (minor) on her (so is an expired one). */
export function answerChallenge(draft: CampaignState, ctx: EngineCtx, wagerId: string, accept: boolean, opts: { expired?: boolean } = {}): EngineEvent[] {
  const list = draft.personal?.wagers?.open;
  const w = list?.find((x) => x.id === wagerId);
  if (!list || !w || w.by !== 'unit' || w.status !== 'offered') throw new Error('That challenge is not open.');
  if (accept) {
    w.status = agreedStatus(ctx.registries, w.gameId);
    return [{ type: 'wager_accepted', wagerId, unitId: w.unitId, by: 'unit', gameId: w.gameId, stakeId: w.stakeId }];
  }
  draft.personal!.wagers!.open = list.filter((x) => x !== w);
  const events: EngineEvent[] = [{ type: 'wager_declined', wagerId, unitId: w.unitId, ...(opts.expired ? { expired: true } : {}) }];
  const u = unitOf(draft, w.unitId);
  if (u && isLiving(u)) events.push(...hitHer(draft, ctx.registries, w.unitId, 'dismissed', 'minor', 'declined her challenge'));
  return events;
}

type Winner = 'commander' | 'unit' | 'void';

/** The result of a game that is settled by the rng alone (details go into the event for the card). */
function playChance(kind: string, ctx: EngineCtx, pick?: string): { winner: Winner; details: Record<string, unknown> } {
  if (kind === 'coin') return { winner: ctx.rng.chance(0.5) ? 'commander' : 'unit', details: {} };
  if (kind === 'high_card') {
    const commanderCard = ctx.rng.int(1, 13);
    const herCard = ctx.rng.int(1, 13);
    return { winner: commanderCard === herCard ? 'void' : commanderCard > herCard ? 'commander' : 'unit', details: { commanderCard, herCard } };
  }
  const mine = HANDS.indexOf(pick as (typeof HANDS)[number]);
  if (mine < 0) throw new Error('Pick rock, paper or scissors.');
  const throws: Array<{ hers: string }> = [];
  for (let i = 0; i < 2; i++) {
    const hers = ctx.rng.int(0, 2);
    throws.push({ hers: HANDS[hers] });
    if (hers !== mine) return { winner: (mine - hers + 3) % 3 === 1 ? 'commander' : 'unit', details: { hand: HANDS[mine], throws } };
  }
  return { winner: 'void', details: { hand: HANDS[mine], throws } };
}

/**
 * Plays an accepted wager (`pick` is the commander's hand in rock-paper-scissors). The result is the rng's; no social stat tilts
 * a game. A void result applies nothing. The wager is logged and closed either way.
 */
export function playWager(draft: CampaignState, ctx: EngineCtx, wagerId: string, pick?: string): EngineEvent[] {
  const reg = ctx.registries;
  const wagers = draft.personal?.wagers;
  const w = wagers?.open.find((x) => x.id === wagerId);
  if (!wagers || !w || w.status !== 'accepted') throw new Error('That wager cannot be played now.');
  const game = reg.wagerGames.get(w.gameId);
  if (!game || !PLAYABLE_KINDS.has(String(game.kind))) throw new Error('That game is not available.');
  const u = unitOf(draft, w.unitId);
  if (!u || !isLiving(u)) throw new Error('She is not here to play.');
  if (game.kind === 'sparring') return playSparring(draft, ctx, w, pick ?? w.pick);
  const { winner, details } = playChance(String(game.kind), ctx, pick ?? w.pick);
  return settle(draft, ctx, w, winner, details);
}

/**
 * A sparring wager: one bout on the combat engine, a slot of the commander's time (never in the Night, never while a scene, a
 * decision, a knock or a booking holds it) and strength XP of half a session. The result is applied as any other.
 */
function playSparring(draft: CampaignState, ctx: EngineCtx, w: Wager, pick: string | undefined): EngineEvent[] {
  const reg = ctx.registries;
  if (draft.slot === 'night') throw new Error('Nobody spars at night.');
  if (draft.scene || draft.calendar.pendingScene || draft.calendar.nightEvent || draft.dilemmas?.open?.status === 'presented') throw new Error('Not now: something else holds this slot.');
  const due = bookingGuard(draft, { type: 'calendar/consume_slot' });
  if (due) throw new Error(due.message);
  checkPick(draft, reg, w.gameId, w.unitId, pick);
  const bout = sparringBout(draft, reg, ctx.rng, w.unitId, pick!);
  const xp = addBodyXp(draft.commander, 'strength', Math.round(TUNING.commander.bodyXpPerSession * TUNING.personal.sparring.bodyXp * bodyGrowthMult(draft, reg)));
  const events: EngineEvent[] = [{ type: 'body_trained', stat: 'strength', value: xp.value, raised: xp.gained }];
  events.push(...settle(draft, ctx, w, bout.winner, { handicap: pick, rounds: bout.rounds, ...(bout.draw ? { draw: true } : {}) }));
  events.push(...consumeSlots(draft, 1, ctx));
  return events;
}

/**
 * The end of a run (`endExpedition`, before the slots are spent): every bet of a unit who was in the party is settled. She bet it
 * happens: kills = at least `bet.killsNeeded` killing blows, no_damage = no hit taken, objective = the run's objective is done.
 */
export function resolveBets(draft: CampaignState, ctx: EngineCtx, _outcome: string): EngineEvent[] {
  const exp = draft.expedition;
  if (!exp) return [];
  const events: EngineEvent[] = [];
  for (const w of [...openOf(draft)]) {
    if (w.status !== 'pending_run' || !exp.party.includes(w.unitId)) continue;
    const t = exp.tally?.[w.unitId] ?? { kills: 0, hits: 0 };
    const happened = w.pick === 'kills' ? t.kills >= TUNING.personal.bet.killsNeeded : w.pick === 'no_damage' ? t.hits === 0 : exp.objectiveDone === true;
    events.push(...settle(draft, ctx, w, happened ? 'unit' : 'commander', { pick: w.pick, kills: t.kills, hits: t.hits }));
  }
  return events;
}

/** Closes a wager with its winner: logs it and, unless void, applies the stake for that winner. */
export function settle(draft: CampaignState, ctx: EngineCtx, w: Wager, winner: Winner, details: Record<string, unknown> = {}): EngineEvent[] {
  const wagers = draft.personal!.wagers!;
  wagers.open = wagers.open.filter((x) => x !== w);
  wagers.log.push({ id: w.id, unitId: w.unitId, gameId: w.gameId, stakeId: w.stakeId, day: w.day, winner });
  if (wagers.log.length > TUNING.personal.wager.logMax) wagers.log.splice(0, wagers.log.length - TUNING.personal.wager.logMax);
  const events: EngineEvent[] = [{ type: 'wager_resolved', wagerId: w.id, unitId: w.unitId, gameId: w.gameId, stakeId: w.stakeId, winner, ...details }];
  if (winner !== 'void') events.push(...applyStake(draft, ctx, w, winner, events[0]));
  return events;
}

/** A wager that was never played (a week old, or void for another reason): logged void, nothing applied. */
export function voidWager(draft: CampaignState, w: Wager): EngineEvent[] {
  const wagers = draft.personal!.wagers!;
  wagers.open = wagers.open.filter((x) => x !== w);
  wagers.log.push({ id: w.id, unitId: w.unitId, gameId: w.gameId, stakeId: w.stakeId, day: w.day, winner: 'void' });
  if (wagers.log.length > TUNING.personal.wager.logMax) wagers.log.splice(0, wagers.log.length - TUNING.personal.wager.logMax);
  return [{ type: 'wager_resolved', wagerId: w.id, unitId: w.unitId, gameId: w.gameId, stakeId: w.stakeId, winner: 'void', expired: true }];
}

/** Applies the stake of a won wager, for either winner (read by the stake's `effect`, never by id). */
export function applyStake(draft: CampaignState, ctx: EngineCtx, w: Wager, winner: 'commander' | 'unit', resolved?: EngineEvent): EngineEvent[] {
  const reg = ctx.registries;
  const stake = reg.wagerStakes.get(w.stakeId);
  const u = unitOf(draft, w.unitId);
  if (!stake || !u) return [];
  const p = personalOf(draft);
  const events: EngineEvent[] = [];
  const T = TUNING.personal.wager;
  switch (stake.effect) {
    case 'obedience':
      p.obedience = { unitId: u.id, day: draft.day, who: winner === 'unit' ? 'commander' : 'unit' };
      break;
    case 'slot': {
      if (winner === 'unit') {
        const kinds = bookingKindsFor(draft, reg, u.id);
        const kind = kinds.find((k) => k.slot === 'evening') ?? kinds[0];
        if (kind) events.push(...book(draft, ctx, { unitId: u.id, kindId: String(kind.id), day: draft.day + 1, slot: kind.slot as 'morning', source: 'wager' }));
      } else {
        (p.noBookUntil ??= {})[u.id] = draft.day + T.noBookDays;
      }
      break;
    }
    case 'privilege':
      events.push(...addRecord(draft, u.id, winner === 'unit' ? T.privilegeRecord : -T.privilegeRecord, 'wager'));
      break;
    case 'drop_demand': {
      const d = disciplineOf(draft);
      const demand = d.demands.find((x) => x.unitId === u.id && x.status === 'open');
      if (!demand) break;
      if (winner === 'unit' && grantProblem(draft, reg, demand.id) === null) {
        events.push(...answerDemand(draft, ctx, demand.id, 'grant'));
      } else {
        d.demands = d.demands.filter((x) => x !== demand); // dropped: no refusal, no grant, no deltas
        events.push({ type: 'demand_dropped', demandId: demand.id, unitId: u.id });
      }
      break;
    }
    case 'token': {
      const tokens = (p.tokens ??= { owned: [], given: [] });
      let token = tokens.owned.find((t) => t.giverId === u.id);
      if (!token && !tokens.given.includes(u.id)) {
        const g = giveToken(draft, ctx, u.id);
        token = g.token;
        events.push(...g.events);
      }
      if (winner === 'unit' && token) {
        if (!token.worn) {
          // make room by taking off the oldest token that is not locked (quietly: it was not the commander's choice)
          const worn = tokens.owned.filter((t) => t.worn && !(t.lockedUntil !== undefined && t.lockedUntil > draft.day));
          if (tokens.owned.filter((t) => t.worn).length >= TUNING.personal.token.maxWorn && worn[0]) removeTokenQuietly(worn[0]);
          if (tokens.owned.filter((t) => t.worn).length < TUNING.personal.token.maxWorn) events.push(...wearToken(draft, ctx, token.id));
        }
        if (token.worn) token.lockedUntil = draft.day + TUNING.personal.token.lockDays;
      }
      break;
    }
    case 'question':
      p.pendingQuestion = { wagerId: w.id, unitId: u.id, winner };
      if (resolved) resolved.question = winner === 'unit' ? 'commander_answers' : 'commander_asks';
      break;
    case 'mark':
      if (!contentAllowed(draft, reg, stake, u.id)) break;
      if (winner === 'unit') {
        p.mark = { unitId: u.id, untilDay: draft.day + T.markDays };
        events.push({ type: 'mark_set', unitId: u.id, untilDay: p.mark.untilDay });
      } else {
        const next = Math.min(100, u.stress + T.markLoseStress);
        if (next !== u.stress) events.push({ type: 'stress_changed', unitId: u.id, delta: next - u.stress });
        u.stress = next;
      }
      break;
  }
  return events;
}

const cleanText = (raw: unknown, max: number): string => {
  const text = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '';
  if (text.length < 1 || text.length > max) throw new Error(`Write 1 to ${max} characters.`);
  return text;
};

/**
 * The text of a won question wager. She won: the commander's answer becomes a fact about her, known by her. The commander won:
 * the commander's question becomes the truth order (`personal.truth`) she answers in her next scene or DM reply.
 */
export function answerQuestion(draft: CampaignState, _ctx: EngineCtx, wagerId: string, raw: unknown): EngineEvent[] {
  const pending = draft.personal?.pendingQuestion;
  if (!pending || pending.wagerId !== wagerId) throw new Error('There is no question waiting.');
  const text = cleanText(raw, TUNING.personal.wager.answerMax);
  const u = unitOf(draft, pending.unitId);
  if (!u || !isLiving(u)) throw new Error('She is not here to answer.');
  delete draft.personal!.pendingQuestion;
  if (pending.winner === 'unit') {
    addFact(draft, { about: [u.id, 'commander'], text: `The commander answered ${u.displayName}'s question: ${text}`, tags: ['wager', 'answer'], importance: 3, day: draft.day, knownBy: [u.id] });
    return [{ type: 'wager_question', wagerId, unitId: u.id, kind: 'answered' }];
  }
  draft.personal!.truth = { unitId: u.id, wagerId, question: text };
  return [{ type: 'wager_question', wagerId, unitId: u.id, kind: 'asked' }];
}

/** Her first reply to the truth order becomes a fact about her, known by her, and ends the order. */
export function recordAnswer(draft: CampaignState, _ctx: EngineCtx, unitId: string, raw: unknown): EngineEvent[] {
  const truth = draft.personal?.truth;
  if (!truth || truth.unitId !== unitId) throw new Error('She owes no answer.');
  const text = cleanText(typeof raw === 'string' ? raw.slice(0, TUNING.personal.wager.answerMax) : raw, TUNING.personal.wager.answerMax);
  const u = unitOf(draft, unitId);
  delete draft.personal!.truth;
  if (u) addFact(draft, { about: [unitId], text: `${u.displayName} told the commander, asked "${truth.question}": ${text}`, tags: ['wager', 'answer'], importance: 3, day: draft.day, knownBy: [unitId] });
  return [{ type: 'truth_told', unitId, wagerId: truth.wagerId }];
}

/** The day step's wager part: her challenge roll, then an offer older than `offerDays` is declined, a wager never played is void after a week and a mark runs out. */
export function wagerDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [...rollChallenges(draft, ctx)];
  for (const w of [...openOf(draft)]) {
    if (w.status === 'offered' && draft.day >= w.day + TUNING.personal.wager.offerDays) events.push(...answerChallenge(draft, ctx, w.id, false, { expired: true }));
    else if (w.status !== 'offered' && draft.day >= w.day + TUNING.personal.bet.voidDays) events.push(...voidWager(draft, w));
  }
  const mark = draft.personal?.mark;
  if (draft.personal?.obedience && draft.personal.obedience.day <= draft.day) delete draft.personal.obedience; // a day of obedience ends with its day
  if (mark && draft.day > mark.untilDay) {
    delete draft.personal!.mark;
    events.push({ type: 'mark_ended', unitId: mark.unitId });
  }
  return events;
}
