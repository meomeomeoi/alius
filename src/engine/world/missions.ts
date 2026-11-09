import type { Entry, Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { facilityEffect } from '../economy';
import { bankLoot, rollLoot } from '../items';
import { nextId } from '../memory';
import type { CampaignState, LootDrop } from '../state/types';
import { TUNING } from '../tuning';
import { applyWorldEffects } from './effects';
import { knownRegions } from './state';
import type { Mission, MissionRewards, MissionSource, WorldEffect } from './types';

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

export interface MissionOffer {
  templateId: string;
  regionId: string;
  source: MissionSource;
  danger?: number;
  title?: string;
  brief?: string;
  objectiveNode?: string;
  deadlineDays?: number;
  rewardsTier?: string;
  threadId?: string;
  spineBeat?: string;
  scouted?: boolean;
}

type Template = Entry & {
  sources: MissionSource[]; regions?: string[]; objectives: Array<{ node: string; condition: 'win' | 'reach' }>;
  dangerRange: [number, number]; tiers: string[]; titles: string[]; briefs: string[]; failureEffects: WorldEffect[];
};

/** Why an offer cannot be made, or `null`. The board limit is not part of it (see `offerMission`). */
export function checkOffer(state: CampaignState, reg: Registries, o: MissionOffer): string | null {
  const tpl = reg.missionTemplates.get(o.templateId) as Template | undefined;
  if (!tpl) return `Unknown mission template "${o.templateId}".`;
  const region = reg.regions.get(o.regionId);
  if (!region) return `Unknown region "${o.regionId}".`;
  if (!knownRegions(state, reg).some((r) => r.id === o.regionId)) return `Region "${o.regionId}" is not known yet.`;
  if (!tpl.sources.includes(o.source)) return `Template "${o.templateId}" does not allow source "${o.source}".`;
  if (tpl.regions && !tpl.regions.includes(o.regionId)) return `Template "${o.templateId}" is not used in region "${o.regionId}".`;
  if (o.objectiveNode !== undefined && !tpl.objectives.some((x) => x.node === o.objectiveNode)) {
    return `Template "${o.templateId}" has no objective node "${o.objectiveNode}".`;
  }
  if (o.rewardsTier !== undefined && !tpl.tiers.includes(o.rewardsTier)) return `Template "${o.templateId}" has no reward tier "${o.rewardsTier}".`;
  if (o.threadId !== undefined && !state.world.threads.some((t) => t.id === o.threadId && t.status === 'open')) {
    return `Thread "${o.threadId}" is not an open thread.`;
  }
  if (o.source === 'story' && o.spineBeat === undefined) return 'A story mission needs a spine beat.';
  const dup = [...state.missions.offered, ...state.missions.active].some((m) => m.templateId === o.templateId && m.regionId === o.regionId);
  if (dup) return `A mission "${o.templateId}" in "${o.regionId}" is already on the board or under way.`;
  return null;
}

/** Missions the board can still take (side and rumor missions only; command and story offers always fit). */
export function boardRoom(state: CampaignState, reg: Registries): number {
  return Math.max(0, facilityEffect(state, reg, 'comms', 'missionBoardSize') - state.missions.offered.length);
}

export function missionById(state: CampaignState, id: string): Mission | undefined {
  return state.missions.offered.find((m) => m.id === id) ?? state.missions.active.find((m) => m.id === id);
}

const lowestTier = (reg: Registries, tiers: string[]): string =>
  [...tiers].sort((a, b) => ((reg.rewardTiers.get(a)?.rank as number | undefined) ?? 99) - ((reg.rewardTiers.get(b)?.rank as number | undefined) ?? 99))[0];

/**
 * Puts a mission on the board. Defaults (danger, texts, first objective, lowest tier, deadline) are filled from the
 * template. A full board refuses `side`/`rumor` offers; a `command`/`story` offer pushes out the oldest `side`/`rumor` one.
 * Returns `{ mission: null }` and no events when the offer is invalid or refused.
 */
export function offerMission(draft: CampaignState, ctx: EngineCtx, o: MissionOffer): { mission: Mission | null; events: EngineEvent[] } {
  const reg = ctx.registries;
  if (checkOffer(draft, reg, o) !== null) return { mission: null, events: [] };
  const tpl = reg.missionTemplates.get(o.templateId) as Template;
  const region = reg.regions.get(o.regionId)!;
  const events: EngineEvent[] = [];

  if (boardRoom(draft, reg) === 0) {
    if (o.source === 'side' || o.source === 'rumor') return { mission: null, events: [] };
    const i = draft.missions.offered.findIndex((m) => m.source === 'side' || m.source === 'rumor');
    if (i >= 0) {
      const [gone] = draft.missions.offered.splice(i, 1);
      events.push({ type: 'mission_expired', missionId: gone.id, reason: 'pushed_out' });
    }
  }

  const pick = (list: string[]): string => list[ctx.rng.int(0, list.length - 1)];
  const objective = tpl.objectives.find((x) => x.node === o.objectiveNode) ?? tpl.objectives[0];
  const mission: Mission = {
    id: nextId(draft, 'm'),
    source: o.source,
    templateId: o.templateId,
    title: (o.title ?? pick(tpl.titles)).slice(0, TUNING.director.titleMax),
    brief: (o.brief ?? pick(tpl.briefs)).slice(0, TUNING.director.briefMax),
    regionId: o.regionId,
    danger: clamp(Math.round(o.danger ?? (region.danger as number)), tpl.dangerRange[0], tpl.dangerRange[1]) as Mission['danger'],
    objective: { node: objective.node, condition: objective.condition },
    offeredDay: draft.day,
    rewardsTier: o.rewardsTier ?? lowestTier(reg, tpl.tiers),
    failureEffects: structuredClone(tpl.failureEffects),
    status: 'offered',
  };
  if (o.source !== 'story') {
    mission.deadlineDay = draft.day + clamp(o.deadlineDays ?? 7, TUNING.world.deadlineMinDays, TUNING.world.deadlineMaxDays);
  }
  if (o.threadId !== undefined) mission.threadId = o.threadId;
  if (o.spineBeat !== undefined) mission.spineBeat = o.spineBeat;
  if (o.scouted === true) mission.scouted = true;
  draft.missions.offered.push(mission);
  events.push({ type: 'mission_offered', missionId: mission.id, source: mission.source, regionId: mission.regionId, title: mission.title });
  return { mission, events };
}

/** Credits and plyx inside the tier's ranges, loot from its table, faction from template + tier, clearance from the template. */
export function rollRewards(draft: CampaignState, ctx: EngineCtx, m: Mission): { rewards: MissionRewards; drops: LootDrop[] } {
  const reg = ctx.registries;
  const tpl = reg.missionTemplates.get(m.templateId) as Template | undefined;
  const tier = reg.rewardTiers.get(m.rewardsTier);
  const rewards: MissionRewards = { credits: 0, plyx: 0, items: [] };
  const drops: LootDrop[] = [];
  if (tier) {
    const [cLo, cHi] = tier.credits as [number, number];
    const [pLo, pHi] = tier.plyx as [number, number];
    rewards.credits = ctx.rng.int(cLo, cHi);
    rewards.plyx = ctx.rng.int(pLo, pHi);
    if (typeof tier.lootTableId === 'string' && reg.lootTables.has(tier.lootTableId)) {
      for (let i = 0; i < ((tier.lootRolls as number | undefined) ?? 1); i++) drops.push(...rollLoot(draft, reg, ctx.rng, tier.lootTableId));
    }
  }
  const factionId = tpl?.factionId as string | undefined;
  const amount = (tier?.faction as number | undefined) ?? 0;
  if (factionId !== undefined && amount > 0) rewards.faction = { id: factionId, amount };
  if (typeof tpl?.clearance === 'number') rewards.clearance = tpl.clearance;
  for (const d of drops) {
    if (d.kind === 'item') rewards.items.push(String(reg.items.get(d.item.itemId)?.name ?? d.item.itemId));
  }
  return { rewards, drops };
}

type CompletedHook = (draft: CampaignState, ctx: EngineCtx, mission: Mission) => EngineEvent[];
const completedHooks: CompletedHook[] = [];
/** Lets the spine module hear about finished missions without a circular import. */
export function registerMissionCompletedHook(fn: CompletedHook): void {
  completedHooks.push(fn);
}

function archive(draft: CampaignState, m: Mission): void {
  draft.missions.completed.push(m);
  if (draft.missions.completed.length > TUNING.world.completedMax) {
    draft.missions.completed.splice(0, draft.missions.completed.length - TUNING.world.completedMax);
  }
}

/** An active mission succeeds: rewards are banked once, faction and clearance applied, `onSuccess` effects run. */
export function completeMission(draft: CampaignState, ctx: EngineCtx, missionId: string): EngineEvent[] {
  const i = draft.missions.active.findIndex((m) => m.id === missionId);
  if (i < 0) return [];
  const [m] = draft.missions.active.splice(i, 1);
  const tpl = ctx.registries.missionTemplates.get(m.templateId) as Template | undefined;
  const { rewards, drops } = rollRewards(draft, ctx, m);
  m.status = 'completed';
  m.outcomeDay = draft.day;
  m.rewards = rewards;
  archive(draft, m);

  const effects: WorldEffect[] = [];
  if (rewards.credits > 0) effects.push({ type: 'resource', resource: 'credits', amount: rewards.credits });
  if (rewards.plyx > 0) effects.push({ type: 'resource', resource: 'plyx', amount: rewards.plyx });
  if (rewards.faction) effects.push({ type: 'faction', factionId: rewards.faction.id, amount: rewards.faction.amount });
  if (rewards.clearance !== undefined && rewards.clearance >= 1 && rewards.clearance <= 3) {
    effects.push({ type: 'clearance', tier: rewards.clearance as 1 | 2 | 3 });
  }
  const events: EngineEvent[] = [];
  events.push(...applyWorldEffects(draft, ctx, effects, { kind: 'mission', id: m.id, label: m.title }));
  events.push(...bankLoot(draft, drops));
  if (tpl?.onSuccess) events.push(...applyWorldEffects(draft, ctx, tpl.onSuccess as WorldEffect[], { kind: 'mission', id: m.id, label: m.title }));
  events.push({ type: 'mission_completed', missionId: m.id, title: m.title, rewards });
  for (const hook of completedHooks) events.push(...hook(draft, ctx, m));
  return events;
}

/** A retreat or lost fight: the mission goes back on the board (a point-of-interest run is simply dropped). */
export function releaseMission(draft: CampaignState, missionId: string): void {
  const i = draft.missions.active.findIndex((m) => m.id === missionId);
  if (i < 0) return;
  const [m] = draft.missions.active.splice(i, 1);
  if (m.poiId !== undefined) return;
  m.status = 'offered';
  draft.missions.offered.push(m);
}

/** Day-end step: expired deadlines fail their missions; missions whose content vanished are dropped without effects. */
export function runDeadlines(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const m of [...draft.missions.offered]) {
    const gone = !reg.missionTemplates.has(m.templateId) || !reg.regions.has(m.regionId);
    const late = m.deadlineDay !== undefined && m.deadlineDay <= draft.day;
    if (!gone && !late) continue;
    draft.missions.offered = draft.missions.offered.filter((x) => x.id !== m.id);
    if (gone) {
      events.push({ type: 'mission_expired', missionId: m.id, reason: 'content_removed' });
      continue;
    }
    m.status = 'failed';
    m.outcomeDay = draft.day;
    archive(draft, m);
    events.push({ type: 'mission_failed', missionId: m.id, title: m.title });
    events.push(...applyWorldEffects(draft, ctx, m.failureEffects, { kind: 'mission', id: m.id, label: m.title }));
  }
  return events;
}
