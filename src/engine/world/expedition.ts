import type { Entry, Registries } from '../../content/types';
import { slotsLeftToday } from '../calendar';
import { unitStats } from '../combat/stats';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { rollLoot } from '../items';
import { nextId } from '../memory';
import type { Rng } from '../rng';
import type { CampaignState, LootDrop, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { buildMission } from './missions';
import { generateNodeMap, nextNodes, nodePlayType } from './nodeMap';
import { knownRegions } from './state';
import type { ExpeditionLogEntry, ExpeditionState, Mission } from './types';

export interface Formation { front: string[]; back: string[] }

export interface StartExpedition {
  missionId?: string;
  poi?: { regionId: string; poiId: string };
  unitIds: string[];
  formation: Formation;
  supplies: number;
}


/** Party units that can still act: living and `active` (not injured, not out). */
export function ableParty(state: CampaignState): string[] {
  return (state.expedition?.party ?? []).filter((id) => {
    const u = state.squad.find((x) => x.id === id);
    return u !== undefined && isLiving(u) && u.status === 'active';
  });
}

/** The formation must list exactly `ids`, with at most `maxPerRow` per row and a unit in front. */
export function formationProblem(ids: string[], f: Formation): string | null {
  const listed = [...(f?.front ?? []), ...(f?.back ?? [])];
  if (listed.length !== ids.length || new Set(listed).size !== listed.length || !ids.every((id) => listed.includes(id))) {
    return 'The formation must list exactly the units that go.';
  }
  if (f.front.length > TUNING.combat.maxPerRow || f.back.length > TUNING.combat.maxPerRow) return `A row holds at most ${TUNING.combat.maxPerRow} units.`;
  if (f.front.length === 0) return 'The front row cannot be empty.';
  return null;
}

const regionName = (r: Entry): string => String(r.name);

/** Why this expedition cannot start now, or `null`. Checked in the order of the rules; nothing is changed. */
export function checkExpedition(state: CampaignState, reg: Registries, p: StartExpedition): string | null {
  if (state.expedition) return 'An expedition is already under way.';
  if (state.combat) return 'A combat is open: finish it first.';
  if (state.scene) return 'A scene is open: end it first.';
  if (state.calendar.pendingScene) return 'A talk still holds the slot: end it first.';

  if ((p.missionId === undefined) === (p.poi === undefined)) return 'Choose exactly one of a mission or a point of interest.';
  let regionId: string;
  let templateId: string;
  if (p.missionId !== undefined) {
    const m = state.missions.offered.find((x) => x.id === p.missionId);
    if (!m) return `Mission "${p.missionId}" is not on the board.`;
    regionId = m.regionId;
    templateId = m.templateId;
  } else {
    regionId = p.poi!.regionId;
    const region = reg.regions.get(regionId);
    if (!region) return `Region "${regionId}" no longer exists.`;
    if (!knownRegions(state, reg).some((r) => r.id === regionId)) return `Region "${regionId}" is not known yet.`;
    const poi = (region.pointsOfInterest as Array<{ id: string; templateId: string }>).find((x) => x.id === p.poi!.poiId);
    if (!poi) return `Region "${regionId}" has no point of interest "${p.poi!.poiId}".`;
    const last = state.world.regions[regionId]?.poi?.[poi.id];
    if (last !== undefined && state.day < last + TUNING.world.poiCooldownDays) {
      return `That point of interest cannot be run again before day ${last + TUNING.world.poiCooldownDays}.`;
    }
    templateId = poi.templateId;
  }
  const region = reg.regions.get(regionId);
  if (!region) return `Region "${regionId}" no longer exists.`;
  const tpl = reg.missionTemplates.get(templateId);
  if (!tpl) return `The mission template "${templateId}" no longer exists.`;
  if (p.poi !== undefined && !(tpl.sources as string[]).includes('side')) return `The template "${templateId}" is not a side mission.`;

  const slots = region.travelSlots as 2 | 3;
  if (state.slot === 'night') return 'Nobody leaves at night.';
  if (slotsLeftToday(state.slot) < slots) {
    return `${regionName(region)} takes ${slots} slots: leave in the Morning${slots === 2 ? ' or Afternoon' : ''}.`;
  }

  const ids = p.unitIds ?? [];
  if (ids.length < 1 || ids.length > TUNING.expedition.partyMax) return `An expedition takes 1 to ${TUNING.expedition.partyMax} units.`;
  if (new Set(ids).size !== ids.length) return 'A unit was listed twice.';
  for (const id of ids) {
    const u = state.squad.find((x) => x.id === id);
    if (!u) return `Unknown unit "${id}".`;
    if (!isLiving(u) || u.status !== 'active') return `${u.displayName} is not available (${u.status}).`;
    if (u.breakdown) return `${u.displayName} is in a breakdown.`;
    if (!state.roster.activeIds.includes(id)) return `${u.displayName} is not on the active roster.`;
  }
  const formation = formationProblem(ids, p.formation);
  if (formation) return formation;
  const maxSupplies = Math.min(state.resources.supplies, TUNING.expedition.suppliesMax);
  if (!Number.isInteger(p.supplies) || p.supplies < 0 || p.supplies > maxSupplies) {
    return `Supplies to bring must be a whole number from 0 to ${maxSupplies}.`;
  }
  return null;
}

/** Appends a log line (numbered, trimmed to the newest `logMax`). */
export function addLog(exp: ExpeditionState, kind: ExpeditionLogEntry['kind'], text: string, nodeId?: string, data?: Record<string, unknown>): ExpeditionLogEntry {
  const entry: ExpeditionLogEntry = { n: (exp.log.at(-1)?.n ?? 0) + 1, kind, text };
  if (nodeId !== undefined) entry.nodeId = nodeId;
  if (data !== undefined) entry.data = data;
  exp.log.push(entry);
  if (exp.log.length > TUNING.expedition.logMax) exp.log.splice(0, exp.log.length - TUNING.expedition.logMax);
  return entry;
}

/** Opens an expedition: the mission becomes active, supplies leave the stores, the map is drawn. Slots are spent on return. */
export function startExpedition(draft: CampaignState, ctx: EngineCtx, p: StartExpedition): EngineEvent[] {
  const reg = ctx.registries;
  let mission: Mission;
  if (p.missionId !== undefined) {
    const i = draft.missions.offered.findIndex((m) => m.id === p.missionId);
    [mission] = draft.missions.offered.splice(i, 1);
  } else {
    const { regionId, poiId } = p.poi!;
    const poi = (reg.regions.get(regionId)!.pointsOfInterest as Array<{ id: string; templateId: string }>).find((x) => x.id === poiId)!;
    mission = buildMission(draft, ctx, { templateId: poi.templateId, regionId, source: 'side', poiId });
    const rs = draft.world.regions[regionId] ?? { known: true };
    draft.world.regions[regionId] = { ...rs, poi: { ...(rs.poi ?? {}), [poiId]: draft.day } };
  }
  mission.status = 'active';
  draft.missions.active.push(mission);
  draft.resources.supplies -= p.supplies;

  const region = reg.regions.get(mission.regionId)!;
  const revealDefect = p.unitIds.some((id) => {
    const u = draft.squad.find((x) => x.id === id);
    return u?.defects.some((d) => (reg.defects.get(d.id)?.expedition as { reveal?: number } | undefined)?.reveal === 1) === true;
  });
  const exp: ExpeditionState = {
    id: nextId(draft, 'exp'),
    missionId: mission.id,
    regionId: mission.regionId,
    day: draft.day,
    slots: region.travelSlots as 2 | 3,
    party: [...p.unitIds],
    formation: { front: [...p.formation.front], back: [...p.formation.back] },
    supplies: p.supplies,
    map: generateNodeMap(reg, ctx.rng, { regionId: mission.regionId, danger: mission.danger }),
    at: null,
    path: [],
    phase: 'travel',
    loot: [],
    log: [],
    hints: [],
    objectiveDone: false,
    reveal: 1 + (revealDefect ? 1 : 0) + (mission.scouted === true ? 1 : 0),
  };
  addLog(exp, 'start', `Departed for ${regionName(region)}: ${mission.title}.`);
  draft.expedition = exp;
  return [{ type: 'expedition_started', expeditionId: exp.id, missionId: mission.id, regionId: mission.regionId, party: exp.party, slots: exp.slots }];
}

/** What an `unknown` node turns out to be: a draw over its `resolvesTo` weights, skipping types the pack no longer has. */
export function resolveUnknownType(reg: Registries, rng: Rng, typeId: string): string | null {
  const weights = Object.entries((reg.nodeTypes.get(typeId)?.resolvesTo as Record<string, number> | undefined) ?? {})
    .filter(([id, w]) => reg.nodeTypes.has(id) && w > 0);
  const total = weights.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = rng.float() * total;
  return (weights.find(([, w]) => (r -= w) < 0) ?? weights[weights.length - 1])[0];
}

const describeLoot = (drops: LootDrop[], reg: Registries): string => {
  if (drops.length === 0) return 'nothing';
  return drops.map((d) => (d.kind === 'item' ? String(reg.items.get(d.item.itemId)?.name ?? d.item.itemId) : `${d.amount} ${d.kind}`)).join(', ');
};

function missionOf(draft: CampaignState): Mission {
  const m = draft.missions.active.find((x) => x.id === draft.expedition!.missionId);
  if (!m) throw new Error('The mission of this expedition is gone.');
  return m;
}

/** Enters a connected node of the next layer and resolves it (cache, rest, nothing); combat and events are Task 10. */
export function moveTo(draft: CampaignState, ctx: EngineCtx, nodeId: string): EngineEvent[] {
  const exp = draft.expedition;
  if (!exp) throw new Error('There is no expedition.');
  if (exp.phase !== 'travel') throw new Error('Finish what is happening here first.');
  if (!nextNodes(exp.map, exp.at).includes(nodeId)) throw new Error(`Node "${nodeId}" cannot be reached from here.`);
  const reg = ctx.registries;
  const mission = missionOf(draft);
  const node = exp.map.nodes[nodeId];
  node.visited = true;
  exp.at = nodeId;
  exp.path.push(nodeId);
  const events: EngineEvent[] = [{ type: 'expedition_moved', nodeId }];

  let playType = nodePlayType(exp.map, nodeId, mission);
  if (reg.nodeTypes.get(playType)?.kind === 'unknown') {
    const resolved = resolveUnknownType(reg, ctx.rng, playType);
    if (resolved !== null) node.resolvedType = resolved;
    playType = resolved ?? playType;
  }
  const def = reg.nodeTypes.get(playType);
  const isObjective = nodeId === exp.map.objectiveId;
  const reach = isObjective && mission.objective.condition === 'reach';
  const kind = def && def.kind !== 'unknown' ? String(def.kind) : 'nothing';
  addLog(exp, 'move', `Moved to ${def ? String(def.name) : 'an empty place'}.`, nodeId);
  events.push({ type: 'expedition_node', nodeId, nodeType: playType, kind });

  switch (kind) {
    case 'cache': {
      if (!reg.lootTables.has('loot_cache')) {
        addLog(exp, 'cache', 'Nothing here.', nodeId);
        break;
      }
      const drops = rollLoot(draft, reg, ctx.rng, 'loot_cache');
      exp.loot.push(...drops);
      addLog(exp, 'cache', `Cache opened: ${describeLoot(drops, reg)}.`, nodeId, { drops: drops.length });
      break;
    }
    case 'rest': {
      const rest = def!.rest as { suppliesPerUnit: number; hpPct: number; stress: number };
      const able = ableParty(draft);
      const need = rest.suppliesPerUnit * able.length;
      if (exp.supplies < need) {
        addLog(exp, 'rest', 'No supplies to rest.', nodeId, { need, have: exp.supplies });
        break;
      }
      exp.supplies -= need;
      for (const id of able) {
        const u = draft.squad.find((x) => x.id === id) as Unit;
        const max = unitStats(draft, reg, u).hp;
        u.currentHp = Math.min(max, u.currentHp + Math.round((max * rest.hpPct) / 100));
        u.stress = Math.max(0, Math.min(100, u.stress + rest.stress));
      }
      addLog(exp, 'rest', `The squad rests (${need} supplies).`, nodeId, { spent: need });
      break;
    }
    case 'combat':
    case 'event':
      throw new Error(`Expedition: ${kind} nodes are not implemented yet.`);
    default:
      addLog(exp, 'move', 'Nothing here.', nodeId);
  }
  if (reach || (isObjective && kind === 'nothing')) exp.objectiveDone = true;
  return events;
}

/** Changes the rows between nodes (the able party only), while travelling or before a pending fight starts. */
export function setFormation(draft: CampaignState, formation: Formation): void {
  const exp = draft.expedition;
  if (!exp) throw new Error('There is no expedition.');
  const idle = exp.phase === 'travel' || (exp.pending?.kind === 'combat' && !draft.combat);
  if (!idle) throw new Error('The formation cannot change right now.');
  const problem = formationProblem(ableParty(draft), formation);
  if (problem) throw new Error(problem);
  exp.formation = { front: [...formation.front], back: [...formation.back] };
}

export const TREAT_KINDS = ['patch', 'calm'] as const;
export type TreatKind = (typeof TREAT_KINDS)[number];

/** Spends one carried supply on a unit: `patch` heals 20 % of max HP, `calm` removes 10 stress (not during a breakdown). */
export function treat(draft: CampaignState, ctx: EngineCtx, unitId: string, kind: TreatKind): EngineEvent[] {
  const exp = draft.expedition;
  if (!exp) throw new Error('There is no expedition.');
  if (exp.phase !== 'travel') throw new Error('Nobody can be treated right now.');
  if (!(TREAT_KINDS as readonly string[]).includes(kind)) throw new Error(`Unknown treatment "${String(kind)}".`);
  if (!ableParty(draft).includes(unitId)) throw new Error(`Unit "${unitId}" cannot be treated.`);
  if (exp.supplies < 1) throw new Error('No supplies to spend.');
  const u = draft.squad.find((x) => x.id === unitId) as Unit;
  if (kind === 'calm' && u.breakdown) throw new Error(`${u.displayName} is in a breakdown and cannot be calmed.`);
  exp.supplies -= 1;
  if (kind === 'patch') {
    const max = unitStats(draft, ctx.registries, u).hp;
    u.currentHp = Math.min(max, u.currentHp + Math.round((max * TUNING.expedition.treat.hpPct) / 100));
  } else {
    u.stress = Math.max(0, u.stress - TUNING.expedition.treat.stress);
  }
  addLog(exp, 'treat', `${u.displayName}: ${kind === 'patch' ? 'wounds patched' : 'calmed down'}.`, undefined, { unitId, kind });
  return [{ type: 'expedition_treated', unitId, kind }];
}

