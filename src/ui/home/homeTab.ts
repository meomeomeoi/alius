import type { Registries } from '../../content/types';
import { clockText } from '../../engine/calendar';
import { isLiving } from '../../engine/economy';
import { handOf } from '../../engine/hand';
import { notesFor } from '../../engine/notes';
import { deviceAccess } from '../../engine/personal/access';
import { decorOf, pinnedNotes, wallpaperUnit } from '../../engine/personal/decor';
import type { CampaignState, DecorPart, Unit } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import type { StAdapter } from '../../st/adapter';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import type { RuleChipHandlers } from '../bonds/chips';
import { h } from '../dom';
import { motionReduced, visualFlags } from '../motion';
import { renderNote } from '../notes/note';
import { renderRuleNote, ruleNotesFor } from '../notes/ruleNote';
import { portraitOptions, unitPortrait } from '../portrait/portrait';

export interface HomeCtx {
  getState: () => CampaignState | null;
  registries: Registries;
  st: StAdapter;
  settings: () => AliusSettings;
  /** The commander read a stored note (the app dispatches `notes/read`). */
  onReadNote(id: string): void;
  /** Peel one part of her decor: the app asks first (a confirm) and dispatches `device/remove_decor`. Absent = no buttons. */
  onPeel?(unitId: string, part: DecorPart): void;
  /** [SIGN] / [NEGOTIATE] / [DON'T SIGN] on a rule she proposed. */
  rule: RuleChipHandlers;
}

/** The unit whose decor is fading and still has the wallpaper part: the wallpaper shows faded, as a memory of her. */
function fadedWallpaperUnit(state: CampaignState): string | null {
  let best: { id: string; affinity: number } | null = null;
  for (const u of state.squad) {
    const d = decorOf(state, u.id);
    if (!d || d.fadedUntil === undefined || !d.parts.includes('wallpaper') || !isLiving(u)) continue;
    const affinity = state.relations[u.id]?.affinity ?? -Infinity;
    if (best === null || affinity > best.affinity) best = { id: u.id, affinity };
  }
  return best?.id ?? null;
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/**
 * The PDA's HOME view (P10b §5): her wallpaper behind everything, the day and slot, one ACCESS line per soldier who has access to
 * the commander's device, and every note she left in her own hand (rules she proposed or signed, notes she pinned, quarters notes
 * and notes pushed under the door). Stickers are drawn by the shell on the casing (`device/marks.ts`), never here.
 */
export function renderHomeTab(host: HTMLElement, ctx: HomeCtx): void {
  host.replaceChildren();
  const state = ctx.getState();
  if (!state) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
    return;
  }
  const reg = ctx.registries;
  const settings = ctx.settings();
  const readable = settings.readableMode;
  const motion = visualFlags(settings).motion;

  // ---- the wallpaper: the owner's dithered portrait behind the view (never an image in readable mode: a caption says whose it is)
  const owner = wallpaperUnit(state);
  const memory = owner === null ? fadedWallpaperUnit(state) : null;
  const wallpaperId = owner ?? memory;
  const wallpaperUnitObj = wallpaperId === null ? undefined : state.squad.find((u) => u.id === wallpaperId);
  let wallpaper: HTMLElement | null = null;
  let caption: HTMLElement | null = null;
  if (wallpaperUnitObj) {
    if (readable) caption = h('p', { class: 'alius-wallpaper-caption alius-dim' }, `WALLPAPER: ${wallpaperUnitObj.displayName.toUpperCase()}`);
    else {
      const portrait = unitPortrait(ctx.st, wallpaperUnitObj, portraitOptions(settings, 256));
      if (portrait) {
        wallpaper = h('div', { class: 'alius-wallpaper', 'data-unit': wallpaperUnitObj.id, 'aria-hidden': 'true', ...(memory !== null ? { 'data-faded': 'true' } : {}) }, portrait);
      }
    }
  }

  // ---- the lines of access, and what can be peeled
  const named: Unit[] = state.squad.filter((u) => u.kind === 'named' && isLiving(u));
  const lines = named.flatMap((u) => {
    const level = deviceAccess(state, reg, u.id);
    if (level < 1) return [];
    const decor = decorOf(state, u.id);
    const peelable = ctx.onPeel !== undefined && decor !== null && decor.fadedUntil === undefined && decor.parts.includes('sticker');
    return [h(
      'p', { class: 'alius-home-access' },
      h('span', { class: 'alius-chip', 'data-access': u.id, ...analyzeAttrs('glossary:device_access', { unitId: u.id }) }, `ACCESS L${level} ${u.displayName.toUpperCase()}`),
      peelable
        ? h('button', {
          type: 'button', class: 'alius-btn alius-option', 'data-action': 'peel-sticker', 'data-unit': u.id, 'aria-label': `Peel ${u.displayName}'s sticker`,
          ...analyzeNative('glossary:device_marks'), onclick: () => ctx.onPeel!(u.id, 'sticker'),
        }, '[PEEL STICKER]')
        : null,
    )];
  });
  const change = owner !== null && ctx.onPeel !== undefined
    ? h('button', {
      type: 'button', class: 'alius-btn alius-option', 'data-action': 'change-wallpaper', 'data-unit': owner, ...analyzeNative('glossary:device_marks'),
      onclick: () => ctx.onPeel!(owner, 'wallpaper'),
    }, '[CHANGE WALLPAPER]')
    : null;

  // ---- the notes, each in her hand
  const notes: HTMLElement[] = [];
  const answers = ctx.rule;
  for (const rule of ruleNotesFor(state)) notes.push(renderRuleNote(state, reg, rule, answers, { motion: !motionReduced(settings) }));
  for (const p of pinnedNotes(state, reg)) {
    for (const line of p.lines) notes.push(renderNote({ text: line, unitName: nameOf(state, p.unitId), hand: handOf(state, reg, p.unitId), read: true, analyze: 'glossary:hand_note' }));
  }
  for (const n of [...notesFor(state, 'quarters'), ...notesFor(state, 'door')]) {
    notes.push(renderNote({
      text: n.text, unitName: nameOf(state, n.unitId), hand: handOf(state, reg, n.unitId), read: n.read === true, onRead: () => ctx.onReadNote(n.id), analyze: 'glossary:hand_note',
    }));
  }

  host.append(h(
    'section', { class: 'alius-section alius-home' },
    ...(wallpaper ? [wallpaper] : []),
    h('header', { class: 'alius-home-head' }, h('h2', {}, '[ HOME ]'), h('span', { class: 'alius-home-clock alius-stat', ...analyzeAttrs('glossary:slots') }, clockText(state.day, state.slot))),
    ...(caption ? [caption] : []),
    ...(change ? [h('p', {}, change)] : []),
    ...lines,
    h('div', { class: 'alius-home-notes' }, h('h3', {}, 'NOTES'), ...(notes.length > 0 ? notes : [h('p', { class: 'alius-dim' }, 'NOTHING IS PINNED.')])),
  ));
}
