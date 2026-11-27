/**
 * P15a: the two skills of a hold (plan R12). The commander's endurance: xp per contact physics, levels 0–5 at the thresholds of
 * `TUNING.physics.endurance`; the level raises the capacity of a `skill` physics and never widens an opening. Her skills (`Relation.herSkill`):
 * +1 level per 8 practices of a kind, scaled by her style. `commanderSkill` and `herSkillOf` are the only readers.
 */
import type { EngineEvent } from '../dispatch';
import type { CampaignState, Relation } from '../state/types';
import { TUNING } from '../tuning';

export const levelForXp = (xp: number): number => TUNING.physics.endurance.thresholds.filter((t) => xp >= t).length;

/** The commander's endurance level (0–5) for a contact physics. */
export function commanderSkill(state: Pick<CampaignState, 'commander'>, physicsId: string): number {
  return state.commander.endurance?.[physicsId]?.level ?? 0;
}

/** The strongest endurance level the commander has in any contact physics (P16b: the reader `practice/punish.ts` uses for her trained route). */
export function enduranceLevelOf(state: Pick<CampaignState, 'commander'>): number {
  return Math.max(0, ...Object.values(state.commander.endurance ?? {}).map((e) => e?.level ?? 0));
}

/** Whether a drill of this physics was done today already (the once-a-day check of `activity/do`). */
export function trainedToday(state: Pick<CampaignState, 'commander' | 'day'>, physicsId: string): boolean {
  return state.commander.endurance?.[physicsId]?.trainedDay === state.day;
}

/** P16b: sets the xp of one physics outright (the decay's step down); the level follows. Nothing is written for a physics that has no xp. */
export function setEnduranceXp(draft: CampaignState, physicsId: string, xp: number): void {
  const row = draft.commander.endurance?.[physicsId];
  if (row === undefined) return;
  row.xp = xp;
  row.level = levelForXp(xp);
}

/** Adds xp to one physics. The event says the new level and whether it just rose. */
export function addEnduranceXp(draft: CampaignState, physicsId: string, xp: number): EngineEvent {
  const book = (draft.commander.endurance ??= {});
  const row = (book[physicsId] ??= { xp: 0, level: 0 });
  const before = row.level;
  row.xp += xp;
  row.level = levelForXp(row.xp);
  return { type: 'endurance_gained', physicsId, xp: row.xp, gained: xp, level: row.level, leveledUp: row.level > before };
}

/** A drill at base: +`training` xp, once a day for each physics. `null` when the physics was drilled today already. */
export function trainEndurance(draft: CampaignState, physicsId: string): EngineEvent | null {
  if (draft.commander.endurance?.[physicsId]?.trainedDay === draft.day) return null;
  const event = addEnduranceXp(draft, physicsId, TUNING.physics.endurance.training);
  draft.commander.endurance![physicsId]!.trainedDay = draft.day;
  return event;
}

export const HER_SKILLS = ['seal', 'weight', 'reading', 'swing', 'rhythm'] as const;
export type HerSkill = (typeof HER_SKILLS)[number];

/** Her levels (0–5) with this commander; zeros when she has learned nothing yet. */
export function herSkillOf(state: Pick<CampaignState, 'relations'>, unitId: string): Record<HerSkill, number> {
  const s = state.relations[unitId]?.herSkill;
  return { seal: s?.seal ?? 0, weight: s?.weight ?? 0, reading: s?.reading ?? 0, swing: s?.swing ?? 0, rhythm: s?.rhythm ?? 0 };
}

/** One practice of each kind: it counts by her style (drill and clinical ×1.5, affectionate ×0.7) and a level comes every 8. */
export function practise(draft: CampaignState, unitId: string, kinds: HerSkill[], styleKey: string): EngineEvent[] {
  const rel: Relation | undefined = draft.relations[unitId];
  if (!rel) return [];
  const skill = (rel.herSkill ??= { seal: 0, weight: 0, reading: 0, swing: 0, rhythm: 0, practice: {} });
  const mult = TUNING.physics.herSkill.mult[styleKey] ?? 1;
  const events: EngineEvent[] = [];
  for (const kind of kinds) {
    skill.practice[kind] = (skill.practice[kind] ?? 0) + mult;
    const level = Math.min(TUNING.physics.herSkill.cap, Math.floor(skill.practice[kind]! / TUNING.physics.herSkill.practices));
    if (level > skill[kind]) {
      skill[kind] = level;
      events.push({ type: 'her_skill_gained', unitId, skill: kind, level });
    }
  }
  return events;
}
