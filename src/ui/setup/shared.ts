import type { Registries } from '../../content/types';
import { archetypeOf, descriptor } from '../../engine/commander/profile';
import { VALUE_AXES } from '../../engine/state/types';
import { difficultyHint, type UnitDraft, type Wizard, type WizardState } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/** Helpers the setup screen and the in-world intake steps (P11) share. */

export const nameOf = (reg: Registries, registry: 'roles' | 'corporations' | 'starts' | 'crimes' | 'defects', id: string | null): string => {
  if (!id) return '—';
  const e = reg[registry].get(id);
  return e ? String(e.name) : `UNKNOWN ${id}`;
};

/** A pressable option card: an analysable `.alius-option` button. */
export function card(address: string, cls: string, id: string, selected: boolean, onClick: () => void, ...children: Array<HTMLElement | string>): HTMLElement {
  return h('button', { type: 'button', class: `alius-card alius-option ${cls}`, 'data-id': id, 'aria-pressed': String(selected), ...analyzeNative(address), onclick: onClick }, ...children);
}

/** One card per crime of the registry; picking one calls `wizard.setCrime`. */
export function crimeCards(wizard: Wizard, reg: Registries): HTMLElement {
  const selected = wizard.state.crimeId;
  return h('div', { class: 'alius-cards' }, ...[...reg.crimes.values()].map((c) => {
    const perk = c.perk as { text: string }; const flaw = c.flaw as { text: string };
    return card(`crimes:${c.id}`, 'alius-crime-card', c.id, selected === c.id, () => wizard.setCrime(c.id),
      h('strong', {}, String(c.name)), h('p', {}, String(c.summary)),
      h('p', {}, `PERK: ${perk.text}`), h('p', {}, `FLAW: ${flaw.text}`),
      h('p', { class: 'alius-dim' }, 'Plea: GUILTY'));
  }));
}

/** The commander as descriptors and trait names: never a stat number. */
function commanderLines(s: WizardState, reg: Registries): string[] {
  const c = s.commander;
  const traits = [...c.traits.regular, ...(c.traits.special !== undefined ? [c.traits.special] : [])]
    .map((id) => String(reg.commanderTraits.get(id)?.name ?? id));
  return [
    `BODY        : ${descriptor('strength', c.body.strength)} / ${descriptor('endurance', c.body.endurance)} / ${descriptor('reflexes', c.body.reflexes)}`,
    `EXPRESSION  : ${descriptor('expression', c.expression)}`,
    `SEASONING   : ${descriptor('seasoning', c.seasoning)}`,
    `BUILD       : ${archetypeOf(c.body)}`,
    `TRAITS      : ${traits.join(', ') || '—'}`,
  ];
}

function unitLines(wizard: Wizard, reg: Registries, u: UnitDraft, n: number): string[] {
  const c = u.choice;
  const preview = wizard.previewStart(n); // P9: the stance she would start in
  const values = VALUE_AXES.map((a) => `${a.slice(0, 4).toUpperCase()} ${c.values[a] > 0 ? '+' : ''}${c.values[a]}`).join('  ');
  return [
    '',
    `[${n + 1}] ${u.displayName} — ${nameOf(reg, 'roles', c.roleId)}`,
    `    SIGNATURE : ${c.signature ? c.signature.name : '—'}`,
    `    DEFECTS   : ${c.defects.map((d) => nameOf(reg, 'defects', d.id)).join(', ') || '—'}`,
    `    VALUES    : ${values}`,
    `    START     : TRUST ${c.baseline.trust}  AFFINITY ${c.baseline.affinity}  ATTRACTION ${c.baseline.attraction}`,
    ...(preview ? [`    STANCE    : ${preview.stanceName.toUpperCase()} (TRUST ${preview.trust}, IMPUNITY ${preview.impunity})`] : []),
  ];
}

/** The summary of the whole setup: the veteran REVIEW and the signed dossier show the same lines. */
export function reviewLines(wizard: Wizard, reg: Registries): string[] {
  const s = wizard.state;
  const corpId = s.startId ? String(reg.starts.get(s.startId)?.corporationId ?? '') : null;
  return [
    `COMMANDER   : ${s.commanderName.trim()}`,
    `CORPORATION : ${nameOf(reg, 'corporations', corpId)} — ${nameOf(reg, 'starts', s.startId)}`,
    `CRIME       : ${nameOf(reg, 'crimes', s.crimeId)} (Plea: GUILTY)`,
    ...commanderLines(s, reg),
    `SQUAD       : ${s.units.length}/4 — ${difficultyHint(s.units.length)}`,
    ...s.units.flatMap((u, n) => unitLines(wizard, reg, u, n)),
  ];
}

/** New group or this group, when binding is possible; `null` otherwise. */
export function targetChooser(wizard: Wizard): HTMLElement | null {
  const s = wizard.state;
  if (!s.canBindCurrent) return null;
  const radio = (value: 'new_group' | 'current_group', label: string) => {
    const r = h('input', { type: 'radio', name: 'target', value, checked: s.target === value }) as HTMLInputElement;
    r.addEventListener('change', () => wizard.setTarget(value));
    return h('label', { class: 'alius-check' }, r, ` ${label}`);
  };
  return h('div', { class: 'alius-target' },
    radio('new_group', 'Create a new group chat'),
    radio('current_group', 'Use this group chat'),
    s.target === 'current_group'
      ? h('p', { class: 'alius-hint' }, 'Members of this group that you did not select will be set inactive. Selected cards that are not in the group are added.')
      : null);
}
