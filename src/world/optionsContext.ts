import type { Registries } from '../content/types';
import { firstImpressionWeight } from '../engine/commander/presence';
import type { CampaignState } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import { normDistance, optionStanceEffects, stanceOf, worldChoices } from '../engine/worldOptions';
import type { ContextBuilder } from '../llm/context';
import { estTokens } from '../llm/text';

/**
 * The world options (P8) as the main model sees them: the WORLD SETTINGS block (the lore line of every current choice) and
 * hard directives from the scene directives of the choices and from each present unit's own stance. The engine decides what
 * is said; none of it reaches the mechanic model's extraction input.
 */

const PREFIX = 'World settings: ';
const WORLD_PRIORITY = 85;
/** Directive id prefixes this module owns: it clears them before every refresh and touches no other directive. */
const OWN_PREFIXES = ['world:', 'stance:', 'friction:'] as const;
/** The first-impression weight above which a stance directive that is only for the early days still shows. */
const EARLY_WEIGHT = 0.5;

/** `World settings: ` and the lore line of each current choice in option order, whole lines only, within the token cap. */
export function worldSettingsLine(state: CampaignState, reg: Registries): string {
  const lines: string[] = [];
  for (const { choice } of worldChoices(state, reg)) {
    const next = `${PREFIX}${[...lines, choice.lore].join(' ')}`;
    if (estTokens(next) > TUNING.disposition.worldBlockTokens) continue; // a line that does not fit is dropped whole
    lines.push(choice.lore);
  }
  return `${PREFIX}${lines.join(' ')}`;
}

/** The WORLD SETTINGS provider: renders whenever a campaign exists, scene or not. */
export function registerWorldOptionsContext(builder: ContextBuilder, deps: { registries: () => Registries }): void {
  builder.register({
    id: 'world_settings',
    priority: WORLD_PRIORITY,
    render: (s) => {
      const line = worldSettingsLine(s, deps.registries());
      return line === PREFIX ? null : line;
    },
  });
}

export function clearWorldDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => OWN_PREFIXES.some((p) => d.id.startsWith(p)));
}

/**
 * Sets `world:<optionId>` (the scene directives of the current choices, kept until the next refresh), and for the units in
 * the open scene `stance:<unitId>:<optionId>` (a stance's `directive`, early-only ones only while she is still sizing the
 * commander up) and `friction:<optionId>` (when a `shares` and an `opposes` unit are both present). Clears its own first.
 */
export function worldDirectives(builder: ContextBuilder, state: CampaignState, reg: Registries): void {
  clearWorldDirectives(builder);
  for (const { option, choice } of worldChoices(state, reg)) {
    const texts = choice.effects.flatMap((e) => (e.type === 'scene_directive' ? [e.text] : []));
    if (texts.length > 0) builder.setDirective({ id: `world:${option.id}`, text: texts.join(' '), expiresAfter: 'manual' });
  }
  const present = (state.scene?.participants ?? []).map((id) => state.squad.find((u) => u.id === id)).filter((u): u is NonNullable<typeof u> => u !== undefined);
  for (const option of reg.worldOptions.values()) {
    if (option.squadStance !== true) continue;
    for (const u of present) {
      for (const fx of optionStanceEffects(state, reg, u, option.id)) {
        if (fx.type !== 'directive') continue;
        // an early-days directive is about a commander who departs from the norm: none while the commander matches it
        if (fx.whileEarly === true && (firstImpressionWeight(state, u.id) <= EARLY_WEIGHT || normDistance(state, reg) === 0)) continue;
        builder.setDirective({ id: `stance:${u.id}:${option.id}`, text: fx.text.replaceAll('{name}', u.displayName), expiresAfter: 'scene' });
      }
    }
    const stances = present.map((u) => stanceOf(state, reg, u, option.id)?.stance);
    if (stances.includes('shares') && stances.includes('opposes')) {
      const friction = present.flatMap((u) => optionStanceEffects(state, reg, u, option.id)).find((fx) => fx.type === 'friction_directive');
      if (friction && friction.type === 'friction_directive') builder.setDirective({ id: `friction:${option.id}`, text: friction.text, expiresAfter: 'scene' });
    }
  }
}
