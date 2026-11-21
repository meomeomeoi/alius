/**
 * Going around the Leash block (P15, plan R16, spec §10): three ways to file a request the holder would hold, each a defiance toward her
 * with one discovery draw. A bypass that goes through files the request normally (the P6 flow, with the warden's co-sign as ever) with no
 * block for that one request; a discovered one costs her `overrode_her` (major) and makes her remember it. Never touches the P9c intercept.
 *  - `comms`: the terminal in the comms room: an activity (`scout_net`, focus `leash_terminal`) that costs the slot; refused with a scene open;
 *  - `reset`: a workshop task with a technically able ally (a role or a defect with `tech`): the safest;
 *  - `ally`: another soldier files it through her own channel: the likeliest to be found, and the ally pays Trust for it.
 * An ally is a named soldier in service whose Trust in the commander is at least `bypass.allyMinTrust`. Discovery chances and costs are hidden.
 */
import type { Registries } from '../../content/types';
import { checkActivity, runActivity } from '../activities';
import type { EngineCtx, EngineEvent } from '../dispatch';
import { runHandler } from '../dispatch';
import { isLiving } from '../economy';
import { hitHer } from '../personal/events';
import { applyRelationDelta } from '../relationGain';
import type { CampaignState, LeashKind, Unit } from '../state/types';
import { TUNING } from '../tuning';
import { isTech } from '../warden/intrigue';
import { checkLeash } from '../leash/use';
import { BYPASS_ROUTES, type BypassRoute } from './types';
import { addCompromat } from './compromat';
import { leashBlockOf } from './leashBlock';
import { regardFall, resetServed } from './regard';

export { BYPASS_ROUTES };
export type { BypassRoute };

/** The activity the comms route runs (the COMMS room's, by its focus), found by the focus it carries rather than by a name. */
function terminalActivity(reg: Registries): { activityId: string; focus: string } | null {
  for (const a of reg.activities.values()) {
    const f = (a.focus as Array<{ id: string; requires?: { capabilityHeldBy?: string } }> | undefined)?.find((x) => x.requires?.capabilityHeldBy === 'leash_block');
    if (f !== undefined) return { activityId: String(a.id), focus: f.id };
  }
  return null;
}

/** The soldiers who could file it for the commander: named, in service, not the holder, trusting enough. `tech` keeps those who can work on the device. */
export function bypassAllies(state: CampaignState, reg: Registries, opts: { tech?: boolean } = {}): string[] {
  const holder = leashBlockOf(state, reg);
  return state.squad
    .filter((u) => u.kind === 'named' && isLiving(u) && u.id !== holder && (state.relations[u.id]?.trust ?? 0) >= TUNING.dynamic.bypass.allyMinTrust && (opts.tech !== true || isTech(state, reg, u.id)))
    .map((u) => u.id);
}

/**
 * What the Leash form shows of the routes while a block stands: for each, the reason it cannot be taken now (a fixed phrase, no number) and, for the two
 * that go through a soldier, who could. Pure; nothing is hidden here that the form may not say.
 */
export function bypassRoutes(state: CampaignState, reg: Registries): { comms: { disabled?: string }; reset: { disabled?: string; allies: string[] }; ally: { disabled?: string; allies: string[] } } {
  const terminal = terminalActivity(reg);
  const closed = state.scene !== undefined ? 'LEAVE THE SCENE FIRST' : terminal === null ? 'NO TERMINAL' : checkActivity(state, reg, { activityId: terminal.activityId, focus: terminal.focus });
  const reset = bypassAllies(state, reg, { tech: true });
  const ally = bypassAllies(state, reg);
  return {
    comms: closed ? { disabled: closed.toUpperCase() } : {},
    reset: { allies: reset, ...(reset.length === 0 ? { disabled: 'NO ONE WHO KNOWS THE DEVICE' } : {}) },
    ally: { allies: ally, ...(ally.length === 0 ? { disabled: 'NO ONE TRUSTS THE COMMANDER ENOUGH' } : {}) },
  };
}

/** The chance a route is found out (hidden; one draw). The ally route is multiplied by the holder's insight. */
export function bypassChance(state: CampaignState, reg: Registries, route: BypassRoute, allyId?: string): number {
  const B = TUNING.dynamic.bypass;
  if (route === 'comms') return B.comms;
  if (route === 'reset') return allyId !== undefined && isTech(state, reg, allyId) ? B.resetTech : B.reset;
  const holder = state.squad.find((u) => u.id === leashBlockOf(state, reg));
  return Math.min(0.95, B.ally * TUNING.squadKnowledge.insight[holder?.insight ?? 'mid']);
}

/** The request the bypass files: the same action the PDA would dispatch (a combat compel has no such path: there is no time at a terminal in a fight). */
const ACTION_OF: Record<LeashKind, string> = { compel: 'leash/compel', suppress: 'leash/suppress', terminate: 'leash/terminate' };

/**
 * Goes around the block for one request (`kind` on `unitId`). Throws, changing nothing, when no block stands, the request could not be filed at all,
 * or the route lacks what it needs (a scene open for `comms`; an ally for `reset` and `ally`, a technical one for `reset`). One draw for the
 * discovery. Emits `leash_bypassed { unitId: holderId, route, discovered, targetId, kind, allyId? }` (the holder is the unit it concerns), then the request's own events.
 */
export function bypassLeash(draft: CampaignState, ctx: EngineCtx, p: { route: BypassRoute; allyId?: string; kind: LeashKind; unitId: string }): EngineEvent[] {
  const reg = ctx.registries;
  const holderId = leashBlockOf(draft, reg);
  if (holderId === null) throw new Error('Nothing holds the Leash requests: file it as usual.');
  const holder = draft.squad.find((u) => u.id === holderId) as Unit;
  const why = checkLeash(draft, reg, p.kind, p.unitId);
  if (why) throw new Error(why);
  const terminal = terminalActivity(reg);
  if (p.route === 'comms') {
    if (draft.scene !== undefined) throw new Error('The terminal is in the comms room: leave the scene first.');
    const closed = terminal === null ? 'There is no comms terminal.' : checkActivity(draft, reg, { activityId: terminal.activityId, focus: terminal.focus });
    if (closed) throw new Error(closed);
  } else {
    const ally = p.allyId === undefined ? undefined : draft.squad.find((u) => u.id === p.allyId);
    if (ally === undefined) throw new Error(p.route === 'reset' ? 'The reset needs an ally who knows the device.' : 'Pick the soldier who will file it.');
    if (!bypassAllies(draft, reg, { tech: p.route === 'reset' }).includes(ally.id)) {
      throw new Error(p.route === 'reset' ? `${ally.displayName} cannot work on the device.` : `${ally.displayName} will not file it for the commander.`);
    }
  }
  const discovered = ctx.rng.chance(bypassChance(draft, reg, p.route, p.allyId));
  const events: EngineEvent[] = [{ type: 'leash_bypassed', unitId: holderId, route: p.route, discovered, targetId: p.unitId, kind: p.kind, ...(p.allyId !== undefined ? { allyId: p.allyId } : {}) }];
  if (discovered) {
    events.push(...hitHer(draft, reg, holderId, 'overrode_her', 'major', `went around ${holder.displayName}'s hold on the Leash`, { amplified: true }));
    if (p.route === 'ally' && p.allyId !== undefined) {
      const applied = applyRelationDelta(draft, p.allyId, 'trust', TUNING.dynamic.bypass.allyTrust, 'leash_bypass');
      if (applied !== 0) events.push({ type: 'relation_changed', unitId: p.allyId, axis: 'trust', delta: applied, applied });
    }
    addCompromat(draft, holderId, `AUTHOR TO WRITE: ${holder.displayName} caught the commander going around her hold on the Leash requests.`, p.allyId !== undefined ? [p.allyId] : []);
    events.push(...regardFall(draft, reg, holderId, TUNING.dynamic.bypass.regardFall, { witness: false, cause: 'bypass' }));
    resetServed(draft, holderId);
  }
  // the request goes through once, with no block: a pass for exactly this request, always dropped afterwards (the warden may have stopped it first)
  const x = draft.dynamic!;
  (x.oversight ??= { blocked: [] }).pass = { unitId: p.unitId, kind: p.kind };
  try {
    events.push(...runHandler(ACTION_OF[p.kind], draft, { unitId: p.unitId }, ctx));
  } finally {
    delete x.oversight?.pass;
  }
  if (p.route === 'comms') events.push(...runActivity(draft, ctx, { activityId: terminal!.activityId, focus: terminal!.focus, countermandChecked: true, wardenChecked: true }));
  return events;
}
