import type { Registries } from '../../content/types';

export { impunityBand, impunityOf, leverageOf, type ImpunityTerms } from './impunity';
export {
  addRecord, applyDisciplineEvent, decayRecords, disciplineOf, dropDefiance, holdDefiance, recordOf, settleDefiance,
} from './record';

/** The words an extracted `measure` may take: every punishment id, plus `leash` and `unspecified` (neither is a registry id). */
export const measureList = (reg: Registries): string[] => [...reg.punishments.keys(), 'leash', 'unspecified'];
