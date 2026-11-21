import type { Entry, Registries } from '../../../content/types';
import { PLAN_FLOORS } from '../../../content/schemas';
import {
  cabinOwner, commanderCabin, isClosed, isOpenSpace, litRooms, planMarks, planRoomsOn, rectOf, roomOfPerson, type PlanFloor, type PlanMark,
} from '../../../engine/basePlan';
import { quartersOf } from '../../../engine/backdrops';
import type { Whereabout } from '../../../engine/hub';
import type { CampaignState, Unit } from '../../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../../analyze/mark';
import { h } from '../../dom';
import { renderCommanderMarker, renderMarker } from '../marker';
import { drawFloor, drawRoofs, drawSite } from './draw';
import type { CabinVariant } from './furnish';
import { Pen, svgEl } from './svg';

/**
 * P10d: the hub stage as a top-down plan. The SVG draws the compound, both floors and the roofs; an HTML layer per floor
 * holds what the player reads and presses: room labels (buttons), markers, staircases and the floor buttons. Every floor's
 * layer is in the DOM and the inactive ones are `hidden`, so switching floors is an attribute, not a redraw.
 */

export const FLOOR_LABEL: Record<PlanFloor, string> = { ground: '1F', upper: '2F', roof: 'ROOF' };
const FLOOR_NAME: Record<PlanFloor, string> = { ground: 'GROUND FLOOR', upper: 'UPPER FLOOR', roof: 'ROOFS' };

export interface PlanStageCtx {
  registries: Registries;
  state: CampaignState;
  here: Whereabout[];
  floor: PlanFloor;
  onFloor: (floor: PlanFloor) => void;
  /** Opens the panel of an open plan room (its hub room). */
  onRoom: (planRoomId: string) => void;
}

const pct = (r: { x: number; y: number; w: number; h: number }): string =>
  `left:${r.x / 10}%;top:${r.y / 6.25}%;width:${r.w / 10}%;height:${r.h / 6.25}%`;

/** The furniture variant of a cabin, from her room style (P10c), read by field; VACANT when nobody has it. */
export function cabinVariant(state: CampaignState, reg: Registries, cabin: Entry): CabinVariant {
  const owner = cabinOwner(state, reg, String(cabin.id));
  if (owner === null) return 'vacant';
  const style = quartersOf(state, reg, owner);
  if (!style) return 'plain';
  if (style.floor === 'tatami') return 'tatami';
  if (style.ceiling === 'rich') return 'rich';
  if (style.ceiling === 'dark') return 'dark';
  return 'plain';
}

/** The people drawn in a plan room (named units and grunts), in squad order. */
export function peopleIn(state: CampaignState, reg: Registries, here: Whereabout[], planRoomId: string): Unit[] {
  return state.squad.filter((u) => roomOfPerson(state, reg, here, u.id)?.id === planRoomId);
}

/**
 * The plan room the commander is drawn in when something moved her out of her own cabin (P15's second place; P16, P17a and P17b add reasons), else
 * `null`: at home she is not drawn, as in P10d. Read from `roomOfPerson`; nothing is stored.
 */
export function commanderAwayRoom(state: CampaignState, reg: Registries, here: Whereabout[]): Entry | null {
  const room = roomOfPerson(state, reg, here, 'commander');
  return room !== null && room.id !== commanderCabin(reg)?.id ? room : null;
}

function svgLayers(reg: Registries, state: CampaignState, here: Whereabout[]): SVGElement {
  const svg = svgEl('svg', { class: 'alius-plan-svg', viewBox: '0 0 1000 625', preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
  const lit = litRooms(state, reg, here);
  const look = { lit, cabinVariant: (c: Entry) => cabinVariant(state, reg, c) };
  const site = Pen.group('p-layer p-layer-site');
  drawSite(site);
  const ground = Pen.group('p-layer p-layer-ground');
  drawFloor(ground, reg, 'ground', look);
  const upper = Pen.group('p-layer p-layer-upper');
  drawFloor(upper, reg, 'upper', look);
  const roofs = Pen.group('p-layer p-layer-roof');
  drawRoofs(roofs, reg);
  svg.append(site.g, ground.g, upper.g, roofs.g);
  return svg;
}

function markChips(marks: PlanMark[]): HTMLElement | null {
  const shown = marks.filter((m) => m.label !== undefined);
  if (shown.length === 0) return null;
  return h('span', { class: 'alius-plan-marks' }, ...shown.map((m) => h('span', {
    class: 'alius-chip alius-plan-mark', 'data-mark': m.kind, ...analyzeAttrs(m.analyze ?? 'glossary:base_floor'),
  }, String(m.label))));
}

function roomLayer(ctx: PlanStageCtx, e: Entry, marks: PlanMark[]): HTMLElement | null {
  const { registries: reg, state, here } = ctx;
  const r = rectOf(e);
  const markAttr = marks.length > 0 ? { 'data-marks': marks.map((m) => m.kind).join(' ') } : {};

  if (e.kind === 'stair' && typeof e.stairTo === 'string') {
    const to = e.stairTo as PlanFloor;
    const up = PLAN_FLOORS.indexOf(to) > PLAN_FLOORS.indexOf(e.floor as PlanFloor);
    return h('div', { class: 'alius-plan-stair', 'data-plan': String(e.id), style: pct(r), ...markAttr },
      h('button', {
        type: 'button', class: 'alius-chip alius-plan-stair-btn', 'data-stair-to': to, 'data-key': `plan:${String(e.id)}`,
        'aria-label': `${up ? 'Up' : 'Down'} to the ${FLOOR_NAME[to].toLowerCase()}`,
        ...analyzeNative('glossary:base_floor'),
        onclick: (ev: Event) => { ev.stopPropagation(); ctx.onFloor(to); },
      }, `${up ? '↑' : '↓'} ${FLOOR_LABEL[to]}`),
      markChips(marks));
  }
  // a place with a hub room is a room whatever its kind (a corridor or a lobby given one comes alive with its people)
  const hubbed = typeof e.hubRoomId === 'string' && reg.hubRooms.has(e.hubRoomId);
  if (e.kind === 'corridor' && !hubbed) {
    // nothing to read on a corridor; a mark on it still shows
    return marks.length > 0 ? h('div', { class: 'alius-plan-markzone', 'data-plan': String(e.id), style: pct(r), ...markAttr }, markChips(marks)) : null;
  }
  if (!hubbed) {
    // a place to read but not to enter: the lobby, and what the game does not have yet
    const closed = isClosed(reg, e);
    const small = r.w < 60 || r.h < 40;
    const at = e.labelAt as { x: number; y: number } | undefined;
    const place = at ? { style: `position:absolute;left:${((at.x - r.x) / r.w) * 100}%;top:${((at.y - r.y) / r.h) * 100}%` } : {};
    return h('div', { class: `alius-plan-closed${closed ? '' : ' alius-plan-open-space'}${small ? ' alius-plan-small' : ''}`, 'data-plan': String(e.id), style: pct(r), ...markAttr },
      h('span', { class: 'alius-chip alius-plan-label', ...analyzeAttrs(`planRooms:${String(e.id)}`), 'data-short': String(e.shortLabel ?? ''), ...place }, String(e.label)),
      markChips(marks));
  }

  const hub = reg.hubRooms.get(String(e.hubRoomId));
  const inside = peopleIn(state, reg, here, String(e.id));
  const cmdrHere = commanderAwayRoom(state, reg, here)?.id === e.id;
  const owner = e.cabin === 'unit' ? cabinOwner(state, reg, String(e.id)) : null;
  const ownerName = owner ? state.squad.find((u) => u.id === owner)?.displayName ?? '' : '';
  const label = e.cabin === 'unit' ? (owner ? ownerName.toUpperCase() : 'VACANT') : String(e.label);
  const analyze = e.cabin === 'unit'
    ? analyzeNative('glossary:cabin', owner ? { unitId: owner } : undefined)
    : e.cabin === 'commander' ? analyzeNative(`planRooms:${String(e.id)}`) : analyzeNative(`hubRooms:${String(hub?.id ?? e.hubRoomId)}`);
  const ariaName = e.cabin === 'unit' ? (owner ? `${ownerName}'s cabin` : 'Vacant cabin') : String(e.label);
  return h(
    'div',
    {
      class: `alius-room alius-plan-room${e.cabin ? ' alius-plan-cabin' : ''}${owner === null && e.cabin === 'unit' ? ' alius-plan-vacant' : ''}`,
      'data-room': String(hub?.id ?? e.hubRoomId), 'data-plan': String(e.id), ...(e.cabin ? { 'data-cabin': String(e.cabin) } : {}),
      role: 'group', 'aria-label': ariaName, style: pct(r), ...markAttr,
      onclick: () => ctx.onRoom(String(e.id)),
    },
    h(
      'div', { class: 'alius-room-head' },
      h('button', {
        type: 'button', class: 'alius-room-label alius-chip', 'data-short': String(e.shortLabel ?? ''), 'data-key': `plan:${String(e.id)}`,
        'aria-label': inside.length + (cmdrHere ? 1 : 0) > 0 ? `${ariaName}, ${inside.length + (cmdrHere ? 1 : 0)} here` : ariaName, ...analyze,
      }, label),
      inside.length + (cmdrHere ? 1 : 0) > 0 ? h('span', { class: 'alius-room-count', 'aria-hidden': 'true' }, String(inside.length + (cmdrHere ? 1 : 0))) : null,
    ),
    h('div', { class: 'alius-room-markers' }, ...inside.map((u) => renderMarker(state, reg, u)), cmdrHere ? renderCommanderMarker(ariaName) : null),
    markChips(marks),
  );
}

/** The plan stage: SVG, a layer per floor, the floor buttons. */
export function renderPlanStage(ctx: PlanStageCtx): { stage: HTMLElement; floorBar: HTMLElement; setFloor: (f: PlanFloor) => void } {
  const { registries: reg, state, here } = ctx;
  const marks = planMarks(state, reg);
  const marksOf = (id: string): PlanMark[] => marks.filter((m) => m.planRoomId === id);

  const layers = new Map<PlanFloor, HTMLElement>();
  for (const floor of PLAN_FLOORS) {
    const layer = h('div', { class: 'alius-plan-layer', 'data-floor': floor, role: 'group', 'aria-label': FLOOR_NAME[floor] },
      ...planRoomsOn(reg, floor).map((e) => roomLayer(ctx, e, marksOf(String(e.id)))));
    layers.set(floor, layer);
  }
  const counts = new Map<PlanFloor, number>(PLAN_FLOORS.map((f) => [f, 0]));
  for (const u of state.squad) {
    const f = roomOfPerson(state, reg, here, u.id)?.floor as PlanFloor | undefined;
    if (f) counts.set(f, (counts.get(f) ?? 0) + 1);
  }
  const away = commanderAwayRoom(state, reg, here)?.floor as PlanFloor | undefined;
  if (away) counts.set(away, (counts.get(away) ?? 0) + 1);
  const buttons = new Map<PlanFloor, HTMLElement>();
  const floorBar = h('div', { class: 'alius-plan-floors', role: 'group', 'aria-label': 'Floors' },
    ...PLAN_FLOORS.map((f) => {
      const n = counts.get(f) ?? 0;
      const b = h('button', {
        type: 'button', class: 'alius-btn alius-plan-floor-btn', 'data-floor': f, 'data-key': `floor:${f}`,
        'aria-label': `${FLOOR_NAME[f].toLowerCase()}${n > 0 ? `, ${n} here` : ''}`,
        ...analyzeNative('glossary:base_floor'),
        onclick: () => ctx.onFloor(f),
      }, FLOOR_LABEL[f], n > 0 ? h('span', { class: 'alius-plan-floor-count' }, ` · ${n}`) : null);
      buttons.set(f, b);
      return b;
    }));
  const caption = h('span', { class: 'alius-hub-caption', 'aria-hidden': 'true' });
  const stage = h('div', { class: 'alius-hub-stage alius-hub-plan' }, svgLayers(reg, state, here), ...layers.values(), caption);

  const setFloor = (f: PlanFloor): void => {
    stage.dataset.floor = f;
    caption.textContent = `CCP OUTPOST · ${FLOOR_NAME[f]} · NOT TO SCALE`;
    for (const [floor, layer] of layers) layer.hidden = floor !== f;
    for (const [floor, b] of buttons) b.setAttribute('aria-pressed', String(floor === f));
  };
  setFloor(ctx.floor);
  return { stage, floorBar, setFloor };
}
