import type { Registries } from '../content/types';
import { changedAxes } from '../engine/development/words';
import { developmentOf } from '../engine/development/state';
import type { CampaignState, DevFact } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import { estTokens } from '../llm/text';

interface Deps {
  registries: () => Registries;
}

const MAX_AXES = 3;
const MAX_FACTS = 2;

function presentUnits(s: CampaignState) {
  return (s.scene?.participants ?? []).map((id) => s.squad.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => u !== undefined);
}

/** Her facts for the block: the ones she edited first, then the newest; two. Unshown ones count (behaviour first). */
const topFacts = (facts: readonly DevFact[]): DevFact[] =>
  facts.map((f, i) => ({ f, i })).sort((a, b) => Number(b.f.edited === true) - Number(a.f.edited === true) || b.i - a.i).slice(0, MAX_FACTS).map((x) => x.f);

/** Same trimming as the memory block: the title and as many lines as fit, the last ones go first; a first line too long is cut by characters. */
function fitItems(header: string, items: string[], budget: number | undefined): string | null {
  if (items.length === 0) return null;
  const limit = budget ?? Infinity;
  const kept: string[] = [];
  for (const item of items) {
    if (estTokens([header, ...kept, item].join('\n')) <= limit) {
      kept.push(item);
      continue;
    }
    if (kept.length === 0) {
      const room = Math.floor(limit * 3.6) - header.length - 1;
      if (room >= 12) kept.push(item.slice(0, room).trimEnd());
    }
    break;
  }
  return kept.length === 0 ? null : [header, ...kept].join('\n');
}

/**
 * The "since joining" block (P14b §7): per present named unit with development, in words, how she differs from her file now and what she
 * has become in her own lines, so the main model plays who she is now. Inside the P3b memory share (`group: 'memory'`, after the dossier
 * and before the journal). Only in a scene, and every line is about the present unit herself. No numbers, no pronoun for the commander.
 */
export function registerDevelopmentContext(builder: ContextBuilder, deps: Deps): void {
  builder.register({
    id: 'since_joining', priority: 68, group: 'memory',
    render: (s, budget) => {
      if (!s.scene) return null;
      const items = presentUnits(s).flatMap((u) => {
        if (u.kind !== 'named' || u.development === undefined) return [];
        const axes = changedAxes(u, deps.registries(), s.content?.enabled ?? []).slice(0, MAX_AXES).map((a) => a.words);
        const facts = topFacts(developmentOf(u).facts).map((f) => f.text);
        const parts = [...axes, ...facts];
        return parts.length > 0 ? [`- ${u.displayName}: ${parts.join('; ')}`] : [];
      });
      return fitItems('Since joining the unit:', items, budget);
    },
  });
}
