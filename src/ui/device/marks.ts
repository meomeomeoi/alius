import type { Entry, Registries } from '../../content/types';
import { fnv1a } from '../../engine/hub';
import { decorOf } from '../../engine/personal/decor';
import type { CampaignState } from '../../engine/state/types';
import { likesOf } from '../../engine/development/profile';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Her sticker: the first `stickerArt` entry whose `likeTags` meet her likes (case-insensitive), else `fnv1a(unitId) % n` in registry order. */
export function stickerFor(state: CampaignState, reg: Registries, unitId: string): Entry | null {
  const unit = state.squad.find((u) => u.id === unitId);
  const all = [...reg.stickerArt.values()];
  if (!unit || unit.kind !== 'named' || all.length === 0) return null;
  const likes = new Set(likesOf(unit).map((l) => l.toLowerCase()));
  const tagged = all.find((e) => ((e.likeTags as string[] | undefined) ?? []).some((t) => likes.has(t.toLowerCase())));
  return tagged ?? all[fnv1a(unitId) % all.length];
}

/** The art of a sticker: an inline svg whose path is set with `setAttribute`, or a glyph as text. Never markup. */
function art(entry: Entry): Node {
  if (typeof entry.svg === 'string') {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', entry.svg);
    path.setAttribute('fill', 'currentColor');
    svg.append(path);
    return svg;
  }
  return document.createTextNode(String(entry.glyph ?? ''));
}

/**
 * Draws the stickers of the soldiers whose decor has the `sticker` part into `layer` (P10b §5), in squad order, one on each spot
 * of the skin (`stickerSpots`, percent of the device); extra stickers and a skin without spots show none. A fading decor is drawn
 * faded (`data-faded`); a decor whose fade is over is gone. The layer is replaced entirely: call it on every refresh. The casing
 * itself is dressed once and not touched here.
 */
export function renderMarks(layer: HTMLElement, state: CampaignState, reg: Registries, skin: Entry): void {
  layer.replaceChildren();
  const spots = (skin.stickerSpots as Array<{ x: number; y: number; rot: number }> | undefined) ?? [];
  let next = 0;
  for (const unit of state.squad) {
    if (next >= spots.length) break;
    const decor = decorOf(state, unit.id);
    if (!decor || !decor.parts.includes('sticker')) continue;
    const sticker = stickerFor(state, reg, unit.id);
    if (!sticker) continue;
    const spot = spots[next++];
    const mark = document.createElement('span');
    mark.className = 'alius-sticker-mark';
    mark.dataset.unit = unit.id;
    mark.dataset.sticker = String(sticker.id);
    if (decor.fadedUntil !== undefined) mark.dataset.faded = 'true';
    mark.style.left = `${spot.x}%`;
    mark.style.top = `${spot.y}%`;
    mark.style.transform = `rotate(${spot.rot}deg)`;
    mark.append(art(sticker));
    layer.append(mark);
  }
}
