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

/** The allowed sources the reading of an exchange may name as ripe (`live` has `extracted`), in registry order. */
export function ripeSources(state: CampaignState, reg: Registries): Entry[] {
  return [...reg.momentSources.values()].filter((s) => Array.isArray(s.live) && (s.live as string[]).includes('extracted') && sourceAllowed(state, reg, s));
}
