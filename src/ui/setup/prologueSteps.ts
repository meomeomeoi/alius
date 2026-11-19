import type { Registries } from '../../content/types';
import { descriptor } from '../../engine/commander/profile';
import type { AliusSettings } from '../../settings';
import type { Wizard } from '../../setup/wizard';
import { analyzeNative } from '../analyze/mark';
import { renderCommanderFile, type CommanderPatch } from '../commander/commanderFile';
import { h } from '../dom';
import { motionReduced } from '../motion';
import type { Sound } from '../sound/sound';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard } from '../voice/voiceCard';
import { crimeCards, nameOf, reviewLines, targetChooser } from './shared';

/**
 * The four in-world steps of the prologue (P11) that run before deployment: the cold open, the intake interview, the
 * medical exam and the signed dossier. Each is a plain function over the `Wizard`, drawn as a `paper` voice card; every
 * string comes from the prologue entry of the chosen start (`wizard.prologueStep()`), never from this file.
 */
export interface PrologueStepCtx {
  wizard: Wizard;
  registries: Registries;
  settings: AliusSettings;
  sound?: Sound;
}

/** Typing speed of the cold open, characters per second. */
const TYPING_CPS = 60;
/** The pause between two lines of the cold open, in ms. */
const LINE_GAP_MS = 300;

/** Replaces `{KEY}` with `vars[KEY]`; a key with no value stays as written. */
export function fillLine(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (whole, key: string) => (Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : whole));
}

const paper = (title: string | undefined, meta: string, body: Node, stamp?: string): HTMLElement =>
  renderVoiceCard({ voice: VOICE_OF.intake_form, title, meta, body, level: 2, ...(stamp !== undefined ? { stamp } : {}) });

const linesOf = (ctx: PrologueStepCtx): Record<string, string> => ctx.wizard.prologueStep()?.lines ?? {};
const clerk = (text: string | undefined, cls = 'alius-clerk'): HTMLElement | null => (text ? h('p', { class: cls }, text) : null);

/** The transport and the sentence read aloud. The text is complete in the DOM; typing is a CSS reveal that reduced motion leaves out. */
export function renderColdOpen(host: HTMLElement, ctx: PrologueStepCtx): void {
  const step = ctx.wizard.prologueStep();
  const reduced = motionReduced(ctx.settings);
  let delay = 0;
  // P11b: a campaign with a head start opens on a recollection instead of the transport (the squad already knows the commander)
  const recollection = ctx.wizard.state.headStart.days > 0 && (step?.headStartText?.length ?? 0) > 0;
  const lines = (recollection ? step!.headStartText! : step?.authoredText ?? []).map((text) => {
    const p = h('p', { class: reduced ? 'alius-cold-line' : 'alius-cold-line is-typing' }, text);
    if (!reduced) {
      const ms = Math.round((text.length / TYPING_CPS) * 1000);
      p.style.setProperty('--type-ms', String(ms));
      p.style.setProperty('--type-delay', String(delay));
      delay += ms + LINE_GAP_MS;
    }
    return p;
  });
  host.replaceChildren(recollection
    ? paper(step?.headStartTitle ?? step?.title, 'PERSONAL FILE', h('div', { class: 'alius-cold-open' }, ...lines))
    : paper(step?.title, 'TRANSFER FILE', h('div', { class: 'alius-cold-open' }, ...lines)));
}

/** "Article?" and "Name for the record?": the same fields the classic dossier fills, asked by a clerk. */
export function renderIntake(host: HTMLElement, ctx: PrologueStepCtx): void {
  const { wizard, registries: reg } = ctx;
  const step = wizard.prologueStep();
  const lines = linesOf(ctx);
  const s = wizard.state;
  const corporation = nameOf(reg, 'corporations', s.startId ? String(reg.starts.get(s.startId)?.corporationId ?? '') : null);
  const name = h('input', { type: 'text', class: 'alius-input', 'data-key': 'name', maxlength: '60' }) as HTMLInputElement;
  name.value = s.commanderName;
  name.addEventListener('input', () => wizard.setCommanderName(name.value));
  const body = h('div', { class: 'alius-intake' },
    clerk(lines.ask_crime),
    crimeCards(wizard, reg),
    h('label', { class: 'alius-field' }, h('span', { class: 'alius-field-label alius-clerk' }, lines.ask_name ?? 'Name for the record'), name),
    clerk(lines.confirm_owner ? fillLine(lines.confirm_owner, { CORPORATION: corporation }) : undefined));
  host.replaceChildren(paper(step?.title, 'FORM CCP-1', body));
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** The medic dictates what the examination finds, live; the commander file below it is the same form the veteran intake uses. */
export function renderExam(host: HTMLElement, ctx: PrologueStepCtx): void {
  const { wizard, registries: reg } = ctx;
  const step = wizard.prologueStep();
  const lines = linesOf(ctx);
  const c = wizard.state.commander;
  const dictate = (kind: 'strength' | 'endurance' | 'reflexes' | 'expression' | 'seasoning', value: number): HTMLElement =>
    h('p', { class: 'alius-dictate' }, fillLine(lines.dictate ?? '{FIELD}: {VALUE}.', { FIELD: cap(kind), VALUE: descriptor(kind, value) }));
  const dictated = h('div', { class: 'alius-medic' },
    clerk(lines.intro, 'alius-medic-line'),
    dictate('strength', c.body.strength), dictate('endurance', c.body.endurance), dictate('reflexes', c.body.reflexes),
    dictate('expression', c.expression), dictate('seasoning', c.seasoning));

  const file = h('div', { class: 'alius-setup-body alius-cmdr' });
  const apply = (p: CommanderPatch): void => {
    if (p.kind === 'body') wizard.setBody(p.stat, p.value);
    else if (p.kind === 'expression') wizard.setExpression(p.value);
    else if (p.kind === 'seasoning') wizard.setSeasoning(p.value);
    else wizard.toggleTrait(p.id);
  };
  renderCommanderFile(file, {
    value: c, registries: reg, desireBondDefects: wizard.desireBondDefects, corporationId: wizard.corporationId, onChange: apply,
    onPrefill: () => wizard.prefillFromPersona(), onRandom: () => wizard.randomCommander(),
    importStatus: wizard.state.commanderImport,
  });
  host.replaceChildren(paper(step?.title, 'MEDICAL FILE', dictated), clerk(lines.traits_note, 'alius-clerk alius-dim') ?? h('span'), file);
}

export interface FileCtx extends PrologueStepCtx {
  /** The dossier was signed and is being filed (the deployment is running). */
  filed: boolean;
  onSign: () => void;
}

/** The dossier: everything entered, editable until it is signed. SIGN is the old "Confirm deployment". */
export function renderFile(host: HTMLElement, ctx: FileCtx): void {
  const { wizard, registries: reg } = ctx;
  const step = wizard.prologueStep();
  const lines = linesOf(ctx);
  const ok = wizard.canAdvance().ok;
  const edit = (action: string, label: string, address: string, to: 'intake' | 'exam') =>
    h('button', { type: 'button', class: 'alius-btn', 'data-action': action, disabled: ctx.filed, ...analyzeNative(address), onclick: () => wizard.jumpTo(to) }, label);
  const body = h('div', { class: 'alius-dossier' },
    h('pre', { class: 'alius-review' }, reviewLines(wizard, reg).join('\n')),
    clerk(lines.sign_prompt),
    h('div', { class: 'alius-row' },
      edit('edit-intake', '[ EDIT INTAKE ]', 'glossary:intake_interview', 'intake'),
      edit('edit-exam', '[ EDIT EXAM ]', 'glossary:medical_exam', 'exam')),
    targetChooser(wizard),
    h('div', { class: 'alius-row' },
      h('button', {
        type: 'button', class: 'alius-btn alius-sign', 'data-action': 'sign', disabled: !ok || ctx.filed,
        ...analyzeNative('glossary:personnel_dossier'), onclick: ctx.onSign,
      }, ctx.filed ? 'FILING…' : '[ SIGN ]')));
  host.replaceChildren(paper(step?.title, 'PERSONNEL RECORD', body, ctx.filed ? 'FILED' : undefined));
}
