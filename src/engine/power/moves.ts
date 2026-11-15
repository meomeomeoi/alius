import type { Registries } from '../../content/types';
import { commanderProfile } from '../commander/profile';
import { addRecord } from '../discipline/record';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { socialRank } from '../social';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { changeLeader, standingOf } from './standing';
import { CO_COMMAND, leaderOf, powerOf } from './state';

/**
 * The commander's moves against the squad leader (P9b §3): ENDORSE her (second-in-command) or CHALLENGE her (a weighted roll on
 * a social or a body stat). Both are engine decisions; a challenge draws exactly one rng value.
 */

const namedLiving = (state: CampaignState) => state.squad.filter((u) => u.kind === 'named' && isLiving(u));

/** Makes the leader second-in-command: her Trust and Affinity rise, every other named unit's record rises, `co_command` is written. */
export function endorse(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const leader = leaderOf(draft);
  if (!leader) throw new Error('There is no squad leader to endorse.');
  const h = powerOf(draft).hierarchy!;
  if (h.endorsed) throw new Error(`${leader.displayName} is already second-in-command.`);
  h.endorsed = true;
  const events: EngineEvent[] = applyEventToUnit(draft, reg, leader.id, {
    type: 'leader_endorsed', actor: 'commander', targets: [leader.id], severity: 'major', evidence: 'made the squad leader second-in-command', confidence: 1,
  });
  const rel = draft.relations[leader.id];
  if (rel && !rel.flags.includes(CO_COMMAND)) rel.flags.push(CO_COMMAND);
  for (const u of namedLiving(draft)) {
    if (u.id !== leader.id) events.push(...addRecord(draft, u.id, TUNING.power.endorse.othersRecord, 'leader_endorsed'));
  }
  events.push(...evaluateAutomatic(draft, reg, leader.id));
  events.push({ type: 'leader_endorsed', unitId: leader.id });
  return events;
}

export const CHALLENGE_STATS = ['authority', 'empathy', 'strength', 'endurance', 'reflexes'] as const;
export type ChallengeStat = (typeof CHALLENGE_STATS)[number];

const isSocial = (stat: ChallengeStat): stat is 'authority' | 'empathy' => stat === 'authority' || stat === 'empathy';

/** Her rank for the comparison: `clamp(round(standing / 26), 1, 5)`. */
export function leaderRank(state: CampaignState, reg: Registries): number {
  const leader = leaderOf(state);
  const standing = leader ? standingOf(state, reg, leader.id) ?? 0 : 0;
  return Math.min(5, Math.max(1, Math.round(standing / TUNING.power.challenge.standingPerRank)));
}

/** `clamp(0.5 + 0.12 × (the commander's rank in that stat − her rank), 0.15, 0.85)`. */
export function challengeChance(state: CampaignState, reg: Registries, stat: ChallengeStat): number {
  const C = TUNING.power.challenge;
  const mine = isSocial(stat) ? socialRank(state, stat) : commanderProfile(state).body[stat];
  return Math.min(C.max, Math.max(C.min, C.base + C.perRank * (mine - leaderRank(state, reg))));
}

/** Days until the next challenge is allowed (0: now). */
export const challengeCooldown = (state: Pick<CampaignState, 'power' | 'day'>): number =>
  Math.max(0, (state.power?.hierarchy?.challengeCooldownUntil ?? 0) - state.day);

/**
 * The commander challenges the leader. Allowed with a leader, no cooldown and no open scene. One seeded roll decides it. A win
 * deposes her for 14 days (she loses leadership at once); a loss raises her standing for 14 days and every named unit's record
 * by 10. Either way the next challenge waits 14 days.
 */
export function challenge(draft: CampaignState, ctx: EngineCtx, stat: unknown): EngineEvent[] {
  const reg = ctx.registries;
  if (typeof stat !== 'string' || !(CHALLENGE_STATS as readonly string[]).includes(stat)) throw new Error('A challenge is made with authority, empathy, strength, endurance or reflexes.');
  const leader = leaderOf(draft);
  if (!leader) throw new Error('There is no squad leader to challenge.');
  if (draft.scene) throw new Error('Finish the open scene before challenging anyone.');
  const left = challengeCooldown(draft);
  if (left > 0) throw new Error(`The last challenge is too recent: ${left} days left.`);
  const C = TUNING.power.challenge;
  const chance = challengeChance(draft, reg, stat as ChallengeStat);
  const won = ctx.rng.chance(chance);
  const h = powerOf(draft).hierarchy!;
  h.challengeCooldownUntil = draft.day + C.cooldownDays;
  const events: EngineEvent[] = [{ type: 'challenge_resolved', unitId: leader.id, stat, chance, won }];
  if (won) {
    h.deposed = { unitId: leader.id, untilDay: draft.day + C.deposedDays };
    delete h.leaderId;
    events.push(...changeLeader(draft, reg, leader.id, undefined));
    events.push(...applyEventToUnit(draft, reg, leader.id, {
      type: 'challenge_won', actor: 'commander', targets: [leader.id], severity: 'moderate', evidence: 'won the challenge', confidence: 1,
    }));
    events.push(...addRecord(draft, leader.id, C.winRecord, 'challenge_won'));
  } else {
    h.standingBonus = { unitId: leader.id, amount: TUNING.power.standing.lostChallengeBonus, untilDay: draft.day + C.cooldownDays };
    events.push(...applyEventToUnit(draft, reg, leader.id, {
      type: 'challenge_lost', actor: 'commander', targets: [leader.id], severity: 'minor', evidence: 'lost the challenge', confidence: 1,
    }));
    for (const u of namedLiving(draft)) events.push(...addRecord(draft, u.id, C.lossRecord, 'challenge_lost'));
  }
  events.push(...evaluateAutomatic(draft, reg, leader.id));
  return events;
}
