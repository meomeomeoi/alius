import type { WagerHandicap } from '../../content/schemas';
import type { Registries } from '../../content/types';
import { commanderProfile } from '../commander/profile';
import type { Rng } from '../rng';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { commanderMaxHp } from './crisis';
import { fireTrigger, makeCtx } from './effects';
import { spawnMutineer } from './spawn';
import { startRound, runUntilInput } from './turn';
import type { CombatState, Combatant, StartPayload } from './types';

/** The sparring handicap with this id (any sparring game's), or undefined. */
export function handicapOf(reg: Registries, id: string): WagerHandicap | undefined {
  for (const g of reg.wagerGames.values()) {
    if (g.kind !== 'sparring') continue;
    const h = (g.handicaps as WagerHandicap[] | undefined)?.find((x) => x.id === id);
    if (h) return h;
  }
  return undefined;
}

/**
 * The commander as a combatant in a bout (P9c §6): HP of a crisis, `atk 6 + 3·strength`, `def 4 + 2·endurance`,
 * `spd 6 + 2·reflexes`, `crit 5`, and one skill, a single-target basic attack. The commander has no role, items, synergies or
 * stress here: the body decides, so a weak commander really is weaker (principle P10).
 */
export function commanderSparrer(state: CampaignState, reg: Registries): Combatant {
  const body = commanderProfile(state).body;
  const maxHp = commanderMaxHp(state, reg);
  return {
    cid: 's1', side: 'squad', nameKey: state.commander.name, level: 1, row: 'front', index: 0,
    hp: maxHp, maxHp, base: { hp: maxHp, atk: 6 + 3 * body.strength, def: 4 + 2 * body.endurance, spd: 6 + 2 * body.reflexes, crit: 5 },
    stress: 0, statuses: [], mods: [], cooldowns: {}, skills: [TUNING.personal.sparring.commanderSkill], passives: [],
    downed: false, aiProfile: 'aggressive', usedLimits: [],
  };
}

export interface BoutResult {
  winner: 'commander' | 'unit';
  rounds: number;
  /** Neither fell within the round limit: it goes to her. */
  draw?: true;
}

/**
 * One bout on the P4 engine: the commander (`commanderSparrer`) against her (`spawnMutineer`, her base stats multiplied by the
 * handicap), AUTO, until somebody is down or `maxRounds` rounds have passed (a draw goes to her). The whole fight runs on a
 * scratch copy of the state: nothing is stored, no combat is opened, only `rng` advances. Throws when the handicap does not exist
 * or her Affinity does not allow it.
 */
export function sparringBout(state: CampaignState, reg: Registries, rng: Rng, unitId: string, handicapId: string): BoutResult {
  const handicap = handicapOf(reg, handicapId);
  if (!handicap) throw new Error('There is no such handicap.');
  const rel = state.relations[unitId];
  if (!rel || !state.squad.some((u) => u.id === unitId && u.kind === 'named')) throw new Error('She is not here to spar.');
  if (rel.affinity < handicap.minAffinity) throw new Error('Her Affinity does not allow that handicap.');
  const scratch = structuredClone(state);
  const cs: CombatState = {
    id: 'sparring', round: 0, phase: 'awaiting', cp: 0, timeline: [], turn: 0, combatants: [commanderSparrer(scratch, reg)],
    encounter: { enemies: [], mutineers: [{ unitId }], danger: 1 } as unknown as CombatState['encounter'],
    formation: { front: [], back: [] }, log: [], auto: true, allowRetry: false, expedition: false, bankLoot: false,
    start: { rng: rng.state, payload: {} as StartPayload }, ordersThisRound: [], pendingLootRolls: 0, hints: [], nextCid: 1,
  };
  const her = spawnMutineer(cs, scratch, reg, { unitId });
  if (!her) throw new Error('She has no room to spar.');
  const maxHp = Math.max(1, Math.round(her.maxHp * handicap.herHp));
  her.maxHp = maxHp;
  her.hp = maxHp;
  her.base = {
    ...her.base, hp: maxHp, atk: Math.max(1, Math.round(her.base.atk * handicap.herAtk)), spd: Math.max(1, Math.round(her.base.spd * handicap.herSpd)),
  };
  // the engine ends a combat at `combat.maxRounds`: start the count so that a bout lasts `sparring.maxRounds`
  cs.round = TUNING.combat.maxRounds - TUNING.personal.sparring.maxRounds;
  const first = cs.round;
  const ctx = makeCtx(cs, scratch, reg, rng);
  fireTrigger(ctx, 'onCombatStart', {});
  startRound(ctx);
  runUntilInput(ctx);
  const rounds = cs.round - first;
  if (cs.outcome === 'won') return { winner: 'commander', rounds };
  if (cs.outcome === 'lost') return { winner: 'unit', rounds };
  return { winner: 'unit', rounds, draw: true };
}
