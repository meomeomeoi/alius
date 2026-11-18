import type { Registries } from '../../../content/types';
import { fnv1a } from '../../hub';
import type { CampaignState } from '../../state/types';
import type { Intercepted } from '../state';
import { NONE, REFUSES } from './candidates';

/** The word that fills `{value}`: a band or a stance name, for the three kinds that carry one; empty for the others. */
function valueWord(reg: Registries, x: Intercepted): string {
  if (x.kind === 'stance') return String(reg.commandStances.get(x.value)?.name ?? x.value).toLowerCase();
  if (x.kind === 'impunity' || x.kind === 'attraction') return x.value;
  return '';
}

/**
 * The template fragment of an intercept: a line of its kind's `frequencyFragments` entry (the subject-only lines for a partial one),
 * picked by `fnv1a(id)`, so it is stable and draws nothing. `{name}` is her name and `{value}` the band or stance word.
 */
export function fallbackFragment(reg: Registries, x: Intercepted, name: string): string {
  const entry = reg.frequencyFragments.get(x.kind);
  const lines = ((x.partial ? entry?.subjectOnly : entry?.lines) as string[] | undefined) ?? [];
  const line = lines.length === 0 ? '…{name}…' : lines[fnv1a(x.id) % lines.length];
  return line.replaceAll('{name}', name).replaceAll('{value}', valueWord(reg, x));
}

const IMPUNITY_GIST: Record<string, string> = {
  cowed: 'she is afraid of what the commander can do to her',
  low: 'she is wary of what the commander can do to her',
  high: 'she thinks the commander can do little to her',
  brazen: 'she thinks the commander can do nothing to her',
};
const ATTRACTION_GIST: Record<string, string> = {
  none: 'she feels no attraction to the commander',
  faint: 'she feels a faint attraction to the commander',
  interested: 'she is interested in the commander',
  strong: 'she feels a strong attraction to the commander',
};

/**
 * The kind and value of an intercept in plain words, for the model that words it and for the leak detector. It reads the same
 * for a true and a false intercept: the engine never says which (a distorted value is simply another plausible one).
 * Her name is not in it (the caller adds it). No digit, no pronoun for the commander.
 */
export function interceptGist(state: CampaignState, reg: Registries, x: Intercepted): string {
  switch (x.kind) {
    case 'stance': return `her stance toward the commander's authority is "${String(reg.commandStances.get(x.value)?.name ?? x.value).toLowerCase()}"`;
    case 'impunity': return IMPUNITY_GIST[x.value] ?? IMPUNITY_GIST.low;
    case 'attraction': return ATTRACTION_GIST[x.value] ?? ATTRACTION_GIST.none;
    case 'demand': {
      const d = state.discipline?.demands.find((y) => y.id === x.refId);
      return x.value === NONE || d === undefined ? 'she wants nothing from the commander' : `she wants something from the commander: ${d.text}`;
    }
    case 'loyalty':
      return x.value === 'mutiny' ? 'she is thinking of turning on the commander' : x.value === 'desertion' ? 'she is thinking of leaving the squad' : 'she is not thinking of leaving';
    case 'fact': {
      const f = state.memory.facts.find((y) => y.id === x.refId);
      return x.value === NONE || f === undefined ? 'she has nothing to hide' : f.text;
    }
    case 'refusal': return x.value === REFUSES ? 'she means to refuse the next order' : 'she will follow the next order';
    case 'secret': {
      const s = state.personal?.secrets?.find((y) => y.id === x.refId);
      return x.value === NONE || s === undefined ? 'she keeps nothing from the commander' : s.text;
    }
  }
}

const FRAGMENT_MAX = 160;

/** A fragment text as the state keeps it: control characters and blanks collapsed, 1 to 160 characters; anything else is `null`. */
export function frequencyText(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return t === '' || t.length > FRAGMENT_MAX ? null : t;
}
