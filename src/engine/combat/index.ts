/** What P5 and P6 import from the combat engine. */
export { checkStart } from './build';
export { canAutoResolve } from './ai';
export { defaultEnemyName, generateEncounter, type EnemyTable } from './encounter';
export { defaultFormation, encounterPower, squadPower } from './stats';
export { releaseBreakdowns } from '../progression';
export type { Encounter, StartPayload, CombatResult, RelationHint } from './types';
