/**
 * Her dossier's DYNAMIC section (P15, plan R25): what she holds, as far as the commander may read it. The frame, the hold as a band (the number only with "show raw
 * values"), the domains she holds and those she may claim, the tracks she leads as bands (never xp), the vow, her reading of the commander's position in HER word,
 * the cards she is waiting on (a claim, a milestone, a return offer), and the way out: a button that opens the exit card with its cost as a word for each route.
 * Below the rows the body map (`bodyMapFor` over `Knowledge`: an unrevealed zone is a "?"; readable mode draws its list only).
 * Immersive mode (`dynamicHidden`) draws none of that: the cards in a scene or a thread, and the line on the hub, still show, and her dossier keeps one row, `[ END IT ]`, which opens the
 * exit card with no cost word (saying it is over is always possible, spec E2). Nothing here names the commander by a pronoun or says what the commander feels. Nothing is drawn for a
 * grunt, a woman who holds nothing, or while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import type { Knowledge } from '../../analysis/knowledge';
import { frameRank } from '../../engine/blocking/state';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { ExitMeans } from '../../engine/dynamic/exit';
import { dynamicOf } from '../../engine/dynamic/state';
import type { ExitRoute } from '../../engine/dynamic/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import { bodyMapFor, renderBodyMap } from './bodyMap';
import { drawClaimCards, drawMilestoneCards, drawReturnCards, renderExitCard, type ClaimAnswer, type ReturnAnswer } from './cards';
import { plainDraft } from '../../content/draft';

/** What the section hands back to the app (every one optional: a surface without a controller draws the section without acting). */
export interface DynamicSectionActions {
  answerMilestone?(milestoneId: string, answer: 'accept' | 'refuse'): void;
  answerClaim?(claimId: string, answer: ClaimAnswer): void;
  answerReturn?(answer: ReturnAnswer): void;
  exit?(unitId: string, route: ExitRoute, opts?: { toUnitId?: string; means?: ExitMeans }): void;
  requestTransfer?(unitId: string): void;
}

export interface DynamicSectionCtx {
  state: CampaignState;
  reg: Registries;
  unitId: string;
  /** What the commander may read: everything the section shows comes from `knowledge.dynamic` (raw values and immersive mode are its). */
  knowledge: Knowledge;
  /** Immersive mode: nothing of the section is drawn but the `[ END IT ]` row. */
  hidden: boolean;
  /** Readable mode: the body map is its list alone. */
  readable?: boolean;
  actions?: DynamicSectionActions;
  /** The Leash and punishment paths of the dossier (the exit card's means). */
  onPunish?: (unitId: string, measure: string, days?: number) => void;
  onLeash?: (unitId: string) => void;
  /** Redraws the surface the section sits on (the dossier), after a means changed the state. */
  onChanged?: () => void;
}

/** The exit cards that are open, by campaign and unit (the dossier is rebuilt on every refresh, so the choice is kept here; the campaign's salt keeps another chat's card closed). */
const exitOpen = new Set<string>();
const exitKey = (state: CampaignState, unitId: string): string => `${state.dynamic?.salt ?? 0}|${unitId}`;

/** Tests only. */
export function resetDynamicSection(): void {
  exitOpen.clear();
}

/**
 * Draws the section into `host` (replacing what it held); nothing at all when it has nothing to show or immersive mode is on. Returns whether anything was drawn.
 */
export function renderDynamicSection(host: HTMLElement, ctx: DynamicSectionCtx): boolean {
  const { state, reg, unitId } = ctx;
  host.replaceChildren();
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named') return false;
  const view = ctx.hidden ? null : ctx.knowledge.dynamic(unitId, reg);
  const live = { unitId };
  const key = exitKey(state, unitId);
  const exitHost = h('div', { class: 'alius-dyn-exit' });
  // a means or a route changes the state: the surface redraws from it (the dossier is rebuilt); with no surface the section draws itself again
  const redraw = (): void => {
    if (ctx.onChanged !== undefined) ctx.onChanged();
    else renderDynamicSection(host, ctx);
  };
  const drawExit = (costWords: boolean): void => {
    exitHost.replaceChildren();
    if (!exitOpen.has(key)) {
      exitHost.append(h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-action': 'dyn-exit', ...analyzeNative('glossary:dynamic_exit', live),
        onclick: () => {
          exitOpen.add(key);
          drawExit(costWords);
        },
      }, '[ END IT ]'));
      return;
    }
    renderExitCard(exitHost, {
      state, reg, unitId, costWords,
      onExit: (route, opts) => {
        exitOpen.delete(key);
        ctx.actions?.exit?.(unitId, route, opts);
        redraw();
      },
      means: {
        punish: (measure, days) => {
          ctx.onPunish?.(unitId, measure, days);
          redraw();
        },
        leash: () => {
          ctx.onLeash?.(unitId);
          redraw();
        },
        request: () => {
          ctx.actions?.requestTransfer?.(unitId);
          redraw();
        },
      },
      onClose: () => {
        exitOpen.delete(key);
        drawExit(costWords);
      },
    });
  };
  // she can be left only once she holds something (play or beyond); a former holder at `equal` has nothing to end
  const holds = dynamicOn(state, reg) && frameRank(dynamicOf(state, unitId)?.frame ?? 'equal') >= frameRank('play');
  if (ctx.hidden) {
    // immersive: no frame, band, body map or cost word; the one row that ends it
    if (!holds) return false;
    drawExit(false);
    host.append(exitHost);
    host.classList.add('alius-dynamic-section');
    host.setAttribute('data-dynamic-section', unitId);
    return true;
  }
  if (view === null || view.band === undefined) return false; // no band: she holds nothing, or the dynamic is off
  const chip = (text: string, address: string, attrs: Record<string, string> = {}): HTMLElement => h('span', { class: 'alius-chip', ...attrs, ...analyzeAttrs(address, live) }, text);
  const row = (label: string, ...parts: Child[]): HTMLElement => h('p', { class: 'alius-dyn-line' }, `${label} `, ...parts);
  const between = (items: HTMLElement[]): Child[] => items.flatMap((c, i): Child[] => (i === 0 ? [c] : [' ', c]));

  const label = (registry: 'dynamicDomains' | 'dynamicTracks', id: string): string => String(reg[registry].get(id)?.label ?? id).toUpperCase();
  const claimed = view.domains.filter((d) => d.claimed);
  const mayClaim = view.domains.filter((d) => !d.claimed);
  const lines: HTMLElement[] = [
    row('FRAME', chip(String(view.frame ?? '').toUpperCase(), 'glossary:frame', { 'data-dyn-frame': '' }), ...(view.sworn ? [' ', chip('SWORN', 'glossary:vow', { 'data-dyn-vow': '' })] : [])),
    row('HOLD', chip(`${view.band.toUpperCase()}${view.raw !== undefined ? ` (${view.raw})` : ''}`, 'glossary:hold', { 'data-dyn-hold': '' })),
  ];
  if (claimed.length > 0) {
    lines.push(row('DOMAINS', ...between(claimed.map((d) => chip(`${d.label.toUpperCase()}${d.partial === true ? ' (PARTLY)' : ''}`, `dynamicDomains:${d.id}`, { 'data-dyn-domain': d.id })))));
  }
  if (mayClaim.length > 0) {
    lines.push(row('SHE MAY CLAIM', ...between(mayClaim.map((d) => chip(d.label.toUpperCase(), `dynamicDomains:${d.id}`, { 'data-dyn-may-claim': d.id })))));
  }
  if (view.tracks.length > 0) {
    lines.push(row('PRACTICE', ...between(view.tracks.map((t) => chip(`${label('dynamicTracks', t.id)}: ${t.band.toUpperCase()}`, `dynamicTracks:${t.id}`, { 'data-dyn-track': t.id })))));
  }
  if (view.reading !== undefined) {
    lines.push(row('HER READING', chip(view.reading, 'glossary:her_reading', { 'data-dyn-reading': '' })));
  }
  if (view.signs.length > 0) {
    lines.push(row('SHE SEEMS', ...between(view.signs.map((sign) => chip(sign, 'glossary:dynamic', { 'data-dyn-sign': '' })))));
  }
  if (view.compromat.length > 0) {
    lines.push(row('SHE KEEPS', ...between(view.compromat.map((f) => chip(plainDraft(f.text).trim(), 'glossary:compromat', { 'data-dyn-compromat': f.id })))));
  }
  if (view.knownLevels.length > 0) {
    const who = (id: string): string => (state.squad.find((u) => u.id === id)?.displayName ?? id).toUpperCase();
    const word = { suspects_close: 'HAS NOTICED SOMETHING', suspects_dynamic: 'SUSPECTS', knows_dynamic: 'KNOWS' } as const;
    lines.push(row('WHO KNOWS', ...between(view.knownLevels.map((k) => chip(`${who(k.observerId)}: ${word[k.level]}`, 'glossary:dynamic', { 'data-dyn-known': k.observerId })))));
  }

  const cards = h('div', { class: 'alius-dyn-cards' });
  const pick = (c: { unitId: string }): boolean => c.unitId === unitId;
  const slots = [h('div', { class: 'alius-milestone-cards' }), h('div', { class: 'alius-claim-cards' }), h('div', { class: 'alius-return-cards' })];
  cards.append(...slots);
  drawMilestoneCards(slots[0], state, reg, pick, (id, a) => ctx.actions?.answerMilestone?.(id, a));
  drawClaimCards(slots[1], state, reg, pick, (id, a) => ctx.actions?.answerClaim?.(id, a));
  drawReturnCards(slots[2], state, reg, pick, (a) => ctx.actions?.answerReturn?.(a));

  if (holds) drawExit(true);
  const map = bodyMapFor(state, reg, ctx.knowledge, unitId, ctx.readable === true);
  const mapHost = h('div', { class: 'alius-dyn-bodymap' });
  if (map.zones.length > 0) renderBodyMap(mapHost, map);

  host.append(h('h4', {}, 'DYNAMIC'), ...lines, ...(map.zones.length > 0 ? [mapHost] : []), cards, exitHost);
  host.classList.add('alius-dynamic-section');
  host.setAttribute('data-dynamic-section', unitId);
  return true;
}
