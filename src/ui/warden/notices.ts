import type { Registries } from '../../content/types';
import type { EngineEvent } from '../../engine/dispatch';
import type { CampaignState } from '../../engine/state/types';
import { wardenOf } from '../../engine/warden';

/**
 * The corporate-voice notices of the warden's moves (P13 §6). Every text is AUTHOR TO WRITE and gives the commander no pronoun. A notice
 * names what happened and never why in numbers: not a chance, not a hidden value.
 */
export interface WardenNotice { kind: 'info' | 'warn'; title: string; text: string; /** A major moment the app draws as a cut-in too. */ cutIn?: boolean }

export function wardenNotice(e: EngineEvent, state: CampaignState, reg: Registries): WardenNotice | null {
  const name = (): string => {
    const id = wardenOf(state)?.unitId;
    return state.squad.find((u) => u.id === id)?.displayName ?? 'The warden';
  };
  switch (e.type) {
    case 'warden_warning':
      return e.level === 2
        ? { kind: 'warn', title: 'FINAL WARNING', text: `AUTHOR TO WRITE: ${name()} gives the final warning. Open defiance is on the record, and the controller is in her hand.`, cutIn: true }
        : { kind: 'warn', title: 'WARNING', text: `AUTHOR TO WRITE: ${name()} warns the commander. Open defiance is on the record.`, cutIn: true };
    case 'commander_punished': {
      const entry = reg.commanderPunishments.get(String(e.punishmentId));
      return { kind: 'warn', title: 'WARDEN', text: `AUTHOR TO WRITE: ${String(entry?.label ?? 'A punishment')}. ${String(entry?.description ?? '')}`.trim() };
    }
    case 'commander_leashed':
      return e.kind === 'suppress'
        ? { kind: 'warn', title: 'THE LEASH', text: 'AUTHOR TO WRITE: The controller is used. The rest of the day is lost.' }
        : { kind: 'warn', title: 'THE LEASH', text: 'AUTHOR TO WRITE: The controller is used. The next choice is not the commander\'s own.' };
    case 'leash_cosign_denied':
      return { kind: 'info', title: 'WARDEN', text: `AUTHOR TO WRITE: ${name()} denies the request. Nothing was spent.` };
    case 'remote_control_started':
      return { kind: 'warn', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: The controller is now run from the corporate annex. Quota and obedience, no negotiation, until the investigation closes.', cutIn: true };
    case 'verdict':
      return e.outcome === 'cleared'
        ? { kind: 'info', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: The investigation is closed. The commander is cleared and remains under watch.' }
        : { kind: 'warn', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: The investigation is closed. The commander is convicted.', cutIn: true };
    case 'commander_terminated':
      return { kind: 'warn', title: 'THE CONTROLLER', text: 'AUTHOR TO WRITE: The controller is triggered. The commander is dead.', cutIn: true };
    default:
      return null;
  }
}
