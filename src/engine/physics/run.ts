/**
 * P15a: the run of a contact physics (plan R12): how it starts and ends, the tap (a signal inside the fiction) and the stop word (the
 * player's own, outside it). Nothing here draws: a run starts `held`, and `physics/next_segment` (Task 19) plans and starts each segment.
 * Importing this module registers what keeps a run in step with the blocking: it starts when a contact or an item with physics is set, ends
 * when its source goes, and ends when a switched-off category takes its source away.
 */
import type { Entry, Registries } from '../../content/types';
import { blockingLive, COMMANDER, contactOf, hasSource, registerAfterChange, removeSource, type BlockingChange } from '../blocking';
import { contentAllowed, registerWithdrawal } from '../bonds/content';
import type { EngineEvent } from '../dispatch';
import { sceneSettingsOf } from '../moments/settings';
import type { CampaignState, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveHoldsUntil, leadStyle, physicsStyleOf } from './style';
import { commanderSkill } from './skill';
import { type HoldsUntil, type Outcome, type PhysicsRun } from './state';
import type { Seal } from '../blocking/types';

export interface PhysicsRef { id: string; seal?: Seal[]; pressure?: number }
const SEAL_ORDER: Seal[] = ['leaky', 'firm', 'tight'];

/** The physics a contact or an item names, in order (the first is the run's main one). */
export function physicsOf(entry: Entry | undefined): PhysicsRef[] {
  return Array.isArray(entry?.physics) ? (entry!.physics as PhysicsRef[]) : [];
}

const sourceEntry = (reg: Registries, kind: 'contact' | 'item', id: string): Entry | undefined => (kind === 'contact' ? reg.blockingContacts.get(id) : reg.blockingItems.get(id));

/** The soldier a source belongs to: the other party of a contact, else the first soldier in the scene. */
function holderOf(state: CampaignState, kind: 'contact' | 'item', id: string): string | undefined {
  const scene = state.scene;
  if (!scene) return undefined;
  if (kind === 'contact') {
    for (const [key, rec] of Object.entries(scene.blocking ?? {})) {
      if (rec.contact?.id === id) {
        const other = key === COMMANDER ? rec.contact.with : key;
        if (scene.participants.includes(other)) return other;
      }
    }
  }
  return scene.participants[0];
}

/** The gauge a physics starts with, and the capacity it is measured against (a `skill` physics grows with the commander's endurance). */
function gaugeFor(state: CampaignState, phys: Entry): { gauge: number; capacity: number } {
  const level = phys.skill === true ? commanderSkill(state, String(phys.id)) : 0;
  const capacity = Math.round(100 * (1 + TUNING.physics.endurance.capacityPerLevel * level));
  const g = phys.gauge as { kind: string; start: number };
  return { capacity, gauge: g.kind === 'capacity' ? capacity : g.start };
}

export interface StartOptions {
  physicsId: string;
  sourceKind: 'contact' | 'item';
  sourceId: string;
  holderId: string;
  duration?: { hours: number } | 'unknown';
}

/** Why a run cannot start now, or `null`. */
export function whyNotStart(state: CampaignState, reg: Registries, o: StartOptions): string | null {
  const scene = state.scene;
  if (!scene) return 'No scene is open.';
  if (!blockingLive(state, reg)) return 'The blocking is not live in this scene.';
  if (scene.physics) return 'A contact physics is running already.';
  const phys = reg.contactPhysics.get(o.physicsId);
  if (!phys) return `Unknown physics "${o.physicsId}".`;
  if (!scene.participants.includes(o.holderId)) return `${o.holderId} is not in the scene.`;
  if (!hasSource(scene, o.sourceKind, o.sourceId)) return `Nothing in the scene is "${o.sourceId}".`;
  if (!physicsOf(sourceEntry(reg, o.sourceKind, o.sourceId)).some((p) => p.id === o.physicsId)) return `"${o.sourceId}" has no ${o.physicsId} physics.`;
  if (!sceneSettingsOf(state).physicsInteractions[phys.interaction as keyof ReturnType<typeof sceneSettingsOf>['physicsInteractions']]) return 'That kind of interaction is switched off.';
  if (!contentAllowed(state, reg, phys) || !contentAllowed(state, reg, phys, o.holderId)) return 'That is not available here.';
  return null;
}

/**
 * Starts the run: it is `held` (nothing drains) until `physics/next_segment` starts the first segment. Throws with the reason when a gate
 * refuses. Draws nothing.
 */
export function startPhysics(draft: CampaignState, ctx: { registries: Registries }, o: StartOptions): EngineEvent[] {
  const reg = ctx.registries;
  const why = whyNotStart(draft, reg, o);
  if (why !== null) throw new Error(why);
  const scene = draft.scene!;
  const phys = reg.contactPhysics.get(o.physicsId)!;
  const ref = physicsOf(sourceEntry(reg, o.sourceKind, o.sourceId)).find((p) => p.id === o.physicsId)!;
  const range = ref.seal ? [...ref.seal].sort((a, b) => SEAL_ORDER.indexOf(a) - SEAL_ORDER.indexOf(b)) : undefined;
  const lead = leadStyle(physicsStyleOf(draft, o.holderId)).seal;
  const seal = range ? range[lead === 'loosest' ? 0 : lead === 'tightest' ? range.length - 1 : Math.floor(range.length / 2)] : undefined;
  scene.physicsCount = (scene.physicsCount ?? 0) + 1;
  const run: PhysicsRun = {
    id: `p${scene.physicsCount}`, physicsId: o.physicsId, sourceKind: o.sourceKind, sourceId: o.sourceId, holderId: o.holderId,
    ...gaugeFor(draft, phys), ...(range ? { sealRange: range } : {}), ...(seal ? { seal } : {}), ...(ref.pressure !== undefined ? { pressure: ref.pressure } : {}),
    segment: { n: 0, state: 'held' }, startedExchange: scene.exchanges, taps: 0, streak: 0, extend: 0,
    ...(o.duration !== undefined ? { duration: o.duration } : {}),
  };
  scene.physics = run;
  return [{ type: 'physics_started', runId: run.id, physicsId: run.physicsId, holderId: run.holderId, sourceKind: run.sourceKind, sourceId: run.sourceId, ...(o.duration !== undefined ? { duration: o.duration } : {}) }];
}

/** Ends the run with a result and takes its contact or item out of the scene (the hold is over). Nothing when no run is open. */
export function stopPhysics(draft: CampaignState, _reg: Registries, result: Outcome): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!draft.scene || !run) return [];
  delete draft.scene.physics;
  removeSource(draft, run.sourceKind, run.sourceId);
  return [{ type: 'physics_outcome', runId: run.id, physicsId: run.physicsId, holderId: run.holderId, result, segments: run.segment.n, sourceKind: run.sourceKind, sourceId: run.sourceId }];
}

/** The tap (the signal inside the fiction): what it does is what she holds the commander until. */
export function physicsSignal(draft: CampaignState, ctx: { registries: Registries }): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!draft.scene || !run) throw new Error('physics/signal: no contact physics is running');
  const holds = effectiveHoldsUntil(draft, ctx.registries, run.holderId);
  const base = { type: 'physics_signal', runId: run.id, holderId: run.holderId, holdsUntil: holds };
  if (holds === 'blackout' || (holds === 'limit' && run.taps === 0)) {
    run.taps += 1;
    return [{ ...base, released: false, ignored: true }];
  }
  return [{ ...base, released: true, ignored: false }, ...stopPhysics(draft, ctx.registries, 'released')];
}

/**
 * The stop word (the player's own, out of the fiction): ends the run and takes the contact or the item away, whatever she holds the commander
 * until, mid-segment or held, during a marathon. With no run it ends the commander's contact all the same; with nothing to stop it is refused.
 */
export function stopWord(draft: CampaignState, ctx: { registries: Registries }): EngineEvent[] {
  const scene = draft.scene;
  if (!scene) throw new Error('physics/stop_word: no scene is open');
  if (scene.physics) return stopPhysics(draft, ctx.registries, 'stopped');
  const contact = contactOf(scene);
  if (!contact) throw new Error('physics/stop_word: there is nothing to stop');
  removeSource(draft, 'contact', contact.id);
  return [{ type: 'physics_outcome', runId: null, physicsId: null, holderId: contact.with === COMMANDER ? scene.participants[0] ?? null : contact.with, result: 'stopped', segments: 0, sourceKind: 'contact', sourceId: contact.id }];
}

/** What fraction of the gauge is left (1 = untouched, 0 = spent). A cleaning or her own task has no such end: 1. */
export function remainingOf(reg: Registries, run: PhysicsRun): number {
  const kind = (reg.contactPhysics.get(run.physicsId)?.gauge as { kind: string } | undefined)?.kind;
  if (kind === 'capacity') return Math.max(0, run.gauge / run.capacity);
  if (kind === 'fill') return Math.max(0, 1 - run.gauge / run.capacity);
  return 1;
}

export type Release = 'continue' | 'release' | 'limit_broken' | 'collapse' | 'blackout';

/**
 * Whether the run ends at a boundary by what she holds the commander until: a spent gauge is a blackout for a blackout holder, a broken limit
 * for a limit holder and a collapse for a signal holder; short of that she lets go at 15 % (signal) or 5 % (limit). A blackout holder
 * goes on to zero.
 */
export function releaseCheck(state: CampaignState, reg: Registries, run: PhysicsRun): Release {
  const left = remainingOf(reg, run);
  const holds: HoldsUntil = effectiveHoldsUntil(state, reg, run.holderId);
  if (left <= 0) return holds === 'blackout' ? 'blackout' : holds === 'limit' ? 'limit_broken' : 'collapse';
  if (holds === 'signal' && left <= TUNING.physics.releaseAt.signal) return 'release';
  if (holds === 'limit' && left <= TUNING.physics.releaseAt.limit) return 'release';
  return 'continue';
}

// ---------------------------------------------------------------------------------------------
// keeping the run in step with the blocking

const gone = (scene: SceneRecord | undefined, run: PhysicsRun): boolean => !hasSource(scene, run.sourceKind, run.sourceId);

registerAfterChange((draft: CampaignState, reg: Registries, change: BlockingChange): EngineEvent[] => {
  const events: EngineEvent[] = [];
  const run = draft.scene?.physics;
  if (run && gone(draft.scene, run)) events.push(...stopPhysics(draft, reg, 'released'));
  if ((change.field !== 'contact' && change.field !== 'worn') || change.value === undefined || draft.scene?.physics) return events;
  const kind = change.field === 'contact' ? 'contact' : 'item';
  const main = physicsOf(sourceEntry(reg, kind, change.value))[0];
  const holder = holderOf(draft, kind, change.value);
  if (main && holder && whyNotStart(draft, reg, { physicsId: main.id, sourceKind: kind, sourceId: change.value, holderId: holder }) === null) {
    events.push(...startPhysics(draft, { registries: reg }, { physicsId: main.id, sourceKind: kind, sourceId: change.value, holderId: holder }));
  }
  return events;
});

// a switched-off category ends the run whose source (or physics) it tags, or whose source is already gone (order-independent of `stripTagged`)
registerWithdrawal((draft: CampaignState, reg: Registries, removed: string[]): EngineEvent[] => {
  const run = draft.scene?.physics;
  if (!run) return [];
  const tags = (e: Entry | undefined): string[] => (Array.isArray(e?.contentTags) ? (e!.contentTags as string[]) : []);
  const hit = [...tags(sourceEntry(reg, run.sourceKind, run.sourceId)), ...tags(reg.contactPhysics.get(run.physicsId))].some((t) => removed.includes(t));
  return hit || gone(draft.scene, run) ? stopPhysics(draft, reg, 'stopped') : [];
});
