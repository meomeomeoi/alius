import { developmentMode } from '../../engine/development/state';
import type { Knowledge } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Character development readings (P14b). Everything goes through `Knowledge.development`: only what she has shown. Accumulators, pending
 * and misread appraisals, `insight` and an unshown moment or line are never read here. No pronoun for the commander.
 */

const unitIdOf = (s: Subject): string | null => (typeof s.data.unitId === 'string' ? s.data.unitId : null);
const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** `developmentAxes:<id>` with `{ unitId, axis }`: what changed on that axis, in words, and why once shown. */
function axisProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const unit = env.state.squad.find((u) => u.id === unitId);
  const view = k.development(unitId, env.registries);
  const axis = typeof s.data.axis === 'string' ? s.data.axis : null;
  if (axis === null) return { lines: view.axes.length === 0 ? ['Nothing has changed yet.'] : view.axes.map((a) => `${unit?.displayName ?? 'She'}: ${a.words}.`) };
  const a = view.axes.find((x) => x.axis === axis);
  if (!a) return { lines: ['Nothing has changed here yet.'] };
  return {
    lines: [
      `${unit?.displayName ?? 'She'} is ${a.words}.`,
      ...(a.reason !== '' ? [`Why: ${a.reason}`] : []),
      `It showed on day ${a.shownDay}.`,
      ...(a.held ? ['Held: it takes no further change.'] : []),
    ],
  };
}

/** `glossary:character_development`: the campaign's mode and how many soldiers have shown a change. */
function modeProvider(_s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const state = env.state;
  if (!state) return null;
  const mode = developmentMode(state);
  const changed = state.squad.filter((u) => {
    const v = k.development(u.id, env.registries);
    return v.axes.length + v.facts.length + v.habits.length > 0;
  }).length;
  return { lines: [`Character development is ${mode}${state.settings.characterDevelopment === undefined ? ' (this campaign never turned it on)' : ''}.`, `${plural(changed, 'soldier has', 'soldiers have')} shown a change.`] };
}

function factProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const v = k.development(unitId, env.registries);
  return { lines: [`${plural(v.facts.length, 'line of hers is', 'lines of hers are')} shown.`] };
}

function habitProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const v = k.development(unitId, env.registries);
  return { lines: [v.habits.length === 0 ? 'No habit yet.' : `${plural(v.habits.length, 'habit', 'habits')}.`] };
}

function holdProvider(s: Subject, env: AnalyzeEnv, k: Knowledge): { lines: string[] } | null {
  const unitId = unitIdOf(s);
  if (!env.state || unitId === null) return null;
  const held = k.development(unitId, env.registries).axes.filter((a) => a.held);
  return { lines: [held.length === 0 ? 'Nothing is held.' : `Held: ${held.map((a) => a.words).join('; ')}.`] };
}

/** Registered by `registerCoreProviders`. */
export function registerDevelopmentProviders(): void {
  registerAnalyzeProvider('developmentAxes', axisProvider);
  registerAnalyzeProvider('glossary:character_development', modeProvider);
  registerAnalyzeProvider('glossary:development_fact', factProvider);
  registerAnalyzeProvider('glossary:habit', habitProvider);
  registerAnalyzeProvider('glossary:development_hold', holdProvider);
}
