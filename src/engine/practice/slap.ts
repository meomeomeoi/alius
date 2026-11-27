/**
 * The slap (P16, plan R21, spec §R.3): a holder strikes the commander's face, from her discipline (the `slap` effect) or with no warning after a slip in a scene with her. The engine opens it
 * (`startSlap`: her swing's length by style, her feints by her `swing`) and the slap instrument answers (`answerSlap`, P10e-e R11): none (taken), braced (the body tensed on the impact) or
 * flinched (the face turned away: a defiance, also her offence `slap_defied`); `slap_dealt.side` is her hand's side (`slapSide`). Each outcome moves her favour and the rest by her style; every slap is a threat to the commander (`slap_dealt`), makes her `swing`
 * better and, before others, costs the commander the Regard of those who saw it and is remembered by those present. With no scene with her there is nothing to brace in: it lands unseen. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { countDeed } from '../discipline/deeds';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addFavour } from '../dynamic/hold';
import { practiceOf } from '../dynamic/profile';
import { bendBy } from '../dynamic/manner';
import { regardFall, regardRise } from '../dynamic/regard';
import { isLiving } from '../economy';
import { fnv1a } from '../hub';
import { herSkillOf, practise } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { noteOffence } from './offences';
import { practiceRoll, SLAP_RESULTS, type OpenPunishment, type PracticeState, type SlapResult } from './state';

/** What asks for a slap: which punishment (its effect), a second one after a flinch (`again`), or `unannounced` (after a slip in a scene). */
export interface SlapOpts { punishmentId?: string; unannounced?: true; again?: true }

const styleOf = (state: CampaignState, reg: Registries, holderId: string): string | undefined => practiceOf(state, reg, holderId)?.style.primary;

/** Her time allowed in milliseconds: the table by her primary style; `obsessive` takes 300 plus a hashed share of the spread (so 300 to 700), the same for the same slap. Reads only. */
export function slapWindowMs(state: CampaignState, reg: Registries, holderId: string, slapId: string): number {
  const T = TUNING.practice.slap;
  const style = styleOf(state, reg, holderId);
  const base = (style === undefined ? undefined : (T.windowMs as Readonly<Record<string, number>>)[style]) ?? 500;
  const swing = style === 'obsessive' ? Math.round(base + practiceRoll(state, holderId, `slapwin:${slapId}`) * T.obsessiveSpread) : base;
  return bendBy(state, reg, holderId, 'tempo', swing, { scale: -TUNING.manner.scale }); // P15b: a sudden holder (tempo up) swings sooner
}

/** The feints she makes before the real one: none under `feintFrom` of her `swing`; from it, one with the hashed chance of `feintPerLevel` for each level from the second (10 % at 2, 20 % at 3). */
export function slapFeints(state: CampaignState, holderId: string, slapId: string): number {
  const T = TUNING.practice.slap;
  const swing = herSkillOf(state, holderId).swing;
  if (swing < T.feintFrom) return 0;
  return practiceRoll(state, holderId, `feint:${slapId}`) < T.feintPerLevel * (swing - (T.feintFrom - 1)) ? 1 : 0;
}

/**
 * P10e-e (R12): the side her hand comes from, a hash of the slap's id (no draw): `1` is her right hand (the screen's left, the commander's left
 * cheek), `-1` her left. The same slap always the same side; `slap_dealt.side` carries it to the directive.
 */
export function slapSide(slapId: string): 1 | -1 {
  return fnv1a(slapId) % 2 === 0 ? 1 : -1;
}

/** The named living soldiers in the open scene besides her: who sees the slap. */
const witnessesOf = (state: CampaignState, holderId: string): string[] =>
  (state.scene?.participants ?? []).filter((id) => id !== holderId && state.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));

/** The punishment a slap came from has slapped (once). */
function markSlapped(draft: CampaignState, punishmentId: string | undefined): void {
  const p = punishmentId === undefined ? undefined : draft.practices?.punishments.find((x) => x.id === punishmentId);
  if (p !== undefined) p.slapped = true;
}

/**
 * Starts a slap on the commander by this holder. Nothing unless she is live and `physical_discipline_shown` is on, and no slap is open. With a scene with her open it writes `practices.slap` and says
 * `slap_started` (the UI telegraphs and runs the time allowed); before others it needs `public_humiliation`, else it waits for a private moment (not built: skipped). With no scene with her it lands unseen
 * (`none`). Draws nothing.
 */
export function startSlap(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, opts: SlapOpts = {}): EngineEvent[] {
  const reg = ctx.registries;
  const on = draft.content?.enabled ?? [];
  if (!practiceLive(draft, reg, holderId) || !on.includes('physical_discipline_shown') || draft.practices?.slap !== undefined) return [];
  const scene = draft.scene;
  if (scene === undefined || !scene.participants.includes(holderId)) {
    if (opts.unannounced === true) return [];
    markSlapped(draft, opts.punishmentId);
    return deal(draft, ctx, holderId, 'none', { id: '', holderId, windowMs: 0, feints: 0, ...(opts.punishmentId !== undefined ? { punishmentId: opts.punishmentId } : {}) });
  }
  const seen = witnessesOf(draft, holderId).length > 0;
  if (seen && !on.includes('public_humiliation')) return [];
  markSlapped(draft, opts.punishmentId);
  const id = nextPracticeId(draft, 'ps');
  const windowMs = slapWindowMs(draft, reg, holderId, id);
  const feints = slapFeints(draft, holderId, id);
  ensurePractices(draft).slap = {
    id, holderId, sceneId: scene.id, windowMs, feints, ...(seen ? { public: true as const } : {}), ...(opts.punishmentId !== undefined ? { punishmentId: opts.punishmentId } : {}),
    ...(opts.again === true ? { again: true as const } : {}), ...(opts.unannounced === true ? { unannounced: true as const } : {}),
  };
  return [{ type: 'slap_started', slapId: id, holderId, unitId: holderId, ...(seen ? { public: true } : {}), ...(opts.unannounced === true ? { unannounced: true } : {}) }];
}

/**
 * After a slip (the offence entered by `noteOffence`): a protocol slip or a denial broken, in a scene with her, by a holder whose style slaps with no warning (`cold`, `cruel`, `drill`,
 * `vindictive`), on the hashed chance of `TUNING.practice.slap.unannounced`. Then `startSlap` decides the rest (physical discipline on, others in the room). Nothing for any other offence.
 */
export function slapAfterSlip(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, offence: { kind: string; ref?: string }): EngineEvent[] {
  if (offence.kind !== 'protocol_slip' && offence.kind !== 'denial_broken') return [];
  if (draft.scene?.participants.includes(holderId) !== true) return [];
  const style = styleOf(draft, ctx.registries, holderId);
  if (style === undefined || !TUNING.practice.slap.unannouncedStyles.includes(style)) return [];
  if (practiceRoll(draft, holderId, `slap:${offence.kind}:${offence.ref ?? ''}`) >= TUNING.practice.slap.unannounced) return [];
  return startSlap(draft, ctx, holderId, { unannounced: true });
}

type Slap = NonNullable<PracticeState['slap']>;

/** The punishment a slap belongs to, when one is named. */
const punishmentOf = (state: CampaignState, slap: Slap): OpenPunishment | undefined => (slap.punishmentId === undefined ? undefined : state.practices?.punishments.find((p) => p.id === slap.punishmentId));

/**
 * A flinch costs the sentence while the sentence can still change: `vindictive` adds one to its count. Nothing once the ceremony is carried out (the slap is the last thing it does, so a flinch at it is
 * scored on the slap only: it never reopens the number or the steps).
 */
function flinchedSentence(draft: CampaignState, slap: Slap, style: string | undefined): void {
  const p = punishmentOf(draft, slap);
  if (p === undefined || p.ceremony?.carried === true) return;
  if (style === 'vindictive') p.count = (p.count ?? p.ceremony?.number ?? 0) + 1;
}

/** What the slap is: it landed. Favour by the result, her style's answer to a flinch, her `swing`, the threat event and, before others, what those who saw it lose and what is remembered. */
function deal(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, result: SlapResult, slap: Slap): EngineEvent[] {
  const reg = ctx.registries;
  const T = TUNING.practice.slap;
  const style = styleOf(draft, reg, holderId);
  const witnesses = slap.public === true ? witnessesOf(draft, holderId) : [];
  const events: EngineEvent[] = [{ type: 'slap_dealt', unitId: holderId, holderId, result, public: slap.public === true, side: slapSide(slap.id), ...(witnesses.length > 0 ? { present: [holderId, ...witnesses] } : {}) }];
  addFavour(draft, holderId, T.favour[result]);
  if (result === 'braced') events.push(...regardRise(draft, reg, holderId, 'dignity'));
  if (result === 'flinched') {
    // she is gentler: the flinch is forgiven (P15b: also a holder at warmth +2, once)
    if (style === 'affectionate' || bendBy(draft, reg, holderId, 'warmth', 0, { gate: 2 }) === 1) addFavour(draft, holderId, T.favour.softer);
    flinchedSentence(draft, slap, style);
    // P15b: a second slap for cruel, unless her intensity is -2, and for any style at +2
    const again = bendBy(draft, reg, holderId, 'intensity', 0, { gate: 2 }) === 1 || (style === 'cruel' && bendBy(draft, reg, holderId, 'intensity', 0, { gate: -2 }) === 0);
    if (again && slap.again !== true) events.push(...startSlap(draft, ctx, holderId, { again: true, ...(slap.punishmentId !== undefined ? { punishmentId: slap.punishmentId } : {}) }));
    // R11: a turned face is a defiance, her offence like any other (her discipline remembers it through `noteOffence`; no draw)
    events.push(...noteOffence(draft, ctx, holderId, { kind: 'slap_defied', ref: slap.id, stakes: 'minor', day: draft.day }));
  }
  events.push(...practise(draft, holderId, ['swing'], style ?? ''));
  if (witnesses.length > 0) {
    for (const w of witnesses) events.push(...regardFall(draft, reg, w, T.publicRegard, { witness: true, cause: 'slap' }));
    countDeed(draft, 'slapped_public');
  }
  return events;
}

/**
 * The commander's answer to the slap that is open (`practice/slap_answer { slapId, result }`). P10e-e (R11): the slap instrument sends `braced` for a press 42–224 ms before the impact,
 * `none` for anything else (no press, a press too early, on a feint or after) and `flinched` only for a turned face (a defiance: also her offence `slap_defied`). The slap is closed and what it does lands (`deal`). Throws for a slap that is not open, a result that is no result or a holder who is not live. Draws nothing.
 */
export function answerSlap(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, slapId: string, result: unknown): EngineEvent[] {
  const slap = draft.practices?.slap;
  if (slap === undefined || slap.id !== slapId) throw new Error('There is no slap to answer.');
  if (typeof result !== 'string' || !(SLAP_RESULTS as readonly string[]).includes(result)) throw new Error('A slap is answered none, braced or flinched.');
  if (!practiceLive(draft, ctx.registries, slap.holderId)) throw new Error('She is not holding now.');
  delete draft.practices!.slap;
  return deal(draft, ctx, slap.holderId, result as SlapResult, slap);
}

/** After a scene ends or is aborted with a slap of that scene still open (registered by `actions/practice.ts`): the slap goes with it, with no outcome. Returns no events. */
export function slapSceneEnded(draft: CampaignState, events: readonly EngineEvent[]): EngineEvent[] {
  const slap = draft.practices?.slap;
  if (slap === undefined) return [];
  if (events.some((e) => (e.type === 'scene_ended' || e.type === 'scene_aborted') && e.sceneId === slap.sceneId)) delete draft.practices!.slap;
  return [];
}
