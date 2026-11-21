import type { Entry, Registries } from '../content/types';
import { blockingLive, blockingOf, COMMANDER, WORN_SLOTS } from '../engine/blocking';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';

interface Deps {
  registries: () => Registries;
}

const hintOf = (e: Entry | undefined): string | null => (typeof e?.promptHint === 'string' && e.promptHint.trim() !== '' ? e.promptHint.trim() : null);

/**
 * One person's line of the `[BLOCKING]` block: the fields that are set, in order (posture and place, the contact, what is worn, what
 * she is doing, a set intimacy, a note), from the entries' `promptHint`s: `Rhea: sitting at the desk, on comms.` A person with no field
 * set has no line (`null`). The commander is "The commander", never a pronoun. An unset field is never shown, and neither is a default.
 */
export function blockingLine(state: CampaignState, reg: Registries, personId: string): string | null {
  const b = blockingOf(state.scene, personId);
  const parts: string[] = [];
  const stance = [hintOf(reg.blockingPostures.get(b.posture ?? '')), hintOf(reg.blockingAnchors.get(b.anchor?.id ?? ''))].filter((x): x is string => x !== null);
  if (stance.length > 0) parts.push(stance.join(' '));
  const contact = hintOf(reg.blockingContacts.get(b.contact?.id ?? ''));
  if (contact !== null) parts.push(contact);
  const seen = new Set<string>();
  for (const slot of WORN_SLOTS) {
    const w = b.worn?.[slot];
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    const h = hintOf(reg.blockingItems.get(w.id));
    if (h !== null) parts.push(h);
  }
  const activity = hintOf(reg.blockingActivities.get(b.activity ?? ''));
  if (activity !== null) parts.push(activity);
  if (b.intimacy !== undefined && b.intimacy !== 'none') parts.push(`intimacy: ${b.intimacy}`);
  if (b.note !== undefined && b.note !== '') parts.push(`note: ${b.note}`);
  if (parts.length === 0) return null;
  const name = personId === COMMANDER ? 'The commander' : state.squad.find((u) => u.id === personId)?.displayName ?? personId;
  return `${name}: ${parts.join(', ')}.`;
}

/**
 * The `[BLOCKING]` block (P15a): who is where, in what posture, touching whom, wearing what, doing what, kept by the engine so the story
 * never contradicts it. A core provider (continuity is the point: the memory share never takes its room), rendered only while the
 * blocking is live and something is set. The participants in order, then the commander.
 */
export function registerBlockingContext(builder: ContextBuilder, deps: Deps): void {
  builder.register({
    id: 'blocking', priority: 88, core: true,
    render: (s) => {
      const reg = deps.registries();
      if (!blockingLive(s, reg)) return null;
      const lines = [...(s.scene?.participants ?? []), COMMANDER].map((id) => blockingLine(s, reg, id)).filter((l): l is string => l !== null);
      return lines.length === 0 ? null : ['[BLOCKING]', ...lines].join('\n');
    },
  });
}
