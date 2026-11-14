import type { Registries } from '../../content/types';
import type { Rng } from '../rng';
import { activeRosterUnits, isLiving } from '../economy';
import { itemStats, wornItems } from '../items';
import { getSynergies } from '../relations';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { arcScale } from '../arcs';
import { commanderProfile } from '../commander/profile';
import { commanderMaxHp, presenceKind } from './crisis';
import { activePassives, amplify, makeCtx } from './effects';
import { ownedPassiveIds, ownedUpgrades, unitSkillIds } from './skills';
import { spawnEnemy, spawnMutineer } from './spawn';
import { unitStats } from './stats';
import { dispositionFor } from '../worldOptions';
import { makeBreakdown } from './stress';
import { skillById } from './targeting';
import type { CombatState, Combatant, EffectSpec, StartPayload } from './types';

/** Why a combat cannot start with this payload, or null. */
export function checkStart(state: CampaignState, reg: Registries, p: StartPayload): string | null {
  if (state.combat) return 'A combat is already open.';
  const front = p?.formation?.front ?? [];
  const back = p?.formation?.back ?? [];
  const ids = [...front, ...back];
  if (ids.length < 1 || ids.length > TUNING.rosterActiveMax) return `A combat fields 1 to ${TUNING.rosterActiveMax} units.`;
  if (new Set(ids).size !== ids.length) return 'A unit was listed twice.';
  if (front.length > TUNING.combat.maxPerRow || back.length > TUNING.combat.maxPerRow) return `A row holds at most ${TUNING.combat.maxPerRow} units.`;
  const active = new Set(activeRosterUnits(state).map((u) => u.id));
  for (const id of ids) {
    const u = state.squad.find((x) => x.id === id);
    if (!u) return `Unknown unit "${id}".`;
    if (!isLiving(u) || u.status !== 'active' || !active.has(id)) return `${u.displayName} is not available (${u.status}).`;
    if (!reg.roles.has(u.roleId)) return `${u.displayName} has an unknown role "${u.roleId}".`;
  }
  const enemies = p.encounter?.enemies ?? [];
  const mutineers = p.encounter?.mutineers ?? [];
  if (enemies.length + mutineers.length < 1 || enemies.length + mutineers.length > 6) return 'An encounter has 1 to 6 enemies.';
  const seen = new Set<string>();
  for (const m of mutineers) {
    const u = state.squad.find((x) => x.id === m.unitId);
    if (!u) return `Unknown mutineer "${String(m.unitId)}".`;
    if (!isLiving(u)) return `${u.displayName} is no longer in the squad and cannot fight.`;
    if (ids.includes(m.unitId)) return `${u.displayName} cannot fight on both sides.`;
    if (seen.has(m.unitId)) return `${u.displayName} was listed twice.`;
    seen.add(m.unitId);
    if (!reg.roles.has(u.roleId)) return `${u.displayName} has an unknown role "${u.roleId}".`;
    if (m.row !== undefined && m.row !== 'front' && m.row !== 'back') return `Mutineer ${u.displayName} has an unknown row.`;
  }
  for (const e of enemies) {
    if (!reg.enemies.has(e.enemyId)) return `Unknown enemy "${e.enemyId}".`;
    if (!Number.isInteger(e.level) || e.level < 1 || e.level > 99) return `Enemy "${e.enemyId}" needs a level from 1 to 99.`;
    if (e.row !== undefined && e.row !== 'front' && e.row !== 'back') return `Enemy "${e.enemyId}" has an unknown row.`;
    for (const a of e.affixes) if (reg.affixes.get(a)?.appliesTo !== 'enemy') return `Unknown enemy affix "${a}".`;
  }
  if (p.encounter.lootTableId !== undefined && !reg.lootTables.has(p.encounter.lootTableId)) return `Unknown loot table "${p.encounter.lootTableId}".`;
  if (p.encounter.exposesCommander) {
    if (!p.coverId) return 'The commander is exposed: a cover unit is required.';
    if (!ids.includes(p.coverId)) return 'The cover unit must be fielded.';
  } else if (p.coverId !== undefined) return 'A cover unit is only used when the commander is exposed.';
  return null;
}

/** Σ `cp_start` over the commander's crime perk and flaw and corporation bonus. */
function startingCp(state: CampaignState, reg: Registries): number {
  let cp = TUNING.combat.cpStart;
  const lists: unknown[] = [];
  const crime = reg.crimes.get(state.commander.crimeId ?? '');
  lists.push((crime?.perk as { effects?: unknown[] } | undefined)?.effects, (crime?.flaw as { effects?: unknown[] } | undefined)?.effects);
  lists.push((reg.corporations.get(state.commander.corporationId ?? '')?.startingBonus as { effects?: unknown[] } | undefined)?.effects);
  for (const list of lists) {
    for (const e of (list as Array<{ type?: string; amount?: number }> | undefined) ?? []) if (e.type === 'cp_start') cp += e.amount ?? 0;
  }
  return Math.min(TUNING.combat.cpMax, cp);
}

function squadCombatant(
  state: CampaignState, reg: Registries, unit: Unit, index: number, row: 'front' | 'back', synergies: Array<{ unitId: string; synergyId: string }>,
): Combatant {
  const stats = unitStats(state, reg, unit);
  const role = reg.roles.get(unit.roleId)!;
  const skills = unitSkillIds(reg, unit);
  const passives: Array<EffectSpec & { source: string }> = [];
  const add = (effects: EffectSpec[] | undefined, source: string) => {
    for (const e of effects ?? []) passives.push({ ...e, source });
  };

  for (const id of ownedPassiveIds(reg, unit)) add(skillById(reg, id)!.effects as unknown as EffectSpec[], `skill:${id}`);
  for (const d of unit.defects) {
    const c = reg.defects.get(d.id)?.combat as { upside?: EffectSpec[]; downside?: EffectSpec[] } | undefined;
    const scale = arcScale(d, state.day); // a managed or embraced defect (P6) changes in strength
    const scaled = (effects: EffectSpec[] | undefined, factor: number) => (factor === 1 ? effects : effects?.map((e) => amplify(e, factor)));
    add(scaled(c?.upside, scale.upside), `defect:${d.id}`);
    add(scaled(c?.downside, scale.downside), `defect:${d.id}:down`);
  }
  if (unit.kind === 'named') {
    const sigSkill = reg.signatures.get(unit.signatureSkill.templateId)?.skill as string | undefined;
    const sk = sigSkill ? skillById(reg, sigSkill) : undefined;
    if (sk?.kind === 'passive') add(sk.effects as unknown as EffectSpec[], `sig:${sigSkill}`);
  }
  for (const { inst } of wornItems(state, reg, unit)) add(itemStats(reg, inst)?.effects, `item:${inst.uid}`);
  for (const s of synergies) if (s.unitId === unit.id) add(reg.synergies.get(s.synergyId)?.effects as EffectSpec[] | undefined, `synergy:${s.synergyId}`);

  return {
    cid: `s${index + 1}`,
    side: 'squad',
    unitId: unit.id,
    nameKey: unit.displayName,
    level: unit.level,
    row,
    index,
    hp: Math.max(1, Math.min(unit.currentHp, stats.hp)),
    maxHp: stats.hp,
    base: stats,
    stress: unit.breakdown ? 100 : unit.stress,
    statuses: [],
    mods: [],
    cooldowns: {},
    skills,
    passives,
    downed: false,
    aiProfile: (role.aiProfile as string | undefined) ?? 'aggressive',
    ...(unit.breakdown ? { breakdown: makeBreakdown(reg, unit.breakdown.defectId, dispositionFor(state, reg, unit)) } : {}),
    usedLimits: [],
    upgrades: ownedUpgrades(reg, unit),
  };
}

/** Builds the combat state for a validated payload. `rng` is read for its state only (`start.rng`). */
export function buildCombat(state: CampaignState, reg: Registries, rng: Rng, p: StartPayload): CombatState {
  const rngState = rng.state;
  const formation = { front: [...p.formation.front], back: [...p.formation.back] };
  const unitIds = [...formation.front, ...formation.back];
  const synergies = getSynergies(state, reg, unitIds);
  const squad = unitIds.map((id, i) =>
    squadCombatant(state, reg, state.squad.find((u) => u.id === id)!, i, formation.front.includes(id) ? 'front' : 'back', synergies));

  const cs: CombatState = {
    id: `cmb_${state.day}_${rngState[0].toString(36)}`,
    round: 0,
    phase: 'awaiting',
    cp: startingCp(state, reg),
    timeline: [],
    turn: 0,
    combatants: squad,
    encounter: structuredClone(p.encounter),
    formation,
    log: [],
    auto: false,
    allowRetry: p.allowRetry === true,
    expedition: p.expedition === true,
    bankLoot: p.bankLoot === true,
    start: { rng: rngState, payload: structuredClone(p) },
    ordersThisRound: [],
    pendingLootRolls: 0,
    hints: [],
    nextCid: 1,
  };
  cs.presence = { kind: presenceKind(commanderProfile(state).archetype), used: false };
  for (const e of p.encounter.enemies) spawnEnemy(cs, state, reg, e);
  for (const m of p.encounter.mutineers ?? []) spawnMutineer(cs, state, reg, m);
  if (p.encounter.exposesCommander && p.coverId) {
    const cover = squad.find((c) => c.unitId === p.coverId)!;
    const maxHp = commanderMaxHp(state, reg);
    cs.commander = { hp: maxHp, maxHp, def: TUNING.combat.commanderDef, coverId: cover.cid, downed: false };
  }

  // always-on max-HP passives (stat hp / all) are folded into the starting values
  const ctx = makeCtx(cs, state, reg, rng);
  for (const c of cs.combatants.filter((x) => x.side === 'squad')) {
    const pct = activePassives(ctx, c.cid, 'stat')
      .filter((e) => e.stat === 'hp' || e.stat === 'all')
      .reduce((sum, e) => sum + e.pct, 0);
    if (pct !== 0) {
      const maxHp = Math.max(1, Math.round(c.maxHp * (1 + pct / 100)));
      c.hp = Math.max(1, Math.min(maxHp, Math.round(c.hp * (maxHp / c.maxHp))));
      c.maxHp = maxHp;
      c.base = { ...c.base, hp: maxHp };
    }
  }
  return cs;
}
