import type { Registries } from '../../src/content/types';
import { expectationInput } from '../../src/engine/warden';
import type { CampaignState } from '../../src/engine/state/types';
import type { IntentExtractInput } from '../../src/llm/calls/intentExtract';

export { sanitizeIntentOutput } from '../../src/llm/calls/intentExtract';

/** The part of the extraction input the warden adds, for the participants given. */
export const getCallTypeInput = (s: CampaignState, reg: Registries, participants: string[]): Pick<IntentExtractInput, 'expectations'> => expectationInput(s, reg, participants);
