import { impunityBand, impunityOf, commandStance, stanceEntry, type ImpunityTerms } from '../../engine/discipline';
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

let registered = false;

/** Registers the discipline readings; safe to call more than once (the core registration calls it). */
export function registerDisciplineProviders(): void {
  if (registered) return;
  registered = true;
  registerAnalyzeProvider('glossary:impunity', impunityProvider);
  registerAnalyzeProvider('commandStances', stanceProvider);
}
