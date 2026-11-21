/**
 * The P15a stand-ins, replaced (P15, plan R10): the frame of her relationship, whether a scene is live, her physics style pair, what she
 * holds the commander until, and the option she expects of a moment. `installDynamicHooks` registers the five readers once (from
 * `actions/dynamic.ts`, at module load); registering twice gives the same answers, so a test that reset the hooks may install again.
 *
 * Every reader answers `null` unless the dynamic is on AND she has her own dynamic (`Relation.dynamic`); then P15a's stand-in answers.
 * Readers stack and the first non-null answer wins; all of them are pure and draw nothing.
 *
 * Three of the P15a hooks have no registry argument (`FrameReader`, `StyleReader`, `HoldsReader`), so those readers cannot ask
 * `dynamicOn` (it needs the practice categories, which come from a registry). They decide "off" from the state alone: no `state.dynamic`,
 * `holders` 0, or no `Relation.dynamic` on her. `Relation.dynamic` is written only while the dynamic is on (R7), so the one case they cannot
 * see is a practice category switched off after a holder formed: until it is switched back on they keep answering. The two readers that
 * do get a registry (the blocking gate and the expectation) ask `dynamicOn` itself.
 */
import { frameRank, type Frame } from '../blocking/state';
import { registerBlockingGate, registerFrameReader } from '../blocking/gate';
import { isLiving } from '../economy';
import { registerExpectation } from '../moments/answer';
import { registerHoldsUntil, registerPhysicsStyle } from '../physics/style';
import type { PhysicsStyle } from '../physics/state';
import type { CampaignState } from '../state/types';
import { holdsUntilOfUnit, expectationsOf } from './expectations';
import { dynamicOn } from './gate';
import { styleOf } from './profile';
import { dynamicOf, type DynamicRelation } from './state';

/** Her dynamic, only while the block exists, holders is not 0 and she is a named unit in service; `undefined` otherwise (the state-only "off" check). */
function liveDynamic(state: CampaignState, unitId: string): DynamicRelation | undefined {
  if (state.dynamic === undefined || state.dynamic.setup.holders === 0) return undefined;
  const unit = state.squad.find((u) => u.id === unitId);
  return unit !== undefined && unit.kind === 'named' && isLiving(unit) ? dynamicOf(state, unitId) : undefined;
}

/** The frame of her relationship (`Relation.dynamic.frame`). */
function frameReader(state: CampaignState, unitId: string): Frame | null {
  return liveDynamic(state, unitId)?.frame ?? null;
}

/**
 * Her style pair from the profile (what she has become folded in). `phaseLead` is `primary` until the secondary's surfacing conditions
 * are read (Task 16).
 */
function styleReader(state: CampaignState, unitId: string): PhysicsStyle | null {
  if (liveDynamic(state, unitId) === undefined) return null;
  const style = styleOf(state.squad.find((u) => u.id === unitId)!);
  return style === undefined ? null : { primary: style.primary, ...(style.secondary !== undefined ? { secondary: style.secondary } : {}), phaseLead: 'primary' };
}

/** What she holds the commander until (her expectation profile); `blackout` without `breath_play` is turned into `limit` by P15a itself. */
function holdsReader(state: CampaignState, unitId: string) {
  return liveDynamic(state, unitId) === undefined ? null : holdsUntilOfUnit(state.squad.find((u) => u.id === unitId)!) ?? null;
}

/** A scene is live while a present unit is at `play` or beyond (and the dynamic is on). */
function gate(state: CampaignState, reg: Parameters<typeof dynamicOn>[1]): boolean {
  if (!dynamicOn(state, reg)) return false;
  return (state.scene?.participants ?? []).some((id) => liveDynamic(state, id) !== undefined && frameRank(dynamicOf(state, id)!.frame) >= frameRank('play'));
}

/**
 * Her profile value for the moment's source: the option of the moment whose type it names (a frame option first, then any other), with her
 * strength. Without a value, or when the moment does not offer the type, it defers (Task 16 gives the default expectation).
 */
function expectation(state: CampaignState, reg: Parameters<typeof dynamicOn>[1], moment: { sourceId: string; unitId: string; options: Array<{ key: string; type: string }> }) {
  if (!dynamicOn(state, reg) || dynamicOf(state, moment.unitId) === undefined) return null;
  const wanted = expectationsOf(state, reg, moment.unitId).moments?.[moment.sourceId];
  if (wanted === undefined) return null;
  const options = moment.options.filter((o) => o.type === wanted.type);
  const pick = options.find((o) => o.key === '0' || o.key === '1' || o.key === '2') ?? options[0];
  return pick === undefined ? null : { key: pick.key, strength: wanted.strength };
}

/** Registers the dynamic's readers on the P15a hooks. Idempotent in effect: a second call adds readers that answer the same. */
export function installDynamicHooks(): void {
  registerFrameReader(frameReader);
  registerBlockingGate(gate);
  registerPhysicsStyle(styleReader);
  registerHoldsUntil(holdsReader);
  registerExpectation(expectation as Parameters<typeof registerExpectation>[0]);
}
