import type { Registries } from '../content/types';
import { bondTierOf } from '../engine/bonds';
import { decorOf } from '../engine/personal/decor';
import { pressureGate } from '../engine/personal/gates';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder, Directive } from '../llm/context';

/**
 * What the main model is told about the pressure individual soldiers put on the commander (P9c). Every id starts with
 * `personal:`; none starts with a prefix P9, P9d, P9b, P9e or P11 reserve. All of them are derived from the state on every
 * refresh, so they follow a reload and a chat switch needs only `clearPersonalDirectives`. The engine decides what is true; this
 * layer only words it. No text gives the commander a pronoun (lore §0).
 */

/** Ids that are derived from the state on every refresh. Later tasks add `personal:token…`, `personal:secret:`, `personal:truth:`, `personal:mark` and `personal:obedience:`. */
export const DERIVED = ['personal:court:', 'personal:claimed:', 'personal:decor:', 'personal:booking:'] as const;

const recent = (state: CampaignState, day: number): boolean => day >= state.day - 1 && day <= state.day;

/**
 * Derived directives for the units in the scene (`present`):
 *  - `personal:court:<id>`: she passes the courtship gate, so she may propose the next step herself;
 *  - `personal:claimed:<id>`: she claimed the commander in public today or yesterday, and she is with someone else;
 *  - `personal:decor:<id>`: the commander peeled something she put on the device today or yesterday;
 *  - `personal:booking:<id>`: she booked this slot and the commander came, or the commander cancelled her booking today or yesterday.
 */
export function personalDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (!unit || unit.kind !== 'named') continue;
    const name = unit.displayName;
    if (pressureGate(state, reg, id, 'courtship') === null) {
      out.push({ id: `personal:court:${id}`, expiresAfter: 'scene', text: `${name} takes the initiative with the commander; she may propose the next step herself.` });
    }
    if (present.length > 1 && bondTierOf(state, reg, id) === 'romantic' && (state.personal?.claims ?? []).some((c) => c.unitId === id && recent(state, c.day))) {
      out.push({ id: `personal:claimed:${id}`, expiresAfter: 'scene', text: `${name} has made it plain to everyone that the commander is hers.` });
    }
    const peeled = Object.values(decorOf(state, id)?.removed ?? {}).filter((d): d is number => typeof d === 'number' && recent(state, d));
    if (peeled.length > 0) {
      out.push({ id: `personal:decor:${id}`, expiresAfter: 'scene', text: `${name} noticed that the commander peeled something she had put on the device; it stings, and she lets it show.` });
    }
    const mine = (state.personal?.bookings ?? []).filter((b) => b.unitId === id);
    const played = mine.some((b) => b.status === 'played' && b.day === state.day && b.slot === state.slot);
    const cancelled = mine.some((b) => b.status === 'cancelled' && recent(state, b.day));
    if (played) {
      out.push({ id: `personal:booking:${id}`, expiresAfter: 'scene', text: `${name} booked this time and expects the commander's full attention.` });
    } else if (cancelled) {
      out.push({ id: `personal:booking:${id}`, expiresAfter: 'scene', text: `The commander cancelled the time ${name} had booked; she remembers it.` });
    }
  }
  return out;
}

/** Drops every directive this layer owns (a chat switch, no campaign). */
export function clearPersonalDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith('personal:'));
}

/** Sets the derived directives and drops the ones that no longer hold. Called on every refresh. */
export function refreshPersonalDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  builder.clearMatching((d) => DERIVED.some((p) => d.id.startsWith(p)));
  for (const d of personalDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
