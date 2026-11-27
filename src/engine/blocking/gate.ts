/**
 * P15a: when the blocking is live, the frame stand-in, and the gate every entry passes (plan R2, R6). Everything in the package starts
 * with `blockingLive`: while it is false there is no block, no directive, no chip, no moment, no physics and no rng draw.
 */
import type { Entry, Registries } from '../../content/types';
import { cabinOf } from '../basePlan';
import { bondTierOf, contentAllowed } from '../bonds';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { frameRank, type Frame } from './state';

type FrameReader = (state: CampaignState, unitId: string) => Frame | null;
type LiveGate = (state: CampaignState, reg: Registries) => boolean;
const frameReaders: FrameReader[] = [];
const liveGates: LiveGate[] = [];

/** P15 plugs in here: what frame a soldier's relationship is in. The first reader that answers wins. */
export function registerFrameReader(fn: FrameReader): void {
  frameReaders.push(fn);
}
/** P15 plugs in here: a scene is also live when its frame is `play` or higher. */
export function registerBlockingGate(fn: LiveGate): void {
  liveGates.push(fn);
}
/**
 * P16b plugs in here: does a contact that is `supported` need a posture that carries it right now? A reader answers `true` while it does (the craft: some holder is craft-live) and
 * `null` for no say; with no reader the restriction does not exist and the contact is offered and stageable as it was before the craft. Any `true` wins.
 */
type SupportGate = (state: CampaignState, reg: Registries) => boolean | null;
const supportGates: SupportGate[] = [];
export function registerSupportGate(fn: SupportGate): void {
  if (!supportGates.includes(fn)) supportGates.push(fn);
}
/** Whether a registered gate asks for the restriction now. */
export function supportRequired(state: CampaignState, reg: Registries): boolean {
  return supportGates.some((g) => g(state, reg) === true);
}
/** Tests: forget every registered reader and gate. */
export function resetBlockingHooks(): void {
  frameReaders.length = 0;
  liveGates.length = 0;
  supportGates.length = 0;
}

export function frameOf(state: CampaignState, unitId: string): Frame {
  for (const read of frameReaders) {
    const f = read(state, unitId);
    if (f !== null) return f;
  }
  return 'equal';
}

/** True while a scene is open and a present named living soldier is at bond tier `close` or `romantic` (or a registered gate says so). Grunts never make it live. */
export function blockingLive(state: CampaignState, reg: Registries): boolean {
  const scene = state.scene;
  if (!scene) return false;
  const close = scene.participants.some((id) => {
    const u = state.squad.find((x) => x.id === id);
    return u !== undefined && u.kind === 'named' && isLiving(u) && bondTierOf(state, reg, id) !== null;
  });
  return close || liveGates.some((g) => g(state, reg));
}

/**
 * May this entry appear for these soldiers? Its content tags must be on and none of them may have it among her own limits
 * (`contentAllowed`), and a `scope: 'dynamic'` entry needs every one of them at frame `play` or higher.
 */
export function entryAllowed(state: CampaignState, reg: Registries, entry: object, unitIds: string[]): boolean {
  if (!contentAllowed(state, reg, entry)) return false;
  for (const id of unitIds) if (!contentAllowed(state, reg, entry, id)) return false;
  if ((entry as { scope?: unknown }).scope === 'dynamic') {
    if (unitIds.length === 0) return frameRank('equal') >= frameRank('play');
    return unitIds.every((id) => frameRank(frameOf(state, id)) >= frameRank('play'));
  }
  return true;
}

/**
 * The plan room the open scene is in: a `perUnit` location is the first participant's cabin; else the plan room whose `sceneLocationId`
 * is the scene's location; else the plan room of the hub room that has that scene location. `null` when none is found.
 */
export function sceneRoom(state: CampaignState, reg: Registries): Entry | null {
  const scene = state.scene;
  if (!scene) return null;
  const loc = reg.locations.get(scene.locationId);
  if (loc?.perUnit === true) return cabinOf(state, reg, scene.participants[0] ?? '') ?? null;
  const rooms = [...reg.planRooms.values()];
  const direct = rooms.find((r) => r.sceneLocationId === scene.locationId);
  if (direct) return direct;
  const hub = [...reg.hubRooms.values()].find((r) => r.sceneLocationId === scene.locationId);
  return hub ? rooms.find((r) => r.hubRoomId === hub.id) ?? null : null;
}

/** What the scene's place offers (`desk`, `bunk`, `lock`, …). Empty when the place is not on the plan. */
export function sceneAffordances(state: CampaignState, reg: Registries): Set<string> {
  const room = sceneRoom(state, reg);
  return new Set(Array.isArray(room?.affordances) ? (room!.affordances as unknown[]).map(String) : []);
}
