import type { Entry, Registries } from '../../content/types';
import { slotsLeftToday } from '../calendar';
import { generateEncounter, squadPower } from '../combat';
import { unitStats } from '../combat/stats';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { rollLoot } from '../items';
import { meetsSocialRequirements } from '../social';
import { nextId } from '../memory';
import type { Rng } from '../rng';
import type { CampaignState, LootDrop, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { applyWorldEffects } from './effects';
import { buildMission } from './missions';
import { generateNodeMap, nextNodes, nodePlayType } from './nodeMap';
import { knownRegions } from './state';
import type { ExpeditionLogEntry, ExpeditionState, Mission, QueuedIntent, WorldEffect } from './types';

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
      events.push(...enterCombat(draft, ctx, nodeId, def!, mission));
      break;
    case 'event':
      events.push(...enterEvent(draft, ctx, nodeId, isObjective, mission));
      break;
    default:
      addLog(exp, 'move', 'Nothing here.', nodeId);
  }
  // a node that resolved on the spot counts for a `reach` objective; fights and events finish it when they are decided
  const resolved = exp.phase === 'travel';
  if (resolved && (reach || (isObjective && kind === 'nothing'))) exp.objectiveDone = true;
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


const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

function enterCombat(draft: CampaignState, ctx: EngineCtx, nodeId: string, def: Entry, mission: Mission): EngineEvent[] {
  const exp = draft.expedition!;
  const reg = ctx.registries;
  const combat = def.combat as { dangerDelta: number; lootTableId: string; exposesCommander?: boolean };
  const region = reg.regions.get(exp.regionId)!;
  let encounter;
  try {
    encounter = generateEncounter(draft, reg, ctx.rng, {
      table: region.enemyTable as { categories: Record<string, number>; archetypes?: string[] },
      danger: clamp(mission.danger + combat.dangerDelta, 1, 5) as 1 | 2 | 3 | 4 | 5,
      squadPower: squadPower(draft, reg, ableParty(draft)),
      exposesCommander: combat.exposesCommander,
      lootTableId: combat.lootTableId,
    });
  } catch {
    addLog(exp, 'move', 'Nothing here.', nodeId);
    return [];
  }
  exp.pending = { kind: 'combat', nodeId, encounter, ...(draft.lastCombat ? { prevCombatId: draft.lastCombat.id } : {}) };
  exp.phase = 'combat';
  return [{ type: 'expedition_combat', nodeId, encounter }];
}

/** Ends the run (Task 11 implements the return: banking, report, slots). */
export function endExpedition(_draft: CampaignState, _ctx: EngineCtx, outcome: 'success' | 'retreated' | 'failed'): EngineEvent[] {
  throw new Error(`endExpedition(${outcome}) is not implemented until Task 11.`);
}

const nodeNumber = (exp: ExpeditionState): number => exp.path.length;

function hintEvidence(draft: CampaignState, h: { type: string; actor: string; targets: string[] }, node: number): string {
  const name = (id: string): string => (id === 'commander' ? 'the commander' : draft.squad.find((u) => u.id === id)?.displayName ?? id);
  const targets = h.targets.map(name).join(' and ');
  if (h.type === 'protected') {
    return h.targets.includes('commander') ? `Took the hits meant for the commander at node ${node}.` : `${name(h.actor)} covered ${targets} at node ${node}.`;
  }
  return `${name(h.actor)} left ${targets} exposed at node ${node}.`;
}

/**
 * Takes the result of the fight P4 played for the pending combat node: hints, loot, formation and the verdict.
 * It is consumed once (the node leaves the `combat` phase); a stale `lastCombat` of an earlier fight is refused.
 */
export function resolveCombat(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const exp = draft.expedition;
  if (!exp || exp.phase !== 'combat' || exp.pending?.kind !== 'combat') throw new Error('There is no fight to resolve.');
  if (draft.combat) throw new Error('The fight is still going.');
  const result = draft.lastCombat;
  if (!result || result.id === exp.pending.prevCombatId) throw new Error('The fight has not been fought yet.');
  const nodeId = exp.pending.nodeId;
  const node = nodeNumber(exp);

  for (const h of result.relationHints) {
    exp.hints.push({ type: h.type, actor: h.actor, targets: [...h.targets], severity: h.severity, evidence: hintEvidence(draft, h, node) } as QueuedIntent);
  }
  addLog(exp, 'combat', `Fight at node ${node}: ${result.outcome} in ${result.rounds} round(s).`, nodeId, {
    outcome: result.outcome, rounds: result.rounds, enemies: result.enemies.map((e) => e.name),
    injuries: [...result.injuries], deaths: [...result.deaths], breakdowns: [...result.breakdowns],
  });
  delete exp.pending;

  if (result.outcome !== 'won') {
    exp.phase = 'travel';
    return endExpedition(draft, ctx, result.outcome === 'lost' ? 'failed' : 'retreated');
  }
  exp.loot.push(...structuredClone(result.loot));
  const able = ableParty(draft);
  if (able.length === 0) {
    exp.phase = 'travel';
    return endExpedition(draft, ctx, 'retreated');
  }
  const front = exp.formation.front.filter((id) => able.includes(id));
  const back = exp.formation.back.filter((id) => able.includes(id));
  if (front.length === 0) front.push(...back.splice(0, 1));
  exp.formation = { front, back };
  if (nodeId === exp.map.objectiveId) exp.objectiveDone = true;
  exp.phase = 'travel';
  return [];
}

// ---------------------------------------------------------------------------------------------
// Events

type EventOption = { label: string; requires?: { stat: string; rank: number }; effects: WorldEffect[] };

/** Minor events the pack offers in this region; the ones a mission pins to its objective are never drawn at random. */
function eventPool(reg: Registries, regionId: string): Entry[] {
  const pinned = new Set([...reg.missionTemplates.values()].map((t) => t.objectiveEventId).filter((x): x is string => typeof x === 'string'));
  return [...reg.dilemmaTemplates.values()].filter((t) => {
    const regions = t.regions as string[] | undefined;
    return t.scale === 'minor' && (t.contexts as string[]).includes('expedition_event') && !pinned.has(t.id)
      && (regions === undefined || regions.includes(regionId));
  });
}

function enterEvent(draft: CampaignState, ctx: EngineCtx, nodeId: string, isObjective: boolean, mission: Mission): EngineEvent[] {
  const exp = draft.expedition!;
  const reg = ctx.registries;
  let templateId: string | undefined;
  if (isObjective) {
    const pinned = reg.missionTemplates.get(mission.templateId)?.objectiveEventId;
    if (typeof pinned === 'string' && reg.dilemmaTemplates.has(pinned)) templateId = pinned;
  }
  if (templateId === undefined) {
    const pool = eventPool(reg, exp.regionId);
    if (pool.length > 0) templateId = String(ctx.rng.pick(pool).id);
  }
  if (templateId === undefined) {
    addLog(exp, 'move', 'Nothing here.', nodeId);
    return [];
  }
  exp.pending = { kind: 'event', nodeId, templateId };
  exp.phase = 'event';
  return [{ type: 'expedition_event', nodeId, templateId }];
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function optionsOf(state: CampaignState, reg: Registries): { templateId: string; title: string; options: EventOption[] } | null {
  const pending = state.expedition?.pending;
  if (pending?.kind !== 'event') return null;
  const fixed = reg.dilemmaTemplates.get(pending.templateId)?.fixed as { title: string; options: EventOption[] } | undefined;
  return fixed ? { templateId: pending.templateId, title: fixed.title, options: fixed.options } : null;
}

/** The pending event's options with the reason each is disabled (`null` = available). */
export function eventOptions(state: CampaignState, reg: Registries): Array<{ index: number; label: string; disabled: string | null }> {
  const found = optionsOf(state, reg);
  if (!found) return [];
  const exp = state.expedition!;
  return found.options.map((o, index) => {
    let disabled: string | null = null;
    if (o.requires && !meetsSocialRequirements(state, { [o.requires.stat]: o.requires.rank })) {
      disabled = `Needs ${capital(o.requires.stat)} ${o.requires.rank}`;
    }
    if (disabled === null) {
      for (const fx of o.effects) {
        if (fx.type === 'carried_supplies' && fx.amount < 0 && exp.supplies < -fx.amount) disabled = 'Not enough supplies';
        else if (fx.type === 'resource' && fx.amount < 0 && state.resources[fx.resource] < -fx.amount) disabled = `Not enough ${fx.resource}`;
        if (disabled !== null) break;
      }
    }
    return { index, label: o.label, disabled };
  });
}

/** Picks an option of the pending event: its effects apply, the node is resolved and the run travels on. */
export function chooseOption(draft: CampaignState, ctx: EngineCtx, index: number): EngineEvent[] {
  const exp = draft.expedition;
  const found = optionsOf(draft, ctx.registries);
  if (!exp || exp.phase !== 'event' || !found || exp.pending?.kind !== 'event') throw new Error('There is no event to answer.');
  const option = eventOptions(draft, ctx.registries)[index];
  if (!Number.isInteger(index) || !option) throw new Error(`There is no option ${String(index)}.`);
  if (option.disabled !== null) throw new Error(`${option.label}: ${option.disabled}.`);
  const { nodeId, templateId } = exp.pending;
  const events = applyWorldEffects(draft, ctx, found.options[index].effects, { kind: 'event', id: templateId, label: found.title });
  addLog(exp, 'event', `${found.title}: ${option.label}.`, nodeId, { templateId, option: option.label });
  delete exp.pending;
  exp.phase = 'travel';
  if (nodeId === exp.map.objectiveId) exp.objectiveDone = true;
  events.push({ type: 'expedition_choice', nodeId, templateId, option: index, label: option.label });
  return events;
}
