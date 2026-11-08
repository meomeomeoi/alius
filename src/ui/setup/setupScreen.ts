import type { Registries } from '../../content/types';
import type { SetupResult } from '../../engine/setup';
import { VALUE_AXES } from '../../engine/state/types';
import type { StAdapter } from '../../st/adapter';
import { difficultyHint, type UnitDraft, type Wizard, type WizardState, type WizardStep } from '../../setup/wizard';
import { h } from '../dom';
import type { ModalOpts } from '../shell/modal';
import { renderCalibration } from './calibration';

export interface SetupScreenCtx {
  wizard: Wizard;
  registries: Registries;
  st: StAdapter;
  onCancel: () => void;
  onConfirm: (r: SetupResult, target: 'new_group' | 'current_group') => Promise<void>;
  /** Used for the "Discard intake form?" confirmation. */
  modal: (opts: ModalOpts) => Promise<string | null>;
}

const STEPS: Array<[WizardStep, string]> = [
  ['dossier', '01 DOSSIER'],
  ['units', '02 UNIT ASSIGNMENT'],
  ['calibration', '03 PROFILE CALIBRATION'],
  ['review', '04 REVIEW'],
];

/** One re-render subscription per wizard, so re-registering the screen never stacks listeners. */
const subscriptions = new WeakMap<Wizard, () => void>();

const nameOf = (reg: Registries, registry: 'roles' | 'corporations' | 'starts' | 'crimes' | 'defects', id: string | null) => {
  if (!id) return '—';
  const e = reg[registry].get(id);
  return e ? String(e.name) : `UNKNOWN ${id}`;
};

function card(cls: string, id: string, selected: boolean, onClick: () => void, ...children: Array<HTMLElement | string>): HTMLElement {
  return h('button', { type: 'button', class: `alius-card ${cls}`, 'data-id': id, 'aria-pressed': String(selected), onclick: onClick }, ...children);
}

/** A selector that finds the same control again after a re-render. */
function focusSelector(el: HTMLElement): string | null {
  const d = el.dataset;
  if (d.key) return `[data-key="${d.key}"]`;
  if (d.action) return `[data-action="${d.action}"]`;
  if (d.regenerate) return `[data-regenerate="${d.regenerate}"]`;
  if (d.addTag) return `[data-add-tag="${d.addTag}"]`;
  if (d.avatar) return `[data-avatar="${d.avatar}"]`;
  if (d.id && el.className) return `.${el.className.split(' ').join('.')}[data-id="${d.id}"]`;
  return null;
}

export function renderSetupScreen(host: HTMLElement, ctx: SetupScreenCtx): void {
  const { wizard, registries: reg, st } = ctx;
  let search = '';
  let lastStep: WizardStep | null = null;
  let confirming = false;

  const render = (): void => {
    const s = wizard.state;
    const active = document.activeElement as (HTMLInputElement | null);
    const sel = active && host.contains(active) ? focusSelector(active) : null;
    const caret = sel && typeof active?.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;

    host.replaceChildren();
    const title = h('h2', { class: 'alius-setup-title', tabindex: '-1' }, 'CCP INTAKE FORM');
    host.append(
      h('div', { class: 'alius-setup' },
        title,
        h('ol', { class: 'alius-steps' }, ...STEPS.map(([id, label]) =>
          h('li', { class: 'alius-step', 'aria-current': s.step === id ? 'step' : null }, label))),
        stepBody(s),
        footer(s)),
    );

    if (lastStep !== null && lastStep !== s.step) title.focus();
    else if (sel) {
      const el = host.querySelector<HTMLInputElement>(sel);
      el?.focus();
      if (el && caret && typeof el.setSelectionRange === 'function') {
        try { el.setSelectionRange(caret[0], caret[1]); } catch { /* not a text control */ }
      }
    }
    lastStep = s.step;
  };

  function stepBody(s: WizardState): HTMLElement {
    switch (s.step) {
      case 'dossier': return dossier(s);
      case 'units': return units(s);
      case 'calibration': return calibration(s);
      case 'review': return review(s);
    }
  }

  function dossier(s: WizardState): HTMLElement {
    const name = h('input', { type: 'text', class: 'alius-input', 'data-key': 'name', maxlength: '60' }) as HTMLInputElement;
    name.value = s.commanderName;
    name.addEventListener('input', () => wizard.setCommanderName(name.value));
    return h('div', { class: 'alius-setup-body' },
      h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label' }, 'Commander name'), name),
      h('h3', {}, 'STARTING POINT'),
      h('div', { class: 'alius-cards' }, ...[...reg.starts.values()].map((st0) => {
        const corp = nameOf(reg, 'corporations', String(st0.corporationId));
        return card('alius-start-card', st0.id, s.startId === st0.id, () => wizard.setStart(st0.id),
          h('strong', {}, `${corp} — ${String(st0.name)}`), h('p', {}, String(st0.summary)));
      })),
      h('h3', {}, 'CRIME'),
      h('div', { class: 'alius-cards' }, ...[...reg.crimes.values()].map((c) => {
        const perk = c.perk as { text: string }; const flaw = c.flaw as { text: string };
        return card('alius-crime-card', c.id, s.crimeId === c.id, () => wizard.setCrime(c.id),
          h('strong', {}, String(c.name)), h('p', {}, String(c.summary)),
          h('p', {}, `PERK: ${perk.text}`), h('p', {}, `FLAW: ${flaw.text}`),
          h('p', { class: 'alius-dim' }, 'Plea: GUILTY'));
      })));
  }

  function units(s: WizardState): HTMLElement {
    const q = search.trim().toLowerCase();
    const chars = st.listCharacters().filter((c) => q === '' || c.name.toLowerCase().includes(q));
    const full = s.units.length >= 4;
    const input = h('input', { type: 'search', class: 'alius-input', 'data-key': 'search', 'aria-label': 'Search characters' }) as HTMLInputElement;
    input.value = search;
    input.addEventListener('input', () => { search = input.value; render(); });
    return h('div', { class: 'alius-setup-body' },
      h('p', { class: 'alius-hint' }, `Squad size ${s.units.length}/4 — ${difficultyHint(s.units.length)}. No automatic compensation.`),
      h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label' }, 'Search'), input),
      h('div', { class: 'alius-tiles' }, ...chars.map((c) => {
        const checked = s.units.some((u) => u.avatar === c.avatar);
        const box = h('input', { type: 'checkbox', 'data-avatar': c.avatar, checked, disabled: full && !checked }) as HTMLInputElement;
        box.addEventListener('change', () => wizard.toggleUnit(c));
        return h('label', { class: 'alius-tile' }, box, h('img', { src: st.getAvatarUrl(c.avatar), alt: '', width: '48', height: '48' }), h('span', {}, c.name));
      })),
      chars.length === 0 ? h('p', { class: 'alius-dim' }, 'No characters found.') : null);
  }

  function calibration(s: WizardState): HTMLElement {
    const i = s.calibrationIndex;
    const draft = s.units[i];
    const body = h('div', { class: 'alius-calibration' });
    renderCalibration(body, {
      draft, registries: reg, desireBondDefects: wizardDesireBond(),
      onUpdate: (patch) => wizard.update(i, patch),
      onRegenerate: (section) => wizard.regenerate(i, section),
      onManual: () => wizard.setManual(i),
    });
    return h('div', { class: 'alius-setup-body' },
      h('div', { class: 'alius-pager' },
        h('button', { type: 'button', class: 'alius-btn', 'data-action': 'pager-prev', 'aria-label': 'Previous unit', disabled: i === 0, onclick: () => wizard.setCalibrationIndex(i - 1) }, '<'),
        h('span', { class: 'alius-pager-label' }, `${i + 1}/${s.units.length} — ${draft.displayName}`),
        h('button', { type: 'button', class: 'alius-btn', 'data-action': 'pager-next', 'aria-label': 'Next unit', disabled: i >= s.units.length - 1, onclick: () => wizard.setCalibrationIndex(i + 1) }, '>')),
      body);
  }

  function review(s: WizardState): HTMLElement {
    const corpId = s.startId ? String(reg.starts.get(s.startId)?.corporationId ?? '') : null;
    const lines = [
      `COMMANDER   : ${s.commanderName.trim()}`,
      `CORPORATION : ${nameOf(reg, 'corporations', corpId)} — ${nameOf(reg, 'starts', s.startId)}`,
      `CRIME       : ${nameOf(reg, 'crimes', s.crimeId)} (Plea: GUILTY)`,
      `SQUAD       : ${s.units.length}/4 — ${difficultyHint(s.units.length)}`,
      ...s.units.flatMap((u, n) => unitLines(u, n)),
    ];
    const body = h('div', { class: 'alius-setup-body' }, h('pre', { class: 'alius-review' }, lines.join('\n')));
    if (s.canBindCurrent) {
      const radio = (value: 'new_group' | 'current_group', label: string) => {
        const r = h('input', { type: 'radio', name: 'target', value, checked: s.target === value }) as HTMLInputElement;
        r.addEventListener('change', () => wizard.setTarget(value));
        return h('label', { class: 'alius-check' }, r, ` ${label}`);
      };
      body.append(h('div', { class: 'alius-target' }, radio('new_group', 'Create a new group chat'), radio('current_group', 'Use this group chat')));
    }
    return body;
  }

  function unitLines(u: UnitDraft, n: number): string[] {
    const c = u.choice;
    const values = VALUE_AXES.map((a) => `${a.slice(0, 4).toUpperCase()} ${c.values[a] > 0 ? '+' : ''}${c.values[a]}`).join('  ');
    return [
      '',
      `[${n + 1}] ${u.displayName} — ${nameOf(reg, 'roles', c.roleId)}`,
      `    SIGNATURE : ${c.signature ? c.signature.name : '—'}`,
      `    DEFECTS   : ${c.defects.map((d) => nameOf(reg, 'defects', d.id)).join(', ') || '—'}`,
      `    VALUES    : ${values}`,
      `    START     : TRUST ${c.baseline.trust}  AFFINITY ${c.baseline.affinity}  ATTRACTION ${c.baseline.attraction}`,
    ];
  }

  function footer(s: WizardState): HTMLElement {
    const adv = wizard.canAdvance();
    const btn = (action: string, label: string, onclick: () => void, disabled = false) =>
      h('button', { type: 'button', class: 'alius-btn', 'data-action': action, disabled, onclick }, label);
    const buttons = [
      btn('cancel', 'Cancel', async () => {
        const answer = await ctx.modal({
          title: 'Discard intake form?',
          body: 'Everything entered so far will be lost.',
          actions: [{ label: 'Discard', value: 'discard' }, { label: 'Keep editing', value: 'keep' }],
        });
        if (answer === 'discard') ctx.onCancel();
      }),
      btn('back', 'Back', () => wizard.back(), s.step === 'dossier'),
    ];
    if (s.step === 'review') {
      buttons.push(btn('confirm', 'Confirm deployment', async () => {
        const result = wizard.result();
        if (!result || confirming) return;
        confirming = true;
        try { await ctx.onConfirm(result, s.target); } finally { confirming = false; }
      }, !adv.ok));
    } else {
      buttons.push(btn('next', 'Next', () => wizard.next(), !adv.ok));
    }
    return h('div', { class: 'alius-setup-footer' },
      !adv.ok && adv.reason ? h('p', { class: 'alius-hint' }, adv.reason) : null,
      h('div', { class: 'alius-row' }, ...buttons));
  }

  // Desire/Bond only matters for the manual lists; the wizard owns the real rule, so ask it.
  const wizardDesireBond = (): boolean => wizard.desireBondDefects;

  subscriptions.get(wizard)?.();
  subscriptions.set(wizard, wizard.subscribe(render));
  render();
}
