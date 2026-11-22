/**
 * What the commander may read of the dynamic (P15, plan R25), as plain data. These are the engine-side readers the UI and `Knowledge.dynamic` build on: they read the
 * state, never write it, never draw, and answer nothing while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import { isLiving } from '../economy';
import type { CampaignState, Fact } from '../state/types';
import { domainRows, standing } from './capabilities';
import { compromatOf } from './compromat';
import { holderOfDomain, meets } from './domains';
import type { ExpectationProfile } from './expectations';
import { dynamicOn } from './gate';
import { holdBandOf } from './hold';
import { masteryLevel, moodSigns, revealedExpectations } from './mastery';
import { dynamicOf } from './state';
import { trackOpen } from './tracks';
import { zoneFacts } from './zones';
import { DYNAMIC_KNOWLEDGE_TAG, KNOWLEDGE_LEVELS, type KnowledgeLevel } from './types';

/** A holder and the ids of the domains she holds today. */
export interface HolderLine { unitId: string; domains: string[] }

/**
 * Who holds something over the commander, for the CMDR card: every named living woman at `play` or beyond, in squad order, with the domains she holds today (a domain
 * given up in part still counts while it stands). Empty while the dynamic is off.
 */
export function heldBy(state: CampaignState, reg: Registries): HolderLine[] {
  if (!dynamicOn(state, reg)) return [];
  return state.squad
    .filter((u) => u.kind === 'named' && isLiving(u) && frameRank(dynamicOf(state, u.id)?.frame ?? 'equal') >= frameRank('play'))
    .map((u) => ({ unitId: u.id, domains: dynamicOf(state, u.id)!.domains.filter((d) => standing(d, state.day)).map((d) => d.id) }));
}

// ---------------------------------------------------------------------------------------------
// One woman's dynamic, as the commander may read it

/** The words for a track's level (1 to 5): a band, never xp. */
export const TRACK_WORDS = ['', 'a little', 'some', 'a good deal', 'deeply', 'completely'] as const;
/** How many tracks a view leads with. */
const LEADING_TRACKS = 3;
/** What the immersive mode answers where a band would stand: it is felt, not read (`glossary:dynamic_felt`). */
export const FELT = 'felt';

export interface DynamicView {
  /** Her frame's label; absent in immersive mode and for a woman who holds nothing. */
  frame?: string;
  /** Her hold's band label, or `felt` in immersive mode; absent for a woman with no dynamic. */
  band?: string;
  /** The hold itself: only with "show raw values", and never in immersive mode. */
  raw?: number;
  /** The domains she holds (`claimed`; `partial` once she has given some up) and those she may claim (`claimed: false`). */
  domains: Array<{ id: string; label: string; claimed: boolean; partial?: boolean }>;
  /** The domains she has an open claim for (the claim card is how it is answered). */
  asked: string[];
  /** The tracks she leads, as bands (`felt` in immersive mode). */
  tracks: Array<{ id: string; band: string }>;
  sworn: boolean;
  /** Her word for how she reads the commander's position, once she has read something. */
  reading?: string;
  /** Her profile, as far as a fact the commander has has shown it. */
  expectations: Partial<ExpectationProfile>;
  /** The body map's zones that have something to read: the level of the commander's mastery of the part with her (never the xp) and the facts the commander has that showed what she thinks of it. */
  zones: Record<string, { mastery: number; facts: string[] }>;
  /** What can be seen of her mood now, in words. */
  signs: string[];
  /** Who holds something over the commander, and what (every holder, not only her). */
  heldBy: HolderLine[];
  /** What she keeps of the commander's, once she has mentioned it. */
  compromat: Fact[];
  /** What others have shown they know of her (never the suspicion behind it). */
  knownLevels: Array<{ observerId: string; level: KnowledgeLevel }>;
}

export interface DynamicViewOpts {
  /** "Show raw values". */
  raw: boolean;
  /** Immersive mode: bands are felt, the frame and the number are left out. */
  hidden: boolean;
  /** `Knowledge`'s fact rule (a fact the commander may know); default: not hidden from the commander. */
  factVisible?: (f: Fact) => boolean;
}

const EMPTY: DynamicView = { domains: [], asked: [], tracks: [], sworn: false, expectations: {}, zones: {}, signs: [], heldBy: [], compromat: [], knownLevels: [] };
const LEVEL_RANK: Readonly<Record<KnowledgeLevel, number>> = { suspects_close: 1, suspects_dynamic: 2, knows_dynamic: 3 };

/**
 * The view of her dynamic for the commander (R25): everything the screens and the analysis may say of her, gathered once. A suspicion value, Regard, mastery xp, the profile she has
 * not shown, compromat she has not mentioned, the stage of an aftermath and her override chance are not in it, so no reading can show them. Pure.
 */
export function dynamicView(state: CampaignState, reg: Registries, unitId: string, opts: DynamicViewOpts): DynamicView {
  if (!dynamicOn(state, reg)) return structuredClone(EMPTY);
  const visible = opts.factVisible ?? ((f: Fact): boolean => f.hiddenFromCommander !== true);
  const view: DynamicView = {
    ...structuredClone(EMPTY), heldBy: heldBy(state, reg), expectations: revealedExpectations(state, reg, unitId), signs: moodSigns(state, reg, unitId),
    compromat: compromatOf(state, unitId).filter(visible),
  };
  const seen = state.memory.facts.filter(visible);
  for (const t of reg.worshipTargets.values()) {
    const facts = zoneFacts(seen, unitId, t.id).map((f) => f.text);
    const mastery = masteryLevel(state, unitId, t.id);
    if (facts.length > 0 || mastery > 0) view.zones[t.id] = { mastery, facts };
  }
  const levels = new Map<string, KnowledgeLevel>();
  for (const f of state.memory.facts) {
    if (!f.tags.includes(DYNAMIC_KNOWLEDGE_TAG) || f.about[1] !== unitId || !visible(f)) continue;
    const level = KNOWLEDGE_LEVELS.find((l) => f.tags.includes(l));
    if (level !== undefined && LEVEL_RANK[level] > (LEVEL_RANK[levels.get(f.about[0])!] ?? 0)) levels.set(f.about[0], level);
  }
  view.knownLevels = [...levels].map(([observerId, level]) => ({ observerId, level }));

  const dyn = dynamicOf(state, unitId);
  if (dyn === undefined) return view;
  const label = (registry: 'dynamicFrames' | 'holdBands', id: string): string => String(reg[registry].get(id)?.label ?? id);
  view.band = opts.hidden ? FELT : label('holdBands', holdBandOf(reg, dyn.hold));
  if (!opts.hidden) {
    view.frame = label('dynamicFrames', dyn.frame);
    if (opts.raw) view.raw = Math.round(dyn.hold);
  }
  view.sworn = dyn.sworn !== undefined;
  if (dyn.readOf.updates > 0) view.reading = String(reg.positionRegions.get(dyn.readOf.region)?.label ?? dyn.readOf.region);
  view.asked = state.dynamic!.open.claims.filter((c) => c.unitId === unitId && c.domainId !== undefined).map((c) => c.domainId!);
  const held = new Set(dyn.domains.map((d) => d.id));
  view.domains = [
    ...dyn.domains.map((d) => ({ id: d.id, label: String(reg.dynamicDomains.get(d.id)?.label ?? d.id), claimed: true, ...(!standing(d, state.day) || d.partialUntil !== undefined ? { partial: true } : {}) })),
    ...domainRows(reg)
      .filter((e) => !held.has(e.id) && !view.asked.includes(e.id) && meets(reg, dyn, e) && holderOfDomain(state, e.id, unitId) === null)
      .map((e) => ({ id: e.id, label: e.label, claimed: false })),
  ];
  view.tracks = Object.entries(dyn.tracks)
    .filter(([id, t]) => t.level >= 1 && trackOpen(state, reg, unitId, id))
    .sort((a, b) => b[1].level - a[1].level)
    .slice(0, LEADING_TRACKS)
    .map(([id, t]) => ({ id, band: opts.hidden ? FELT : TRACK_WORDS[t.level] }));
  return view;
}
