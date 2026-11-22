/**
 * Her dossier's DYNAMIC section (P15, plan R25): what she holds, as far as the commander may read it. The frame, the hold as a band (the number only with "show raw
 * values"), the domains she holds and those she may claim, the tracks she leads as bands (never xp), the vow, her reading of the commander's position in HER word,
 * the cards she is waiting on (a claim, a milestone, a return offer), and the way out: a button that opens the exit card with its cost as a word for each route.
 * Immersive mode (`dynamicHidden`) draws none of it: the cards in a scene or a thread, and the line on the hub, still show. Nothing here names the commander by a
 * pronoun or says what the commander feels. Nothing is drawn for a grunt, a woman who holds nothing, or while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import { domainRows, standing } from '../../engine/dynamic/capabilities';
import { holderOfDomain, meets } from '../../engine/dynamic/domains';
import type { ExitMeans } from '../../engine/dynamic/exit';
import { dynamicOn } from '../../engine/dynamic/gate';
import { holdBandOf } from '../../engine/dynamic/hold';
import { dynamicOf } from '../../engine/dynamic/state';
import { trackOpen } from '../../engine/dynamic/tracks';
import type { ExitRoute } from '../../engine/dynamic/types';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h, type Child } from '../dom';
import { drawClaimCards, drawMilestoneCards, drawReturnCards, renderExitCard, type ClaimAnswer, type ReturnAnswer } from './cards';

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
  /** "Show raw values". */
  raw: boolean;
  /** Immersive mode: nothing of the section is drawn. */
  hidden: boolean;
  actions?: DynamicSectionActions;
  /** The Leash and punishment paths of the dossier (the exit card's means). */
  onPunish?: (unitId: string, measure: string, days?: number) => void;
  onLeash?: (unitId: string) => void;
  /** Redraws the surface the section sits on (the dossier), after a means changed the state. */
  onChanged?: () => void;
}

/** What the section reads of her dynamic (Task 46 moves it behind `Knowledge.dynamic`). */
export interface DynamicSectionView {
  frame: string;
  band: string;
  hold: number;
  domains: Array<{ id: string; label: string; partial: boolean }>;
  mayClaim: Array<{ id: string; label: string }>;
  tracks: Array<{ id: string; label: string; word: string }>;
  sworn: boolean;
  /** Her word for how she reads the commander's position; absent until she has read something. */
  reading?: string;
}

/** The words for a track's level (1 to 5): a band, never xp. */
export const TRACK_WORDS = ['', 'a little', 'some', 'a good deal', 'deeply', 'completely'] as const;
const LEADING_TRACKS = 3;

export function dynamicSectionView(state: CampaignState, reg: Registries, unitId: string): DynamicSectionView | null {
  const dyn = dynamicOf(state, unitId);
  if (!dynamicOn(state, reg) || dyn === undefined) return null;
  const label = (registry: 'dynamicFrames' | 'holdBands' | 'dynamicTracks', id: string): string => String(reg[registry].get(id)?.label ?? id);
  const tracks = Object.entries(dyn.tracks)
    .filter(([id, t]) => t.level >= 1 && trackOpen(state, reg, unitId, id))
    .sort((a, b) => b[1].level - a[1].level)
    .slice(0, LEADING_TRACKS)
    .map(([id, t]) => ({ id, label: label('dynamicTracks', id), word: TRACK_WORDS[t.level] }));
  const open = new Set(state.dynamic!.open.claims.filter((c) => c.unitId === unitId).map((c) => c.domainId));
  const held = new Set(dyn.domains.map((d) => d.id));
  return {
    frame: label('dynamicFrames', dyn.frame), band: label('holdBands', holdBandOf(reg, dyn.hold)), hold: dyn.hold,
    domains: dyn.domains.map((d) => ({ id: d.id, label: String(reg.dynamicDomains.get(d.id)?.label ?? d.id), partial: !standing(d, state.day) || d.partialUntil !== undefined })),
    mayClaim: domainRows(reg)
      .filter((e) => !held.has(e.id) && !open.has(e.id) && meets(reg, dyn, e) && holderOfDomain(state, e.id, unitId) === null)
      .map((e) => ({ id: e.id, label: e.label })),
    tracks, sworn: dyn.sworn !== undefined,
    ...(dyn.readOf.updates > 0 ? { reading: String(reg.positionRegions.get(dyn.readOf.region)?.label ?? dyn.readOf.region) } : {}),
  };
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
  const view = unit?.kind === 'named' && !ctx.hidden ? dynamicSectionView(state, reg, unitId) : null;
  if (unit === undefined || view === null) return false;
  const live = { unitId };
  const key = exitKey(state, unitId);
  const chip = (text: string, address: string, attrs: Record<string, string> = {}): HTMLElement => h('span', { class: 'alius-chip', ...attrs, ...analyzeAttrs(address, live) }, text);
  const row = (label: string, ...parts: Child[]): HTMLElement => h('p', { class: 'alius-dyn-line' }, `${label} `, ...parts);
  const between = (items: HTMLElement[]): Child[] => items.flatMap((c, i): Child[] => (i === 0 ? [c] : [' ', c]));

  const lines: HTMLElement[] = [
    row('FRAME', chip(view.frame.toUpperCase(), 'glossary:frame', { 'data-dyn-frame': '' }), ...(view.sworn ? [' ', chip('SWORN', 'glossary:vow', { 'data-dyn-vow': '' })] : [])),
    row('HOLD', chip(`${view.band.toUpperCase()}${ctx.raw ? ` (${Math.round(view.hold)})` : ''}`, 'glossary:hold', { 'data-dyn-hold': '' })),
  ];
  if (view.domains.length > 0) {
    lines.push(row('DOMAINS', ...between(view.domains.map((d) => chip(`${d.label.toUpperCase()}${d.partial ? ' (PARTLY)' : ''}`, `dynamicDomains:${d.id}`, { 'data-dyn-domain': d.id })))));
  }
  if (view.mayClaim.length > 0) {
    lines.push(row('SHE MAY CLAIM', ...between(view.mayClaim.map((d) => chip(d.label.toUpperCase(), `dynamicDomains:${d.id}`, { 'data-dyn-may-claim': d.id })))));
  }
  if (view.tracks.length > 0) {
    lines.push(row('PRACTICE', ...between(view.tracks.map((t) => chip(`${t.label.toUpperCase()}: ${t.word.toUpperCase()}`, `dynamicTracks:${t.id}`, { 'data-dyn-track': t.id })))));
  }
  if (view.reading !== undefined) {
    lines.push(row('HER READING', chip(view.reading, 'glossary:her_reading', { 'data-dyn-reading': '' })));
  }

  const cards = h('div', { class: 'alius-dyn-cards' });
  const pick = (c: { unitId: string }): boolean => c.unitId === unitId;
  const slots = [h('div', { class: 'alius-milestone-cards' }), h('div', { class: 'alius-claim-cards' }), h('div', { class: 'alius-return-cards' })];
  cards.append(...slots);
  drawMilestoneCards(slots[0], state, reg, pick, (id, a) => ctx.actions?.answerMilestone?.(id, a));
  drawClaimCards(slots[1], state, reg, pick, (id, a) => ctx.actions?.answerClaim?.(id, a));
  drawReturnCards(slots[2], state, reg, pick, (a) => ctx.actions?.answerReturn?.(a));

  const exitHost = h('div', { class: 'alius-dyn-exit' });
  // a means or a route changes the state: the surface redraws from it (the dossier is rebuilt); with no surface the section draws itself again
  const redraw = (): void => {
    if (ctx.onChanged !== undefined) ctx.onChanged();
    else renderDynamicSection(host, ctx);
  };
  const drawExit = (): void => {
    exitHost.replaceChildren();
    if (!exitOpen.has(key)) {
      exitHost.append(h('button', {
        type: 'button', class: 'alius-btn alius-option', 'data-action': 'dyn-exit', ...analyzeNative('glossary:dynamic_exit', live),
        onclick: () => {
          exitOpen.add(key);
          drawExit();
        },
      }, '[ END IT ]'));
      return;
    }
    renderExitCard(exitHost, {
      state, reg, unitId,
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
        drawExit();
      },
    });
  };
  drawExit();

  host.append(h('h4', {}, 'DYNAMIC'), ...lines, cards, exitHost);
  host.classList.add('alius-dynamic-section');
  host.setAttribute('data-dynamic-section', unitId);
  return true;
}
