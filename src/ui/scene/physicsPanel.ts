import type { Registries } from '../../content/types';
import { blockingLive } from '../../engine/blocking';
import type { CueKind } from '../../engine/blocking/types';
import type { EngineEvent } from '../../engine/dispatch';
import { remainingOf } from '../../engine/physics/run';
import type { InputKind, PhysicsRun, SegmentInput } from '../../engine/physics/state';
import type { CampaignState } from '../../engine/state/types';
import { TUNING } from '../../engine/tuning';
import type { AliusSettings } from '../../settings';
import { analyzeNative } from '../analyze/mark';
import { h } from '../dom';
import { motionReduced } from '../motion';

/** What the panel needs of the staging controller (the controller passes it as it is). */
export interface PhysicsPanelStaging {
  input(i: SegmentInput): void;
  endSegment(): EngineEvent[];
  stopWord(): EngineEvent[];
  cue(kind: CueKind, beat: number): string | null;
  beat(): number;
}

export interface PhysicsPanelCtx {
  state: CampaignState | null;
  registries: Registries;
  settings: AliusSettings;
  staging: PhysicsPanelStaging;
  /** The tap: the signal inside the fiction (`physics/signal`, dispatched straight to the engine, never staged). */
  onTap: () => void;
}

interface Control { kind: InputKind | 'wait'; text: string; part?: string; relief?: true; main?: true }

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
const wired = new WeakSet<HTMLElement>();
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
export function renderPhysicsPanel(host: HTMLElement, ctx: PhysicsPanelCtx): void {
  const { state, registries: reg, staging } = ctx;
  const run = state?.scene && blockingLive(state, reg) ? state.scene.physics : undefined;
  if (!state || !run) {
    const t = holding.get(host);
    if (t !== undefined) clearInterval(t);
    holding.delete(host);
    host.replaceChildren();
    pointers.delete(host);
    return;
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
  const button = (c: Control): HTMLElement => h('button', {
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

  const root = h('div', {
    class: `alius-physics${tremor ? ' alius-physics-tremor' : ''}${tint ? ' alius-physics-tint' : ''}`, role: 'group', 'aria-label': 'A hold', 'data-run': run.id,
  },
    h('div', { class: 'alius-physics-title' }, `[ ${[phys?.label ?? run.physicsId, ...(secondPhys ? [secondPhys.label] : [])].map((x) => String(x).toUpperCase()).join(' + ')} ]`),
    run.segment.state === 'held' ? h('p', { class: 'alius-physics-held alius-dim', role: 'status' }, 'She takes her time.') : null,
    cueLine !== null && cueLine !== '' ? h('p', { class: 'alius-physics-cue', role: 'status' }, cueLine) : null,
    running && !realtime ? h('div', { class: 'alius-physics-beats', 'aria-hidden': 'true' }, ...Array.from({ length: total }, (_, i) => h('span', { class: i < pointer.beat ? 'alius-pip alius-pip-done' : 'alius-pip' }, i < pointer.beat ? '●' : '○'))) : null,
    ctx.settings.showRawValues ? h('p', { class: 'alius-physics-raw alius-dim' }, `${gauge ?? 'gauge'}: ${Math.round(run.gauge)} / ${run.capacity}`) : null,
    h('div', { class: 'alius-physics-controls' },
      ...controls.map(button),
      h('button', { type: 'button', class: 'alius-btn alius-option alius-physics-tap', 'data-action': 'tap', ...analyzeNative('glossary:tap_signal'), onclick: () => ctx.onTap() }, '[ TAP ]'),
      h('button', { type: 'button', class: 'alius-btn alius-option alius-physics-stop', 'data-action': 'stop-word', ...analyzeNative('glossary:stop_word'), onclick: () => { staging.stopWord(); } }, '[ STOP WORD ]')),
  ) as HTMLElement;
  root.style.setProperty('--alius-air', String(Math.round(remaining * 100) / 100));
  root.style.setProperty('--alius-strain', String(Math.round(strain * 100) / 100));
  host.replaceChildren(root);

  // Space is the main input (not while a text field has the keys)
  if (!wired.has(host)) {
    wired.add(host);
    host.addEventListener('keydown', (e) => {
      const ev = e as KeyboardEvent;
      const t = ev.target as HTMLElement | null;
      if (ev.key !== ' ' || (t && /^(input|textarea|select|button)$/i.test(t.tagName))) return;
      const main = host.querySelector<HTMLElement>('.alius-physics-input[data-input]');
      if (!main) return;
      ev.preventDefault();
      main.dispatchEvent(new Event(realtime ? 'pointerdown' : 'click', { bubbles: true }));
    });
    host.addEventListener('keyup', (e) => {
      if ((e as KeyboardEvent).key !== ' ') return;
      const t = holding.get(host);
      if (t !== undefined) clearInterval(t);
      holding.delete(host);
    });
  }
}
