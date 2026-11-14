import type { Registries } from '../../content/types';
import type { SetupResult } from '../../engine/setup';
import type { StAdapter } from '../../st/adapter';
import { difficultyHint, type Wizard, type WizardState, type WizardStep } from '../../setup/wizard';
import type { AliusSettings } from '../../settings';
import { h } from '../dom';
import { analyzeNative } from '../analyze/mark';
import { renderKeepingFocus } from '../focus';
import type { ModalOpts } from '../shell/modal';
import type { Sound } from '../sound/sound';
import { renderCommanderFile, type CommanderPatch } from '../commander/commanderFile';
import { renderCalibration } from './calibration';
import { renderColdOpen, renderExam, renderFile, renderIntake, type PrologueStepCtx } from './prologueSteps';
import { card, crimeCards, nameOf, reviewLines, targetChooser } from './shared';
import { renderWorldParams } from './worldParams';

export interface SetupScreenCtx {
  wizard: Wizard;
  registries: Registries;
  st: StAdapter;
  onCancel: () => void;
  onConfirm: (r: SetupResult, target: 'new_group' | 'current_group') => Promise<void>;
  /** Used for the "Discard intake form?" confirmation. */
  modal: (opts: ModalOpts) => Promise<string | null>;
  /** P11: read on every draw (the cold open types out unless motion is reduced). */
  settings: () => AliusSettings;
  /** P11: the stamp when the dossier is signed. */
  sound?: Sound;
}

/** Step labels; the list shows the steps of the wizard's mode, numbered in order. */
const STEP_LABELS: Record<WizardStep, string> = {
  dossier: 'DOSSIER', world: 'WORLD PARAMETERS', commander: 'COMMANDER FILE', units: 'UNIT ASSIGNMENT', calibration: 'PROFILE CALIBRATION', review: 'REVIEW',
  cold_open: 'TRANSPORT', intake: 'INTAKE INTERVIEW', exam: 'MEDICAL EXAM', file: 'PERSONNEL DOSSIER',
};

/** One re-render subscription per wizard, so re-registering the screen never stacks listeners. */
const subscriptions = new WeakMap<Wizard, () => void>();

/** The signed dossier is being filed (P11): the stamp shows while this is set. */
const filing = new WeakMap<Wizard, boolean>();

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
          h('ol', { class: 'alius-steps' }, ...wizard.stepsFor().map((id, i) =>
            h('li', { class: 'alius-step', 'aria-current': s.step === id ? 'step' : null }, `${String(i + 1).padStart(2, '0')} ${STEP_LABELS[id]}`))),
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
      case 'world': return worldStep();
      case 'commander': return commanderStep();
      case 'units': return units(s);
      case 'calibration': return calibration(s);
      case 'review': return review(s);
      case 'cold_open': return inWorld(renderColdOpen);
      case 'intake': return inWorld(renderIntake);
      case 'exam': return inWorld(renderExam);
      case 'file': return inWorld((body, c) => renderFile(body, { ...c, filed: filing.get(wizard) === true, onSign: () => void sign() }));
    }
  }

  /** One of the paper steps of the prologue, drawn into its own body. */
  function inWorld(draw: (host: HTMLElement, ctx: PrologueStepCtx) => void): HTMLElement {
    const body = h('div', { class: 'alius-setup-body alius-inworld' });
    draw(body, { wizard, registries: reg, settings: ctx.settings(), ...(ctx.sound ? { sound: ctx.sound } : {}) });
    return body;
  }

  /** The WORLD PARAMETERS step: drawn by its own renderer, redrawn with the screen. */
  function worldStep(): HTMLElement {
    const body = h('div', { class: 'alius-world-host' });
    renderWorldParams(body, { wizard, registries: reg });
    return body;
  }

  function dossier(s: WizardState): HTMLElement {
    const classic = s.mode === 'veteran';
    const name = h('input', { type: 'text', class: 'alius-input', 'data-key': 'name', maxlength: '60' }) as HTMLInputElement;
    name.value = s.commanderName;
    name.addEventListener('input', () => wizard.setCommanderName(name.value));
    // P11: a start with a prologue offers the veteran intake; the prologue asks for the name and the crime in fiction
    const hasPrologue = s.startId !== null ? [...reg.prologues.values()].some((p) => p.startId === s.startId) : reg.prologues.size > 0;
    const veteran = hasPrologue
      ? h('button', {
        type: 'button', class: 'alius-btn alius-option alius-veteran', 'data-action': 'veteran', 'aria-pressed': String(classic),
        ...analyzeNative('glossary:veteran_intake'), onclick: () => wizard.setMode(classic ? 'prologue' : 'veteran'),
      }, classic ? '[X] VETERAN INTAKE: plain forms, no patrol' : '[ ] VETERAN INTAKE: plain forms, no patrol')
      : null;
    return h('div', { class: 'alius-setup-body' },
      classic ? h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label' }, 'Commander name'), name) : null,
      h('h3', {}, 'STARTING POINT'),
      h('div', { class: 'alius-cards' }, ...[...reg.starts.values()].map((st0) => {
        const corp = nameOf(reg, 'corporations', String(st0.corporationId));
        return card(`starts:${st0.id}`, 'alius-start-card', st0.id, s.startId === st0.id, () => wizard.setStart(st0.id),
          h('strong', {}, `${corp} — ${String(st0.name)}`), h('p', {}, String(st0.summary)));
      })),
      veteran,
      classic ? h('h3', {}, 'CRIME') : null,
      classic ? crimeCards(wizard, reg) : null);
  }

  /** The COMMANDER FILE step: the shared form, wired to the wizard. */
  function commanderStep(): HTMLElement {
    const body = h('div', { class: 'alius-setup-body alius-cmdr' });
    const apply = (p: CommanderPatch): void => {
      if (p.kind === 'body') wizard.setBody(p.stat, p.value);
      else if (p.kind === 'expression') wizard.setExpression(p.value);
      else if (p.kind === 'seasoning') wizard.setSeasoning(p.value);
      else wizard.toggleTrait(p.id);
    };
    renderCommanderFile(body, {
      value: wizard.state.commander, registries: reg, desireBondDefects: wizardDesireBond(), onChange: apply,
      onPrefill: () => wizard.prefillFromPersona(), onRandom: () => wizard.randomCommander(),
      importStatus: wizard.state.commanderImport,
    });
    return body;
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
      draft, registries: reg, desireBondDefects: wizardDesireBond(), world: s.world.options,
      onRefreshWorld: () => wizard.refreshWorldSections(i),
      onUpdate: (patch) => wizard.update(i, patch),
      onRegenerate: (section) => wizard.regenerate(i, section),
      onManual: () => wizard.setManual(i),
      startPreview: wizard.previewStart(i),
    });
    return h('div', { class: 'alius-setup-body' },
      h('div', { class: 'alius-pager' },
        h('button', { type: 'button', class: 'alius-btn', 'data-action': 'pager-prev', 'aria-label': 'Previous unit', disabled: i === 0, onclick: () => wizard.setCalibrationIndex(i - 1) }, '<'),
        h('span', { class: 'alius-pager-label' }, `${i + 1}/${s.units.length} — ${draft.displayName}`),
        h('button', { type: 'button', class: 'alius-btn', 'data-action': 'pager-next', 'aria-label': 'Next unit', disabled: i >= s.units.length - 1, onclick: () => wizard.setCalibrationIndex(i + 1) }, '>')),
      body);
  }

  function review(s: WizardState): HTMLElement {
    const body = h('div', { class: 'alius-setup-body' }, h('pre', { class: 'alius-review' }, reviewLines(wizard, reg).join('\n')));
    const target = targetChooser(wizard);
    if (target) body.append(target);
    return body;
  }

  /** Builds and deploys the campaign (the veteran CONFIRM and the dossier's SIGN). The stamp shows while it runs. */
  async function deploy(stamped: boolean): Promise<void> {
    const result = wizard.result();
    if (!result || deploying.get(wizard)) return;
    deploying.set(wizard, true);
    if (stamped) {
      filing.set(wizard, true);
      ctx.sound?.play('stamp');
    }
    wizard.refresh();
    try {
      await ctx.onConfirm(result, wizard.state.target);
    } finally {
      deploying.set(wizard, false);
      filing.set(wizard, false);
      wizard.refresh(); // reaches whichever render of this screen is current, or none if it was left
    }
  }
  const sign = (): Promise<void> => deploy(true);

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
      buttons.push(btn('confirm', busy ? 'DEPLOYING…' : 'Confirm deployment', () => void deploy(false), !adv.ok || busy));
    } else if (s.step !== 'file') {
      // the signed dossier ends the prologue's steps: SIGN, inside the form, is its only way on
      buttons.push(btn('next', 'Next', () => wizard.next(), !adv.ok));
    }
    return h('div', { class: 'alius-setup-footer' },
      !adv.ok && adv.reason ? h('p', { class: 'alius-hint' }, adv.reason) : null,
      (s.step === 'review' || s.step === 'file') && deploying.get(wizard) ? h('p', { class: 'alius-hint', role: 'status' }, 'DEPLOYING — please wait.') : null,
      h('div', { class: 'alius-row' }, ...buttons));
  }

  // Desire/Bond only matters for the manual lists; the wizard owns the real rule, so ask it.
  const wizardDesireBond = (): boolean => wizard.desireBondDefects;

  subscriptions.get(wizard)?.();
  subscriptions.set(wizard, wizard.subscribe(render));
  render();
}
