import { commanderMaxHp, dodgeChance, presenceKind } from '../../engine/combat/crisis';
import { firstImpressionWeight, matchedTastes, presenceOf } from '../../engine/commander/presence';
import { commanderProfile, descriptor } from '../../engine/commander/profile';
import type { BodyStat } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Readings of the commander's values (P7): body stats, the build and the first impression. Every number goes through
 * `Knowledge`: with raw values off a reading says words (`Training: halfway`), never a figure.
 */

const WHERE_USED: Record<BodyStat, string> = {
  strength: 'Used by: an Authority talk-down (together with seasoning), body routes of physical checks.',
  endurance: 'Used by: Crisis HP (his HP if a fight reaches him); with low endurance a three-slot expedition exhausts him.',
  reflexes: 'Used by: his chance to dodge a hit that reaches him in Commander Crisis.',
};

const PRESENCE_LABEL = { unnoticed: ['presence_unnoticed', 'Unnoticed'], steady_voice: ['presence_steady_voice', 'Steady Voice'], rally: ['presence_rally', 'Rally'] } as const;

const pct = (n: number): number => Math.round(n * 100);

function bodyProvider(stat: BodyStat) {
  return (_subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null => {
    const state = env.state;
    if (!state) return null;
    const p = commanderProfile(state);
    const value = p.body[stat];
    const lines = [`Now: ${descriptor(stat, value)}${k.raw(value) !== null ? ` (${k.raw(value)})` : ''}`];
    if (value >= 5) lines.push('Training: nothing more to train; this stat is at the top.');
    else {
      const need = TUNING.commander.bodyXpSteps[value - 1];
      const have = p.bodyXp[stat];
      const share = have / need;
      lines.push(k.showRaw
        ? `Training: ${k.raw(have)}/${k.raw(need)} towards ${descriptor(stat, value + 1)}`
        : `Training: ${share < 1 / 3 ? 'early' : share < 2 / 3 ? 'halfway' : 'close'} on the way to ${descriptor(stat, value + 1)}`);
    }
    lines.push(WHERE_USED[stat]);
    if (stat === 'endurance' && k.showRaw) lines.push(`Crisis HP: ${k.raw(commanderMaxHp(state, env.registries))}`);
    if (stat === 'reflexes' && k.showRaw) lines.push(`Dodge chance: ${k.raw(pct(dodgeChance(state)))}%`);
    return { lines };
  };
}

function archetypeProvider(_subject: Subject, env: AnalyzeEnv): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const { archetype } = commanderProfile(state);
  const [id, label] = PRESENCE_LABEL[presenceKind(archetype)];
  const lines = [`Build: ${archetype}`, `Presence action: [[${id}|${label}]]`];
  const group = [...env.registries.imageConsistency.values()].find((g) => (g.archetypes as string[]).includes(archetype));
  const link = (events: unknown): string => (events as string[]).map((e) => `[[eventDeltas:${e}|${e}]]`).join(', ');
  if (group && (group.offImage as string[]).length > 0) lines.push(`Out of character for this build: ${link(group.offImage)}. These land harder until they know him.`);
  if (group && (group.inImage as string[]).length > 0) lines.push(`In character: ${link(group.inImage)}.`);
  return { lines };
}

function presenceProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const lines = ['Presence is how he comes across on first meeting: his build, his experience and his Authority.'];
  if (k.showRaw) lines.push(`His presence now: ${k.raw(presenceOf(state, env.registries))}`);
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : null;
  const unit = unitId === null ? undefined : state.squad.find((u) => u.id === unitId);
  if (unit) {
    const w = firstImpressionWeight(state, unit.id);
    const word = w > 0.5 ? 'fresh' : w >= 0.1 ? 'fading' : 'faded';
    lines.push(`First impression: ${word}${k.showRaw ? ` (${k.raw(pct(w))}%)` : ''}`);
    const tastes = matchedTastes(state, env.registries, unit);
    if (tastes.length > 0) lines.push(`Her tastes that fit him: ${tastes.map((t) => `[[tastes:${t.id}|${String(t.name)}]]`).join(', ')}`);
  }
  return { lines };
}

let registered = false;

/** Registers the commander readings; safe to call more than once (the core registration calls it). */
export function registerCommanderProviders(): void {
  if (registered) return;
  registered = true;
  for (const stat of ['strength', 'endurance', 'reflexes'] as const) registerAnalyzeProvider(`glossary:body_${stat}`, bodyProvider(stat));
  registerAnalyzeProvider('glossary:archetype', archetypeProvider);
  registerAnalyzeProvider('glossary:presence', presenceProvider);
}
