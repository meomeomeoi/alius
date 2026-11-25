/**
 * P10e-e: the instrument host. While a physics run is live, real time is on (`settings.physicsRealtime`) and the run's interaction is not
 * switched off, the first registered instrument that matches the run draws it instead of the physics card. One instrument runs at a time;
 * it is started once per run (a scene's run ids repeat, so the key carries the scene id) and updated on each redraw; a new run, no run, a
 * new scene, a stage reset (chat switch) and the screen's dispose stop it. Each mount gets its own `raf` and `staging`: after the stop,
 * every frame it left is cancelled and every late staging call goes nowhere, so nothing reaches the next run or the next chat.
 */
import type { Registries } from '../../../content/types';
import type { PhysicsRun } from '../../../engine/physics/state';
import type { CampaignState } from '../../../engine/state/types';
import type { AliusSettings } from '../../../settings';
import { analyzeAttrs } from '../../analyze/mark';
import { h } from '../../dom';
import type { PhysicsPanelStaging } from '../physicsPanel';
import { unsay } from './kit/hand';
import { heartStop } from './kit/heart';
import type { InstrumentDef, InstrumentEnv, InstrumentRun } from './types';

const defs: InstrumentDef[] = [];

/** Registers an instrument (once per id); the first that matches a run wins, in the order of registration. */
export function registerInstrument(def: InstrumentDef): void {
  if (!defs.some((d) => d.id === def.id)) defs.push(def);
}

/** Tests only: forgets every registered instrument. */
export function _resetInstrumentDefs(): void {
  unmountInstruments();
  defs.length = 0;
  failed = null;
  warned.clear();
}

/** The instrument that draws this run, or null (real time off, the run's interaction switched off, or none matches): then the card is drawn. */
export function instrumentFor(run: PhysicsRun, state: CampaignState, reg: Registries, settings: AliusSettings): InstrumentDef | null {
  if (settings.physicsRealtime !== true) return null;
  const interaction = String(reg.contactPhysics.get(run.physicsId)?.interaction ?? '');
  if ((settings.physicsInteractions as Record<string, boolean> | undefined)?.[interaction] === false) return null;
  return defs.find((d) => {
    try {
      return d.matches(run, state, reg);
    } catch (err) {
      warnOnce(d.id, 'matches', err); // a throwing matches never aborts the refresh: the next definition is asked, else the card draws
      return false;
    }
  }) ?? null;
}

interface Mounted {
  key: string;
  def: InstrumentDef;
  env: InstrumentEnv;
  run: InstrumentRun | null;
  alive: { on: boolean };
  frames: Set<number>;
  mark: HTMLElement;
}
let current: Mounted | null = null;
/** The mount (`key|def`) whose start or update threw: it is not started again (the card draws that run instead). */
let failed: string | null = null;
const warned = new Set<string>();
/** An instrument that throws never blanks the frame: it is stopped, warned about once per id, and the card draws the run. */
function warnOnce(id: string, what: string, err: unknown): void {
  if (warned.has(`${id}|${what}`)) return;
  warned.add(`${id}|${what}`);
  console.warn(`[Alius] the instrument "${id}" failed in ${what}; the card plays the hold instead.`, err);
}

/** A staging scoped to one mount: dead after the stop (no late input, segment end or stop word reaches the engine). */
function scopedStaging(staging: PhysicsPanelStaging, alive: { on: boolean }): PhysicsPanelStaging {
  return {
    input: (i) => { if (alive.on) staging.input(i); },
    endSegment: () => (alive.on ? staging.endSegment() : []),
    stopWord: () => (alive.on ? staging.stopWord() : []),
    skip: (s) => (alive.on ? staging.skip(s) : []),
    stimulus: (w, k, d) => (alive.on ? staging.stimulus(w, k, d) : []),
    act: (k) => (alive.on ? staging.act(k) : []),
    finishCounted: (n) => (alive.on ? staging.finishCounted(n) : []),
    cue: (k, b) => (alive.on ? staging.cue(k, b) : null),
    beat: () => staging.beat(),
    clock: () => staging.clock(),
  };
}

function mount(env: InstrumentEnv, def: InstrumentDef, run: PhysicsRun, key: string): void {
  const alive = { on: true };
  const frames = new Set<number>();
  const scoped: InstrumentEnv = Object.create(env, {
    staging: { value: scopedStaging(env.staging, alive) },
    raf: {
      value: (fn: FrameRequestCallback): number => {
        if (!alive.on) return 0;
        const id = env.raf((t) => {
          frames.delete(id);
          if (alive.on) fn(t);
        });
        frames.add(id);
        return id;
      },
    },
    cancelRaf: { value: (id: number): void => { frames.delete(id); env.cancelRaf(id); } },
  }) as InstrumentEnv;
  const mark = h('div', { class: 'alius-instrument', 'data-instrument': def.id, ...analyzeAttrs('glossary:instrument') });
  mark.removeAttribute('tabindex'); // a mark of what plays, never a stop on the keyboard path
  if (env.reduced) mark.dataset.reduced = '';
  if (env.readable) mark.dataset.readable = '';
  env.layers.moment.append(mark);
  env.root.querySelector<HTMLElement>('.alius-stage-dial')?.setAttribute('data-instrument', def.id);
  current = { key, def, env, run: null, alive, frames, mark };
  current.run = def.start(scoped, run); // a throw is caught by syncInstruments
}

/** Stops the instrument that runs (if any): it is told to stop, then every frame it left is cancelled and its staging goes dead. */
export function unmountInstruments(): void {
  const m = current;
  if (!m) return;
  current = null;
  try {
    m.run?.stop();
  } catch (err) {
    warnOnce(m.def.id, 'stop', err);
  } finally {
    // the host restores what every instrument shares, whatever its own stop did: frames, staging, her lines, the heart, the input line
    m.alive.on = false;
    for (const id of m.frames) m.env.cancelRaf(id);
    m.frames.clear();
    for (const layer of Object.values(m.env.layers)) unsay(layer);
    unsay(m.mark);
    m.mark.remove();
    if (m.env.samples) heartStop(m.env.samples);
    m.env.gauge.clear();
    m.env.root.querySelector<HTMLElement>('.alius-stage-dial')?.removeAttribute('data-instrument');
  }
}

/**
 * A chat switch (`resetSceneStage`): stops the instrument and forgets which mount failed. The failed mount is keyed by scene and run id,
 * which repeat across campaigns, so it must not keep the next chat's instrument from starting.
 */
export function resetInstruments(): void {
  unmountInstruments();
  failed = null;
  // `warned` stays: it is keyed by the instrument's id (not a scene), and it only keeps a broken instrument from filling the console once per
  // chat; a fresh failure after the switch still draws the card, it is just not warned about again
}

/**
 * Draws (or stops) the instrument for this run. Returns true when an instrument is drawing (the scene then draws no card); false when the
 * card should be drawn (no run, real time off, the interaction switched off, or no instrument matches).
 */
export function syncInstruments(env: InstrumentEnv, run: PhysicsRun | undefined): boolean {
  const state = run ? env.state() : null;
  const def = run && state ? instrumentFor(run, state, env.registries, env.settings()) : null;
  if (!run || !def) {
    unmountInstruments();
    return false;
  }
  const key = `${state!.scene?.id ?? ''}|${run.id}`;
  const mountKey = `${key}|${def.id}`;
  if (failed === mountKey) {
    unmountInstruments();
    return false;
  }
  if (current && current.key === key && current.def === def && current.env === env) {
    try {
      current.run?.update(run);
      return true;
    } catch (err) {
      warnOnce(def.id, 'update', err);
      failed = mountKey;
      unmountInstruments();
      return false;
    }
  }
  unmountInstruments();
  try {
    mount(env, def, run, key);
    return true;
  } catch (err) {
    warnOnce(def.id, 'start', err);
    failed = mountKey;
    unmountInstruments();
    return false;
  }
}
