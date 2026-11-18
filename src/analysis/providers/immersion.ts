import { vitalsOf, type SpikeCause, type VitalsPattern } from '../../engine/vitals';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of the interface of intimacy (P10b). Everything is worded in bands and patterns; no number is derived from hidden
 * state, so these providers take none through `Knowledge` and print no digit. A unit hiding an injury shows no injury here
 * either (`vitalsOf` already leaves it out of the temperature).
 */

const PATTERN_WORDS: Record<VitalsPattern, string> = {
  steady: 'a steady line: nothing out of the ordinary.',
  elevated: 'a raised line: she is under strain.',
  spiking: 'a line that spikes: something is setting her pulse off.',
  flat: 'an almost flat line, barely moving whatever happens. A flat line is not a calm one, and it does not mean she feels nothing.',
  erratic: 'an erratic line: her stress is at its limit.',
};

const CAUSE_WORDS: Record<SpikeCause, string> = {
  combat: 'fighting',
  conflict: 'a quarrel',
  commander_near: 'the commander being close',
  want: 'unmet desire',
};

const CAVEAT = 'A pattern can mean fear, effort, anger or interest; the implant cannot tell which, and neither can this reading.';

/** One soldier's telemetry in words. */
function vitalsProvider(subject: Subject, env: AnalyzeEnv, _k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  if (!state || unitId === null) return null;
  const v = vitalsOf(state, env.registries, unitId);
  if (!v) return null;
  const name = state.squad.find((u) => u.id === unitId)?.displayName ?? unitId;
  const lines = [`${name}'s implant reports ${PATTERN_WORDS[v.pattern]}`];
  if (v.spikes.length > 0) lines.push(`Recent triggers: ${v.spikes.map((s) => CAUSE_WORDS[s]).join(', ')}.`);
  if (v.pattern === 'flat') lines.push(v.flicker ? 'The line flickered just now; the moment is logged.' : 'When the line does flicker, the moment is logged.');
  if (v.temp === 'fever') lines.push('Her temperature is running high.');
  lines.push(CAVEAT);
  return { lines };
}

export function registerImmersionProviders(): void {
  registerAnalyzeProvider('glossary:vitals', vitalsProvider);
}
