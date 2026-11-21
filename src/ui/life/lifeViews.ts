import type { Knowledge } from '../../analysis/knowledge';
import type { Registries } from '../../content/types';
import { availablePastimes } from '../../engine/life/meetings';
import { hubLine } from '../../engine/life/known';
import { plainText } from '../../engine/life/facts';
import type { CampaignState, Slot } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';

/**
 * The player's view of her life (P14c): what she has said she thinks (THOUGHTS), her hobbies as what she has shown, what she has told of her
 * days, the pastime pickers and the line under her name on the hub. The views read only through `Knowledge.life` (told and voiced items):
 * an opinion she has not voiced, an event she keeps or has not told, skill and interest as numbers, the queue and every counter never
 * reach the screen. Every stat, chip and option carries `data-analyze`. No text gives the commander a pronoun (lore §0).
 */

export interface LifeViewCtx {
  state: CampaignState;
  registries: Registries;
  unitId: string;
  knowledge: Knowledge;
}

const title = (s: string): string => `${s.charAt(0).toUpperCase()}${s.slice(1)}`;

/** THOUGHTS: the opinions she has said to the commander, in her words, with what she used to think when a case has changed her mind. */
export function renderThoughts(host: HTMLElement, ctx: LifeViewCtx): void {
  const live = { unitId: ctx.unitId };
  const heard = ctx.knowledge.life(ctx.unitId, ctx.registries).opinions;
  host.replaceChildren(h('p', { class: 'alius-stat', 'data-view': 'thoughts', ...analyzeAttrs('glossary:thoughts', live) }, 'THOUGHTS'));
  if (heard.length === 0) {
    host.append(h('p', { class: 'alius-dim', 'data-empty': 'thoughts' }, 'Nothing she has said yet.'));
    return;
  }
  for (const o of heard) {
    host.append(h('div', { class: 'alius-life-row alius-thought', 'data-thought': o.topicId },
      h('span', { class: 'alius-chip', ...analyzeAttrs(`opinionTopics:${o.topicId}`, live) }, title(o.label)),
      h('span', { class: 'alius-thought-text' }, o.text),
      ...o.history.map((was) => h('span', { class: 'alius-dim alius-thought-was', 'data-was': '' }, `She used to think: ${was}`))));
  }
}

/** HOBBIES: what she has shown of each hobby (the milestones she has told, how keen she is as a word, a trace she left); no number. */
export function renderHobbies(host: HTMLElement, ctx: LifeViewCtx): void {
  const live = { unitId: ctx.unitId };
  const shown = ctx.knowledge.life(ctx.unitId, ctx.registries).hobbies;
  host.replaceChildren(h('p', { class: 'alius-stat', 'data-view': 'hobbies', ...analyzeAttrs('glossary:hobby_cycle', live) }, 'WHAT SHE DOES'));
  if (shown.length === 0) {
    host.append(h('p', { class: 'alius-dim', 'data-empty': 'hobbies-view' }, 'Nothing she has shown yet.'));
    return;
  }
  for (const hb of shown) {
    host.append(h('div', { class: 'alius-life-row alius-hobby-view', 'data-hobby-view': hb.id },
      h('span', { class: 'alius-chip', ...analyzeAttrs(`hobbies:${hb.id}`, live) }, title(hb.label)),
      h('span', { class: 'alius-stat', 'data-word': hb.word, ...analyzeAttrs('glossary:hobby_cycle', live) }, hb.word.toUpperCase()),
      hb.milestones.length > 0 ? h('ul', { class: 'alius-life-lines' }, ...hb.milestones.map((line) => h('li', { 'data-milestone': '' }, line))) : null,
      ...hb.traces.map((t) => h('p', { class: 'alius-dim', 'data-trace': '' }, t))));
  }
}

/** The news she has told: her days as the commander has heard them, newest first. Nothing she has not told. */
export function renderToldNews(host: HTMLElement, ctx: LifeViewCtx): void {
  const told = ctx.knowledge.life(ctx.unitId, ctx.registries).told;
  host.replaceChildren();
  if (told.length === 0) return;
  host.append(
    h('p', { class: 'alius-stat', 'data-view': 'told', ...analyzeAttrs('glossary:life_events', { unitId: ctx.unitId }) }, 'WHAT SHE HAS TOLD'),
    h('ul', { class: 'alius-life-lines' }, ...told.map((t) => h('li', { 'data-told': '' }, t))));
}

export interface PickerCtx {
  state: CampaignState;
  registries: Registries;
  unitId: string;
  onPick: (pastimeId: string) => void;
  /** The place and slot of a scene that is already open (the "let's" of a scene): only pastimes that fit them are listed. */
  at?: { locationId: string; slot: Slot };
}

/** The picker of a quiet hour: one button per pastime she can have now. Picking one calls `onPick`; nothing is spent by listing. */
export function renderPastimePicker(host: HTMLElement, ctx: PickerCtx): void {
  const items = availablePastimes(ctx.state, ctx.registries, ctx.unitId, ctx.at);
  host.replaceChildren();
  if (items.length === 0) {
    host.append(h('p', { class: 'alius-dim', 'data-empty': 'pastimes' }, 'Nothing quiet is open to the two of you right now.'));
    return;
  }
  host.append(h('ul', { class: 'alius-pastimes' }, ...items.map((p) => h('li', {},
    h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-pastime': String(p.id), 'data-talk': p.talk, title: plainText(String(p.description)),
      ...analyzeNative(`pastimes:${p.id}`), onclick: () => ctx.onPick(String(p.id)),
    }, String(p.label)),
    h('span', { class: 'alius-dim' }, p.talk === 'quiet' ? ' quiet' : ' some talk')))));
}

/** The `[ LET'S … ]` menu of a private scene with one named woman: the pastimes that fit the scene's place and slot (a menu that stays open across a redraw is the caller's). */
export function renderLetsMenu(host: HTMLElement, ctx: PickerCtx & { open?: boolean }): void {
  const body = h('div', { class: 'alius-lets-body' });
  renderPastimePicker(body, ctx);
  const menu = h('details', { class: 'alius-lets', 'data-lets': ctx.unitId },
    h('summary', { class: 'alius-btn alius-option', ...analyzeAttrs('glossary:quiet_meeting') }, "[ LET'S … ]"), body) as HTMLDetailsElement;
  if (ctx.open === true) menu.open = true;
  host.replaceChildren(menu);
}

/** The line under her name on the hub: what she is doing today, from her newest event of the last two days (nothing for what she keeps to herself, or with life off). */
export function renderHubDayLine(host: HTMLElement, state: CampaignState, reg: Registries, unitId: string): void {
  const line = hubLine(state, reg, unitId);
  if (!line) return;
  host.append(h('span', { class: 'alius-dim alius-hub-line alius-stat', 'data-hub-line': unitId, ...analyzeAttrs(`lifeEvents:${line.eventId}`, { unitId }) }, line.text));
}
