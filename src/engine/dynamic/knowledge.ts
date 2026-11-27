/**
 * How the squad learns of a dynamic (P15, plan R14, spec §15.13): a suspicion gauge per observer and per holder, three levels (`suspects_close`,
 * `suspects_dynamic`, `knows_dynamic`), the signs that feed it, and the day step that ages it. Each level writes one fact, hidden from the commander
 * until the observer has shown it in a later scene or DM (the knowledge rule of `analysis/providers/dynamic.ts`), and emits `dynamic_known`.
 * A sign is a `dynamicSigns` row read by `kind`; a row whose content is off adds nothing (M9). Nothing here draws: the gossip, the holder's telling
 * and every other pick are hashed (`dynamicRoll`). Everything answers `[]` while the dynamic is off.
 */
import type { Registries } from '../../content/types';
import { contentAllowed } from '../bonds/content';
import { countDeed } from '../discipline/deeds';
import { frameRank } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { whereaboutAt } from '../hub';
import { addFact } from '../memory/facts';
import { leaderOf } from '../power/state';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { hasCapability } from './capabilities';
import { dynamicOn } from './gate';
import { practiceOf } from './profile';
import { regardFall } from './regard';
import { reactToDynamic } from './reactions';
import { dynamicRoll } from './witness';
import { dynamicOf, type KnowledgeRecord } from './state';
import { DYNAMIC_KNOWLEDGE_TAG, type Contrast, type DynamicSignEntry, type KnowledgeLevel, type SignKind } from './types';
import { plainDraft } from '../../content/draft';

type Ctx = Pick<EngineCtx, 'registries'>;

const RANK: Readonly<Record<KnowledgeLevel, number>> = { suspects_close: 1, suspects_dynamic: 2, knows_dynamic: 3 };
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The row of the registry for a kind of sign (read by `kind`, never by id). */
const signRow = (reg: Registries, kind: SignKind): DynamicSignEntry | undefined =>
  [...reg.dynamicSigns.values()].find((r) => (r as unknown as DynamicSignEntry).kind === kind) as unknown as DynamicSignEntry | undefined;

/** The named living unit with this id, or `undefined`. Only these are observers. */
const observerUnit = (state: CampaignState, id: string): Unit | undefined => {
  const u = state.squad.find((x) => x.id === id);
  return u !== undefined && u.kind === 'named' && isLiving(u) ? u : undefined;
};

/** What `observerId` has reached for this holder, if anything. */
export function levelOf(state: Pick<CampaignState, 'dynamic'>, observerId: string, holderId: string): KnowledgeLevel | undefined {
  return state.dynamic?.knowledge[observerId]?.[holderId]?.level;
}

/** The observer's record for a holder, created empty (callers have passed the gates). */
function recordFor(draft: CampaignState, observerId: string, holderId: string): KnowledgeRecord {
  const x = draft.dynamic!;
  const row = (x.knowledge[observerId] ??= {});
  return (row[holderId] ??= { suspicion: 0 });
}

/**
 * Whether a sign by `holderId` may reach `observerId` now: the dynamic is on, the holder has a block, and the observer is a named living unit other
 * than the holder. (`Relation.dynamic` is the holder's; an observer needs no block.)
 */
function mayObserve(draft: CampaignState, reg: Registries, observerId: string, holderId: string): boolean {
  return dynamicOn(draft, reg) && draft.dynamic !== undefined && observerId !== holderId && observerUnit(draft, observerId) !== undefined
    && observerUnit(draft, holderId) !== undefined && dynamicOf(draft, holderId) !== undefined;
}

/** Close to the pair: Trust or Affinity of `closeAt` or more toward the commander (the engine has no unit-to-unit axes; see the spec's Implemented as). */
export function isClose(state: CampaignState, observerId: string): boolean {
  const rel = state.relations[observerId];
  return rel !== undefined && (rel.trust >= TUNING.squadKnowledge.closeAt || rel.affinity >= TUNING.squadKnowledge.closeAt);
}

/** The multiplier of every sign for this observer: her insight, her closeness to the pair, and the holder's audience. */
function multiplier(draft: CampaignState, reg: Registries, observerId: string, holderId: string): number {
  const T = TUNING.squadKnowledge;
  const insight = T.insight[observerUnit(draft, observerId)?.insight ?? 'mid'];
  const audience = practiceOf(draft, reg, holderId)?.audience;
  return insight * (isClose(draft, observerId) ? T.close : 1) * (audience !== undefined ? (T.audience[audience] ?? 1) : 1);
}

const nameOf = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;

/** The fact each level writes: hers, hidden from the commander, about the pair. No pronoun for the commander. */
const FACT_TEXT: Readonly<Record<KnowledgeLevel, (observer: string, holder: string) => string>> = {
  suspects_close: (o, h) => `AUTHOR TO WRITE: ${o} has noticed that ${h} and the commander are close.`,
  suspects_dynamic: (o, h) => `AUTHOR TO WRITE: ${o} suspects that ${h} gives the orders when the two are alone.`,
  knows_dynamic: (o, h) => `AUTHOR TO WRITE: ${o} knows that ${h} holds authority over the commander.`,
};

/** Raises her level to `level` (never lowers it): the record, the fact and `dynamic_known`; `knows_dynamic` then runs her reaction (`reactToDynamic`); Nothing when she is there already. */
function raise(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string, rec: KnowledgeRecord, level: KnowledgeLevel): EngineEvent[] {
  if (rec.level !== undefined && RANK[rec.level] >= RANK[level]) return [];
  rec.level = level;
  rec.levelDay = draft.day;
  addFact(draft, {
    about: [observerId, holderId], text: plainDraft(FACT_TEXT[level](nameOf(draft, observerId), nameOf(draft, holderId))), tags: [DYNAMIC_KNOWLEDGE_TAG, level], importance: 3,
    day: draft.day, knownBy: [observerId], hiddenFromCommander: true,
  });
  const events: EngineEvent[] = [{ type: 'dynamic_known', observerId, holderId, level }];
  if (level === 'knows_dynamic') events.push(...reactToDynamic(draft, ctx, observerId, holderId));
  return events;
}

/** Reads the level her suspicion gives and raises to it. */
function refresh(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string, rec: KnowledgeRecord): EngineEvent[] {
  const T = TUNING.squadKnowledge;
  const level: KnowledgeLevel | undefined = rec.suspicion >= T.knowsAt ? 'knows_dynamic' : rec.suspicion >= T.suspectsAt ? 'suspects_dynamic' : undefined;
  return level === undefined ? [] : raise(draft, ctx, observerId, holderId, rec, level);
}

/** Adds suspicion (never past 100) and marks today as a day with a sign. */
function gain(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string, amount: number): EngineEvent[] {
  const rec = recordFor(draft, observerId, holderId);
  rec.suspicion = Math.min(TUNING.squadKnowledge.knowsAt, round4(rec.suspicion + amount));
  rec.peakDay = draft.day;
  return refresh(draft, ctx, observerId, holderId, rec);
}

/**
 * The observer sees a sign of the dynamic. By the row: an `instant` one is knowledge at once (`knowInstantly`), a `closenessOnly` one gives
 * `suspects_close` and no suspicion, the rest add `amount` × her insight (0.7 / 1 / 1.3) × 1.5 when she is close to the pair × the holder's audience
 * (`show_off` 1.5, `private_only` 0.5). A kind with no row, a row whose content is off, an observer who is not a named living unit other than the holder,
 * and a holder with no block add nothing. Returns the `dynamic_known` events of a level it reached.
 */
export function addSign(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string, kind: SignKind): EngineEvent[] {
  const reg = ctx.registries;
  const row = signRow(reg, kind);
  if (row === undefined || !mayObserve(draft, reg, observerId, holderId) || !contentAllowed(draft, reg, row)) return [];
  if (row.instant === true) return knowInstantly(draft, ctx, observerId, holderId, kind);
  if (row.closenessOnly === true) return raise(draft, ctx, observerId, holderId, recordFor(draft, observerId, holderId), 'suspects_close');
  return gain(draft, ctx, observerId, holderId, round4(row.amount * multiplier(draft, reg, observerId, holderId)));
}

/** She knows at once (an item or a contact of the dynamic seen, the holder tells her, compromat shown): 100 whatever her insight, and `knows_dynamic`. */
export function knowInstantly(draft: CampaignState, ctx: Ctx, observerId: string, holderId: string, cause: SignKind): EngineEvent[] {
  const reg = ctx.registries;
  const row = signRow(reg, cause);
  if (row === undefined || !mayObserve(draft, reg, observerId, holderId) || !contentAllowed(draft, reg, row)) return [];
  const rec = recordFor(draft, observerId, holderId);
  if (rec.level === 'knows_dynamic') return [];
  rec.suspicion = TUNING.squadKnowledge.knowsAt;
  rec.peakDay = draft.day;
  return refresh(draft, ctx, observerId, holderId, rec);
}

// ---------------------------------------------------------------------------------------------
// What she has shown

/** Has the observer been with the commander, in a scene or in a DM, on a day after this one? The scene on record, an ended scene's mark, the chronicle and the DMs are looked at. */
export function sharedAfter(state: CampaignState, observerId: string, day: number): boolean {
  const scene = state.scene;
  if (scene !== undefined && scene.day > day && scene.participants.includes(observerId)) return true;
  if ((state.memory.scenes ?? []).some((m) => (m.day ?? 0) > day && m.participants?.includes(observerId) === true)) return true;
  if (state.memory.chronicle.some((c) => c.kind === 'scene' && c.day > day && (c.audience === '*' || (Array.isArray(c.audience) && c.audience.includes(observerId))))) return true;
  return (state.dms[observerId] ?? []).some((m) => m.day > day);
}

/**
 * The commander learns what a woman knows once she has shown it (review I7): a fact of the squad's knowledge (`dynamic_knowledge`) loses
 * `hiddenFromCommander` when its observer and the commander shared a scene or a DM on a day after the fact's. The engine's own step, so the prompt's
 * fact line ("she does not tell the commander") and `Knowledge` read the same flag; it runs after every action and writes nothing else. Draws nothing.
 */
export function revealKnown(draft: CampaignState): void {
  for (const f of draft.memory.facts) {
    if (f.hiddenFromCommander === true && f.tags.includes(DYNAMIC_KNOWLEDGE_TAG) && sharedAfter(draft, f.about[0], f.day)) delete f.hiddenFromCommander;
  }
}

// ---------------------------------------------------------------------------------------------
// The scene: who sees what

/** The living named units in the open scene. */
const presentIn = (draft: CampaignState): string[] => (draft.scene?.participants ?? []).filter((id) => observerUnit(draft, id) !== undefined);

/** The holders a sign seen in the scene is about: those present at `play` or beyond, else every holder at `play` or beyond. */
function pairHolders(draft: CampaignState, present: readonly string[]): string[] {
  const holds = (id: string): boolean => {
    const dyn = dynamicOf(draft, id);
    return dyn !== undefined && frameRank(dyn.frame) >= frameRank('play') && observerUnit(draft, id) !== undefined;
  };
  const here = present.filter(holds);
  return here.length > 0 ? here : draft.squad.map((u) => u.id).filter(holds);
}

/** Every `observers` unit sees the same sign of each holder in `holders` (the holder is never her own observer). */
function seen(draft: CampaignState, ctx: Ctx, observers: readonly string[], holders: readonly string[], kind: SignKind): EngineEvent[] {
  return holders.flatMap((h) => observers.filter((o) => o !== h).flatMap((o) => addSign(draft, ctx, o, h, kind)));
}

/** Whether something of the dynamic is on the stage now: an item worn or a contact held whose scope is `dynamic`. */
function stageShowsDynamic(draft: CampaignState, reg: Registries): boolean {
  return Object.values(draft.scene?.blocking ?? {}).some((b) =>
    (b.contact !== undefined && reg.blockingContacts.get(b.contact.id)?.scope === 'dynamic')
    || Object.values(b.worn ?? {}).some((w) => w !== undefined && reg.blockingItems.get(w.id)?.scope === 'dynamic'));
}

/**
 * The instant signs the scene's events carry (an after-action step): the commander wears an item of the dynamic, or takes a contact of it, with
 * others present (they know of each holder present, or of every holder when none is); and a visitor who walks in (`moment_fired` with a
 * `visitorId`) while the stage shows one; and a played milestone booking (`booking_played`), a `held_night` for every named unit. Nothing while the
 * dynamic is off or when nobody holds. Draws nothing.
 */
export function signsFromEvents(draft: CampaignState, ctx: Ctx, events: readonly EngineEvent[]): EngineEvent[] {
  const reg = ctx.registries;
  if (!dynamicOn(draft, reg)) return [];
  const out: EngineEvent[] = [];
  for (const e of events) {
    if (e.type === 'booking_played') {
      // a milestone booking that was played is a held night: everyone at base sees she was kept (R14, review I4); no scene is needed (`booking/play` opens none)
      const booking = (draft.personal?.bookings ?? []).find((b) => b.id === e.bookingId);
      if (booking?.source === 'milestone') out.push(...seen(draft, ctx, othersOf(draft, booking.unitId), [booking.unitId], 'held_night'));
      continue;
    }
    if (draft.scene === undefined) continue;
    if (e.type === 'blocking_changed' && e.person === 'commander' && typeof e.value === 'string') {
      const scope = e.field === 'worn' ? reg.blockingItems.get(e.value)?.scope : e.field === 'contact' ? reg.blockingContacts.get(e.value)?.scope : undefined;
      if (scope !== 'dynamic') continue;
      const present = presentIn(draft);
      out.push(...seen(draft, ctx, present, pairHolders(draft, present), e.field === 'worn' ? 'dynamic_item' : 'dynamic_contact'));
    } else if (e.type === 'moment_fired' && typeof e.visitorId === 'string' && stageShowsDynamic(draft, reg)) {
      out.push(...seen(draft, ctx, [e.visitorId], pairHolders(draft, presentIn(draft)), 'dynamic_contact'));
    }
  }
  return out;
}

/** The commander's protocol slips with others present (the intent `protocol_slip`): everybody else in the scene sees it. Nothing in a DM or alone. */
export function slipSeen(draft: CampaignState, ctx: Ctx, holderId: string): EngineEvent[] {
  const witnesses = presentIn(draft).filter((id) => id !== holderId);
  const events = seen(draft, ctx, presentIn(draft), [holderId], 'protocol_slip');
  if (witnesses.length === 0) return events;
  // before others it is a public one: the squad's deed (P9 nickname) and, for each who saw it, a small fall of her Regard (R18)
  countDeed(draft, 'protocol_public');
  for (const id of witnesses) events.push(...regardFall(draft, ctx.registries, id, TUNING.regard.acts.protocol, { witness: true, cause: 'protocol_slip' }));
  return events;
}

// ---------------------------------------------------------------------------------------------
// The day step

/** Suspicion loses `decayPerDay` on a day with no sign, never below `suspectsAt` within `floorDays` of the level she reached; `knows_dynamic` stays. A woman who falls below `suspectsAt` no longer suspects (she keeps what she noticed). */
function decay(draft: CampaignState): void {
  const T = TUNING.squadKnowledge;
  for (const row of Object.values(draft.dynamic!.knowledge)) {
    for (const rec of Object.values(row)) {
      if (rec.suspicion <= 0 || rec.peakDay === draft.day || rec.level === 'knows_dynamic') continue;
      const floor = rec.level === 'suspects_dynamic' && draft.day - (rec.levelDay ?? draft.day) <= T.floorDays ? T.suspectsAt : 0;
      rec.suspicion = Math.max(floor, round4(rec.suspicion - T.decayPerDay));
      if (rec.level === 'suspects_dynamic' && rec.suspicion < T.suspectsAt) { rec.level = 'suspects_close'; rec.levelDay = draft.day; }
    }
  }
}

/** The holders the day step looks at, in squad order: a living named unit with a block. */
const holdersOf = (draft: CampaignState): string[] => draft.squad.filter((u) => u.kind === 'named' && isLiving(u) && dynamicOf(draft, u.id) !== undefined).map((u) => u.id);

const othersOf = (draft: CampaignState, holderId: string): string[] => draft.squad.filter((u) => u.id !== holderId && u.kind === 'named' && isLiving(u)).map((u) => u.id);

/**
 * The morning after a `second_place` evening (R14, review I4): a holder whose domain gives the second place and whose booking of the evening that is
 * ending was played spent it away from her quarters, and the units who are at the hub the next morning (the hub's own derivation; every unit when the
 * pack has no hub rooms) see her leave: `leaving_quarters` for each.
 */
function leavingQuarters(draft: CampaignState, ctx: Ctx, holders: string[]): EngineEvent[] {
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const h of holders) {
    if (!hasCapability(draft, reg, h, 'second_place')) continue;
    if (!(draft.personal?.bookings ?? []).some((b) => b.unitId === h && b.day === draft.day && b.slot === 'evening' && b.status === 'played')) continue;
    const here = othersOf(draft, h).filter((o) => reg.hubRooms.size === 0 || whereaboutAt(draft, reg, o, draft.day + 1, 'morning').roomId !== null);
    events.push(...seen(draft, ctx, here, [h], 'leaving_quarters'));
  }
  return events;
}

/** Background: a day of shared routine tells them something at `role` (3) and `rule` (6); at `play` and below there is none (the dynamic lives in scenes). */
function background(draft: CampaignState, ctx: Ctx, holders: string[]): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const h of holders) {
    const frame = dynamicOf(draft, h)!.frame;
    if (frame !== 'role' && frame !== 'rule') continue;
    for (const o of othersOf(draft, h)) events.push(...addSign(draft, ctx, o, h, frame === 'role' ? 'background_role' : 'background_rule'));
  }
  return events;
}

/**
 * She tells them herself, by her `audience`: `select_few` tells, on one day in `tellOneIn` (a hash per woman), the women close to the pair and the
 * squad's leader; `show_off` tells every woman once in `showOffEvery` days. Only a holder at `play` or beyond has anything to tell.
 */
function tells(draft: CampaignState, ctx: Ctx, holders: string[]): EngineEvent[] {
  const T = TUNING.squadKnowledge;
  const leaderId = leaderOf(draft)?.id;
  const events: EngineEvent[] = [];
  for (const h of holders) {
    if (frameRank(dynamicOf(draft, h)!.frame) < frameRank('play')) continue;
    const audience = practiceOf(draft, ctx.registries, h)?.audience;
    const index = draft.squad.findIndex((u) => u.id === h);
    for (const o of othersOf(draft, h)) {
      if (levelOf(draft, o, h) === 'knows_dynamic') continue;
      const tells = audience === 'show_off'
        ? draft.day % T.showOffEvery === index % T.showOffEvery
        : audience === 'select_few' && (isClose(draft, o) || o === leaderId) && dynamicRoll(draft, o, `tell:${h}`) < 1 / T.tellOneIn;
      if (tells) events.push(...knowInstantly(draft, ctx, o, h, 'holder_tells'));
    }
  }
  return events;
}

/**
 * P15b: the chance that a woman passes it on, about a holder of this `contrast` (the distance between her two faces): `gossipChance` x the contrast factor, capped
 * (`TUNING.manner.contrast`). Without a contrast (a holder with no `manner`) it is the base, uncapped, as before.
 */
export function gossipChanceFor(contrast: Contrast | undefined): number {
  const T = TUNING.squadKnowledge.gossipChance;
  if (contrast === undefined) return T;
  const C = TUNING.manner.contrast;
  return Math.min(C.cap, T * C[contrast]);
}

/**
 * Gossip: a woman who knows passes it to another on a day with the hashed chance `gossipChance` (5), one who suspects the same (2); each is
 * multiplied like a sign, and a woman gets at most `gossipCap` of it in a day. The levels are read before anybody is told today, so the order of the
 * squad changes nothing.
 */
function gossip(draft: CampaignState, ctx: Ctx, holders: string[]): EngineEvent[] {
  const T = TUNING.squadKnowledge;
  const reg = ctx.registries;
  const events: EngineEvent[] = [];
  for (const h of holders) {
    const view = practiceOf(draft, reg, h);
    const chance = gossipChanceFor(view?.manner === undefined ? undefined : view.contrast); // P15b: a high contrast is talked about
    const before = new Map(othersOf(draft, h).map((id) => [id, levelOf(draft, id, h)]));
    for (const o of before.keys()) {
      if (before.get(o) === 'knows_dynamic') continue;
      let total = 0;
      for (const [y, level] of before) {
        if (y === o || (level !== 'knows_dynamic' && level !== 'suspects_dynamic')) continue;
        if (dynamicRoll(draft, o, `gossip:${y}:${h}`) >= chance) continue;
        const row = signRow(reg, level === 'knows_dynamic' ? 'gossip_knows' : 'gossip_suspects');
        if (row !== undefined && contentAllowed(draft, reg, row)) total += row.amount * multiplier(draft, reg, o, h);
      }
      if (total > 0 && mayObserve(draft, reg, o, h)) events.push(...gain(draft, ctx, o, h, round4(Math.min(T.gossipCap, total))));
    }
  }
  return events;
}

/**
 * The squad's day (step 8 of the dynamic's day): the background, what the holders tell and the gossip add, then what was not fed today ages. Draws
 * nothing. `[]` while the dynamic is off.
 */
export function knowledgeDayStep(draft: CampaignState, ctx: Ctx): EngineEvent[] {
  if (!dynamicOn(draft, ctx.registries) || draft.dynamic === undefined) return [];
  const holders = holdersOf(draft);
  // the signs of the day come first: `decay` skips a pair that was fed today, so the background nets its full 3 / 6 a day (review I3)
  const events = [...leavingQuarters(draft, ctx, holders), ...background(draft, ctx, holders), ...tells(draft, ctx, holders), ...gossip(draft, ctx, holders)];
  decay(draft);
  return events;
}
