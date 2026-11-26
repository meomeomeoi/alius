import type { Entry, Registries } from '../../content/types';
import { checkActivity } from '../../engine/activities';
import { lockedTabs } from '../../engine/onboarding';
import { restrictionReason } from '../../engine/discipline/restrictions';
import type { Whereabout } from '../../engine/hub';
import type { CampaignState, Unit } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { herHand } from '../stage/look';
import { notesFor } from '../../engine/notes';
import { pinnedNotes } from '../../engine/personal/decor';
import { renderNote } from '../notes/note';
import { lifeMode } from '../../engine/life/state';
import { pastimeActivity } from '../../engine/life/types';
import { renderHubDayLine, renderPastimePicker } from '../life/lifeViews';
import { activityCard } from '../ops/opsTab';
import type { HubCtx } from './hubScreen';
import { renderMarker } from './marker';
import { endSlotBlock } from './model';

/** The activity that opens a conversation: found by what it does (`startsScene`, companion required, not the quiet-meeting one), never by id. */
export function talkActivity(reg: Registries): Entry | undefined {
  return [...reg.activities.values()].find((a) => a.startsScene === true && a.companion === 'required' && a.pastime !== true);
}

/** Why she cannot be talked to in this room right now, or `null`. The first reason that applies wins. */
export function talkBlock(state: CampaignState, reg: Registries, unit: Unit, room: Entry): string | null {
  const open = endSlotBlock(state, reg);
  if (open) return open;
  const restricted = restrictionReason(state, reg, unit.id, 'scene');
  if (restricted) return restricted;
  const slots = reg.locations.get(room.sceneLocationId as string)?.slots as string[] | undefined;
  if (slots && !slots.includes(state.slot)) return `Closed this ${state.slot}.`;
  const talk = talkActivity(reg);
  return talk ? checkActivity(state, reg, { activityId: String(talk.id), companionId: unit.id }) : 'Nobody can be talked to here.';
}

/**
 * P10d: which plan room the panel is for. A cabin lists only who is in it and talks in its own location; the commander's
 * cabin carries the quarters notes and the room's activities; a unit cabin carries neither.
 */
export interface RoomPanelView {
  planRoomId: string;
  people: Unit[];
  sceneLocationId?: string;
  cabin?: 'unit' | 'commander';
  title?: string;
  /** The plan room's own description (a cabin is not the whole quarters). */
  description?: string;
}

/**
 * The panel of one room: who is there (with a TALK button for each named soldier) and the activities the room offers,
 * as the same cards the OPS tab shows. A read-only campaign gets the list and nothing to press.
 */
export function renderRoomPanel(
  room: Entry, state: CampaignState, ctx: HubCtx, here: Whereabout[], opts: { readOnly: boolean; onClose: () => void; view?: RoomPanelView },
): HTMLElement {
  const reg = ctx.registries;
  const view = opts.view;
  const people = view ? view.people : here.filter((w) => w.roomId === room.id)
    .map((w) => state.squad.find((u) => u.id === w.unitId))
    .filter((u): u is Unit => u !== undefined);
  const locationId = view?.sceneLocationId ?? String(room.sceneLocationId);
  const talkRoom: Entry = { ...room, sceneLocationId: locationId };
  const talk = talkActivity(reg);

  const rows = people.map((unit) => {
    const reason = opts.readOnly || unit.kind !== 'named' || !talk ? null : talkBlock(state, reg, unit, talkRoom);
    const canTalk = !opts.readOnly && unit.kind === 'named' && talk !== undefined;
    const avatar = ctx.avatar(unit);
    const button = canTalk
      ? h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-talk': unit.id, 'aria-disabled': reason !== null ? 'true' : null,
        ...analyzeNative(`activities:${String(talk!.id)}`),
        onclick: () => {
          if (reason === null) ctx.onTalk(unit.id, locationId);
        },
      }, '[ TALK ]')
      : null;
    // P14c: a quiet hour with her (the card of that activity opens the pastime picker) and the line under her name
    const quiet = pastimeActivity(reg);
    const hasQuiet = !opts.readOnly && unit.kind === 'named' && quiet !== undefined && ctx.ops.onTimeTogether !== undefined && lifeMode(state) !== 'off' && endSlotBlock(state, ctx.registries) === null;
    const quietMenu = hasQuiet ? quietHour(state, ctx, unit, quiet!) : null;
    const row = h(
      'li', { class: 'alius-room-person', 'data-unit': unit.id },
      avatar ? h('span', { class: 'alius-room-avatar' }, avatar) : null,
      renderMarker(state, reg, unit),
      h('span', { class: 'alius-room-name' }, unit.kind === 'grunt' ? `${unit.displayName} (grunt)` : unit.displayName),
      button,
      quietMenu,
      reason !== null && canTalk ? h('span', { class: 'alius-dim alius-reason' }, reason) : null,
    );
    if (unit.kind === 'named') renderHubDayLine(row, state, reg, unit.id);
    return row;
  });

  // P11: the activity cards are the OPS module's; while it is offline the room offers talk and nothing else
  const cards = opts.readOnly || lockedTabs(state, reg).has('ops') || view?.cabin === 'unit'
    ? []
    : ((room.activityIds ?? []) as string[]).map((id) => reg.activities.get(id)).filter((a): a is Entry => a !== undefined)
      .map((a) => activityCard(a, state, ctx.ops));

  // P10b: in the room with the commander's cell the notes wait: what soldiers left in the quarters, and what they pinned (P9c)
  const noteCards = room.commanderCell === true && (view === undefined || view.cabin === 'commander') ? quartersNotes(state, reg, ctx) : [];
  const title = view?.title ?? String(room.label);

  return h(
    'section',
    { class: 'alius-room-panel', 'data-room': String(room.id), ...(view ? { 'data-plan': view.planRoomId } : {}), role: 'region', 'aria-label': `${title} room` },
    h(
      'div', { class: 'alius-room-panel-head' },
      h('h2', {}, h('span', { class: 'alius-chip', ...analyzeAttrs(view?.cabin === 'unit' ? 'glossary:cabin' : view?.cabin === 'commander' ? `planRooms:${view.planRoomId}` : `hubRooms:${String(room.id)}`) }, title)),
      h('button', { type: 'button', class: 'alius-btn', 'data-close-room': '', 'aria-label': `Close ${title}`, onclick: opts.onClose }, '[X]'),
    ),
    h('p', { class: 'alius-dim' }, view?.description ?? String(room.description)),
    h('h3', {}, 'HERE'),
    people.length > 0 ? h('ul', { class: 'alius-room-people' }, ...rows) : h('p', { class: 'alius-dim' }, 'Nobody is here.'),
    ...(noteCards.length > 0 ? [h('h3', {}, 'NOTES'), ...noteCards] : []),
    ...(cards.length > 0 ? [h('h3', {}, 'ACTIVITIES'), ...cards] : []),
  );
}

/** P14c: `[ TIME TOGETHER ]` with her: a menu that opens her pastime picker; picking one holds the slot and opens the scene at its place. */
function quietHour(state: CampaignState, ctx: HubCtx, unit: Unit, activity: Entry): HTMLElement {
  const body = h('div', { class: 'alius-room-pastimes' });
  renderPastimePicker(body, { state, registries: ctx.registries, unitId: unit.id, onPick: (id) => ctx.ops.onTimeTogether?.(unit.id, id) });
  return h('details', { class: 'alius-room-quiet', 'data-quiet-hour': unit.id },
    h('summary', { class: 'alius-btn alius-option', ...analyzeAttrs(`activities:${String(activity.id)}`) }, '[ TIME TOGETHER ]'), body);
}

const unitName = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** The quarters notes (newest first, each with [GOT IT]) and the pinned notes of units with device access 2 (already read: they stay up). */
function quartersNotes(state: CampaignState, reg: Registries, ctx: HubCtx): HTMLElement[] {
  const cards = notesFor(state, 'quarters').map((n) => renderNote({
    text: n.text, unitName: unitName(state, n.unitId), hand: herHand(state, reg, n.unitId), read: n.read === true,
    ...(ctx.onReadNote ? { onRead: () => ctx.onReadNote!(n.id) } : {}), analyze: 'glossary:hand_note',
  }));
  for (const p of pinnedNotes(state, reg)) {
    for (const line of p.lines) cards.push(renderNote({ text: line, unitName: unitName(state, p.unitId), hand: herHand(state, reg, p.unitId), read: true, analyze: 'glossary:hand_note' }));
  }
  return cards;
}
