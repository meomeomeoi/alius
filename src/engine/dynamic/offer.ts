/**
 * Offering yourself (P15, plan R20, spec §15.7, §15.12): the player's way in, beside her own probing. The commander composes one or two entries from the vocabularies the game
 * already has (a part of the body that is a worship target, a posture, a contact, a service, time, the role of an object, endurance); the engine decides her answer from her
 * profile and her style, with no draw, and moves hold, favour, her reading, Regard and the squad's eyes. The model's `offer_answered` only confirms the answer and carries
 * the words of a correction; it never decides one. Everything is filtered by the same gate as the blocking chips (`entryAllowed`: the category on, her own limits, the frame, the
 * room) and by the commander's mobility. Nothing here draws except the claim an accepted offer of time or a part can become (one draw, only when it is possible).
 *
 * The attitude behind her answer is read from the profile by FIELD: a worship target's own attitude (its zone must have been shown to the commander, else the answer is a
 * correction that shows it), a contact's targets, else the practice category the entry is tagged with. Nothing here names an entry by id.
 */
import type { Entry, Registries } from '../../content/types';
import { COMMANDER, transitionProblem } from '../blocking';
import { entryAllowed, sceneAffordances } from '../blocking/gate';
import { frameRank, type Frame } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { addFact } from '../memory/facts';
import { temperamentOf } from '../life/state';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { holderOfDomain, meets } from './domains';
import { domainRows, standing } from './capabilities';
import { addCompromat } from './compromat';
import { satisfactionOf } from './exchange';
import { type Attitude, expectationsOf } from './expectations';
import { canHold, dynamicOn, ensureDynamic, herPracticeLive } from './gate';
import { addFavour, addHold } from './hold';
import { addSign } from './knowledge';
import { practiceOf, type PracticeView } from './profile';
import { masteryLevel } from './mastery';
import { regardFall, regardRise } from './regard';
import { resettleReading } from './reading';
import { dynamicOf, type OpenOffer } from './state';
import { leadingStyle } from './style';
import { MOTIVES, OFFER_TABS, type DynamicDomainEntry, type OfferAnswer, type OfferTab, type PracticeAs } from './types';
import { zoneRevealed } from './zones';

type Ctx = Pick<EngineCtx, 'registries' | 'rng'>;

/** What the commander offers: one or two entries in all, each under its tab. */
export type OfferComposition = Array<{ tab: OfferTab; ids: string[] }>;

/** One line of the composer: the id, its words and, for a worship target, what the commander knows of her attitude to it (`unknown` until a fact has shown it). */
export interface OfferChoice { id: string; label: string; known?: Attitude | 'unknown' }

const RANK: Readonly<Record<Attitude, number>> = { dislikes: 0, indifferent: 1, enjoys: 2, craves: 3 };

/** The words of the entries the game has no registry for (time and endurance are a small closed list, `TUNING.offer.times`). */
const TIME_LABEL: Readonly<Record<string, string>> = { evening: 'An evening', night: 'A night' };
export const ENDURANCE_ID = 'endurance';
const ENDURANCE_LABEL = 'Hold for as long as she likes';

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
const tagsOf = (e: Entry | undefined): string[] => (Array.isArray(e?.contentTags) ? (e!.contentTags as unknown[]).map(String) : []);

// ---------------------------------------------------------------------------------------------
// What may be offered

/** May the commander offer to her at all right now: the dynamic is on, she is a named living soldier who practises something switched on, and she holds or could. */
function offerable(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!dynamicOn(state, reg)) return false;
  const unit = state.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || !herPracticeLive(state, unitId)) return false;
  const dyn = dynamicOf(state, unitId);
  return (dyn !== undefined && frameRank(dyn.frame) >= frameRank('play')) || canHold(state, reg, unitId, { ignoreCap: true }) === null;
}

/** Whether she is at `play` or beyond (an offer to her is always possible, whatever the cap says of others). */
function holds(state: CampaignState, unitId: string): boolean {
  const dyn = dynamicOf(state, unitId);
  return dyn !== undefined && frameRank(dyn.frame) >= frameRank('play');
}

/** Only the cap stands in the way: she is no holder and the squad's holders are at their number. */
function capped(state: CampaignState, reg: Registries, unitId: string): boolean {
  return !holds(state, unitId) && canHold(state, reg, unitId) !== null;
}

/** Her actual attitude to a worship target, from her profile (what she has not said reads as indifference). */
function worshipOf(state: CampaignState, reg: Registries, unitId: string, targetId: string): Attitude {
  return expectationsOf(state, reg, unitId).worship?.[targetId]?.attitude ?? 'indifferent';
}

/**
 * What the composer lists for her, by tab. Empty on every tab while the dynamic is off, for a woman who could not hold, and for a woman with no practice switched on. Every
 * entry passes `entryAllowed` (the category, her limits, the frame for a dynamic-scope entry, here for everyone in the scene) and, in her scene, the room's affordances and the
 * commander's mobility. A worship target carries `known`: her attitude once a fact showed it, else `unknown`. Reads only; draws nothing.
 */
export function offerChoices(state: CampaignState, reg: Registries, unitId: string): Record<OfferTab, OfferChoice[]> {
  const out = Object.fromEntries(OFFER_TABS.map((t) => [t, [] as OfferChoice[]])) as Record<OfferTab, OfferChoice[]>;
  if (!offerable(state, reg, unitId)) return out;
  const scene = state.scene;
  const inScene = scene !== undefined && scene.participants.includes(unitId);
  const units = inScene ? [...scene!.participants] : [unitId];
  const have = inScene ? sceneAffordances(state, reg) : undefined;
  const fits = (e: Entry): boolean => {
    const need = (e.requires as { affordances?: unknown } | undefined)?.affordances;
    return have === undefined || !Array.isArray(need) || need.every((a) => have.has(String(a)));
  };
  const frozen = inScene && transitionProblem(state, reg, { person: COMMANDER, field: 'posture', value: 'sitting' }) !== null; // held in place (`mobility: none`)
  const moves = (id: string): boolean => !inScene || transitionProblem(state, reg, { person: COMMANDER, field: 'posture', value: id }) === null;

  for (const e of reg.worshipTargets.values()) {
    if (!entryAllowed(state, reg, e, units)) continue;
    out.part.push({ id: e.id, label: String(e.label), known: zoneRevealed(state, unitId, e.id) ? worshipOf(state, reg, unitId, e.id) : 'unknown' });
  }
  for (const e of reg.blockingPostures.values()) if (moves(e.id)) out.posture.push({ id: e.id, label: String(e.label) });
  for (const e of reg.blockingContacts.values()) {
    if (frozen || !fits(e) || !entryAllowed(state, reg, e, units)) continue;
    (tagsOf(e).includes('objectification') ? out.role : out.contact).push({ id: e.id, label: String(e.label) });
  }
  if (entryAllowed(state, reg, { contentTags: [TUNING.offer.serviceCategory] }, units)) {
    for (const e of reg.blockingActivities.values()) {
      if (e.actor === 'commander' && e.scope === 'dynamic' && entryAllowed(state, reg, e, units)) out.service.push({ id: e.id, label: String(e.label) });
    }
  }
  for (const id of TUNING.offer.times) out.time.push({ id, label: TIME_LABEL[id] ?? id });
  out.endurance.push({ id: ENDURANCE_ID, label: ENDURANCE_LABEL });
  return out;
}

/** What the commander's words for an entry are (the registry's label; the closed lists carry their own). */
export function offerLabel(reg: Registries, tab: OfferTab, id: string): string {
  switch (tab) {
    case 'part': return String(reg.worshipTargets.get(id)?.label ?? id);
    case 'posture': return String(reg.blockingPostures.get(id)?.label ?? id);
    case 'contact':
    case 'role': return String(reg.blockingContacts.get(id)?.label ?? id);
    case 'service': return String(reg.blockingActivities.get(id)?.label ?? id);
    case 'time': return TIME_LABEL[id] ?? id;
    case 'endurance': return ENDURANCE_LABEL;
  }
}

/**
 * Reads untrusted data into a composition: a list of `{ tab, ids }`, every tab one of `OFFER_TABS` and used once, every id text, one or two entries in all. Throws with the
 * reason otherwise. The entries themselves are checked against `offerChoices` by `makeOffer`.
 */
export function readComposition(raw: unknown): OfferComposition {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('An offer needs at least one entry.');
  const out: OfferComposition = [];
  for (const row of raw) {
    const tab = (row as { tab?: unknown } | null)?.tab;
    const ids = (row as { ids?: unknown } | null)?.ids;
    if (typeof tab !== 'string' || !(OFFER_TABS as readonly string[]).includes(tab)) throw new Error(`An offer tab is ${OFFER_TABS.join(', ')}.`);
    if (out.some((c) => c.tab === tab)) throw new Error('Each tab may appear once.');
    if (!Array.isArray(ids) || ids.length === 0 || ids.some((i) => typeof i !== 'string' || i === '')) throw new Error('Each tab needs the ids it offers.');
    out.push({ tab: tab as OfferTab, ids: [...new Set(ids as string[])] });
  }
  const n = out.reduce((sum, c) => sum + c.ids.length, 0);
  if (n < 1 || n > TUNING.offer.maxEntries) throw new Error(`An offer is one or two entries (it has ${n}).`);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Her answer

/** What a practice category she has reads as an attitude: she leads in what she craves and enjoys; what she tolerates or does not practise leaves her indifferent. */
const ATTITUDE_OF_AS: Readonly<Record<PracticeAs, Attitude>> = { craves: 'craves', enjoys: 'enjoys', tolerates: 'indifferent', none: 'indifferent' };
const bestOf = (list: readonly Attitude[]): Attitude => list.reduce<Attitude>((best, a) => (RANK[a] > RANK[best] ? a : best), 'indifferent');

/** The strongest attitude of the practice categories among `tags` (none of them: indifference). */
function categoryAttitude(view: PracticeView | null, tags: readonly string[]): Attitude {
  if (view === null) return 'indifferent';
  return bestOf(tags.filter((t) => view.categories[t] !== undefined).map((t) => ATTITUDE_OF_AS[view.categories[t].as]));
}

interface EntryRead {
  attitude: Attitude;
  /** A worship target whose zone the commander has not been shown (and no mastery has opened). */
  unknown?: string;
  /** A worship target of the entry whose zone is not yet shown: the answer shows it. */
  reveal?: string;
}

/** The attitude one entry meets (see the file header). A contact's targets decide it when she has a word on any; a tab with no profile of its own reads her practice. */
function readEntry(state: CampaignState, reg: Registries, unitId: string, tab: OfferTab, id: string): EntryRead {
  const view = practiceOf(state, reg, unitId);
  switch (tab) {
    case 'part': {
      const shown = zoneRevealed(state, unitId, id);
      const open = shown || masteryLevel(state, unitId, id) >= TUNING.mastery.revealLevel; // a zone the commander's mastery has opened is shown by the answer, not by a correction
      const attitude = worshipOf(state, reg, unitId, id);
      return open ? { attitude, ...(shown ? {} : { reveal: id }) } : { attitude, unknown: id };
    }
    case 'contact':
    case 'role': {
      const entry = reg.blockingContacts.get(id);
      const targets = ((entry?.target as string[] | undefined) ?? []).filter((t) => expectationsOf(state, reg, unitId).worship?.[t] !== undefined);
      if (targets.length > 0) {
        const all = targets.map((t) => worshipOf(state, reg, unitId, t));
        return { attitude: all.includes('dislikes') ? 'dislikes' : bestOf(all) };
      }
      return { attitude: categoryAttitude(view, tagsOf(entry)) };
    }
    case 'posture': return { attitude: categoryAttitude(view, tagsOf(reg.blockingPostures.get(id))) };
    case 'service': return { attitude: categoryAttitude(view, [TUNING.offer.serviceCategory]) };
    case 'time': return { attitude: view === null ? 'indifferent' : TUNING.offer.timeBy[view.drive] };
    case 'endurance': return { attitude: categoryAttitude(view, view?.allowed ?? []) };
  }
}

/** The humiliation (0 to 5) of one entry, for Regard (R18). Postures read their camera effect, contacts their `humiliation` tag. */
export function humiliationOf(reg: Registries, tab: OfferTab, id: string): number {
  const H = TUNING.offer.humiliation;
  switch (tab) {
    case 'part': return H.part;
    case 'posture': {
      const effects = (reg.blockingPostures.get(id)?.effects as Array<{ type: string; mode?: string }> | undefined) ?? [];
      return effects.some((e) => e.type === 'camera' && H.lowCameras.includes(String(e.mode))) ? H.posture : H.postureFlat;
    }
    case 'contact': return tagsOf(reg.blockingContacts.get(id)).includes('humiliation') ? H.contactTagged : H.contact;
    case 'role': return H.role;
    case 'service': return H.service;
    case 'time': return H.time;
    case 'endurance': return H.endurance;
  }
}

export interface AnswerResult {
  answer: OfferAnswer;
  /** The hold the answer is worth before pace and compatibility (`addHold` scales it); 0 when it moves none. */
  hold: number;
  favour: number;
  /** The `TUNING.dynamic.gains` key the hold moves by. */
  cause?: 'offer_craves' | 'offer_enjoys' | 'offer_refused';
  /** The attitude behind a decided answer (what the zone fact says). */
  attitude?: Attitude;
  /** The worship target whose zone this answer shows the commander. */
  reveal?: string;
  /** The target she names in a correction ("not that, this"): one she craves. */
  corrected?: string;
  /** Only the holder cap stood in the way: she turned it down kindly. */
  kind?: true;
}

/** Does she mock what she dislikes (her leading style: a cruel or cold one, or a playful one with a mocking humor) or only turn it down? */
function mocks(state: CampaignState, reg: Registries, unitId: string): boolean {
  const key = leadingStyle(state, reg, unitId).key;
  return TUNING.offer.mockers.includes(key) || (TUNING.offer.mockingHumor.includes(key) && temperamentOf(state, unitId).humor === 'mocking');
}

/**
 * Her answer to a composition, decided from her profile with no draw (R20). The composition's attitude is the sharpest of its entries' (a dislike outweighs the rest, then an
 * unshown zone, then the best): `craves` is accepted (hold +6, favour +3), `enjoys` accepted (+3, +1), `indifferent` is "tonight" from a cold or ritual manner and
 * accepted for nothing from any other, `dislikes` is mocked (cruel, cold, a mocking playful) or refused (-3, -2). A worship zone the commander has not been shown is a correction instead: no
 * hold, the zone is shown (`reveal`) and she names one she craves (`corrected`). A good mood (her satisfaction `content`) multiplies a gain by 1.5, an irritated one (`frustrated`) by 0.5; a loss is
 * never softened. With the holder cap reached and she no holder, she refuses kindly (`kind`) with nothing moved. A zone the commander's mastery has opened (level 2) is not a correction: the answer is hers and shows it.
 */
export function answerOffer(state: CampaignState, reg: Registries, unitId: string, composition: OfferComposition): AnswerResult {
  if (capped(state, reg, unitId)) return { answer: 'refused', hold: 0, favour: 0, kind: true };
  const reads = composition.flatMap((c) => c.ids.map((id) => readEntry(state, reg, unitId, c.tab, id)));
  const T = TUNING.offer;
  const reveals = reads.flatMap((r) => (r.reveal !== undefined ? [r.reveal] : []));
  const sharp = reads.find((r) => r.attitude === 'dislikes' && r.unknown === undefined);
  const unknown = reads.find((r) => r.unknown !== undefined);
  if (sharp === undefined && unknown !== undefined) {
    const named = Object.entries(expectationsOf(state, reg, unitId).worship ?? {}).find(([id, w]) => w.attitude === 'craves' && id !== unknown.unknown)?.[0];
    return { answer: 'corrected', hold: 0, favour: 0, attitude: worshipOf(state, reg, unitId, unknown.unknown!), reveal: unknown.unknown!, ...(named !== undefined ? { corrected: named } : {}) };
  }
  const attitude: Attitude = sharp !== undefined ? 'dislikes' : bestOf(reads.map((r) => r.attitude));
  const mood = satisfactionOf(state, reg, unitId);
  const gain = (n: number): number => (mood === 'content' ? n * T.timing.content : mood === 'frustrated' ? n * T.timing.frustrated : n);
  const reveal = reveals.length > 0 ? { reveal: reveals[0] } : {};
  switch (attitude) {
    case 'craves': return { answer: 'accepted', hold: gain(TUNING.dynamic.gains.offer_craves), favour: gain(T.favour.craves), cause: 'offer_craves', attitude, ...reveal };
    case 'enjoys': return { answer: 'accepted', hold: gain(TUNING.dynamic.gains.offer_enjoys), favour: gain(T.favour.enjoys), cause: 'offer_enjoys', attitude, ...reveal };
    case 'indifferent': {
      const tonight = T.tonight.includes(leadingStyle(state, reg, unitId).key);
      return { answer: tonight ? 'tonight' : 'accepted', hold: 0, favour: 0, attitude, ...reveal };
    }
    case 'dislikes': return { answer: mocks(state, reg, unitId) ? 'mocked' : 'refused', hold: TUNING.dynamic.gains.offer_refused, favour: T.favour.dislikes, cause: 'offer_refused', attitude, ...reveal };
  }
}

// ---------------------------------------------------------------------------------------------
// Making the offer

/** The domain that grants a capability and that she claims by asking (the `demand` form); read by what it grants. */
const claimDomain = (reg: Registries, cap: string): DynamicDomainEntry | undefined => domainRows(reg).find((d) => d.claim === 'demand' && (d.grants as readonly string[]).includes(cap));

/**
 * An accepted offer of time or a part, while her frame is `claimFrame` or beyond, may become her claim of the domain that grants `book_ahead` (time) or `body_conditions` (a part):
 * with `claim.chance`, one draw. No draw when it cannot be: she has the domain, a claim of hers is open, she does not meet it, it waits out a refusal or another holder has it.
 */
function offerClaim(draft: CampaignState, ctx: Ctx, unitId: string, tab: OfferTab): EngineEvent[] {
  const reg = ctx.registries;
  const cap = (TUNING.offer.claim.capability as Record<string, string>)[tab];
  const dyn = dynamicOf(draft, unitId);
  const x = draft.dynamic;
  const entry = cap === undefined ? undefined : claimDomain(reg, cap);
  if (dyn === undefined || x === undefined || entry === undefined || frameRank(dyn.frame) < frameRank(TUNING.offer.claim.claimFrame as Frame)) return [];
  if (x.open.claims.some((c) => c.unitId === unitId) || !meets(reg, dyn, entry) || draft.day < (dyn.cooldowns[entry.id] ?? -Infinity)) return [];
  if (dyn.domains.some((d) => d.id === entry.id && standing(d, draft.day)) || holderOfDomain(draft, entry.id, unitId) !== null) return [];
  if (!ctx.rng.chance(TUNING.offer.claim.chance)) return [];
  const claimId = `dc${x.seq++}`;
  x.open.claims.push({ id: claimId, unitId, domainId: entry.id, day: draft.day });
  return [{ type: 'domain_claimed', unitId, claimId, domainId: entry.id }];
}

/** An offer moves her reading (R20): readiness `+r`, her motive toward `motive[tab]` (toward `gain` when something is asked in return). */
function nudgeReading(draft: CampaignState, unitId: string, tab: OfferTab, conditional: boolean): EngineEvent[] {
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined) return [];
  const rd = dyn.readOf;
  const toward = conditional ? TUNING.offer.position.conditional : TUNING.offer.position.motive[tab];
  const step = TUNING.position.alpha.motive;
  rd.r = Math.round(Math.min(1, rd.r + TUNING.offer.position.r) * 1e4) / 1e4;
  for (const k of MOTIVES) rd.motive[k] = Math.round((rd.motive[k] + step * ((k === toward ? 1 : 0) - rd.motive[k])) * 1e4) / 1e4;
  rd.updates += 1;
  const shift = resettleReading(dyn).region;
  return shift === undefined ? [] : [{ type: 'position_shifted', unitId, from: shift.from, to: shift.to }];
}

/** The named living soldiers in the open scene besides her: who sees the offer made. */
function witnessesOf(draft: CampaignState, unitId: string): string[] {
  const scene = draft.scene;
  if (scene === undefined || !scene.participants.includes(unitId)) return [];
  return scene.participants.filter((id) => id !== unitId && draft.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u)));
}

/**
 * The commander offers herself to her (`dynamic/offer`). The composition must be one the composer lists (`offerChoices`); a woman who cannot hold, or has an aftermath
 * running, cannot be offered to. Her answer is `answerOffer`'s. The offer is kept open (`do<n>`, until the scene or the day ends) for the model to confirm, hold and favour move,
 * her reading moves (R20), a shown zone is written by `zone_revealed` (the memory rule), and what the others in the room see follows: an accepted offer before others is a demonstration
 * (a fact for them and the sign `protocol_public`) and Regard falls for her and for each of them by the entries' humiliation; a mocked offer before others is something she keeps.
 * An accepted offer of time or a part may become her claim. `askInReturn` is the composer's toggle. Emits `offer_made` first. One draw at most (the claim), only when it is possible.
 */
export function makeOffer(draft: CampaignState, ctx: Ctx, unitId: string, composition: OfferComposition, opts: { askInReturn?: boolean } = {}): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) throw new Error('The dynamic is off.');
  const unit = draft.squad.find((u) => u.id === unitId);
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit)) throw new Error('An offer needs a named soldier in service.');
  if (!offerable(draft, reg, unitId)) throw new Error(`${unit.displayName} cannot be offered to now.`);
  const choices = offerChoices(draft, reg, unitId);
  for (const c of composition) {
    for (const id of c.ids) if (!choices[c.tab].some((e) => e.id === id)) throw new Error(`${offerLabel(reg, c.tab, id)} is not on offer.`);
  }
  const answer = answerOffer(draft, reg, unitId, composition);
  const x = draft.dynamic!;
  const scene = draft.scene;
  const id = `do${x.seq++}`;
  const open: OpenOffer = {
    id, unitId, day: draft.day, composition: composition.map((c) => ({ tab: c.tab, ids: [...c.ids] })), answer: answer.answer,
    ...(opts.askInReturn === true ? { conditions: true as const } : {}), ...(scene !== undefined && scene.participants.includes(unitId) ? { sceneId: scene.id } : {}),
  };
  x.open.offers.push(open);
  const what = composition.flatMap((c) => c.ids.map((i) => offerLabel(reg, c.tab, i).toLowerCase())).join(' and ');
  const events: EngineEvent[] = [{ type: 'offer_made', unitId, id, answer: answer.answer, what, tabs: composition.map((c) => c.tab), ...(opts.askInReturn === true ? { conditions: true } : {}), ...(answer.kind === true ? { kind: true } : {}), ...(answer.corrected !== undefined ? { corrected: answer.corrected } : {}) }];
  if (answer.kind === true) return events;

  // hold and favour; an accepted gain may begin her dynamic (`addHold` starts it for a woman who could hold)
  if (answer.cause !== undefined && answer.hold !== 0) events.push(...addHold(draft, ctx, unitId, answer.hold, answer.cause));
  if (answer.favour !== 0) addFavour(draft, unitId, answer.favour);
  // what it cost her to take it: her Regard rises when she took it after resisting (her reading's r at 0 or less, read before this offer moves it) (R18)
  if (answer.answer === 'accepted') events.push(...regardRise(draft, reg, unitId, 'cost'));
  const dyn = dynamicOf(draft, unitId);
  if (dyn !== undefined) {
    for (const c of composition) {
      dyn.recent.push(c.tab);
      while (dyn.recent.length > TUNING.probes.recentMax) dyn.recent.shift();
    }
  }
  events.push(...nudgeReading(draft, unitId, composition[0].tab, opts.askInReturn === true));

  // the zones this answer showed (the memory rule writes the fact)
  for (const target of [answer.reveal, answer.corrected]) {
    if (target === undefined || zoneRevealed(draft, unitId, target)) continue;
    events.push({ type: 'zone_revealed', unitId, targetId: target, attitude: worshipOf(draft, reg, unitId, target), what: String(reg.worshipTargets.get(target)?.label ?? target).toLowerCase(), via: 'offer' });
  }

  // what the others in the room see, and what it does to the respect she and they have for the commander
  const witnesses = witnessesOf(draft, unitId);
  const taken = answer.answer === 'accepted' || answer.answer === 'tonight';
  if (answer.answer === 'accepted') {
    const humiliation = Math.min(5, composition.reduce((sum, c) => sum + c.ids.reduce((s, i) => s + humiliationOf(reg, c.tab, i), 0), 0));
    events.push(...regardFall(draft, reg, unitId, humiliation, { witness: false, cause: 'offer' }));
    for (const w of witnesses) events.push(...regardFall(draft, reg, w, humiliation, { witness: true, cause: 'offer' }));
  }
  if (taken && witnesses.length > 0) {
    addFact(draft, {
      about: [unitId, ...witnesses], text: `AUTHOR TO WRITE: ${nameOf(draft, unitId)} took what the commander offered before ${witnesses.map((w) => nameOf(draft, w)).join(' and ')}.`, tags: ['dynamic', 'offer'],
      importance: 2, day: draft.day, knownBy: [unitId, ...witnesses],
    });
    for (const w of witnesses) events.push(...addSign(draft, ctx, w, unitId, 'protocol_public'));
  }
  if (answer.answer === 'mocked' && witnesses.length > 0 && holds(draft, unitId)) {
    addCompromat(draft, unitId, `AUTHOR TO WRITE: ${nameOf(draft, unitId)} mocked what the commander offered, before ${witnesses.map((w) => nameOf(draft, w)).join(' and ')}.`, witnesses);
  }
  if (answer.answer === 'accepted') {
    for (const tab of ['time', 'part'] as const) if (composition.some((c) => c.tab === tab)) { events.push(...offerClaim(draft, ctx, unitId, tab)); break; }
  }
  return events;
}

/** A pronoun for the commander (lore §0): a text that has one is dropped, never rewritten. */
const COMMANDER_PRONOUN = /\b(he|him|his|himself|he's)\b/i;

/**
 * The model confirms her answer (`offer_answered`). Only her own open offer that is not confirmed yet counts, and only when the answer is the one the engine gave: a mismatch is
 * dropped and the offer stays open. The confirmation closes the question; a correction's words become a fact of hers (cut to `TUNING.dynamic.intents.correctionMax`, dropped whole
 * when it has a pronoun for the commander). It never moves hold, favour or a frame: the engine decided at the offer. Draws nothing.
 */
export function confirmOffer(draft: CampaignState, unitId: string, offerId: string | undefined, answer: OfferAnswer | undefined, correction: string | undefined): EngineEvent[] {
  const open = offerId === undefined ? undefined : draft.dynamic?.open.offers.find((o) => o.id === offerId && o.unitId === unitId && o.confirmed !== true);
  if (open === undefined || answer === undefined || open.answer !== answer) return [];
  open.confirmed = true;
  const text = (correction ?? '').replace(/\s+/g, ' ').trim().slice(0, TUNING.dynamic.intents.correctionMax).trim();
  if (answer === 'corrected' && text !== '' && !COMMANDER_PRONOUN.test(text)) {
    addFact(draft, { about: [unitId], text: `AUTHOR TO WRITE: ${nameOf(draft, unitId)} corrected the commander: "${text}".`, tags: ['dynamic', 'offer_correction'], importance: 2, day: draft.day, knownBy: [unitId] });
  }
  return [];
}
