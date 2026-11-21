/**
 * P15a: the moment pass and firing (plan R10). `momentPass` runs after an exchange has been read (and, from the physics, after a segment): it
 * is a no-op while the blocking is not live, while a moment is open or while nothing is live, and only then does it draw. `fireMoment` builds the
 * options, names what may give the commander away and who walks in, and opens the moment. The words of the options are the model's
 * (`labels`, Task 16); nothing here reads them.
 */
import type { Entry, Registries } from '../../content/types';
import { blockingLive, blockingOf, COMMANDER, contactOf, pushLog, personEffects } from '../blocking';
import { sceneAffordances } from '../blocking/gate';
import { effectsOfEntry, type BlockingEffect, type ResponseType } from '../blocking/types';
import { bondTierOf } from '../bonds/profile';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { fnv1a } from '../hub';
import { revealFact } from '../life/facts';
import type { CampaignState, SceneRecord } from '../state/types';
import { TUNING } from '../tuning';
import { keptFacts, liveSources, moodOf, visitorCandidates } from './live';
import { sceneSettingsOf } from './settings';
import { momentsOf, type MomentOption, type MomentsState, type OpenMoment } from './state';

export { sceneSettingsOf } from './settings';

const kindsOf = (s: Entry): string[] => (Array.isArray(s.live) ? (s.live as string[]) : []);
const GENERIC_KEYS = ['0', '1', '2'] as const;

/** The moments of the open scene, to write to (made when there are none). */
function momentsDraft(scene: SceneRecord): MomentsState {
  return (scene.moments ??= { fired: [] });
}
/** The chat index a change of the moments is made at (the reading's, like the blocking's). */
const atOf = (scene: SceneRecord): number => scene.readIndex ?? scene.startIndex;

/** The commander cannot see: a hood, a blindfold, the dark. */
const obscuredCommander = (effects: BlockingEffect[]): boolean => effects.some((e) => (e.type === 'perception' && e.others === 'obscured') || (e.type === 'camera' && e.mode === 'pov_dark'));

/**
 * The commander's present values whose effects do not let her hide (`visibility.hideable === false`), unless the posture she is in is
 * one the value excuses (`unlessPosture`): a tail does not show lying down.
 */
function cannotHide(state: CampaignState, reg: Registries): boolean {
  const posture = blockingOf(state.scene, COMMANDER).posture;
  return personEffects(state, reg, COMMANDER).some((e) => e.type === 'visibility' && e.hideable === false && !(posture !== undefined && (e.unlessPosture ?? []).includes(posture)));
}

/**
 * The options of a moment for a soldier: the source's three, and the additions the scene allows (`lock` when the room has a lock and a
 * visitor is coming; `look` when she is there and the commander can see; `ally` when another close soldier is present); a visitor moment
 * loses its first option (hiding) when the commander cannot hide what shows.
 */
export function optionsFor(state: CampaignState, reg: Registries, source: Entry, unitId: string): MomentOption[] {
  const frame = source.frame as Array<{ type: ResponseType }>;
  const visitor = kindsOf(source).includes('visitor');
  const options: MomentOption[] = GENERIC_KEYS.map((key, i) => ({ key, type: frame[i]!.type }));
  const out = visitor && cannotHide(state, reg) ? options.filter((o) => o.key !== '0') : options;
  const scene = state.scene!;
  if (visitor && sceneAffordances(state, reg).has('lock')) out.push({ key: 'lock', type: 'returned' });
  if (scene.participants.includes(unitId) && !obscuredCommander(personEffects(state, reg, COMMANDER))) out.push({ key: 'look', type: 'deflected' });
  if (scene.participants.some((id) => id !== unitId && bondTierOf(state, reg, id) !== null)) out.push({ key: 'ally', type: 'deflected' });
  return out;
}

/** The label of what may give the commander away: her first value that shows, else one that hides her from the door, else the contact. */
export function exposingElement(state: CampaignState, reg: Registries): string | undefined {
  const scene = state.scene;
  if (!scene) return undefined;
  const b = blockingOf(scene, COMMANDER);
  const contact = contactOf(scene);
  const parts: Array<Entry | undefined> = [
    b.posture !== undefined ? reg.blockingPostures.get(b.posture) : undefined,
    b.anchor ? reg.blockingAnchors.get(b.anchor.id) : undefined,
    b.activity !== undefined ? reg.blockingActivities.get(b.activity) : undefined,
    ...[...new Set(Object.values(b.worn ?? {}).map((w) => w?.id))].map((id) => (id !== undefined ? reg.blockingItems.get(id) : undefined)),
    contact ? reg.blockingContacts.get(contact.id) : undefined,
  ];
  const visibility = (e: Entry | undefined) => effectsOfEntry(e).filter((x): x is Extract<BlockingEffect, { type: 'visibility' }> => x.type === 'visibility');
  const shows = parts.find((e) => visibility(e).some((v) => v.exposing === true));
  const hidden = parts.find((e) => visibility(e).some((v) => v.hiddenFromDoor === true));
  const found = shows ?? hidden ?? (contact ? reg.blockingContacts.get(contact.id) : undefined);
  return found === undefined ? undefined : String(found.label);
}

/** Who walks in, by the scene and the exchange alone (no draw, so a swipe picks the same one). */
export function pickVisitor(state: CampaignState, reg: Registries): string | undefined {
  const scene = state.scene;
  const candidates = visitorCandidates(state, reg);
  if (!scene || candidates.length === 0) return undefined;
  return candidates[fnv1a(`${scene.id}|${scene.exchanges}|visitor`) % candidates.length];
}

/**
 * Opens a moment of `sourceId` for `unitId`. The state before goes onto the staging log first (a swipe takes the moment back). A source that
 * brings up a kept fact (`keeps_fact`) tells the oldest one to the commander now. Draws nothing.
 */
export function fireMoment(draft: CampaignState, ctx: Pick<EngineCtx, 'registries'>, sourceId: string, unitId: string): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  const source = reg.momentSources.get(sourceId);
  if (!scene || !source) throw new Error(`fireMoment: unknown source "${sourceId}" or no scene is open`);
  pushLog(draft, atOf(scene), { person: unitId, field: 'moment', value: sourceId, source: 'engine' });
  const moments = momentsDraft(scene);
  const exposing = source.exposes === true ? exposingElement(draft, reg) : undefined;
  const visitorId = kindsOf(source).includes('visitor') ? pickVisitor(draft, reg) : undefined;
  const fact = kindsOf(source).includes('keeps_fact') ? keptFacts(draft, reg, unitId)[0] : undefined;
  if (fact) revealFact(draft, fact.id);
  const open: OpenMoment = {
    id: `m${moments.fired.length + 1}`, sourceId, exchange: scene.exchanges, unitId, options: optionsFor(draft, reg, source, unitId),
    ...(exposing !== undefined ? { exposing } : {}), ...(visitorId !== undefined ? { visitorId } : {}), ...(fact ? { factId: fact.id } : {}),
  };
  moments.open = open;
  moments.fired.push({ sourceId, exchange: scene.exchanges });
  return [{ type: 'moment_fired', momentId: open.id, sourceId, unitId, ...(visitorId !== undefined ? { visitorId } : {}), ...(exposing !== undefined ? { exposing } : {}) }];
}

/** Whether the cooldowns let a moment fire now, and which sources are still out of their own gap. */
function cooledDown(state: CampaignState): { ok: boolean; rested: (sourceId: string) => boolean } {
  const scene = state.scene!;
  const freq = sceneSettingsOf(state).momentFrequency;
  const fired = momentsOf(scene).fired;
  const last = fired.reduce((n, f) => Math.max(n, f.exchange), -Infinity);
  const ok = fired.length < TUNING.moments.maxPerScene[freq] && (fired.length === 0 || scene.exchanges - last >= TUNING.moments.minGap[freq]);
  return { ok, rested: (id) => !fired.some((f) => f.sourceId === id && scene.exchanges - f.exchange < TUNING.moments.sourceGap) };
}

/** The chance of a moment in this pass: by the frequency, thinned at an explicit intimacy by its own setting (`off`: none). */
function chanceOf(state: CampaignState): number {
  const s = sceneSettingsOf(state);
  const explicit = Object.values(state.scene?.blocking ?? {}).some((b) => b.intimacy === 'explicit');
  if (!explicit) return TUNING.moments.chance[s.momentFrequency];
  return s.momentExplicit === 'off' ? 0 : TUNING.moments.chance[s.momentFrequency] * (s.momentExplicit === 'rarer' ? TUNING.moments.explicitMult : 1);
}

/** What she looks like now is what the next pass compares with. Written only when it changed. */
function refreshSeen(draft: CampaignState, reg: Registries): void {
  const scene = draft.scene!;
  for (const id of scene.participants) {
    const now = moodOf(draft, reg, id);
    if (!now) continue;
    const seen = momentsOf(scene).seen?.[id];
    if (seen && seen.stress === now.stress && seen.want === now.want && seen.vitals === now.vitals) continue;
    const m = momentsDraft(scene);
    (m.seen ??= {})[id] = now;
  }
}

/** Noise in the last segment of a hold makes a visitor likelier: a source that lives on a `visitor` gets `noiseBoost` added to its weight. */
export function weighted<T extends { sourceId: string; weight: number }>(state: CampaignState, reg: Registries, live: T[]): T[] {
  if ((state.scene?.physics?.last?.noise ?? 0) <= 0) return live;
  return live.map((l) => (kindsOf(reg.momentSources.get(l.sourceId) ?? ({} as Entry)).includes('visitor') ? { ...l, weight: l.weight + TUNING.moments.noiseBoost } : l));
}

/**
 * One pass over the moments. A no-op (no draw, nothing written) while the blocking is not live. Otherwise she is seen (`seen`), and unless
 * a moment is open, a cooldown holds or nothing is live, ONE `chance` is drawn; when it hits, one weighted pick over the live sources.
 * `opts.ripe` is the source the reading called ripe. `cause` says what ran the pass (`exchange`: a reading was applied; `segment`: a physics
 * segment ended); the pass itself is the same.
 */
export function momentPass(draft: CampaignState, ctx: Pick<EngineCtx, 'registries' | 'rng'>, _cause: 'exchange' | 'segment', opts: { ripe?: string } = {}): EngineEvent[] {
  const reg = ctx.registries;
  const scene = draft.scene;
  if (!scene || !blockingLive(draft, reg)) return [];
  const events: EngineEvent[] = [];
  const open = momentsOf(scene).open !== undefined;
  const { ok, rested } = cooledDown(draft);
  if (!open && ok) {
    const live = weighted(draft, reg, liveSources(draft, reg, opts).filter((l) => rested(l.sourceId)));
    if (live.length > 0 && ctx.rng.chance(chanceOf(draft))) {
      const total = live.reduce((n, l) => n + Math.max(1, Math.round(l.weight * 100)), 0);
      let r = ctx.rng.int(0, total - 1);
      const pick = live.find((l) => (r -= Math.max(1, Math.round(l.weight * 100))) < 0) ?? live[live.length - 1]!;
      events.push(...fireMoment(draft, ctx, pick.sourceId, pick.unitId));
    }
  }
  refreshSeen(draft, reg);
  return events;
}
