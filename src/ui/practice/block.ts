import type { Knowledge } from '../../analysis/knowledge';
import type { Registries } from '../../content/types';
import type { AcceptForm } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs } from '../analyze/mark';
import { h, type Child } from '../dom';
import { dueWords } from './taskCard';

/** How a task is accepted, as words (the consent ladder). */
const FORM_WORDS: Readonly<Record<AcceptForm, string>> = { button: 'on a button', button_cost: 'on a button, with its cost', words: 'in words', signed: 'in words and a signature', sealed: 'sealed' };

/**
 * The PRACTICES block of her DYNAMIC section (P16, plan R24), read through `Knowledge.practice`: the tasks she has asked (by summary, the way to accept it as words, a day word for the deadline or "until
 * she decides" while it is hidden; a sealed one only as sealed), her protocol and routine, her favour as a word (never a number, with raw values on or off) and the names she gave her postures.
 * `null` when there is nothing to show (no practices, or she is not live now) and in immersive mode (the cards of a scene or a thread are all that is drawn then). No pronoun for the commander.
 */
export function practicesBlock(state: CampaignState, reg: Registries, knowledge: Knowledge, unitId: string, hidden: boolean): HTMLElement | null {
  if (hidden) return null;
  const view = knowledge.practice(unitId, reg);
  const live = { unitId };
  const chip = (text: string, address: string, attrs: Record<string, string>): HTMLElement => h('span', { class: 'alius-chip', ...attrs, ...analyzeAttrs(address, live) }, text);
  const row = (label: string, ...parts: Child[]): HTMLElement => h('p', { class: 'alius-dyn-line' }, `${label} `, ...parts);
  const between = (items: HTMLElement[]): Child[] => items.flatMap((c, i): Child[] => (i === 0 ? [c] : [' ', c]));
  const rows: HTMLElement[] = [];
  if (view.tasks.length > 0) {
    rows.push(row('SHE ASKED', ...between(view.tasks.map((t) => {
      const due = t.sealed && t.summary === null ? null : t.noDuration ? 'until she decides' : dueWords({ deadline: t.due ?? undefined }, state.day);
      const what = t.summary === null ? 'a sealed task' : t.summary;
      return chip(`${what} (${[FORM_WORDS[t.acceptForm], ...(due !== null ? [due] : [])].join('; ')})`, 'glossary:practice_task', { 'data-practice-task': t.id });
    }))));
  }
  if (view.protocol.length > 0) rows.push(row('PROTOCOL', ...between(view.protocol.map((p) => chip(p, 'glossary:protocol', { 'data-practice-protocol': '' })))));
  if (view.routine !== null) rows.push(row('ROUTINE', chip(view.routine, 'glossary:routine', { 'data-practice-routine': '' })));
  if (view.favour !== undefined) rows.push(row('FAVOR', chip(view.favour.toUpperCase(), 'glossary:favour', { 'data-practice-favour': view.favour })));
  if (view.postures.length > 0) rows.push(row('SHE CALLS', ...between(view.postures.map((p) => chip(p.name, 'glossary:named_posture', { 'data-practice-posture': p.postureId })))));
  if (rows.length === 0) return null;
  return h('div', { class: 'alius-practices-block', 'data-practices-block': unitId }, h('h5', {}, 'PRACTICES'), ...rows);
}
