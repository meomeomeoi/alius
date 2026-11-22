import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { PracticeState, SlapResult } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { AliusSettings } from '../../settings';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { motionReduced } from '../motion';
import { cutIn } from '../scene/cutIn';
import { VOICE_OF } from '../voice/sources';
import { renderVoiceCard, unitAccent } from '../voice/voiceCard';

type Slap = NonNullable<PracticeState['slap']>;

export interface SlapOverlayCtx {
  state: CampaignState;
  reg: Registries;
  slap: Slap;
  settings: AliusSettings;
  /** The answer: none (nothing in time), braced (a press inside the window) or flinched (early, on a feint, a second press). Called once. */
  onResult: (result: SlapResult) => void;
  /** The clock and the timers (tests inject them). */
  now?: () => number;
  schedule?: (fn: () => void, ms: number) => unknown;
  cancel?: (handle: unknown) => void;
  /** The telegraph's sound (`alert`); played once. */
  sound?: { play(id: 'alert'): void };
}

type Phase = 'raise' | 'feint' | 'strike' | 'done';

/** What the card says in each phase (no number; no pronoun and no feeling for the commander). */
const PHASE_TEXT: Readonly<Record<Phase, string>> = { raise: 'Her hand is raised.', feint: 'Her hand twitches.', strike: 'Her hand comes down.', done: '' };
const RESULT_TEXT: Readonly<Record<SlapResult, string>> = { none: 'It lands.', braced: 'Braced.', flinched: 'Flinched.' };

interface Run {
  slapId: string;
  start: number;
  windowStart: number;
  windowEnd: number;
  presses: number;
  decided: boolean;
  down: boolean;
  handles: unknown[];
  /** The cancel the timers were made with (a clear uses the same one). */
  cancel: (handle: unknown) => void;
  card?: HTMLElement;
  keys?: { down: (e: Event) => void; up: (e: Event) => void };
}

/** One run per host: a redraw of the scene shows the same slap without starting its clock, its sound or its cut-in again. */
const runs = new WeakMap<HTMLElement, Run>();

const typing = (t: HTMLElement | null): boolean => t !== null && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);

function stop(host: HTMLElement, run: Run, cancel: (handle: unknown) => void): void {
  for (const handle of run.handles) cancel(handle);
  run.handles = [];
  if (run.keys !== undefined) {
    document.removeEventListener('keydown', run.keys.down);
    document.removeEventListener('keyup', run.keys.up);
    run.keys = undefined;
  }
  void host;
}

/**
 * The slap's time allowed and its one key (P16, plan R21, spec §R.3): her hand goes up (a cut-in and the `alert` sound, once), twitches for each feint her `swing` allows, then comes down; the commander braces
 * with Space (or `[ BRACE ]`) in the last `windowMs` before it lands. A press before that (in the lead, on a feint) or a second press is a flinch, at once; no press is none, at the end; one press inside is a brace. The
 * answer is sent once. With the timing interaction off or reduced motion there is nothing to time: the answer is none at once and no key is listened to. A redraw of the scene with the same slap changes nothing; the keys
 * go with the host. Draws nothing in the engine's sense (no rng); the card is in her voice and carries `data-analyze`.
 */
export function renderSlapOverlay(host: HTMLElement, ctx: SlapOverlayCtx): void {
  const { slap } = ctx;
  const now = ctx.now ?? (() => Date.now());
  const schedule = ctx.schedule ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = ctx.cancel ?? ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const unit = ctx.state.squad.find((u) => u.id === slap.holderId);
  const existing = runs.get(host);
  if (existing !== undefined && existing.slapId === slap.id) {
    if (existing.card !== undefined && !host.contains(existing.card)) host.append(existing.card);
    return;
  }
  if (existing !== undefined) { stop(host, existing, cancel); host.replaceChildren(); }
  if (unit === undefined || !dynamicOn(ctx.state, ctx.reg)) return;

  const run: Run = { slapId: slap.id, start: now(), windowStart: TUNING.practice.slap.leadMs + slap.feints * TUNING.practice.slap.feintMs, windowEnd: 0, presses: 0, decided: false, down: false, handles: [], cancel };
  run.windowEnd = run.windowStart + slap.windowMs;
  runs.set(host, run);

  // nothing to time: the interaction is off or motion is reduced (the way P15a's panel is read): it lands
  if (ctx.settings.physicsInteractions?.timing === false || motionReduced(ctx.settings)) {
    run.decided = true;
    ctx.onResult('none');
    return;
  }

  const live = { unitId: unit.id };
  const text = h('p', { class: 'alius-slap-text', role: 'status' }, PHASE_TEXT.raise);
  const brace = h('button', { type: 'button', class: 'alius-btn alius-option', 'data-action': 'brace', ...analyzeNative('glossary:slap', live), onclick: () => press() }, '[ BRACE ]');
  const bar = h('div', { class: 'alius-slap-bar', 'aria-hidden': 'true', style: `--alius-slap-ms: ${run.windowEnd}ms` });
  const card = renderVoiceCard({ voice: VOICE_OF.practice, from: unit.displayName, body: h('div', { class: 'alius-slap-body' }, text, bar, brace), accent: unitAccent(unit.id) });
  card.classList.add('alius-slap');
  card.setAttribute('role', 'group');
  card.setAttribute('aria-label', `${unit.displayName} raises her hand`);
  for (const [k, v] of Object.entries(analyzeAttrs('glossary:slap', live))) card.setAttribute(k, v);
  const setPhase = (phase: Phase, line: string): void => { card.setAttribute('data-phase', phase); text.textContent = line; };
  setPhase('raise', PHASE_TEXT.raise);
  run.card = card;
  host.append(card);

  const resolve = (result: SlapResult): void => {
    if (run.decided) return;
    run.decided = true;
    stop(host, run, cancel);
    setPhase('done', RESULT_TEXT[result]);
    brace.setAttribute('aria-disabled', 'true');
    ctx.onResult(result);
  };
  function press(): void {
    if (run.decided) return;
    const t = now() - run.start;
    if (t < run.windowStart) resolve('flinched'); // too early: in the lead, or on a feint
    else if (t <= run.windowEnd) {
      run.presses += 1;
      if (run.presses >= 2) resolve('flinched'); // a second press
    }
  }

  // her hand goes up: once per slap
  cutIn(host, 'slap', 'HER HAND');
  ctx.sound?.play('alert');
  const active = document.activeElement as HTMLElement | null;
  if (active !== null && typing(active)) active.blur(); // the key is Space: it must not land in the text box

  // the phases (words only) and the end of the time allowed
  const T = TUNING.practice.slap;
  for (let i = 0; i < slap.feints; i++) {
    run.handles.push(schedule(() => setPhase('feint', PHASE_TEXT.feint), T.leadMs + i * T.feintMs));
    if (i < slap.feints - 1) run.handles.push(schedule(() => setPhase('raise', PHASE_TEXT.raise), T.leadMs + (i + 1) * T.feintMs));
  }
  run.handles.push(schedule(() => setPhase('strike', PHASE_TEXT.strike), run.windowStart));
  run.handles.push(schedule(() => resolve(run.presses === 1 ? 'braced' : 'none'), run.windowEnd));

  // Space from anywhere on the page: one pair of listeners per host, removed when the slap is answered, cleared or the host leaves the page
  const down = (e: Event): void => {
    if (!host.isConnected) { stop(host, run, cancel); return; }
    const ev = e as KeyboardEvent;
    if (ev.key !== ' ' || typing(ev.target as HTMLElement | null)) return;
    ev.preventDefault();
    if (ev.repeat || run.down) return; // a held key is one press
    run.down = true;
    press();
  };
  const up = (e: Event): void => { if ((e as KeyboardEvent).key === ' ') run.down = false; };
  run.keys = { down, up };
  document.addEventListener('keydown', down);
  document.addEventListener('keyup', up);
}

/** The slap is gone (answered, the scene closed, a chat switch): the timers are cancelled, the keys end and the host is emptied. A result never comes after. */
export function clearSlapOverlay(host: HTMLElement): void {
  const run = runs.get(host);
  if (run !== undefined) stop(host, run, run.cancel);
  runs.delete(host);
  host.replaceChildren();
}
