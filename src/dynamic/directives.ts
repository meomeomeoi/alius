import type { Registries } from '../content/types';
import { frameRank } from '../engine/blocking/state';
import { herPracticeLive, dynamicOn } from '../engine/dynamic/gate';
import { frameEntry } from '../engine/dynamic/hold';
import { sceneProbe } from '../engine/dynamic/probes';
import { dynamicOf } from '../engine/dynamic/state';
import { leadingStyle } from '../engine/dynamic/style';
import type { DynamicDomainEntry, DynamicMilestoneEntry, PracticeStyleEntry, ProbeAxisEntry } from '../engine/dynamic/types';
import { isLiving } from '../engine/economy';
import type { CampaignState, Unit } from '../engine/state/types';
import { TUNING } from '../engine/tuning';
import type { ContextBuilder, Directive } from '../llm/context';

const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
const sentence = (text: string): string => clean(text).replace(/[.\s]+$/, '');

/**
 * What the main model is told about the dynamic (P15, plan R23). Every id starts with `dynamic:`; none starts with a prefix an older package
 * reserves. All of them are derived from the state on every refresh (never stored), so they follow a reload and a chat switch needs only
 * `clearDynamicDirectives`. They follow the prompt-hygiene rule: a probe line lasts one scene and goes once it is answered, a holder line holds
 * while she is in the room, none is a standing description of the commander, and none carries a number. They tell the model what SHE does and
 * expects; no line states what the commander feels and none gives the commander a pronoun (lore §0, Ruling E).
 */

/** The prefix of every directive of the dynamic (the holder, the probe, and later the offer, aftermath, Leash block, command, witness and disappointment lines). */
export const DYNAMIC_PREFIX = 'dynamic:';
export const PROBE_PREFIX = 'dynamic:probe:';

/** Her style pair in words, the secondary's side named while it leads. */
function styleLine(state: CampaignState, reg: Registries, unit: Unit): string {
  const pair = unit.bond?.practice?.style;
  if (pair === undefined) return '';
  const label = (key: string): string => clean(String((reg.practiceStyles.get(key) as unknown as PracticeStyleEntry | undefined)?.label ?? key)).toLowerCase();
  const lead = leadingStyle(state, reg, unit.id);
  const base = pair.secondary === undefined ? `Her manner is ${label(pair.primary)}.` : `Her manner is ${label(pair.primary)}, with a ${label(pair.secondary)} streak.`;
  return lead.phaseLead === 'secondary' ? `${base} Her ${label(lead.key)} side comes through now.` : base;
}

/** The directive of a holder who is in the room and at `play` or beyond: the frame, what she has claimed, her manner and what she waits to answer. */
function holderDirective(state: CampaignState, reg: Registries, unit: Unit): Directive | null {
  const dyn = dynamicOf(state, unit.id);
  const frame = dyn === undefined ? undefined : frameEntry(reg, dyn.frame);
  if (dyn === undefined || frame === undefined || frameRank(dyn.frame) < frameRank('play')) return null;
  const name = unit.displayName;
  const claimed = dyn.domains
    .map((d) => (reg.dynamicDomains.get(d.id) as unknown as DynamicDomainEntry | undefined)?.promptHint)
    .filter((h): h is string => typeof h === 'string')
    .map(sentence);
  const waiting = state.dynamic?.open.milestones.find((m) => m.unitId === unit.id);
  const milestone = waiting === undefined ? undefined : (reg.dynamicMilestones.get(waiting.milestoneId) as unknown as DynamicMilestoneEntry | undefined);
  const refused = dyn.refusals.some((day) => state.day - day <= TUNING.dynamic.directives.refusalDays);
  const parts = [
    `${name} holds the lead with the commander: ${sentence(frame.promptHint)}.`,
    ...(claimed.length > 0 ? [`What she has claimed: ${claimed.join('; ')}.`] : []),
    styleLine(state, reg, unit),
    ...(milestone !== undefined ? [`She is waiting for the commander's answer to something she asked: ${sentence(milestone.promptHint)}.`] : []),
    ...(refused ? ['She has not forgotten a recent refusal and will answer it in her own way.'] : []),
    'Show it in how she acts and speaks; never name it as a mechanic.',
  ];
  return { id: `${DYNAMIC_PREFIX}${unit.id}`, expiresAfter: 'scene', text: parts.filter((p) => p !== '').join(' ') };
}

/** The directive of her pending probe while she is present: a small, deniable gesture on one axis, never named. */
function probeDirective(reg: Registries, unit: Unit, axisId: string): Directive {
  const axis = reg.probeAxes.get(axisId) as unknown as ProbeAxisEntry | undefined;
  const label = clean(String(axis?.label ?? axisId));
  const hint = axis === undefined ? '' : ` (she ${sentence(axis.promptHint)})`;
  return {
    id: `${PROBE_PREFIX}${unit.id}`, expiresAfter: 'scene',
    text: `In this scene ${unit.displayName} tests, small and deniable, whether the commander yields on ${label}${hint}; never name it.`,
  };
}

/**
 * Derived directives for the women in the scene (`present`):
 *  - `dynamic:<unitId>`: she holds at `play` or beyond: the frame's line, what she has claimed, her manner (the secondary named while it leads),
 *    and an answer she is waiting for (an open milestone, a recent refusal).
 *  - `dynamic:probe:<unitId>`: her probe is pending (at most one a scene); gone when it is answered or lapses.
 * Nothing while the dynamic is off.
 */
export function dynamicDirectives(state: CampaignState, reg: Registries, present: string[]): Directive[] {
  if (!dynamicOn(state, reg)) return [];
  const out: Directive[] = [];
  const units = present
    .map((id) => state.squad.find((u) => u.id === id))
    .filter((u): u is Unit => u !== undefined && u.kind === 'named' && isLiving(u) && herPracticeLive(state, u.id));
  for (const unit of units) {
    const holder = holderDirective(state, reg, unit);
    if (holder !== null) out.push(holder);
  }
  const probe = sceneProbe(state, units.map((u) => u.id));
  if (probe !== undefined) out.push(probeDirective(reg, units.find((u) => u.id === probe.unitId)!, probe.probe.axis));
  return out;
}

/** Drops every directive this layer owns (a chat switch, no campaign, a scene that closed). */
export function clearDynamicDirectives(builder: ContextBuilder): void {
  builder.clearMatching((d) => d.id.startsWith(DYNAMIC_PREFIX));
}

/** Sets the derived directives and drops the ones that no longer hold; without a state it only clears. Called on every refresh. */
export function refreshDynamicDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries): void {
  clearDynamicDirectives(builder);
  if (state === null) return;
  for (const d of dynamicDirectives(state, reg, state.scene?.participants ?? [])) builder.setDirective(d);
}
