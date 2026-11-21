import { drawCountermandChips } from '../power/chips';
import type { Entry, Registries } from '../../content/types';
import { whereabouts, type Whereabout } from '../../engine/hub';
import type { CampaignState, Slot, Unit } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { LoadResult } from '../../st/persistence';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import type { OpsTabCtx } from '../ops/opsTab';
import { renderStatusHeader } from '../shell/status';
import type { TabId } from '../shell/tabs';
import { renderVoiceCard } from '../voice/voiceCard';
import { motionReduced } from '../motion';
import { renderVitalsStrip } from '../vitals/block';
import { renderMarker } from './marker';
import {
  currentObjective, endSlotBlock, latestOversight, TONE_GLYPH, TONE_LABEL, tonightItems, type MarkerTone,
} from './model';
import { renderRoomPanel } from './roomPanel';
import { isEditable, isInsideOverlay } from '../shell/keys';
import { peopleIn, renderPlanStage } from './plan/planView';
import { cabinOwner } from '../../engine/basePlan';
import { PLAN_FLOORS, type PlanFloor } from '../../content/schemas';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';

export interface HubCtx {
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  settings: () => AliusSettings;
  /** Resolves a file shipped with the extension (unused by the plan; kept for the app's wiring). */
  assetUrl?: (path: string) => string;
  /** P10: the art the packs declare (`hub`). P10d: ignored, the plan is drawn from data. */
  art?: { hub: readonly string[] };
  /** The cards of a room's activities are the OPS tab's, so they need its context. */
  ops: OpsTabCtx;
  /** P11: draws the prologue card (nothing once the prologue is done); the hub puts it above the objective and redraws it with the hub. */
  onboardingCard?: (host: HTMLElement) => void;
  /** P11b: draws THE FIRST WEEKS card (nothing once the first scene has started); the hub puts it above the prologue card. */
  headStartCard?: (host: HTMLElement) => void;
  /** P13: draws the warden's open override as a chip (nothing when none is open). */
  overrideChip?: (host: HTMLElement) => void;
  onTalk(unitId: string, locationId: string): void;
  onEndSlot(): void;
  onOpenPda(tab?: TabId): void;
  /** P15: the OPEN button of a Tonight line of the dynamic (a milestone, claim or return offer waits): opens her thread in COMMS, where its card is. */
  onOpenThread?(unitId: string): void;
  /** Her portrait for the room panel (`null` = none). */
  avatar(unit: Unit): HTMLElement | null;
  /** P10b: the commander read a note (the app dispatches `notes/read`). */
  onReadNote?(id: string): void;
  /** P14: the FAILED block (day and world generations) with RETRY, and REROLL of the last scene's summary. Absent = none drawn. */
  generation?: GenerationUi;
  /** P14: the last scene summary's reroll as the scene controller reports and runs it. */
  lastScene?: { state(): { enabled: boolean; reason?: string }; run(): Promise<void> };
}

/** Which plan room's panel is open, per hub host: a refresh redraws the hub and keeps the panel. */
const openRoom = new WeakMap<HTMLElement, string>();
/** P10d: the floor the plan shows, per hub host (a redraw keeps it, a reload starts on the ground floor). */
const shownFloor = new WeakMap<HTMLElement, PlanFloor>();
/** Removes the window listeners of a previous render of the same host. */
const teardown = new WeakMap<HTMLElement, () => void>();

const LEGEND_TONES: MarkerTone[] = ['danger', 'bond', 'trust', 'affinity', 'warn'];

const stat = (cls: string, address: string, ...children: Array<Node | string | null>): HTMLElement =>
  h('div', { class: `${cls} alius-stat`, ...analyzeAttrs(address) }, ...children);

const dueText = (days: number | null): string =>
  days === null ? 'NO DEADLINE' : days < 0 ? 'OVERDUE' : days === 0 ? 'DUE TODAY' : `DUE IN ${days} DAY${days === 1 ? '' : 'S'}`;

function topBar(ctx: HubCtx, state: CampaignState | null): HTMLElement {
  const corp = state?.commander.corporationId ? ctx.registries.corporations.get(state.commander.corporationId) : undefined;
  const status = h('div', { class: 'alius-hub-status' });
  renderStatusHeader(status, state);
  return h(
    'header', { class: 'alius-hub-topbar' },
    h('span', { class: 'alius-hub-logo' }, 'ALIUS'),
    h('span', { class: 'alius-hub-where' }, `CCP OUTPOST${corp ? ` // ${String(corp.name)}` : ''}`),
    status,
  );
}

function strip(cls: string, address: string, label: string, state: CampaignState, reg: Registries, units: Unit[]): HTMLElement {
  return h(
    'div', { class: `alius-strip ${cls}` },
    h('span', { class: 'alius-chip', ...analyzeAttrs(address) }, label),
    ...units.map((u) => renderMarker(state, reg, u)),
  );
}

/** A unit cabin's panel title: hers, or VACANT. */
function cabinTitle(state: CampaignState, reg: Registries, cabinId: string): string {
  const owner = cabinOwner(state, reg, cabinId);
  const name = owner ? state.squad.find((u) => u.id === owner)?.displayName : undefined;
  return name ? `${name.toUpperCase()}'S CABIN` : 'VACANT CABIN';
}

function planSection(
  ctx: HubCtx, state: CampaignState, here: Whereabout[], floor: PlanFloor, onFloor: (f: PlanFloor) => void, onRoom: (id: string) => void,
): { section: HTMLElement; panelHost: HTMLElement; setFloor: (f: PlanFloor) => void } {
  const reg = ctx.registries;
  const unitOf = (id: string): Unit | undefined => state.squad.find((u) => u.id === id);
  const { stage, floorBar, setFloor } = renderPlanStage({ registries: reg, state, here, floor, onFloor, onRoom });
  const panelHost = h('div', { class: 'alius-room-panel-host' });
  // the plan keeps its 16:10 and scrolls inside its frame on a narrow screen; the panel stays over the visible frame
  const frame = h('div', { class: 'alius-plan-frame' }, h('div', { class: 'alius-plan-scroll' }, stage), floorBar, panelHost);

  const away = here.filter((w) => w.reason === 'expedition').map((w) => unitOf(w.unitId)).filter((u): u is Unit => u !== undefined);
  // a unit whose hub room has no plan room is not lost either: she is listed with the nowhere ones
  const drawnSomewhere = (w: Whereabout): boolean => w.roomId !== null && [...reg.planRooms.values()].some((p) => p.hubRoomId === w.roomId) && reg.hubRooms.has(w.roomId);
  const elsewhere = here.filter((w) => w.reason === 'nowhere' || (w.reason !== 'expedition' && !drawnSomewhere(w)))
    .map((w) => unitOf(w.unitId)).filter((u): u is Unit => u !== undefined);
  const section = h(
    'section', { class: 'alius-hub-main', 'aria-label': 'Plan of the outpost' },
    frame,
    away.length > 0 ? strip('alius-away', 'glossary:away', 'AWAY', state, reg, away) : null,
    elsewhere.length > 0 ? strip('alius-elsewhere', 'glossary:whereabouts', 'ELSEWHERE', state, reg, elsewhere) : null,
  );
  return { section, panelHost, setFloor };
}

/** Today's (or yesterday's) Leash request, in the corporation's own voice. */
function oversightCard(ctx: HubCtx, state: CampaignState, no: number, what: string): HTMLElement {
  const corp = state.commander.corporationId ? ctx.registries.corporations.get(state.commander.corporationId) : undefined;
  const card = renderVoiceCard({
    voice: 'corporate', title: `${String(corp?.name ?? 'CCP').toUpperCase()} · OVERSIGHT`, level: 3, body: `Request #${String(no).padStart(4, '0')}: ${what}.`,
  });
  card.classList.add('alius-oversight', 'alius-stat');
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:leash'))) card.setAttribute(k, v);
  return card;
}

/** P14: generations that failed in the background of the day or the world, and the last scene's summary when it can be asked for again. */
function failedBlock(ctx: HubCtx, state: CampaignState): HTMLElement | null {
  const ui = ctx.generation;
  if (!ui) return null;
  const body = h('div', { class: 'alius-generation-chips' });
  drawGenerationChips(body, ui, state, 'day');
  drawGenerationChips(body, ui, state, 'world');
  const last = ctx.lastScene;
  if (last && last.state().enabled) {
    const line = h('p', { class: 'alius-dim alius-last-scene' }, 'LAST SCENE ');
    drawSiteReroll(line, ui, 'scene.summary', 'last', () => last.run(), last.state());
    body.append(line);
  }
  return body.childElementCount > 0 ? h('section', { class: 'alius-generation-failed' }, h('h2', {}, 'FAILED'), body) : null;
}

function sideColumn(ctx: HubCtx, state: CampaignState, readOnly: boolean): HTMLElement {
  const objective = currentObjective(state, ctx.registries);
  const items = tonightItems(state, ctx.registries);
  const oversight = latestOversight(state);
  const block = readOnly ? 'This campaign is read-only.' : endSlotBlock(state);
  const slotName = state.slot.toUpperCase();

  const end = readOnly
    ? null
    : h('button', {
      type: 'button', class: 'alius-btn alius-option alius-end', 'data-end-slot': '', 'aria-disabled': block !== null ? 'true' : null,
      ...analyzeNative('glossary:end_slot'),
      onclick: () => {
        if (block === null) ctx.onEndSlot();
      },
    }, `END ${slotName} ▸`);

  const who = oversight ? state.squad.find((u) => u.id === oversight.unitId)?.displayName ?? oversight.unitId : '';
  const firstWeeks = h('div', { class: 'alius-head-start-host' });
  ctx.headStartCard?.(firstWeeks);
  const prologue = h('div', { class: 'alius-onboarding-host' });
  ctx.onboardingCard?.(prologue);
  const warden = h('div', { class: 'alius-warden-chips' });
  ctx.overrideChip?.(warden);
  const countermand = h('div', { class: 'alius-chips alius-countermand-chips' });
  if (ctx.ops.onCountermand) drawCountermandChips(countermand, state, ctx.registries, ctx.ops.onCountermand);
  return h(
    'aside', { class: 'alius-hub-side' },
    firstWeeks.childElementCount > 0 ? firstWeeks : null,
    prologue.childElementCount > 0 ? prologue : null,
    warden.childElementCount > 0 ? warden : null,
    countermand.childElementCount > 0 ? countermand : null,
    stat('alius-objective', 'glossary:objective',
      h('div', { class: 'alius-card-label' }, 'OBJECTIVE'),
      objective ? h('div', { class: 'alius-card-title' }, objective.text) : h('div', { class: 'alius-card-title' }, 'NO STANDING ORDERS'),
      objective ? h('div', { class: 'alius-dim' }, dueText(objective.dueDays)) : null),
    h(
      'section', { class: 'alius-tonight' },
      h('h2', {}, 'TONIGHT'),
      items.length === 0
        ? h('p', { class: 'alius-dim' }, 'Nothing is waiting.')
        : h('ul', {}, ...items.map((i) => h('li', { class: 'alius-tonight-item alius-stat', 'data-tone': i.tone, ...analyzeAttrs(i.analyze) }, `${TONE_GLYPH[i.tone]} ${i.text}`,
          i.kind === 'dynamic' && i.unitId !== undefined && ctx.onOpenThread !== undefined && !readOnly
            ? h('button', {
              type: 'button', class: 'alius-btn alius-option alius-tonight-open', 'data-open-thread': i.unitId, ...analyzeNative(i.analyze),
              onclick: (e: Event) => { e.stopPropagation(); ctx.onOpenThread!(i.unitId!); },
            }, ' OPEN ▸')
            : null))),
    ),
    failedBlock(ctx, state),
    renderVitalsStrip(state, ctx.registries, { motion: !motionReduced(ctx.settings()) }),
    oversight ? oversightCard(ctx, state, oversight.no, `${oversight.kind.toUpperCase()} ${who} — ${oversight.outcome}`) : null,
    h(
      'div', { class: 'alius-legend' },
      h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:semantic_colours') }, 'LEGEND'),
      ...LEGEND_TONES.map((t) => h('span', { class: 'alius-chip', 'data-tone': t, ...analyzeAttrs('glossary:marker_tone') }, `${TONE_GLYPH[t]} ${TONE_LABEL[t].toUpperCase()}`)),
    ),
    h('button', {
      type: 'button', class: 'alius-btn alius-option alius-open-pda', 'data-open-pda': '', ...analyzeNative('glossary:pda_device'),
      onclick: () => ctx.onOpenPda(),
    }, 'OPEN PDA  [TAB]'),
    end,
    block !== null && end ? h('p', { class: 'alius-dim alius-reason alius-end-reason' }, block) : null,
  );
}

/**
 * The home screen: the plan of the outpost with its rooms and the soldiers in them (P10d), and a column with the standing
 * order, what is waiting tonight and the two buttons that matter (open the PDA, end the slot). The device element is
 * the shell's: it is only handed over for reference.
 */
export function renderHub(host: HTMLElement, device: HTMLElement, ctx: HubCtx): void {
  teardown.get(host)?.();
  teardown.delete(host);
  host.replaceChildren();

  const load = ctx.getLoad();
  const state = ctx.getState();
  const root = h('div', { class: 'alius-hub', 'data-slot': state?.slot ?? 'morning' });
  host.append(root);
  root.append(topBar(ctx, state));

  const openPda = (): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-option alius-open-pda', 'data-open-pda': '', ...analyzeNative('glossary:pda_device'),
    onclick: () => ctx.onOpenPda(),
  }, 'OPEN PDA  [TAB]');

  if (!state) {
    root.append(h('section', { class: 'alius-section alius-hub-empty' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT'), openPda()));
    return;
  }
  const readOnly = load.kind === 'readonly';
  if (readOnly) root.append(h('p', { class: 'alius-banner' }, `READ-ONLY: ${load.reason}`));

  const here = whereabouts(state, ctx.registries);
  const showPanel = (): void => {
    panelHost.replaceChildren();
    const id = openRoom.get(host);
    const plan = id !== undefined ? ctx.registries.planRooms.get(id) : undefined;
    const room = plan ? ctx.registries.hubRooms.get(String(plan.hubRoomId)) : undefined;
    if (!plan || !room) return;
    const r = plan.rect as { x: number; y: number; w: number; h: number };
    const panel = renderRoomPanel(room, state, ctx, here, {
      readOnly, onClose: close,
      view: {
        planRoomId: String(plan.id),
        people: peopleIn(state, ctx.registries, here, String(plan.id)),
        sceneLocationId: typeof plan.sceneLocationId === 'string' ? plan.sceneLocationId : undefined,
        cabin: plan.cabin as 'unit' | 'commander' | undefined,
        title: plan.cabin === 'unit' ? cabinTitle(state, ctx.registries, String(plan.id)) : String(plan.label),
        description: plan.cabin !== undefined ? String(plan.description) : undefined,
      },
    });
    panel.style.setProperty('--panel-x', `${r.x / 10}%`);
    panel.style.setProperty('--panel-y', `${Math.min((r.y + r.h * 0.25) / 6.25, 60)}%`);
    panelHost.append(panel);
  };
  const open = (id: string): void => {
    openRoom.set(host, id);
    showPanel();
  };
  function close(): void {
    openRoom.delete(host);
    showPanel();
  }

  const floor = shownFloor.get(host) ?? 'ground';
  let setFloor: (f: PlanFloor) => void = () => {};
  const onFloor = (f: PlanFloor): void => {
    shownFloor.set(host, f);
    if (openRoom.has(host) && ctx.registries.planRooms.get(openRoom.get(host)!)?.floor !== f) close();
    setFloor(f);
  };
  const built = planSection(ctx, state, here, floor, onFloor, open);
  const { section, panelHost } = built;
  setFloor = built.setFloor;
  root.append(h('div', { class: 'alius-hub-body' }, section, sideColumn(ctx, state, readOnly)));
  showPanel();

  // Escape closes the panel before the device (the shell's rule); a click outside the panel and the rooms closes it too.
  const onKey = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (!host.isConnected) return teardown.get(host)?.();
    // P10d: PageUp / PageDown change the floor; never while typing, in a dialog, the analysis panel or a modal, with the
    // device up or with a modifier (the shell's own rules for its keys)
    if ((e.key === 'PageUp' || e.key === 'PageDown') && device.dataset.up !== 'true' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (isEditable(e.target) || isInsideOverlay(e.target) || document.querySelector('.alius-modal-backdrop')) return;
      const i = PLAN_FLOORS.indexOf(shownFloor.get(host) ?? 'ground');
      const next = PLAN_FLOORS[Math.max(0, Math.min(PLAN_FLOORS.length - 1, i + (e.key === 'PageUp' ? 1 : -1)))];
      e.preventDefault();
      onFloor(next);
      return;
    }
    if (e.key !== 'Escape' || !openRoom.has(host)) return;
    if (device.dataset.up === 'true') return; // the raised device is on top of the room panel: Escape lowers it first
    const el = e.target as HTMLElement | null;
    if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    if (document.querySelector('.alius-modal-backdrop')) return; // a modal closes first
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const onDown = (ev: Event): void => {
    if (!host.isConnected) return teardown.get(host)?.();
    if (!openRoom.has(host)) return;
    const el = ev.target as Element | null;
    // a press in the panel, a room, the analysis panel, a modal or a toast is not a press "outside"
    if (el && typeof el.closest === 'function' && el.closest('.alius-room-panel, .alius-room, .alius-analyze, .alius-modal-layer, .alius-toasts')) return;
    close();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  teardown.set(host, () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onDown, true);
  });
}
