/**
 * Mastery per target, the zones she has shown and the signs of her mood (P15, plan R20, spec §15.8, §15.10). The commander becomes good at HER: every act on a worship
 * target (a hold on a contact with a target, a kiss, a counted kiss) is xp for that target with that woman (`Relation.mastery`, never shown as a number); another woman starts from
 * zero. A level of mastery opens the zone, so the commander learns what she thinks of it by doing it. Nothing here draws, and nothing is written while the dynamic is off.
 *
 * `revealedExpectations` is the only reader of her profile the UI may use for what the commander knows of it: the fields a fact has shown, by the tag the fact carries
 * (`zones.ts`). `moodSigns` is what can be SEEN of her mood: her tell, a word after a shared scene today, how long her replies are. No meter.
 */
import type { Registries } from '../../content/types';
import { contactTargetOf } from '../blocking';
import { contentAllowed } from '../bonds/content';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { satisfactionOf } from './exchange';
import { type ExpectationProfile, expectationsOf } from './expectations';
import { dynamicOn, herPracticeLive } from './gate';
import { dynamicOf } from './state';
import { expectTag, zoneRevealed } from './zones';

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The level (0 to 5) her xp for this target has reached; 0 for a woman, or a target, with none. */
export function masteryLevel(state: Pick<CampaignState, 'relations'>, unitId: string, targetId: string): number {
  const xp = state.relations[unitId]?.mastery?.[targetId] ?? 0;
  return TUNING.mastery.levels.filter((t) => xp >= t).length;
}

/**
 * `xp` for the commander's acts on one target with one woman. Emits `mastery_gained { unitId, targetId, level }` once for each level the xp crosses, and, when it crosses the level that
 * opens a zone (`TUNING.mastery.revealLevel`), `zone_revealed { via: 'mastery' }` for a target whose zone nothing has shown yet (the memory rule writes its fact). Nothing while the
 * dynamic is off, for anyone who is not a named soldier in service with a relation, for a target the registry does not have, and for xp that is not positive.
 */
export function addMastery(draft: CampaignState, reg: Registries, unitId: string, targetId: string, xp: number): EngineEvent[] {
  const unit = draft.squad.find((u) => u.id === unitId);
  const rel = draft.relations[unitId];
  if (!dynamicOn(draft, reg) || unit === undefined || unit.kind !== 'named' || !isLiving(unit) || rel === undefined || !reg.worshipTargets.has(targetId) || !(xp > 0)) return [];
  const before = masteryLevel(draft, unitId, targetId);
  rel.mastery = { ...rel.mastery, [targetId]: round4((rel.mastery?.[targetId] ?? 0) + xp) };
  const after = masteryLevel(draft, unitId, targetId);
  const events: EngineEvent[] = [];
  for (let level = before + 1; level <= after; level++) events.push({ type: 'mastery_gained', unitId, targetId, level });
  const open = TUNING.mastery.revealLevel;
  const target = reg.worshipTargets.get(targetId)!;
  if (before < open && after >= open && !zoneRevealed(draft, unitId, targetId) && contentAllowed(draft, reg, target, unitId)) {
    events.push({
      type: 'zone_revealed', unitId, targetId, attitude: expectationsOf(draft, reg, unitId).worship?.[targetId]?.attitude ?? 'indifferent', what: String(target.label).toLowerCase(), via: 'mastery',
    });
  }
  return events;
}

/** The act of the commander's on her target, in xp: `act`, and `how` more when her `how` for it is set and the act was clean (a hold that ended `released` or `checked`, a kiss). */
function xpFor(draft: CampaignState, reg: Registries, unitId: string, targetId: string, clean: boolean): number {
  const how = expectationsOf(draft, reg, unitId).worship?.[targetId]?.how;
  return TUNING.mastery.act + (clean && how !== undefined && how.trim() !== '' ? TUNING.mastery.how : 0);
}

/**
 * After every action: each act on a target counts for the woman it was done to. A contact physics that ended (`physics_outcome`, which names its target), a kiss (`mouth_act`) and the end
 * of counted kisses (`mouth_act_done`) are acts; the other mouth acts run a physics whose outcome is the act, and the start of a count is not one. An act with no target (a contact that
 * has none, no contact in the scene) counts for nobody. Registered with the dispatcher by `actions/dynamic.ts`; draws nothing.
 */
export function masteryFromEvents(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) return [];
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type === 'physics_outcome' && typeof e.targetId === 'string' && typeof e.holderId === 'string') {
      out.push(...addMastery(draft, reg, e.holderId, e.targetId, xpFor(draft, reg, e.holderId, e.targetId, TUNING.mastery.clean.includes(String(e.result)))));
    } else if ((e.type === 'mouth_act' && e.kind === 'kiss') || (e.type === 'mouth_act_done' && e.kind === 'counted')) {
      const target = contactTargetOf(draft.scene, reg);
      if (target !== undefined && typeof e.unitId === 'string') out.push(...addMastery(draft, reg, e.unitId, target, xpFor(draft, reg, e.unitId, target, true)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// What the commander has been shown

/**
 * Her profile as far as the commander has been shown it: only the fields a fact of hers has shown (a fact the commander has, about her, tagged for the field). A worship or a body
 * entry is shown whole once its zone is, `tells`, `holdsUntil`, `scent` and `traits` as fields. Her offset and her moment options are never shown (they are not read from a fact) and
 * her build and hair are what the commander sees of her, not what she feels (the body map draws them from the profile directly). `{}` when nothing was shown. Reads only.
 */
export function revealedExpectations(state: CampaignState, reg: Registries, unitId: string): Partial<ExpectationProfile> {
  const all = expectationsOf(state, reg, unitId);
  const tags = new Set(state.memory.facts.filter((f) => f.about.includes(unitId) && f.hiddenFromCommander !== true).flatMap((f) => f.tags));
  const out: Partial<ExpectationProfile> = {};
  if (all.tells !== undefined && tags.has(expectTag('tells'))) out.tells = structuredClone(all.tells);
  if (all.holdsUntil !== undefined && tags.has(expectTag('holdsUntil'))) out.holdsUntil = all.holdsUntil;
  if (all.scent !== undefined && tags.has(expectTag('scent'))) out.scent = structuredClone(all.scent);
  if (all.traits !== undefined && tags.has(expectTag('traits'))) out.traits = [...all.traits];
  const worship = Object.entries(all.worship ?? {}).filter(([id]) => tags.has(expectTag('worship', id)));
  if (worship.length > 0) out.worship = Object.fromEntries(worship.map(([id, w]) => [id, { ...w }]));
  const body = Object.entries(all.body ?? {}).filter(([id]) => tags.has(expectTag('body', id)));
  if (body.length > 0) out.body = Object.fromEntries(body);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Mood reading

/** Has the commander been with her in a scene today: the open one, or one that ended today. */
function sharedToday(state: CampaignState, unitId: string): boolean {
  const scene = state.scene;
  if (scene !== undefined && scene.day === state.day && scene.participants.includes(unitId)) return true;
  return (state.memory.scenes ?? []).some((m) => m.day === state.day && m.participants?.includes(unitId) === true);
}

/**
 * What can be seen of her mood (spec §15.8), in words and never a number: her tell for it once the profile's tells have been shown (the irritation one while she is frustrated, the
 * pleasure one while she is content); a word for how she stands ("content", "even", "irritated") only after the commander shared a scene with her today; and how long her last
 * replies in the thread are ("her replies are short" / "long"), when the thread has enough of them. Empty while the dynamic is off and for a woman with no dynamic of her own.
 */
export function moodSigns(state: CampaignState, reg: Registries, unitId: string): string[] {
  if (!dynamicOn(state, reg) || dynamicOf(state, unitId) === undefined || !herPracticeLive(state, unitId)) return [];
  const T = TUNING.mastery.signs;
  const mood = satisfactionOf(state, reg, unitId);
  const out: string[] = [];
  const tells = revealedExpectations(state, reg, unitId).tells;
  const tell = mood === 'frustrated' ? tells?.irritation : mood === 'content' ? tells?.pleasure : undefined;
  if (tell !== undefined) out.push(tell);
  if (sharedToday(state, unitId)) out.push(mood === 'frustrated' ? 'irritated' : mood === 'content' ? 'content' : 'even');
  const replies = (state.dms[unitId] ?? []).filter((m) => m.from === unitId && state.day - m.day <= T.recentDays).slice(-T.replies);
  if (replies.length >= T.replies) {
    const average = replies.reduce((sum, m) => sum + m.text.length, 0) / replies.length;
    if (average < T.short) out.push('her replies are short');
    else if (average > T.long) out.push('her replies are long');
  }
  return out;
}
