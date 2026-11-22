import type { DilemmaScale } from '../../engine/dilemma/types';
import type { SocialStat } from '../../engine/social';
import type { RouteChoice, RoutePick } from '../../engine/commander/checks';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import type { ScapegoatView } from './scapegoat';
import { h } from '../dom';
import { defiesHint, markPick } from '../personal/obey';
import { renderRoutePicker } from './routePicker';
import type { CampaignState } from '../../engine/state/types';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';
import { drawAskHer, pickIndex, renderPreselected, type AskHerView } from '../practice/askHer';

export interface DilemmaPanelCtx {
  title: string;
  setup: string;
  scale: DilemmaScale;
  /** The model is still writing the options: nothing to choose yet. */
  waiting: boolean;
  /** `check` and `requires` are the option's tags; what it would change is never passed in. */
  options: Array<{ index: number; label: string; disabled: string | null; hasCheck: boolean; check?: { stat: SocialStat; rank: number }; requires?: { stat: SocialStat; rank: number }; routes?: RouteChoice[] }>;
  /** A routed option sends the way through with it (P7). */
  onChoose(index: number, route?: RoutePick): void;
  /** Display name of a unit id for the delegate route. */
  unitName?: (id: string) => string;
  /** P9b: a scapegoat case names who answers for the decision and shows what each answer does (authored effects, shown in words). */
  scapegoat?: ScapegoatView | null;
  /** P9c: a day the commander obeys her: the option she would pick is pre-selected and the others defy her. */
  herPick?: { index: number; name: string } | null;
  /** P16: ASK HER on this decision (the one who holds the commander): the chip, her pick marked, or, when she pre-selects, only her pick with CONFIRM and DEFY. Absent = the card is as it was. */
  askHer?: { view: AskHerView; onAsk: () => void };
  /** P14: the failure chip of the decision's text (the authored block stands meanwhile) and REROLL before an answer. */
  generation?: { ui: GenerationUi; state: CampaignState; id: string };
}

const SCALE_LABEL: Record<DilemmaScale, string> = { minor: 'MINOR', major: 'MAJOR', defining: 'DEFINING' };

/**
 * A decision the engine validated: fixed options only, no free text (the engine must be able to check the choice).
 * Every text comes from a model or from content, so it is set as text and never as markup.
 */
/** The card the commander defied her pick on, per host (a new card starts pre-selected again). */
const defied = new WeakMap<HTMLElement, string>();

export function renderDilemma(host: HTMLElement, ctx: DilemmaPanelCtx): void {
  host.replaceChildren();
  if (ctx.waiting) {
    host.append(h('div', { class: 'alius-dilemma', role: 'status' }, h('p', { class: 'alius-dim' }, 'OVERSIGHT IS DRAFTING YOUR OPTIONS…')));
    return;
  }
  let chosen = false;
  const buttons: HTMLButtonElement[] = [];
  const list = h('div', { class: 'alius-dilemma-options' });
  // P16: her pick, when the commander asked her or she pre-selects: marked like the pick of a day of obedience (that day's own pick wins)
  const asked = ctx.askHer?.view;
  const hers = ctx.herPick ?? (pickIndex(asked) !== null ? { index: pickIndex(asked)!, name: asked!.name } : null);
  const preselected = asked !== undefined && asked.preselected && pickIndex(asked) !== null && defied.get(host) !== asked.ref && ctx.herPick === undefined;
  const askHost = h('div', { class: 'alius-askher' });
  drawAskHer(askHost, ctx.herPick === undefined ? asked : null, ctx.askHer?.onAsk);
  for (const o of ctx.options) {
    if (preselected) continue; // she pre-selects: the card shows only her pick with CONFIRM and DEFY, until the commander defies her
    const picker = o.routes && o.disabled === null
      ? renderRoutePicker({
        routes: o.routes, unitName: ctx.unitName, locked: () => chosen,
        onPick: (pick) => { chosen = true; for (const b of buttons) b.setAttribute('aria-disabled', 'true'); ctx.onChoose(o.index, pick); },
        unlock: () => { chosen = false; buttons.forEach((b, i) => { if (ctx.options[i].disabled === null) b.removeAttribute('aria-disabled'); }); },
      })
      : null;
    if (picker) picker.hidden = true;
    const button = h('button', {
      // soft-disabled (aria-disabled, not `disabled`): a greyed option stays focusable and hoverable, so the analysis panel can
      // explain the requirement that greys it out
      type: 'button', class: 'alius-btn alius-option', 'data-dilemma-option': String(o.index), 'aria-disabled': o.disabled !== null ? 'true' : null,
      ...analyzeNative('glossary:decision_option', { scale: ctx.scale, ...(o.check ? { check: o.check } : {}), ...(o.requires ? { requires: o.requires } : {}) }),
      onclick: () => {
        if (chosen || o.disabled !== null) return;
        if (picker) {
          picker.hidden = !picker.hidden; // a routed option asks how first
          return;
        }
        chosen = true;
        for (const b of buttons) b.setAttribute('aria-disabled', 'true');
        ctx.onChoose(o.index);
      },
    }, `[ ${o.label} ]${o.hasCheck ? ' — CHECK' : ''}${picker ? ' — CHOOSE HOW' : ''}${o.disabled !== null ? ` — ${o.disabled}` : ''}`) as HTMLButtonElement;
    buttons.push(button);
    list.append(button);
    if (hers) {
      if (hers.index === o.index) markPick(button);
      else list.append(defiesHint(hers.name));
    }
    const effects = ctx.scapegoat?.options[o.index];
    if (effects && effects.lines.length > 0) {
      list.append(h('ul', { class: 'alius-scapegoat-effects', 'data-scapegoat-effects': String(o.index) },
        ...effects.lines.map((line) => h('li', {}, h('span', { class: 'alius-stat', 'data-effect-line': '', ...analyzeAttrs('glossary:scapegoat', { answer: effects.answer }) }, line)))));
    }
    if (picker) list.append(picker);
  }
  if (preselected) {
    const mine = ctx.options.find((o) => o.index === pickIndex(asked))!;
    list.append(renderPreselected(asked!, mine.label, {
      onConfirm: () => { if (!chosen && mine.disabled === null) { chosen = true; ctx.onChoose(mine.index); } },
      onDefy: () => { defied.set(host, asked!.ref); renderDilemma(host, ctx); },
    }));
  }
  // P14: a scapegoat case is never worded by the model, so it has nothing to retry or reroll
  const gen = h('div', { class: 'alius-generation-chips' });
  if (ctx.generation && !ctx.scapegoat) {
    const { ui, state, id } = ctx.generation;
    const failed = drawGenerationChips(gen, ui, state, 'dilemma', (r) => r.key === id);
    if (failed === 0) drawSiteReroll(gen, ui, 'dilemma.generate', id);
  }
  host.append(h('div', { class: 'alius-dilemma' },
    h('h3', {}, ctx.title),
    h('p', { class: 'alius-dim' }, `${SCALE_LABEL[ctx.scale]} DECISION`),
    h('p', { class: 'alius-dilemma-setup' }, ctx.setup),
    gen.childElementCount > 0 ? gen : null,
    askHost.childElementCount > 0 ? askHost : null,
    ctx.scapegoat ? h('p', { class: 'alius-scapegoat-who' },
      h('span', { class: 'alius-chip', 'data-scapegoat-subject': '', ...analyzeAttrs('glossary:scapegoat') }, `RESPONSIBLE: ${ctx.scapegoat.subject}`),
      ctx.scapegoat.witnesses.length > 0 ? ' ' : null,
      ctx.scapegoat.witnesses.length > 0 ? h('span', { class: 'alius-chip', 'data-scapegoat-witnesses': '', ...analyzeAttrs('glossary:scapegoat') }, `WITNESSES: ${ctx.scapegoat.witnesses.join(', ')}`) : null) : null,
    list));
}
