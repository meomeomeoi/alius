import { isCostEffect } from '../../content/schemas';
import type { Entry, Registries } from '../../content/types';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { activeRosterUnits, isLiving } from '../economy';
import { meetsSocialRequirements, socialRank, type SocialStat } from '../social';
import type { CampaignState, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { afterFailedRoute, resolveRoute, routeChoices, routeScope, type RouteChoice, type RoutePick } from '../commander/checks';
import { finishEventNode } from '../world/expedition';
import { applyWorldEffects } from '../world/effects';
import { currentBeat } from '../world/spine';
import { clockById, knownRegions } from '../world/state';
import type { WorldEffect } from '../world/types';
import { DILEMMA_CONTEXTS, type DilemmaContext, type DilemmaOption, type DilemmaScale, type DilemmaState } from './types';
import { checkDefining, parseDilemmaOutput, validateOptions } from './validate';

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const STALE = 'Stale dilemma answer.';
const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Who a dilemma is about: the party in a run, otherwise the living named units of the active roster. */
export function presentUnits(state: CampaignState): string[] {
  if (state.expedition) {
    return state.expedition.party.filter((id) => {
      const u = state.squad.find((x) => x.id === id);
      return u !== undefined && isLiving(u) && u.kind === 'named';
    });
  }
  return activeRosterUnits(state).filter((u) => u.kind === 'named').map((u) => u.id);
}

const unitsOf = (state: CampaignState, ids: string[]): Unit[] =>
  ids.map((id) => state.squad.find((u) => u.id === id)).filter((u): u is Unit => u !== undefined && isLiving(u));

// ---------------------------------------------------------------------------------------------
// The digest the model sees: no unit ids, no relationship numbers

export interface DilemmaDigest {
  day: number;
  context: DilemmaContext;
  region?: string;
  mission?: string;
  units: Array<{ name: string; values: Unit['values']; triggers: string[] }>;
  resources: Record<'credits' | 'supplies' | 'plyx', 'low' | 'ok' | 'high'>;
  factions: Array<{ id: string; name: string; standing: 'hostile' | 'cold' | 'neutral' | 'warm' }>;
  clocks: Array<{ id: string; label: string }>;
  flags: string[];
  allowedFlags: Array<{ id: string; description: string }>;
}

const standingBand = (n: number): DilemmaDigest['factions'][number]['standing'] => (n <= -30 ? 'hostile' : n < -5 ? 'cold' : n <= 15 ? 'neutral' : 'warm');

export function buildDilemmaDigest(state: CampaignState, reg: Registries, d: DilemmaState): DilemmaDigest {
  const template = reg.dilemmaTemplates.get(d.templateId);
  const bands = TUNING.dilemma.resourceBands;
  const level = (k: 'credits' | 'supplies' | 'plyx'): 'low' | 'ok' | 'high' =>
    state.resources[k] < bands[k][0] ? 'low' : state.resources[k] >= bands[k][1] ? 'high' : 'ok';
  const exp = state.expedition;
  const mission = exp ? state.missions.active.find((m) => m.id === exp.missionId) : undefined;
  const digest: DilemmaDigest = {
    day: state.day,
    context: d.context,
    units: unitsOf(state, d.units).map((u) => ({ name: u.displayName, values: { ...u.values }, triggers: [...u.triggers] })),
    resources: { credits: level('credits'), supplies: level('supplies'), plyx: level('plyx') },
    factions: [...reg.corporations.values()].map((c) => ({ id: String(c.id), name: String(c.name), standing: standingBand(state.world.factions[String(c.id)] ?? 0) })),
    clocks: state.world.clocks.filter((c) => c.filled < c.segments).map((c) => ({ id: c.id, label: c.label })),
    flags: state.world.flags.slice(-TUNING.director.digestFlags),
    allowedFlags: ((template?.allowedFlags as string[] | undefined) ?? []).map((id) => ({ id, description: String(reg.flags.get(id)?.description ?? id) })),
  };
  if (exp) digest.region = String(reg.regions.get(exp.regionId)?.name ?? exp.regionId);
  if (mission) digest.mission = mission.title;
  return digest;
}

// ---------------------------------------------------------------------------------------------
// Choosing what to ask

/** Templates pacing (or a request) may draw: they generate, fit a context, have what they need, were not shown lately and are not defining. */
export function eligibleTemplates(state: CampaignState, reg: Registries, contexts: DilemmaContext[]): Entry[] {
  const recent = state.dilemmas?.recent ?? [];
  const present = presentUnits(state).length;
  return [...reg.dilemmaTemplates.values()].filter((t) => {
    if (t.generate === undefined || t.scale === 'defining' || recent.includes(String(t.id))) return false;
    if (!(t.contexts as string[]).some((c) => (contexts as string[]).includes(c))) return false;
    const need = t.requiredRefs as { units?: number; factions?: string[]; regions?: string[]; clocks?: string[] } | undefined;
    if (!need) return true;
    if (need.units !== undefined && present < need.units) return false;
    if (need.factions?.some((id) => !reg.corporations.has(id))) return false;
    if (need.regions?.some((id) => !knownRegions(state, reg).some((r) => r.id === id))) return false;
    if (need.clocks?.some((id) => clockById(state, id) === undefined)) return false;
    return true;
  });
}

/** Opens a request for a generated dilemma. The model (or the fallback) answers it with `present` / `fallback`. */
export function openDilemma(draft: CampaignState, ctx: EngineCtx, p: { templateId: string; context: DilemmaContext }): EngineEvent[] {
  const reg = ctx.registries;
  if (draft.dilemmas?.open) throw new Error('A decision is already waiting.');
  const template = reg.dilemmaTemplates.get(p.templateId);
  if (!template) throw new Error(`Unknown dilemma template "${p.templateId}".`);
  if (!(DILEMMA_CONTEXTS as readonly string[]).includes(p.context) || !(template.contexts as string[]).includes(p.context)) {
    throw new Error(`"${p.templateId}" is not a ${String(p.context)} dilemma.`);
  }
  if (template.generate === undefined) throw new Error(`"${p.templateId}" has nothing to generate.`);
  const exp = draft.expedition;
  if (p.context === 'expedition_event') {
    if (!exp || exp.pending?.kind !== 'event' || exp.pending.templateId !== p.templateId) throw new Error('That event is not waiting on the map.');
  } else if (exp) throw new Error('Decisions at the base wait until the expedition is over.');
  const beatId = currentBeat(draft, reg)?.id ?? 'open';
  const scale = template.scale as DilemmaScale;
  if (scale === 'defining') {
    const bad = checkDefining(draft, beatId);
    if (bad) throw new Error(bad.reason);
  }
  const d = (draft.dilemmas ??= { seq: 0 });
  d.seq += 1;
  const mission = exp ? draft.missions.active.find((m) => m.id === exp.missionId) : undefined;
  const threadId = mission?.threadId !== undefined && draft.world.threads.some((t) => t.id === mission.threadId) ? mission.threadId : undefined;
  d.open = {
    id: `dl${d.seq}`, templateId: p.templateId, scale, context: p.context, day: draft.day, status: 'requested', attempts: 0,
    units: presentUnits(draft), beatId, ...(threadId !== undefined ? { threadId } : {}),
  };
  return [{ type: 'dilemma_requested', id: d.open.id, templateId: p.templateId }];
}

// ---------------------------------------------------------------------------------------------
// Answers

function openRequest(draft: CampaignState, requestId: unknown): DilemmaState {
  const open = draft.dilemmas?.open;
  if (!open || open.id !== requestId || open.status !== 'requested') throw new Error(STALE);
  return open;
}

/** The template is gone from the content: nothing to decide, the node (if any) is finished. */
function resolveNothing(draft: CampaignState, open: DilemmaState): EngineEvent[] {
  if (open.context === 'expedition_event' && draft.expedition?.pending?.kind === 'event') {
    finishEventNode(draft, draft.expedition.pending.nodeId, 'Nothing to decide.');
  }
  delete draft.dilemmas!.open;
  return [{ type: 'dilemma_resolved', id: open.id, templateId: open.templateId, nothing: true }];
}

function showFallback(draft: CampaignState, reg: Registries, open: DilemmaState): EngineEvent[] {
  const fixed = reg.dilemmaTemplates.get(open.templateId)?.fixed as
    | { title: string; setup: string; options: Array<{ label: string; requires?: DilemmaOption['requires']; routeCheck?: DilemmaOption['routeCheck']; effects: WorldEffect[] }> }
    | undefined;
  if (!fixed || nothingChoosable(draft, reg, fixed.options)) return resolveNothing(draft, open);
  open.title = fixed.title;
  open.setup = fixed.setup;
  open.options = fixed.options.map((o) => ({
    label: o.label, ...(o.requires ? { requires: { ...o.requires } } : {}), ...(o.routeCheck ? { routeCheck: structuredClone(o.routeCheck) } : {}),
    effects: structuredClone(o.effects), magnitudes: [],
  }));
  open.status = 'presented';
  open.source = 'fallback';
  return [{ type: 'dilemma_presented', id: open.id, templateId: open.templateId, title: open.title, source: 'fallback' }];
}

/** Presents the template's authored block: no model, a failed call, the setting off. */
export function fallbackDilemma(draft: CampaignState, ctx: EngineCtx, requestId: unknown): EngineEvent[] {
  return showFallback(draft, ctx.registries, openRequest(draft, requestId));
}

/**
 * The model's answer: parsed and validated by the engine. A first rejection asks for one retry (the request stays open);
 * a second presents the authored fallback in the same dispatch. Garbage never reaches the player.
 */
export function presentDilemma(draft: CampaignState, ctx: EngineCtx, requestId: unknown, raw: unknown): EngineEvent[] {
  const reg = ctx.registries;
  const open = openRequest(draft, requestId);
  const template = reg.dilemmaTemplates.get(open.templateId);
  if (!template) return resolveNothing(draft, open);
  open.attempts += 1;
  const parsed = parseDilemmaOutput(raw, { state: draft, reg, template, ...(open.threadId !== undefined ? { threadId: open.threadId } : {}) });
  const rejections = 'rejected' in parsed ? parsed.rejected : validateOptions(parsed.options, open.scale, unitsOf(draft, open.units));
  if (!('rejected' in parsed) && rejections.length === 0 && nothingChoosable(draft, reg, parsed.options)) {
    rejections.push({ rule: 'shape', reason: 'No option can be chosen right now: every one costs more than the squad has. Offer at least one the squad can afford.' });
  }
  if (!('rejected' in parsed) && rejections.length === 0) {
    open.title = parsed.title;
    open.setup = parsed.setup;
    open.options = parsed.options;
    open.status = 'presented';
    open.source = 'model';
    return [{ type: 'dilemma_presented', id: open.id, templateId: open.templateId, title: parsed.title, source: 'model' }];
  }
  const retry = open.attempts < TUNING.dilemma.maxAttempts;
  const events: EngineEvent[] = [{ type: 'dilemma_rejected', id: open.id, retry, rejections }];
  if (!retry) events.push(...showFallback(draft, reg, open));
  return events;
}

// ---------------------------------------------------------------------------------------------
// Choosing

/** Why an option cannot be chosen right now (`null` = it can). */
function blockedReason(state: CampaignState, reg: Registries, o: { requires?: DilemmaOption['requires']; routeCheck?: DilemmaOption['routeCheck']; effects: WorldEffect[] }): string | null {
  if (o.routeCheck && routeChoices(state, reg, o.routeCheck, routeScope(state)).every((r) => r.disabled !== null)) return 'No way to do this right now';
  if (o.requires && !meetsSocialRequirements(state, { [o.requires.stat]: o.requires.rank })) return `Needs ${capital(o.requires.stat)} ${o.requires.rank}`;
  for (const fx of o.effects) {
    if (fx.type === 'resource' && fx.amount < 0 && state.resources[fx.resource] < -fx.amount) return `Not enough ${fx.resource}`;
    if (fx.type === 'carried_supplies' && fx.amount < 0 && (state.expedition?.supplies ?? 0) < -fx.amount) return 'Not enough supplies';
  }
  return null;
}

/** A dilemma nobody can answer would block time for good: at least one option must be choosable when it is shown. */
const nothingChoosable = (state: CampaignState, reg: Registries, options: Array<{ requires?: DilemmaOption['requires']; routeCheck?: DilemmaOption['routeCheck']; effects: WorldEffect[] }>): boolean =>
  options.every((o) => blockedReason(state, reg, o) !== null);

/** The presented options with the reason each one is greyed (`null` = available). */
export function dilemmaOptions(
  state: CampaignState,
  reg: Registries,
): Array<{ index: number; label: string; disabled: string | null; hasCheck: boolean; check?: { stat: SocialStat; rank: number }; requires?: { stat: SocialStat; rank: number }; routes?: RouteChoice[] }> {
  const open = state.dilemmas?.open;
  if (!open || open.status !== 'presented' || !open.options) return [];
  return open.options.map((o, index) => ({
    index,
    label: o.label,
    disabled: blockedReason(state, reg, o),
    hasCheck: o.check !== undefined,
    // P7: how each route stands (open, or why not); the engine re-checks the pick when it is chosen
    ...(o.routeCheck ? { routes: routeChoices(state, reg, o.routeCheck, routeScope(state)) } : {}),
    // the tags only (P7a): what an option would change is never part of this list
    ...(o.check ? { check: { stat: o.check.stat, rank: o.check.rank } } : {}),
    ...(o.requires ? { requires: { stat: o.requires.stat, rank: o.requires.rank } } : {}),
  }));
}

const isBookkeeping = (fx: WorldEffect): boolean => fx.type === 'flag' || fx.type === 'thread_flag';

/** Applies the chosen option once: an optional social check, the effects, the bookkeeping and the node of an expedition event. */
export function chooseDilemma(draft: CampaignState, ctx: EngineCtx, id: unknown, index: unknown, route?: RoutePick): EngineEvent[] {
  const open = draft.dilemmas?.open;
  if (!open || open.id !== id || open.status !== 'presented' || !open.options) throw new Error(STALE);
  const option = dilemmaOptions(draft, ctx.registries)[index as number];
  if (typeof index !== 'number' || !Number.isInteger(index) || !option) throw new Error(`There is no option ${String(index)}.`);
  if (option.disabled !== null) throw new Error(`${option.label}: ${option.disabled}.`);
  const chosen = open.options[index];
  let effects = chosen.effects;
  let checkPassed: boolean | undefined;
  let routePassed: boolean | undefined;
  const routeEvents: EngineEvent[] = [];
  if (chosen.routeCheck) {
    // P7: the pick is checked again here (a stale click changes nothing); a failed or refused route keeps the costs
    if (route === undefined) throw new Error('Choose how to do it.');
    const taken = resolveRoute(draft, ctx, chosen.routeCheck, route, routeScope(draft));
    routePassed = taken.passed;
    routeEvents.push(...taken.events);
    if (!taken.passed) effects = afterFailedRoute(effects);
  }
  if (chosen.check) {
    const c = TUNING.dilemma.check;
    const chance = clamp(c.base + c.perRank * (socialRank(draft, chosen.check.stat) - chosen.check.rank), c.min, c.max);
    checkPassed = ctx.rng.chance(chance);
    // a failed check keeps the costs and drops the gains; the recorded decision itself (flags) still stands
    if (!checkPassed) effects = effects.filter((fx) => isCostEffect(fx) || isBookkeeping(fx));
  }
  const title = open.title ?? open.templateId;
  const events = [...routeEvents, ...applyWorldEffects(draft, ctx, effects, { kind: 'event', id: open.templateId, label: title, units: open.units })];
  const affected = [...new Set(events.filter((e) => e.type === 'relation_changed').map((e) => String(e.unitId)))];

  const d = draft.dilemmas!;
  d.lastDay = draft.day;
  d.recent = [...(d.recent ?? []).filter((t) => t !== open.templateId), open.templateId].slice(-TUNING.dilemma.recentMax);
  if (open.scale === 'defining') {
    d.lastDefiningDay = draft.day;
    d.definingBeats = [...new Set([...(d.definingBeats ?? []), open.beatId])];
  }
  if (open.context === 'expedition_event' && draft.expedition?.pending?.kind === 'event') {
    const nodeId = draft.expedition.pending.nodeId;
    finishEventNode(draft, nodeId, `${title}: ${chosen.label}.`, { templateId: open.templateId, option: chosen.label });
    events.push({ type: 'expedition_choice', nodeId, templateId: open.templateId, option: index, label: chosen.label });
  }
  delete d.open;
  events.push({
    type: 'dilemma_resolved', id: open.id, templateId: open.templateId, option: index, label: chosen.label, title, affected,
    ...(checkPassed !== undefined ? { checkPassed } : {}),
    ...(routePassed !== undefined ? { routePassed } : {}),
  });
  return events;
}

// ---------------------------------------------------------------------------------------------
// Pacing

/**
 * Day-end step: a request nobody answered gets its authored fallback; otherwise, every few days and with nothing open,
 * a template is drawn (seeded) and requested. `mission_outcome` templates only come on a day a mission ended;
 * `defining` ones are never drawn here.
 */
export function pacingStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const open = draft.dilemmas?.open;
  if (open) return open.status === 'requested' ? showFallback(draft, ctx.registries, open) : [];
  if (draft.disloyalty?.open) return [];
  if (draft.day - (draft.dilemmas?.lastDay ?? 0) < TUNING.dilemma.everyDays) return [];
  const contexts: DilemmaContext[] = ['base', 'director'];
  const missionEnded = draft.missions.completed.some((m) => m.outcomeDay === draft.day);
  if (missionEnded) contexts.push('mission_outcome');
  const pool = eligibleTemplates(draft, ctx.registries, contexts).filter((t) => missionEnded || !(t.contexts as string[]).every((c) => c === 'mission_outcome'));
  if (pool.length === 0) return [];
  const template = ctx.rng.pick(pool);
  const tc = template.contexts as string[];
  const context = (missionEnded && tc.includes('mission_outcome') ? 'mission_outcome' : tc.includes('base') ? 'base' : 'director') as DilemmaContext;
  return openDilemma(draft, ctx, { templateId: String(template.id), context });
}
