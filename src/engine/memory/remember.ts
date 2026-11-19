import type { MemoryRuleEntry } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import type { EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import type { CampaignState } from '../state/types';
import { addFact } from './facts';
import { joinNames, memoryResolverFor, type MemoryResolution } from './resolvers';

/** Rules by event type, built once per registry set (the registry map is the key, so a test that swaps it gets its own index). */
const index = new WeakMap<Map<string, Entry>, Map<string, MemoryRuleEntry[]>>();
function rulesFor(reg: Registries, type: string): MemoryRuleEntry[] {
  let byEvent = index.get(reg.memoryRules);
  if (!byEvent) {
    byEvent = new Map();
    for (const e of reg.memoryRules.values()) {
      const rule = e as unknown as MemoryRuleEntry;
      const list = byEvent.get(rule.event) ?? [];
      list.push(rule);
      byEvent.set(rule.event, list);
    }
    index.set(reg.memoryRules, byEvent);
  }
  return byEvent.get(type) ?? [];
}

/** `when`: `true` / `false` mean the var or id group is non-empty / empty; a string must equal the var. */
function holds(when: MemoryRuleEntry['when'], res: MemoryResolution): boolean {
  for (const [key, want] of Object.entries(when ?? {})) {
    const value = key in res.vars ? res.vars[key] : (res.ids[key]?.length ?? 0) > 0 ? 'yes' : '';
    if (typeof want === 'boolean' ? (value !== '') !== want : value !== want) return false;
  }
  return true;
}

const fill = (text: string, vars: Record<string, string>): string => text.replace(/\{([A-Za-z0-9_]+)\}/g, (m, k: string) => vars[k] ?? m);

const livingNamed = (draft: CampaignState): string[] => draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);

/** Who knows it at once: the union of the audience parts (`'*'` when public). */
function audienceOf(draft: CampaignState, parts: string[], res: MemoryResolution, aboutIds: string[]): string[] {
  const known = new Set<string>();
  for (const part of parts) {
    if (part === 'public') return ['*'];
    if (part === 'squad') livingNamed(draft).forEach((id) => known.add(id));
    else if (part === 'present') (draft.scene?.participants ?? aboutIds.filter((id) => id !== 'world')).forEach((id) => known.add(id));
    else (res.ids[part] ?? []).forEach((id) => known.add(id));
  }
  return [...known];
}

/**
 * Writes a fact for every event a rule names (P3b spec §2). Called by `dispatch` after a successful handler (and `carryVote`), so
 * it never sees an `error`. Each rule's fact is fully built before anything is written, and a resolver that throws costs only its
 * own rule. No RNG, and the ids come from their own counter (`fr…`), so nothing else in the save moves.
 */
export function rememberEvents(draft: CampaignState, events: EngineEvent[], reg: Registries): void {
  if (!reg.memoryRules || reg.memoryRules.size === 0) return;
  for (const event of events) {
    if (event.type === 'error') continue;
    const rules = rulesFor(reg, event.type);
    if (rules.length === 0) continue;
    const resolver = memoryResolverFor(event.type);
    if (!resolver) continue;
    let res: MemoryResolution | null;
    try {
      res = resolver(draft, event, reg);
    } catch {
      continue;
    }
    if (res === null) continue;
    for (const rule of rules) {
      if (!holds(rule.when, res)) continue;
      const aboutIds = rule.about === 'world' ? ['world'] : res.ids[rule.about] ?? [];
      if (aboutIds.length === 0) continue; // it is about nobody
      const parts = Array.isArray(rule.audience) ? rule.audience : [rule.audience];
      const knownBy = audienceOf(draft, parts, res, aboutIds);
      const names = res.vars.names ?? (rule.about === 'world' ? '' : joinNames(aboutIds.map((id) => draft.squad.find((u) => u.id === id)?.displayName ?? id)));
      addFact(draft, {
        about: aboutIds, text: fill(rule.text, { ...res.vars, names }), tags: [...rule.tags, ...(res.tags ?? [])], importance: rule.importance as 1 | 2 | 3 | 4 | 5, day: draft.day, knownBy,
        ...(rule.spread !== 'none' && !knownBy.includes('*') ? { spread: rule.spread } : {}),
        ...(rule.hiddenFromCommander === true ? { hiddenFromCommander: true as const } : {}),
      }, { remembered: true });
    }
  }
}
