import type { Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addFact } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { impunityOf } from '../discipline/impunity';
import { intimacyOf } from '../relations/gain';
import type { CampaignState, SceneLead, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { bondOf, bondTierOf, leadRank } from './profile';

/** The night-entry kind a Want visit has (set by the Want rules): a scene it opens starts romantic. */
export const WANT_VISIT_KIND = 'want_visit';

const TONE_RANK: Record<NonNullable<SceneRecord['tone']>, number> = { romantic: 1, intimate: 2 };

/** The terms of a unit's lead score (draft weights in `TUNING.bonds.lead`); `total` is the sum before clamping. */
export interface LeadParts {
  styleBase: number;
  /** `impunityWeight × (Impunity − impunityRef)`. */
  impunity: number;
  /** The `leadBonus` of her defects (not while her arc is cure). */
  defect: number;
  /** `+perYield` for each `commander_yielded` / `followed_lead` on her in the last days, capped. */
  yielded: number;
  /** `−perEnforced` for each `commander_enforced` on her in the last days, capped. */
  enforced: number;
  /** The `leadBonus` of her relationship state, only while her style is at least assertive. */
  state: number;
  total: number;
}

const YIELDS: readonly string[] = ['commander_yielded', 'followed_lead'];

/** What the lead score is made of for a named unit; `null` for a grunt or an unknown unit. Draws no rng. */
export function leadScoreParts(state: CampaignState, reg: Registries, unitId: string): LeadParts | null {
  const unit = state.squad.find((u) => u.id === unitId);
  const bond = unit ? bondOf(unit) : null;
  if (!unit || !bond) return null;
  const T = TUNING.bonds.lead;
  const rel = state.relations[unitId];
  const recent = (types: readonly string[]) => (rel?.history ?? []).filter((h) => h.kind === 'event' && types.includes(h.type) && state.day - h.day < T.windowDays).length;
  const styleBase = T.styleBase[bond.leadStyle];
  const impunity = T.impunityWeight * ((impunityOf(state, reg, unitId)?.value ?? T.impunityRef) - T.impunityRef);
  const defect = unit.defects.filter((d) => d.arc !== 'cure').reduce((n, d) => n + Number(reg.defects.get(d.id)?.leadBonus ?? 0), 0);
  const yielded = Math.min(T.yieldCap, T.perYield * recent(YIELDS));
  const enforced = -Math.min(T.enforcedCap, T.perEnforced * recent(['commander_enforced']));
  const stateBonus = leadRank(bond.leadStyle) >= leadRank('assertive') ? Number(reg.relationshipStates.get(rel?.stateId ?? '')?.leadBonus ?? 0) : 0;
  return { styleBase, impunity, defect, yielded, enforced, state: stateBonus, total: styleBase + impunity + defect + yielded + enforced + stateBonus };
}

/**
 * Who leads her scenes: `unit` at 60 or more, `commander` at 35 or less, otherwise `shared`. The score is clamped to
 * 0…100 and rounded. Draws no rng. `null` for a grunt or an unknown unit.
 */
export function decideLead(state: CampaignState, reg: Registries, unitId: string): { by: SceneLead['by']; score: number } | null {
  const parts = leadScoreParts(state, reg, unitId);
  if (!parts) return null;
  const T = TUNING.bonds.lead;
  const score = Math.round(Math.min(100, Math.max(0, parts.total)));
  return { by: score >= T.unitAtLeast ? 'unit' : score <= T.commanderAtMost ? 'commander' : 'shared', score };
}

/** Decides the lead of the open scene's one named partner and stores it (the tone was just set or raised). */
function decideSceneLead(draft: CampaignState, reg: Registries): EngineEvent[] {
  const scene = draft.scene;
  const unitId = scene?.participants[0];
  if (!scene || unitId === undefined) return [];
  const lead = decideLead(draft, reg, unitId);
  if (!lead) return [];
  scene.lead = { by: lead.by, unitId, score: lead.score };
  return [{ type: 'lead_decided', unitId, by: lead.by }];
}

/**
 * A reading says the scene has turned `romantic` or `intimate`: the scene's tone goes up to it and never down (`intimate` is
 * above `romantic`), and the lead is decided again. Ignored with romance off and in a group scene with more than one
 * named unit, where there is no one partner a tone could be about. Anything but the two words changes nothing. Draws no rng.
 */
export function raiseTone(draft: CampaignState, reg: Registries, tone: unknown): EngineEvent[] {
  const scene = draft.scene;
  if (!scene || (tone !== 'romantic' && tone !== 'intimate')) return [];
  if (!intimacyOf(draft).romance) return [];
  const named = scene.participants.filter((id) => draft.squad.find((u) => u.id === id)?.kind === 'named').length;
  if (named > 1) return [];
  if (scene.tone !== undefined && TONE_RANK[scene.tone] >= TONE_RANK[tone]) return [];
  scene.tone = tone;
  return [{ type: 'scene_tone', tone }, ...decideSceneLead(draft, reg)];
}

/**
 * At `scene/start`: a private scene with a unit whose relationship state is in the romantic tier starts `romantic`, and so
 * does one opened by a Want visit's night knock. Everything else starts with no tone.
 */
export function startTone(draft: CampaignState, reg: Registries): EngineEvent[] {
  const scene = draft.scene;
  if (!scene || scene.participants.length !== 1) return [];
  const knock = draft.calendar.nightEvent;
  const wantVisit = scene.origin === 'night' && knock !== undefined && knock.kind === WANT_VISIT_KIND && knock.unitId === scene.participants[0]
    && (scene.nightEntryId === undefined || scene.nightEntryId === knock.id);
  return bondTierOf(draft, reg, scene.participants[0]) === 'romantic' || wantVisit ? raiseTone(draft, reg, 'romantic') : [];
}

/** The one named partner of an open scene that has a lead (and romance is on); throws the reason when there is none. */
function leadPartner(draft: CampaignState): { unitId: string; name: string } {
  const lead = draft.scene?.lead;
  if (!draft.scene || !lead) throw new Error('Nobody leads this scene.');
  if (!intimacyOf(draft).romance) throw new Error('Romance is switched off.');
  const unit = draft.squad.find((u) => u.id === lead.unitId);
  if (!unit) throw new Error('Nobody leads this scene.');
  return { unitId: unit.id, name: unit.displayName };
}

/**
 * The commander follows her lead: the engine event `followed_lead` (draft: Affinity +2 at minor) lands on her, once per scene.
 * It counts as a yield for the next lead score and for Dominance Drive, but it is not `commander_yielded`: Impunity is
 * untouched. Draws no rng.
 */
export function followLead(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const { unitId } = leadPartner(draft);
  const scene = draft.scene!;
  if (scene.followed) throw new Error('You already followed her lead in this scene.');
  const events = applyEventToUnit(draft, ctx.registries, unitId, {
    type: 'followed_lead', actor: 'commander', targets: [unitId], severity: 'minor', evidence: 'followed her lead', confidence: 1,
  });
  events.push(...evaluateAutomatic(draft, ctx.registries, unitId));
  scene.followed = true;
  events.push({ type: 'lead_followed', unitId });
  return events;
}

/**
 * SET A LIMIT: a boundary the commander sets for this scene, in the fiction (not the content-category system). It is kept on the
 * scene (a directive from it follows every generation) and written as a fact tagged `limit` about her and the commander, known
 * by both. The text is cut to `TUNING.bonds.limits.sceneLimitMax`, at most five a scene.
 */
export function setSceneLimit(draft: CampaignState, text: unknown): EngineEvent[] {
  const { unitId, name } = leadPartner(draft);
  const clean = typeof text === 'string' ? text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.limits.sceneLimitMax).trim() : '';
  if (clean === '') throw new Error('A limit needs some text.');
  const scene = draft.scene!;
  const limits = scene.limits ?? [];
  if (limits.length >= TUNING.bonds.limits.sceneLimitsMax) throw new Error(`A scene takes at most ${TUNING.bonds.limits.sceneLimitsMax} limits.`);
  scene.limits = [...limits, clean];
  addFact(draft, { about: [unitId, 'commander'], text: `A boundary the commander set with ${name}: ${clean}`, tags: ['limit'], importance: 3, day: draft.day, sceneId: scene.id, knownBy: [unitId] });
  return [{ type: 'scene_limit_set', unitId, text: clean }];
}
