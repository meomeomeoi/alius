import type { Registries } from '../../content/types';
import type { EngineEvent } from '../../engine/dispatch';
import { aftermathRowOf } from '../../engine/dynamic/aftermath';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { DynamicMilestoneEntry } from '../../engine/dynamic/types';
import type { CampaignState } from '../../engine/state/types';
import { VOICE_OF, type Voice } from '../voice/sources';
import { unitAccent } from '../voice/voiceCard';

/**
 * The corporate-voice notices of oversight's inquiry into the commander's cancelled Leash requests (P15, plan R16). Every text is AUTHOR TO WRITE and
 * gives the commander no pronoun. A notice says what oversight did, never why in numbers: not the span, not the count, not the pick it made. The
 * first notices (the segments 3 and 5) name no one; the acts on a holder name her, since she is the one it happens to.
 */
export interface OversightNotice { kind: 'info' | 'warn'; title: string; text: string; /** A major moment the app draws as a cut-in too. */ cutIn?: boolean }

export function oversightNotice(e: EngineEvent, state: CampaignState): OversightNotice | null {
  if (e.type !== 'oversight_inquiry') return null;
  const name = (): string => state.squad.find((u) => u.id === e.unitId)?.displayName ?? 'The soldier';
  switch (e.stage) {
    case 'notice':
      return e.filled === 5
        ? { kind: 'warn', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: A formal inquiry into the commander\'s cancelled Leash requests is under way.', cutIn: true }
        : { kind: 'info', title: 'OVERSIGHT', text: 'AUTHOR TO WRITE: Oversight has noticed how many Leash requests from the commander\'s device were never filed.' };
    case 'reprimand':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: Oversight reprimands ${name()} for the requests held on the commander's device.` };
    case 'transfer_threat':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: Oversight threatens to transfer ${name()} unless the commander's Leash requests are released within the week.`, cutIn: true };
    case 'forced_leash':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: Oversight uses the controller on ${name()}. The Leash is theirs, not hers.`, cutIn: true };
    case 'reassigned':
      return { kind: 'warn', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: ${name()} is reassigned. She does not come back.`, cutIn: true };
    case 'lifted':
      return { kind: 'info', title: 'OVERSIGHT', text: `AUTHOR TO WRITE: The threat of a transfer on ${name()} is withdrawn.` };
    default:
      return null;
  }
}


/** A notice the app shows: a toast in `voice` (with her accent when it is hers) and, for a major moment, a cut-in. */
export interface DynamicNotice {
  kind: 'info' | 'warn';
  voice: Voice;
  title: string;
  text: string;
  /** Her accent (the personal voice); absent for the corporation's notices. */
  accent?: string;
  cutIn?: { kind: 'dynamic' | 'warden'; text: string };
}

/**
 * What the events of one dispatch say to the player (P15, plan R25): her notices (a frame that moved, an aftermath that began, a domain lost, a vow, a Leash request she
 * held, what she has on the commander and whom she told) in her voice, and oversight's inquiry in the corporation's. Pure: it reads the events and the state, never writes.
 * Shown in or out of immersive mode: `hidden` changes only the cut-in of a frame (its name is a band; she is named instead). The text of an aftermath is the notice of its first stage, never
 * its kind or a number; no notice names a fact, a value or a pronoun for the commander. Nothing while the dynamic is off.
 */
export function dynamicNotices(events: readonly EngineEvent[], state: CampaignState, reg: Registries, opts: { hidden?: boolean } = {}): DynamicNotice[] {
  if (!dynamicOn(state, reg)) return [];
  const name = (id: unknown): string => state.squad.find((u) => u.id === id)?.displayName ?? 'She';
  const hers = (unitId: unknown, kind: DynamicNotice['kind'], text: string, cutIn?: DynamicNotice['cutIn']): DynamicNotice => ({
    kind, voice: VOICE_OF.dynamic, title: name(unitId), text, accent: unitAccent(String(unitId)), ...(cutIn !== undefined ? { cutIn } : {}),
  });
  const out: DynamicNotice[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'frame_changed': {
        const text = reg.dynamicMilestones.get(String(e.milestoneId))?.text;
        if (typeof text !== 'string') break;
        out.push(hers(e.unitId, 'info', text.replaceAll('{name}', name(e.unitId)), {
          kind: 'dynamic', text: (opts.hidden === true ? name(e.unitId) : String(reg.dynamicFrames.get(String(e.to))?.label ?? name(e.unitId))).toUpperCase(),
        }));
        break;
      }
      case 'aftermath_started': {
        const stages = (aftermathRowOf(reg, e.kind as never)?.stages ?? []) as Array<{ notice: string }>;
        if (stages.length === 0) break;
        out.push(hers(e.unitId, e.forced === true ? 'warn' : 'info', stages[0].notice, { kind: 'dynamic', text: name(e.unitId).toUpperCase() }));
        break;
      }
      case 'domain_lost': {
        if (e.reason === 'exit') break; // the exit already said it
        const label = String(reg.dynamicDomains.get(String(e.domainId))?.label ?? 'a domain');
        const why = e.reason === 'contest' ? 'another has taken it' : e.reason === 'force' ? 'the commander has taken it back' : 'her place has slipped';
        out.push(hers(e.unitId, 'warn', `AUTHOR TO WRITE: ${name(e.unitId)} no longer holds ${label}: ${why}.`));
        break;
      }
      case 'sworn': {
        const vow = ([...reg.dynamicMilestones.values()] as unknown as DynamicMilestoneEntry[]).find((m) => m.sworn === true);
        out.push(hers(e.unitId, 'info', (vow?.text ?? 'AUTHOR TO WRITE: {name} has made a vow.').replaceAll('{name}', name(e.unitId)), { kind: 'dynamic', text: 'VOW' }));
        break;
      }
      case 'leash_blocked':
        out.push(hers(e.holderId, 'warn', `AUTHOR TO WRITE: ${name(e.holderId)} held the request and did not sign it. Nothing was spent.`)); // the chance she was given is hidden
        break;
      case 'compromat_revealed':
        out.push(hers(e.unitId, 'warn', `AUTHOR TO WRITE: ${name(e.unitId)} lets the commander know what she has.`)); // the fact is not named
        break;
      case 'compromat_told':
        out.push(hers(e.unitId, 'warn', `AUTHOR TO WRITE: ${name(e.unitId)} has told ${e.audience === 'outside' ? 'people outside the squad' : 'the squad'} what she has on the commander.`));
        break;
      default: {
        const n = oversightNotice(e, state);
        if (n !== null) out.push({ kind: n.kind, voice: VOICE_OF.warden_notice, title: n.title, text: n.text, ...(n.cutIn === true ? { cutIn: { kind: 'warden' as const, text: n.title } } : {}) });
      }
    }
  }
  return out;
}
