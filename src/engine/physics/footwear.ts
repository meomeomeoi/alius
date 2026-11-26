/**
 * P10e-e Task 27: shoe service, the engine's half (`docs/prototypes/shoe.html`, normative; plan R29–R31). Derived readers only: nothing here
 * is stored, nothing draws.
 *
 * - Her footwear (`footwearOf`, R30): `boots` unless her tastes name heels (her likes and her taste ids through P14b's readers, by words).
 * - The dirt of her day (`dirtOfDay`, R30): her run's region today (`regions[].dirt`, read by field), else the training yard's dust (she drilled
 *   today: an activity whose effects drill, as P15's `trains` reads it), else rain on a wet day (`wetDay`: a stable hash of the day, no
 *   weather exists in the state), else dust.
 * - A run is shoe service (`isShoeRun`) when its physics is an `order` on a `dirt` gauge and the contact it came from targets footwear (a
 *   worship target with `footwear: true`, read by field).
 * - Her ways (`shoePaceOf`): shoe.html's `STYLES` (her time for a surface, her foot's moves, her grain), by her lead style; a style it has no
 *   row of reads neutral's. The busy share is not read: her attention is the plan's (P15a's attention by her activity). Hidden: it never
 *   reaches an event, a toast, a panel, a label, a prompt or a reading.
 */
import type { Registries } from '../../content/types';
import { likesOf, tastesOf } from '../development/profile';
import { fnv1a } from '../hub';
import { busySlot } from '../life/places';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import type { PhysicsRun } from './state';
import { leadStyle, physicsStyleOf } from './style';

export type Footwear = 'boots' | 'heels';
export const DIRT_KINDS = ['ash', 'mud', 'oil', 'spores', 'dust', 'rain'] as const;
export type DirtKind = (typeof DIRT_KINDS)[number];

const HEELS = /\b(high[- ]?)?heel(s|ed)?\b|\bstilettos?\b|\bpumps\b/i;

/** Her footwear: `heels` when her likes or her tastes name heels, else `boots` (an unknown id: boots). */
export function footwearOf(state: Pick<CampaignState, 'squad'>, _reg: Registries, unitId: string): Footwear {
  const u = state.squad.find((x) => x.id === unitId);
  if (!u) return 'boots';
  return [...likesOf(u), ...tastesOf(u)].some((t) => HEELS.test(t)) ? 'heels' : 'boots';
}

/** A wet day: `fnv1a(wet_day|<day>)` under the tuned share (AUTHOR TO TUNE: the state has no weather). No draw. */
export function wetDay(state: Pick<CampaignState, 'day'>): boolean {
  return (fnv1a(`wet_day|${state.day}`) % 1000) / 1000 < TUNING.physics.shoe.wetShare;
}

/** Did she drill today (an activity whose effects train, P15's `trains`)? Read from her day's record (P14c), absent while her life is off. */
function trainedToday(state: Pick<CampaignState, 'day' | 'life'>, reg: Registries, unitId: string): boolean {
  const from = busySlot(state.day, 'morning'), to = busySlot(state.day, 'night');
  return (state.life?.busy ?? []).some((b) => b.unitId === unitId && b.slot >= from && b.slot <= to && b.activityId !== undefined
    && ((reg.activities.get(b.activityId)?.effects as Array<{ type: string }> | undefined) ?? []).some((e) => TUNING.dynamic.style.trainingEffects.includes(e.type)));
}

/** The dirt of her day: her run's region today, else the yard's dust, else rain on a wet day, else dust. */
export function dirtOfDay(state: Pick<CampaignState, 'day' | 'life' | 'lastExpedition'>, reg: Registries, unitId: string): DirtKind {
  const run = state.lastExpedition;
  if (run && run.day === state.day && run.party.includes(unitId)) {
    const dirt = reg.regions.get(run.regionId)?.dirt;
    if (typeof dirt === 'string' && (DIRT_KINDS as readonly string[]).includes(dirt)) return dirt as DirtKind;
  }
  if (trainedToday(state, reg, unitId)) return 'dust';
  if (wetDay(state)) return 'rain';
  return 'dust';
}

/** Is this run shoe service? An `order` physics on a `dirt` gauge, from a contact whose target is footwear (by field). */
export function isShoeRun(run: Pick<PhysicsRun, 'physicsId' | 'sourceKind' | 'sourceId'>, reg: Registries): boolean {
  const phys = reg.contactPhysics.get(run.physicsId);
  if (phys?.interaction !== 'order' || (phys.gauge as { kind?: string } | undefined)?.kind !== 'dirt' || run.sourceKind !== 'contact') return false;
  const targets = (reg.blockingContacts.get(run.sourceId)?.target as string[] | undefined) ?? [];
  return targets.some((t) => reg.worshipTargets.get(t)?.footwear === true);
}

/* her ways by style (drafts for her profile): how long she gives a surface, her patience before moving on, how often she looks, what she does with her foot */
export const STYLES = {
  neutral:      { surface: [22, 34], busy: 0.5, moves: { press: 0.15, stamp: 0.05, kiss: 0.2 }, grain: 1 },
  affectionate: { surface: [28, 40], busy: 0.4, moves: { press: 0.05, stamp: 0, kiss: 0.35 }, grain: 1 },
  ritual:       { surface: [26, 26], busy: 0.2, moves: { press: 0.05, stamp: 0.05, kiss: 0.4 }, grain: -1 },
  playful:      { surface: [16, 30], busy: 0.5, moves: { press: 0.3, stamp: 0.1, kiss: 0.2 }, grain: 1 },
  cruel:        { surface: [14, 22], busy: 0.35, moves: { press: 0.35, stamp: 0.25, kiss: 0.15 }, grain: -1 },
  possessive:   { surface: [20, 30], busy: 0.25, moves: { press: 0.3, stamp: 0.1, kiss: 0.3 }, grain: 1 },
  cold:         { surface: [18, 26], busy: 0.7, moves: { press: 0.05, stamp: 0.15, kiss: 0.05 }, grain: -1 },
  regal:        { surface: [24, 34], busy: 0.3, moves: { press: 0.15, stamp: 0.1, kiss: 0.45 }, grain: 1 },
} as Record<string, ShoePace>;

export interface ShoePace { surface: [number, number]; busy: number; moves: { press: number; stamp: number; kiss: number }; grain: number }

/** Her ways of shoe service: the prototype's row of her lead style (neutral's for a style it has none of). */
export function shoePaceOf(state: CampaignState, reg: Registries, holderId: string): ShoePace {
  const key = leadStyle(physicsStyleOf(state, holderId, reg)).key;
  return STYLES[key] ?? STYLES.neutral!;
}
