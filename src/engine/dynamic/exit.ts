/**
 * Leaving a dynamic (P15, plan R15, R17, spec §9): saying "it's over" is always possible, and what it costs grows with what she held. The cost
 * is a relation event (`dynamic_exit`) whose severity reads her frame, her domains and the vow (`exitSeverity`); a vow is a break. The routes:
 * `abrupt` now; `negotiated` opens a scene and waits for a compromise (`compromise_reached { exitId }`), which makes the exit clean (one step
 * lighter, and a mild aftermath); `transfer` runs the domain conflict with another holder; `force` needs a means already done on her today (a punishment, the Leash
 * or, later, an oversight request: the card runs it through its own path, the vote, the warden's co-sign and the warnings) and costs two steps more. Every domain is dropped except the one that grants the command, which she keeps
 * as a struggle (`commandKept`); the dynamic starts again from `equal` with hold 0 and her tracks, and the romance falls a rung.
 * Draws once, for the aftermath that follows (`startAftermathOnExit`), unless the command forces `command_kept`.
 */
import type { Registries } from '../../content/types';
import { frameRank } from '../blocking/state';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { isLiving } from '../economy';
import { leashLog } from '../leash/weekly';
import { applyEventToUnit } from '../relations/effects';
import { evaluateAutomatic, romanceStepDown } from '../relations/graph';
import { SEVERITIES } from '../relations/vocab';
import type { CampaignState, Severity } from '../state/types';
import { TUNING } from '../tuning';
import { startAftermathOnExit } from './aftermath';
import { domainEntry, dropVoidOverride, standing } from './capabilities';
import { loseDomain, settleDomainConflict } from './domains';
import { dynamicOn } from './gate';
import { dynamicOf } from './state';
import { EXIT_ROUTES, type ExitRoute } from './types';

type Ctx = Pick<EngineCtx, 'registries'> & Partial<Pick<EngineCtx, 'rng'>>;

/** What a forced exit needs done first, through its own path (the exit never runs it). The oversight request is chunk (i)'s: here it is accepted and costs the same. */
export const EXIT_MEANS = ['discipline', 'leash', 'transfer_request'] as const;
export type ExitMeans = (typeof EXIT_MEANS)[number];

export interface ExitOpts {
  /** `transfer`: the holder who takes the commander on. */
  toUnitId?: string;
  /** `force`: what was done first. */
  means?: ExitMeans;
  /** A compromise in the negotiation: the exit is clean. Only the compromise sets it. */
  clean?: boolean;
}

/**
 * Whether the means of a forced exit was done on her today, read from state (R15, review I1): a punishment is an application of hers dated today
 * (`discipline.applications`), the Leash a `done` entry of hers in the log. The oversight request is accepted as today (chunk (i) builds it).
 * The exit never runs a means itself: that would go around the squad's vote, the warden's co-sign and the warnings.
 */
export function meansDone(state: CampaignState, unitId: string, means: ExitMeans): boolean {
  if (means === 'discipline') return (state.discipline?.applications ?? []).some((a) => a.unitId === unitId && a.day === state.day);
  if (means === 'leash') return leashLog(state).some((e) => e.unitId === unitId && e.day === state.day && e.outcome === 'done');
  return true;
}

const DO_FIRST: Record<ExitMeans, string> = {
  discipline: 'Do it first: impose a punishment on her today, then force the exit.',
  leash: 'Do it first: file the Leash on her today and have it done, then force the exit.',
  transfer_request: 'Do it first: file the oversight request.',
};

const named = (state: CampaignState, id: string): string => state.squad.find((u) => u.id === id)?.displayName ?? id;
const clampSteps = (n: number): number => Math.min(SEVERITIES.length - 1, Math.max(0, n));

/** Whether she holds a domain that grants the command (the one `command_kept` keeps), read by capability. */
const keepsCommand = (state: CampaignState, reg: Registries, domainId: string): boolean => domainEntry(reg, domainId)?.grants.includes('countermand') === true;

/**
 * The severity of the relation event of leaving her (R15), from her dynamic as it stands: `minor` at `play` while her hold is under
 * `freeHold`; otherwise one step per frame above `play` and per two domains (at least one at `play` once the hold is `freeHold` or more); a vow
 * is a break (`extreme`). A clean exit is a step lighter, a forced one two steps heavier. `minor` for a unit with no dynamic. Pure.
 */
export function exitSeverity(state: CampaignState, _reg: Registries, unitId: string, route: ExitRoute, clean = false): Severity {
  const dyn = dynamicOf(state, unitId);
  const T = TUNING.dynamic.exit;
  if (dyn === undefined) return 'minor';
  const domains = dyn.domains.filter((d) => standing(d, state.day)).length;
  let steps = Math.max(0, frameRank(dyn.frame) - frameRank('play')) + Math.floor(domains / T.domainsPerStep);
  if (steps === 0 && dyn.hold >= T.freeHold) steps = 1;
  if (dyn.sworn !== undefined) steps = SEVERITIES.length - 1;
  if (route === 'force') steps += T.forceSteps;
  if (clean) steps -= T.cleanSteps;
  return SEVERITIES[clampSteps(steps)];
}

/** The cost in the word the card shows (no number): `nearly free`, `light`, `costly`, `heavy`, and for a vow `a break`. */
export function exitCostWord(state: CampaignState, reg: Registries, unitId: string, route: ExitRoute, clean = false): string {
  const dyn = dynamicOf(state, unitId);
  if (dyn?.sworn !== undefined) return 'a break';
  const severity = exitSeverity(state, reg, unitId, route, clean);
  if (severity === 'minor') return route !== 'force' && dyn?.frame === 'play' && dyn.hold < TUNING.dynamic.exit.freeHold ? 'nearly free' : 'light';
  return severity === 'moderate' ? 'costly' : 'heavy';
}

/** What the pick of the aftermath reads of how she was left. */
export interface AftermathRequest { unitId: string; route: ExitRoute; clean: boolean; force: boolean; commandKept: boolean }

/** Her open negotiated exit, if any. */
const pendingExit = (state: CampaignState, unitId: string) => state.dynamic?.open.exits?.find((e) => e.unitId === unitId);

/**
 * The commander leaves the dynamic she holds with her (`dynamic/exit`). Allowed whenever she is at `play` or beyond; throws, changing nothing,
 * for a unit with no such dynamic, a route that needs something it was not given (a `transfer` without another holder at `play` or beyond, a
 * `force` without its means, a punishment that cannot be imposed) and for a Leash with no authorization left.
 *
 * `negotiated` without a compromise only opens the exit (`dx<n>`, one per unit) and returns nothing: it ends when the scene reaches one
 * (`opts.clean`) or when the commander ends it abruptly. Every other call makes the exit: the means (if forced) and the domain conflict (a
 * transfer) first, the relation event with its severity, every domain dropped but the command, the dynamic reset to `equal` / hold 0 with her
 * tracks, `formerHolder`, the romance a rung down, then one `dynamic_exit` event.
 */
export function exitDynamic(draft: CampaignState, ctx: Ctx, unitId: string, route: ExitRoute, opts: ExitOpts = {}): EngineEvent[] {
  const reg = ctx.registries;
  if (!(EXIT_ROUTES as readonly unknown[]).includes(route)) throw new Error(`An exit is ${EXIT_ROUTES.join(', ')}.`);
  const unit = draft.squad.find((u) => u.id === unitId);
  const dyn = dynamicOf(draft, unitId);
  if (!dynamicOn(draft, reg) || draft.dynamic === undefined) throw new Error('The dynamic is off.');
  if (unit === undefined || unit.kind !== 'named' || !isLiving(unit) || dyn === undefined || frameRank(dyn.frame) < frameRank('play')) {
    throw new Error(`${named(draft, unitId)} holds nothing of the commander to leave.`);
  }
  const x = draft.dynamic;
  // the inputs of the route, before anything changes
  if (route === 'transfer') {
    const to = opts.toUnitId === undefined ? undefined : draft.squad.find((u) => u.id === opts.toUnitId);
    const toDyn = to === undefined ? undefined : dynamicOf(draft, to.id);
    if (to === undefined || to.id === unitId || to.kind !== 'named' || !isLiving(to) || toDyn === undefined || frameRank(toDyn.frame) < frameRank('play')) {
      throw new Error('A transfer goes to another holder, at play or beyond.');
    }
  }
  if (route === 'force') {
    if (opts.means === undefined || !EXIT_MEANS.includes(opts.means)) throw new Error(`A forced exit names its means: ${EXIT_MEANS.join(', ')}.`);
    if (!meansDone(draft, unitId, opts.means)) throw new Error(DO_FIRST[opts.means]);
  }
  if (route === 'negotiated' && opts.clean !== true) {
    if (pendingExit(draft, unitId) === undefined) (x.open.exits ??= []).push({ id: `dx${x.seq++}`, unitId, day: draft.day });
    return [];
  }

  const severity = exitSeverity(draft, reg, unitId, route, opts.clean === true);
  const sworn = dyn.sworn !== undefined;
  const from = dyn.frame;
  const events: EngineEvent[] = [];

  // a transfer: the other holder claims what she holds, domain by domain; the winner of each keeps it
  if (route === 'transfer') for (const d of [...dyn.domains]) events.push(...settleDomainConflict(draft, ctx, opts.toUnitId!, unitId, d.id));

  // every domain is dropped but the command, which she keeps as a struggle: except when the Leash forced it, which wins the command back (R15a)
  const byLeash = route === 'force' && opts.means === 'leash';
  const commandKept = !byLeash && dyn.domains.some((d) => standing(d, draft.day) && keepsCommand(draft, reg, d.id));
  for (const d of [...dyn.domains]) {
    if (commandKept && keepsCommand(draft, reg, d.id)) {
      delete d.partialUntil;
      continue;
    }
    events.push(loseDomain(draft, unitId, d.id, byLeash && keepsCommand(draft, reg, d.id) ? 'force' : 'exit'));
  }
  dropVoidOverride(draft, reg, unitId);

  // the dynamic starts again from equal; her tracks and her reading of the commander are kept
  dyn.frame = 'equal';
  dyn.hold = 0;
  dyn.milestones = [];
  dyn.refusals = [];
  dyn.contest = [];
  delete dyn.sworn;
  delete dyn.leashBlock;
  delete dyn.probes.pending;
  dyn.formerHolder = { endedDay: draft.day, frame: from, sworn };
  x.open.claims = x.open.claims.filter((c) => c.unitId !== unitId);
  x.open.milestones = x.open.milestones.filter((m) => m.unitId !== unitId);
  x.open.exits = (x.open.exits ?? []).filter((e) => e.unitId !== unitId);

  // the cost lands on her, and the romance falls a rung (it never leaves romance)
  events.push(...applyEventToUnit(draft, reg, unitId, {
    type: 'dynamic_exit', actor: 'commander', targets: [unitId], severity, evidence: 'the commander left what she held', confidence: 1,
  }), ...evaluateAutomatic(draft, reg, unitId), ...romanceStepDown(draft, reg, unitId));

  const request: AftermathRequest = { unitId, route, clean: opts.clean === true, force: route === 'force', commandKept };
  events.push({
    type: 'dynamic_exit', unitId, route, severity, sworn, clean: request.clean, force: request.force, commandKept,
    ...(route === 'transfer' ? { toUnitId: opts.toUnitId } : {}), ...(route === 'force' ? { means: opts.means } : {}), frame: from,
  });
  events.push(...startAftermathOnExit(draft, ctx as EngineCtx, request)); // how she took it: one draw of the rng (none when the command forces it)
  return events;
}

/**
 * A compromise in the scene over her open exit (`compromise_reached { exitId }`): the exit is made, clean. An exit whose dynamic has fallen
 * below `play` since (a cooling) is dropped instead and nothing happens. Returns the events of the exit.
 */
export function compromiseExit(draft: CampaignState, ctx: Ctx, unitId: string): EngineEvent[] {
  const x = draft.dynamic;
  if (x === undefined || pendingExit(draft, unitId) === undefined) return [];
  const dyn = dynamicOf(draft, unitId);
  if (dyn === undefined || frameRank(dyn.frame) < frameRank('play')) {
    x.open.exits = (x.open.exits ?? []).filter((e) => e.unitId !== unitId);
    return [];
  }
  return exitDynamic(draft, ctx, unitId, 'negotiated', { clean: true });
}
