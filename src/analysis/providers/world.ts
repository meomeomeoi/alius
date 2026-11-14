import { dispositionById, dispositionFor, worldChoice, worldDispositionLevel } from '../../engine/worldOptions';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';
import { summarizeWorldOptionEffect } from '../effects';

/**
 * Readings of the world options (P8). The player chose the world, so nothing here is hidden, but the numbers still go
 * through `Knowledge`: with raw values off a reading says words (`Fewer Leash authorizations each week`), never a figure.
 */

type Fx = { type: string; [k: string]: unknown };

/** The numbers of a choice's effects, only with raw values on. */
function rawLines(effects: Fx[], k: Knowledge): string[] {
  if (!k.showRaw) return [];
  const out: string[] = [];
  for (const fx of effects) {
    const n = (v: unknown): number => Number(v);
    if (fx.type === 'leash_weekly') out.push(`Leash authorizations per week: ${k.raw(n(fx.amount))}`);
    else if (fx.type === 'terminate_approval') out.push(`Termination approval: ${k.raw(Math.round(n(fx.amount) * 100))}%`);
    else if (fx.type === 'command_failure_mult') out.push(`Failed command mission losses: ×${k.raw(n(fx.mult))}`);
    else if (fx.type === 'mission_reward_pct') out.push(`Mission rewards: ${k.raw(n(fx.pct))}%`);
    else if (fx.type === 'expression_norm') out.push(`Expression norm: ${k.raw(n(fx.norm))}, standing per step: ${k.raw(n(fx.standingPerStep))}`);
  }
  return out;
}

function worldOptionProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const current = worldChoice(state, env.registries, subject.id);
  if (!current) return null;
  const lines = [`Now: ${String(current.choice.label)}`];
  const shownId = typeof subject.data.choice === 'string' ? subject.data.choice : current.choice.id;
  const shown = (current.option.choices).find((c) => c.id === shownId) ?? current.choice;
  if (shown.id !== current.choice.id) lines.push(`This choice: ${String(shown.label)}`);
  lines.push(current.option.live === true ? 'Can change during the campaign.' : 'Locked at campaign start.');
  lines.push(...(shown.effects as Fx[]).map((fx) => summarizeWorldOptionEffect(fx, env.registries)));
  lines.push(...rawLines(shown.effects as Fx[], k));
  return { lines };
}

function dispositionProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const reg = env.registries;
  const lines = [`World level: ${String(worldDispositionLevel(state, reg).name)}`];
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const unit = unitId === null ? undefined : state.squad.find((u) => u.id === unitId);
  if (!unit) return { lines };
  const level = dispositionById(state, reg, unit.id);
  lines.push(`Her level: ${String(level.name)}`);
  if (unit.kind === 'named') {
    const offset = unit.dispositionOffset ?? 0;
    if (offset === 0) lines.push('Offset: none, she follows the world');
    else lines.push(`Offset: ${offset < 0 ? 'kinder' : 'harder'} than the world${unit.dispositionReason ? ` (${unit.dispositionReason})` : ''}`);
    if (k.showRaw) {
      lines.push(`Offset: ${k.raw(offset)}`);
      lines.push(`Rank: ${k.raw(Number(dispositionFor(state, reg, unit).rank))} of 5`);
    }
  }
  return { lines };
}

let registered = false;

/** Registers the world readings; safe to call more than once (the core registration calls it). */
export function registerWorldProviders(): void {
  if (registered) return;
  registered = true;
  registerAnalyzeProvider('worldOptions', worldOptionProvider);
  registerAnalyzeProvider('glossary:disposition', dispositionProvider);
}
