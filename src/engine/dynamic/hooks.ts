/**
 * The P15a stand-ins, replaced (P15, plan R10): the frame of her relationship, whether a scene is live, her physics style pair, what she
 * holds the commander until, and the option she expects of a moment. `installDynamicHooks` registers the five readers once, and with them the moment source `compromat_hint` and the count blackmail reads (from
 * `actions/dynamic.ts`, at module load); registering twice gives the same answers, so a test that reset the hooks may install again.
 *
 * Every reader answers `null` unless the dynamic is on AND she has her own dynamic (`Relation.dynamic`) AND she practises something that is
 * switched on (`herPracticeLive`); then P15a's stand-in answers. Readers stack and the first non-null answer wins; all are pure, no draws.
 *
 * Three of the P15a hooks have no registry argument (`FrameReader`, `StyleReader`, `HoldsReader`), so those readers cannot ask `dynamicOn`
 * (it needs the practice categories from a registry). They decide "off" from the state alone: no `state.dynamic`, `holders` 0, no
 * `Relation.dynamic`, or none of HER practised categories enabled and outside her limits (`herPracticeLive`, which is what switching the
 * practice categories off comes to). The blocking gate and the expectation reader get a registry and also ask `dynamicOn`.
 */
import type { Registries } from '../../content/types';
import { frameRank, type Frame } from '../blocking/state';
import { registerBlockingGate, registerFrameReader } from '../blocking/gate';
import { isLiving } from '../economy';
import { registerRipeSource } from '../blocking/vocabulary';
import { registerExpectation } from '../moments/answer';
import { registerMomentTrigger } from '../moments/live';
import type { OpenMoment } from '../moments/state';
import { registerHoldsUntil, registerPhysicsStyle, registerRunTarget } from '../physics/style';
import type { PhysicsStyle } from '../physics/state';
import type { CampaignState } from '../state/types';
import { registerCompromatCount, registerRegardBand } from './aftermath';
import { compromatOf } from './compromat';
import { holdsUntilOfUnit, expectationsOf } from './expectations';
import { dynamicOn, herPracticeLive } from './gate';
import { styleOf } from './profile';
import { regardBandOf, regardBandRank, regardOf, registerRegardWatcher } from './regard';
import { checkDisappointment, ripeQuestions } from './shame';
import { registerDislikeScale, registerProtection } from './witness';
import { combatEffects, protectionFor, wantGrowthMult } from './exchange';
import { registerCombatPassive } from '../combat/build';
import { registerWantGrowth } from '../bonds/want';
import { defaultExpectation, leadingStyle } from './style';
import { dynamicOf, type DynamicRelation } from './state';
import { TUNING } from '../tuning';

/** Her dynamic, only while the block exists, holders is not 0 and she is a named unit in service; `undefined` otherwise (the state-only "off" check). */
function liveDynamic(state: CampaignState, unitId: string): DynamicRelation | undefined {
  if (state.dynamic === undefined || state.dynamic.setup.holders === 0) return undefined;
  const unit = state.squad.find((u) => u.id === unitId);
  return unit !== undefined && unit.kind === 'named' && isLiving(unit) && herPracticeLive(state, unitId) ? dynamicOf(state, unitId) : undefined;
}

/** The frame of her relationship (`Relation.dynamic.frame`). */
function frameReader(state: CampaignState, unitId: string): Frame | null {
  return liveDynamic(state, unitId)?.frame ?? null;
}

/**
 * Her style pair from the profile (what she has become folded in). `phaseLead` is `secondary` while the secondary's surfacing conditions hold
 * (Task 16); callers pass the registries (all of P15a's do).
 */
function styleReader(state: CampaignState, unitId: string, reg?: Registries): PhysicsStyle | null {
  if (liveDynamic(state, unitId) === undefined) return null;
  const style = styleOf(state.squad.find((u) => u.id === unitId)!);
  if (style === undefined) return null;
  // the secondary leads while one of its conditions holds (`style.ts`); a caller with no registry leaves the primary in the lead
  const phaseLead = reg === undefined || style.secondary === undefined ? 'primary' : leadingStyle(state, reg, unitId).phaseLead;
  return { primary: style.primary, ...(style.secondary !== undefined ? { secondary: style.secondary } : {}), phaseLead };
}

/**
 * What she holds the commander until (her expectation profile); `blackout` without `breath_play` is turned into `limit` by P15a itself. An endurance the commander offered in
 * this scene and she took ("hold as long as you like", Task 40) raises it to her maximum for the scene.
 */
function holdsReader(state: CampaignState, unitId: string) {
  if (liveDynamic(state, unitId) === undefined) return null;
  const scene = state.scene;
  if (scene !== undefined && state.dynamic?.open.offers.some((o) => o.unitId === unitId && o.sceneId === scene.id && o.answer === 'accepted' && o.composition.some((c) => c.tab === 'endurance')) === true) return 'blackout';
  return holdsUntilOfUnit(state.squad.find((u) => u.id === unitId)!) ?? null;
}

/** A scene is live while a present unit is at `play` or beyond (and the dynamic is on). */
function gate(state: CampaignState, reg: Parameters<typeof dynamicOn>[1]): boolean {
  if (!dynamicOn(state, reg)) return false;
  return (state.scene?.participants ?? []).some((id) => liveDynamic(state, id) !== undefined && frameRank(dynamicOf(state, id)!.frame) >= frameRank('play'));
}

/**
 * Her profile value for the moment's source: the option of the moment whose type it names (a frame option first, then any other), with her
 * strength. Without a value, or when the moment does not offer the type, her style's default (`defaultExpectation`).
 */
function expectation(state: CampaignState, reg: Parameters<typeof dynamicOn>[1], moment: { sourceId: string; unitId: string; options: Array<{ key: string; type: string }> }) {
  if (!dynamicOn(state, reg) || liveDynamic(state, moment.unitId) === undefined) return null;
  const wanted = expectationsOf(state, reg, moment.unitId).moments?.[moment.sourceId];
  const options = wanted === undefined ? [] : moment.options.filter((o) => o.type === wanted.type);
  const pick = options.find((o) => o.key === '0' || o.key === '1' || o.key === '2') ?? options[0];
  // her profile value when the moment offers that type; else the option that moves the commander toward her style's point (Task 16)
  return wanted !== undefined && pick !== undefined ? { key: pick.key, strength: wanted.strength } : defaultExpectation(state, reg, moment as OpenMoment);
}

/**
 * The moment source `compromat_hint` (spec §11): live for a holder who is present (the engine asks per soldier in the scene) at `role` or beyond, who holds
 * some compromat, and whose own refusal of the commander is at most `directives.refusalDays` days old. Off while the dynamic is off.
 */
function compromatHint(state: CampaignState, reg: Registries, unitId: string): boolean {
  const dyn = dynamicOn(state, reg) && liveDynamic(state, unitId) !== undefined ? dynamicOf(state, unitId) : undefined;
  return dyn !== undefined && frameRank(dyn.frame) >= frameRank('role') && compromatOf(state, unitId).length > 0
    && dyn.refusals.some((day) => state.day - day <= TUNING.dynamic.directives.refusalDays);
}

/** A fall of her Regard is shown to disappointment (one function, so a second install registers nothing new). */
const disappointed = (draft: CampaignState, reg: Registries, unitId: string, from: number, to: number) => checkDisappointment(draft, { registries: reg }, unitId, from, to);

/** Registers the dynamic's readers on the P15a hooks. Idempotent in effect: a second call adds readers that answer the same. */
export function installDynamicHooks(): void {
  registerFrameReader(frameReader);
  registerBlockingGate(gate);
  registerPhysicsStyle(styleReader);
  registerHoldsUntil(holdsReader);
  registerRunTarget((state, reg, targetId) => (dynamicOn(state, reg) ? targetId : undefined)); // mastery counts the act on a target only while the dynamic is on (I4)
  registerExpectation(expectation as Parameters<typeof registerExpectation>[0]);
  registerMomentTrigger('compromat_hint', compromatHint); // P15 (compromat): the one source of the dynamic that is live from the start
  registerCompromatCount((state, holderId) => compromatOf(state, holderId).length); // blackmail needs some
  registerRegardBand((state, reg, unitId) => (dynamicOn(state, reg) ? regardBandOf(reg, regardOf(state, reg, unitId)) : null)); // the aftermath weights read her Regard band (R15, R18)
  // a witness who dislikes what a holder has over the commander weighs more while her own Regard is low or none (R14, R18): the lowest two bands of the registry
  registerRipeSource(ripeQuestions); // `her_question` is ripe for a woman who is losing respect, or who dislikes what a holder has (Task 37)
  registerRegardWatcher(disappointed);
  registerProtection(protectionFor); // a holder's standing shields the commander before the other units' Impunity (Task 38)
  registerCombatPassive(combatEffects); // her combat form follows her satisfaction
  registerWantGrowth(wantGrowthMult); // her drive, her mood and her day on the growth of her Want
  registerDislikeScale((state, reg, unitId) => (regardBandRank(reg, regardOf(state, reg, unitId)) >= Math.max(0, reg.regardBands.size - 2) ? TUNING.regard.dislikes : 1));
}
