import type { Registries } from '../../content/types';
import { blockingLive, blockingOf, COMMANDER, contactOf } from '../../engine/blocking';
import type { CueKind } from '../../engine/blocking/types';
import type { EngineEvent } from '../../engine/dispatch';
import { remainingOf } from '../../engine/physics/run';
import type { InputKind, PhysicsRun, SegmentInput } from '../../engine/physics/state';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { AliusSettings } from '../../settings';
import { analyzeAttrs, analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { motionReduced } from '../motion';
import { clockText, STRATEGIES } from '../../engine/physics/marathon';
import { exposedKinds } from '../../engine/physics/stimuli';
import { actsFor } from '../../engine/physics/acts';
import { pillWord, sceneCard } from './cards/sceneCard';
import { gistOf } from './cards/gist';

/** What the panel needs of the staging controller (the controller passes it as it is). */
export interface PhysicsPanelStaging {
  /**
   * An input of the running segment. P10e-e ruling O: `pointer` marks an input an instrument's mouse made (breath's rule: only the mouse acts
   * while the field has focus), which the typing lapse never drops; the card's and the keyboard's inputs go without it, as before.
   */
  input(i: SegmentInput, opts?: { pointer?: boolean }): void;
  endSegment(): EngineEvent[];
  stopWord(): EngineEvent[];
  skip(strategy: string): EngineEvent[];
  stimulus(way: string, kind: string, depth?: number | string): EngineEvent[];
  act(kind: string): EngineEvent[];
  finishCounted(typed: number): EngineEvent[];
  cue(kind: CueKind, beat: number): string | null;
  /** P10e-e ruling Q: her cue line of a kind only when the model worded it (never the registry's narration); absent = never. */
  voiced?(kind: CueKind, beat: number): string | null;
  beat(): number;
  /**
   * P10e-e R5: the staging clock, so an instrument places the plan's beats in wall time: when the running segment started (null while
   * none runs), the length of a beat and the controller's now (the same clock).
   */
  clock(): { startedAt: number | null; beatMs: number; now: number };
  /** P10e-e: how a run of the open scene ended (its `physics_outcome`), or null when none is known. Absent = never known. */
  outcome?(runId: string): { runId: string; physicsId: string; result: string; tally?: Record<string, number> } | null;
}

export interface PhysicsPanelCtx {
  state: CampaignState | null;
  registries: Registries;
  settings: AliusSettings;
  staging: PhysicsPanelStaging;
  /** The tap: the signal inside the fiction (`physics/signal`, dispatched straight to the engine, never staged). */
  onTap: () => void;
  /** The clock for the deep inhale's bar (default `Date.now`). */
  now?: () => number;
  /**
   * Whether the panel draws its own `[ STOP WORD ]` (default true). The scene draws it as a pill at the posture dial instead (P10e A1, same handler)
   * and asks this panel only whether the stop word is offered (the return value).
   */
  stopWord?: boolean;
  /**
   * P10e-e Task 7: the scene's look (cards.html: the fallback hold is not her voice): a neutral card, the kind `a hold` (or `what reaches the body`), her cue as its
   * one line of prose, the controls as plain pills. Absent = today's card.
   */
  look?: 'scene';
}

/** A button of the panel: today's `[ WORD ]`, or in the scene's look a pill with the word in lower case (the same hooks and handlers). */
function btn(ctx: Pick<PhysicsPanelCtx, 'look'>, attrs: Record<string, unknown>, text: string): HTMLElement {
  if (ctx.look !== 'scene') return h('button', attrs, text);
  return h('button', { ...attrs, class: String(attrs.class ?? '').replace(/\balius-btn\b/, 'alius-pill') }, h('span', {}, pillWord(text)));
}

interface Control { kind: InputKind | 'wait'; text: string; part?: string; relief?: true; main?: true }

const STRATEGY_TEXT: Record<string, string> = { endure: 'ENDURE', spare: 'SPARE STRENGTH', cheat: 'EASE THE BODY IN SECRET', rest: 'ASK FOR A REST' };
const PART_LABEL = (p: string): string => p.toUpperCase();
/** The buttons each interaction offers (turn-based) or answers to (real time). A wait is a beat with no input. */
function controlsOf(interaction: string, run: PhysicsRun): Control[] {
  switch (interaction) {
    case 'timing': return [
      { kind: 'breathe', text: '[ BREATHE ]', main: true },
      ...(run.seal === 'leaky' && run.physicsId === 'breath' ? [{ kind: 'gap_breath' as const, text: '[ BREATHE THROUGH THE GAP ]', relief: true as const }] : []),
    ];
    case 'hold': return [{ kind: 'hold', text: '[ HOLD STILL ]', main: true }, { kind: 'shift_weight', text: '[ SHIFT HER WEIGHT BACK ]', relief: true }];
    case 'decision': return [{ kind: 'mouth_breath', text: '[ BREATHE THROUGH THE MOUTH ]', relief: true }];
    case 'order': return TUNING.physics.tongue.parts.map((p, i) => ({ kind: 'part' as const, text: `[ ${PART_LABEL(p)} ]`, part: p, ...(i === 0 ? { main: true as const } : {}) }));
    case 'gesture': return [{ kind: 'ask_rest', text: '[ ASK FOR A REST ]' }];
    default: return [];
  }
}

/** Where each host stands in a turn-based segment: the run, the segment and the beat the next press lands on. */
const pointers = new WeakMap<HTMLElement, { key: string; beat: number }>();
const keyHandlers = new WeakMap<HTMLElement, { down: (e: Event) => void; up: (e: Event) => void }>();
/** Stops the interval of a hold that is kept down (a hold that ends, a panel that goes). */
function letGoOf(host: HTMLElement): void {
  const t = holding.get(host);
  if (t !== undefined) clearInterval(t);
  holding.delete(host);
}

/** The beat the next press of a turn-based segment lands on (0 when the host shows no segment): a typed message lapses beats from there. */
export function panelBeat(host: HTMLElement): number {
  return pointers.get(host)?.beat ?? 0;
}

/** Real time: a hold that is kept down registers again on every beat until it is let go. */
const holding = new WeakMap<HTMLElement, ReturnType<typeof setInterval>>();

/**
 * The physics panel of the scene screen (P15a): what the body does in a hold and what the commander can do about it. Turn-based, each press is
 * one beat (a wait is a beat with no input) and the segment ends when its beats are used up; in real time a press lands on the beat the clock
 * is at and Space is the main input. The tap and the stop word are always there, enabled, running or held. Her cue for the beat about to be
 * played is shown as a line; the air and the strain drive the screen through `--alius-air` and `--alius-strain`, a tremor that a reduced
 * motion setting or the readable mode turns into a static tint. No number is shown unless raw values are on. Inputs go to the staging
 * controller, never through `stage` (a hold is not rolled back by a swipe).
 */
export function renderPhysicsPanel(host: HTMLElement, ctx: PhysicsPanelCtx): boolean {
  const { state, registries: reg, staging } = ctx;
  const run = state?.scene && blockingLive(state, reg) ? state.scene.physics : undefined;
  const exposures = state && !run ? exposedKinds(state, reg) : [];
  const acts = state && !run ? actsFor(state, reg) : [];
  // the stop word must be reachable whenever something holds the commander: a contact or anything worn, hold or not (review)
  const held = state && !run && state.scene && blockingLive(state, reg)
    && (contactOf(state.scene) !== undefined || Object.keys(blockingOf(state.scene, COMMANDER).worn ?? {}).length > 0);
  if (state && !run && (exposures.length > 0 || acts.length > 0 || held)) {
    letGoOf(host);
    unwireKeys(host);
    drawWays(host, ctx, exposures);
    return true;
  }
  if (!state || !run) {
    letGoOf(host);
    unwireKeys(host);
    host.replaceChildren();
    pointers.delete(host);
    return false;
  }
  const phys = reg.contactPhysics.get(run.physicsId);
  const interaction = String(phys?.interaction ?? '');
  const realtime = ctx.settings.physicsRealtime === true;
  const running = run.segment.state === 'running' && run.segment.plan !== undefined;
  const total = run.segment.plan?.beats.length ?? 0;
  const key = `${run.id}|${run.segment.n}`;
  if (pointers.get(host)?.key !== key) pointers.set(host, { key, beat: 0 });
  const pointer = pointers.get(host)!;

  const letGo = (): void => {
    const t = holding.get(host);
    if (t !== undefined) clearInterval(t);
    holding.delete(host);
  };
  const stamp = (physics: string) => analyzeNative(`contactPhysics:${run.physicsId}`, { input: physics });
  /** Registers an input (turn-based: at the pointer, which then moves; real time: at the beat the clock is at). */
  const press = (c: Control): void => {
    if (!running) return;
    if (realtime) {
      if (c.kind === 'wait') return;
      staging.input({ beat: staging.beat(), kind: c.kind });
      if (c.kind === 'hold' && !holding.has(host)) holding.set(host, setInterval(() => staging.input({ beat: staging.beat(), kind: 'hold' }), TUNING.physics.beatMs));
      return;
    }
    if (c.kind !== 'wait') staging.input({ beat: pointer.beat, kind: c.kind, ...(c.part !== undefined ? { part: c.part } : {}) });
    pointer.beat += 1;
    if (pointer.beat >= total) {
      pointers.set(host, { key, beat: 0 });
      staging.endSegment();
    }
  };

  const secondPhys = run.second ? reg.contactPhysics.get(run.second.physicsId) : undefined;
  const owned = running ? [...controlsOf(interaction, run), ...(run.second && secondPhys ? controlsOf(String(secondPhys.interaction), { ...run, physicsId: run.second.physicsId, ...(run.second.seal ? { seal: run.second.seal } : {}) }) : [])] : [];
  const controls: Control[] = running ? [...owned.filter((c, i) => owned.findIndex((o) => o.kind === c.kind && o.part === c.part) === i), { kind: 'wait', text: '[ WAIT ]' }] : [];
  const button = (c: Control): HTMLElement => btn(ctx, {
    type: 'button', class: 'alius-btn alius-option alius-physics-input', 'data-input': c.kind, ...(c.part !== undefined ? { 'data-part': c.part } : {}), ...stamp(c.kind),
    ...(realtime ? { onpointerdown: () => press(c), onpointerup: () => letGo(), onpointerleave: () => letGo() } : { onclick: () => press(c) }),
  }, c.text);

  const remaining = remainingOf(reg, run);
  const reduced = motionReduced(ctx.settings) || ctx.settings.readableMode;
  const strain = 1 - remaining;
  const tremor = running && strain >= 0.7 && !reduced;
  const tint = strain >= 0.7 && reduced;
  const cue = running ? run.segment.plan!.beats[Math.min(pointer.beat, total - 1)]?.cue : undefined;
  const cueLine = cue !== undefined ? staging.cue(cue, pointer.beat) : null;
  const gauge = (reg.contactPhysics.get(run.physicsId)?.gauge as { kind: string } | undefined)?.kind;

  const label = [phys?.label ?? run.physicsId, ...(secondPhys ? [secondPhys.label] : [])].map((x) => String(x));
  // what the card holds besides its cue and its controls, named so both looks can order them explicitly (review M6)
  const clock = run.marathon ? h('p', { class: 'alius-physics-clock', ...analyzeAttrs('glossary:marathon') }, run.marathon.hours === 'unknown' ? `${clockText(run.marathon.clockMin)} …` : `${clockText(run.marathon.clockMin)}`) : null;
  const summary = run.marathon?.summary !== undefined ? h('p', { class: 'alius-physics-summary alius-dim' }, run.marathon.summary) : null;
  const strategies = run.marathon?.waiting ? h('div', { class: 'alius-physics-strategies', role: 'group', 'aria-label': 'How to spend the stretch' },
    ...STRATEGIES.map((st) => btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-physics-strategy', 'data-strategy': st, ...analyzeNative('glossary:marathon_strategy', { strategy: st }), onclick: () => { staging.skip(st); } }, `[ ${STRATEGY_TEXT[st]} ]`))) : null;
  const heldLine = run.segment.state === 'held' && !run.marathon?.waiting ? h('p', { class: 'alius-physics-held alius-dim', role: 'status' }, 'She takes her time.') : null;
  const cueEl = cueLine !== null && cueLine !== '' ? h('p', { class: 'alius-physics-cue', role: 'status' }, cueLine) : null;
  const beats = running && !realtime ? h('div', { class: 'alius-physics-beats', 'aria-hidden': 'true' }, ...Array.from({ length: total }, (_, i) => h('span', { class: i < pointer.beat ? 'alius-pip alius-pip-done' : 'alius-pip' }, i < pointer.beat ? '●' : '○'))) : null;
  const raw = ctx.settings.showRawValues ? h('p', { class: 'alius-physics-raw alius-dim' }, `${gauge ?? 'gauge'}: ${Math.round(run.gauge)} / ${run.capacity}`) : null;
  const ways = wayGroups(ctx, exposedKinds(state, reg));
  const controlEls = [
    ...controls.map(button),
    btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-physics-tap', 'data-action': 'tap', ...analyzeNative('glossary:tap_signal'), onclick: () => ctx.onTap() }, '[ TAP ]'),
    ...(ctx.stopWord !== false ? [btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-physics-stop', 'data-action': 'stop-word', ...analyzeNative('glossary:stop_word'), onclick: () => { staging.stopWord(); } }, '[ STOP WORD ]')] : []),
  ];
  const cls = `alius-physics${tremor ? ' alius-physics-tremor' : ''}${tint ? ' alius-physics-tint' : ''}`;
  let root: HTMLElement;
  if (ctx.look === 'scene') {
    // the fallback hold in the scene (cards.html, case `physics`): a neutral card, the kind, her cue as its prose; what else it holds; the controls as pills
    root = sceneCard({
      kind: 'a hold', kindId: 'physics', conditions: [], answers: [h('div', { class: 'alius-physics-controls' }, ...controlEls)], gist: gistOf({ kind: 'physics', label: label.join(' + ').toLowerCase() }) ?? '',
      ...(cueLine !== null && cueLine !== '' ? { prose: cueLine } : {}), extra: [clock, summary, strategies, heldLine, beats, raw, ...ways].filter((p): p is HTMLElement => p !== null),
    });
    root.classList.add(...cls.split(' '));
    root.setAttribute('role', 'group');
    root.setAttribute('aria-label', 'A hold');
    root.setAttribute('data-run', run.id);
  } else {
    root = h('div', { class: cls, role: 'group', 'aria-label': 'A hold', 'data-run': run.id },
      h('div', { class: 'alius-physics-title' }, `[ ${label.map((x) => x.toUpperCase()).join(' + ')} ]`),
      clock, summary, strategies, heldLine, cueEl, beats, raw, ...ways,
      h('div', { class: 'alius-physics-controls' }, ...controlEls));
  }
  root.style.setProperty('--alius-air', String(Math.round(remaining * 100) / 100));
  root.style.setProperty('--alius-strain', String(Math.round(strain * 100) / 100));
  host.replaceChildren(root);

  host.dataset.realtime = realtime ? '1' : '0';
  wireKeys(host);
  return true;
}

/**
 * Space is the main input, from anywhere on the page (the host is a plain div that never has the focus): one pair of listeners on the document
 * per host while a run is shown, removed when the panel goes or the host leaves the page. The mode is read when the key is pressed. A text
 * field keeps its spaces; in turn-based play a focused button takes Space natively, so it is left alone there.
 */
function wireKeys(host: HTMLElement): void {
  if (keyHandlers.has(host)) return;
  const typing = (t: HTMLElement | null): boolean => t !== null && (/^(input|textarea|select)$/i.test(t.tagName) || t.isContentEditable);
  const down = (e: Event): void => {
    if (!host.isConnected) { unwireKeys(host); return; }
    const ev = e as KeyboardEvent;
    const t = ev.target as HTMLElement | null;
    const realtime = host.dataset.realtime === '1';
    if (ev.key !== ' ' || typing(t) || (!realtime && t !== null && /^button$/i.test(t.tagName))) return;
    const main = host.querySelector<HTMLElement>('.alius-physics-input[data-input]');
    if (!main) return;
    ev.preventDefault();
    if (ev.repeat) return; // a held key is one press: the interval of the hold registers the rest
    main.dispatchEvent(new Event(realtime ? 'pointerdown' : 'click', { bubbles: true }));
  };
  const up = (e: Event): void => {
    if ((e as KeyboardEvent).key !== ' ') return;
    const t = holding.get(host);
    if (t !== undefined) clearInterval(t);
    holding.delete(host);
  };
  keyHandlers.set(host, { down, up });
  document.addEventListener('keydown', down);
  document.addEventListener('keyup', up);
}

function unwireKeys(host: HTMLElement): void {
  const k = keyHandlers.get(host);
  if (!k) return;
  document.removeEventListener('keydown', k.down);
  document.removeEventListener('keyup', k.up);
  keyHandlers.delete(host);
}

const WAY_BUTTONS: Array<{ way: string; text: string; family: 'body' | 'taste'; depth?: string }> = [
  { way: 'avoid', text: '[ AVOID ]', family: 'body' }, { way: 'sniff', text: '[ SNIFF ]', family: 'body' },
  { way: 'nuzzle', text: '[ NUZZLE ]', family: 'body' }, { way: 'taste', text: '[ TASTE ]', family: 'taste' },
  { way: 'secret', text: '[ IN SECRET ]', family: 'body' },
];
const DEPTHS: Array<[string, string]> = [['shallow', '[ SHALLOW INHALE ]'], ['deep', '[ DEEP INHALE ]'], ['very_deep', '[ VERY DEEP INHALE ]']];
const inhaling = new WeakMap<HTMLElement, number>();

/** The ways the commander can take what reaches the body: one group per kind. The deep inhale is three depths turn-based, and a bar held down and released in real time. */
function wayGroups(ctx: PhysicsPanelCtx, exposures: ReturnType<typeof exposedKinds>): HTMLElement[] {
  const { registries: reg, staging } = ctx;
  const realtime = ctx.settings.physicsRealtime === true;
  const now = ctx.now ?? Date.now;
  const inhaleOn = ctx.settings.physicsInteractions?.inhale !== false;
  return exposures.map((ex) => {
    const kind = reg.stimulusKinds.get(ex.kind);
    const taste = kind?.family === 'taste';
    const stamp = (way: string) => analyzeNative(`stimulusKinds:${ex.kind}`, { way });
    const plain = WAY_BUTTONS.filter((b) => (b.family === 'taste') === taste || b.way === 'avoid' || b.way === 'secret').filter((b) => !(taste && (b.way === 'sniff' || b.way === 'nuzzle')));
    const push = (way: string, depth?: number | string) => () => { staging.stimulus(way, ex.kind, depth); };
    const inhale: HTMLElement[] = taste || !inhaleOn ? [] : realtime
      ? [btn(ctx, {
        type: 'button', class: 'alius-btn alius-option alius-way', 'data-way': 'inhale', ...stamp('inhale'),
        onpointerdown: (e: Event) => { inhaling.set(e.currentTarget as HTMLElement, now()); },
        onpointerup: (e: Event) => {
          const t = inhaling.get(e.currentTarget as HTMLElement);
          inhaling.delete(e.currentTarget as HTMLElement);
          if (t !== undefined) staging.stimulus('inhale', ex.kind, Math.min(100, Math.round(((now() - t) / TUNING.stimuli.inhale.fillMs) * 100)));
        },
      }, '[ HOLD TO INHALE ]')]
      : DEPTHS.map(([d, text]) => btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-way', 'data-way': 'inhale', 'data-depth': d, ...stamp('inhale'), onclick: push('inhale', d) }, text));
    return h('div', { class: 'alius-physics-ways', 'data-kind': ex.kind, role: 'group', 'aria-label': String(kind?.label ?? ex.kind) },
      h('span', { class: 'alius-dim' }, `${String(kind?.label ?? ex.kind)}: `),
      ...plain.map((b) => btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-way', 'data-way': b.way, ...stamp(b.way), onclick: push(b.way) }, b.text)),
      ...inhale);
  }) as HTMLElement[];
}

/** The panel with no hold running: only what reaches the body, and the stop word (which ends the contact all the same). */
function drawWays(host: HTMLElement, ctx: PhysicsPanelCtx, exposures: ReturnType<typeof exposedKinds>): void {
  const ways = wayGroups(ctx, exposures);
  const acts = actRow(host, ctx);
  const own = ctx.stopWord !== false;
  // the scene draws the stop word at the dial: a body held with nothing else to offer leaves no card at all
  if (!own && ways.length === 0 && acts.length === 0) {
    host.replaceChildren();
    return;
  }
  if (ctx.look === 'scene') {
    const card = sceneCard({
      kind: 'what reaches the body', kindId: 'ways', conditions: [], extra: [...ways, ...acts], gist: 'what reaches the body',
      answers: own ? [h('div', { class: 'alius-physics-controls' }, btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-physics-stop', 'data-action': 'stop-word', ...analyzeNative('glossary:stop_word'), onclick: () => { ctx.staging.stopWord(); } }, '[ STOP WORD ]'))] : [],
    });
    card.classList.add('alius-physics');
    card.setAttribute('role', 'group');
    card.setAttribute('aria-label', 'What reaches the body');
    host.replaceChildren(card);
    return;
  }
  host.replaceChildren(h('div', { class: 'alius-physics', role: 'group', 'aria-label': 'What reaches the body' },
    h('div', { class: 'alius-physics-title' }, 'WHAT REACHES THE BODY'),
    ...ways,
    ...acts,
    own ? h('div', { class: 'alius-physics-controls' },
      btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-physics-stop', 'data-action': 'stop-word', ...analyzeNative('glossary:stop_word'), onclick: () => { ctx.staging.stopWord(); } }, '[ STOP WORD ]')) : null));
}

const ACT_TEXT: Record<string, string> = {
  kiss: '[ KISS ]', counted: '[ COUNTED KISSES ]', long: '[ LONG KISS ]', lick: '[ LICK ]', pet: '[ PET ]', mouth: '[ TAKE IN THE MOUTH ]',
};
/** The commander's own tally of counted kisses (shown to the player who keeps it; the number she asked for is hers). */
const tallies = new WeakMap<HTMLElement, number>();

/** The acts of the mouth a contact offers; while kisses are being counted: a counter, a field for the count and FINISH. */
function actRow(host: HTMLElement, ctx: PhysicsPanelCtx): HTMLElement[] {
  const state = ctx.state;
  if (!state) return [];
  const counting = state.scene?.act;
  if (counting) {
    const tally = tallies.get(host) ?? 0;
    const field = h('input', { type: 'number', name: 'counted', class: 'alius-input alius-num', 'aria-label': 'The count', min: '0', step: '1' }) as HTMLInputElement;
    return [h('div', { class: 'alius-physics-acts alius-physics-count', role: 'group', 'aria-label': 'Counted kisses' },
      btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-act', 'data-act': 'tally', ...analyzeNative('glossary:counted_kisses'), onclick: () => { tallies.set(host, tally + 1); renderPhysicsPanel(host, ctx); } }, `[ KISS ] ${tally}`),
      field,
      btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-act', 'data-act': 'finish', ...analyzeNative('glossary:counted_kisses'), onclick: () => {
        const n = Number(field.value);
        tallies.delete(host);
        if (field.value.trim() !== '' && Number.isFinite(n)) {
          field.value = '';
          ctx.staging.finishCounted(n);
        }
      } }, '[ FINISH ]'))];
  }
  const acts = actsFor(state, ctx.registries);
  if (acts.length === 0) return [];
  return [h('div', { class: 'alius-physics-acts', role: 'group', 'aria-label': 'Acts of the mouth' },
    ...acts.map((k) => btn(ctx, { type: 'button', class: 'alius-btn alius-option alius-act', 'data-act': k, ...analyzeNative('glossary:mouth_act', { kind: k }), onclick: () => { tallies.delete(host); ctx.staging.act(k); } }, ACT_TEXT[k] ?? k)))];
}
