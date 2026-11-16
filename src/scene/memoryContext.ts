import type { Registries } from '../content/types';
import { threadOf } from '../engine/dms';
import { openPromises, retrieveFacts } from '../engine/memory';
import { factLine } from '../engine/memory/audience';
import { memoryConfig } from '../engine/memory/config';
import { journalLines } from '../engine/memory/journal';
import { recentLines } from '../engine/memory/scenes';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';
import { estTokens } from '../llm/text';
import type { AliusSettings } from '../settings';

interface Deps {
  registries: () => Registries;
  settings: () => AliusSettings;
}

const DM_DAYS = 2;
const DM_TEXT_MAX = 120;

const nameOf = (s: CampaignState, id: string): string => {
  if (id === 'commander') return s.commander.name;
  return s.squad.find((u) => u.id === id)?.displayName ?? id;
};

function presentUnits(s: CampaignState) {
  return (s.scene?.participants ?? []).map((id) => s.squad.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => u !== undefined);
}

/** A scene with one unit; two or more present make it a group, where nothing only one of them knows may appear. */
const privateScene = (s: CampaignState): boolean => s.scene !== undefined && s.scene.participants.length === 1;

/**
 * `header` and as many of `items` as fit in `budget` tokens, best first (the lowest-ranked go first). An item that is too long for even
 * the first place is cut by characters rather than dropped. Null when nothing fits.
 */
function fitItems(header: string, items: string[], budget: number | undefined): string | null {
  if (items.length === 0) return null;
  const limit = budget ?? Infinity;
  const kept: string[] = [];
  for (const item of items) {
    const text = [header, ...kept, item].join('\n');
    if (estTokens(text) <= limit) {
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
 * The memory group of the context block (P3b §6): dossier, journal, facts, promises, recent and the DM recap. Each is trimmed inside
 * the budget the builder passes. Privacy is per audience: nothing that only one of the present units knows reaches a group scene
 * (a dossier's `own` part, the journal's evidence and the DM recap are for a private scene only). Out of a scene only the world
 * dossier and the public chronicle lines render.
 */
export function registerMemoryContext(builder: ContextBuilder, deps: Deps): void {
  builder.register({
    id: 'dossier', priority: 70, group: 'memory',
    render: (s, budget) => {
      const dossiers = s.memory.dossiers ?? {};
      const items: string[] = [];
      if (s.scene) {
        const units = presentUnits(s);
        if (privateScene(s)) for (const u of units) if (dossiers[u.id]?.own) items.push(`- ${u.displayName} (only ${u.displayName} and the commander know): ${dossiers[u.id].own}`);
        for (const u of units) if (dossiers[u.id]?.shared) items.push(`- ${u.displayName}: ${dossiers[u.id].shared}`);
      }
      if (dossiers['*']?.shared) items.push(`- Everyone: ${dossiers['*'].shared}`);
      return fitItems('What the squad remembers:', items, budget);
    },
  });

  builder.register({
    id: 'journal', priority: 65, group: 'memory',
    render: (s, budget) => {
      if (!s.scene) return null;
      const cfg = memoryConfig(s);
      const evidence = privateScene(s);
      const items = presentUnits(s).flatMap((u) => {
        const lines = journalLines(s, deps.registries(), u.id, { n: cfg.journalLines, evidence });
        return lines.length > 0 ? [`- ${u.displayName}: ${lines.join('; ')}`] : [];
      });
      return fitItems('Lately with the commander:', items, budget);
    },
  });

  builder.register({
    id: 'facts', priority: 60, group: 'memory',
    render: (s, budget) => {
      if (!s.scene) return null;
      const tags = presentUnits(s).flatMap((u) => [...u.likes, ...u.dislikes]);
      const facts = retrieveFacts(s, { participants: s.scene.participants, tags }, memoryConfig(s).retrievalK);
      return fitItems('Known facts:', facts.map((f) => factLine(s, f, s.scene!.participants)), budget);
    },
  });

  builder.register({
    id: 'promises', priority: 55, group: 'memory',
    render: (s, budget) => {
      if (!s.scene) return null;
      const open = openPromises(s, s.scene.participants, s.scene.participants);
      return fitItems('Open promises:', open.map((p) => `- ${nameOf(s, p.by)} promised ${nameOf(s, p.to)}: ${p.text}`), budget);
    },
  });

  builder.register({
    id: 'recent', priority: 50, group: 'memory',
    render: (s, budget) => {
      const lines = recentLines(s, s.scene ? s.scene.participants : 'public', memoryConfig(s));
      return fitItems('Recently in the unit:', lines.map((l) => `- ${l}`), budget);
    },
  });

  builder.register({
    id: 'dm_recap', priority: 45, group: 'memory',
    render: (s, budget) => {
      if (!privateScene(s)) return null;
      const unitId = s.scene!.participants[0];
      const n = memoryConfig(s).dmLines;
      if (n <= 0) return null;
      let messages = threadOf(s, unitId).filter((m) => m.day >= s.day - DM_DAYS).slice(-n);
      const limit = budget ?? Infinity;
      const text = (ms: typeof messages): string =>
        `Messages lately: ${ms.map((m) => `${m.from === 'commander' ? 'commander' : nameOf(s, m.from)}: ${m.text.replace(/\s+/g, ' ').trim().slice(0, DM_TEXT_MAX)}`).join('; ')}`;
      while (messages.length > 1 && estTokens(text(messages)) > limit) messages = messages.slice(1); // the oldest go first
      if (messages.length === 0) return null;
      const out = text(messages);
      return estTokens(out) <= limit ? out : out.slice(0, Math.max(0, Math.floor(limit * 3.6))).trimEnd() || null;
    },
  });
}
