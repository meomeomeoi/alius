import type { Registries } from '../../content/types';
import { handOf } from '../../engine/hand';
import type { CampaignState, Rule } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import type { RuleChipHandlers } from '../bonds/chips';
import { h } from '../dom';
import { drawSiteReroll } from '../generation/surface';
import { noise } from '../fx';
import { setHand } from './note';

/** The breaks whose tear has played (`ruleId|lastBrokenDay`): a note tears once per break, static afterwards. */
const torn = new Set<string>();
export function resetTorn(): void {
  torn.clear();
}

/**
 * A relationship rule as a note she signed (P10b §4): a delivered proposal with [SIGN] / [NEGOTIATE] / [DON'T SIGN] (the same
 * answers as the rule chips), an active rule signed by both, and a rule broken since yesterday shown torn (the tear animates once
 * per break, never under reduced motion). Text only; the commander's signature is the commander's name in the type font.
 */
export function renderRuleNote(state: CampaignState, reg: Registries, rule: Rule, on: RuleChipHandlers, opts: { motion: boolean }): HTMLElement {
  const unit = state.squad.find((u) => u.id === rule.unitId);
  const name = unit?.displayName ?? rule.unitId;
  const proposed = rule.status === 'proposed' && rule.delivered === true;
  const broken = rule.lastBrokenDay !== undefined && rule.lastBrokenDay >= state.day - 1;
  const note = h(
    'article',
    { class: 'alius-note alius-rule-note alius-voice alius-voice-paper alius-stat', 'data-voice': 'paper', 'data-rule': rule.id, 'data-rule-status': rule.status, ...analyzeAttrs('glossary:rule_note', { unitId: rule.unitId, ruleId: rule.id }) },
    noise('alius-fibre', { frequency: '0.04 0.9', octaves: 2, seed: 3 }),
    h('p', { class: 'alius-note-body' }, rule.text),
    h('p', { class: 'alius-note-sign' }, `— ${name}`),
  );
  setHand(note, unit ? handOf(state, reg, unit.id) : null);
  if (rule.status === 'active') note.append(h('p', { class: 'alius-note-sign alius-note-sign-commander' }, `— ${state.commander.name}`));
  if (broken) {
    note.classList.add('is-torn');
    const key = `${rule.id}|${rule.lastBrokenDay}`;
    if (opts.motion && !torn.has(key)) note.classList.add('is-tearing');
    torn.add(key);
  }
  if (proposed) {
    const full = (state.bonds?.rules ?? []).filter((r) => r.unitId === rule.unitId && r.status === 'active').length >= TUNING.bonds.rules.maxActive;
    const button = (kind: 'accept' | 'negotiate' | 'refuse', text: string, run: () => void, soft = false): HTMLElement => {
      const b = h('button', {
        type: 'button', class: 'alius-btn alius-tagchip', 'data-rule-answer': kind, 'data-rule': rule.id,
        ...(soft ? { 'aria-disabled': 'true', title: `She holds ${TUNING.bonds.rules.maxActive} rules already.` } : {}), ...analyzeNative('glossary:rule_note'),
        onclick: () => { if (b.getAttribute('aria-disabled') !== 'true') run(); },
      }, text);
      return b;
    };
    note.append(h('div', { class: 'alius-chip-group', 'data-rule-group': rule.id },
      button('accept', '[ SIGN ]', () => on.accept(rule.id), full),
      button('negotiate', '[ NEGOTIATE ]', () => on.negotiate(rule.id)),
      button('refuse', "[ DON'T SIGN ]", () => on.refuse(rule.id)),
      on.generation ? drawSiteReroll(h('span'), on.generation, 'flavor.rule', rule.id) : null));
  }
  return note;
}

/** The rules shown as notes for a unit: delivered proposals, active rules and rules broken since yesterday. */
export function ruleNotesFor(state: CampaignState, pick: (unitId: string) => boolean = () => true): Rule[] {
  return (state.bonds?.rules ?? []).filter((r) => pick(r.unitId)
    && ((r.status === 'proposed' && r.delivered === true) || r.status === 'active' || (r.lastBrokenDay !== undefined && r.lastBrokenDay >= state.day - 1)));
}
