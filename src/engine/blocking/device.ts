/**
 * P15a: the device out of reach. While the blocking is live and the commander bears a `device { lock: 'tabs' }` effect (paw mitts, a
 * smothering contact: busy hands or a covered face) the PDA is unavailable: every tab is locked and the scene says so.
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { personEffects } from './blocking';
import { blockingLive } from './gate';
import { COMMANDER } from './state';

export function deviceLocked(state: CampaignState, reg: Registries): boolean {
  return blockingLive(state, reg) && personEffects(state, reg, COMMANDER).some((e) => e.type === 'device' && e.lock === 'tabs');
}
