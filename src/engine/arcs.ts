import type { Registries } from '../content/types';
import type { ActivityHook } from './activities';
import type { EngineCtx, EngineEvent } from './dispatch';
import { facilityEffect, isLiving } from './economy';
import { compel } from './leash/use';
import { loyaltyRecord } from './loyalty/state';
import { addFact, nextId } from './memory';
import { enqueueNight } from './night';
import { applyEventToUnit } from './relations/effects';
import type { CampaignState, DefectInstance, Unit } from './state/types';
import { TUNING } from './tuning';

export const ARC_PATHS = ['manage', 'embrace', 'cure'] as const;
export type ArcPath = (typeof ARC_PATHS)[number];
type Cost = Partial<Record<'credits' | 'supplies' | 'plyx', number>>;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** How far her values agree with a path: the clamped sum of values × direction over the path's axes, divided by 3. */
export function arcAlignment(unit: Pick<Unit, 'values'>, path: ArcPath): number {
  const sum = TUNING.arc.axes[path].reduce((n, [axis, direction]) => n + unit.values[axis] * direction, 0);
  return clamp(sum / 3, -1, 1);
}

/** The path she would choose among `paths`: the best alignment, ties to manage, then embrace, then cure. */
export function wantedPath(unit: Pick<Unit, 'values'>, paths: ArcPath[]): ArcPath {
  const order = [...paths].sort((a, b) => ARC_PATHS.indexOf(a) - ARC_PATHS.indexOf(b));
  return order.reduce((best, p) => (arcAlignment(unit, p) > arcAlignment(unit, best) ? p : best), order[0]);
}

export interface ArcPathInfo {
  path: ArcPath;
  available: boolean;
  reason: string | null;
  wanted: boolean;
  refuses: boolean;
  cost: Cost;
  text: string;
}

const crimeHas = (reg: Registries, crimeId: string | null, type: string): boolean => {
  const crime = crimeId === null ? undefined : reg.crimes.get(crimeId);
  return [crime?.perk, crime?.flaw].some((part) => {
    const list = (part as { effects?: unknown } | undefined)?.effects;
    return Array.isArray(list) && list.some((e) => isObj(e) && e.type === type);
  });
};

/** The medbay's stage cap, one higher with the crime perk `defect_arc_early`. */
const stageCap = (state: CampaignState, reg: Registries): number =>
  facilityEffect(state, reg, 'medbay', 'arcStageCap') + (crimeHas(reg, state.commander.crimeId, 'defect_arc_early') ? 1 : 0);

/** The stages her relationship state allows: what it lists, and the mildest path whenever it lists a deeper one. */
function allowedStages(state: CampaignState, reg: Registries, unitId: string): ArcPath[] {
  const listed = (reg.relationshipStates.get(state.relations[unitId]?.stateId ?? '')?.unlocks as { defectArcStages?: string[] } | undefined)?.defectArcStages ?? [];
  const out = new Set(listed.filter((p): p is ArcPath => (ARC_PATHS as readonly string[]).includes(p)));
  if (out.has('cure') || out.has('embrace')) out.add('manage');
  return [...out];
}

const afford = (state: CampaignState, cost: Cost): string | null => {
  for (const k of ['credits', 'supplies', 'plyx'] as const) if ((cost[k] ?? 0) > state.resources[k]) return `Not enough ${k}.`;
  return null;
};

/** The three paths of one defect with what is on offer right now, what she wants and what she refuses. Never throws. */
export function arcPaths(state: CampaignState, reg: Registries, unitId: string, defectId: string): ArcPathInfo[] {
  const unit = state.squad.find((u) => u.id === unitId);
  const inst = unit?.defects.find((d) => d.id === defectId);
  const def = reg.defects.get(defectId);
  const rel = state.relations[unitId];
  const texts = (def?.arc as Partial<Record<ArcPath, string>> | undefined) ?? {};
  const base = (path: ArcPath) => ({ path, cost: { ...TUNING.arc.cost[path] } as Cost, text: texts[path] ?? '' });

  let whole: string | null = null;
  if (!unit || !inst || !def || !rel) whole = 'This defect is not on her record.';
  else if (unit.kind !== 'named' || inst.lite === true) whole = 'Only a named unit has a defect arc.';
  else if (inst.arc !== undefined) whole = 'She is already on a path.';
  else if (state.day < TUNING.arc.minDay) whole = `Too early: wait until day ${TUNING.arc.minDay}.`;
  else {
    const flag = def.arcFlag as string | undefined;
    if (flag !== undefined && !rel.flags.includes(flag) && !state.world.flags.includes(flag) && !state.commander.flags.includes(flag)) whole = 'She is not ready to talk about it.';
  }
  if (whole !== null) return ARC_PATHS.map((p) => ({ ...base(p), available: false, reason: whole, wanted: false, refuses: false }));

  const stages = allowedStages(state, reg, unitId);
  const cap = stageCap(state, reg);
  const structural = ARC_PATHS.map((path) => {
    let reason: string | null = null;
    if (!stages.includes(path)) reason = 'Needs a closer bond.';
    else if (TUNING.arc.stage[path] > cap) reason = `The medbay is too basic for this (stage ${TUNING.arc.stage[path]}).`;
    return { path, reason };
  });
  const offered = structural.filter((s) => s.reason === null).map((s) => s.path);
  const wanted = offered.length > 0 ? wantedPath(unit!, offered) : undefined;
  return structural.map(({ path, reason }) => {
    const cost = base(path).cost;
    const why = reason ?? afford(state, cost);
    return {
      ...base(path), available: why === null, reason: why, wanted: path === wanted,
      refuses: reason === null && path !== wanted && arcAlignment(unit!, path) < 0,
    };
  });
}

/**
 * Takes a path. She must be on offer, affordable and not yet on a path. A refused path needs `compel` (a Leash use in
 * context `arc`; a burst that fails decides nothing). The cost is paid, the arc starts, and she reacts to the decision
 * by her values: aligned/major when it is the path she wanted, violated/major otherwise (extreme, and a mutiny trigger,
 * when a Cure was forced on her).
 */
export function decideArc(
  draft: CampaignState, ctx: EngineCtx, p: { unitId: string; defectId: string; path: ArcPath; compel?: boolean },
): EngineEvent[] {
  const reg = ctx.registries;
  if (!(ARC_PATHS as readonly string[]).includes(p.path)) throw new Error(`Unknown path "${String(p.path)}".`);
  const unit = draft.squad.find((u) => u.id === p.unitId);
  if (!unit || !isLiving(unit)) throw new Error(`Unknown unit "${p.unitId}".`);
  const info = arcPaths(draft, reg, p.unitId, p.defectId).find((x) => x.path === p.path)!;
  if (!info.available) throw new Error(info.reason ?? 'That path is not available.');
  const events: EngineEvent[] = [];
  let forced = false;
  if (info.refuses) {
    if (p.compel !== true) throw new Error(`${unit.displayName} refuses this path: only the Leash can force it.`);
    const used = compel(draft, ctx, { unitId: p.unitId, context: 'arc' });
    events.push(...used.events);
    if (!used.forced) return events; // the burst failed: it cost, and nothing was decided
    forced = true;
  }
  for (const k of ['credits', 'supplies', 'plyx'] as const) draft.resources[k] -= info.cost[k] ?? 0;
  const inst = unit.defects.find((d) => d.id === p.defectId)!;
  inst.arc = p.path;
  inst.arcSteps = { done: 0, needed: TUNING.arc.steps[p.path] };
  const severity = forced && p.path === 'cure' ? 'extreme' : 'major';
  events.push(...applyEventToUnit(draft, reg, p.unitId, {
    type: info.wanted ? 'decision_aligned' : 'decision_violated', actor: 'commander', targets: [p.unitId], severity,
    valueAxes: TUNING.arc.axes[p.path].map(([axis, direction]) => ({ axis, direction })),
    evidence: `${p.path} for ${p.defectId}`, confidence: 1,
  }));
  if (forced && p.path === 'cure') loyaltyRecord(draft, p.unitId).trigger = { kind: 'forced_cure', day: draft.day };
  events.push({ type: 'arc_decided', unitId: p.unitId, defectId: p.defectId, path: p.path, forced });
  return events;
}

/** Medbay with her as the companion: one step a day on her first unfinished arc; the last step finishes it (a Cure removes the defect). */
export const arcActivityHook: ActivityHook = (draft, ctx, done) => {
  if (done.activityId !== 'medbay' || done.companionId === undefined) return [];
  const unit = draft.squad.find((u) => u.id === done.companionId);
  if (!unit || !isLiving(unit)) return [];
  const inst = unit.defects.find((d) => d.arc !== undefined && d.arcSteps !== undefined && d.arcSteps.done < d.arcSteps.needed);
  if (!inst || inst.arcSteps!.lastDay === draft.day) return [];
  const steps = inst.arcSteps!;
  steps.done += 1;
  steps.lastDay = draft.day;
  if (steps.done < steps.needed) return [{ type: 'arc_step', unitId: unit.id, defectId: inst.id, done: steps.done, needed: steps.needed }];
  const events: EngineEvent[] = [{ type: 'arc_completed', unitId: unit.id, defectId: inst.id, path: inst.arc }];
  if (inst.arc === 'cure') {
    unit.defects = unit.defects.filter((d) => d !== inst);
    const name = String(ctx.registries.defects.get(inst.id)?.name ?? inst.id);
    addFact(draft, {
      about: [unit.id], text: `${unit.displayName}'s ${name} was cured: it is gone, and so is whatever it gave her.`,
      tags: ['defect', 'cure'], importance: 4, day: draft.day, knownBy: ['*'],
    });
  }
  return events;
};

/** How a defect's effects are scaled in combat: a managed one halves its downside while maintained, an embraced one grows both. */
export function arcScale(d: DefectInstance, day: number): { upside: number; downside: number } {
  const complete = d.arc !== undefined && d.arcSteps !== undefined && d.arcSteps.done >= d.arcSteps.needed;
  if (!complete) return { upside: 1, downside: 1 };
  if (d.arc === 'embrace') return { upside: TUNING.arc.embraceMult, downside: TUNING.arc.embraceMult };
  if (d.arc === 'manage' && d.upkeepDay !== undefined && day - d.upkeepDay <= TUNING.arc.manageUpkeepDays) {
    return { upside: 1, downside: TUNING.arc.manageDownsideMult };
  }
  return { upside: 1, downside: 1 };
}

/** Day-end: a named unit with a path on offer raises it once, as a night knock. */
export function arcDayStep(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const events: EngineEvent[] = [];
  for (const u of draft.squad) {
    const rel = draft.relations[u.id];
    if (u.kind !== 'named' || !isLiving(u) || !rel || rel.flags.includes('arc_raised')) continue;
    const found = u.defects.find((d) => arcPaths(draft, ctx.registries, u.id, d.id).some((p) => p.reason === null || p.reason.startsWith('Not enough')));
    if (!found) continue;
    rel.flags.push('arc_raised');
    enqueueNight(draft, {
      id: nextId(draft, 'n'), unitId: u.id, kind: 'arc_talk', priority: TUNING.arc.nightPriority,
      framing: `${u.displayName} wants to talk about what is wrong with her, and what she would do about it.`,
      ignore: { event: 'dismissed', severity: 'moderate' }, expiresDay: draft.day + TUNING.disloyalty.night.expiresInDays,
    });
    events.push({ type: 'arc_unlocked', unitId: u.id, defectId: found.id });
  }
  return events;
}
