import { registerDayEndStep } from '../calendar';
import { personalDayStep } from '../personal/dayStep';

// Importing this module registers the P9c personal day step. It runs after the comms night roll and the bonds step on
// `dm_rumors`, so import it after `./comms` and `./bonds`.

registerDayEndStep('dm_rumors', personalDayStep);
