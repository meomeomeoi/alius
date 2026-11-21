/**
 * P15a: which moment sources are live right now (plan R10). Pure reads of the state: nothing here draws and nothing is written. A source
 * is live for a soldier when one of its `live` kinds holds for her; the weight is what the kinds add up to (the pick in `fire.ts` is
 * weighted by it). A present value's `sources` makes a source live when it has the `blocking` kind, and likelier when it is live another way. Closed kinds are `LIVE_KINDS`; the sources themselves are data, read by `live` and `sources`, never by id.
 */
import type { Entry, Registries } from '../../content/types';
import { wantBandOf } from '../bonds/want';
import { blockingOf, blockingLive, contactOf, personEffects, COMMANDER, type Blocking } from '../blocking';
import { sceneRoom } from '../blocking/gate';
import { sourceAllowed } from '../blocking/vocabulary';
import type { LiveKind, MomentSourceEntry } from '../blocking/types';
import { isOpenSpace, neighbours, roomOfPerson } from '../basePlan';
import { stressBand } from '../combat/stress';
import { stampedMoments } from '../development/moments';
import { whereabouts } from '../hub';
import { hidesInjury, vitalsOf } from '../vitals';
import { temperamentOf } from '../life/state';
import { TUNING } from '../tuning';
import type { CampaignState, Fact, Unit } from '../state/types';
import { momentsOf, type SeenMood } from './state';

export interface LiveSource { sourceId: string; unitId: string; weight: number }
type Trigger = (state: CampaignState, reg: Registries, unitId: string) => boolean;

const triggers = new Map<string, Trigger>();

/** A later package makes a source live (P15: her demand, a test; P16; P17a; P17e): `fn` says whether it is, for this soldier. One reader per source. */
export function registerMomentTrigger(sourceId: string, fn: Trigger): void {
  triggers.set(sourceId, fn);
}
/** Tests: forget every registered trigger. */
export function resetMomentTriggers(): void {
  triggers.clear();
}

const kindsOf = (s: Entry): LiveKind[] => (Array.isArray(s.live) ? (s.live as LiveKind[]) : []);
const unitOf = (state: CampaignState, id: string): Unit | undefined => state.squad.find((u) => u.id === id);

/** The sources a soldier's moment may be about: scope and content gate for her, her place in the scene, and the quiet-meeting rule. In registry order. */
export function allowedSources(state: CampaignState, reg: Registries, unitId: string): MomentSourceEntry[] {
  if (!state.scene?.participants.includes(unitId)) return [];
  return [...reg.momentSources.values()].filter((s) => sourceAllowed(state, reg, s, [unitId])) as unknown as MomentSourceEntry[];
}

/** What a soldier looks like now, in the bands the `mood_jump` source compares (the pass stores it as `seen`). */
export function moodOf(state: CampaignState, reg: Registries, unitId: string): SeenMood | null {
  const u = unitOf(state, unitId);
  if (!u) return null;
  const vitals = vitalsOf(state, reg, unitId)?.pattern;
  return { stress: stressBand(u.stress), want: wantBandOf(state, reg, unitId), ...(vitals !== undefined ? { vitals } : {}) };
}

/** Her kept facts of her own life: about her, `life` and `untold`, and of a life event she `keeps` (P14c). Oldest first (by id). */
export function keptFacts(state: CampaignState, reg: Registries, unitId: string): Fact[] {
  return state.memory.facts.filter((f) => f.about.includes(unitId) && f.tags.includes('life') && f.tags.includes('untold')
    && f.tags.some((t) => reg.lifeEvents.get(t)?.share === 'keeps'));
}

/** The living named soldiers outside the scene who could come in: in the scene's room or through a door of it, anyone when the place is open. */
export function visitorCandidates(state: CampaignState, reg: Registries): string[] {
  const scene = state.scene;
  const room = sceneRoom(state, reg);
  if (!scene || !room) return [];
  const near = new Set([String(room.id), ...neighbours(reg, String(room.id), 'door')]);
  const open = isOpenSpace(room);
  const here = whereabouts(state, reg);
  return here
    .filter((w) => !scene.participants.includes(w.unitId) && unitOf(state, w.unitId)?.kind === 'named')
    .filter((w) => {
      const at = roomOfPerson(state, reg, here, w.unitId);
      return at !== null && (open || near.has(String(at.id)));
    })
    .map((w) => w.unitId);
}

/** Something would be at stake if someone came in: a value that shows (`visibility`), a secret relationship, or an intimate scene. */
function atStake(state: CampaignState, reg: Registries): boolean {
  const scene = state.scene!;
  if (scene.tone === 'intimate') return true;
  if (scene.participants.some((id) => state.relations[id]?.publicity?.level === 'secret' || state.relations[id]?.stateId === 'secret_affair')) return true;
  return [...scene.participants, COMMANDER].some((id) => personEffects(state, reg, id).some((e) => e.type === 'visibility'));
}

/** The soldier a value of the commander's belongs to: the other party of her contact, else the first participant. */
function partnerOf(state: CampaignState): string {
  const scene = state.scene!;
  for (const [key, rec] of Object.entries(scene.blocking ?? {})) {
    if (!rec.contact) continue;
    const other = key === COMMANDER ? rec.contact.with : key;
    if (scene.participants.includes(other)) return other;
  }
  return scene.participants[0]!;
}

/** The entries of a record that count as present values (posture, anchor, activity, what is worn, the contact). */
function valuesOf(reg: Registries, b: Blocking): Array<Entry | undefined> {
  return [
    b.posture !== undefined ? reg.blockingPostures.get(b.posture) : undefined,
    b.anchor ? reg.blockingAnchors.get(b.anchor.id) : undefined,
    b.activity !== undefined ? reg.blockingActivities.get(b.activity) : undefined,
    ...[...new Set(Object.values(b.worn ?? {}).map((w) => w?.id))].map((id) => (id !== undefined ? reg.blockingItems.get(id) : undefined)),
    b.contact ? reg.blockingContacts.get(b.contact.id) : undefined,
  ];
}

/** What the `blocking` kind adds for `unitId`: the sum of the `sources` weights of the present values that are hers. */
function blockingWeight(state: CampaignState, reg: Registries, sourceId: string, unitId: string): number {
  const scene = state.scene!;
  let sum = 0;
  for (const [person, rec] of Object.entries(scene.blocking ?? {})) {
    const owner = person === COMMANDER ? partnerOf(state) : person;
    if (owner !== unitId) continue;
    for (const e of valuesOf(reg, rec)) {
      const w = (e?.sources as Record<string, number> | undefined)?.[sourceId];
      if (typeof w === 'number' && w > 0) sum += w;
    }
  }
  return sum;
}

/** The last segment of a running hold: it crossed the warning gauge (`physics_warning`), or it slipped (`physics_slip`). */
function physicsLive(state: CampaignState, kind: 'physics_warning' | 'physics_slip'): boolean {
  const last = state.scene?.physics?.last;
  return kind === 'physics_warning' ? last?.warning === true : (last?.slips ?? 0) > 0;
}

/**
 * The sources that are live in the open scene, one row per source and soldier, in registry order then participant order. `opts.ripe` is
 * the source the reading of this exchange called ripe: it counts only for a source with the `extracted` kind (it is live because of it, and
 * its weight doubles); for any other source it means nothing. `opts.cause` is the pass that asks: the physics kinds (a warning, a slip) are live only for `segment` (or when none is said). Empty while the blocking is not live. Draws nothing.
 */
export function liveSources(state: CampaignState, reg: Registries, opts: { ripe?: string; cause?: 'exchange' | 'segment' } = {}): LiveSource[] {
  const scene = state.scene;
  if (!scene || !blockingLive(state, reg)) return [];
  const moments = momentsOf(scene);
  const stake = atStake(state, reg);
  const visitors = visitorCandidates(state, reg).length > 0;
  const commanderEffects = personEffects(state, reg, COMMANDER);
  const obscured = commanderEffects.some((e) => (e.type === 'perception' && e.others === 'obscured') || (e.type === 'camera' && e.mode === 'pov_dark'));
  const alarm = state.missions.active.some((m) => m.deadlineDay !== undefined && m.deadlineDay <= state.day + 1)
    || state.world.clocks.some((c) => c.filledDay === state.day)
    || state.calendar.nightEventsQueue.some((n) => n.expiresDay >= state.day);
  const out: LiveSource[] = [];
  for (const source of reg.momentSources.values()) {
    const kinds = kindsOf(source);
    for (const unitId of scene.participants) {
      const unit = unitOf(state, unitId);
      if (!unit || !sourceAllowed(state, reg, source, [unitId])) continue;
      let weight = 0;
      const bw = blockingWeight(state, reg, source.id, unitId);
      for (const kind of kinds) {
        switch (kind) {
          case 'extracted': break; // counted below, once
          case 'blocking': weight += bw; break;
          case 'visitor': if (visitors && stake && unitId === scene.participants[0]) weight += 1; break;
          case 'obscured': if (obscured && unitId === scene.participants[0]) weight += 1; break;
          case 'mood_jump': {
            const before = moments.seen?.[unitId];
            const now = moodOf(state, reg, unitId);
            if (before && now && (before.stress !== now.stress || before.want !== now.want || before.vitals !== now.vitals)) {
              weight += temperamentOf(state, unitId).volatility === 'moody' ? TUNING.moments.moodyMult : 1;
            }
            break;
          }
          case 'weakness': {
            const band = stressBand(unit.stress);
            const hurt = (unit.status === 'injured' || (unit.injuryDays ?? 0) > 0) && !hidesInjury(state, reg, unitId);
            if (band === 'breaking' || band === 'breakdown' || hurt || stampedMoments(state, unitId).length > 0) weight += 1;
            break;
          }
          case 'asleep': {
            const act = blockingOf(scene, unitId).activity;
            if (act !== undefined && reg.blockingActivities.get(act)?.attention === 'none') weight += 1;
            break;
          }
          case 'alarm': if (alarm && unitId === scene.participants[0]) weight += 1; break;
          case 'keeps_fact': if (keptFacts(state, reg, unitId).length > 0) weight += 1; break;
          case 'physics_warning': case 'physics_slip': if (opts.cause !== 'exchange' && physicsLive(state, kind)) weight += 1; break; // what the last segment did is news only to the pass that follows it
          case 'external': if (triggers.get(source.id)?.(state, reg, unitId) === true) weight += 1; break;
        }
      }
      // a value that lists a source without the `blocking` kind makes it likelier once it is live some other way
      const ripe = opts.ripe === source.id && kinds.includes('extracted') && unitId === scene.participants[0];
      if (ripe) weight += 1;
      if (weight > 0 && !kinds.includes('blocking')) weight += bw;
      if (ripe) weight *= 2;
      if (weight > 0) out.push({ sourceId: source.id, unitId, weight });
    }
  }
  return out;
}
