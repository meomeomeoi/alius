import type { CampaignState } from '../../engine/state/types';
import { registerKnowledgeRule, type KnowledgeRule } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';

/**
 * Readings of the special traits (P12). Secret Frequency: counts of fragments and words about what stays unseen, never which
 * fragment was true, what any of them said or how suspicious a soldier is. The knowledge rule below hides the relation flag until
 * `frequency_discovered` has named her, and the hidden fact always. Registered by `registerCoreProviders`.
 */

type Reading = { lines: string[] } | null;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

/** Every unit that holds the flag has been announced (the flag is a relation flag: the rule only sees its id, so it is hidden as a whole). */
function holdersAnnounced(state: CampaignState): boolean {
  const announced = state.special?.frequency?.discovered ?? [];
  return state.squad.every((u) => !state.relations[u.id]?.flags.includes('knows_frequency') || announced.includes(u.id));
}

function interceptProvider(_subject: unknown, env: AnalyzeEnv): Reading {
  const f = env.state?.special?.frequency;
  if (!env.state || !f) return null;
  const today = f.intercepts.filter((x) => x.day === env.state!.day).length;
  const week = f.intercepts.filter((x) => env.state!.day - x.day < 7).length;
  const lines = [
    f.burnedDay !== undefined ? 'The implant is burned out: no more fragments.' : `${plural(today, 'fragment')} today, ${week} this week.`,
    'A fragment is never marked. Some are distorted and some name only a subject; nothing here says which.',
  ];
  return { lines };
}

function suspicionProvider(_subject: unknown, env: AnalyzeEnv): Reading {
  if (!env.state?.special?.frequency) return null;
  return { lines: ['An unseen threat: how far each soldier suspects the commander of hearing thoughts stays hidden until one of them reacts.'] };
}

function burnProvider(_subject: unknown, env: AnalyzeEnv): Reading {
  const f = env.state?.special?.frequency;
  if (!f) return null;
  return { lines: [f.burnedDay !== undefined ? 'The implant is already burned out. Nothing brings it back.' : 'Burning the implant is done in the medbay and cannot be undone: the fragments stop for good, and a later discovery lands softer.'] };
}

function premonitionProvider(_subject: unknown, env: AnalyzeEnv): Reading {
  const p = env.state?.special?.paranoia;
  if (!env.state || !p) return null;
  const open = p.premonitions.filter((x) => x.acted === undefined && x.expiresDay >= env.state!.day).length;
  return { lines: [`${plural(open, 'warning')} open.`, 'A warning reaches the commander a day or two early. Nothing marks it; only what follows shows what it was.'] };
}

function falseAlarmProvider(_subject: unknown, env: AnalyzeEnv): Reading {
  if (!env.state?.special?.paranoia) return null;
  return { lines: ['Any day a soldier may raise a false alarm, and nothing marks which warnings are false. Acting on one costs trust and stress; acting on a real one can head it off.'] };
}

function nightmareProvider(_subject: unknown, env: AnalyzeEnv): Reading {
  const p = env.state?.special?.paranoia;
  if (!env.state || !p) return null;
  const lines = ['Bloom nightmares come at night, more often when the commander is strained. They raise stress and may cost a morning.'];
  if (p.lastNightmareDay === env.state.day - 1) lines.push('The commander slept badly last night.');
  return { lines };
}

/** What the player may not read: the hidden fact of the discovery, and the flag of a soldier who has not been announced. */
export const specialKnowledgeRule: KnowledgeRule = {
  fact: (f, state) => f.id !== state.special?.frequency?.factId,
  flag: (id, state) => id !== 'knows_frequency' || holdersAnnounced(state),
};

/** Registers the knowledge rule and the readings (called from `registerCoreProviders`). */
export function registerSpecialProviders(): void {
  registerKnowledgeRule(specialKnowledgeRule);
  registerAnalyzeProvider('glossary:frequency_intercept', interceptProvider);
  registerAnalyzeProvider('glossary:frequency_suspicion', suspicionProvider);
  registerAnalyzeProvider('glossary:burn_implant', burnProvider);
  registerAnalyzeProvider('glossary:premonition', premonitionProvider);
  registerAnalyzeProvider('glossary:false_alarm', falseAlarmProvider);
  registerAnalyzeProvider('glossary:bloom_nightmare', nightmareProvider);
}
