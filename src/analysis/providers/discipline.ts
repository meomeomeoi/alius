import { deedsOf } from '../../engine/discipline/deeds';
import type { DeedCounter } from '../../engine/state/types';
import { impunityBand, impunityOf, commandStance, perceptionOf, stanceEntry, type ImpunityTerms } from '../../engine/discipline';
import { trustBand } from '../../engine/relations/bands';
import { TUNING } from '../../engine/tuning';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of discipline (P9): a unit's command stance and the terms of her Impunity. The terms are shown as words; the
 * numbers (and the stored record) only through `Knowledge` with raw values on. Nothing says who sabotaged anything.
 */

const unitIdOf = (subject: Subject): string | null => (typeof subject.data.unitId === 'string' ? subject.data.unitId : null);

/** ` (+12)` / ` (−8)` with raw values on, nothing otherwise. */
function numberOf(k: Knowledge, n: number): string {
  const r = k.raw(Math.abs(n));
  return r === null ? '' : ` (${n < 0 ? '−' : '+'}${r})`;
}

function termLines(t: ImpunityTerms, k: Knowledge): string[] {
  const out: string[] = [];
  const disposition = t.base - TUNING.impunity.defaultBase;
  if (disposition !== 0) out.push(`Disposition: ${disposition > 0 ? 'raises it' : 'lowers it'}${numberOf(k, disposition)}`);
  if (t.record !== 0) out.push(`Record: ${t.record > 0 ? 'she has been getting away with things' : 'she has been brought to heel'}${numberOf(k, t.record)}`);
  if (t.leash !== 0) out.push(`The Leash: ${t.leash > 0 ? 'looks like an empty threat' : 'was used recently'}${numberOf(k, t.leash)}`);
  if (t.presence !== 0) out.push(`Presence: the commander's presence ${t.presence < 0 ? 'holds her back' : 'invites it'}${numberOf(k, t.presence)}`);
  if (t.dependency !== 0) out.push(`Dependency: she needs the commander${numberOf(k, t.dependency)}`);
  if (t.contagion !== 0) out.push(`Squad mood: ${t.contagion > 0 ? 'the others are getting bolder' : 'the others are careful'}${numberOf(k, t.contagion)}`);
  if (t.leverage !== 0) out.push(`Leverage: she holds something over the commander${numberOf(k, t.leverage)}`);
  if (t.held !== 0) out.push(`Held over her: the commander knows what the squad kept back and has used it${numberOf(k, t.held)}`);
  return out;
}

function impunityProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const id = unitIdOf(subject);
  if (!state || id === null) return null;
  const found = impunityOf(state, env.registries, id);
  if (!found) return null; // a grunt, a unit who is gone, an unknown id
  const stance = commandStance(state, env.registries, id);
  const entry = stance === null ? undefined : stanceEntry(env.registries, stance);
  const lines: string[] = [];
  if (entry) lines.push(`Stance: ${String(entry.name)}`);
  lines.push(k.showRaw ? `Impunity: ${k.raw(found.value)}` : `Impunity: ${impunityBand(found.value)}`);
  lines.push(...termLines(found.terms, k));
  return { lines };
}

function stanceProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const id = unitIdOf(subject);
  if (!state || id === null) return null;
  const found = impunityOf(state, env.registries, id);
  const rel = state.relations[id];
  const stance = commandStance(state, env.registries, id);
  if (!found || !rel || stance === null) return null;
  const entry = stanceEntry(env.registries, stance);
  return {
    lines: [
      `Her stance now: ${String(entry?.name ?? stance)}`,
      `Trust: ${trustBand(rel.trust)}${k.showRaw ? ` (${k.raw(rel.trust)})` : ''}`,
      k.showRaw ? `Impunity: ${k.raw(found.value)}` : `Impunity: ${impunityBand(found.value)}`,
    ],
  };
}

function punishmentProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const id = unitIdOf(subject);
  const pun = env.registries.punishments.get(subject.id);
  const unit = id === null ? undefined : state?.squad.find((u) => u.id === id);
  if (!state || !pun || !unit || unit.kind !== 'named') return null;
  const lines: string[] = [];
  const perception = perceptionOf(env.registries, unit, pun);
  if (perception > 1) lines.push('She takes this harder than most.');
  else if (perception < 1) lines.push('She takes this lighter than most.');
  if (k.showRaw) {
    const d = pun.deltas as { trust: number; affinity: number; stress: number };
    const n = (v: number): string => `${v < 0 ? '−' : '+'}${k.raw(Math.abs(Math.round(v * perception * 10) / 10))}`;
    lines.push(`Trust ${n(d.trust)}, Affinity ${n(d.affinity)}, stress ${n(d.stress)}`);
    lines.push(`Impunity ${n(Number(pun.impunityDelta))}`);
  }
  return lines.length > 0 ? { lines } : null;
}

/** A nickname the commander holds: since when and, with raw values, the counters of its pattern (never the pattern's thresholds in words). */
function reputationProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const held = state?.commander.reputation?.active.find((a) => a.id === subject.id);
  const entry = env.registries.reputations.get(subject.id);
  if (!state || !held || !entry) return null;
  const lines = [`Held since day ${held.sinceDay}`];
  const p = entry.pattern as { sum: DeedCounter[]; min: number } | undefined;
  if (p && k.showRaw) {
    const deeds = deedsOf(state);
    lines.push(`Counted: ${k.raw(p.sum.reduce((n, c) => n + (deeds[c] ?? 0), 0))} of ${k.raw(p.min)}`);
  }
  return { lines };
}

let registered = false;

/** Registers the discipline readings; safe to call more than once (the core registration calls it). */
export function registerDisciplineProviders(): void {
  if (registered) return;
  registered = true;
  registerAnalyzeProvider('glossary:impunity', impunityProvider);
  registerAnalyzeProvider('commandStances', stanceProvider);
  registerAnalyzeProvider('punishments', punishmentProvider);
  registerAnalyzeProvider('reputations', reputationProvider);
}
