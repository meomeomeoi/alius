import { memoryConfig } from '../../engine/memory/config';
import type { Knowledge } from '../knowledge';
import { registerKnowledgeRule } from '../knowledge';
import type { AnalyzeEnv } from '../model';
import { registerAnalyzeProvider } from '../providers';
import type { Subject } from '../subject';

/**
 * Memory readings (P3b). Counts of facts go through `Knowledge`, so a fact the commander does not know (`hiddenFromCommander`) is neither
 * counted nor listed. The knowledge rule below is what hides it: it is registered here, with the readings, by `registerCoreProviders`.
 */

type Reading = { lines: string[] } | null;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

function presetProvider(_subject: Subject, env: AnalyzeEnv): Reading {
  const state = env.state;
  if (!state) return null;
  const c = memoryConfig(state);
  return {
    lines: [
      `Preset: ${c.preset}.`,
      `Keeps ${plural(c.factsMax, 'fact')} before old ones are folded (after ${plural(c.foldAfterDays, 'day')}); tells ${c.retrievalK} per scene.`,
      `Prompt: ${c.memoryTokens} tokens of memory, ${plural(c.journalLines, 'line')} of her story with the commander, ${plural(c.chronicleDays, 'day')} of the chronicle.`,
    ],
  };
}

function fillProvider(subject: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  const state = env.state;
  if (!state) return null;
  const c = memoryConfig(state);
  const facts = k.facts();
  const pinned = facts.filter((f) => f.pinned === true).length;
  const dossiers = Object.values(state.memory.dossiers ?? {}).filter((d) => d.own !== '' || d.shared !== '').length;
  const lines: Record<string, string[]> = {
    facts: [`Facts kept: ${plural(facts.length, 'fact')} of ${c.factsMax}, ${pinned} pinned.`, 'Past the limit the oldest are folded into dossiers; pinned ones never are.'],
    dossiers: [`${plural(dossiers, 'dossier')} written so far.`],
    chronicle: [`${plural(state.memory.chronicle.length, 'chronicle entry', 'chronicle entries')} in the save (the LOG tab shows them all).`],
    memory_tokens: [`The last prompt spent its memory share of ${c.memoryTokens} tokens (see the fill above).`],
    directive_tokens: ['Directives are hard constraints: they are never cut, but they are counted.'],
    save_size: ['The save holds every fact, dossier and chronicle line; keep it small by letting old facts fold.'],
  };
  const part = typeof subject.data.part === 'string' ? subject.data.part : null;
  if (part !== null && lines[part]) return { lines: lines[part] };
  return { lines: [...lines.facts, ...lines.dossiers, ...lines.chronicle] };
}

function budgetProvider(_subject: Subject, env: AnalyzeEnv): Reading {
  const state = env.state;
  if (!state) return null;
  const c = memoryConfig(state);
  const cap = env.settings.contextTokenCap;
  return {
    lines: [
      `Memory share: ${c.memoryTokens} tokens of a ${cap}-token cap.`,
      c.memoryTokens > cap / 2 ? 'That is more than half of the cap: the rest of the prompt has to fit in what is left.' : 'What memory does not use goes back to the rest of the prompt.',
    ],
  };
}

function dossierProvider(subject: Subject, env: AnalyzeEnv): Reading {
  const state = env.state;
  if (!state) return null;
  const unitId = typeof subject.data.unitId === 'string' ? subject.data.unitId : '*';
  const d = state.memory.dossiers?.[unitId];
  if (!d || (d.own === '' && d.shared === '')) return { lines: ['Nothing folded yet.'] };
  return { lines: [`${plural(d.folded, 'fact')} folded into it, the last on day ${d.day}.`, `Private part ${d.own.length} characters, shared part ${d.shared.length}.`] };
}

function rumorProvider(_subject: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  const state = env.state;
  if (!state) return null;
  const spreading = k.facts().filter((f) => f.spread !== undefined).length;
  return { lines: [`Rumor mode: ${memoryConfig(state).rumorMode === 'model' ? 'retold by the mechanic model' : 'told as it was'}.`, `${plural(spreading, 'rumor')} still spreading.`] };
}

function pinnedProvider(_subject: Subject, env: AnalyzeEnv, k: Knowledge): Reading {
  if (!env.state) return null;
  return { lines: [`${k.facts().filter((f) => f.pinned === true).length} pinned.`] };
}

function hiddenScenesProvider(_subject: Subject, env: AnalyzeEnv): Reading {
  const state = env.state;
  if (!state) return null;
  const n = memoryConfig(state).hideScenesAfter;
  if (n === 0) return { lines: ['Off: no scene is hidden from the story model.'] };
  const hidden = state.memory.hidden?.length ?? 0;
  return { lines: [`Hiding every ended scene older than the last ${n}.`, `Hidden now: ${plural(hidden, 'stretch of messages', 'stretches of messages')}.`] };
}

function factLengthProvider(_subject: Subject, env: AnalyzeEnv): Reading {
  const state = env.state;
  if (!state) return null;
  const n = memoryConfig(state).factTextMax;
  return { lines: [`A fact keeps at most ${n} characters${n === 200 ? ' (the default)' : ''}.`] };
}

/** Registers the knowledge rule and the readings (called from `registerCoreProviders`). */
export function registerMemoryProviders(): void {
  registerKnowledgeRule({ fact: (f) => f.hiddenFromCommander !== true });
  registerAnalyzeProvider('glossary:memory_preset', presetProvider);
  registerAnalyzeProvider('glossary:memory_fill', fillProvider);
  registerAnalyzeProvider('glossary:memory_budget', budgetProvider);
  registerAnalyzeProvider('glossary:dossier', dossierProvider);
  registerAnalyzeProvider('glossary:squad_rumor', rumorProvider);
  registerAnalyzeProvider('glossary:pinned_fact', pinnedProvider);
  registerAnalyzeProvider('glossary:hidden_scenes', hiddenScenesProvider);
  registerAnalyzeProvider('glossary:fact_length', factLengthProvider);
}
