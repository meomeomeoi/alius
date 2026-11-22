import type { Registries } from '../../content/types';
import { hesitates } from '../../engine/dmBehaviours';
import { unreadOf } from '../../engine/dms';
import { isLiving } from '../../engine/economy';
import { decorOf } from '../../engine/personal/decor';
import type { ProposalAnswer } from '../../engine/relations/proposals';
import type { CampaignState, Unit } from '../../engine/state/types';
import { drawViolation, violationLabels } from '../bonds/chips';
import { renderRuleNote, ruleNotesFor } from '../notes/ruleNote';
import { h } from '../dom';
import { drawProposalChips } from '../proposalChips';
import { drawPersonalChips, editChip, type EditView, type PersonalChipHandlers } from '../personal/chips';
import { drawDemandChips, drawDisciplineChips } from '../discipline/chips';
import { drawClaimCards, drawMilestoneCards, drawReturnCards, type ClaimAnswer, type ReturnAnswer } from '../dynamic/cards';
import { drawTaskCards, type TaskAnswer } from '../practice/taskCard';
import { drawOfferChips } from '../dynamic/offerComposer';
import type { OfferComposition } from '../../engine/dynamic/offer';
import { drawGenerationChips, drawSiteReroll, type GenerationUi } from '../generation/surface';
import { renderBubble, unitAccent } from '../voice/voiceCard';
import { armTyping, clearTyping, renderHerMessage, renderReceipt, renderTyping, stampText, typingPlayed } from './living';

export interface CommsTabCtx {
  getState: () => CampaignState | null;
  registries: Registries;
  onSend: (unitId: string, text: string) => void;
  onRead: (unitId: string) => void;
  onAnswer: (proposalId: string, answer: ProposalAnswer, condition?: string) => void;
  /** P9c: the DM edit of a soldier with access to the commander's messages that waits for KEEP or REVERT (absent = none). */
  edit?: () => EditView | null;
  onAnswerEdit?: (keep: boolean) => void;
  /** P9c chunk (b): a token offer, a wager, a won question (the chips under the thread). */
  personal?: PersonalChipHandlers;
  /** P9: UNDO on a discipline chip. */
  onUndoDiscipline?: (id: string) => void;
  /** P9: [GRANT] / [REFUSE] / [TALK] on her demand. */
  onAnswerDemand?: (demandId: string, answer: 'grant' | 'refuse') => void;
  onTalkDemand?: (demandId: string) => void;
  /** P15: [ACCEPT] / [REFUSE] on her open milestone (the open id). */
  onAnswerMilestone?: (milestoneId: string, answer: 'accept' | 'refuse') => void;
  /** P15: [YIELD] / [REFUSE] / [TALK] on her open claim (the open id). */
  onAnswerClaim?: (claimId: string, answer: ClaimAnswer) => void;
  /** P15: [ACCEPT] / [REFUSE] on her return offer (the only one open). */
  onAnswerReturn?: (answer: ReturnAnswer) => void;
  /** P16: ACCEPT / REFUSE / TALK on a task she offered in her thread (the task's id); the signature of a signed one. */
  onAnswerTask?: (taskId: string, answer: TaskAnswer) => void;
  onSignTask?: (taskId: string) => void;
  /** P15: `[ OFFER MYSELF ]` sent from the composer (the app's `dynamic.offer`: straight to the engine in a thread). Absent = no chip. */
  onOffer?: (unitId: string, composition: OfferComposition, askInReturn: boolean) => void;
  /** P9d: [ACCEPT] / [NEGOTIATE] / [REFUSE] on a rule she proposed. */
  onAnswerRule?: (ruleId: string, answer: 'accept' | 'negotiate' | 'refuse') => void;
  /** P10: a small portrait for each contact row (absent = none). */
  avatar?: (unit: Unit) => HTMLElement | null;
  /** P10b: may the typing indicator move? Absent = yes; the app passes `!motionReduced(settings)`. */
  motion?: () => boolean;
  /** P14: failure chips under her thread and REROLL on her last reply. Absent = none drawn. */
  generation?: GenerationUi;
  /** P14: the DM reply's reroll as the comms controller reports and runs it (`replyState`, `rerollLast`). */
  reply?: {
    state(unitId: string): { siteKey: string; reroll: { enabled: boolean; reason?: string } } | null;
    run(unitId: string): Promise<void>;
  };
}

/** The open thread and the half-typed text survive a re-render (the tab redraws after every action). */
const selected = new WeakMap<HTMLElement, string>();
/** P15: a thread asked for from outside the tab (the Tonight chip of the hub): the next draw opens it, once. */
let wanted: string | undefined;
export function requestThread(unitId: string): void {
  wanted = unitId;
}
const drafts = new WeakMap<HTMLElement, string>();
/** P10b: the voice messages played in a host; kept until the host is built anew (the tab itself is rebuilt on a chat switch). */
const revealed = new WeakMap<HTMLElement, Set<string>>();

/** The dot on a contact counts a waiting demand too; marking a thread read must look at the messages only (a demand stays until answered). */
const unread = unreadOf;
const unreadMessages = (state: CampaignState, id: string): number => (state.dms[id] ?? []).filter((m) => m.from !== 'commander' && !m.read).length;

/** The COMMS tab: a retro messenger with one thread per named, living unit. */
export function renderCommsTab(host: HTMLElement, ctx: CommsTabCtx): void {
  clearTyping(host);
  host.replaceChildren();
  const state = ctx.getState();
  if (!state) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO ACTIVE CAMPAIGN IN THIS CHAT')));
    return;
  }
  const contacts: Unit[] = state.squad.filter((u) => u.kind === 'named' && isLiving(u));
  if (contacts.length === 0) {
    host.append(h('section', { class: 'alius-section' }, h('p', {}, 'NO CONTACTS')));
    return;
  }
  if (wanted !== undefined) {
    if (contacts.some((u) => u.id === wanted)) selected.set(host, wanted);
    wanted = undefined;
  }
  let current = selected.get(host);
  if (current && !contacts.some((u) => u.id === current)) {
    selected.delete(host);
    current = undefined;
  }

  const open = (id: string): void => {
    selected.set(host, id);
    ctx.onRead(id);
    renderCommsTab(host, ctx);
  };
  const list = h('div', { class: 'alius-threads', role: 'list' }, ...contacts.map((u) => {
    const n = unread(state, u.id);
    const dot = n > 0 ? h('span', { class: 'alius-dot', 'aria-label': `${n} unread` }, '●') : null;
    // P10b: her decor can rename her contact (dimmed while it fades); the thread keeps her real name
    const decor = decorOf(state, u.id);
    const renamed = decor !== null && decor.parts.includes('contact') ? decor : null;
    const row = h('button', {
      type: 'button', class: `alius-btn alius-contact${u.id === current ? ' is-open' : ''}${renamed?.fadedUntil !== undefined ? ' is-faded' : ''}`, 'data-unit': u.id, onclick: () => open(u.id),
    }, renamed ? renamed.contactName : u.displayName, ' ', dot);
    const face = ctx.avatar?.(u);
    if (face) row.prepend(h('span', { class: 'alius-contact-avatar' }, face));
    row.style.setProperty('--unit-accent', unitAccent(u.id));
    return row;
  }));

  const thread = h('div', { class: 'alius-thread alius-voice alius-voice-personal', 'data-voice': 'personal', role: 'log', 'aria-live': 'polite' });
  if (!current) {
    thread.append(h('p', { class: 'alius-dim' }, 'SELECT A CONTACT'));
  } else {
    const unit = contacts.find((u) => u.id === current)!;
    const decor = decorOf(state, unit.id);
    const alias = decor !== null && decor.parts.includes('contact') ? decor.contactName : null;
    thread.append(h('h3', {}, alias !== null ? `// ${alias.toUpperCase()} [${unit.displayName.toUpperCase()}]` : `// ${unit.displayName.toUpperCase()}`));
    const accent = unitAccent(unit.id);
    const played = revealed.get(host) ?? new Set<string>();
    revealed.set(host, played);
    const messages = state.dms[current] ?? [];
    let lastMine = -1;
    messages.forEach((x, i) => { if (x.from === 'commander') lastMine = i; });
    messages.forEach((m, i) => {
      const mine = m.from === 'commander';
      if (mine) {
        const bubble = renderBubble(m.text, mine, accent);
        bubble.classList.add('alius-msg', 'is-commander');
        bubble.prepend(h('span', { class: 'alius-msg-meta' }, stampText(m.day, m.slot)));
        thread.append(bubble);
        // P10b: the receipt of the commander's last message (derived in slots: the game has no clock)
        const receipt = i === lastMine ? renderReceipt(state, current!, m) : null;
        if (receipt) thread.append(receipt);
        return;
      }
      const shown = renderHerMessage(state, ctx.registries, current!, m, { revealed: played, accent, onReveal: (id) => { played.add(id); renderCommsTab(host, ctx); } });
      // P9d: her reply depicts content that is switched off (a DM has no regenerate: the mark only says so)
      if (m.violation && m.violation.length > 0) drawViolation(shown[shown.length - 1], violationLabels(ctx.registries, m.violation));
      thread.append(...shown);
    });
    // P14: a reply that failed (the key starts with her id) or a knock answer that failed (the key is the open knock's id), and REROLL of her last reply
    const doorId = state.calendar.nightEvent?.unitId === current ? state.calendar.nightEvent.id : null;
    const genHost = h('div', { class: 'alius-generation-chips' });
    drawGenerationChips(genHost, ctx.generation, state, 'comms', (r) => r.key.startsWith(`${current}:`) || r.key === doorId);
    const her = ctx.reply?.state(current);
    if (her) drawSiteReroll(genHost, ctx.generation, 'dm.reply', her.siteKey, () => ctx.reply!.run(current!), her.reroll);
    if (genHost.childElementCount > 0) thread.append(genHost);
    // P10b: she started to answer and stopped (only while the thread ends with the commander's message)
    if (hesitates(state, ctx.registries, current)) {
      const key = messages.at(-1)!.id;
      const motion = ctx.motion?.() ?? true;
      const done = typingPlayed(host, key);
      const typing = renderTyping(motion && !done);
      if (motion && done) typing.textContent = 'stopped typing';
      else if (motion) armTyping(host, typing, key);
      thread.append(typing);
    }
    const chips = h('div', { class: 'alius-chips' });
    drawProposalChips(chips, state, (p) => p.channel === 'dm' && p.unitId === current, ctx.onAnswer, ctx.registries);
    const disciplineChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    drawDisciplineChips(disciplineChips, state, ctx.registries, (c) => c.channel === 'dm' && c.unitId === current, (id) => ctx.onUndoDiscipline?.(id));
    const input = h('input', { type: 'text', name: 'dm', class: 'alius-input', autocomplete: 'off', 'aria-label': `Message ${unit.displayName}` }) as HTMLInputElement;
    // P9c: while a soldier's edit waits, the input shows the edited text and cannot be typed in or sent
    const pending = ctx.edit?.() ?? null;
    const waiting = pending !== null && pending.toUnitId === current ? pending : null;
    input.value = waiting ? waiting.edited : drafts.get(host) ?? '';
    if (waiting) input.readOnly = true;
    else input.addEventListener('input', () => drafts.set(host, input.value));
    const send = (): void => {
      if (waiting) return;
      const text = input.value.trim();
      if (text === '') return;
      input.value = '';
      drafts.delete(host);
      ctx.onSend(unit.id, text);
    };
    input.addEventListener('keydown', (e) => {
      if ((e as KeyboardEvent).key === 'Enter') send();
    });
    const demandChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    drawDemandChips(demandChips, state, ctx.registries, (c) => c.unitId === current, {
      grant: (id) => ctx.onAnswerDemand?.(id, 'grant'), refuse: (id) => ctx.onAnswerDemand?.(id, 'refuse'), talk: (id) => ctx.onTalkDemand?.(id), generation: ctx.generation,
    });
    const milestoneCards = h('div', { class: 'alius-milestone-cards' });
    drawMilestoneCards(milestoneCards, state, ctx.registries, (c) => c.unitId === current, (id, answer) => ctx.onAnswerMilestone?.(id, answer)); // P15: her step, under the thread
    const claimCards = h('div', { class: 'alius-claim-cards' });
    drawClaimCards(claimCards, state, ctx.registries, (c) => c.unitId === current, (id, answer) => ctx.onAnswerClaim?.(id, answer)); // P15: her claim, under the thread
    const returnCards = h('div', { class: 'alius-return-cards' });
    drawReturnCards(returnCards, state, ctx.registries, (c) => c.unitId === current, (answer) => ctx.onAnswerReturn?.(answer)); // P15: her offer to begin again, under the thread
    const taskCards = h('div', { class: 'alius-task-cards' });
    drawTaskCards(taskCards, state, ctx.registries, (c) => c.unitId === current, { answer: (id, answer) => ctx.onAnswerTask?.(id, answer), sign: (id) => ctx.onSignTask?.(id), focusInput: () => input.focus() }); // P16: her task, under the thread (words are typed in the thread's own input)
    // P15: `[ OFFER MYSELF ]` under the thread, and her answer once she has written back (the composer keeps its choice on the tab's own element across the tab's redraws)
    const offerChips = h('div', { class: 'alius-offer-surface' });
    if (ctx.onOffer) drawOfferChips(offerChips, { state, reg: ctx.registries, pick: (id) => id === current, onOffer: ctx.onOffer, answered: () => messages.at(-1)?.from !== 'commander', memory: host });
    const ruleChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    // P10b: a rule she proposed is her signed note under the thread (SIGN / NEGOTIATE / DON'T SIGN answer it as the chips did)
    const answers = { accept: (id: string) => ctx.onAnswerRule?.(id, 'accept'), negotiate: (id: string) => ctx.onAnswerRule?.(id, 'negotiate'), refuse: (id: string) => ctx.onAnswerRule?.(id, 'refuse'), generation: ctx.generation };
    for (const rule of ruleNotesFor(state, (id) => id === current).filter((r) => r.status === 'proposed')) ruleChips.append(renderRuleNote(state, ctx.registries, rule, answers, { motion: ctx.motion?.() ?? true }));
    const personalChips = h('div', { class: 'alius-chips alius-discipline-chips' });
    if (ctx.personal) drawPersonalChips(personalChips, state, ctx.registries, (id) => id === current, ctx.personal);
    const editor = waiting ? contacts.find((u) => u.id === waiting.editorId) : undefined;
    const editChips = waiting
      ? editChip(waiting, editor?.displayName ?? waiting.editorId, () => ctx.onAnswerEdit?.(true), () => ctx.onAnswerEdit?.(false))
      : null;
    const sendButton = h('button', { type: 'button', class: 'alius-btn', 'data-action': 'send', ...(waiting ? { 'aria-disabled': 'true' } : {}), onclick: send }, '[ SEND ]');
    thread.append(chips, disciplineChips, demandChips, milestoneCards, claimCards, returnCards, taskCards, offerChips, ruleChips, personalChips, ...(editChips ? [editChips] : []), h('div', { class: 'alius-cmd' }, h('span', { class: 'alius-prompt' }, 'MSG>'), input, sendButton));
    // messages that arrived while the thread was open: mark them read (after this render, so it cannot re-enter it)
    if (unreadMessages(state, current) > 0) queueMicrotask(() => ctx.onRead(unit.id));
  }
  host.append(h('section', { class: 'alius-section alius-comms' }, h('h2', {}, '[ PDA COMMS ]'), h('div', { class: 'alius-comms-body' }, list, thread)));
}
