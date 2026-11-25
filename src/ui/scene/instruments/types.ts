/**
 * P10e-e: the instruments' interfaces. An instrument is a mini-game of the body drawn over the scene's frame while a physics run is live in
 * real time (`host.ts` decides when); it plays her rhythm from the engine's plan and reports the commander's inputs through the staging
 * controller. The stop word is never the instrument's: the scene's pill ends the run whatever the instrument does.
 */
import type { Registries } from '../../../content/types';
import type { PhysicsRun } from '../../../engine/physics/state';
import type { CampaignState } from '../../../engine/state/types';
import type { AliusSettings } from '../../../settings';
import type { SampleSound } from '../../sound/samples';
import type { ArtSlots } from '../art';
import type { PhysicsPanelStaging } from '../physicsPanel';
import type { InputGauge } from '../stage/gauge';

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
  spriteOf(unitId: string): HTMLImageElement | null;
  setSprite(unitId: string, label: string): void;
  state(): CampaignState;
  registries: Registries;
  settings(): AliusSettings;
  staging: PhysicsPanelStaging;
  /** The recorded sounds (null = silent). */
  samples: SampleSound | null;
  /** The author's pictures per slot (null answers fall back as each README says). */
  art: ArtSlots;
  her(unitId: string): HerLook;
  /** The frame clock (the `raf` timestamps' clock). The plan's beats are placed in wall time through `staging.clock()`. */
  now(): number;
  raf(fn: FrameRequestCallback): number;
  cancelRaf(id: number): void;
  /** `motionReduced(settings)`: the instrument draws its still form. */
  reduced: boolean;
  /** Readable mode: no blur. */
  readable: boolean;
}

export interface InstrumentRun {
  /** The run changed (a redraw of the scene): the same run id. */
  update(run: PhysicsRun): void;
  /** Leaves nothing behind: no timer, frame, audio node or document listener; the frame and the input restored. */
  stop(): void;
}

export interface InstrumentDef {
  id: string;
  matches(run: PhysicsRun, state: CampaignState, reg: Registries): boolean;
  start(env: InstrumentEnv, run: PhysicsRun): InstrumentRun;
}
