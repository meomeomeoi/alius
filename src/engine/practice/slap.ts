/**
 * The slap (P16, plan R21, spec §R.3): a holder strikes the commander's face, from her discipline (the `slap` effect) or with no warning after a slip in a scene with her. The engine opens it
 * (`startSlap`: her time allowed by style, her feints by her `swing`) and the UI runs the one-key time allowed and answers (`answerSlap`): none (nothing in time), braced (pressed inside the time allowed) or
 * flinched (too early, on a feint, a second press). Each outcome moves her favour and the rest by her style; every slap is a threat to the commander (`slap_dealt`), makes her `swing`
 * better and, before others, costs the commander the Regard of those who saw it and is remembered by those present. With no scene with her there is nothing to brace in: it lands unseen. Nothing here draws.
 */
import type { Registries } from '../../content/types';
import { countDeed } from '../discipline/deeds';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { addFavour } from '../dynamic/hold';
import { practiceOf } from '../dynamic/profile';
import { regardFall, regardRise } from '../dynamic/regard';
import { isLiving } from '../economy';
import { herSkillOf, practise } from '../physics/skill';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { ensurePractices, nextPracticeId, practiceLive } from './gate';
import { practiceRoll, SLAP_RESULTS, type OpenPunishment, type PracticeState, type SlapResult } from './state';

/** What asks for a slap: which punishment (its effect), a second one after a flinch (`again`), or `unannounced` (after a slip in a scene). */
export interface SlapOpts { punishmentId?: string; unannounced?: true; again?: true }

const styleOf = (state: CampaignState, reg: Registries, holderId: string): string | undefined => practiceOf(state, reg, holderId)?.style.primary;

/** Her time allowed in milliseconds: the table by her primary style; `obsessive` takes 300 plus a hashed share of the spread (so 300 to 700), the same for the same slap. Reads only. */
export function slapWindowMs(state: CampaignState, reg: Registries, holderId: string, slapId: string): number {
  const T = TUNING.practice.slap;
  const style = styleOf(state, reg, holderId);
  const base = (style === undefined ? undefined : (T.windowMs as Readonly<Record<string, number>>)[style]) ?? 500;
  return style === 'obsessive' ? Math.round(base + practiceRoll(state, holderId, `slapwin:${slapId}`) * T.obsessiveSpread) : base;
}

/** The feints she makes before the real one: none under `feintFrom` of her `swing`; from it, one with the hashed chance of `feintPerLevel` for each level from the second (10 % at 2, 20 % at 3). */
export function slapFeints(state: CampaignState, holderId: string, slapId: string): number {
  const T = TUNING.practice.slap;
  const swing = herSkillOf(state, holderId).swing;
  if (swing < T.feintFrom) return 0;
  return practiceRoll(state, holderId, `feint:${slapId}`) < T.feintPerLevel * (swing - (T.feintFrom - 1)) ? 1 : 0;
}

/** The named living soldiers in the open scene besides her: who sees the slap. */
const witnessesOf = (state: CampaignState, holderId: string): string[] =>
  (state.scene?.participants ?? []).filter((id) => id !== holderId && state.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));

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
    return opts.unannounced === true ? [] : deal(draft, ctx, holderId, 'none', { id: '', holderId, windowMs: 0, feints: 0, ...(opts.punishmentId !== undefined ? { punishmentId: opts.punishmentId } : {}) });
  }
  const seen = witnessesOf(draft, holderId).length > 0;
  if (seen && !on.includes('public_humiliation')) return [];
  const id = nextPracticeId(draft, 'ps');
  const windowMs = slapWindowMs(draft, reg, holderId, id);
  const feints = slapFeints(draft, holderId, id);
  ensurePractices(draft).slap = {
    id, holderId, sceneId: scene.id, windowMs, feints, ...(seen ? { public: true as const } : {}), ...(opts.punishmentId !== undefined ? { punishmentId: opts.punishmentId } : {}),
    ...(opts.again === true ? { again: true as const } : {}), ...(opts.unannounced === true ? { unannounced: true as const } : {}),
  };
  return [{ type: 'slap_started', slapId: id, holderId, unitId: holderId, windowMs, feints, ...(seen ? { public: true } : {}), ...(opts.unannounced === true ? { unannounced: true } : {}) }];
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

/** A flinch costs the sentence: `vindictive` adds one to its count, `ritual` makes the ceremony start its number again (the step is not done any more). */
function flinchedSentence(draft: CampaignState, reg: Registries, slap: Slap, style: string | undefined): void {
  const p = punishmentOf(draft, slap);
  if (p === undefined) return;
  if (style === 'vindictive') p.count = (p.count ?? p.ceremony?.number ?? 0) + 1;
  if (style === 'ritual' && p.ceremony?.number !== undefined) {
    delete p.ceremony.number;
    p.ceremony.done = p.ceremony.done.filter((id) => (reg.ceremonySteps.get(id) as { check?: string } | undefined)?.check !== 'number');
  }
}

/** What the slap is: it landed. Favour by the result, her style's answer to a flinch, her `swing`, the threat event and, before others, what those who saw it lose and what is remembered. */
function deal(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, holderId: string, result: SlapResult, slap: Slap): EngineEvent[] {
  const reg = ctx.registries;
  const T = TUNING.practice.slap;
  const style = styleOf(draft, reg, holderId);
  const witnesses = slap.public === true ? witnessesOf(draft, holderId) : [];
  const events: EngineEvent[] = [{ type: 'slap_dealt', unitId: holderId, holderId, result, public: slap.public === true, ...(witnesses.length > 0 ? { present: [holderId, ...witnesses] } : {}) }];
  addFavour(draft, holderId, T.favour[result]);
  if (result === 'braced') events.push(...regardRise(draft, reg, holderId, 'dignity'));
  if (result === 'flinched') {
    if (style === 'affectionate') addFavour(draft, holderId, T.favour.softer); // she is gentler: the flinch is forgiven
    flinchedSentence(draft, reg, slap, style);
    if (style === 'cruel' && slap.again !== true) events.push(...startSlap(draft, ctx, holderId, { again: true, ...(slap.punishmentId !== undefined ? { punishmentId: slap.punishmentId } : {}) }));
  }
  events.push(...practise(draft, holderId, ['swing'], style ?? ''));
  if (witnesses.length > 0) {
    for (const w of witnesses) events.push(...regardFall(draft, reg, w, T.publicRegard, { witness: true, cause: 'slap' }));
    countDeed(draft, 'slapped_public');
  }
  return events;
}

/**
 * The commander's answer to the slap that is open (`practice/slap_answer { slapId, result }`): the UI sends `none` when the time allowed ran out, `braced` for a press inside it and `flinched` for an early
 * press, a press on a feint or a second press. The slap is closed and what it does lands (`deal`). Throws for a slap that is not open, a result that is no result or a holder who is not live. Draws nothing.
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
