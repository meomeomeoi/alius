import type { Registries } from '../../content/types';
import { runActivity } from '../activities';
import { chooseDilemma } from '../dilemma/flow';
import { runHandler, type EngineCtx, type EngineEvent } from '../dispatch';
import { unitObeys } from '../personal/state';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic } from '../relations/graph';
import { socialRank } from '../social';
import type { CampaignState } from '../state/types';
import { TUNING } from '../tuning';
import { addFact } from '../memory';
import { learnExpectation } from './agenda';
import { conflictOf, herAlternative, type Judged } from './conflict';
import { addDefiance } from './escalation';
import { punishRoll } from './punish';
import { carryIfRan } from '../power/votes';
import { overrideOpen, wardenOf, wardenOverrideOpen, type Expectation, type OpenOverride, type WardenOrder, type WardenState } from './state';

export { overrideOpen, wardenOverrideOpen };

/**
 * The warden's override (P13 §3): when the commander gives an order that cuts across what she expects, she may countermand it. The
 * roll draws only when a conflict exists. A hit runs nothing and spends no slot; the commander answers COMPLY (her alternative runs),
 * ARGUE or DEFY (the order runs, at a price). Generic over the holder (`OverrideSource`): P15's holder of the command passes its own, and her
 * open override lives in `state.dynamic.override`, the warden's in `leashswap.warden.override`. One is open at a time, whoever's it is.
 */

/** Who holds the authority an order is checked against. The warden's source is `wardenSource`. */
export interface OverrideSource {
  /** `warden` (P13: her slot is `leashswap.warden.override`) or `holder` (P15: `dynamic.override`). */
  kind: 'warden' | 'holder';
  unitId: string;
  /** 0–1: how much the holder's word weighs right now. */
  authority: number;
  /** 0–1: how lenient the holder is toward the commander. */
  leniency: number;
  expectations: Expectation[];
}

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const round = Math.round;
const STALE = 'There is no override to answer.';
export const OPEN_FIRST = 'The warden has overridden an order: answer it first.';
/** The same refusal while a holder's override waits (the message names no one: it is the one the app shows the chip for). */
export const OPEN_FIRST_HOLDER = 'A holder has overridden an order: answer it first.';

/** `authority = (100 − satisfaction) / 100`, `leniency = 1 − 0.5 × max(0, her affinity) / 100`. Null while nobody holds the leash. */
export function wardenSource(state: CampaignState): OverrideSource | null {
  const w = wardenOf(state);
  if (!w) return null;
  const affinity = state.relations[w.unitId]?.affinity ?? 0;
  return { kind: 'warden', unitId: w.unitId, authority: (100 - w.satisfaction) / 100, leniency: 1 - (0.5 * Math.max(0, affinity)) / 100, expectations: w.expectations };
}

/** `clamp(weight × authority × leniency × scale, 0, cap)`. */
export function overrideChance(weight: number, source: OverrideSource): number {
  const T = TUNING.warden.override;
  return clamp(weight * source.authority * source.leniency * T.scale, 0, T.cap);
}

const contextOf = (order: WardenOrder): OpenOverride['context'] => (order.kind === 'combat_order' ? 'combat' : order.kind === 'dilemma' ? 'dilemma' : 'base');

/** Is the order hers to give anyway (an activity whose only named unit is her)? */
function hersToGive(order: WardenOrder, unitId: string): boolean {
  return order.kind === 'activity' && order.companionId === unitId && (order.unitIds ?? []).every((id) => id === unitId);
}

/**
 * Rolls the override for an order. Returns `null` when nothing happens (the order goes on) and the events of the override when it
 * hits. Draws nothing unless the order conflicts with an expectation: no mode, no warden in service, no conflict, a day on which she
 * obeys, an order that is hers to give, a dilemma below `major`, a warden not standing in the fight. A new order while one waits (the
 * warden's or a holder's) is refused (answer it first); a stale one is dropped. `opts.source` is a holder's (P15; absent: the warden's),
 * `opts.payload` the overridden action's payload, kept for COMPLY and DEFY.
 */
export function rollOverride(
  draft: CampaignState, ctx: EngineCtx, order: WardenOrder,
  opts: { judged?: Judged; source?: OverrideSource; payload?: Record<string, unknown> } = {},
): EngineEvent[] | null {
  const source = opts.source ?? wardenSource(draft);
  if (!source) return null;
  const w = source.kind === 'warden' ? wardenOf(draft) : null; // her own state: the compulsion, the slot, the learned expectation
  if (source.kind === 'warden' ? !w : draft.dynamic === undefined) return null;
  if (overrideOpen(draft)) throw new Error(wardenOverrideOpen(draft) !== null ? OPEN_FIRST : OPEN_FIRST_HOLDER);
  if (draft.leashswap?.warden?.override) delete draft.leashswap.warden.override; // stale
  if (draft.dynamic?.override) delete draft.dynamic.override; // stale
  if (unitObeys(draft, source.unitId) || hersToGive(order, source.unitId)) return null;
  if (order.kind === 'dilemma') {
    const scale = draft.dilemmas?.open?.scale;
    if (scale !== 'major' && scale !== 'defining') return null;
    if (draft.dilemmas?.open?.context === 'warden_report') return null; // the report on her is the commander's own move: she does not countermand it
  }
  if (order.kind === 'combat_order' && !draft.combat?.combatants.some((c) => c.unitId === source.unitId && !c.downed && c.hp > 0)) return null;
  // the Leash on the commander: at a major decision the choice is hers, whatever she expects; the compulsion is spent either way
  if (w?.compelled && order.kind === 'dilemma') {
    const alt = herAlternative(draft, ctx.registries, order, '');
    if (alt.order === null) {
      delete w.compelled; // nothing else to choose: the choice stands and the compulsion is spent
      return null;
    }
    return openOverride(draft, w, order, { expectationId: '', weight: 0 }, alt, opts.payload);
  }
  const hit = conflictOf(draft, ctx.registries, order, opts.judged, opts.source);
  if (!hit) return null;
  if (!ctx.rng.chance(overrideChance(hit.weight, source))) return null;
  const alt = herAlternative(draft, ctx.registries, order, hit.expectationId, opts.source);
  return w ? openOverride(draft, w, order, hit, alt, opts.payload) : openHolderOverride(draft, source, order, hit, alt, opts.payload);
}

/** Writes the open override and reports it. An override that cites no expectation (`''`, a compelled decision) teaches nothing. */
function openOverride(draft: CampaignState, w: WardenState, order: WardenOrder, hit: { expectationId: string; weight: number }, alt: { order: WardenOrder | null; label: string }, payload?: Record<string, unknown>): EngineEvent[] {
  const seq = (w.overrideSeq ?? 0) + 1;
  const context = contextOf(order);
  w.overrideSeq = seq;
  w.overrideFired = true;
  w.override = {
    id: `ov${seq}`, order, expectationId: hit.expectationId, weight: hit.weight, alternative: alt.order, altLabel: alt.label,
    ...(payload ? { payload } : {}), day: draft.day, slot: draft.slot, context,
    ...(context === 'combat' ? { ref: draft.combat!.id } : context === 'dilemma' ? { ref: draft.dilemmas!.open!.id } : {}),
  };
  return [{ type: 'warden_override', overrideId: w.override.id, expectationId: hit.expectationId, context }, ...(hit.expectationId === '' ? [] : learnExpectation(draft, hit.expectationId))];
}

/** Writes a holder's open override into `state.dynamic.override` (P15) and reports it. The id is `dov<n>`, from the dynamic's own sequence. */
function openHolderOverride(draft: CampaignState, source: OverrideSource, order: WardenOrder, hit: { expectationId: string; weight: number }, alt: { order: WardenOrder | null; label: string }, payload?: Record<string, unknown>): EngineEvent[] {
  const x = draft.dynamic!;
  const context = contextOf(order);
  x.overrideSeq += 1;
  x.override = {
    id: `dov${x.overrideSeq}`, order, expectationId: hit.expectationId, weight: hit.weight, alternative: alt.order, altLabel: alt.label,
    ...(payload ? { payload } : {}), day: draft.day, slot: draft.slot, context,
    ...(context === 'combat' ? { ref: draft.combat!.id } : context === 'dilemma' ? { ref: draft.dilemmas!.open!.id } : {}),
    unitId: source.unitId,
  };
  return [{ type: 'warden_override', overrideId: x.override.id, expectationId: hit.expectationId, context, source: 'holder', unitId: source.unitId }];
}

/** The judge's reading carried in an action's payload (`wardenJudged`), or undefined when absent or malformed. The engine accepts it only for a personal expectation of the warden (`conflictOf`). */
export function judgedOf(payload: unknown): Judged | undefined {
  const j = (typeof payload === 'object' && payload !== null ? (payload as { wardenJudged?: unknown }).wardenJudged : undefined) as Partial<Judged> | undefined;
  if (!j || typeof j.expectationId !== 'string' || (j.conflict !== 'none' && j.conflict !== 'minor' && j.conflict !== 'major')) return undefined;
  return { expectationId: j.expectationId, conflict: j.conflict };
}

/** What `payload` of an action looks like once its flag is stripped (the form COMPLY and DEFY re-run). */
export function plainPayload(payload: unknown): Record<string, unknown> {
  const { wardenChecked: _w, wardenJudged: _j, ...rest } = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<string, unknown>;
  return rest;
}

/** The party/roster formation for a new list of units: those already placed stay, a new one goes to the back row. */
function formationFor(original: unknown, ids: string[]): { front: string[]; back: string[] } {
  const f = (typeof original === 'object' && original !== null ? original : { front: [], back: [] }) as { front?: string[]; back?: string[] };
  const front = (f.front ?? []).filter((id) => ids.includes(id));
  const back = (f.back ?? []).filter((id) => ids.includes(id));
  for (const id of ids) if (!front.includes(id) && !back.includes(id)) back.push(id);
  return { front, back };
}

/**
 * Runs an order for real (the inner handler is re-run with `wardenChecked: true`, so it is not rolled again). `base` is the
 * overridden action's payload: the order's own fields replace the ones it names. A COMPLY with a different order than the original
 * builds the payload from the order alone where the original's fields would not fit.
 */
export function runOrder(draft: CampaignState, ctx: EngineCtx, order: WardenOrder, base: Record<string, unknown> = {}, sameAsOriginal = true): EngineEvent[] {
  switch (order.kind) {
    case 'activity': {
      const keep = sameAsOriginal ? { focus: base.focus } : {};
      // P14c: a quiet hour keeps its pastime (checked again for the companion who is really there; a pastime that does not fit gives a plain scene)
      const pastime = ctx.registries.activities.get(order.activityId)?.pastime === true && typeof base.pastimeId === 'string' ? { pastimeId: base.pastimeId } : {};
      return runActivity(draft, ctx, {
        ...keep, ...pastime, activityId: order.activityId,
        ...(order.companionId !== undefined ? { companionId: order.companionId } : {}), ...(order.unitIds !== undefined ? { unitIds: order.unitIds } : {}),
        wardenChecked: true, countermandChecked: true,
      });
    }
    case 'roster': return runHandler('roster/set_active', draft, { activeIds: order.activeIds, wardenChecked: true }, ctx);
    case 'expedition': {
      const events = runHandler('expedition/start', draft, { ...base, unitIds: order.unitIds, formation: formationFor(base.formation, order.unitIds), wardenChecked: true }, ctx);
      // P9b: the voted decision runs now (DEFY, a won argument): its vote, kept open by the override, is spent here
      return sameAsOriginal ? [...events, ...carryIfRan(draft, base.voteId, events, ctx)] : events;
    }
    case 'dilemma': {
      const events = chooseDilemma(draft, ctx, base.id ?? draft.dilemmas?.open?.id, order.index, sameAsOriginal ? (base.route as never) : undefined, true);
      return sameAsOriginal ? [...events, ...carryIfRan(draft, base.voteId, events, ctx)] : events;
    }
    case 'combat_order': return runHandler('combat/order', draft, { ...base, orderId: order.orderId, ...(order.targetCid !== undefined ? { targetCid: order.targetCid } : {}), wardenChecked: true }, ctx);
  }
}

/**
 * Her chance to be talked round in a fight (ARGUE in combat): `clamp(0.5 + 0.12 × (rank − herRank), 0.15, 0.85)` with `rank` the better of
 * the commander's Authority and Empathy and `herRank = clamp(round((satisfaction ≤ 50 ? 4 : 3) + affinity / 100), 1, 5)`.
 */
export function argueChance(state: CampaignState, _reg: Registries): number {
  const w = wardenOf(state);
  if (!w) return 0;
  const rank = Math.max(socialRank(state, 'authority'), socialRank(state, 'empathy'));
  const herRank = clamp(round((w.satisfaction <= 50 ? 4 : 3) + (state.relations[w.unitId]?.affinity ?? 0) / 100), 1, 5);
  return clamp(0.5 + 0.12 * (rank - herRank), 0.15, 0.85);
}

const addTo = (w: WardenState, key: 'satisfaction' | 'defiance', n: number): void => { w[key] = clamp(w[key] + n, 0, 100); };

/** The punishment roll and the escalation that follow a DEFY (the escalation is Task 11's). */
export function afterDefy(draft: CampaignState, ctx: EngineCtx, weight: number): EngineEvent[] {
  return punishRoll(draft, ctx, weight);
}

function relationEvent(draft: CampaignState, ctx: EngineCtx, type: 'warden_complied' | 'warden_defied', severity: 'minor' | 'moderate' | 'major', evidence: string): EngineEvent[] {
  const id = wardenOf(draft)!.unitId;
  return [
    { type, unitId: id, severity },
    ...applyEventToUnit(draft, ctx.registries, id, { type, actor: 'commander', targets: [id], severity, evidence, confidence: 1 }),
    ...evaluateAutomatic(draft, ctx.registries, id),
  ];
}

/**
 * The commander answers the open override. COMPLY: her alternative runs (or nothing, when she holds), satisfaction +4, defiance −3,
 * `warden_complied`. DEFY: the commander's order runs, defiance + round(30 × weight), satisfaction − round(20 × weight), `warden_defied`
 * (major from weight 0.4), then the punishment roll and the escalation. ARGUE in combat: one roll, no defiance either way; outside
 * combat ARGUE is the scene's business (the controller opens it) and returns nothing here. While compelled only COMPLY is accepted.
 */
export function answerOverride(draft: CampaignState, ctx: EngineCtx, overrideId: unknown, answer: unknown): EngineEvent[] {
  const w = wardenOf(draft);
  const ov = wardenOverrideOpen(draft);
  if (!w || !ov || ov.id !== overrideId) {
    if (w?.override && !ov) delete w.override;
    throw new Error(STALE);
  }
  if (answer !== 'comply' && answer !== 'argue' && answer !== 'defy') throw new Error('warden/answer: the answer is comply, argue or defy.');
  if (w.compelled && answer !== 'comply') throw new Error('The commander is compelled: only COMPLY is open.');
  const T = TUNING.warden;
  const base = ov.payload ?? {};
  const done = (a: string): EngineEvent => ({ type: 'override_answered', overrideId: ov.id, answer: a, context: ov.context });

  if (answer === 'argue') {
    if (ov.context !== 'combat') {
      if (ov.argued) throw new Error('She has heard the commander out: only COMPLY and DEFY are left.');
      return [];
    }
    delete w.override;
    const won = ctx.rng.chance(argueChance(draft, ctx.registries));
    const events: EngineEvent[] = [{ type: 'override_argue_roll', overrideId: ov.id, won }];
    events.push(...(won ? runOrder(draft, ctx, ov.order, base) : ov.alternative ? runOrder(draft, ctx, ov.alternative, base, false) : []));
    return [...events, done('argue')];
  }

  delete w.override;
  if (answer === 'comply') {
    const events = ov.alternative ? runOrder(draft, ctx, ov.alternative, base, false) : [];
    addTo(w, 'satisfaction', T.satisfaction.comply);
    events.push(...addDefiance(draft, ctx, -T.defiance.comply));
    delete w.compelled;
    return [...events, ...relationEvent(draft, ctx, 'warden_complied', 'minor', 'followed the warden\'s call'), done('comply')];
  }

  const events = runOrder(draft, ctx, ov.order, base);
  addTo(w, 'satisfaction', -round(T.override.defySatisfaction * ov.weight));
  const rose = addDefiance(draft, ctx, round(T.override.defyDefiance * ov.weight)); // the escalation runs at once, before any punishment
  events.push(...rose, ...relationEvent(draft, ctx, 'warden_defied', ov.weight >= T.override.majorAt ? 'major' : 'moderate', 'defied the warden\'s call'), done('defy'));
  if (!rose.some((e) => e.type === 'commander_terminated')) events.push(...afterDefy(draft, ctx, ov.weight));
  return events;
}

// ---------------------------------------------------------------------------------------------
// ARGUE in a scene (P13 §3)

/** Can the commander talk to her about it now? Not in a fight or a run (no scene can open there), nor once she has heard them out, nor while compelled. */
export function argueAvailable(state: CampaignState): boolean {
  const o = wardenOverrideOpen(state);
  const w = wardenOf(state);
  if (!o || !w || w.compelled || o.argued || state.combat || state.expedition || o.context === 'combat') return false;
  return state.scene === undefined;
}

/** The scene with her alone is open: the override remembers which scene is the argument. */
export function argueStarted(draft: CampaignState, sceneId: unknown): EngineEvent[] {
  const o = wardenOverrideOpen(draft);
  const w = wardenOf(draft);
  const scene = draft.scene;
  if (!o || !w) throw new Error(STALE);
  if (w.compelled) throw new Error('The commander is compelled: only COMPLY is open.');
  if (o.argued || o.context === 'combat') throw new Error('There is nothing to argue about.');
  if (!scene || scene.id !== sceneId || scene.participants.length !== 1 || scene.participants[0] !== w.unitId) throw new Error('The argument is a scene with the warden alone.');
  o.arguing = scene.id;
  return [{ type: 'override_argue_started', overrideId: o.id, sceneId: scene.id }];
}

const sentence = (text: string): string => (/[.!?]$/.test(text) ? text : `${text}.`);

/**
 * The scene reached a real compromise (the model reported `compromise_reached` with this override's id): the commander's order will run
 * when the scene ends, with no defiance and no change of satisfaction. Writes the fact `{Name} and the commander agreed: {text}` for the
 * units present. A stale id, a compromise already reached, a combat override, an empty text: dropped (nothing changes).
 */
export function resolveCompromise(draft: CampaignState, _ctx: EngineCtx, overrideId: unknown, text: unknown): EngineEvent[] {
  const o = wardenOverrideOpen(draft);
  const w = wardenOf(draft);
  if (!o || !w || o.id !== overrideId || o.context === 'combat' || o.compromise !== undefined || o.argued || w.compelled) return [];
  const agreed = typeof text === 'string' ? text.replace(/\s+/g, ' ').trim().slice(0, TUNING.bonds.rules.textMax).trim() : '';
  if (agreed === '') return [];
  o.compromise = agreed;
  const name = draft.squad.find((u) => u.id === w.unitId)?.displayName ?? w.unitId;
  addFact(draft, {
    about: [w.unitId], text: `${name} and the commander agreed: ${sentence(agreed)}`, tags: ['warden', 'compromise'], importance: 3, day: draft.day,
    ...(draft.scene ? { sceneId: draft.scene.id } : {}), knownBy: draft.scene ? [...draft.scene.participants] : [w.unitId],
  });
  return [{ type: 'override_compromise', overrideId: o.id }];
}

/** Runs `fn` and, if it throws, puts the draft back exactly as it was (the scene must end whatever the order does). */
function attempt(draft: CampaignState, fn: () => EngineEvent[]): EngineEvent[] | null {
  const backup = structuredClone(draft);
  try {
    return fn();
  } catch {
    for (const k of Object.keys(draft)) delete (draft as unknown as Record<string, unknown>)[k];
    Object.assign(draft, backup);
    return null;
  }
}

/**
 * The argument scene closed. With a compromise the commander's order runs now (once, not asked again); without one the override stays
 * open with only COMPLY and DEFY (`argued`). Nothing happens for any other scene. Never throws: a compromise whose order can no longer
 * run is dropped (`override_compromise_failed`).
 */
export function argueEnded(draft: CampaignState, ctx: EngineCtx, sceneId: string): EngineEvent[] {
  const w = wardenOf(draft);
  const o = w?.override;
  if (!w || !o || o.arguing !== sceneId) return [];
  if (!wardenOverrideOpen(draft)) {
    delete w.override;
    return [];
  }
  if (o.compromise === undefined) {
    delete o.arguing;
    o.argued = true;
    return [];
  }
  delete w.override;
  const events = attempt(draft, () => runOrder(draft, ctx, o.order, o.payload ?? {}));
  if (events === null) {
    const back = wardenOf(draft);
    if (back) delete back.override;
    return [{ type: 'override_compromise_failed', overrideId: o.id }];
  }
  return [...events, { type: 'override_answered', overrideId: o.id, answer: 'compromise' }];
}
