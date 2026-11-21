/**
 * P15a: what the scene may offer right now, as entries: the one filter behind the BLOCKING chips, the extractor's closed vocabulary and the
 * moment sources the reading may name. Everything passes the content gate (the category switched on, her own limits), the frame
 * (`scope: 'dynamic'` needs `play`), and the room (`requires.affordances` ⊆ what the place offers). Nothing draws.
 */
import type { Entry, Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { entryAllowed, sceneAffordances } from './gate';

export interface Vocabulary {
  posture: Entry[];
  anchor: Entry[];
  contact: Entry[];
  item: Entry[];
  activity: Entry[];
}

const affordancesOf = (e: Entry): string[] => {
  const r = e.requires as { affordances?: string[] } | undefined;
  return Array.isArray(r?.affordances) ? r.affordances : [];
};

export function blockingVocabulary(state: CampaignState, reg: Registries): Vocabulary {
  const scene = state.scene;
  if (!scene) return { posture: [], anchor: [], contact: [], item: [], activity: [] };
  const units = scene.participants;
  const have = sceneAffordances(state, reg);
  const fits = (e: Entry): boolean => affordancesOf(e).every((a) => have.has(a));
  return {
    posture: [...reg.blockingPostures.values()],
    anchor: [...reg.blockingAnchors.values()].filter(fits),
    contact: [...reg.blockingContacts.values()].filter((e) => fits(e) && entryAllowed(state, reg, e, units)),
    item: [...reg.blockingItems.values()].filter((e) => entryAllowed(state, reg, e, units)),
    activity: [...reg.blockingActivities.values()].filter((e) => entryAllowed(state, reg, e, units)),
  };
}

/**
 * May this moment source come up in this scene? Its scope and content gate pass, and in a quiet meeting only the pastime's own sources
 * (or, when it lists none, the ones every meeting may have: `generalMeeting`). `unitIds` narrows the gate to some of the participants (a
 * moment is one soldier's); it defaults to all of them.
 */
export function sourceAllowed(state: CampaignState, reg: Registries, source: Entry, unitIds?: string[]): boolean {
  const scene = state.scene;
  if (!scene || !entryAllowed(state, reg, source, unitIds ?? scene.participants)) return false;
  if (scene.pastime === undefined) return true;
  const own = reg.pastimes.get(scene.pastime.id)?.momentSources;
  return Array.isArray(own) && own.length > 0 ? (own as string[]).includes(source.id) : source.generalMeeting === true;
}

/**
 * Who else knows a source is ripe (P15, plan Task 37): a reader answers the ids of the sources that are ripe for one soldier right now (the Regard question
 * of a woman who has lost respect for the commander). Several may be registered; with none the answer is empty and nothing below changes.
 */
type RipeSource = (state: CampaignState, reg: Registries, unitId: string) => string[];
const ripeReaders: RipeSource[] = [];
export function registerRipeSource(fn: RipeSource): void {
  if (!ripeReaders.includes(fn)) ripeReaders.push(fn);
}
/** Tests: forget every registered reader. */
export function resetRipeSources(): void { ripeReaders.length = 0; }
/** The ids the readers call ripe for this soldier (registration order, once each). */
const ripeIdsFor = (state: CampaignState, reg: Registries, unitId: string): string[] => [...new Set(ripeReaders.flatMap((fn) => fn(state, reg, unitId)))];

/** Whether the engine itself calls this source ripe for this soldier (a registered reader says so). Live sources add it to the reading's own call (`liveSources`). */
export function engineRipe(state: CampaignState, reg: Registries, sourceId: string, unitId: string): boolean {
  return ripeReaders.length > 0 && ripeIdsFor(state, reg, unitId).includes(sourceId);
}

/**
 * The allowed sources the reading of an exchange may name as ripe (`live` has `extracted`), in registry order, and any a registered reader calls ripe for
 * someone in the scene (allowed for her).
 */
export function ripeSources(state: CampaignState, reg: Registries): Entry[] {
  const named = state.scene === undefined || ripeReaders.length === 0 ? new Set<string>() : new Set(state.scene.participants.flatMap((id) => ripeIdsFor(state, reg, id).filter((sid) => {
    const s = reg.momentSources.get(sid);
    return s !== undefined && sourceAllowed(state, reg, s, [id]);
  })));
  return [...reg.momentSources.values()].filter((s) => named.has(s.id) || (Array.isArray(s.live) && (s.live as string[]).includes('extracted') && sourceAllowed(state, reg, s)));
}
