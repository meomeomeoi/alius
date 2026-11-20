import { drawCountermandChips } from '../power/chips';
import { hasTraitEffect } from '../../engine/commander/traits';
import type { Entry, Registries } from '../../content/types';
import { activityCost, checkActivity, type ActivityRequest } from '../../engine/activities';
import { clockText, isQuietNight } from '../../engine/calendar';
import { isLiving, requisitionCost } from '../../engine/economy';
import { objectiveList, type ObjectiveSource } from '../../engine/onboarding';
import type { CampaignState, Slot, Unit } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { LoadResult } from '../../st/persistence';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { renderSchedule } from '../personal/schedule';
import { renderMissionBoard } from './missionBoard';

export interface OpsTabCtx {
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  onDo: (req: ActivityRequest) => void;
  onRequisition: (supplies: number) => void;
  /** P5: mission board and rumor mill callbacks; a missing one hides its button. */
  onPlan?: (missionId: string) => void;
  onDismiss?: (missionId: string) => void;
  onFollowRumor?: (rumorId: string) => void;
  onIntake?: () => void;
  onOpenReport?: () => void;
  /** P7: ends a quiet night without doing anything. */
  onSleep?: () => void;
  /** P9b: the squad leader's countermand waits for ACCEPT or OVERRULE (the chips show only while one is open). */
  onCountermand?: (answer: 'accept' | 'overrule') => void;
  /** P9c: the SCHEDULE of bookings: CANCEL one, KEEP HERS in a clash, LET THEM SETTLE IT. */
  onCancelBooking?: (bookingId: string) => void;
  onKeepBooking?: (bookingId: string) => void;
  onSettleBooking?: (day: number, slot: Slot) => void;
}

type Focus = { id: string; label: string; units?: { min: number; max: number } };
const COST_LABEL: Record<string, string> = { credits: 'CR', supplies: 'SUPPLIES', plyx: 'PLYX' };

const costText = (cost: Record<string, number | undefined>): string => {
  const parts = Object.entries(cost).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${n} ${COST_LABEL[k] ?? k.toUpperCase()}`);
  return parts.length === 0 ? 'FREE' : parts.join(' · ');
};
const unitLabel = (u: Unit) => (u.kind === 'grunt' ? `${u.displayName} (grunt)` : u.displayName);

/** One activity as the OPS tab shows it; the hub's room panel reuses it for the activities of a room. */
export function activityCard(a: Entry, state: CampaignState, ctx: OpsTabCtx): HTMLElement {
  const mode = a.companion as 'none' | 'optional' | 'required';
  // P12: a focus that asks for a trait effect (burning the frequency implant) is only listed to a commander who has it
  const focusList = ((a.focus as Array<Focus & { requires?: { traitEffect: string } }> | undefined) ?? []).filter((f) => !f.requires || hasTraitEffect(state, ctx.registries, f.requires.traitEffect as never));
  const living = state.squad.filter(isLiving);
  // a conversation needs a character card: grunts cannot be talked to
  const companions = a.startsScene === true ? living.filter((u) => u.kind === 'named') : living;

  const companionSel = mode === 'none'
    ? null
    : (h('select', { name: 'companion', 'aria-label': `Companion for ${String(a.name)}` },
      h('option', { value: '' }, mode === 'required' ? '— choose —' : '— alone —'),
      ...companions.map((u) => h('option', { value: u.id }, unitLabel(u))),
    ) as HTMLSelectElement);
  const focusSel = focusList.length === 0
    ? null
    : (h('select', { name: 'focus', 'aria-label': `Focus for ${String(a.name)}` },
      ...focusList.map((f) => h('option', { value: f.id }, f.label)),
    ) as HTMLSelectElement);

  const picked = new Set<string>();
  const boxes = living.map((u) => {
    const box = h('input', { type: 'checkbox', 'data-unit': u.id }) as HTMLInputElement;
    box.addEventListener('change', () => {
      if (box.checked) picked.add(u.id);
      else picked.delete(u.id);
      refresh();
    });
    return h('label', { class: 'alius-check' }, box, ` ${unitLabel(u)}`);
  });

  const controls = h('div', { class: 'alius-activity-controls' });
  const reasonEl = h('p', { class: 'alius-dim alius-reason' });
  const btn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-do': String(a.id), ...analyzeNative(`activities:${String(a.id)}`) }, '[ DO ]') as HTMLButtonElement;

  const currentFocus = (): Focus | undefined => focusList.find((f) => f.id === focusSel?.value);
  const request = (): ActivityRequest => {
    const req: ActivityRequest = { activityId: String(a.id) };
    const companion = companionSel?.value;
    if (companion) return { ...req, companionId: companion };
    if (focusSel) req.focus = focusSel.value;
    if (currentFocus()?.units) req.unitIds = living.filter((u) => picked.has(u.id)).map((u) => u.id);
    return req;
  };

  let shape = '';
  function refresh(): void {
    const companion = companionSel?.value ?? '';
    const next = companion ? 'companion' : `focus:${focusSel?.value ?? ''}`;
    if (next !== shape) {
      shape = next;
      controls.replaceChildren();
      if (companionSel) controls.append(companionSel);
      if (!companion) {
        if (focusSel) controls.append(focusSel);
        if (currentFocus()?.units) controls.append(h('div', { class: 'alius-unitpick' }, ...boxes));
      }
    }
    const reason = checkActivity(state, ctx.registries, request());
    btn.disabled = reason !== null;
    reasonEl.textContent = reason ?? '';
  }
  companionSel?.addEventListener('change', refresh);
  focusSel?.addEventListener('change', refresh);
  btn.addEventListener('click', () => ctx.onDo(request()));
  refresh();

  return h(
    'article',
    { class: 'alius-activity', 'data-activity': String(a.id) },
    h('h3', {}, h('span', { class: 'alius-chip', ...analyzeAttrs(`activities:${String(a.id)}`) }, String(a.name))),
    h('p', { class: 'alius-dim' }, `${String(a.summary)} — ${costText(activityCost(state, ctx.registries, a))}`),
    controls,
    reasonEl,
    btn,
  );
}

/** The typed amount survives a re-render (the tab redraws after every action). */
const remembered = new WeakMap<HTMLElement, string>();

function requisition(state: CampaignState, ctx: OpsTabCtx, host: HTMLElement): HTMLElement {
  // P7: the engine knows the price (traits change it); the rate shown is the average of ten
  const rate = +(requisitionCost(state, ctx.registries, 10) / 10).toFixed(2);
  const input = h('input', { type: 'number', name: 'requisition', min: '1', step: '1', value: remembered.get(host) ?? '5', 'aria-label': 'Supplies to requisition' }) as HTMLInputElement;
  const btn = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-requisition': '', ...analyzeNative('glossary:supplies') }, '[ REQUISITION ]') as HTMLButtonElement;
  const sync = () => {
    remembered.set(host, input.value);
    const n = Math.floor(Number(input.value));
    btn.disabled = !(n >= 1) || requisitionCost(state, ctx.registries, n) > state.resources.credits;
  };
  input.addEventListener('input', sync);
  input.addEventListener('change', sync);
  btn.addEventListener('click', () => {
    const n = Math.floor(Number(input.value));
    if (n >= 1) ctx.onRequisition(n);
  });
  sync();
  return h(
    'section',
    { class: 'alius-section' },
    h('h2', {}, 'REQUISITION'),
    h('p', { class: 'alius-dim' }, `Buy supplies for credits: ${rate} CR per supply. The squad eats every day.`),
    h('label', { class: 'alius-option', ...analyzeNative('glossary:supplies') }, 'Supplies ', input),
    ' ',
    btn,
  );
}

/** The OPS tab: today's slot and everything the commander can spend it on. */
const SOURCE_LABEL: Record<ObjectiveSource, string> = { prologue: 'PROLOGUE', spine: 'STORY', director: 'LEAD', unit: 'UNIT' };

const dueLabel = (days: number): string => (days < 0 ? 'OVERDUE' : days === 0 ? 'DUE TODAY' : `DUE IN ${days} DAY${days === 1 ? '' : 'S'}`);

/** P11: every objective the tracker knows, each with where it came from; nothing is drawn when there is nothing to follow. */
function renderObjectives(host: HTMLElement, state: CampaignState, reg: Registries): void {
  const list = objectiveList(state, reg);
  if (list.length === 0) return;
  host.append(h('section', { class: 'alius-section alius-objectives' },
    h('h2', {}, 'OBJECTIVES'),
    h('ul', {}, ...list.map((o) => h('li', { class: 'alius-objective-row alius-stat', 'data-source': o.source, ...analyzeAttrs('glossary:objective') },
      h('span', { class: 'alius-dim' }, `[${SOURCE_LABEL[o.source]}] `), o.text, o.dueDays !== null ? h('span', { class: 'alius-dim' }, ` — ${dueLabel(o.dueDays)}`) : null)))));
}

export function renderOpsTab(host: HTMLElement, ctx: OpsTabCtx): void {
  host.replaceChildren();
  const load = ctx.getLoad();
  const state = ctx.getState();
  if (load.kind === 'readonly') {
    host.append(h('section', { class: 'alius-section' }, h('p', { class: 'alius-banner' }, `READ-ONLY: ${load.reason}`)));
    return;
  }
  if (!state) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
    return;
  }
  const all = [...ctx.registries.activities.values()].filter((a) => a.pastime !== true); // P14c: a quiet meeting is picked from her pastimes, not from this list
  if (ctx.onCountermand) {
    const chips = h('div', { class: 'alius-chips alius-countermand-chips' });
    drawCountermandChips(chips, state, ctx.registries, ctx.onCountermand);
    if (chips.childElementCount > 0) host.append(chips);
  }
  renderObjectives(host, state, ctx.registries);
  const schedule = renderSchedule(state, ctx.registries, {
    onCancel: (id) => ctx.onCancelBooking?.(id), onKeep: (id) => ctx.onKeepBooking?.(id), onSettle: (day, slot) => ctx.onSettleBooking?.(day, slot),
  });
  if (schedule) host.append(schedule); // P9c
  renderMissionBoard(host, state, ctx);
  host.append(
    h(
      'section',
      { class: 'alius-section alius-ops' },
      h('h2', {}, clockText(state.day, state.slot) + (isQuietNight(state) ? ' — QUIET' : '')),
      h('p', { class: 'alius-dim' }, 'Each activity takes this slot. Talking takes it when the scene ends.'),
      isQuietNight(state) && ctx.onSleep
        ? h('p', {},
          h('button', { type: 'button', class: 'alius-btn alius-option', 'data-sleep': '', ...analyzeNative('glossary:quiet_night'), onclick: ctx.onSleep }, '[ SLEEP ]'),
          ' Nobody knocks tonight. Sleep costs nothing; spending the night awake costs tomorrow.')
        : null,
      ...all.map((a) => activityCard(a, state, ctx)),
    ),
    requisition(state, ctx, host),
  );
}
