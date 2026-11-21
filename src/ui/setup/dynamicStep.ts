import type { Registries } from '../../content/types';
import { seedProblem } from '../../engine/dynamic/seeds';
import { FREQUENCIES, HOLDER_CAPS, MAY_HOLD, PACES, SENSITIVITIES, START_FRAMES } from '../../engine/dynamic/types';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';

export interface DynamicStepCtx {
  wizard: Wizard;
  registries: Registries;
}

/** Plain meta labels (AUTHOR TO WRITE; no pronoun for the commander). */
const HOLDER_LABEL: Record<string, string> = { 0: 'NONE (the dynamic is off)', 1: 'ONE', 2: 'TWO', 3: 'THREE', any: 'ANY NUMBER' };
const MAY_HOLD_LABEL: Record<string, string> = { yes: 'yes', no: 'no', auto: 'auto (her profile decides)' };

/** A labelled select that commits on change; the label is the analyzable element (`address` explains the setting). */
function selectField(label: string, address: string, name: string, options: Array<[string, string]>, value: string, commit: (v: string) => void): HTMLElement {
  const select = h('select', { name, class: 'alius-input' }, ...options.map(([v, text]) => h('option', { value: v, selected: v === value }, text))) as HTMLSelectElement;
  select.value = value;
  select.addEventListener('change', () => commit(select.value));
  return h('label', { class: 'alius-field alius-option', ...analyzeNative(address) }, h('span', { class: 'alius-field-label' }, label), select);
}

/**
 * The DYNAMIC section of WORLD PARAMETERS (P15 R3): how many soldiers may hold authority over the commander, the pace and the frequency, and
 * per chosen unit whether she may hold, how sensitive she is, whether she is seeded (and from which frame) and, with a head start, whether
 * the dynamic is already underway. Drawn only while a practice category is switched on in CONTENT; otherwise it adds nothing. A meta screen:
 * plain labels, no fiction voice. Redrawn with the screen.
 */
export function renderDynamicStep(host: HTMLElement, ctx: DynamicStepCtx): void {
  const { wizard, registries: reg } = ctx;
  if (!wizard.dynamicAvailable) return;
  const s = wizard.state;
  const d = s.dynamic;
  const headStart = s.headStart.days > 0;
  const seeds = Object.values(d.units).filter((u) => u.seeded === true).length;
  const full = d.holders !== 'any' && seeds >= d.holders;

  const unitRow = (u: (typeof s.units)[number]): HTMLElement => {
    const pick = d.units[u.avatar] ?? {};
    const seeded = pick.seeded === true;
    const problem = seeded && u.choice.bond !== undefined
      ? seedProblem(reg, { bond: u.choice.bond }, { enabled: s.content.enabled, mayHold: pick.mayHold })
      : null;
    return h('div', { class: 'alius-dynamic-unit', 'data-avatar': u.avatar },
      h('h4', {}, u.displayName),
      selectField('May hold', 'glossary:dynamic_may_hold', 'mayHold', MAY_HOLD.map((v) => [v, MAY_HOLD_LABEL[v]]), pick.mayHold ?? 'auto', (v) => wizard.setDynamicUnit(u.avatar, { mayHold: v as never })),
      selectField('Sensitivity', 'glossary:dynamic_sensitivity', 'sensitivity', SENSITIVITIES.map((v) => [v, v]), pick.sensitivity ?? 'normal', (v) => wizard.setDynamicUnit(u.avatar, { sensitivity: v as never })),
      h('button', {
        type: 'button', class: 'alius-btn alius-option alius-dynamic-seed', 'aria-pressed': String(seeded), 'aria-disabled': String(!seeded && full),
        ...analyzeNative('glossary:dynamic_seeded'), onclick: () => wizard.setDynamicUnit(u.avatar, { seeded: !seeded }),
      }, seeded ? 'SEEDED' : 'SEED'),
      seeded ? selectField('Starting frame', 'glossary:dynamic_start_frame', 'startFrame', [['', 'none (equal)'], ...START_FRAMES.map((v): [string, string] => [v, v])], pick.startFrame ?? '', (v) => wizard.setDynamicUnit(u.avatar, { startFrame: v === '' ? null : (v as never) })) : null,
      headStart
        ? h('button', {
          type: 'button', class: 'alius-btn alius-option alius-dynamic-underway', 'data-scope': 'unit', 'aria-pressed': String(pick.underway === true),
          ...analyzeNative('glossary:dynamic_underway'), onclick: () => wizard.setDynamicUnit(u.avatar, { underway: pick.underway !== true }),
        }, 'ALREADY UNDERWAY')
        : null,
      problem !== null ? h('p', { class: 'alius-dim alius-dynamic-problem' }, `Cannot hold yet: ${problem}.`) : null);
  };

  host.append(h('section', { class: 'alius-section alius-dynamic' },
    h('h3', {}, 'DYNAMIC'),
    h('p', { class: 'alius-hint' }, 'Some soldiers may come to hold authority over the commander, slowly and by their own profile. Set how many may at once, how fast it goes and how often something comes of it. Nothing is announced.'),
    selectField('Holders', 'glossary:setting_dynamic_holders', 'dynamicHolders', HOLDER_CAPS.map((v) => [String(v), HOLDER_LABEL[String(v)]]), String(d.holders), (v) => wizard.setDynamic({ holders: v === 'any' ? 'any' : (Number(v) as never) })),
    selectField('Pace', 'glossary:setting_dynamic_pace', 'dynamicPace', PACES.map((v) => [v, v]), d.pace, (v) => wizard.setDynamic({ pace: v as never })),
    selectField('Frequency', 'glossary:setting_dynamic_frequency', 'dynamicFrequency', FREQUENCIES.map((v) => [v, v]), d.frequency, (v) => wizard.setDynamic({ frequency: v as never })),
    headStart
      ? h('button', {
        type: 'button', class: 'alius-btn alius-option alius-dynamic-underway', 'data-scope': 'all', 'aria-pressed': String(d.underway),
        ...analyzeNative('glossary:dynamic_underway'), onclick: () => wizard.setDynamic({ underway: !d.underway }),
      }, 'THE DYNAMIC IS ALREADY UNDERWAY')
      : null,
    s.units.length === 0
      ? h('p', { class: 'alius-dim' }, 'Choose the squad first: each chosen soldier gets a row here (may hold, sensitivity, a seed).')
      : h('div', { class: 'alius-dynamic-units' }, ...s.units.map(unitRow))));
}
