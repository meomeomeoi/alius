import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { practiceLive } from '../../engine/practice/gate';
import { entryAllowed } from '../../engine/blocking';
import { postureWindowMs } from '../../engine/practice/postures';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

/** What the call card needs from its surface: the answer, whether the order interaction runs a timer, whether motion is reduced, and (tests) a clock and a timer. */
export interface PostureCallHandlers {
  /** The commander's answer: the posture chosen (none when the window ran out) and whether the window had passed. */
  take: (callId: string, postureId: string | undefined, late: boolean) => void;
  /** P15a's order interaction is on: only then does the call have a timer (with it off there is no lateness). */
  timed: boolean;
  /** `motionReduced`: the bar stays still (the window is the same). */
  reduced: boolean;
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
}

/** The calls whose clock runs: when each started, and the handle of its expiry. A redraw of the scene must not start the clock again. */
const started = new Map<string, number>();
const expiries = new Map<string, unknown>();

/** Forgets every running clock (tests). A pending expiry is not cancelled: use `cancelPostureCalls` for that. */
export function resetPostureCalls(): void {
  started.clear();
  expiries.clear();
}

/** The scene screen is gone (the scene ended, a chat switch): every pending expiry is cancelled, so no late slip is sent for a call that no longer exists. */
export function cancelPostureCalls(cancel: (handle: unknown) => void = (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)): void {
  for (const handle of expiries.values()) cancel(handle);
  resetPostureCalls();
}

/**
 * Her call as a card in her voice (P16, plan R14, R24): her name for the posture she wants, and the set of her named postures as the choices. With the order interaction on the call has a window
 * (`postureWindowMs` by her style): the first draw starts the clock and schedules the late slip for when it runs out (once, whatever the redraws), a choice after the window carries `late`, and an answer
 * or a call that went away cancels the expiry. With it off nothing runs and nothing is late. Nothing while there is no call, for a holder `pick` does not choose or who is not live.
 */
export function drawPostureCall(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: PostureCallHandlers): void {
  host.replaceChildren();
  const now = handlers.now ?? (() => Date.now());
  const schedule = handlers.schedule ?? ((fn, ms) => setTimeout(fn, ms));
  const cancel = handlers.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const call = state.practices?.call;
  const stop = (id: string): void => {
    if (expiries.has(id)) cancel(expiries.get(id));
    expiries.delete(id);
  };
  const unit = call === undefined ? undefined : state.squad.find((u) => u.id === call.holderId);
  if (call === undefined || unit === undefined || !dynamicOn(state, reg) || !practiceLive(state, reg, unit.id) || !pick({ unitId: unit.id })) {
    for (const id of [...expiries.keys()]) stop(id);
    started.clear();
    return;
  }
  const set = (state.practices!.postures[unit.id] ?? []).filter((p) => { const entry = reg.blockingPostures.get(p.postureId); return entry !== undefined && entryAllowed(state, reg, entry, [unit.id]); }); // a posture whose category went off is no choice
  const wanted = set.find((p) => p.postureId === call.postureId);
  if (wanted === undefined) return;
  const windowMs = postureWindowMs(state, reg, unit.id);
  if (handlers.timed && !started.has(call.id)) {
    started.set(call.id, now());
    expiries.set(call.id, schedule(() => { stop(call.id); handlers.take(call.id, undefined, true); }, windowMs));
  }
  const live = { unitId: unit.id };
  const answer = (postureId: string): void => {
    const late = handlers.timed && started.has(call.id) && now() - started.get(call.id)! > windowMs;
    stop(call.id);
    handlers.take(call.id, postureId, late);
  };
  const choices = set.map((p) => h('button', {
    type: 'button', class: 'alius-btn alius-tagchip', 'data-posture-choice': p.postureId, 'data-call': call.id, ...analyzeNative('glossary:posture_call', live), onclick: () => answer(p.postureId),
  }, plainDraft(p.name)));
  const body = h('div', { class: 'alius-posture-body' },
    h('p', { class: 'alius-posture-name', 'data-posture-call': call.id, ...analyzeAttrs('glossary:posture_call', live) }, plainDraft(wanted.name)),
    ...(handlers.timed ? [h('div', {
      class: `alius-posture-timer${handlers.reduced ? ' alius-posture-timer-still' : ''}`, 'data-window-ms': String(windowMs), 'aria-hidden': 'true', style: handlers.reduced ? '' : `animation-duration:${windowMs}ms`, ...analyzeAttrs('glossary:posture_call', live),
    })] : []),
    h('div', { class: 'alius-posture-choices' }, ...choices));
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body, accent: unitAccent(unit.id) });
  card.classList.add('alius-posture-call');
  card.setAttribute('data-call', call.id);
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} calls a posture`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:posture_call', live))) card.setAttribute(k, v);
  host.append(card);
}
