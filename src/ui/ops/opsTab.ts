import type { Entry, Registries } from '../../content/types';
import { checkActivity, type ActivityRequest } from '../../engine/activities';
import { clockText } from '../../engine/calendar';
import { isLiving } from '../../engine/economy';
import type { CampaignState, Unit } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { LoadResult } from '../../st/persistence';
import { h } from '../dom';
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
}

type Focus = { id: string; label: string; units?: { min: number; max: number } };
const COST_LABEL: Record<string, string> = { credits: 'CR', supplies: 'SUPPLIES', plyx: 'PLYX' };

const costText = (cost: Record<string, number | undefined>): string => {
  const parts = Object.entries(cost).filter(([, n]) => (n ?? 0) > 0).map(([k, n]) => `${n} ${COST_LABEL[k] ?? k.toUpperCase()}`);
  return parts.length === 0 ? 'FREE' : parts.join(' · ');
};
const unitLabel = (u: Unit) => (u.kind === 'grunt' ? `${u.displayName} (grunt)` : u.displayName);

function activityCard(a: Entry, state: CampaignState, ctx: OpsTabCtx): HTMLElement {
  const mode = a.companion as 'none' | 'optional' | 'required';
  const focusList = (a.focus as Focus[] | undefined) ?? [];
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
  const btn = h('button', { type: 'button', class: 'alius-btn', 'data-do': String(a.id) }, '[ DO ]') as HTMLButtonElement;

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
    h('h3', {}, String(a.name)),
    h('p', { class: 'alius-dim' }, `${String(a.summary)} — ${costText(a.cost as Record<string, number>)}`),
    controls,
    reasonEl,
    btn,
  );
}

/** The typed amount survives a re-render (the tab redraws after every action). */
const remembered = new WeakMap<HTMLElement, string>();

function requisition(state: CampaignState, ctx: OpsTabCtx, host: HTMLElement): HTMLElement {
  const rate = TUNING.requisition.creditsPerSupply;
  const input = h('input', { type: 'number', name: 'requisition', min: '1', step: '1', value: remembered.get(host) ?? '5', 'aria-label': 'Supplies to requisition' }) as HTMLInputElement;
  const btn = h('button', { type: 'button', class: 'alius-btn', 'data-requisition': '' }, '[ REQUISITION ]') as HTMLButtonElement;
  const sync = () => {
    remembered.set(host, input.value);
    const n = Math.floor(Number(input.value));
    btn.disabled = !(n >= 1) || n * rate > state.resources.credits;
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
    h('label', {}, 'Supplies ', input),
    ' ',
    btn,
  );
}

/** The OPS tab: today's slot and everything the commander can spend it on. */
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
  const all = [...ctx.registries.activities.values()];
  renderMissionBoard(host, state, ctx);
  host.append(
    h(
      'section',
      { class: 'alius-section alius-ops' },
      h('h2', {}, clockText(state.day, state.slot)),
      h('p', { class: 'alius-dim' }, 'Each activity takes this slot. Talking takes it when the scene ends.'),
      ...all.map((a) => activityCard(a, state, ctx)),
    ),
    requisition(state, ctx, host),
  );
}
