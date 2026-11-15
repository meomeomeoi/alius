import type { Registries } from '../../content/types';
import { contentAllowed, type ContentHolder } from '../bonds/content';

export { impunityBand, impunityOf, leverageOf, type ImpunityTerms } from './impunity';
export { disciplineDayStep } from './dayStep';
export {
  addRecord, applyDisciplineEvent, captureInverse, decayRecords, disciplineOf, dropDefiance, enforce, forgetUnit, holdDefiance, lapseThreat,
  recordOf, registerThreat, settleDefiance,
} from './record';

/**
 * The words an extracted `measure` may take: every punishment id, plus `leash` and `unspecified` (neither is a registry id).
 * With a campaign (P9d), a punishment tagged with a category that is off is left out, so a dialogue measure naming it reads as
 * the `verbal` fallback.
 */
export const measureList = (reg: Registries, state?: ContentHolder): string[] => [
  ...[...reg.punishments.values()].filter((p) => state === undefined || contentAllowed(state, reg, p)).map((p) => String(p.id)), 'leash', 'unspecified',
];
export { activeRestrictions, addRestriction, dutySlot, expireRestrictions, removeRestrictions, restrictionReason, type RestrictionUse } from './restrictions';
export { gearFault, GEAR_FAULT_LOG, isCovert, queueSabotage, sabotageDayStep } from './sabotage';
export { acquaintanceDays, inAcquaintance } from './acquaintance';
export { commandStance, stanceEntry, type CommandStance } from './stance';
export { applyPunishment, checkPunish, perceptionOf, type PunishParams } from './punish';
export { canUndo, undoApplication, undoThreat } from './undo';
export { answerDemand, deliverDemand, demandChance, eligibleTemplates, grantProblem, openDemand, rollDemands } from './demands';
export { countDeed, deedsOf } from './deeds';
export { introduceNickname, patternHolds, patternScore, reputationDayStep } from './reputation';
