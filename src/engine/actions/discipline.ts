import { registerDayEndStep } from '../calendar';
import { disciplineDayStep } from '../discipline/dayStep';

// Importing this module registers the P9 discipline actions and its day-end step. The step is registered after the loyalty
// step (`actions/loyalty`), so import this module after it.

registerDayEndStep('director_tick', disciplineDayStep);
