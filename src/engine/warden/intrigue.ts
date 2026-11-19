import type { Registries } from '../../content/types';
import { consumeSlots } from '../calendar';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { facilityLevel, isLiving } from '../economy';
import { fnv1a } from '../hub';
import { addFact } from '../memory';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { socialRank } from '../social';
import type { CampaignState, Fact } from '../state/types';
import { TUNING } from '../tuning';
import { learnExpectation } from './agenda';
import { addDefiance } from './escalation';
import { applyCommanderPunishment, pickPunishment } from './punish';
import { leashswapOf, wardenOf } from './state';

/**
 * Intrigue against the warden (P13 §4): the hidden suspicion clock, allies won in a scene and discovery. The suspicion value is the
 * engine's alone: it never reaches an event, a toast, a panel or a reading (a reading shows `An unseen threat`). Nothing here runs
 * outside the mode or while nobody holds the leash.
 */

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const unitOf = (state: CampaignState, id: string) => state.squad.find((u) => u.id === id);
const hasFlag = (state: CampaignState, id: string, flag: string): boolean => state.relations[id]?.flags.includes(flag) ?? false;

/** The units who have joined the commander against her (flag `warden_ally`), named and still in service. */
export function allies(state: CampaignState): string[] {
  return state.squad.filter((u) => u.kind === 'named' && isLiving(u) && hasFlag(state, u.id, 'warden_ally')).map((u) => u.id);
}

/**
 * Adds to the suspicion (`noise` from an action, clamped to 0–100), then the discovery draw: certain at 100, otherwise one draw at
 * `suspicion / 200`. Nothing happens, and nothing is drawn, without a warden in service.
 */
export function addSuspicion(draft: CampaignState, ctx: EngineCtx, noise: number, cause: string, opts: { punishmentId?: string } = {}): EngineEvent[] {
  const ls = leashswapOf(draft);
  if (!ls || !wardenOf(draft)) return [];
  ls.intrigue.suspicion = clamp(ls.intrigue.suspicion + noise, 0, 100);
  const s = ls.intrigue.suspicion;
  const found = s >= 100 || ctx.rng.chance(s / TUNING.warden.intrigue.discoveryDivisor);
  return found ? intrigueDiscovered(draft, ctx, cause, opts) : [];
}

/**
 * `clamp(0.2 + 0.006 × (trust − 50) + 0.1 × autonomy − 0.1 × corporate, 0.05, 0.9)`. There is no unit-to-unit relation to read, so it is her
 * Trust with the commander and her values.
 */
export function allyChance(state: CampaignState, _reg: Registries, unitId: string): number {
  const A = TUNING.warden.intrigue.ally;
  const unit = unitOf(state, unitId);
  const trust = state.relations[unitId]?.trust ?? 0;
  return clamp(A.base + A.perTrust * (trust - 50) + A.autonomy * (unit?.values.autonomy ?? 0) - A.corporate * (unit?.values.corporate ?? 0), A.min, A.max);
}

/**
 * The commander asked a unit to stand against the warden (the model reported `conspired`). At most one ask per unit per day; the warden
 * herself and a unit who already stands with the commander are not asked. One draw at `allyChance`. A hit: flag `warden_ally`, `ally_won`,
 * suspicion +10. A miss: `ally_refused`, suspicion +20; a refuser whose `values.corporate` is 2 or more reports it and the commander is found out
 * at once.
 */
export function tryAlly(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const ls = leashswapOf(draft);
  const w = wardenOf(draft);
  const unit = unitOf(draft, unitId);
  if (!ls || !w || !unit || unit.kind !== 'named' || !isLiving(unit) || unitId === w.unitId || hasFlag(draft, unitId, 'warden_ally')) return [];
  if (ls.intrigue.lastAllyDay[unitId] === draft.day) return [];
  ls.intrigue.lastAllyDay[unitId] = draft.day;
  if (ctx.rng.chance(allyChance(draft, ctx.registries, unitId))) {
    draft.relations[unitId].flags.push('warden_ally');
    return [{ type: 'ally_won', unitId }, ...addSuspicion(draft, ctx, TUNING.warden.intrigue.allyHit, 'ally')];
  }
  const events: EngineEvent[] = [{ type: 'ally_refused', unitId }];
  if (unit.values.corporate >= 2) return [...events, ...intrigueDiscovered(draft, ctx, 'reported')];
  return [...events, ...addSuspicion(draft, ctx, TUNING.warden.intrigue.allyMiss, 'ally')];
}

/**
 * What the extraction is told it may report as `conspired`: the present units who are neither she nor already an ally nor asked today,
 * and only while she holds the leash and is not in the room. Absent = the event type is not offered.
 */
export function conspireInput(state: CampaignState, _reg: Registries, participants: string[]): { conspire?: string[] } {
  const ls = leashswapOf(state);
  const w = wardenOf(state);
  if (!ls || !w || participants.includes(w.unitId)) return {};
  const ids = participants.filter((id) => {
    const u = unitOf(state, id);
    return u !== undefined && u.kind === 'named' && isLiving(u) && !hasFlag(state, id, 'warden_ally') && ls.intrigue.lastAllyDay[id] !== state.day;
  });
  return ids.length > 0 ? { conspire: ids } : {};
}

/**
 * She found out. Satisfaction −40, defiance +25 (the escalation runs), `warden_betrayed` (extreme) on her, then at once the highest
 * punishment allowed (no punish draw: a Leash punishment needs an authorization and cannot be spent inside a scene, a fight or a run).
 * Every ally becomes known to her (`warden_knows_ally`), the hack starts over and the suspicion is set to 40. Kompromat facts stay.
 * `opts.punishmentId` names the punishment in place of the highest one (a failed hack step costs a pain burst, applied directly).
 */
export function intrigueDiscovered(draft: CampaignState, ctx: EngineCtx, cause: string, opts: { punishmentId?: string } = {}): EngineEvent[] {
  const ls = leashswapOf(draft);
  const w = wardenOf(draft);
  if (!ls || !w) return [];
  const D = TUNING.warden.intrigue.discovered;
  const events: EngineEvent[] = [{ type: 'intrigue_discovered', cause }];
  w.satisfaction = clamp(w.satisfaction + D.satisfaction, 0, 100);
  const rose = addDefiance(draft, ctx, D.defiance);
  events.push(...rose);
  events.push({ type: 'warden_betrayed', unitId: w.unitId, severity: 'extreme' });
  events.push(...applyEventToUnit(draft, ctx.registries, w.unitId, { type: 'warden_betrayed', actor: 'commander', targets: [w.unitId], severity: 'extreme', evidence: 'plotted against the warden', confidence: 1 }));
  events.push(...evaluateAutomatic(draft, ctx.registries, w.unitId));
  for (const id of allies(draft)) if (!hasFlag(draft, id, 'warden_knows_ally')) draft.relations[id].flags.push('warden_knows_ally');
  ls.intrigue.hack.step = 0;
  ls.intrigue.suspicion = D.suspicionAfter;
  ls.intrigue.discovered += 1;
  if (!rose.some((e) => e.type === 'commander_terminated')) {
    const id = opts.punishmentId ?? pickPunishment(draft, ctx.registries, 4);
    if (id !== null) events.push(...applyCommanderPunishment(draft, ctx, id));
  }
  return events;
}

// ---------------------------------------------------------------------------------------------
// Slot actions (P13 §4, §5): dig for kompromat, work on the implant

/** Why an intrigue slot action cannot start now (a scene, a fight or a run is open, or nobody holds the leash), or null. */
export function intrigueBusy(state: CampaignState): string | null {
  if (!wardenOf(state)) return 'Nobody holds the leash.';
  if (state.scene !== undefined || state.combat !== undefined || state.expedition !== undefined) return 'Not while a scene, a fight or a run is open.';
  return null;
}

const isAlly = (state: CampaignState, id: string | undefined): id is string => id !== undefined && allies(state).includes(id);

/** What digging needs: an ally to help or Cunning 3. Null when it can be done. */
export function digProblem(state: CampaignState, _reg: Registries, allyId?: string): string | null {
  const busy = intrigueBusy(state);
  if (busy) return busy;
  if (allyId !== undefined && !isAlly(state, allyId)) return 'That unit does not stand with the commander.';
  if (allyId === undefined && socialRank(state, 'cunning') < TUNING.warden.kompromat.digCunning) return `Digging needs an ally or Cunning ${TUNING.warden.kompromat.digCunning}.`;
  return null;
}

/** The facts about the sitting warden that the commander holds against her (tagged `kompromat`, known to the commander). */
export function kompromatOf(state: CampaignState): Fact[] {
  const id = wardenOf(state)?.unitId;
  if (id === undefined) return [];
  return state.memory.facts.filter((f) => f.about.includes(id) && f.tags.includes('kompromat') && (f.hiddenFromCommander !== true || f.knownBy.includes('*')));
}

/**
 * Digs into her (one slot, noise 15). First choice is the newest fact about her that is hidden from the commander: it is revealed and
 * tagged `kompromat`. Otherwise, if she has an expectation the commander does not know, it is learned instead on a parity of
 * `fnv1a(day|seq)` (no draw); else one authored line becomes a new pinned fact about her, known to the commander and the ally. Then the
 * discovery draw. Throws with `digProblem`'s reason.
 */
export function dig(draft: CampaignState, ctx: EngineCtx, allyId?: string): EngineEvent[] {
  const problem = digProblem(draft, ctx.registries, allyId);
  if (problem) throw new Error(problem);
  const ls = leashswapOf(draft)!;
  const w = wardenOf(draft)!;
  ls.intrigue.seq += 1;
  const events: EngineEvent[] = [{ type: 'intrigue_action', action: 'dig' }, ...consumeSlots(draft, 1, ctx)];
  const hidden = draft.memory.facts.filter((f) => f.about.includes(w.unitId) && f.hiddenFromCommander === true && !f.knownBy.includes('*'));
  const newest = hidden.reduce<Fact | undefined>((best, f) => (best === undefined || f.day >= best.day ? f : best), undefined);
  if (newest) {
    delete newest.hiddenFromCommander;
    if (!newest.tags.includes('kompromat')) newest.tags.push('kompromat');
    events.push({ type: 'kompromat_found', factId: newest.id });
  } else {
    const key = fnv1a(`${draft.day}|${ls.intrigue.seq}`);
    const unknown = w.expectations.filter((x) => !x.known);
    const left = TUNING.warden.kompromat.lines.filter((line) => !draft.memory.facts.some((f) => f.about.includes(w.unitId) && f.text === line));
    if (unknown.length > 0 && (key % 2 === 0 || left.length === 0)) events.push(...learnExpectation(draft, unknown[0].id));
    else if (left.length > 0) {
      const fact = addFact(draft, {
        about: [w.unitId], text: left[key % left.length], tags: ['kompromat'], importance: 3, day: draft.day,
        knownBy: ['commander', ...(allyId !== undefined ? [allyId] : [])], pinned: true,
      });
      events.push({ type: 'kompromat_found', factId: fact.id });
    }
  }
  return [...events, ...addSuspicion(draft, ctx, TUNING.warden.intrigue.digNoise, 'dig')];
}

/** Does this unit have the know-how to work on the implant (a role or a defect with the `tech` field)? */
function isTech(state: CampaignState, reg: Registries, unitId: string): boolean {
  const u = state.squad.find((x) => x.id === unitId);
  if (!u) return false;
  return reg.roles.get(u.roleId)?.tech === true || u.defects.some((d) => reg.defects.get(d.id)?.tech === true);
}

/** Every gate the hack has not met (workshop, medbay, plyx, a tech ally), named in one line; null when it can be worked on. */
export function hackProblem(state: CampaignState, reg: Registries, allyId?: string): string | null {
  const busy = intrigueBusy(state);
  if (busy) return busy;
  const H = TUNING.warden.hack;
  const missing: string[] = [];
  for (const [id, need] of [['workshop', H.workshop], ['medbay', H.medbay]] as const) {
    if (facilityLevel(state, id) < need) missing.push(`${String(reg.facilities.get(id)?.name ?? id)} level ${need} (now ${facilityLevel(state, id)})`);
  }
  if (state.resources.plyx < H.plyx) missing.push(`${H.plyx} plyx (have ${state.resources.plyx})`);
  if (!isAlly(state, allyId) || !isTech(state, reg, allyId)) missing.push('an ally with the know-how to open an implant');
  return missing.length > 0 ? `The hack needs ${missing.join(', ')}.` : null;
}

/** The pain burst of a failed hack step: the registry's punishment with an injury effect (read by effect, never by id). */
function painBurstId(reg: Registries): string | undefined {
  return [...reg.commanderPunishments.values()].find((e) => ((e.effects ?? []) as Array<{ type: string }>).some((x) => x.type === 'injury'))?.id as string | undefined;
}

/** Called when the third step makes the controller dark; `removal.ts` sets it (the investigation of the hack route). */
let removalStarter: (draft: CampaignState, ctx: EngineCtx, route: 'hack') => EngineEvent[] = () => [];
export function setRemovalStarter(fn: typeof removalStarter): void {
  removalStarter = fn;
}

/**
 * One step of the implant hack (5 plyx, one slot, noise 20), with an ally who has the know-how. A step that triggers the discovery
 * fails: progress starts over, the discovery's consequences land and the punishment is a pain burst (applied directly, Leash rules aside).
 * The third clean step makes the controller dark: the flag `commander_implant_dark` and the removal route `hack`. Throws with `hackProblem`.
 */
export function hackStep(draft: CampaignState, ctx: EngineCtx, allyId: string): EngineEvent[] {
  const problem = hackProblem(draft, ctx.registries, allyId);
  if (problem) throw new Error(problem);
  const ls = leashswapOf(draft)!;
  const H = TUNING.warden.hack;
  draft.resources.plyx -= H.plyx;
  const events: EngineEvent[] = [...consumeSlots(draft, 1, ctx)];
  ls.intrigue.hack.step += 1;
  const pain = painBurstId(ctx.registries);
  const found = addSuspicion(draft, ctx, H.noise, 'hack', pain !== undefined ? { punishmentId: pain } : {}); // a discovery resets the progress itself
  if (found.some((e) => e.type === 'intrigue_discovered')) return [{ type: 'hack_step', step: 0, failed: true }, ...events, ...found];
  events.unshift({ type: 'hack_step', step: ls.intrigue.hack.step, failed: false });
  if (ls.intrigue.hack.step >= H.steps) {
    if (!draft.commander.flags.includes('commander_implant_dark')) draft.commander.flags.push('commander_implant_dark');
    events.push({ type: 'controller_dark' }, ...removalStarter(draft, ctx, 'hack'));
  }
  return [...events, ...found];
}
