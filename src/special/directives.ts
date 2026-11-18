import type { Registries } from '../content/types';
import { frequencySenseOf, suspicionOf } from '../engine/special/frequency/leaks';
import type { CampaignState } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { ContextBuilder, Directive } from '../llm/context';

/**
 * What the main model is told about the special traits (P12). Every id starts with `special:`; none starts with a prefix P9, P9d,
 * P9b, P9e, P9c or P11 reserve. All of them are derived from the state on every refresh, so they follow a reload and a chat switch
 * needs only `clearSpecialDirectives`. The engine decides what is true; this layer only words it. No text gives the commander a pronoun.
 */

/** Ids that are derived from the state on every refresh. */
export const DERIVED = ['special:static:', 'special:nightmare', 'special:handler'] as const;

/**
 * Derived directives for the units in the scene (`present`):
 *  - `special:static:<id>`: her suspicion is above 50 and her defects let her notice it; she senses static around the commander.
 *    The text never says how suspicious she is;
 *  - `special:handler`: a soldier present knows the commander sells intel to a rival corporation (the handler is named);
 *  - `special:nightmare`: the commander slept badly last night (Bloom dreams); only while a scene is open.
 */
export function specialDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  const out: Directive[] = [];
  for (const id of present) {
    const unit = state.squad.find((u) => u.id === id);
    if (!unit || unit.kind !== 'named') continue;
    if (suspicionOf(state, id) > TUNING.special.frequency.staticAbove && frequencySenseOf(state, reg, id) > 1) {
      out.push({ id: `special:static:${id}`, expiresAfter: 'scene', text: `${unit.displayName} senses static around the commander.` });
    }
  }
  const debts = state.special?.debts;
  if (state.scene !== undefined && debts) {
    const knowers = present.map((id) => state.squad.find((u) => u.id === id)).filter((u) => u !== undefined && state.relations[u.id]?.flags.includes('knows_debts'));
    if (knowers.length > 0) {
      const handler = String(reg.debtHandlers.get(debts.handlerId)?.name ?? 'a handler');
      const names = knowers.map((u) => u!.displayName).join(' and ');
      out.push({ id: 'special:handler', expiresAfter: 'scene', text: `${names} ${knowers.length === 1 ? 'knows' : 'know'} the commander sells intel to a rival corporation through ${handler}.` });
    }
  }
  const paranoia = state.special?.paranoia;
  const dreamt = paranoia?.lastNightmareDay;
  if (state.scene !== undefined && dreamt !== undefined && (dreamt === state.day - 1 || (dreamt === state.day && state.slot === 'night'))) {
    out.push({ id: 'special:nightmare', expiresAfter: 'scene', text: 'The commander slept badly: Bloom dreams.' });
  }
  return out;
}

/** Drops every directive this layer owns (a chat switch, no campaign). */
export function clearSpecialDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith('special:'));
}

/** Sets the derived directives and drops the ones that no longer hold. Called on every refresh. */
export function refreshSpecialDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  builder.clearMatching((d) => DERIVED.some((p) => d.id.startsWith(p)));
  for (const d of specialDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
