import { COMMANDER, WORN_SLOTS, type StagingSnapshot } from '../../engine/blocking';
import type { CampaignState } from '../../engine/state/types';
import type { Subject } from '../subject';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';

/**
 * The live reading of the scene blocking (P15a): for a posture, a place, a contact, an item or an activity that is set in the open scene,
 * who has it and who set it (the game, a chip or the reading of the scene) and in which exchange. It reads only the open scene (the
 * staging log), never the vocabulary's numbers; an entry that is not set shows only its description. Nothing here is a number the
 * player may not see, and nothing names a feeling of the commander.
 */
const BY = { engine: 'the game', chip: 'a chip', reading: 'the reading of the scene' } as const;
const FIELD = { postures: 'posture', anchors: 'anchor', contacts: 'contact', items: 'worn', activities: 'activity' } as const;
const VERB: Record<string, string> = { posture: 'is in it', anchor: 'is there', contact: 'is in it', worn: 'wears it', activity: 'is doing it' };

type Kind = 'posture' | 'anchor' | 'contact' | 'worn' | 'activity';

/** Who holds this value in the open scene, in participant order, then the commander. */
function holders(state: CampaignState, kind: Kind, id: string): string[] {
  const blocking = state.scene?.blocking ?? {};
  const out: string[] = [];
  for (const person of [...(state.scene?.participants ?? []), COMMANDER]) {
    const b = blocking[person];
    if (!b) continue;
    const has =
      kind === 'posture' ? b.posture === id : kind === 'anchor' ? b.anchor?.id === id : kind === 'activity' ? b.activity === id
        : kind === 'contact' ? b.contact?.id === id : WORN_SLOTS.some((s) => b.worn?.[s]?.id === id);
    if (has) out.push(person);
  }
  return out;
}

/** The newest log entry that names this change, or `undefined` (the game set it when the scene began). */
function entryFor(state: CampaignState, kind: Kind, id: string, person: string): StagingSnapshot | undefined {
  const log = state.scene?.stagingLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i]!;
    if (e.field !== kind) continue;
    if (kind === 'posture' || kind === 'anchor' ? e.person === person && e.value === id : kind === 'activity' ? e.person === person && e.value === id : e.value === id) return e;
  }
  return undefined;
}

function reading(kind: Kind) {
  return (subject: Subject, env: AnalyzeEnv): { lines: string[] } | null => {
    const state = env.state;
    if (!state?.scene) return null;
    const who = holders(state, kind, subject.id);
    if (who.length === 0) return null;
    const name = (p: string): string => (p === COMMANDER ? 'the commander' : state.squad.find((u) => u.id === p)?.displayName ?? p);
    const parts = who.map((p) => {
      const e = entryFor(state, kind, subject.id, p);
      const how = e === undefined ? 'set by the game at the start' : `set by ${BY[e.source ?? 'engine']} in exchange ${e.exchange ?? 0}`;
      return `${name(p)} ${VERB[kind]}, ${how}`;
    });
    return { lines: [`In the scene: ${parts.join('; ')}.`] };
  };
}

/** Registers the P15a readings (called from `registerCoreProviders`). */
export function registerBlockingProviders(): void {
  registerAnalyzeProvider('blockingPostures', reading(FIELD.postures));
  registerAnalyzeProvider('blockingAnchors', reading(FIELD.anchors));
  registerAnalyzeProvider('blockingContacts', reading(FIELD.contacts));
  registerAnalyzeProvider('blockingItems', reading(FIELD.items));
  registerAnalyzeProvider('blockingActivities', reading(FIELD.activities));
}

