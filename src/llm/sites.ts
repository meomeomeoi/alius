import type { CampaignState } from '../engine/state/types';
import type { CallTypeId } from './callTypes';

// P14: a site is one place that asks for a generation and applies its result. This module is data only: the declarations of every
// site, with what the player sees and which rerolls and records the site allows. The runtime handlers (build, parse, apply, …) are
// bound by the controller that owns the site (`Envelope.bind`), so a declaration never imports a controller.

/** Where a failure chip is drawn. */
export type GenerationSurface = 'scene' | 'comms' | 'day' | 'expedition' | 'dilemma' | 'setup' | 'world' | 'sys';

/**
 * What a REROLL of a success does. `free`: the result is text, replace it. `before_commit`: replace it until the player has acted on it.
 * `revert`: restore the state the result was applied to (only while nothing else happened), then apply the new one. `none`: not rerollable.
 */
export type RerollMode = 'free' | 'before_commit' | 'revert' | 'none';

export interface SiteDecl {
  /** Dotted: `scene.intents`, `flavor.demand`. */
  id: string;
  callType: CallTypeId;
  surface: GenerationSurface;
  reroll: RerollMode;
  /** `full`: chip on the spot, SYS, badge, hub line. `quiet`: SYS only. `none`: never recorded (the caller's own path says what happened). */
  record: 'full' | 'quiet' | 'none';
  /** The glossary entry the chip is explained by. */
  glossary: string;
  /** What the player reads before the reason ("Scene summary"). Generic: it never carries a value the commander may not know. */
  label(state: CampaignState | null, key: string): string;
}

const sites = new Map<string, SiteDecl>();

export function registerGenerationSite(decl: SiteDecl): void {
  if (sites.has(decl.id)) throw new Error(`Duplicate generation site: ${decl.id}`);
  sites.set(decl.id, decl);
}

export const generationSite = (id: string): SiteDecl | undefined => sites.get(id);
export const generationSites = (): SiteDecl[] => [...sites.values()];

const GLOSSARY = 'generation_failed';

function declare(
  id: string, callType: CallTypeId, surface: GenerationSurface, reroll: RerollMode, record: SiteDecl['record'], label: string,
): void {
  registerGenerationSite({ id, callType, surface, reroll, record, glossary: GLOSSARY, label: () => label });
}

// the table of the P14 plan ("The sites"), one line each
declare('scene.intents', 'intent_extract', 'scene', 'revert', 'full', 'Scene reading');
declare('scene.summary', 'scene_summary', 'day', 'revert', 'full', 'Scene summary');
declare('scene.digest', 'scene_summary', 'scene', 'none', 'quiet', 'Scene digest');
declare('emotion.pick', 'emotion_pick', 'scene', 'none', 'none', 'Expression pick');
declare('dm.reply', 'dm_reply', 'comms', 'revert', 'full', 'Her reply');
declare('dm.initiate', 'dm_reply', 'comms', 'none', 'quiet', 'Her message');
declare('dm.door', 'dm_reply', 'comms', 'none', 'full', 'Her answer at the door');
declare('dm.intents', 'intent_extract', 'comms', 'none', 'quiet', 'Message reading');
declare('director.tick', 'director_tick', 'world', 'none', 'full', "The director's plan");
declare('dilemma.generate', 'dilemma_generate', 'dilemma', 'before_commit', 'full', 'Decision text');
declare('expedition.recap', 'expedition_recap', 'expedition', 'free', 'full', 'After-action recap');
declare('activity.vignette', 'activity_vignette', 'day', 'none', 'quiet', 'Vignette');
declare('chronicle.compact', 'chronicle_compact', 'world', 'none', 'none', 'Chronicle compaction');
declare('memory.fold', 'memory_fold', 'world', 'none', 'none', 'Memory fold');
declare('memory.rumor', 'rumor_retell', 'world', 'none', 'quiet', 'Rumor retelling');
declare('flavor.grunt', 'flavor', 'day', 'free', 'quiet', 'Grunt name');
declare('flavor.enemy', 'flavor', 'expedition', 'none', 'none', 'Enemy name');
declare('flavor.demand', 'flavor', 'day', 'free', 'quiet', 'Demand wording');
declare('flavor.rule', 'flavor', 'day', 'free', 'quiet', 'Rule wording');
declare('flavor.ballot', 'flavor', 'day', 'none', 'none', 'Ballot wording');
declare('flavor.dm_edit', 'flavor', 'comms', 'none', 'none', 'Message edit');
declare('flavor.frequency_fragment', 'flavor', 'scene', 'none', 'none', 'Fragment wording');
declare('warden.agenda', 'warden_agenda', 'world', 'before_commit', 'quiet', "The warden's agenda");
declare('warden.judge', 'warden_judge', 'world', 'none', 'none', 'Warden judgement');
declare('warden.epilogue', 'epilogue', 'world', 'free', 'full', 'Epilogue');
declare('setup.profile_import', 'profile_import', 'setup', 'before_commit', 'none', 'Profile import');
declare('setup.commander_import', 'commander_import', 'setup', 'before_commit', 'none', 'Commander import');
declare('sys.ping', 'ping', 'sys', 'none', 'none', 'Connection test');
