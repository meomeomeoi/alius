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
import { peekHubArt, probeHubArt } from './art';
import { renderMarker } from './marker';
import {
  currentObjective, endSlotBlock, latestOversight, TONE_GLYPH, TONE_LABEL, tonightItems, type MarkerTone,
} from './model';
import { renderRoomPanel } from './roomPanel';

export interface HubCtx {
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  settings: () => AliusSettings;
  /** Resolves a file shipped with the extension (hub art); without it the blueprint always shows. */
  assetUrl?: (path: string) => string;
  /** The cards of a room's activities are the OPS tab's, so they need its context. */
  ops: OpsTabCtx;
  onTalk(unitId: string, locationId: string): void;
  onEndSlot(): void;
  onOpenPda(tab?: TabId): void;
  /** Her portrait for the room panel (`null` = none). */
  avatar(unit: Unit): HTMLElement | null;
}

/** Which room's panel is open, per hub host: a refresh redraws the hub and keeps the panel. */
const openRoom = new WeakMap<HTMLElement, string>();
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

function crossSection(
  ctx: HubCtx, state: CampaignState, here: Whereabout[], onRoom: (id: string) => void,
): { section: HTMLElement; panelHost: HTMLElement } {
  const reg = ctx.registries;
  const slot: Slot = state.slot;
  const bg = h('div', { class: 'alius-hub-bg alius-hub-blueprint', 'aria-hidden': 'true' });
  const caption = h('span', { class: 'alius-hub-caption', 'aria-hidden': 'true' }, 'SECTION A-A · NOT TO SCALE');
  const showArt = (url: string): void => {
    bg.className = 'alius-hub-bg alius-hub-art';
    bg.style.backgroundImage = `url("${url}")`;
    caption.remove();
  };
  const known = peekHubArt(ctx.assetUrl, slot);
  if (typeof known === 'string') showArt(known);
  else if (known === undefined) {
    void probeHubArt(ctx.assetUrl, slot).then((url) => {
      if (url && bg.isConnected) showArt(url);
    });
  }

  const unitOf = (id: string): Unit | undefined => state.squad.find((u) => u.id === id);
  const rooms = [...reg.hubRooms.values()].map((room: Entry) => {
    const r = room.rect as { x: number; y: number; w: number; h: number };
    const inside = here.filter((w) => w.roomId === room.id).map((w) => unitOf(w.unitId)).filter((u): u is Unit => u !== undefined);
    const el = h(
      'div',
      {
        class: 'alius-room', 'data-room': String(room.id), role: 'group', 'aria-label': String(room.label),
        style: `left:${r.x}%;top:${r.y}%;width:${r.w}%;height:${r.h}%`,
        onclick: () => onRoom(String(room.id)),
      },
      h('button', { type: 'button', class: 'alius-room-label alius-chip', ...analyzeNative(`hubRooms:${String(room.id)}`) }, String(room.label)),
      h('div', { class: 'alius-room-markers' }, ...inside.map((u) => renderMarker(state, reg, u))),
    );
    return el;
  });

  const away = here.filter((w) => w.reason === 'expedition').map((w) => unitOf(w.unitId)).filter((u): u is Unit => u !== undefined);
  const elsewhere = here.filter((w) => w.reason === 'nowhere').map((w) => unitOf(w.unitId)).filter((u): u is Unit => u !== undefined);

  const panelHost = h('div', { class: 'alius-room-panel-host' });
  const stage = h('div', { class: 'alius-hub-stage', 'data-slot': slot }, bg, ...rooms, caption, panelHost);
  const section = h(
    'section', { class: 'alius-hub-main', 'aria-label': 'Outpost cross-section' },
    stage,
    away.length > 0 ? strip('alius-away', 'glossary:away', 'AWAY', state, reg, away) : null,
    elsewhere.length > 0 ? strip('alius-elsewhere', 'glossary:whereabouts', 'ELSEWHERE', state, reg, elsewhere) : null,
  );
  return { section, panelHost };
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
  return h(
    'aside', { class: 'alius-hub-side' },
    stat('alius-objective', 'glossary:objective',
      h('div', { class: 'alius-card-label' }, 'OBJECTIVE'),
      objective ? h('div', { class: 'alius-card-title' }, objective.text) : h('div', { class: 'alius-card-title' }, 'NO STANDING ORDERS'),
      objective ? h('div', { class: 'alius-dim' }, dueText(objective.dueDays)) : null),
    h(
      'section', { class: 'alius-tonight' },
      h('h2', {}, 'TONIGHT'),
      items.length === 0
        ? h('p', { class: 'alius-dim' }, 'Nothing is waiting.')
        : h('ul', {}, ...items.map((i) => h('li', { class: 'alius-tonight-item alius-stat', 'data-tone': i.tone, ...analyzeAttrs(i.analyze) }, `${TONE_GLYPH[i.tone]} ${i.text}`))),
    ),
    oversight
      ? stat('alius-oversight', 'glossary:leash',
        h('div', { class: 'alius-card-label' }, 'OVERSIGHT'),
        h('div', {}, `Request #${String(oversight.no).padStart(4, '0')}: ${oversight.kind.toUpperCase()} ${who} — ${oversight.outcome}.`))
      : null,
    h(
      'div', { class: 'alius-legend' },
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
 * The home screen: the outpost cross-section with its rooms and the soldiers in them, and a column with the standing
 * order, what is waiting tonight and the two buttons that matter (open the PDA, end the slot). The device element is
 * the shell's: it is only handed over for reference.
 */
export function renderHub(host: HTMLElement, _device: HTMLElement, ctx: HubCtx): void {
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
    const room = id !== undefined ? ctx.registries.hubRooms.get(id) : undefined;
    if (!room) return;
    const r = room.rect as { x: number; y: number; w: number; h: number };
    const panel = renderRoomPanel(room, state, ctx, here, { readOnly, onClose: close });
    panel.style.setProperty('--panel-x', `${r.x}%`);
    panel.style.setProperty('--panel-y', `${Math.min(r.y + r.h * 0.25, 60)}%`);
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

  const { section, panelHost } = crossSection(ctx, state, here, open);
  root.append(h('div', { class: 'alius-hub-body' }, section, sideColumn(ctx, state, readOnly)));
  showPanel();

  // Escape closes the panel before the device (the shell's rule); a click outside the panel and the rooms closes it too.
  const onKey = (ev: Event): void => {
    const e = ev as KeyboardEvent;
    if (!host.isConnected) return teardown.get(host)?.();
    if (e.key !== 'Escape' || !openRoom.has(host)) return;
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
    if (el && typeof el.closest === 'function' && el.closest('.alius-room-panel, .alius-room, .alius-analyze')) return;
    close();
  };
  window.addEventListener('keydown', onKey, true);
  window.addEventListener('pointerdown', onDown, true);
  teardown.set(host, () => {
    window.removeEventListener('keydown', onKey, true);
    window.removeEventListener('pointerdown', onDown, true);
  });
}
