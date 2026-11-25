/**
 * P10e-e Task 16: the level (weight.html `#vial`): a spirit level of glass and brass, the one instrument of this game. The markup is the
 * prototype's, as it is (brass caps with screws, the amber liquid and its gradient, the engraved scale, the sheen, the elastic bubble, the
 * tolerance marks that light when level, the warm glow under it); its ids are prefixed (`alius-weight-`), because an SVG's ids are the
 * document's and a page may draw two levels. Its CSS is `css/68-weight.css` (scaled 1.3, 186 px above the bottom). `render` (weight.ts) moves
 * the bubble, the marks, the glow and the liquid, and tilts the whole level with the frame at .35 of its angle.
 */

/** The prototype's ids, prefixed: `$('#vBubble')` in weight.ts reads `VIAL_IDS.vBubble`. */
export const VIAL_IDS = {
  brass: 'alius-weight-brass', liquid: 'alius-weight-liquid', sheen: 'alius-weight-sheen', bubble: 'alius-weight-bubble', soft: 'alius-weight-soft', tube: 'alius-weight-tube',
} as const;

/** The level's markup (weight.html, lines "the level" to the end of its svg), ids prefixed. */
export const VIAL_SVG = `<svg viewBox="0 0 460 70" width="460" height="70">
  <defs>
    <linearGradient id="${VIAL_IDS.brass}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5a3f17"/><stop offset=".22" stop-color="#e8c77c"/><stop offset=".45" stop-color="#a77b33"/><stop offset=".7" stop-color="#6a4a1a"/><stop offset="1" stop-color="#c9a15a"/>
    </linearGradient>
    <linearGradient id="${VIAL_IDS.liquid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3c66a" stop-opacity=".5"/><stop offset=".55" stop-color="#c88426" stop-opacity=".62"/><stop offset="1" stop-color="#7a4210" stop-opacity=".78"/>
    </linearGradient>
    <linearGradient id="${VIAL_IDS.sheen}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".18" stop-color="#fff" stop-opacity=".08"/><stop offset=".7" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".18"/>
    </linearGradient>
    <radialGradient id="${VIAL_IDS.bubble}" cx=".5" cy=".42" r=".6">
      <stop offset="0" stop-color="#fffbe9" stop-opacity=".18"/><stop offset=".62" stop-color="#fff6d8" stop-opacity=".32"/><stop offset=".86" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <filter id="${VIAL_IDS.soft}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3"/></filter>
    <clipPath id="${VIAL_IDS.tube}"><rect x="40" y="16" width="380" height="38" rx="19"/></clipPath>
  </defs>
  <!-- the glow it casts when level -->
  <ellipse data-v="vGlow" cx="230" cy="58" rx="170" ry="10" fill="#f2b452" opacity="0" filter="url(#${VIAL_IDS.soft})"/>
  <!-- the tube -->
  <rect x="40" y="16" width="380" height="38" rx="19" fill="rgba(10,8,14,.35)"/>
  <g clip-path="url(#${VIAL_IDS.tube})">
    <rect data-v="vLiquid" x="30" y="16" width="400" height="38" fill="url(#${VIAL_IDS.liquid})"/>
    <!-- engraved scale -->
    <g data-v="vTicks" stroke="#3a2205" stroke-opacity=".55" stroke-width="1"></g>
    <g data-v="vMarks"><line x1="0" y1="16" x2="0" y2="54" stroke="#ffe7a8" stroke-width="1.6"/><line x1="0" y1="16" x2="0" y2="54" stroke="#ffe7a8" stroke-width="1.6"/></g>
    <!-- the bubble: elastic, it stretches when it moves fast -->
    <g data-v="vBubble"><ellipse rx="30" ry="12" fill="url(#${VIAL_IDS.bubble})"/><ellipse cx="-8" cy="-6" rx="10" ry="2.6" fill="#fff" opacity=".8"/></g>
    <rect x="40" y="16" width="380" height="38" rx="19" fill="url(#${VIAL_IDS.sheen})"/>
  </g>
  <rect x="40.5" y="16.5" width="379" height="37" rx="18.5" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>
  <!-- brass ends -->
  <g><rect x="18" y="10" width="34" height="50" rx="9" fill="url(#${VIAL_IDS.brass})"/><rect x="18" y="10" width="34" height="50" rx="9" fill="none" stroke="#2a1c08" stroke-opacity=".6"/>
    <circle cx="29" cy="35" r="3.2" fill="#3a2a10"/><line x1="26.8" y1="35" x2="31.2" y2="35" stroke="#d7b46a" stroke-width="1"/></g>
  <g><rect x="408" y="10" width="34" height="50" rx="9" fill="url(#${VIAL_IDS.brass})"/><rect x="408" y="10" width="34" height="50" rx="9" fill="none" stroke="#2a1c08" stroke-opacity=".6"/>
    <circle cx="431" cy="35" r="3.2" fill="#3a2a10"/><line x1="431" y1="32.8" x2="431" y2="37.2" stroke="#d7b46a" stroke-width="1"/></g>
</svg>`;

/** The level's parts the frame moves (the prototype's `#vGlow`, `#vLiquid`, `#vTicks`, `#vMarks`, `#vBubble`). */
export type VialPart = 'vGlow' | 'vLiquid' | 'vTicks' | 'vMarks' | 'vBubble';

/**
 * Builds the level: its glass bed (a backdrop blur, as the prototype's `.glassbed`) and its SVG, with the engraved scale drawn (the
 * prototype's IIFE "the engraved scale of the level", as it is). Returns the box and its parts.
 */
export function buildVial(): { box: HTMLElement; parts: Record<VialPart, Element> } {
  const box = document.createElement('div');
  box.className = 'alius-weight-vial';
  box.setAttribute('aria-hidden', 'true');
  const bed = document.createElement('div');
  bed.className = 'glassbed';
  box.append(bed);
  box.insertAdjacentHTML('beforeend', VIAL_SVG);
  const part = (k: VialPart): Element => box.querySelector(`[data-v="${k}"]`)!;
  const parts = { vGlow: part('vGlow'), vLiquid: part('vLiquid'), vTicks: part('vTicks'), vMarks: part('vMarks'), vBubble: part('vBubble') };
  // the engraved scale of the level
  ((g: Element) => { for (let x = 60; x <= 400; x += 10) { const l = document.createElementNS('http://www.w3.org/2000/svg', 'line'); const big = (x - 230) % 50 === 0; l.setAttribute('x1', String(x)); l.setAttribute('x2', String(x)); l.setAttribute('y1', '16'); l.setAttribute('y2', big ? '26' : '21'); g.appendChild(l); } })(parts.vTicks);
  return { box, parts };
}
