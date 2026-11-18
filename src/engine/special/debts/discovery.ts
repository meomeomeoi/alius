import type { EngineCtx, EngineEvent } from '../../dispatch';
import { openDemand } from '../../discipline/demands';
import { restrictionReason } from '../../discipline/restrictions';
import { isLiving } from '../../economy';
import { revealCrime } from '../../memory';
import { applyEventToUnit } from '../../relations/effects';
import { evaluateAutomatic } from '../../relations/graph';
import { addSecret } from '../../personal/secrets';
import { currentBeat } from '../../world/spine';
import type { DilemmaOption } from '../../dilemma/types';
import type { CampaignState } from '../../state/types';
import { TUNING } from '../../tuning';
import type { DebtsState } from '../state';

const T = () => TUNING.special.debts;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const fill = (text: string, vars: Record<string, string>): string => Object.entries(vars).reduce((t, [k, v]) => t.replaceAll(`{${k}}`, v), text);
const named = (state: CampaignState, id: string): boolean => state.squad.some((u) => u.id === id && u.kind === 'named' && isLiving(u));

/** The fixed template of a debts context (read by context, never by id). */
function templateOf(ctx: EngineCtx, context: 'debts_oversight' | 'debts_unit') {
  return [...ctx.registries.dilemmaTemplates.values()].find((t) => (t.contexts as string[]).includes(context) && t.fixed !== undefined);
}

/** Presents a fixed debts dilemma at once, or queues it when another waits. Returns its `dilemma_presented` event. */
function present(draft: CampaignState, ctx: EngineCtx, context: 'debts_oversight' | 'debts_unit', unitId?: string): EngineEvent[] {
  const template = templateOf(ctx, context);
  const fixed = template?.fixed as { title: string; setup: string; options: Array<Record<string, unknown>> } | undefined;
  if (!template || !fixed) return [];
  const subject = unitId === undefined ? undefined : draft.squad.find((u) => u.id === unitId);
  const vars = { name: subject?.displayName ?? 'She' };
  const d = (draft.dilemmas ??= { seq: 0 });
  d.seq += 1;
  d.open = {
    id: `dl${d.seq}`, templateId: String(template.id), scale: template.scale as 'major' | 'defining', context, day: draft.day, status: 'presented', attempts: 0,
    units: unitId === undefined ? [] : [unitId], beatId: currentBeat(draft, ctx.registries)?.id ?? 'open', source: 'fallback',
    title: fill(fixed.title, vars), setup: fill(fixed.setup, vars),
    options: (fixed.options as unknown as DilemmaOption[]).map((o) => ({ ...structuredClone(o), label: fill(o.label, vars), magnitudes: [] })),
    ...(unitId !== undefined ? { subjectId: unitId } : {}),
  };
  return [{ type: 'dilemma_presented', id: d.open.id, templateId: String(template.id), title: d.open.title, source: 'fallback' }];
}

const queueOf = (d: DebtsState) => (d.caseQueue ??= []);

/**
 * Oversight has traced the leak: the fixed `defining` dilemma (double agent / confess / flee). It waits in `debts.caseQueue` while
 * another dilemma is open (and is never queued twice) and opens at a later day end.
 */
export function openOversightCase(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d || d.ended !== undefined) return [];
  if (draft.dilemmas?.open) {
    if (!queueOf(d).some((c) => c.kind === 'oversight')) queueOf(d).push({ kind: 'oversight' });
    return [];
  }
  return present(draft, ctx, 'debts_oversight');
}

/** A soldier found out: the fixed `major` dilemma about her (report / protect / demand). Queued like the oversight case; a subject who is gone opens nothing. */
export function openUnitCase(draft: CampaignState, ctx: EngineCtx, unitId: string): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d || !named(draft, unitId)) return [];
  if (draft.dilemmas?.open) {
    queueOf(d).push({ kind: 'unit', unitId });
    return [];
  }
  return present(draft, ctx, 'debts_unit', unitId);
}

/** Day end: the first queued case opens when nothing else waits; a case whose subject is gone is dropped. */
export function openQueuedCases(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d?.caseQueue || d.caseQueue.length === 0) return [];
  d.caseQueue = d.caseQueue.filter((c) => c.kind === 'oversight' || named(draft, c.unitId));
  if (d.caseQueue.length === 0 || draft.dilemmas?.open) {
    if (d.caseQueue.length === 0) delete d.caseQueue;
    return [];
  }
  const [first, ...rest] = d.caseQueue;
  if (rest.length > 0) d.caseQueue = rest;
  else delete d.caseQueue;
  return first.kind === 'oversight' ? openOversightCase(draft, ctx) : openUnitCase(draft, ctx, first.unitId);
}

/** The day step's check: oversight's suspicion at 100 opens its case, once (not while one is open or queued). */
export function checkOversight(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d || d.ended !== undefined || d.oversightSuspicion < 100) return [];
  if (draft.dilemmas?.open?.context === 'debts_oversight' || d.caseQueue?.some((c) => c.kind === 'oversight')) return [];
  return openOversightCase(draft, ctx);
}

/**
 * On a visit night (the visit answered or lapsed) each watcher draws once at `0.15 × (1 + 0.5 × nightAware)`. A watcher is a named living
 * soldier who is not held in the brig or on duty and either has a `nightAware` defect or stress 60 or more. The first hit finds out:
 * `knows_debts`, a moderate `debts_exposed`, her case. At most one per visit; a unit who already knows is not drawn for.
 */
export function rollUnitDiscovery(draft: CampaignState, ctx: EngineCtx): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d) return [];
  const reg = ctx.registries;
  for (const u of draft.squad) {
    if (u.kind !== 'named' || !isLiving(u) || draft.relations[u.id]?.flags.includes('knows_debts') || restrictionReason(draft, u.id, 'scene') !== null) continue;
    const aware = u.defects.some((x) => reg.defects.get(x.id)?.nightAware === true);
    if (!aware && u.stress < T().watcherStress) continue;
    if (!ctx.rng.chance(T().watcherChance * (1 + 0.5 * (aware ? 1 : 0)))) continue;
    draft.relations[u.id].flags.push('knows_debts');
    d.discoveredBy = u.id;
    const events: EngineEvent[] = [{ type: 'debts_discovered', unitId: u.id }];
    events.push(...applyEventToUnit(draft, reg, u.id, { type: 'debts_exposed', actor: 'commander', targets: [u.id], severity: 'moderate', evidence: 'the handler at the gate', confidence: 1 }));
    events.push(...evaluateAutomatic(draft, reg, u.id));
    events.push(...openUnitCase(draft, ctx, u.id));
    return events;
  }
  return [];
}

/** Opens (or reopens) the story thread of the defector arc; its beats are the author's. */
function openArc(draft: CampaignState): EngineEvent[] {
  const t = draft.world.threads.find((x) => x.id === 'defector_arc');
  if (t) {
    if (t.status === 'open') return [];
    t.status = 'open';
  } else {
    draft.world.threads.push({ id: 'defector_arc', title: 'AUTHOR TO WRITE: The defector arc', status: 'open', flags: [], relatedUnits: [], relatedRegions: [], createdDay: draft.day });
  }
  return [{ type: 'thread_changed', threadId: 'defector_arc', status: 'open' }];
}

const everyone = (draft: CampaignState): string[] => draft.squad.filter((u) => u.kind === 'named' && isLiving(u)).map((u) => u.id);

/**
 * What a debts dilemma's answer does beyond its authored effects (the flags, standing and Leash cost are in the template). By the
 * dilemma's context and the option's id: `double_agent` resets both clocks to 30, `confess` tells everyone the crime, `flee` ends the
 * arrangement and sets the own corporation against the commander; each opens the `defector_arc` thread. `report` adds 40 to
 * oversight, `protect_commander` keeps a squad secret of source `debts`, `demand` opens an owed demand. Anything else: nothing.
 */
export function debtsChoice(draft: CampaignState, ctx: EngineCtx, context: string, optionId: string | undefined, subjectId: string | undefined): EngineEvent[] {
  const d = draft.special?.debts;
  if (!d || optionId === undefined) return [];
  const reg = ctx.registries;
  if (context === 'debts_oversight') {
    if (optionId !== 'double_agent' && optionId !== 'confess' && optionId !== 'flee') return [];
    const events: EngineEvent[] = [...openArc(draft)];
    if (optionId === 'double_agent') {
      d.oversightSuspicion = 30;
      d.handlerSuspicion = 30;
    } else if (optionId === 'confess') {
      events.push(...revealCrime(draft, reg, everyone(draft)));
      d.ended = 'confessed';
    } else {
      const own = draft.commander.corporationId;
      if (own !== null) draft.world.factions[own] = Math.min(draft.world.factions[own] ?? 0, T().hostileAt);
      const rival = d.corporationId;
      draft.world.factions[rival] = clamp((draft.world.factions[rival] ?? 0) + 20, -100, 100);
      d.ended = 'fled';
    }
    events.push({ type: 'defector_arc', outcome: optionId });
    return events;
  }
  if (context !== 'debts_unit' || subjectId === undefined) return [];
  if (optionId === 'report') d.oversightSuspicion = clamp(d.oversightSuspicion + 40, 0, 100);
  else if (optionId === 'protect_commander') {
    const kind = [...reg.secretKinds.values()].find((k) => k.source === 'debts');
    const name = draft.squad.find((u) => u.id === subjectId)?.displayName ?? '';
    return kind ? addSecret(draft, reg, { kindId: String(kind.id), knownBy: [subjectId], subjectId, vars: { name } }) : [];
  } else if (optionId === 'demand') return openDemand(draft, ctx, subjectId, { owed: true })?.events ?? [];
  return [];
}
