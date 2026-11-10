import type { Entry, Registries } from '../../content/types';
import type { CampaignState } from '../../engine/state/types';
import { poiCooldownReason } from '../../engine/world/expedition';
import { knownRegions } from '../../engine/world/state';
import type { LoadResult } from '../../st/persistence';
import { bar } from '../combat/bars';
import { h } from '../dom';

export type PlanTarget = { missionId: string } | { poi: { regionId: string; poiId: string } };

export interface MapTabCtx {
  getState: () => CampaignState | null;
  getLoad: () => LoadResult;
  registries: Registries;
  /** The author-supplied world image; `null` means the ASCII map. */
  mapImageUrl: string | null;
  onPlan: (target: PlanTarget) => void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const SOURCE_TAG: Record<string, string> = { command: 'COMMAND', story: 'STORY', rumor: 'RUMOR', side: 'SIDE' };

function svg(tag: string, attrs: Record<string, string>): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

/** The region shown in the panel: the remembered choice, else the start region, else the first known one. */
function selectedRegion(host: HTMLElement, state: CampaignState, reg: Registries, known: Entry[]): Entry | undefined {
  const remembered = known.find((r) => r.id === host.dataset.selected);
  if (remembered) return remembered;
  const startRegion = reg.corporations.get(state.commander.corporationId ?? '')?.startingRegionId;
  return known.find((r) => r.id === startRegion) ?? known[0];
}

function regionPanel(state: CampaignState, region: Entry, ctx: MapTabCtx): HTMLElement {
  const reg = ctx.registries;
  const danger = region.danger as number;
  const panel = h('section', { class: 'alius-section alius-region-panel', 'data-region-panel': String(region.id) },
    h('h2', {}, String(region.name)),
    h('p', {}, String(region.summary)),
    h('h3', {}, 'ENVIRONMENT'),
    h('p', { class: 'alius-dim' }, String(region.environmentPrompt)),
    h('p', {}, `DANGER ${'▮'.repeat(danger)}${'▯'.repeat(Math.max(0, 5 - danger))}`),
    h('p', {}, `TRAVEL ${String(region.travelSlots)} SLOTS`),
  );

  const categories = Object.keys((region.enemyTable as { categories: Record<string, number> }).categories)
    .map((id) => String(reg.enemyCategories.get(id)?.name ?? id));
  panel.append(h('h3', {}, 'KNOWN HOSTILES'), h('p', {}, categories.length > 0 ? categories.join(', ') : 'NONE REPORTED'));

  const clocks = state.world.clocks.filter((c) => c.visibleToPlayer && (c.regionId === undefined || c.regionId === region.id));
  panel.append(h('h3', {}, 'CLOCKS'));
  if (clocks.length === 0) panel.append(h('p', { class: 'alius-dim' }, 'NOTHING TO REPORT'));
  for (const c of clocks) panel.append(h('p', { class: 'alius-clock' }, `${c.label} ${bar(c.filled, c.segments, c.segments)} ${c.filled}/${c.segments}`));

  panel.append(h('h3', {}, 'MISSIONS'));
  const missions = state.missions.offered.filter((m) => m.regionId === region.id);
  if (missions.length === 0) panel.append(h('p', { class: 'alius-dim' }, 'NO MISSIONS POSTED HERE'));
  for (const m of missions) {
    const left = m.deadlineDay !== undefined ? `  D-${Math.max(0, m.deadlineDay - state.day)}` : '';
    panel.append(h('div', { class: 'alius-mission-row', 'data-mission-row': m.id },
      h('span', {}, `[${SOURCE_TAG[m.source] ?? m.source.toUpperCase()}] ${m.title}  DANGER ${m.danger}${left} `),
      h('button', { type: 'button', class: 'alius-btn', 'data-mission': m.id, onclick: () => ctx.onPlan({ missionId: m.id }) }, '[ PLAN ]'),
    ));
  }

  panel.append(h('h3', {}, 'POINTS OF INTEREST'));
  const pois = region.pointsOfInterest as Array<{ id: string; name: string; summary: string }>;
  if (pois.length === 0) panel.append(h('p', { class: 'alius-dim' }, 'NONE'));
  for (const poi of pois) {
    const reason = poiCooldownReason(state, String(region.id), poi.id);
    panel.append(h('div', { class: 'alius-poi-row', 'data-poi-row': poi.id },
      h('p', {}, `${poi.name} — ${poi.summary}`),
      h('button', {
        type: 'button', class: 'alius-btn', 'data-poi': poi.id, disabled: reason !== null, title: reason ?? '',
        onclick: () => { if (reason === null) ctx.onPlan({ poi: { regionId: String(region.id), poiId: poi.id } }); },
      }, '[ PLAN RUN ]'),
      ...(reason ? [h('p', { class: 'alius-dim alius-reason' }, reason)] : []),
    ));
  }
  return panel;
}

/** The MAP tab: the world map (image with hotspots, or an ASCII grid), and the panel of the selected region. */
export function renderMapTab(host: HTMLElement, ctx: MapTabCtx): void {
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
  const reg = ctx.registries;
  const known = knownRegions(state, reg);
  const knownIds = new Set(known.map((r) => String(r.id)));
  const regions = [...reg.regions.values()];
  let current = selectedRegion(host, state, reg, known);
  const select = (id: string): void => {
    if (!knownIds.has(id)) return;
    host.dataset.selected = id;
    renderMapTab(host, ctx);
  };

  let useImage = ctx.mapImageUrl !== null;
  const mapBox = h('section', { class: 'alius-section' }, h('h2', {}, '[ WORLD MAP ]'));
  const drawMap = (): void => {
    mapBox.querySelector('.alius-map')?.remove();
    mapBox.append(useImage ? imageMap() : asciiMap());
  };

  function imageMap(): HTMLElement {
    const img = h('img', { src: ctx.mapImageUrl, alt: 'World map', class: 'alius-map-img' });
    img.addEventListener('error', () => {
      useImage = false;
      drawMap();
    });
    const overlay = svg('svg', { viewBox: '0 0 100 100', preserveAspectRatio: 'none', class: 'alius-map-overlay' });
    for (const r of regions) {
      const id = String(r.id);
      const points = (r.mapHotspot as number[][]).map(([x, y]) => `${x},${y}`).join(' ');
      const isKnown = knownIds.has(id);
      const poly = svg('polygon', {
        points, 'data-region': id, class: `alius-hotspot${isKnown ? '' : ' alius-nosignal'}${current?.id === id ? ' alius-selected' : ''}`,
        'aria-label': isKnown ? String(r.name) : 'NO SIGNAL',
        ...(isKnown ? { tabindex: '0', role: 'button' } : { 'aria-disabled': 'true' }),
      });
      if (isKnown) {
        poly.addEventListener('click', () => select(id));
        poly.addEventListener('keydown', (e) => {
          if ((e as KeyboardEvent).key === 'Enter' || (e as KeyboardEvent).key === ' ') {
            e.preventDefault();
            select(id);
          }
        });
      }
      overlay.append(poly);
    }
    const wrap = h('div', { class: 'alius-map' }, img);
    wrap.append(overlay);
    return wrap;
  }

  function asciiMap(): HTMLElement {
    const rule = (l: string, m: string, r: string): HTMLElement => h('div', { class: 'alius-ascii-rule', 'aria-hidden': 'true' }, `${l}${'──────────────'}${m}${'──────────────'}${m}${'──────────────'}${r}`);
    const wrap = h('div', { class: 'alius-map alius-ascii-map' }, rule('┌', '┬', '┐'));
    for (let y = 0; y < 3; y++) {
      const row = h('div', { class: 'alius-ascii-row' });
      for (let x = 0; x < 3; x++) {
        const r = regions.find((q) => (q.mapCell as { x: number; y: number }).x === x && (q.mapCell as { x: number; y: number }).y === y);
        const cell = h('div', { class: 'alius-ascii-cell', 'data-cell': `${x},${y}` });
        if (r && knownIds.has(String(r.id))) {
          cell.append(h('button', {
            type: 'button', class: `alius-btn alius-region-btn${current?.id === r.id ? ' alius-selected' : ''}`, 'data-region': String(r.id),
            onclick: () => select(String(r.id)),
          }, String(r.name)));
        } else if (r) {
          cell.append(h('span', { class: 'alius-nosignal' }, '[ NO SIGNAL ]'));
        }
        row.append(cell);
      }
      wrap.append(row, y < 2 ? rule('├', '┼', '┤') : rule('└', '┴', '┘'));
    }
    return wrap;
  }

  drawMap();
  host.append(mapBox);
  if (current) {
    current = known.find((r) => r.id === current!.id);
    if (current) host.append(regionPanel(state, current, ctx));
  }
}
