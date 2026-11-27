import { plainDraft } from '../../content/draft';
import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import { practiceLive } from '../../engine/practice/gate';
import { presetOf } from '../../engine/blocking';
import { postureAllowed, postureWindowMs } from '../../engine/practice/postures';
import type { CampaignState } from '../../engine/state/types';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';
import { practiceOf } from '../../engine/dynamic/profile';
import { handFamily, handScale } from '../../engine/hand';
import { herHand } from '../stage/look';
import type { SampleSound } from '../sound/samples';
import { cancelCall, currentCall, startCall, CALL_SOUNDS, type CallOutcome } from '../scene/instruments/call/call';
import { mannequinSvg } from '../scene/dial/draw';
import { presetPoseOf, type PointStates } from '../scene/dial/points';
import { voiceLine } from '../scene/cards/voice';
import { onStageReset } from '../scene/stage';
import type { CardLook } from './taskCard';

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
  /** P10e-e (`look: 'scene'`): the host of the dim, below the scene's UI (the effects layer), and the dial's corner (its ring takes her accent). */
  dim?: HTMLElement | null;
  dial?: HTMLElement | null;
  /** P10e-e: her foot's taps, the fan and the card's place (cards.html's sounds). */
  samples?: SampleSound | null;
  /** P10e-e: the moment is gone (the scene puts the stop word's pill back under the call's layer). */
  onGone?: () => void;
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
  cancelCall(); // P10e-e: the moment goes too (its timers, its elements, the dim and the dial's ring)
}

// a chat switch: the call drawn in the moment layer goes (scene ids repeat across campaigns)
onStageReset(() => cancelCall());

/**
 * Her call as a card in her voice (P16, plan R14, R24): her name for the posture she wants, and the set of her named postures as the choices. With the order interaction on the call has a window
 * (`postureWindowMs` by her style): the first draw starts the clock and schedules the late slip for when it runs out (once, whatever the redraws), a choice after the window carries `late`, and an answer
 * or a call that went away cancels the expiry. With it off nothing runs and nothing is late. Nothing while there is no call, for a holder `pick` does not choose or who is not live.
 */
export function drawPostureCall(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: PostureCallHandlers, opts: CardLook = {}): void {
  if (opts.look === 'scene') {
    drawSceneCall(host, state, reg, pick, handlers);
    return;
  }
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
  const set = (state.practices!.postures[unit.id] ?? []).filter((p) => postureAllowed(state, reg, p.postureId, unit.id)); // a posture whose category went off is no choice (a preset by its tags)
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

/**
 * P10e-e Task 9: her call in the scene's look: a full-frame moment in the moment layer (`startCall` of cards.html, src/ui/scene/instruments/call/call.ts),
 * drawn once per call (a redraw never restarts it). The answer goes to the engine at once (`take`); the moment plays its end on its own. A call gone from
 * the state before it was answered (another scene, she stopped holding) goes at once; a new call ends the one before.
 */
function drawSceneCall(host: HTMLElement, state: CampaignState, reg: Registries, pick: (c: { unitId: string }) => boolean, handlers: PostureCallHandlers): void {
  const call = state.practices?.call;
  const unit = call === undefined ? undefined : state.squad.find((u) => u.id === call.holderId);
  const now = currentCall();
  const live = call !== undefined && unit !== undefined && dynamicOn(state, reg) && practiceLive(state, reg, unit.id) && pick({ unitId: unit.id });
  const set = live ? (state.practices!.postures[unit!.id] ?? []).filter((p) => postureAllowed(state, reg, p.postureId, unit!.id)) : [];
  const wanted = live ? set.find((p) => p.postureId === call!.postureId) : undefined;
  if (!live || wanted === undefined) {
    if (now !== null && !now.done) cancelCall(); // answered calls play their end; one that went away unanswered goes now
    return;
  }
  // the same call drawn already (answered or not): a redraw never restarts it. If the engine refused the answer, the call is still open in the
  // state, so once this moment has gone (its teardown at 3.3 s) the next redraw draws the call again, as an unanswered card would stay (review M5)
  if (now !== null && now.id === call!.id) return;
  if (now !== null) cancelCall();
  const hand = herHand(state, reg, unit!.id);
  const style = practiceOf(state, reg, unit!.id)?.style.primary;
  const name = plainDraft(wanted.name);
  void handlers.samples?.preload?.([...CALL_SOUNDS.soft, CALL_SOUNDS.fan, ...CALL_SOUNDS.place])?.catch(() => undefined);
  const root = startCall({
    id: call!.id, want: [wanted.postureId, name], choices: set.map((p) => [p.postureId, plainDraft(p.name)] as [string, string]),
    baseLabel: (id) => String(reg.blockingPostures.get(String(presetOf(reg, id)?.base ?? id))?.label ?? id).toLowerCase(), // the base under her name (the card gets a preset's id)
    line: (outcome: CallOutcome) => voiceLine(reg, `call.${outcome}`, style, call!.id, { posture: name }).map((r) => r.text).join(''),
    timed: handlers.timed, windowMs: postureWindowMs(state, reg, unit!.id), reduced: handlers.reduced,
    accent: unitAccent(unit!.id), hand: hand ? handFamily(hand) : '', handScale: handScale(hand),
    cardAttrs: analyzeNative('glossary:posture_call', { unitId: unit!.id }), // the cards answer to the analysis tool (P7a)
    host, dim: handlers.dim ?? null, dial: handlers.dial ?? null, samples: handlers.samples ?? null,
    take: (base, late) => handlers.take(call!.id, base, late),
    ...(handlers.onGone ? { onGone: handlers.onGone } : {}),
    now: handlers.now ?? (() => Date.now()),
    schedule: handlers.schedule ?? ((fn, ms) => setTimeout(fn, ms)),
    cancel: handlers.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)),
  });
  // P16b: a card of a preset draws the preset's own figure (the instrument draws the base's for any id it knows; a base named by an old name keeps the base's figure)
  for (const card of root?.querySelectorAll<HTMLElement>('[data-posture-choice]') ?? []) {
    const preset = reg.servicePostures.get(card.dataset.postureChoice ?? '');
    if (preset === undefined) continue;
    const figure = mannequinSvg(presetPoseOf({ base: String(preset.base), points: preset.points as PointStates, ...(preset.item !== undefined ? { item: preset.item as 'tray' } : {}), ...(preset.hint !== undefined ? { hint: preset.hint as 'wall' } : {}), ...(preset.hogtie === true ? { hogtie: true as const } : {}) }));
    const old = card.querySelector('svg');
    if (old !== null) old.replaceWith(figure);
    else card.prepend(figure);
  }
}
