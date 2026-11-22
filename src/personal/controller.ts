import type { Registries } from '../content/types';
import type { EngineEvent } from '../engine/dispatch';
import { fnv1a } from '../engine/hub';
import { bookingPlayable, dueBooking } from '../engine/personal/bookings';
import { interceptEditor } from '../engine/personal/intercept';
import type { SecretAnswer } from '../engine/personal/secrets';
import type { CampaignState, Intercept, Slot } from '../engine/state/types';
import { sanitizeDmEdit, type DmEditFlavorInput } from '../llm/calls/flavor';
import type { PersonalDeps } from './deps';

export type { EditPrompt, PersonalDeps } from './deps';

/** A DM edit that waits for KEEP or REVERT: what the commander wrote, and the edited text to show. */
export interface PendingEdit {
  id: string;
  editorId: string;
  channel: 'dm';
  toUnitId: string;
  original: string;
  edited: string;
}

export interface PersonalController {
  /** Before a DM goes out: the roll for a level-4 edit. Without an edit it returns the original and calls no model; with one, the edited text and what is waiting. */
  beforeSend(unitId: string, text: string): Promise<{ text: string; intercept?: { id: string; editorId: string } }>;
  /** Before a Leash request or a recruit order is filed: the roll and, on a hit, the question KEEP or REVERT. `cancelled` = KEEP: nothing is filed. */
  beforeRequest(kind: 'leash' | 'recruit'): Promise<{ cancelled: boolean; intercept?: { id: string; editorId: string } }>;
  /** The DM edit that still waits for an answer (after a reload too): freshly worded from what the commander wrote, or the authored fallback. */
  pendingEdit(): Promise<PendingEdit | null>;
  /** KEEP or REVERT through the engine. Toasts the reason and returns false when the engine refuses. */
  resolveIntercept(id: string, keep: boolean): boolean;
  /** Answers the waiting DM edit and says what to send: KEEP the edited text with its id, REVERT the original. `null` when nothing waits. */
  answerEdit(keep: boolean): Promise<{ unitId: string; text: string; interceptId?: string } | null>;
  /** A slot began: a booking that is due and that she can keep is played and its scene opens (once). Resolves whether a scene opened. */
  onSlotAdvanced(): Promise<boolean>;
  /** The chat opened: the same, for a booking that came due while the game was closed. */
  onLoaded(): Promise<boolean>;
  cancelBooking(bookingId: string): boolean;
  resolveConflict(p: { bookingId: string } | { day: number; slot: Slot; settle: true }): boolean;
  /** The claim card: REFUSE PUBLICLY goes through the engine; LET IT STAND only closes the card (nothing to record). */
  answerClaim(unitId: string, refuse: boolean): boolean;
  /** Her reply (a DM or a line of a scene): the first one after the commander won a question wager is stored as a fact and ends the truth order. Says whether it was recorded. */
  onReply(unitId: string, text: string): boolean;
  wearToken(tokenId: string): boolean;
  takeOffToken(tokenId: string): boolean;
  answerToken(offerId: string, accept: boolean): boolean;
  answerWager(wagerId: string, accept: boolean): boolean;
  playWager(wagerId: string, pick?: string): boolean;
  /** The text of a won question wager: the commander's answer, or the commander's question. */
  answerQuestion(wagerId: string, text: string): boolean;
  /** The commander challenges a soldier (the dossier's form); she accepts or refuses. */
  challenge(p: { unitId: string; gameId: string; stakeId: string; pick?: string }): boolean;
  /** The commander's answer to a secret that came out (the card): confront everyone, pretend not to know or use it. */
  answerSecret(secretId: string, choice: SecretAnswer): boolean;
  /** The chat opened: the card of a secret that was found and never answered comes back (one at a time, the oldest first). */
  reopenSecrets(): void;
  /** Reads the events of one dispatch: the ones that change a directive refresh the context; a clash of bookings and a claim are announced. */
  onEvents(events: EngineEvent[]): void;
}

const REFRESH_ON = new Set([
  'claimed', 'claim_refused', 'booking_cancelled', 'booking_played', 'booking_made', 'decor_removed_by_commander', 'decor_placed', 'proposal_conditioned',
  'token_worn', 'token_taken_off', 'token_accepted', 'wager_resolved', 'wager_question', 'truth_told', 'mark_set', 'mark_ended',
  'secret_kept', 'secret_found', 'secret_answered',
]);

/**
 * The non-engine half of P9c's personal pressure: the wording of a level-4 edit, the questions about an edited request, the
 * scene a due booking opens and the toasts. The engine decides everything that is true; nothing here has to be remembered
 * across a reload (the waiting edit and the booking live in the state).
 */
export function createPersonal(deps: PersonalDeps): PersonalController {
  const chatId = (): string | undefined => deps.st.getActiveChat()?.chatId;
  const state = (): CampaignState | null => deps.app.current().state;
  const reg = (): Registries => deps.registries();
  /** The edited text of this session per waiting edit of one chat (ids repeat across campaigns); after a reload it is worded again. */
  const wording = new Map<string, string>();
  const keyOf = (id: string): string => `${chatId() ?? ''}:${id}`;
  const nameOf = (s: CampaignState, id: string | undefined): string => s.squad.find((u) => u.id === id)?.displayName ?? 'She';

  const interceptOf = (id: string): Intercept | undefined => {
    const open = state()?.personal?.intercepts?.open;
    return open?.id === id ? open : undefined;
  };

  // the `flavor.dm_edit` site (key: the intercept's id): the edit in the editor's words; no record, the authored line stands
  deps.generations.bind<DmEditFlavorInput, string>('flavor.dm_edit', {
    build(interceptId) {
      const s = state();
      const open = interceptOf(interceptId);
      const unit = s?.squad.find((u) => u.id === open?.unitId);
      if (!s || !open || !unit) return { expired: 'The edit is over.' };
      return {
        kind: 'dm_edit', unitName: unit.displayName, stateHint: String(reg().relationshipStates.get(s.relations[unit.id]?.stateId ?? '')?.promptHint ?? ''),
        recipientName: nameOf(s, open.toUnitId) === 'She' ? '' : nameOf(s, open.toUnitId), original: open.original ?? '',
      };
    },
    parse: (raw) => sanitizeDmEdit(raw)?.text ?? null,
    apply: () => 'ok', // the text is the outcome's value: `word` returns it
  });

  /** The edit in the editor's words (the mechanic model when allowed and it answers), else an authored line with `{text}` and `{name}` filled. */
  async function word(s: CampaignState, open: Intercept): Promise<string> {
    const unit = s.squad.find((u) => u.id === open.unitId);
    const original = open.original ?? '';
    if (unit && deps.settings().dmEditWording) {
      const out = await deps.generations.generate<string>('flavor.dm_edit', open.id);
      if (out.kind === 'applied') return out.value;
    }
    const lines = ([...reg().deviceAccessRules.values()].find((r) => Number(r.level) === 4)?.editLines as string[] | undefined) ?? [];
    const line = lines.length > 0 ? lines[fnv1a(open.id) % lines.length] : '{text} — {name} added this.';
    return line.replaceAll('{text}', original).replaceAll('{name}', unit?.displayName ?? 'She');
  }

  /** Is there anybody who could edit this, and nothing already waiting? Pure: a send nobody can edit dispatches nothing, so the state object stays as it is. */
  function canIntercept(channel: 'dm' | 'leash' | 'recruit', toUnitId?: string): boolean {
    const s = state();
    return s !== null && s.personal?.intercepts?.open === undefined && interceptEditor(s, reg(), channel, toUnitId) !== null;
  }

  function failed(events: EngineEvent[]): boolean {
    const bad = events.find((e) => e.type === 'error');
    if (bad && bad.code !== 'chat_changed') deps.toast('error', String(bad.message ?? bad.code));
    return bad !== undefined;
  }

  /** One dispatch with the chat check; toasts a refusal, refreshes the directives and says whether it worked. */
  function act(type: string, payload: unknown): boolean {
    const events = deps.app.dispatch({ type, payload }, { expectChatId: chatId() });
    if (failed(events)) return false;
    deps.refreshContext();
    return true;
  }

  let opening = false;
  async function playDue(): Promise<boolean> {
    const s = state();
    if (!s || opening || !deps.startScene) return false;
    if (s.slot === 'night' || s.scene || s.combat || s.expedition || s.calendar.pendingScene || s.calendar.nightEvent) return false;
    const due = dueBooking(s, reg());
    if (!due || !bookingPlayable(s, reg(), due)) return false;
    opening = true;
    try {
      const events = deps.app.dispatch({ type: 'booking/play', payload: {} }, { expectChatId: chatId() });
      const played = events.find((e) => e.type === 'booking_played') as { scene?: { locationId: string; participants: string[]; origin: 'event' } } | undefined;
      if (!played?.scene) return false;
      const ok = await deps.startScene(played.scene);
      deps.refreshContext();
      return ok;
    } finally {
      opening = false;
    }
  }

  const controller: PersonalController = {
    async beforeSend(unitId, text) {
      if (!canIntercept('dm', unitId)) return { text };
      const expect = chatId();
      const events = deps.app.dispatch({ type: 'device/intercept', payload: { channel: 'dm', toUnitId: unitId, text } }, { expectChatId: expect });
      const s = state();
      const open = s?.personal?.intercepts?.open;
      if (!s || !open || !events.some((e) => e.type === 'device_intercept' && e.hit === true)) return { text };
      const edited = await word(s, open);
      if (chatId() !== expect) return { text };
      wording.set(keyOf(open.id), edited);
      return { text: edited, intercept: { id: open.id, editorId: open.unitId } };
    },

    async beforeRequest(kind) {
      if (!deps.confirmEdit || !canIntercept(kind)) return { cancelled: false };
      const expect = chatId();
      const events = deps.app.dispatch({ type: 'device/intercept', payload: { channel: kind } }, { expectChatId: expect });
      const s = state();
      const open = s?.personal?.intercepts?.open;
      if (!s || !open || !events.some((e) => e.type === 'device_intercept' && e.hit === true)) return { cancelled: false };
      const editorName = nameOf(s, open.unitId);
      const answer = await deps.confirmEdit({
        editorName, channel: kind, text: `${editorName} stopped the ${kind === 'leash' ? 'Leash request' : 'recruit order'} before it went out.`,
      });
      if (chatId() !== expect) return { cancelled: false };
      if (!controller.resolveIntercept(open.id, answer === 'keep')) return { cancelled: false };
      return { cancelled: answer === 'keep', intercept: { id: open.id, editorId: open.unitId } };
    },

    async pendingEdit() {
      const s = state();
      const open = s?.personal?.intercepts?.open;
      if (!s || !open || open.status !== 'open' || open.channel !== 'dm' || open.toUnitId === undefined || open.original === undefined) return null;
      const edited = wording.get(keyOf(open.id)) ?? await word(s, open);
      wording.set(keyOf(open.id), edited);
      return { id: open.id, editorId: open.unitId, channel: 'dm', toUnitId: open.toUnitId, original: open.original, edited };
    },

    resolveIntercept(id, keep) {
      return act('device/resolve_intercept', { id, keep });
    },

    async answerEdit(keep) {
      const pending = await controller.pendingEdit();
      if (!pending || !controller.resolveIntercept(pending.id, keep)) return null;
      wording.delete(keyOf(pending.id));
      return keep ? { unitId: pending.toUnitId, text: pending.edited, interceptId: pending.id } : { unitId: pending.toUnitId, text: pending.original };
    },

    onSlotAdvanced: playDue,
    onLoaded: playDue,

    cancelBooking: (bookingId) => act('booking/cancel', { bookingId }),
    resolveConflict: (p) => act('booking/resolve', p),
    answerClaim(unitId, refuse) {
      if (!refuse) return true;
      return act('courtship/refuse_claim', { unitId });
    },

    onReply(unitId, text) {
      const truth = state()?.personal?.truth;
      if (!truth || truth.unitId !== unitId || text.trim() === '') return false;
      return act('wager/record_answer', { unitId, text });
    },
    wearToken: (tokenId) => act('token/wear', { tokenId }),
    takeOffToken: (tokenId) => act('token/remove', { tokenId }),
    answerToken: (offerId, accept) => act('token/answer', { offerId, accept }),
    answerWager: (wagerId, accept) => act('wager/answer', { wagerId, accept }),
    playWager: (wagerId, pick) => act('wager/play', { wagerId, ...(pick !== undefined ? { pick } : {}) }),
    answerQuestion: (wagerId, text) => act('wager/answer_question', { wagerId, text }),
    challenge: (p) => act('wager/challenge', p),
    answerSecret(secretId, choice) {
      if (!act('secret/respond', { secretId, choice })) return false;
      controller.reopenSecrets(); // the next secret that is still waiting (one card at a time)
      return true;
    },
    reopenSecrets() {
      const found = state()?.personal?.secrets?.find((x) => x.status === 'found');
      if (found && deps.onSecretFound) deps.onSecretFound(found.id);
    },

    onEvents(events) {
      let refresh = false;
      let foundSecret: string | undefined; // one card per dispatch: a second one would cancel the first; the rest come after each answer
      for (const e of events) {
        if (REFRESH_ON.has(e.type)) refresh = true;
        if (e.type === 'wager_resolved') {
          const s = state();
          if (deps.onWagerResult) deps.onWagerResult(e);
          else if (s) deps.toast('info', `${nameOf(s, String(e.unitId))}'s wager is decided: ${e.winner === 'unit' ? 'she wins' : e.winner === 'commander' ? 'the commander wins' : 'nobody wins'}.`);
        } else if (e.type === 'wager_refused') {
          const s = state();
          if (s) deps.toast('info', `${nameOf(s, String(e.unitId))} refuses the bet.`);
        }
        if (e.type === 'secret_found') foundSecret = foundSecret ?? String(e.secretId);
        if (e.type === 'booking_conflict') {
          deps.toast('info', `Two bookings for the ${String(e.slot)} of day ${String(e.day)} clash: choose one, or let them settle it.`);
        } else if (e.type === 'claimed') {
          const s = state();
          if (deps.onClaim) deps.onClaim(String(e.unitId));
          else if (s) deps.toast('info', `${nameOf(s, String(e.unitId))} has told everyone the commander is hers.`);
        }
      }
      if (foundSecret !== undefined) {
        // the text is in the card only: a toast says that something came out, never what
        if (deps.onSecretFound) deps.onSecretFound(foundSecret);
        else deps.toast('info', 'Something the squad kept from the commander has come out.');
      }
      if (refresh) deps.refreshContext();
    },
  };
  return controller;
}
