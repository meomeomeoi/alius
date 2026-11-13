import type { Registries } from '../../content/types';
import type { SetupResult } from '../../engine/setup';
import { VALUE_AXES } from '../../engine/state/types';
import type { StAdapter } from '../../st/adapter';
import { difficultyHint, type UnitDraft, type Wizard, type WizardState, type WizardStep } from '../../setup/wizard';
import { h } from '../dom';
import { analyzeNative } from '../analyze/mark';
import { renderKeepingFocus } from '../focus';
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
  ['commander', '02 COMMANDER FILE'],
  ['units', '03 UNIT ASSIGNMENT'],
  ['calibration', '04 PROFILE CALIBRATION'],
  ['review', '05 REVIEW'],
];

/** One re-render subscription per wizard, so re-registering the screen never stacks listeners. */
const subscriptions = new WeakMap<Wizard, () => void>();

const nameOf = (reg: Registries, registry: 'roles' | 'corporations' | 'starts' | 'crimes' | 'defects', id: string | null) => {
  if (!id) return '—';
  const e = reg[registry].get(id);
  return e ? String(e.name) : `UNKNOWN ${id}`;
};

function card(address: string, cls: string, id: string, selected: boolean, onClick: () => void, ...children: Array<HTMLElement | string>): HTMLElement {
  return h('button', { type: 'button', class: `alius-card alius-option ${cls}`, 'data-id': id, 'aria-pressed': String(selected), ...analyzeNative(address), onclick: onClick }, ...children);
}

/** Deployment in flight per wizard. Lives outside the render closure: ST fires chat_changed while the new group opens and the shell re-renders this screen. */
const deploying = new WeakMap<Wizard, boolean>();

export function renderSetupScreen(host: HTMLElement, ctx: SetupScreenCtx): void {
  const { wizard, registries: reg, st } = ctx;
  let search = '';
  let lastStep: WizardStep | null = null;
  let root: HTMLElement | null = null;

  const render = (): void => {
    // The shell may have replaced this screen (PDA after a deployment): never draw over it.
    if (root && !host.contains(root)) return;
    const s = wizard.state;
    let title!: HTMLElement;
    renderKeepingFocus(host, () => {
      host.replaceChildren();
      title = h('h2', { class: 'alius-setup-title', tabindex: '-1' }, 'CCP INTAKE FORM');
      root = h('div', { class: 'alius-setup' },
          title,
          h('ol', { class: 'alius-steps' }, ...STEPS.map(([id, label]) =>
            h('li', { class: 'alius-step', 'aria-current': s.step === id ? 'step' : null }, label))),
          stepBody(s),
          footer(s));
      host.append(root);
    });
    if (lastStep !== null && lastStep !== s.step) title.focus();
    lastStep = s.step;
  };

  function stepBody(s: WizardState): HTMLElement {
    switch (s.step) {
      case 'dossier': return dossier(s);
      case 'commander': return commanderStep();
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
        return card(`starts:${st0.id}`, 'alius-start-card', st0.id, s.startId === st0.id, () => wizard.setStart(st0.id),
          h('strong', {}, `${corp} — ${String(st0.name)}`), h('p', {}, String(st0.summary)));
      })),
      h('h3', {}, 'CRIME'),
      h('div', { class: 'alius-cards' }, ...[...reg.crimes.values()].map((c) => {
        const perk = c.perk as { text: string }; const flaw = c.flaw as { text: string };
        return card(`crimes:${c.id}`, 'alius-crime-card', c.id, s.crimeId === c.id, () => wizard.setCrime(c.id),
          h('strong', {}, String(c.name)), h('p', {}, String(c.summary)),
          h('p', {}, `PERK: ${perk.text}`), h('p', {}, `FLAW: ${flaw.text}`),
          h('p', { class: 'alius-dim' }, 'Plea: GUILTY'));
      })));
  }

  /** The COMMANDER FILE form (replaced by the shared form in the next task). */
  function commanderStep(): HTMLElement {
    return h('div', { class: 'alius-setup-body' }, h('p', { class: 'alius-hint' }, 'COMMANDER FILE'));
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
      body.append(
        h('div', { class: 'alius-target' },
          radio('new_group', 'Create a new group chat'),
          radio('current_group', 'Use this group chat'),
          s.target === 'current_group'
            ? h('p', { class: 'alius-hint' }, 'Members of this group that you did not select will be set inactive. Selected cards that are not in the group are added.')
            : null),
      );
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
      const busy = deploying.get(wizard) === true;
      buttons.push(btn('confirm', busy ? 'DEPLOYING…' : 'Confirm deployment', async () => {
        const result = wizard.result();
        if (!result || deploying.get(wizard)) return;
        deploying.set(wizard, true);
        wizard.refresh();
        try {
          await ctx.onConfirm(result, s.target);
        } finally {
          deploying.set(wizard, false);
          wizard.refresh(); // reaches whichever render of this screen is current, or none if it was left
        }
      }, !adv.ok || busy));
    } else {
      buttons.push(btn('next', 'Next', () => wizard.next(), !adv.ok));
    }
    return h('div', { class: 'alius-setup-footer' },
      !adv.ok && adv.reason ? h('p', { class: 'alius-hint' }, adv.reason) : null,
      s.step === 'review' && deploying.get(wizard) ? h('p', { class: 'alius-hint', role: 'status' }, 'DEPLOYING — please wait.') : null,
      h('div', { class: 'alius-row' }, ...buttons));
  }

  // Desire/Bond only matters for the manual lists; the wizard owns the real rule, so ask it.
  const wizardDesireBond = (): boolean => wizard.desireBondDefects;

  subscriptions.get(wizard)?.();
  subscriptions.set(wizard, wizard.subscribe(render));
  render();
}
