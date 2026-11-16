import type { Registries } from '../../content/types';
import { deviceAccess } from '../../engine/personal/access';
import { decorOf, pinnedNotes, wallpaperUnit } from '../../engine/personal/decor';
import type { CampaignState, DecorPart } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { defiesHint, obeyedBy } from './obey';

export interface DeviceHandlers {
  /** PEEL: the commander removes one part of her decor. */
  onPeel(unitId: string, part: DecorPart): void;
  /** CANCEL on one of her bookings. */
  onCancel(bookingId: string): void;
}

const PART_LABEL: Record<DecorPart, string> = { sticker: 'STICKER', wallpaper: 'WALLPAPER', contact: 'CONTACT' };
export const SLOT_WORD = { morning: 'MORNING', afternoon: 'AFTERNOON', evening: 'EVENING', night: 'NIGHT' } as const;

/**
 * The DEVICE part of one dossier (P9c): `ACCESS L{n} {NAME}`, her decor with [PEEL] (a faded one says so and cannot be peeled),
 * the notes she pins and her bookings with [CANCEL]. A unit with no access, no decor and no booking gets nothing. Text only.
 */
export function renderDeviceBlock(state: CampaignState, reg: Registries, unitId: string, handlers: DeviceHandlers): HTMLElement | null {
  const unit = state.squad.find((u) => u.id === unitId);
  if (!unit || unit.kind !== 'named') return null;
  const level = deviceAccess(state, reg, unitId);
  const decor = decorOf(state, unitId);
  const bookings = (state.personal?.bookings ?? []).filter((b) => b.unitId === unitId && b.status === 'booked');
  if (level === 0 && !decor && bookings.length === 0) return null;
  const live = { unitId };
  const block = h('div', { class: 'alius-device-block', 'data-device': unitId },
    h('p', { class: 'alius-device-line' },
      h('span', { class: 'alius-chip', 'data-access': unitId, ...analyzeAttrs('glossary:device_access', live) }, `ACCESS L${level} ${unit.displayName.toUpperCase()}`)));
  if (decor) {
    const faded = decor.fadedUntil !== undefined;
    const owner = wallpaperUnit(state) === unitId;
    const parts = decor.parts.filter((p) => p !== 'wallpaper' || owner || faded);
    block.append(h('div', { class: 'alius-device-decor' }, ...parts.map((part) => {
      const label = part === 'contact' ? `CONTACT: ${decor.contactName}` : PART_LABEL[part];
      return h('span', { class: 'alius-device-part', 'data-decor-part': part, ...(faded ? { 'data-faded': 'true' } : {}) },
        h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:device_access', live) }, faded ? `${label} (FADED)` : label),
        faded ? null : h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'peel', 'aria-label': `Peel ${PART_LABEL[part].toLowerCase()}`, onclick: () => handlers.onPeel(unitId, part) }, '[PEEL]'));
    })));
  }
  for (const note of pinnedNotes(state, reg).find((n) => n.unitId === unitId)?.lines ?? []) {
    block.append(h('p', { class: 'alius-device-note' }, note));
  }
  for (const b of bookings) {
    const kind = reg.bookingKinds.get(b.kindId);
    block.append(h('div', { class: 'alius-device-booking', 'data-booking': b.id },
      h('span', { class: 'alius-chip', ...analyzeAttrs('glossary:booking', { bookingId: b.id, unitId }) }, `${String(kind?.label ?? b.kindId).toUpperCase()} — DAY ${b.day} ${SLOT_WORD[b.slot]}`),
      h('button', { type: 'button', class: 'alius-btn alius-tagchip', 'data-action': 'cancel', ...analyzeNative('glossary:booking', { bookingId: b.id, unitId }), onclick: () => handlers.onCancel(b.id) }, '[CANCEL]'),
      obeyedBy(state, unitId) !== null ? defiesHint(obeyedBy(state, unitId)!) : null));
  }
  return block;
}
