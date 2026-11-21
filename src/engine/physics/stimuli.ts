/**
 * P15a: the commander's body layer (plan R13, spec §16.8): per stimulus kind a tolerance that rises with exposure and slips back with days
 * apart, a reflex where the body protests, a trajectory (the share of seeking over avoiding) that gives a stage, and the language of perception
 * the model narrates in. The engine keeps the BODY and the record of deeds; the commander's thoughts and feelings are the player's, so nothing
 * here (and no line that reaches the model) states one.
 */
import type { Entry, Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { COMMANDER, blockingOf, contactOf, blockingLive } from '../blocking';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { sceneSettingsOf } from '../moments/settings';
import { STAGES, type Stage } from '../blocking/types';
import type { Rng } from '../rng';
import { addCommanderStress } from '../special/commanderStress';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { averageCaught, noiseOf } from './gaze';
import { herSkillOf } from './skill';
import { BAND_INDEX, bandOfLevel, scentLevel } from './scent';
import { physicsStyleOf } from './style';
import type { ScentBand } from './state';

const T = TUNING.stimuli;
export const WAYS = ['avoid', 'sniff', 'inhale', 'nuzzle', 'ordered', 'secret', 'taste'] as const;
export type Way = (typeof WAYS)[number];
const SEEKING: ReadonlySet<Way> = new Set(['sniff', 'inhale', 'nuzzle', 'ordered', 'secret', 'taste']);

type Row = NonNullable<CampaignState['commander']['stimuli']>[string];
export interface Exposure { kind: string; holderId: string; part?: string }

const rowOf = (state: CampaignState, kind: string): Row | undefined => state.commander.stimuli?.[kind];
export const toleranceOf = (state: CampaignState, kind: string): number => rowOf(state, kind)?.tolerance ?? T.startTolerance;
export const stageIndex = (stage: Stage): number => STAGES.indexOf(stage);

/** The stage a share of seeking gives: boundaries at 0.2 / 0.4 / 0.6 / 0.8. */
export const stageOf = (seek: number): Stage => STAGES[T.stages.filter((b) => seek >= b).length]!;

/** The green zone of the deep inhale: `[b × 20, b × 20 + 10 + tolerance / 5]` for the band index `b`; tolerance widens it. */
export function inhaleZone(band: ScentBand, tolerance: number): [number, number] {
  const b = BAND_INDEX[band];
  return [b * 20, b * 20 + T.inhale.zoneBase + tolerance / T.inhale.zoneTolerance];
}

/** The kinds the commander is exposed to in the open scene: what the contact and what is worn expose, a target's own, and sweat after a run. */
export function exposedKinds(state: CampaignState, reg: Registries): Exposure[] {
  const scene = state.scene;
  if (!scene || !blockingLive(state, reg)) return [];
  const out = new Map<string, Exposure>();
  const first = scene.participants[0];
  const add = (kinds: unknown, holderId: string | undefined, part?: string): void => {
    if (!Array.isArray(kinds) || holderId === undefined) return;
    for (const k of kinds as string[]) {
      const e = reg.stimulusKinds.get(k);
      if (e && contentAllowed(state, reg, e) && !out.has(k)) out.set(k, { kind: k, holderId, ...(part !== undefined ? { part } : {}) });
    }
  };
  const contact = contactOf(scene);
  if (contact) {
    const entry = reg.blockingContacts.get(contact.id);
    const holder = scene.participants.includes(contact.with) ? contact.with : Object.entries(scene.blocking ?? {}).find(([, b]) => b.contact === contact)?.[0] ?? first;
    add(entry?.stimuli, holder, contact.target);
    if (contact.target !== undefined) add(reg.worshipTargets.get(contact.target)?.stimuli, holder, contact.target);
  }
  for (const w of Object.values(blockingOf(scene, COMMANDER).worn ?? {})) add(w ? reg.blockingItems.get(w.id)?.stimuli : undefined, first);
  const run = state.lastExpedition;
  const anyone = [...out.values()][0];
  if (anyone && run && run.day === state.day && run.party.includes(anyone.holderId)) add(['sweat_exertion'], anyone.holderId, anyone.part);
  return [...out.values()];
}

/** How strong a kind is right now, in stimulus units (scent level × 25; a taste is a steady 25). */
export function stimulusUnits(state: CampaignState, reg: Registries, ex: Exposure): number {
  const family = String(reg.stimulusKinds.get(ex.kind)?.family);
  const level = family === 'taste' ? 1 : scentLevel(state, reg, ex.holderId, ex.part);
  return level * T.unitsPerLevel;
}
export const bandOf = (state: CampaignState, reg: Registries, ex: Exposure): ScentBand => bandOfLevel(stimulusUnits(state, reg, ex) / T.unitsPerLevel);

/** The tolerance in stimulus units at which the body protests. */
export const reflexAt = (state: CampaignState, kind: string): number => toleranceOf(state, kind) * T.reflexMult;

/**
 * Moves the share of seeking. The stage follows it one step at a time and only after `hysteresis` updates that point the same way, so a contact
 * that tips the share over a boundary and back does not change it.
 */
export function updateTrajectory(row: Row, seeking: boolean): { from: Stage; to: Stage } | null {
  row.seek += T.seekAlpha * ((seeking ? 1 : 0) - row.seek);
  const target = stageIndex(stageOf(row.seek));
  const at = stageIndex(row.stage);
  if (target === at) {
    delete row.pending;
    return null;
  }
  const step = STAGES[at + (target > at ? 1 : -1)]!;
  row.pending = row.pending?.stage === step ? { stage: step, n: row.pending.n + 1 } : { stage: step, n: 1 };
  if (row.pending.n < T.hysteresis) return null;
  const from = row.stage;
  row.stage = step;
  delete row.pending;
  return { from, to: step };
}

/** What reaches the commander, in words: the kind's line for her stage (`separated` after a week apart, `missing` when a kind that was craved is gone). `null` when it has faded. */
export function perceptionWord(state: CampaignState, reg: Registries, kind: string, band?: ScentBand): string | null {
  const entry = reg.stimulusKinds.get(kind);
  const row = rowOf(state, kind);
  if (!entry) return null;
  const words = entry.perception as Record<string, string>;
  if (band === 'faint' && (row?.tolerance ?? T.startTolerance) >= T.faintFadeAt) return null; // the faint no longer reaches the body
  if (!row) return words.aversion ?? null;
  const apart = state.day - row.lastDay;
  if (stageIndex(row.stage) >= stageIndex('craving') && apart >= T.missingDays) return 'Something is missing: it has been too long.';
  if (apart >= T.separatedDays) return words.separated ?? null;
  return words[row.stage] ?? null;
}

/** Each day: tolerance slips back (−1 per week apart, never below half the best) and a craved kind that is missed costs commander stress. */
export function decayStimuli(draft: CampaignState): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const row of Object.values(draft.commander.stimuli ?? {})) {
    if (draft.day - Math.max(row.lastDay, row.decayDay ?? row.lastDay) >= T.decayDays) {
      row.tolerance = Math.max(Math.min(row.tolerance, row.best / 2), row.tolerance - 1);
      row.decayDay = draft.day;
    }
    if (stageIndex(row.stage) >= stageIndex('craving') && draft.day - row.lastDay >= T.missingDays && row.missedDay !== draft.day) {
      row.missedDay = draft.day;
      events.push(...addCommanderStress(draft, T.missingStress, 'stimulus'));
    }
  }
  return events;
}

const isStr = (v: unknown): v is string => typeof v === 'string';

/**
 * The commander's way with a stimulus: avoid, sniff, deep inhale, nuzzle, as ordered, in secret, taste. It counts as a session of exposure
 * (once a scene per kind), moves the trajectory (a seeking way up, avoiding down) and may bring a reflex (a slip and a cough), her noticing
 * (avoid 0.6) or her catching a secret one (the gaze roll). `depth` is the inhale: a word (`shallow`, `deep`, `very_deep`) or the bar (0–100).
 */
export function applyWay(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'> & { rng: Rng }, way: unknown, kind: unknown, depth?: unknown): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  if (!scene || !blockingLive(draft, reg)) throw new Error('physics/stimulus: the blocking is not live in this scene');
  if (!isStr(way) || !(WAYS as readonly string[]).includes(way)) throw new Error(`physics/stimulus: way is one of ${WAYS.join(', ')}`);
  const ex = exposedKinds(draft, reg).find((e) => e.kind === kind);
  if (!ex) throw new Error('physics/stimulus: the commander is not exposed to that');
  const family = String(reg.stimulusKinds.get(ex.kind)!.family);
  const w = way as Way;
  if (w === 'taste' && family !== 'taste') throw new Error('physics/stimulus: only a taste can be tasted');
  if ((w === 'inhale' || w === 'sniff' || w === 'nuzzle') && family === 'taste') throw new Error('physics/stimulus: a taste is not breathed in');
  if (w === 'inhale' && !sceneSettingsOf(draft).physicsInteractions.inhale) throw new Error('physics/stimulus: the deep inhale is switched off');
  const rows = (draft.commander.stimuli ??= {});
  const row = (rows[ex.kind] ??= { tolerance: T.startTolerance, exposure: 0, lastDay: draft.day, best: T.startTolerance, seek: 0, stage: 'aversion' });
  if (row.session !== scene.id) {
    row.session = scene.id;
    row.exposure += 1;
    row.tolerance = Math.min(100, row.tolerance + T.tolerancePerSession);
    row.best = Math.max(row.best, row.tolerance);
  }
  row.lastDay = draft.day;
  delete row.missedDay;
  const band = bandOf(draft, reg, ex);
  const units = stimulusUnits(draft, reg, ex);
  const events: EngineEvent[] = [];
  let result: 'ok' | 'shallow' | 'reflex' = 'ok';
  let noticed = false;
  let caught = false;
  if (w === 'inhale') {
    const n = typeof depth === 'number' ? depth : isStr(depth) ? T.inhale.depths[depth] : undefined;
    if (n === undefined || !Number.isFinite(n)) throw new Error('physics/stimulus: an inhale needs a depth');
    if (typeof depth === 'number') {
      const [lo, hi] = inhaleZone(band, row.tolerance);
      result = n < lo ? 'shallow' : n <= hi ? 'ok' : 'reflex';
    } else {
      const target = BAND_INDEX[band] + 1;
      result = n < target ? 'shallow' : n === target ? 'ok' : 'reflex';
    }
  } else if ((w === 'nuzzle' || w === 'taste') && units > row.tolerance * T.reflexMult) result = 'reflex';
  else if (w === 'avoid') noticed = ctx.rng.chance(T.noticed);
  else if (w === 'secret') {
    const activity = blockingOf(scene, ex.holderId).activity;
    const attention = activity !== undefined ? (reg.blockingActivities.get(activity)?.attention as string | undefined) : undefined;
    caught = ctx.rng.chance(averageCaught(attention, physicsStyleOf(draft, ex.holderId), herSkillOf(draft, ex.holderId).reading));
  }
  events.push({ type: 'stimulus_way', kind: ex.kind, way: w, result, holderId: ex.holderId, noticed, caught });
  if (result === 'reflex') {
    const s = noiseOf('reflex');
    events.push({ type: 'reflex', kind: ex.kind, way: w, holderId: ex.holderId }, { type: 'physics_slip', runId: scene.physics?.id ?? null, kind: 'reflex', count: 1, holderId: ex.holderId });
    events.push({ type: 'physics_noise', runId: scene.physics?.id ?? null, holderId: ex.holderId, kind: s.kind, loudness: s.loudness });
    if (scene.physics?.last) {
      scene.physics.last.slips += 1;
      scene.physics.last.noise += s.loudness;
    }
  }
  if (caught) events.push({ type: 'physics_caught', runId: scene.physics?.id ?? null, holderId: ex.holderId, kind: 'secret', beat: -1 });
  const moved = updateTrajectory(row, SEEKING.has(w));
  if (moved) events.push({ type: 'stimulus_stage_changed', kind: ex.kind, from: moved.from, to: moved.to, herPresent: scene.participants.includes(ex.holderId), holderId: ex.holderId });
  return events;
}
