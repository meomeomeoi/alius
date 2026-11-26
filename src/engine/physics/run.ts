/**
 * P15a: the run of a contact physics (plan R12): how it starts and ends, the tap (a signal inside the fiction) and the stop word (the
 * player's own, outside it). Nothing here draws: a run starts `held`, and `physics/next_segment` (Task 19) plans and starts each segment.
 * Importing this module registers what keeps a run in step with the blocking: it starts when a contact or an item with physics is set, ends
 * when its source goes, and ends when a switched-off category takes its source away.
 */
import type { Entry, Registries } from '../../content/types';
import { blockingLive, COMMANDER, contactOf, contactTargetOf, hasSource, registerAfterChange, removeSource, type BlockingChange } from '../blocking';
import { contentAllowed, registerWithdrawal } from '../bonds/content';
import type { EngineEvent } from '../dispatch';
import { sceneSettingsOf } from '../moments/settings';
import type { CampaignState, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { effectiveHoldsUntil, leadStyle, physicsStyleOf, runTargetOf } from './style';
import { extraSlotsFor, initMarathon, isMarathon } from './marathon';
import { setCondition } from './conditions';
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
  /** A second physics on the same beats (her escalation adds one); absent: the source's own second entry, when it has one and may run. */
  second?: string;
  /** A mouth act that runs this physics on a contact that does not name it (the source's own list is not checked); no second physics. */
  act?: string;
}

/** Whether this physics may run for this holder: its interaction is on and its category and her limits allow it. */
function whyNotAllowed(state: CampaignState, reg: Registries, phys: Entry, holderId: string): string | null {
  if (!sceneSettingsOf(state).physicsInteractions[phys.interaction as keyof ReturnType<typeof sceneSettingsOf>['physicsInteractions']]) return 'That kind of interaction is switched off.';
  if (!contentAllowed(state, reg, phys) || !contentAllowed(state, reg, phys, holderId)) return 'That is not available here.';
  return null;
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
  if (o.act === undefined && !physicsOf(sourceEntry(reg, o.sourceKind, o.sourceId)).some((p) => p.id === o.physicsId)) return `"${o.sourceId}" has no ${o.physicsId} physics.`;
  const gate = whyNotAllowed(state, reg, phys, o.holderId);
  if (gate !== null) return gate;
  if (o.second !== undefined) {
    if (o.second === o.physicsId || !physicsOf(sourceEntry(reg, o.sourceKind, o.sourceId)).some((p) => p.id === o.second)) return `"${o.sourceId}" has no ${o.second} physics to add.`;
    const second = reg.contactPhysics.get(o.second);
    const why = second ? whyNotAllowed(state, reg, second, o.holderId) : 'Unknown physics.';
    if (why !== null) return why;
  }
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
  const ref = physicsOf(sourceEntry(reg, o.sourceKind, o.sourceId)).find((p) => p.id === o.physicsId);
  const range = ref?.seal ? [...ref.seal].sort((a, b) => SEAL_ORDER.indexOf(a) - SEAL_ORDER.indexOf(b)) : undefined;
  const lead = leadStyle(physicsStyleOf(draft, o.holderId, reg)).seal;
  const seal = range ? range[lead === 'loosest' ? 0 : lead === 'tightest' ? range.length - 1 : Math.floor(range.length / 2)] : undefined;
  scene.physicsCount = (scene.physicsCount ?? 0) + 1;
  // P15: the target the run is on is recorded only through a registered reader (the dynamic answers while it is on): without one the run is exactly as P15a made it
  const contactTarget = o.sourceKind === 'contact' ? contactTargetOf(scene, reg, o.sourceId) : undefined;
  const target = contactTarget !== undefined ? runTargetOf(draft, reg, contactTarget) : undefined;
  const run: PhysicsRun = {
    id: `p${scene.physicsCount}`, physicsId: o.physicsId, sourceKind: o.sourceKind, sourceId: o.sourceId, holderId: o.holderId,
    ...(target !== undefined ? { targetId: target } : {}),
    ...gaugeFor(draft, phys), ...(range ? { sealRange: range } : {}), ...(seal ? { seal } : {}), ...(ref?.pressure !== undefined ? { pressure: ref.pressure } : {}),
    segment: { n: 0, state: 'held' }, startedExchange: scene.exchanges, taps: 0, streak: 0, extend: 0,
    ...(o.duration !== undefined ? { duration: o.duration } : {}),
    ...(o.act !== undefined ? { act: o.act, ...(o.act === 'lick' ? { dryness: 0 } : {}) } : {}),
  };
  if (o.duration !== undefined && isMarathon(o.duration)) {
    run.marathon = initMarathon(draft, o.duration);
    run.baseCapacity = run.capacity;
  }
  // a second physics: the one asked for, or the source's own second entry when it may run (it is left out quietly when it may not)
  const list = physicsOf(sourceEntry(reg, o.sourceKind, o.sourceId));
  const secondRef = o.act !== undefined ? undefined : o.second !== undefined ? list.find((p) => p.id === o.second) : list.find((p) => p.id !== o.physicsId);
  const secondPhys = secondRef ? reg.contactPhysics.get(secondRef.id) : undefined;
  if (secondRef && secondPhys && whyNotAllowed(draft, reg, secondPhys, o.holderId) === null) {
    const sr = secondRef.seal ? [...secondRef.seal].sort((a, b) => SEAL_ORDER.indexOf(a) - SEAL_ORDER.indexOf(b)) : undefined;
    run.second = {
      physicsId: secondRef.id, ...gaugeFor(draft, secondPhys), streak: 0, ...(sr ? { sealRange: sr, seal: sr[lead === 'loosest' ? 0 : lead === 'tightest' ? sr.length - 1 : Math.floor(sr.length / 2)]! } : {}),
      ...(secondRef.pressure !== undefined ? { pressure: secondRef.pressure } : {}),
    };
  }
  scene.physics = run;
  return [{ type: 'physics_started', runId: run.id, physicsId: run.physicsId, holderId: run.holderId, sourceKind: run.sourceKind, sourceId: run.sourceId, ...(run.second ? { secondId: run.second.physicsId } : {}), ...(o.duration !== undefined ? { duration: o.duration } : {}) }];
}

/**
 * A slip opens the physics its entry chains to (a spilled swallow: tongue work on the floor at dirt 60): the run goes on with the same source and
 * holder in the new physics, at the chain's starting gauge. Nothing when the physics has no chain.
 */
export function chainRun(draft: CampaignState, reg: Registries, run: PhysicsRun): EngineEvent[] {
  const chain = (reg.contactPhysics.get(run.physicsId)?.chains as Array<{ on: string; to: string; start?: number }> | undefined)?.find((c) => c.on === 'slip');
  const to = chain ? reg.contactPhysics.get(chain.to) : undefined;
  if (!chain || !to) return [];
  const from = run.physicsId;
  const g = gaugeFor(draft, to);
  run.physicsId = chain.to;
  run.capacity = g.capacity;
  run.gauge = chain.start ?? g.gauge;
  delete run.seal;
  delete run.sealRange;
  return [{ type: 'physics_started', runId: run.id, physicsId: run.physicsId, holderId: run.holderId, sourceKind: run.sourceKind, sourceId: run.sourceId, chained: true, from }];
}

/** Ends the run with a result and takes its contact or item out of the scene (the hold is over). Nothing when no run is open. */
export function stopPhysics(draft: CampaignState, reg: Registries, result: Outcome): EngineEvent[] {
  const run = draft.scene?.physics;
  if (!draft.scene || !run) return [];
  delete draft.scene.physics;
  removeSource(draft, run.sourceKind, run.sourceId);
  const events: EngineEvent[] = [{ type: 'physics_outcome', runId: run.id, physicsId: run.physicsId, holderId: run.holderId, result, segments: run.segment.n, sourceKind: run.sourceKind, sourceId: run.sourceId, ...(run.second ? { secondId: run.second.physicsId } : {}), ...(run.targetId !== undefined ? { targetId: run.targetId } : {}), ...(run.tally ? { tally: { ...run.tally } } : {}) }]; // the target was read when the run began: P15 counts the act on it (mastery)
  if (run.marathon) events.push(...finishMarathon(draft, reg, run, result));
  return events;
}

/**
 * A marathon ends (completed, cut short, or stopped): the fiction time that passed costs its slots (the scene ends with them; they are spent at
 * `scene/end`), the commander is `stiff` for the next slot, and `marathon_done` says how many hours it was (for P16b's record).
 */
function finishMarathon(draft: CampaignState, reg: Registries, run: PhysicsRun, result: Outcome): EngineEvent[] {
  const m = run.marathon!;
  const elapsed = m.clockMin - m.startMin;
  const extra = extraSlotsFor(elapsed);
  const scene = draft.scene!;
  if (extra > 0) scene.extraSlots = (scene.extraSlots ?? 0) + extra;
  scene.marathon = true;
  return [
    ...setCondition(draft, reg, 'stiff', { day: draft.day, slot: draft.slot }),
    { type: 'marathon_done', hours: Math.round((elapsed / 60) * 100) / 100, unitId: run.holderId, physicsId: run.physicsId, result, phases: m.phase },
  ];
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
  if (scene.physics) {
    const events = stopPhysics(draft, ctx.registries, 'stopped');
    dropOrphanAct(draft);
    return events;
  }
  const contact = contactOf(scene);
  if (!contact) {
    // no hold and no contact: what the commander wears comes off, a hood or a collar as much as a gag (review: the stop word must always get the commander out)
    const worn = [...new Set(Object.values(scene.blocking?.[COMMANDER]?.worn ?? {}).map((w) => w?.id).filter((id): id is string => id !== undefined))];
    if (worn.length === 0) throw new Error('physics/stop_word: there is nothing to stop');
    for (const id of worn) removeSource(draft, 'item', id);
    return [{ type: 'physics_outcome', runId: null, physicsId: null, holderId: scene.participants[0] ?? null, result: 'stopped', segments: 0, sourceKind: 'item', sourceId: worn[0] }];
  }
  removeSource(draft, 'contact', contact.id);
  dropOrphanAct(draft);
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
const WORST: Release[] = ['continue', 'release', 'collapse', 'limit_broken', 'blackout'];

/** Air is the gauge of a breathing physics (timing, a capacity): only it can go to blackout. */
export const isAir = (reg: Registries, physicsId: string): boolean => {
  const p = reg.contactPhysics.get(physicsId);
  return p?.interaction === 'timing' && (p.gauge as { kind: string }).kind === 'capacity';
};

/** One physics of the run as a run of its own (the main one, or the second with its own gauge). */
export const coreRun = (run: PhysicsRun, which: 'main' | 'second'): PhysicsRun | null =>
  which === 'main' ? run : run.second ? withoutLeak({ ...run, physicsId: run.second.physicsId, gauge: run.second.gauge, capacity: run.second.capacity, streak: run.second.streak, ...(run.second.seal ? { seal: run.second.seal } : {}), ...(run.second.pressure !== undefined ? { pressure: run.second.pressure } : {}) }, run.second) : null;

/** The second physics has its own seal and pressure: the first one's must not leak into its view. */
function withoutLeak(view: PhysicsRun, second: NonNullable<PhysicsRun['second']>): PhysicsRun {
  if (second.seal === undefined) delete view.seal;
  if (second.pressure === undefined) delete view.pressure;
  delete view.headed; // Ruling U: the main run's head is not the second's gauge
  delete view.second;
  return view;
}

function releaseOf(state: CampaignState, reg: Registries, run: PhysicsRun): Release {
  // Ruling U: the scent instrument's head is the gauge, and the prototype never ends on it (a full head is "lost in her", a play state): a
  // headed run never ends at a boundary by its fill, neither full nor at her letting-go thresholds. It ends by the tap, the stop word, the
  // contact or item taken away, or her activity's duration.
  if (run.headed) return 'continue';
  const left = remainingOf(reg, run);
  const holds: HoldsUntil = effectiveHoldsUntil(state, reg, run.holderId);
  if (left <= 0) return holds === 'blackout' && isAir(reg, run.physicsId) ? 'blackout' : holds === 'signal' ? 'collapse' : 'limit_broken';
  if (holds === 'signal' && left <= TUNING.physics.releaseAt.signal) return 'release';
  if (holds === 'limit' && left <= TUNING.physics.releaseAt.limit) return 'release';
  return 'continue';
}

/**
 * Whether the run ends at a boundary by what she holds the commander until: a spent gauge is a blackout for a blackout holder (the air only),
 * a broken limit for a limit holder (and for a blackout holder whose weight gave out) and a collapse for a signal holder; short of that she
 * lets go at 15 % (signal) or 5 % (limit). With two physics the worst of them decides.
 */
export function releaseCheck(state: CampaignState, reg: Registries, run: PhysicsRun): Release {
  const second = coreRun(run, 'second');
  const all = [releaseOf(state, reg, run), ...(second ? [releaseOf(state, reg, second)] : [])];
  return all.reduce((w, r) => (WORST.indexOf(r) > WORST.indexOf(w) ? r : w), 'continue' as Release);
}

// ---------------------------------------------------------------------------------------------
// keeping the run in step with the blocking

const gone = (scene: SceneRecord | undefined, run: PhysicsRun): boolean => !hasSource(scene, run.sourceKind, run.sourceId);

/** Counted kisses have no one to count for once the contact is gone (the stop word, a chip, a switched-off category): the act goes with it. */
function dropOrphanAct(draft: CampaignState): void {
  const scene = draft.scene;
  if (scene?.act && !contactOf(scene)) delete scene.act;
}

registerAfterChange((draft: CampaignState, reg: Registries, change: BlockingChange): EngineEvent[] => {
  const events: EngineEvent[] = [];
  dropOrphanAct(draft);
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
  dropOrphanAct(draft);
  const run = draft.scene?.physics;
  if (!run) return [];
  const tags = (e: Entry | undefined): string[] => (Array.isArray(e?.contentTags) ? (e!.contentTags as string[]) : []);
  const hit = [...tags(sourceEntry(reg, run.sourceKind, run.sourceId)), ...tags(reg.contactPhysics.get(run.physicsId)), ...tags(run.second ? reg.contactPhysics.get(run.second.physicsId) : undefined)].some((t) => removed.includes(t));
  return hit || gone(draft.scene, run) ? stopPhysics(draft, reg, 'stopped') : [];
});
