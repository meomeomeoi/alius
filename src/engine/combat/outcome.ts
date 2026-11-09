import type { Registries } from '../../content/types';
import { injureCommander } from '../calendar';
import type { EngineEvent } from '../dispatch';
import { bankLoot, rollLoot } from '../items';
import { applyLevelUps, combatXp, releaseBreakdowns } from '../progression';
import type { Rng } from '../rng';
import type { CampaignState, LootDrop, Severity, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { amplify, fireTrigger, makeCtx } from './effects';
import { defaultEnemyName } from './encounter';
import type { CombatOutcome, CombatResult, Combatant, LogEntry, RelationHint } from './types';

const RANK: Severity[] = ['minor', 'moderate', 'major', 'extreme'];
const severityOfShare = (share: number): Severity => (share < 0.15 ? 'minor' : share < 0.4 ? 'moderate' : 'major');

/** Adds hints keeping one per (type, actor, target) at the highest severity. */
function mergeHints(into: RelationHint[], more: RelationHint[]): void {
  const key = (h: RelationHint) => `${h.type}|${h.actor}|${h.targets.join(',')}`;
  for (const h of more) {
    const have = into.find((x) => key(x) === key(h));
    if (!have) into.push({ ...h, targets: [...h.targets] });
    else if (RANK.indexOf(h.severity) > RANK.indexOf(have.severity)) have.severity = h.severity;
  }
}

/** Hints for P5's debrief: the cover unit took hits (protected), a unit went down (endangered), plus order hints. */
function relationHints(cs: NonNullable<CampaignState['combat']>, unitIdOf: (cid: string) => string | undefined): RelationHint[] {
  const out: RelationHint[] = [];
  mergeHints(out, cs.hints);
  const cmd = cs.commander;
  if (cmd) {
    const cover = cs.combatants.find((c) => c.cid === cmd.coverId);
    const covered = cs.log.some((l) => l.kind === 'cover' && l.actor === cmd.coverId);
    if (cover?.unitId && covered) {
      const taken = cs.log
        .filter((l: LogEntry) => (l.kind === 'hit' || l.kind === 'crit') && l.target === cover.cid && l.actor !== undefined)
        .reduce((s, l) => s + (l.amount ?? 0), 0);
      mergeHints(out, [{ type: 'protected', actor: cover.unitId, targets: [], severity: severityOfShare(taken / cover.maxHp) }]);
    }
  }
  for (const c of cs.combatants) {
    const id = c.side === 'squad' ? unitIdOf(c.cid) : undefined;
    if (id && c.downed) mergeHints(out, [{ type: 'endangered', actor: 'commander', targets: [id], severity: 'major' }]);
  }
  return out;
}

/** Days an injury lasts: the base plus the `injury_days` percentages of the unit's passives (strained downsides amplified). */
function injuryDaysFor(c: Combatant): number {
  let pct = 0;
  for (const p of c.passives) {
    if (p.type !== 'injury_days') continue;
    pct += (p.downside === true && c.stress >= 50 ? amplify(p, TUNING.combat.strainedMult) : p).pct;
  }
  return Math.max(1, Math.round(TUNING.combat.injuryDays * (1 + pct / 100)));
}

/**
 * Writes a decided combat back into the campaign, once: HP, stress, breakdowns, injuries, grunt deaths, XP, levels and
 * loot (a win), loss stress and Commander Crisis. Stores `lastCombat` and removes `combat`. Never touches
 * relationships or memory: the relation hints leave for P5's debrief.
 */
export function finalizeCombat(draft: CampaignState, reg: Registries, rng: Rng, outcome: CombatOutcome): EngineEvent[] {
  const cs = draft.combat;
  if (!cs) throw new Error('finalizeCombat: no combat is open');
  const ctx = makeCtx(cs, draft, reg, rng);
  fireTrigger(ctx, 'onCombatEnd', {});
  const events: EngineEvent[] = [];

  const squad = cs.combatants.filter((c) => c.side === 'squad' && c.unitId);
  const unitOf = (c: Combatant): Unit => draft.squad.find((u) => u.id === c.unitId)!;
  const unitIdOf = (cid: string) => cs.combatants.find((c) => c.cid === cid)?.unitId;
  const stressBefore: Record<string, number> = Object.fromEntries(squad.map((c) => [c.unitId!, unitOf(c).stress]));
  const injuries: string[] = [];
  const deaths: string[] = [];
  const breakdowns: string[] = [];
  const levelUps: Array<{ unitId: string; level: number }> = [];
  const lost = outcome !== 'won';

  for (const c of squad) {
    const unit = unitOf(c);
    unit.stress = Math.min(100, Math.max(0, c.stress + (lost ? TUNING.combat.stress.loss : 0)));
    if (c.breakdown) {
      unit.breakdown = { defectId: c.breakdown.defectId, day: draft.day };
      breakdowns.push(unit.id);
    }
    if (!c.downed) {
      unit.currentHp = Math.max(1, c.hp);
      continue;
    }
    const grunt = unit.kind === 'grunt';
    if (grunt && (lost || rng.chance(TUNING.combat.gruntDeathOnWin))) {
      unit.status = 'dead';
      unit.currentHp = 0;
      deaths.push(unit.id);
      continue;
    }
    unit.currentHp = 1;
    unit.injuries.push('wounded');
    unit.injuryDays = Math.max(unit.injuryDays ?? 0, injuryDaysFor(c));
    unit.status = 'injured';
    injuries.push(unit.id);
  }

  let xp: Record<string, number> = {};
  let loot: LootDrop[] = [];
  let banked = false;
  if (outcome === 'won') {
    xp = combatXp(draft, reg, cs);
    for (const c of squad) {
      const unit = unitOf(c);
      if (unit.status === 'dead') continue;
      unit.xp += xp[unit.id] ?? 0;
      events.push({ type: 'xp_gained', unitId: unit.id, amount: xp[unit.id] ?? 0 });
      for (const e of applyLevelUps(draft, reg, unit)) {
        events.push(e);
        levelUps.push({ unitId: unit.id, level: e.level as number });
      }
    }
    const tableId = cs.encounter.lootTableId ?? 'loot_standard';
    // content may have changed under the save: no table, no loot (never a combat that cannot be finalized)
    loot = reg.lootTables.has(tableId) ? rollLoot(draft, reg, rng, tableId, { extraRolls: cs.pendingLootRolls }) : [];
    if (cs.bankLoot) {
      events.push(...bankLoot(draft, loot));
      banked = true;
    }
  }

  let commanderInjured = false;
  if (cs.commander?.downed) {
    events.push(...injureCommander(draft, TUNING.combat.commanderInjuryDays));
    commanderInjured = true;
  }

  const result: CombatResult = {
    id: cs.id,
    day: draft.day,
    outcome,
    rounds: cs.round,
    formation: cs.formation,
    participants: squad.map((c) => c.unitId!),
    enemies: cs.combatants.filter((c) => c.side === 'enemy').map((c) => ({
      enemyId: c.enemyId!, level: c.level, affixes: (c.nameKey.split('|')[1] ?? '').split(',').filter((a) => a !== ''),
      name: draft.enemyNames?.[c.nameKey] ?? defaultEnemyName(reg, c.enemyId!, (c.nameKey.split('|')[1] ?? '').split(',').filter((a) => a !== '')),
      downed: c.downed,
    })),
    log: cs.log.slice(-TUNING.combat.logMax),
    xp,
    levelUps,
    loot,
    banked,
    injuries,
    deaths,
    breakdowns,
    stressDelta: Object.fromEntries(squad.map((c) => [c.unitId!, unitOf(c).stress - stressBefore[c.unitId!]])),
    relationHints: relationHints(cs, unitIdOf),
    commanderInjured,
  };
  draft.lastCombat = result;
  delete draft.combat;

  if (!cs.expedition) events.push(...releaseBreakdowns(draft));
  events.push({ type: 'combat_ended', outcome, result: cs.id });
  return events;
}
