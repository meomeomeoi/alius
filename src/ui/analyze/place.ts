/**
 * Where the analysis panel goes: right of and below the anchor by `gap`, flipped left/up when it
 * would overflow, and never closer than 4 px to an edge (on a screen too small for it, the top-left
 * corner wins).
 */
const MARGIN = 4;

export function placePanel(
  anchor: { x: number; y: number },
  size: { w: number; h: number },
  viewport: { w: number; h: number },
  gap = 12,
): { left: number; top: number } {
  let left = anchor.x + gap;
  let top = anchor.y + gap;
  if (left + size.w > viewport.w - MARGIN) left = anchor.x - gap - size.w;
  if (top + size.h > viewport.h - MARGIN) top = anchor.y - gap - size.h;
  left = Math.max(MARGIN, Math.min(left, viewport.w - size.w - MARGIN));
  top = Math.max(MARGIN, Math.min(top, viewport.h - size.h - MARGIN));
  return { left, top };
}
