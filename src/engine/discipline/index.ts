import type { Registries } from '../../content/types';

export { impunityBand, impunityOf, leverageOf, type ImpunityTerms } from './impunity';
export { disciplineDayStep } from './dayStep';
export {
  addRecord, applyDisciplineEvent, captureInverse, decayRecords, disciplineOf, dropDefiance, enforce, forgetUnit, holdDefiance, lapseThreat,
  recordOf, registerThreat, settleDefiance,
} from './record';

/** The words an extracted `measure` may take: every punishment id, plus `leash` and `unspecified` (neither is a registry id). */
export const measureList = (reg: Registries): string[] => [...reg.punishments.keys(), 'leash', 'unspecified'];
export { addRestriction, dutySlot, expireRestrictions, removeRestrictions, restrictionReason, type RestrictionUse } from './restrictions';
export { gearFault, GEAR_FAULT_LOG, isCovert, queueSabotage, sabotageDayStep } from './sabotage';
export { acquaintanceDays, inAcquaintance } from './acquaintance';
export { commandStance, stanceEntry, type CommandStance } from './stance';
