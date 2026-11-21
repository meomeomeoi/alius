/**
 * P15a: reading and changing the blocking, with every gate (plan R6). `checkChange` says why a change is refused and touches nothing;
 * `setBlocking` writes the log entry first and then the change. Nothing here draws.
 */
import type { Entry, Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import type { CampaignState, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { entryAllowed, sceneAffordances } from './gate';
import { pushLog } from './snapshots';
import { COMMANDER, INTIMACIES, NOTE_MAX, type Blocking, type BlockingContact } from './state';
import { effectsOfEntry, type BlockingEffect, type WornSlot } from './types';

export type BlockingField = 'posture' | 'anchor' | 'contact' | 'worn' | 'removed' | 'activity' | 'intimacy' | 'note';
export interface BlockingChange {
  person: string;
  field: BlockingField;
  value?: string;
  relTo?: string;
  with?: string;
  direction?: 'from' | 'to';
  slot?: string;
  target?: string;
}
export type BlockingSource = 'engine' | 'chip' | 'reading';

type AfterChange = (draft: CampaignState, reg: Registries, change: BlockingChange) => EngineEvent[];
const afterChange: AfterChange[] = [];

/** The physics layer registers here: what a change of the blocking sets in motion (a run starts or ends). Its events follow `blocking_changed`. */
export function registerAfterChange(fn: AfterChange): void {
  if (!afterChange.includes(fn)) afterChange.push(fn);
}

const NONE: Readonly<Blocking> = Object.freeze({});

/** What is stored for one person (nothing set = an empty record). */
export function blockingOf(scene: Pick<SceneRecord, 'blocking'> | undefined, personId: string): Readonly<Blocking> {
  return scene?.blocking?.[personId] ?? NONE;
}

const nameOf = (state: CampaignState, id: string): string => (id === COMMANDER ? 'The commander' : state.squad.find((u) => u.id === id)?.displayName ?? id);
const isPresent = (state: CampaignState, id: string): boolean => id === COMMANDER || (state.scene?.participants.includes(id) ?? false);
/** The soldiers the scene touches (the content gate and the frame read every one of them). */
const unitsOf = (state: CampaignState): string[] => state.scene?.participants ?? [];
/** The soldier a change is about, whichever of the pair `person` and `with` she is. */
const otherOf = (state: CampaignState, person: string): string | undefined => (person === COMMANDER ? state.scene?.participants[0] : COMMANDER);

// ---------------------------------------------------------------------------------------------
// effects

type Part = { entry: Entry | undefined; held: boolean };

/** The effects of one person's record, of the given type (posture, anchor, activity, what is worn and the contact it carries). */
export function effectsOf(blocking: Blocking, reg: Registries, channel: BlockingEffect['type']): BlockingEffect[] {
  return partsOf(blocking, reg, true).flatMap((p) => effectsOfEntry(p.entry)).filter((e) => e.type === channel);
}

function partsOf(b: Blocking, reg: Registries, withStance: boolean): Part[] {
  const out: Part[] = [];
  if (withStance) {
    if (b.posture !== undefined) out.push({ entry: reg.blockingPostures.get(b.posture), held: false });
    if (b.anchor !== undefined) out.push({ entry: reg.blockingAnchors.get(b.anchor.id), held: false });
    if (b.activity !== undefined) out.push({ entry: reg.blockingActivities.get(b.activity), held: false });
  }
  const seen = new Set<string>();
  for (const w of Object.values(b.worn ?? {})) {
    if (!w || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push({ entry: reg.blockingItems.get(w.id), held: true });
  }
  if (b.contact) out.push({ entry: reg.blockingContacts.get(b.contact.id), held: true });
  return out;
}

/**
 * Every effect that applies to a person. The effects are the COMMANDER's: the camera, the input, the device, the senses and the strain
 * are what the player lives, so a contact's effects (stored on its receiver) apply to the commander whichever side acts, and a soldier
 * carries only her own posture, anchor, activity and what she wears.
 */
export function personEffects(state: CampaignState, reg: Registries, personId: string): BlockingEffect[] {
  const scene = state.scene;
  if (!scene) return [];
  const own = blockingOf(scene, personId);
  if (personId !== COMMANDER) return partsOf({ ...own, contact: undefined }, reg, true).flatMap((p) => effectsOfEntry(p.entry));
  const contact = contactOf(scene);
  return partsOf({ ...own, contact: undefined }, reg, true).flatMap((p) => effectsOfEntry(p.entry)).concat(contact ? effectsOfEntry(reg.blockingContacts.get(contact.id)) : []);
}

/** The effects that hold a person where she is: what she wears and the contact (a posture or an anchor does not hold its own bearer). */
function restraintEffects(state: CampaignState, reg: Registries, personId: string): BlockingEffect[] {
  const scene = state.scene;
  if (!scene) return [];
  const own = blockingOf(scene, personId);
  const effects = partsOf({ ...own, contact: undefined }, reg, false).flatMap((p) => effectsOfEntry(p.entry));
  const contact = personId === COMMANDER ? contactOf(scene) : undefined;
  return contact ? effects.concat(effectsOfEntry(reg.blockingContacts.get(contact.id))) : effects;
}

/** The contact the commander is in, wherever its record sits (on the commander as a receiver, or on the soldier). */
export function contactOf(scene: Pick<SceneRecord, 'blocking'>): BlockingContact | undefined {
  for (const b of Object.values(scene.blocking ?? {})) if (b.contact) return b.contact;
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// transitions

const MOBILITY = ['none', 'limited', 'crawl', 'follows'] as const;

/** The most restrictive mobility a person is under (from what she wears and the contact she is in), or `null`. */
export function mobilityOf(state: CampaignState, reg: Registries, personId: string): (typeof MOBILITY)[number] | null {
  const levels = restraintEffects(state, reg, personId).filter((e): e is Extract<BlockingEffect, { type: 'mobility' }> => e.type === 'mobility').map((e) => e.level);
  return MOBILITY.find((m) => levels.includes(m)) ?? null;
}

/**
 * Why a posture or an anchor change is not allowed by what holds the person (`mobility`): `none` freezes both; `limited` refuses any
 * anchor change and any posture whose id starts with `standing`; `crawl` keeps `all_fours`; `follows` allows an anchor only if it is a
 * relative one with a soldier as `relTo`. `null` when the change is fine (or is not a movement).
 */
export function transitionProblem(state: CampaignState, reg: Registries, change: BlockingChange): string | null {
  if (change.field !== 'posture' && change.field !== 'anchor') return null;
  const level = mobilityOf(state, reg, change.person);
  if (level === null) return null;
  const who = nameOf(state, change.person);
  if (level === 'none') return `${who} cannot move: held in place.`;
  if (change.field === 'anchor') {
    if (level === 'limited') return `${who} cannot change place: movement is limited.`;
    if (level === 'follows') {
      const anchor = reg.blockingAnchors.get(change.value ?? '');
      const relTo = change.relTo ?? otherOf(state, change.person);
      return anchor?.kind === 'relative' && relTo !== undefined && relTo !== COMMANDER && relTo !== change.person ? null : `${who} can only stay with her: on a lead.`;
    }
    return null;
  }
  if (level === 'limited' && (change.value ?? '').startsWith('standing')) return `${who} cannot stand: movement is limited.`;
  if (level === 'crawl' && change.value !== 'all_fours') return `${who} can only crawl.`;
  return null;
}

// ---------------------------------------------------------------------------------------------
// validation

/** Who acts and who receives a contact, as the entry's `dir` says (`either` and `none` read the change). */
function partiesOf(entry: Entry, change: BlockingChange, state: CampaignState): { actor: string; receiver: string; unit: string } | string {
  const pair = [change.person, change.with];
  if (change.with === undefined) return 'A contact needs the person it is with.';
  if (!pair.includes(COMMANDER) || pair[0] === pair[1]) return 'A contact is between the commander and one soldier.';
  const unit = change.person === COMMANDER ? change.with : change.person;
  if (!isPresent(state, unit) || unit === COMMANDER) return `${nameOf(state, unit)} is not in the scene.`;
  switch (entry.dir) {
    case 'her': return { actor: unit, receiver: COMMANDER, unit };
    case 'commander': return { actor: COMMANDER, receiver: unit, unit };
    case 'either': {
      if (change.direction === undefined) return 'This contact works both ways: say who acts.';
      return change.direction === 'from' ? { actor: unit, receiver: COMMANDER, unit } : { actor: COMMANDER, receiver: unit, unit };
    }
    default: return { actor: unit, receiver: COMMANDER, unit }; // `none`: no touch; the record sits on the commander
  }
}

/** Why a change is refused, or `null`. Touches nothing. */
export function checkChange(state: CampaignState, reg: Registries, change: BlockingChange): string | null {
  const scene = state.scene;
  if (!scene) return 'No scene is open.';
  if (!isPresent(state, change.person)) return `${nameOf(state, change.person)} is not in the scene.`;
  const units = unitsOf(state);
  const value = change.value;
  const moved = transitionProblem(state, reg, change);
  if (moved !== null) return moved;
  switch (change.field) {
    case 'posture': {
      if (value === undefined || !reg.blockingPostures.has(value)) return `Unknown posture "${String(value)}".`;
      return null;
    }
    case 'anchor': {
      const a = value === undefined ? undefined : reg.blockingAnchors.get(value);
      if (!a) return `Unknown place "${String(value)}".`;
      const need = (a.requires as { affordances?: string[] } | undefined)?.affordances ?? [];
      const have = sceneAffordances(state, reg);
      const missing = need.find((x) => !have.has(x));
      if (missing !== undefined) return `This place has no ${missing}.`;
      if (a.kind === 'relative') {
        const relTo = change.relTo ?? otherOf(state, change.person);
        if (relTo === undefined || relTo === change.person || !isPresent(state, relTo)) return 'A place relative to someone needs somebody else in the scene.';
      }
      return null;
    }
    case 'contact': {
      const c = value === undefined ? undefined : reg.blockingContacts.get(value);
      if (!c) return `Unknown contact "${String(value)}".`;
      const parties = partiesOf(c, change, state);
      if (typeof parties === 'string') return parties;
      if (!entryAllowed(state, reg, c, [parties.unit])) return `${String(c.label)} is not available here.`;
      const need = (c.requires as { affordances?: string[] } | undefined)?.affordances ?? [];
      const have = sceneAffordances(state, reg);
      const missing = need.find((x) => !have.has(x));
      if (missing !== undefined) return `This place has no ${missing}.`;
      const targets = (c.target as string[] | undefined) ?? [];
      if (change.target !== undefined && !targets.includes(change.target)) return `${String(c.label)} has no target "${change.target}".`;
      if (change.target !== undefined) {
        const t = reg.worshipTargets.get(change.target);
        if (!t || !entryAllowed(state, reg, t, [parties.unit])) return `That target is not available here.`;
      }
      return null;
    }
    case 'worn': {
      const item = value === undefined ? undefined : reg.blockingItems.get(value);
      if (!item) return `Unknown item "${String(value)}".`;
      if (!entryAllowed(state, reg, item, units)) return `${String(item.label)} is not available here.`;
      const by = (item.wornBy as string | undefined) ?? 'commander';
      if ((by === 'commander') !== (change.person === COMMANDER)) return by === 'commander' ? `${String(item.label)} is worn by the commander.` : `${String(item.label)} is worn by her.`;
      const slots = slotsFor(item, change.slot, blockingOf(scene, change.person));
      if (typeof slots === 'string') return slots;
      return null;
    }
    case 'removed': {
      if (value === undefined) return 'Nothing named to remove.';
      return removalTarget(state, change.person, value) === null ? `${nameOf(state, change.person)} has no "${value}" to remove.` : null;
    }
    case 'activity': {
      const a = value === undefined ? undefined : reg.blockingActivities.get(value);
      if (!a) return `Unknown activity "${String(value)}".`;
      if ((a.actor === 'commander') !== (change.person === COMMANDER)) return `${String(a.label)} is not hers to do.`;
      const who = change.person === COMMANDER ? units : [change.person];
      if (!entryAllowed(state, reg, a, who)) return `${String(a.label)} is not available here.`;
      return null;
    }
    case 'intimacy': {
      if (!(INTIMACIES as readonly string[]).includes(value ?? '')) return `Unknown intimacy "${String(value)}".`;
      if (value === 'explicit' && !entryAllowed(state, reg, { contentTags: ['explicit_scenes'] }, units)) return 'That is not available here.';
      return null;
    }
    case 'note': return value !== undefined ? null : 'A note needs text.';
    default: return 'Unknown field.';
  }
}

/** The slots an item takes, or why it cannot be worn: `all` takes every slot of the item, `one` the chosen (or first free) one. */
function slotsFor(item: Entry, chosen: string | undefined, b: Blocking): WornSlot[] | string {
  const all = item.slots as WornSlot[];
  const free = (s: WornSlot): boolean => b.worn?.[s] === undefined;
  if ((item.slotMode as string | undefined) === 'one') {
    const slot = chosen !== undefined ? all.find((s) => s === chosen) : all.find(free);
    if (slot === undefined) return chosen !== undefined ? `${String(item.label)} does not go on "${chosen}".` : `Nowhere free to wear ${String(item.label)}.`;
    return free(slot) ? [slot] : `The ${slot} is taken.`;
  }
  const taken = all.find((s) => !free(s));
  return taken !== undefined ? `The ${taken} slot is taken by ${String(b.worn![taken]!.id).replace(/_/g, ' ')}.` : all;
}

/** What `removed` points at: an item the person wears, or the contact (the person is a party to it and its id matches). */
function removalTarget(state: CampaignState, person: string, id: string): { kind: 'item' } | { kind: 'contact'; receiver: string } | null {
  const scene = state.scene;
  if (!scene) return null;
  if (Object.values(scene.blocking?.[person]?.worn ?? {}).some((w) => w?.id === id)) return { kind: 'item' };
  for (const [receiver, b] of Object.entries(scene.blocking ?? {})) if (b.contact?.id === id && (receiver === person || b.contact.with === person)) return { kind: 'contact', receiver };
  return null;
}

// ---------------------------------------------------------------------------------------------
// writing

function record(draft: CampaignState, personId: string): Blocking {
  const scene = draft.scene!;
  scene.blocking ??= {};
  return (scene.blocking[personId] ??= {});
}
function tidy(draft: CampaignState): void {
  const b = draft.scene?.blocking;
  if (!b) return;
  for (const [id, rec] of Object.entries(b)) if (Object.keys(rec).length === 0) delete b[id];
  if (Object.keys(b).length === 0) delete draft.scene!.blocking;
}

/** Ends the contact stored on `receiverId` and puts the anchors it moved back (the previous one, else beside her for the commander). */
function clearContact(draft: CampaignState, receiverId: string): void {
  const rec = draft.scene?.blocking?.[receiverId];
  const contact = rec?.contact;
  if (!rec || !contact) return;
  delete rec.contact;
  for (const [id, prev] of Object.entries(contact.prev ?? {})) {
    const b = draft.scene!.blocking?.[id];
    if (!b?.anchor || b.anchor.id !== 'on_person') continue; // moved on since: leave where it is
    if (prev.anchor) b.anchor = { ...prev.anchor };
    else if (id === COMMANDER) b.anchor = { id: 'beside_her', relTo: receiverId === COMMANDER ? contact.with : receiverId };
    else delete b.anchor;
  }
}

/** Applies a change that `checkChange` passed. Returns the person the event is about. */
function apply(draft: CampaignState, reg: Registries, change: BlockingChange): void {
  const since = draft.scene!.exchanges;
  const value = change.value;
  switch (change.field) {
    case 'posture': record(draft, change.person).posture = value!; break;
    case 'anchor': {
      const a = reg.blockingAnchors.get(value!)!;
      record(draft, change.person).anchor = a.kind === 'relative' ? { id: value!, relTo: change.relTo ?? otherOf(draft, change.person)! } : { id: value! };
      break;
    }
    case 'contact': {
      const c = reg.blockingContacts.get(value!)!;
      const p = partiesOf(c, change, draft);
      if (typeof p === 'string') throw new Error(p);
      clearContact(draft, p.receiver);
      const implies = (c.implies ?? {}) as { actor?: { posture?: string; anchor?: string }; receiver?: { posture?: string; anchor?: string } };
      const prev: NonNullable<BlockingContact['prev']> = {};
      for (const [side, id, other] of [['actor', p.actor, p.receiver], ['receiver', p.receiver, p.actor]] as const) {
        const s = implies[side];
        if (!s) continue;
        const rec = record(draft, id);
        prev[id] = { ...(rec.posture !== undefined ? { posture: rec.posture } : {}), ...(rec.anchor ? { anchor: { ...rec.anchor } } : {}) };
        if (s.posture !== undefined) rec.posture = s.posture;
        if (s.anchor !== undefined) rec.anchor = reg.blockingAnchors.get(s.anchor)?.kind === 'relative' ? { id: s.anchor, relTo: other } : { id: s.anchor };
      }
      const target = change.target ?? (c.target as string[] | undefined)?.[0];
      record(draft, p.receiver).contact = { id: value!, with: p.actor, direction: p.actor === COMMANDER ? 'to' : 'from', ...(target !== undefined ? { target } : {}), since, ...(Object.keys(prev).length > 0 ? { prev } : {}) };
      break;
    }
    case 'worn': {
      const item = reg.blockingItems.get(value!)!;
      const rec = record(draft, change.person);
      const slots = slotsFor(item, change.slot, rec) as WornSlot[];
      rec.worn ??= {};
      for (const s of slots) rec.worn[s] = { id: value!, since };
      break;
    }
    case 'removed': {
      const t = removalTarget(draft, change.person, value!)!;
      if (t.kind === 'item') {
        const rec = record(draft, change.person);
        for (const [slot, w] of Object.entries(rec.worn ?? {})) if (w?.id === value) delete rec.worn![slot as WornSlot];
        if (rec.worn && Object.keys(rec.worn).length === 0) delete rec.worn;
      } else clearContact(draft, t.receiver);
      break;
    }
    case 'activity': {
      const a = reg.blockingActivities.get(value!)!;
      const rec = record(draft, change.person);
      rec.activity = value!;
      if (rec.posture === undefined && typeof a.impliedPosture === 'string') rec.posture = a.impliedPosture;
      break;
    }
    case 'intimacy': record(draft, change.person).intimacy = value as Blocking['intimacy']; break;
    case 'note': record(draft, change.person).note = value!.trim().slice(0, NOTE_MAX); break;
  }
  tidy(draft);
}

/**
 * Sets one field of the blocking. Throws with the reason when a gate refuses (the state is left as it was). On success the state before
 * the change goes onto the staging log first (`at` = the chat index it was made at) and `blocking_changed` is returned. Draws nothing.
 */
export function setBlocking(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, change: BlockingChange, opts: { at: number; source: BlockingSource }): EngineEvent[] {
  const problem = checkChange(draft, ctx.registries, change);
  if (problem !== null) throw new Error(problem);
  pushLog(draft, opts.at, { person: change.person, field: change.field, ...(change.value !== undefined ? { value: change.value } : {}), source: opts.source });
  apply(draft, ctx.registries, change);
  return [{ type: 'blocking_changed', person: change.person, field: change.field, value: change.value ?? null, source: opts.source }, ...afterChange.flatMap((fn) => fn(draft, ctx.registries, change))];
}

/**
 * The changes a reading reported (already sanitized against its offer): each goes through the same gates as a chip, with source `reading`
 * and `at` = the chunk's read index. One that a gate refuses is dropped silently; the rest still land. Draws nothing.
 */
export function applyReading(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, changes: unknown, at: number): EngineEvent[] {
  if (!Array.isArray(changes)) return [];
  const events: EngineEvent[] = [];
  for (const c of changes.slice(0, TUNING.blocking.maxChanges)) {
    if (typeof c !== 'object' || c === null) continue;
    const r = c as Record<string, unknown>;
    if (typeof r.person !== 'string' || typeof r.field !== 'string' || typeof r.value !== 'string') continue;
    if (!['posture', 'anchor', 'contact', 'worn', 'removed'].includes(r.field)) continue;
    const change: BlockingChange = {
      person: r.person, field: r.field as BlockingField, value: r.value,
      ...(typeof r.relTo === 'string' ? { relTo: r.relTo } : {}), ...(typeof r.with === 'string' ? { with: r.with } : {}),
      ...(r.direction === 'from' || r.direction === 'to' ? { direction: r.direction } : {}),
    };
    try {
      events.push(...setBlocking(draft, ctx, change, { at, source: 'reading' }));
    } catch {
      // a gate refused it: the reading's other changes still land
    }
  }
  return events;
}

/**
 * Sets a field when every gate allows it, with no log entry and no event (the scene's starting blocking: the engine's own setup is not a
 * change a swipe could take back). Returns whether it was set.
 */
export function setQuietly(draft: CampaignState, reg: Registries, change: BlockingChange): boolean {
  if (checkChange(draft, reg, change) !== null) return false;
  apply(draft, reg, change);
  return true;
}

/**
 * A content category went off: what is worn, the contact and the activity tagged with it are gone from every person, quietly (no
 * event, no log entry). Physics that depended on them ends through the hooks registered by the physics layer.
 */
export function stripTagged(draft: CampaignState, reg: Registries, removed: string[]): void {
  const scene = draft.scene;
  if (!scene?.blocking) return;
  const hit = (e: Entry | undefined): boolean => Array.isArray(e?.contentTags) && (e!.contentTags as string[]).some((t) => removed.includes(t));
  for (const [id, rec] of Object.entries(scene.blocking)) {
    for (const [slot, w] of Object.entries(rec.worn ?? {})) if (w && hit(reg.blockingItems.get(w.id))) delete rec.worn![slot as WornSlot];
    if (rec.worn && Object.keys(rec.worn).length === 0) delete rec.worn;
    if (rec.contact && hit(reg.blockingContacts.get(rec.contact.id))) clearContact(draft, id);
    if (rec.activity !== undefined && hit(reg.blockingActivities.get(rec.activity))) delete rec.activity;
  }
  tidy(draft);
}

/**
 * Takes a contact or a worn item out of the scene quietly (no gate, no log, no event): what the stop word and the end of a physics do. For an
 * item, every person who wears it; for a contact, the record that holds it (the anchors it moved go back). Returns whether anything went.
 */
export function removeSource(draft: CampaignState, kind: 'contact' | 'item', id: string): boolean {
  const scene = draft.scene;
  if (!scene?.blocking) return false;
  let any = false;
  for (const [person, rec] of Object.entries(scene.blocking)) {
    if (kind === 'item') {
      for (const [slot, w] of Object.entries(rec.worn ?? {})) {
        if (w?.id === id) {
          delete rec.worn![slot as WornSlot];
          any = true;
        }
      }
      if (rec.worn && Object.keys(rec.worn).length === 0) delete rec.worn;
    } else if (rec.contact?.id === id) {
      clearContact(draft, person);
      any = true;
    }
  }
  tidy(draft);
  return any;
}

/** Whether a contact or an item is in the scene now (who holds it does not matter). */
export function hasSource(scene: Pick<SceneRecord, 'blocking'> | undefined, kind: 'contact' | 'item', id: string): boolean {
  return Object.values(scene?.blocking ?? {}).some((b) => (kind === 'contact' ? b.contact?.id === id : Object.values(b.worn ?? {}).some((w) => w?.id === id)));
}

/** Takes a person's activity away quietly (no gate, no log, no event): she woke, or it ended. */
export function unsetActivity(draft: CampaignState, personId: string): void {
  const rec = draft.scene?.blocking?.[personId];
  if (!rec) return;
  delete rec.activity;
  tidy(draft);
}
