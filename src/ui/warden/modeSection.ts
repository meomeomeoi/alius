import type { Wizard } from '../../setup/wizard';
import { DEATH_RULES, type DeathRule } from '../../engine/warden/state';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** What each campaign mode and death rule is called and says. Plain meta text: no fiction voice, no pronoun for the commander. */
const MODES: Array<{ id: 'default' | 'leashswap'; label: string; text: string; address: string }> = [
  { id: 'default', label: 'DEFAULT', text: 'The commander gives the orders. The Leash is the corporation\'s, filed through oversight.', address: 'glossary:leash' },
  { id: 'leashswap', label: 'LEASHSWAP', text: 'The commander carries the controller implant. One soldier, the warden, holds the Leash for the corporation.', address: 'glossary:leashswap' },
];
const RULES: Record<DeathRule, { label: string; text: string }> = {
  rewind_day: { label: 'REWIND DAY', text: 'The day starts again from its beginning. The death leaves no memory.' },
  campaign_end: { label: 'CAMPAIGN END', text: 'The campaign closes with an epilogue and the save becomes read-only.' },
};

/**
 * The MODE section of the WORLD PARAMETERS step (P13 §1): DEFAULT or LEASHSWAP and, under LEASHSWAP, the death rule. The rule is fixed
 * when the campaign starts. Redrawn with the screen.
 */
export function renderModeSection(host: HTMLElement, wizard: Wizard): void {
  const c = wizard.state.campaign;
  const section = h('section', { class: 'alius-section alius-mode' },
    h('h3', {}, 'MODE'),
    h('div', { class: 'alius-cards' }, ...MODES.map((m) =>
      h('button', {
        type: 'button', class: 'alius-card alius-option alius-mode-choice', 'data-id': m.id, 'aria-pressed': String(c.kind === m.id),
        ...analyzeNative(m.address), onclick: () => wizard.setCampaignMode(m.id),
      }, h('strong', {}, m.label), h('p', {}, m.text)))));
  if (c.kind === 'leashswap') {
    section.append(
      h('h4', {}, 'IF THE COMMANDER DIES'),
      h('p', { class: 'alius-dim' }, 'Fixed when the campaign starts. The default follows the combat difficulty.'),
      h('div', { class: 'alius-cards' }, ...DEATH_RULES.map((r) =>
        h('button', {
          type: 'button', class: 'alius-card alius-option alius-death-rule', 'data-id': r, 'aria-pressed': String(c.deathRule === r),
          ...analyzeNative('glossary:death_rule'), onclick: () => wizard.setDeathRule(r),
        }, h('strong', {}, RULES[r].label), h('p', {}, RULES[r].text)))));
  }
  host.append(section);
}

const CORPORATION = 'corporation';

/** The WARDEN select of the UNITS step: the chosen units and CORPORATE ASSIGNMENT. Draws nothing outside LEASHSWAP or with no unit chosen. */
export function renderWardenPick(host: HTMLElement, wizard: Wizard): void {
  const s = wizard.state;
  if (s.campaign.kind !== 'leashswap' || s.units.length === 0) return;
  const select = h('select', { class: 'alius-input', name: 'warden', 'aria-label': 'Warden' }) as HTMLSelectElement;
  select.append(h('option', { value: CORPORATION }, 'CORPORATE ASSIGNMENT'));
  s.units.forEach((u, i) => select.append(h('option', { value: `player:${i}` }, u.displayName)));
  const w = s.campaign.warden;
  select.value = w.by === 'player' ? `player:${w.index}` : CORPORATION;
  select.addEventListener('change', () => {
    const v = select.value;
    wizard.setWardenPick(v.startsWith('player:') ? { by: 'player', index: Number(v.slice('player:'.length)) } : { by: 'corporation' });
  });
  host.append(h('label', { class: 'alius-field alius-warden-pick', ...analyzeNative('glossary:warden') },
    h('span', { class: 'alius-field-label' }, 'WARDEN: the soldier who holds the Leash'),
    select,
    h('span', { class: 'alius-dim' }, w.by === 'corporation' ? 'Oversight picks the unit most loyal to the corporation.' : 'The warden is the squad\'s choice, not the corporation\'s.')));
}
