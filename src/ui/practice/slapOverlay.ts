import type { Registries } from '../../content/types';
import { dynamicOn } from '../../engine/dynamic/gate';
import type { PracticeState, SlapResult } from '../../engine/practice/state';
import type { CampaignState } from '../../engine/state/types';
import type { AliusSettings } from '../../settings';
import { mountSlap, slapStyleOf, stopSlap } from '../scene/instruments/slap/slap';
import type { InstrumentEnv } from '../scene/instruments/types';

type Slap = NonNullable<PracticeState['slap']>;

export interface SlapOverlayCtx {
  state: CampaignState;
  reg: Registries;
  /** The slap that is open in this scene; absent = none (a slap that landed plays its end, the cheek of the scene goes on). */
  slap?: Slap;
  settings: AliusSettings;
  /** The scene's frame (P10e-e): the slap is an instrument drawn over it. */
  env: InstrumentEnv;
  /** The answer: none (taken), braced (the body tensed on the impact) or flinched (the face turned away). Called once, at the impact. */
  onResult: (result: SlapResult) => void;
}

/**
 * The slap (P16, plan R21, spec §R.3; P10e-e Task 12): the slap instrument of `docs/prototypes/slap.html` (`src/ui/scene/instruments/slap/`).
 * The camera snaps to her face, her hand is up, she may feint, her swing lands; Space or the left button tenses the body (a press 42–224 ms
 * before the impact braces), a sharp flick of the mouse sideways turns the face away (`flinched`). With the timing interaction off or reduced
 * motion it lands at once (`none`): the flash, the ringing and the cheek. A redraw of the scene with the same slap changes nothing; the answer
 * is sent once. Nothing it draws is in the moment layer above the scene's UI: the stop word's pill is never covered. Draws nothing in the
 * engine's sense (no rng); the play surface carries no `data-analyze` (it has no control of its own).
 */
export function renderSlapOverlay(host: HTMLElement, ctx: SlapOverlayCtx): void {
  const { slap, state } = ctx;
  const sceneId = state.scene?.id;
  if (sceneId === undefined) { clearSlapOverlay(host); return; }
  const live = slap !== undefined && state.squad.some((u) => u.id === slap.holderId) && dynamicOn(state, ctx.reg);
  mountSlap({
    env: ctx.env, host, reg: ctx.reg, sceneId, still: still(ctx.settings, ctx.env),
    slap: !live || slap === undefined ? null : {
      id: slap.id, holderId: slap.holderId, style: slapStyleOf(state, ctx.reg, slap.holderId), windowMs: slap.windowMs, feints: slap.feints,
      ...(slap.unannounced ? { unannounced: true as const } : {}), ...(slap.again ? { again: true as const } : {}), onResult: ctx.onResult,
    },
  });
}

/** Nothing to time: the timing interaction is off or motion is reduced (the way P15a's panel is read). */
const still = (settings: AliusSettings, env: InstrumentEnv): boolean => settings.physicsInteractions?.timing === false || env.reduced;

/**
 * The slap is gone at once (dispose, the scene closed): no timer, frame, sound or listener stays and a result never comes after; the scene's
 * frame is put back. The cheek is the scene's: a new screen of the same scene draws it on (a new scene and a chat switch forget it).
 */
export function clearSlapOverlay(host: HTMLElement): void {
  stopSlap({ keepCheek: true });
  delete host.dataset.slap;
}
