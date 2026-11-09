import type { Registries } from '../content/types';
import { buildCombat } from '../engine/combat/build';
import { makeCtx, fireTrigger } from '../engine/combat/effects';
import { generateEncounter, type EnemyTable } from '../engine/combat/encounter';
import { defaultFormation, squadPower } from '../engine/combat/stats';
import { runUntilInput, startRound } from '../engine/combat/turn';
import { checkUnlock, unlockNode } from '../engine/progression';
import { Rng, seedRng } from '../engine/rng';
import { buildCampaign } from '../engine/setup';
import type { CampaignState, Difficulty } from '../engine/state/types';

/** Balance harness (P4): seeded, headless combats on the pure engine. No dispatch, no ST, no UI. */

const ZERO = { pragmatism: 0, autonomy: 0, ingroup: 0, mercy: 0, corporate: 0, sacrifice: 0 };
const SQUAD = [
  { name: 'Ann', roleId: 'assault', signature: 'sig_frenzy' },
  { name: 'Bea', roleId: 'defender', signature: 'sig_mock' },
  { name: 'Cat', roleId: 'sniper', signature: 'sig_vanish' },
  { name: 'Dee', roleId: 'medic', signature: 'sig_anchor_words' },
] as const;

/** Spends every skill point on the cheapest available nodes (lowest tier first, branches in turn). */
function spendPoints(state: CampaignState, reg: Registries, unitId: string): void {
  const unit = state.squad.find((u) => u.id === unitId)!;
  const tree = (reg.roles.get(unit.roleId)!.tree as Array<{ id: string; tier: number | null; cost: number; branch: number | null }>)
    .filter((n) => n.branch !== null)
    .sort((a, b) => (a.tier ?? 9) - (b.tier ?? 9) || (a.branch ?? 0) - (b.branch ?? 0));
  for (let progress = true; progress;) {
    progress = false;
    for (const n of tree) {
      if (checkUnlock(state, reg, unitId, n.id) === null) {
        unlockNode(state, reg, unitId, n.id);
        progress = true;
        break;
      }
    }
  }
}

/**
 * A fixture campaign: assault and defender in front, sniper and medic behind, all at `level`, skill points spent,
 * standard-issue gear (no items), each carrying `defectId` — or no defect with `null`/undefined.
 */
export function fixtureSquad(reg: Registries, opts: { level: number; defectId?: string | null }): CampaignState {
  const startId = [...reg.starts.values()].find((s) => reg.corporations.get(s.corporationId as string)?.playable === true)?.id;
  const crimeId = [...reg.crimes.keys()][0];
  if (!startId || !crimeId) throw new Error('The content pack needs a playable start and a crime.');
  const built = buildCampaign(
    {
      commanderName: 'Harness', startId, crimeId,
      units: SQUAD.map((u) => ({
        cardRef: `${u.name.toLowerCase()}.png`, displayName: u.name, roleId: u.roleId,
        signature: { templateId: u.signature, name: u.signature, description: 'Harness signature.' },
        defects: [{ id: [...reg.defects.keys()][0], origin: 'harness' }],
        values: { ...ZERO }, likes: [], dislikes: [], triggers: [], baseline: { trust: 30, affinity: 0, attraction: 0 },
      })),
    },
    reg, { desireBondDefects: true, seed: 1 },
  );
  if (!built.ok) throw new Error(built.errors.join('; '));
  const state = built.state;
  for (const u of state.squad) {
    u.level = opts.level;
    u.skillPoints = opts.level - 1;
    u.defects = opts.defectId ? [{ id: opts.defectId, origin: 'harness' }] : [];
    spendPoints(state, reg, u.id);
    u.currentHp = 1_000_000; // clamped to max HP by the combat build
  }
  return state;
}

const ALL_CATEGORIES = (reg: Registries): EnemyTable => ({ categories: Object.fromEntries([...reg.enemyCategories.keys()].map((id) => [id, 1])) });

export interface SimResult { won: boolean; rounds: number; endStress: number }

/** One seeded combat on AUTO: the squad fights an encounter generated from all categories at `danger`. */
export function simulate(reg: Registries, opts: { seed: number; state: CampaignState; danger: number; difficulty?: Difficulty }): SimResult {
  const state = opts.difficulty ? { ...opts.state, difficulty: opts.difficulty } : opts.state;
  const rng = new Rng(seedRng(opts.seed));
  const ids = state.roster.activeIds;
  const formation = defaultFormation(state, reg, ids);
  const encounter = generateEncounter(state, reg, rng, {
    table: ALL_CATEGORIES(reg), danger: Math.min(5, Math.max(1, Math.round(opts.danger))) as 1 | 2 | 3 | 4 | 5, squadPower: squadPower(state, reg, ids),
  });
  const cs = buildCombat(state, reg, rng, { encounter, formation });
  cs.auto = true;
  const ctx = makeCtx(cs, state, reg, rng);
  fireTrigger(ctx, 'onCombatStart', {});
  startRound(ctx);
  runUntilInput(ctx);
  const squad = cs.combatants.filter((c) => c.side === 'squad');
  return {
    won: cs.outcome === 'won',
    rounds: cs.round,
    endStress: squad.reduce((s, c) => s + c.stress, 0) / squad.length,
  };
}

export interface BatchResult { winRate: number; avgRounds: number; avgEndStress: number }

/** `runs` combats, run `i` seeded `seed + i`. */
export function runBatch(reg: Registries, opts: { runs: number; seed: number; level: number; danger: number; defectId?: string | null }): BatchResult {
  const state = fixtureSquad(reg, { level: opts.level, defectId: opts.defectId });
  let wins = 0;
  let rounds = 0;
  let stress = 0;
  for (let i = 0; i < opts.runs; i++) {
    const r = simulate(reg, { seed: opts.seed + i, state, danger: opts.danger });
    wins += r.won ? 1 : 0;
    rounds += r.rounds;
    stress += r.endStress;
  }
  return { winRate: wins / opts.runs, avgRounds: rounds / opts.runs, avgEndStress: stress / opts.runs };
}

export interface NeutralityRow { defectId: string; winRate: number; diffPp: number; pass: boolean; avgRounds: number; avgEndStress: number }
export interface NeutralityReport {
  control: BatchResult;
  rows: NeutralityRow[];
  /** The control squad's average combat length is at most 5 rounds. */
  avgRoundsOk: boolean;
  runs: number;
  level: number;
  danger: number;
}

/** Defect neutrality: the squad with the defect on all four units versus without, paired by seed; ±5 pp passes. */
export function neutralityReport(reg: Registries, opts: { runs: number; seed: number; level: number; danger: number }): NeutralityReport {
  const control = runBatch(reg, { ...opts, defectId: null });
  const rows = [...reg.defects.keys()].map((defectId): NeutralityRow => {
    const withDefect = runBatch(reg, { ...opts, defectId });
    const diffPp = (withDefect.winRate - control.winRate) * 100;
    return { defectId, winRate: withDefect.winRate, diffPp, pass: Math.abs(diffPp) <= 5, avgRounds: withDefect.avgRounds, avgEndStress: withDefect.avgEndStress };
  });
  return { control, rows, avgRoundsOk: control.avgRounds <= 5, runs: opts.runs, level: opts.level, danger: opts.danger };
}

const pct = (x: number) => `${(x * 100).toFixed(1)} %`;

/** The report as a markdown table. */
export function formatReport(r: NeutralityReport): string {
  const lines = [
    `# Defect neutrality (${r.runs} runs per row, level ${r.level}, danger ${r.danger})`,
    '',
    `Control (no defect): win rate ${pct(r.control.winRate)}, ${r.control.avgRounds.toFixed(2)} rounds on average, end stress ${r.control.avgEndStress.toFixed(1)}.`,
    `Average combat length within 5 rounds: **${r.avgRoundsOk ? 'PASS' : 'FAIL'}**.`,
    '',
    '| Defect | Win rate | Diff (pp) | Rounds | End stress | ±5 pp |',
    '|---|---|---|---|---|---|',
    ...r.rows.map((x) => `| ${x.defectId} | ${pct(x.winRate)} | ${x.diffPp >= 0 ? '+' : ''}${x.diffPp.toFixed(1)} | ${x.avgRounds.toFixed(2)} | ${x.avgEndStress.toFixed(1)} | ${x.pass ? 'PASS' : 'FAIL'} |`),
    '',
    `${r.rows.filter((x) => x.pass).length} of ${r.rows.length} defects within ±5 pp.`,
  ];
  return lines.join('\n') + '\n';
}
