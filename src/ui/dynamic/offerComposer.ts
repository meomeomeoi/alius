import type { Registries } from '../../content/types';
import type { Attitude } from '../../engine/dynamic/expectations';
import { offerChoices, type OfferChoice, type OfferComposition } from '../../engine/dynamic/offer';
import { OFFER_TABS, type OfferAnswer, type OfferTab } from '../../engine/dynamic/types';
import { isLiving } from '../../engine/economy';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

/** What the composer needs (P15, plan R20): her, what the gate lets through (`offerChoices`), and what to do with the offer. */
export interface OfferComposerCtx {
  state: CampaignState;
  reg: Registries;
  unitId: string;
  choices: Record<OfferTab, OfferChoice[]>;
  /** The composition (one or two entries in all) and the `[ ASK IN RETURN ]` toggle. Called once; the composer has closed its own state first. */
  onSend: (composition: OfferComposition, askInReturn: boolean) => void;
  onClose: () => void;
  /** The element the choice and the open tab are kept on, when `host` is rebuilt on every draw (default: `host`). */
  memory?: HTMLElement;
}

/** The words of a tab, as the commander reads them. */
const TAB_LABEL: Readonly<Record<OfferTab, string>> = {
  part: 'PART', posture: 'POSTURE', contact: 'CONTACT', service: 'SERVICE', time: 'TIME', role: 'ROLE', endurance: 'ENDURANCE',
};
const ATTITUDE_WORD: Readonly<Record<Attitude, string>> = { craves: 'CRAVES', enjoys: 'ENJOYS', indifferent: 'INDIFFERENT', dislikes: 'DISLIKES' };
const ANSWER_WORD: Readonly<Record<OfferAnswer, string>> = { accepted: 'ACCEPTED', corrected: 'CORRECTED', mocked: 'MOCKED', refused: 'REFUSED', tonight: 'TONIGHT' };

/** What the composer remembers across a redraw: the tab that is open, what is chosen and the toggle. Keyed by the element it is drawn into. */
interface Memory { tab: OfferTab; picks: Array<{ tab: OfferTab; id: string }>; ask: boolean; note: string }
const memories = new WeakMap<HTMLElement, Memory>();

/** The address of an entry for the analysis panel: the registry the entry comes from, or the glossary's offer for the closed lists (time, endurance). */
function addressOf(tab: OfferTab, id: string): string {
  switch (tab) {
    case 'part': return `worshipTargets:${id}`;
    case 'posture': return `blockingPostures:${id}`;
    case 'contact':
    case 'role': return `blockingContacts:${id}`;
    case 'service': return `blockingActivities:${id}`;
    default: return 'glossary:offer';
  }
}

/**
 * The offer composer (P15, plan R20, spec §15.7): a card in her voice with the seven tabs (part, posture, contact, service, time, role, endurance), the entries the gate lets through
 * (nothing else is ever drawn), one or two chosen entries in all, the `[ ASK IN RETURN ]` toggle and SEND / CANCEL. A worship target says what the commander knows of her attitude to
 * it (the word, or a "?" while nothing has shown it); nothing else says anything of her. The choice and the open tab survive a redraw (the scene redraws after every action). It shows
 * no number and never what the commander feels. Every tab, entry and button can be analyzed. Replaces what `host` held.
 */
export function renderOfferComposer(host: HTMLElement, ctx: OfferComposerCtx): void {
  const { state, reg, unitId, choices } = ctx;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined) {
    host.replaceChildren();
    return;
  }
  const live = { unitId };
  const key = ctx.memory ?? host;
  const mem = memories.get(key) ?? { tab: OFFER_TABS[0], picks: [], ask: false, note: '' };
  memories.set(key, mem);
  mem.picks = mem.picks.filter((p) => choices[p.tab].some((c) => c.id === p.id)); // what is no longer offered is no longer chosen
  const redraw = (): void => renderOfferComposer(host, ctx);
  const chosen = (tab: OfferTab, id: string): boolean => mem.picks.some((p) => p.tab === tab && p.id === id);
  const labelOf = (p: { tab: OfferTab; id: string }): string => choices[p.tab].find((c) => c.id === p.id)?.label ?? p.id;

  const tabs = h('div', { class: 'alius-offer-tabs', role: 'tablist', 'aria-label': 'What to offer' },
    ...OFFER_TABS.map((t) => h('button', {
      type: 'button', class: 'alius-btn alius-option', role: 'tab', 'aria-selected': String(mem.tab === t), 'data-offer-tab': t,
      ...analyzeNative('glossary:offer', live),
      onclick: () => { mem.tab = t; mem.note = ''; redraw(); },
    }, TAB_LABEL[t])));

  const list = choices[mem.tab];
  const entries = list.length === 0
    ? h('p', { class: 'alius-dim alius-offer-empty' }, 'Nothing here is on offer.')
    : h('div', { class: 'alius-offer-entries', role: 'tabpanel' }, ...list.map((c) => {
      const known = c.known === undefined ? null : h('span', { class: 'alius-offer-known' }, c.known === 'unknown' ? '?' : ATTITUDE_WORD[c.known]);
      return h('button', {
        type: 'button', class: `alius-btn alius-option${c.known === undefined ? '' : ` is-${c.known}`}`, 'data-offer-entry': c.id, 'data-tab': mem.tab, 'aria-pressed': String(chosen(mem.tab, c.id)),
        ...analyzeNative(addressOf(mem.tab, c.id), live),
        onclick: () => {
          if (chosen(mem.tab, c.id)) {
            mem.picks = mem.picks.filter((p) => !(p.tab === mem.tab && p.id === c.id));
            mem.note = '';
          } else if (mem.picks.length >= TUNING.offer.maxEntries) mem.note = 'An offer is one or two entries: put one back first.';
          else {
            mem.picks.push({ tab: mem.tab, id: c.id });
            mem.note = '';
          }
          redraw();
        },
      }, c.label, ' ', known);
    }));

  const summary = h('p', { class: 'alius-offer-chosen' }, mem.picks.length === 0 ? 'Nothing chosen yet.' : `Offer: ${mem.picks.map(labelOf).join(' and ')}.`);
  const note = h('p', { class: 'alius-offer-note alius-dim', role: 'status' }, mem.note);
  const button = (action: string, text: string, onclick: () => void, extra: Record<string, unknown> = {}): HTMLElement => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-action': action, ...analyzeNative('glossary:offer', live), ...extra, onclick,
  }, text);
  const answers = h('div', { class: 'alius-offer-answers' },
    button('ask-return', '[ ASK IN RETURN ]', () => { mem.ask = !mem.ask; redraw(); }, { 'aria-pressed': String(mem.ask) }),
    button('send', '[ SEND ]', () => {
      if (mem.picks.length === 0) return;
      const composition: OfferComposition = [];
      for (const p of mem.picks) {
        const row = composition.find((c) => c.tab === p.tab);
        if (row !== undefined) row.ids.push(p.id);
        else composition.push({ tab: p.tab, ids: [p.id] });
      }
      const ask = mem.ask;
      memories.delete(key);
      ctx.onSend(composition, ask);
    }, mem.picks.length === 0 ? { 'aria-disabled': 'true' } : {}),
    button('cancel', '[ CANCEL ]', () => { memories.delete(key); ctx.onClose(); }));

  const body = h('div', { class: 'alius-offer-body' }, tabs, entries, summary, note, answers);
  const card = renderVoiceCard({ voice: VOICE_OF.dynamic, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-offer');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `Offer yourself to ${unit.displayName}`);
  host.replaceChildren(card);
}

/** What a surface (the scene, a thread) hands the chips. */
export interface OfferSurfaceCtx {
  state: CampaignState;
  reg: Registries;
  /** Which women this surface is about (a scene's participants, the open thread). */
  pick: (unitId: string) => boolean;
  /** The composition goes to the app (`dynamic.offer`: through the scene controller in a scene, directly in a DM). */
  onOffer: (unitId: string, composition: OfferComposition, askInReturn: boolean) => void;
  /** Whether her reply has come, so the outcome chip may show (default: yes). */
  answered?: (unitId: string) => boolean;
  /** The element the composer's state is kept on, when `host` is rebuilt on every draw (the thread). Default: `host`. */
  memory?: HTMLElement;
}

const openFor = new WeakMap<HTMLElement, string>();

/**
 * The `[ OFFER MYSELF ]` chip next to the lead chips (a scene) or under the thread: one chip for each woman the surface is about who can be offered to right now (`offerChoices` has
 * something for her), which opens the composer under it; and, once she has answered, the outcome chip for each offer of hers that is open (accepted, corrected, mocked, refused
 * or tonight). Nothing is drawn while the dynamic is off or when nobody can be offered to. Replaces what `host` held.
 */
export function drawOfferChips(host: HTMLElement, ctx: OfferSurfaceCtx): void {
  const { state, reg } = ctx;
  const key = ctx.memory ?? host; // what outlives a redraw: the element the surface keeps (the scene's own, or the thread's tab), the choice and the open composer are kept on it
  const women = state.squad.filter((u) => u.kind === 'named' && isLiving(u) && ctx.pick(u.id) && Object.values(offerChoices(state, reg, u.id)).some((list) => list.length > 0));
  if (!women.some((u) => u.id === openFor.get(key))) openFor.delete(key);
  const open = openFor.get(key);
  const redraw = (): void => drawOfferChips(host, ctx);

  const chips = h('div', { class: 'alius-chips alius-offer-chips' }, ...women.map((u) => h('button', {
    type: 'button', class: 'alius-btn alius-chip', 'data-action': 'offer', 'data-unit': u.id, 'aria-expanded': String(open === u.id),
    ...analyzeNative('glossary:offer', { unitId: u.id }),
    onclick: () => {
      if (openFor.get(key) === u.id) {
        openFor.delete(key);
        memories.delete(key);
      } else openFor.set(key, u.id);
      redraw();
    },
  }, women.length === 1 ? '[ OFFER MYSELF ]' : `[ OFFER MYSELF > ${u.displayName.toUpperCase()} ]`)));

  for (const offer of state.dynamic?.open.offers ?? []) {
    if (!ctx.pick(offer.unitId) || offer.answer === undefined || ctx.answered?.(offer.unitId) === false) continue;
    chips.append(h('span', { class: 'alius-chip alius-offer-answer', 'data-offer': offer.id, 'data-unit': offer.unitId, ...analyzeAttrs('glossary:offer_answer', { unitId: offer.unitId }) }, ANSWER_WORD[offer.answer]));
  }

  host.replaceChildren(chips);
  if (open === undefined) return;
  const composerHost = h('div', { class: 'alius-offer-host' }) as HTMLElement;
  host.append(composerHost);
  renderOfferComposer(composerHost, {
    state, reg, unitId: open, choices: offerChoices(state, reg, open), memory: key,
    onSend: (composition, ask) => { openFor.delete(key); ctx.onOffer(open, composition, ask); redraw(); },
    onClose: () => { openFor.delete(key); redraw(); },
  });
}
