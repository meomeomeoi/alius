import type { Registries } from '../content/types';
import { bondOf, enabledCategories, publicityMismatch, smotherActive, wantBandOf } from '../engine/bonds';
import { intimacyOf } from '../engine/relations/gain';
import type { CampaignState } from '../engine/state/types';
import type { ContextBuilder } from '../llm/context';

// The non-engine layer of P9d (like `src/discipline/`): it turns engine state into the lines the main model reads.
// Directive ids owned here: `content` (manual), `limits:<unitId>`, `lead`, `boundary:<n>`, `rule:<unitId>` and `publicity:<unitId>` (scene) and `co_command:<unitId>` (manual, while she is in the scene). `ask:<unitId>` is the
// ASK chip's one-reply directive (set by the scene controller). Later tasks add `want:`, `rule:`, `publicity:` and
// `co_command:`, each cleared by the function that sets it.

/** The one category id the directive reads by name: the old single "explicit scenes" switch became this category. */
export const EXPLICIT_CATEGORY = 'explicit_scenes';

const orderedCategories = (reg: Registries) => [...reg.contentCategories.values()].sort((a, b) => Number(a.order) - Number(b.order));
const clean = (text: string): string => text.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * What every main-model generation is told about content: the categories that are off (never to appear) and what is said
 * about explicit scenes. Empty when nothing is excluded and `explicit_scenes` is not enabled. With no campaign: empty.
 */
export function contentLine(state: Pick<CampaignState, 'content'> | null, reg: Registries): string {
  if (state === null) return '';
  const on = enabledCategories(state);
  const off = orderedCategories(reg).filter((c) => !on.includes(String(c.id)));
  const parts: string[] = [];
  if (off.length > 0) parts.push(`Content excluded from this story — never depict, imply or describe: ${off.map((c) => String(c.label)).join(', ')}.`);
  if (on.includes(EXPLICIT_CATEGORY)) parts.push('Explicit intimate scenes are allowed when the story leads there.');
  else if (reg.contentCategories.has(EXPLICIT_CATEGORY)) parts.push('Fade out intimate moments.');
  return parts.join(' ');
}

/** The `want:<unitId>` directives this builder holds because of her Want (so a refresh clears only those, never a patience one). */
const wantSet = new WeakMap<ContextBuilder, Set<string>>();

/**
 * Sets or clears the directives this layer owns from the state; the app calls it with every `applyContext()`, so a change
 * of categories reaches the next generation. With no campaign (`null`) it clears them all.
 */
export function bondsDirectives(builder: ContextBuilder, state: CampaignState | null, reg: Registries): void {
  builder.clearMatching((d) => d.id.startsWith('limits:') || d.id.startsWith('boundary:') || d.id.startsWith('rule:') || d.id.startsWith('co_command:') || d.id.startsWith('publicity:') || d.id.startsWith('smother:'));
  builder.clearDirective('lead');
  for (const id of wantSet.get(builder) ?? []) builder.clearDirective(id);
  wantSet.set(builder, new Set());
  const line = contentLine(state, reg);
  if (line === '' || state === null) builder.clearDirective('content');
  else builder.setDirective({ id: 'content', expiresAfter: 'manual', text: line });
  if (state === null || !state.scene) return;

  // her own limits: from her card, they hold whether or not the category is switched on
  const labelOf = (id: string) => String(reg.contentCategories.get(id)?.label ?? id);
  for (const id of state.scene.participants) {
    const unit = state.squad.find((u) => u.id === id);
    const bond = unit ? bondOf(unit) : null;
    if (!unit || !bond) continue;
    const categories = [...new Set(bond.ownLimits.categories)].filter((c) => reg.contentCategories.has(c));
    const ordered = orderedCategories(reg).map((c) => String(c.id)).filter((c) => categories.includes(c));
    const note = clean(bond.ownLimits.note ?? '');
    if (ordered.length === 0 && note === '') continue;
    const text = ordered.length > 0
      ? `${unit.displayName} will not take part in: ${ordered.map(labelOf).join(', ')}.${note !== '' ? ` ${note}` : ''}`
      : `${unit.displayName} has a personal limit: ${note}`;
    builder.setDirective({ id: `limits:${id}`, expiresAfter: 'scene', text });
  }

  // unmet want colours how she speaks, from the `aching` band, while she is in the scene
  for (const id of state.scene.participants) {
    const unit = state.squad.find((u) => u.id === id);
    const band = wantBandOf(state, reg, id);
    if (!unit || (band !== 'aching' && band !== 'desperate')) continue;
    builder.setDirective({ id: `want:${id}`, expiresAfter: 'manual', text: `${unit.displayName} is restless and irritable with unmet want; it colours how she speaks to the commander.` });
    wantSet.get(builder)!.add(`want:${id}`);
  }

  // a formal co-command by open agreement (the Embrace stand-in of a defect that names a relation flag): she is not reminded to defer
  for (const id of state.scene.participants) {
    const unit = state.squad.find((u) => u.id === id);
    const flags = state.relations[id]?.flags ?? [];
    if (!unit || !unit.defects.some((d) => { const f = reg.defects.get(d.id)?.embraceFlag; return typeof f === 'string' && flags.includes(f); })) continue;
    builder.setDirective({ id: `co_command:${id}`, expiresAfter: 'manual', text: `${unit.displayName} shares command with the commander by open agreement.` });
  }

  // she has locked the hangar (the Smother stand-in): it is why this scene happens
  const hold = smotherActive(state);
  const holder = hold ? state.squad.find((u) => u.id === hold.unitId) : undefined;
  if (hold && holder && state.scene.participants.includes(holder.id)) {
    builder.setDirective({ id: `smother:${holder.id}`, expiresAfter: 'scene', text: `${holder.displayName} has locked the hangar to keep the commander at base; she wants them close and safe.` });
  }

  // she wants the relationship more or less open than it is: she is present, so it can come up
  for (const id of state.scene.participants) {
    const unit = state.squad.find((u) => u.id === id);
    const level = state.relations[id]?.publicity?.level;
    const pref = unit ? bondOf(unit)?.publicity : undefined;
    if (!unit || level === undefined || pref === undefined || !intimacyOf(state).romance || !publicityMismatch(state, id)) continue;
    builder.setDirective({ id: `publicity:${id}`, expiresAfter: 'scene', text: `${unit.displayName} wants the relationship ${pref}; it is ${level}.` });
  }

  // a rule she proposed: pressed in the scene she is in, or negotiated there (from state, so it survives a reload)
  for (const rule of state.bonds?.rules ?? []) {
    const unit = state.squad.find((u) => u.id === rule.unitId);
    if (!unit || !state.scene.participants.includes(unit.id) || (rule.status !== 'negotiating' && !(rule.status === 'proposed' && rule.delivered === true))) continue;
    const text = clean(rule.text);
    builder.setDirective({
      id: `rule:${unit.id}`, expiresAfter: 'scene',
      text: rule.status === 'negotiating'
        ? `${unit.displayName} proposed a rule: "${text}" She and the commander negotiate it now; they settle on a version both can live with.`
        : `${unit.displayName} has proposed a rule and presses it this scene: "${text}".`,
    });
  }

  // who leads a romantic scene (decided by the engine, never by the model) and the boundaries the commander set in it
  const lead = state.scene.lead;
  const leader = lead ? state.squad.find((u) => u.id === lead.unitId) : undefined;
  if (lead && leader && intimacyOf(state).romance) {
    const name = leader.displayName;
    const text = lead.by === 'unit' ? `${name} leads this scene.` : lead.by === 'commander' ? `The commander leads this scene; ${name} follows.` : `${name} and the commander share the lead.`;
    builder.setDirective({ id: 'lead', expiresAfter: 'scene', text });
  }
  (state.scene.limits ?? []).forEach((text, i) => {
    const t = clean(text);
    if (t !== '') builder.setDirective({ id: `boundary:${i}`, expiresAfter: 'scene', text: `In this scene, a boundary the commander set: ${t}` });
  });
}

/** POSTPONE on a desire demand: for her next reply only (same id as the restless directive, which a refresh never touches). */
export function patienceDirective(unitId: string, name: string): { id: string; expiresAfter: 'next_reply'; text: string } {
  return { id: `want:${unitId}`, expiresAfter: 'next_reply', text: `${name} was asked to wait; she is trying to be patient.` };
}

/** The ASK chip: for her next reply only. */
export function askDirective(unitId: string, name: string): { id: string; expiresAfter: 'next_reply'; text: string } {
  return { id: `ask:${unitId}`, expiresAfter: 'next_reply', text: `The commander asks ${name} what she wants; she answers plainly, in character.` };
}
