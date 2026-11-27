/**
 * P10e-e: the instruments' interfaces. An instrument is a mini-game of the body drawn over the scene's frame while a physics run is live in
 * real time (`host.ts` decides when); it plays her rhythm from the engine's plan and reports the commander's inputs through the staging
 * controller. The stop word is never the instrument's: the scene's pill ends the run whatever the instrument does.
 */
import type { Registries } from '../../../content/types';
import type { PostureRun } from '../../../engine/craft/state';
import type { PhysicsRun } from '../../../engine/physics/state';
import type { CampaignState } from '../../../engine/state/types';
import type { AliusSettings } from '../../../settings';
import type { SampleSound } from '../../sound/samples';
import type { ArtSlots } from '../art';
import type { PhysicsPanelStaging } from '../physicsPanel';
import type { InputGauge } from '../stage/gauge';
import type { SayOpts } from './kit/hand';

/** How she looks on the frame: her name, her accent colour, her hand (a CSS family) and its measured size factor, her lead physics style. */
export interface HerLook {
  unitId: string;
  name: string;
  accent: string;
  hand: string;
  handScale: number;
  style: string;
}

/**
 * What an instrument is given (built once per scene by the scene screen; the host scopes `raf` and `staging` to one mount). The env an
 * instrument receives is an `Object.create` view over the scene's env (`reduced` and `readable` are live getters): read its fields, never
 * spread or copy it.
 */
export interface InstrumentEnv {
  /** The scene's root (`.alius-scene`). */
  root: HTMLElement;
  layers: { pose: HTMLElement; effects: HTMLElement; moment: HTMLElement; frame: HTMLElement; backdrop: HTMLElement; sprites: HTMLElement };
  /** The command line's text field (`input[name="cmd"]`): Space and Shift typed into it never act. */
  input: HTMLElement;
  /** The reply block (the prose subtitles). */
  reply: HTMLElement;
  /** The input line as a gauge surface (P10e §5). */
  gauge: InputGauge;
  /**
   * Her sprite's picture now. The scene replaces the `<img>` on every redraw (`drawSprites`): re-query it every frame, never keep it, and
   * never transform it; move `layers.sprites` (or a wrapper of the instrument's own inside it) instead.
   */
  spriteOf(unitId: string): HTMLImageElement | null;
  /**
   * Shows her sprite of a label. With `url` (a picture already resolved through `spriteUrl`) it is shown at once, with nothing in between;
   * without, the scene resolves it (the avatar meanwhile, as her replies do). The label stays until her next reply sets another.
   */
  setSprite(unitId: string, label: string, url?: string): void;
  /** The label her face shows now (her last reply's, or one an instrument set; `neutral` before any). */
  faceOf(unitId: string): string;
  /** The picture of her sprite for a label (null: she has none for it); its decoding is the caller's. */
  spriteUrl(unitId: string, label: string): Promise<string | null>;
  state(): CampaignState;
  registries: Registries;
  settings(): AliusSettings;
  staging: PhysicsPanelStaging;
  /**
   * The recorded sounds (null = silent). A mount's view records the loops it starts and the sources it makes on `ctx()` (stopped at the
   * unmount) and puts the world's dullness back; `dispose`, `setNight`, `setMuffle` and `setSensory` do nothing there (they are the app's).
   */
  samples: SampleSound | null;
  /** The author's pictures per slot (null answers fall back as each README says). */
  art: ArtSlots;
  her(unitId: string): HerLook;
  /**
   * Her line on the frame (`kit/hand.ts`'s `say`). An instrument writes through this, not the kit's `say`: the host clears, at the unmount,
   * the hosts this mount wrote to and no other (another surface's lines in the same layer stay).
   */
  say(host: HTMLElement, text: string, opts: SayOpts): HTMLElement;
  /** The frame clock (the `raf` timestamps' clock). The plan's beats are placed in wall time through `staging.clock()`. */
  now(): number;
  raf(fn: FrameRequestCallback): number;
  cancelRaf(id: number): void;
  /** A timer (returns its cancel); a mount's are cleared at its unmount. */
  timeout(fn: () => void, ms: number): () => void;
  /** A listener on any target (the document included; returns its removal); a mount's are removed at its unmount. */
  listen(target: EventTarget, type: string, fn: EventListener, opts?: AddEventListenerOptions | boolean): () => void;
  /** `motionReduced(settings)`: the instrument draws its still form. */
  reduced: boolean;
  /** Readable mode: no blur. */
  readable: boolean;
  /** The tap (P15a's `physics/signal`, the signal inside the fiction): dead from the end of the run. Absent = no tap here. */
  tap?(): void;
  /** P10e-e e10 M4: asks the scene to draw again now (a picture failed: the card takes the run at once). Absent = the next redraw. */
  redraw?(): void;
  /** An extension-relative path as a URL the page can load (the scene's `assetUrl`). Absent = the path as it is. */
  assetUrl?(path: string): string;
}

/** How a run ended (the engine's `physics_outcome`), handed to `InstrumentRun.finish`. */
export interface PhysicsEnd {
  runId: string;
  physicsId: string;
  /** The engine's `Outcome`: released, checked, limit_broken, blackout, stopped, collapse. */
  result: string;
  /** The run's tally as the outcome carried it (R28: what she perceived), when it had one. */
  tally?: Record<string, number>;
}

export interface InstrumentRun {
  /** The run changed (a redraw of the scene): the same run id. */
  update(run: PhysicsRun): void;
  /**
   * The run ended (it is gone from the state): how many ms to keep drawing its end (an exit, a blackout, a wake) before the host unmounts.
   * The staging is already dead (no input reaches the engine); frames, timers and listeners still run until the unmount. Absent or 0 =
   * unmount at once. A new run, a scene end, a chat switch, a stage reset and dispose still unmount at once.
   */
  finish?(end: PhysicsEnd): number;
  /** Leaves nothing behind: no timer, frame, audio node or document listener; the frame and the input restored. */
  stop(): void;
}

export interface InstrumentDef {
  id: string;
  matches(run: PhysicsRun, state: CampaignState, reg: Registries): boolean;
  /**
   * P10e-e Task 28: whether it can draw this run on this scene (its art exists, none failed to load). Absent = yes; false = the card plays the
   * run (asked at every redraw, so a picture that failed hands the run to the card at the next one).
   */
  drawable?(env: InstrumentEnv, run: PhysicsRun): boolean;
  start(env: InstrumentEnv, run: PhysicsRun): InstrumentRun;
}

/**
 * P16b Task 23: an instrument that plays a hold of a posture (`practices.postureRun`, not a contact physics). It is mounted like any instrument (the same env, the same undo at the unmount) while
 * the hold is open and no physics instrument is drawing; the host asks it only for the hold. `finish` is asked once the hold is gone from the state and says for how many ms the mount stays to
 * play its end (its release line); the instrument itself knows whether it ended the hold (a stop word ends it with no end to play).
 */
export interface PostureInstrumentRun {
  update(run: PostureRun): void;
  finish?(): number;
  stop(): void;
}

export interface PostureInstrumentDef {
  id: string;
  /** Tells the host this is not a physics instrument. */
  posture: true;
  matches(run: PostureRun, state: CampaignState, reg: Registries): boolean;
  start(env: InstrumentEnv, run: PostureRun): PostureInstrumentRun;
}
