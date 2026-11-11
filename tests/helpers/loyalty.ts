import type { Registries } from '../../src/content/types';
import type { CampaignState, LoyaltyBand } from '../../src/engine/state/types';
import { run } from './world';

// Importing this registers the P6 actions under test (the P0–P5 actions come with ./world).
import '../../src/engine/actions/leash';
import '../../src/engine/actions/loyalty';
import '../../src/engine/actions/dilemma';

export { campaign, ctxOf, errors, loadCore, ofType, run, unitSetup } from './world';

/** Overwrites relation numbers of one unit in place (and returns the state, for chaining). */
export function setRelation(
  state: CampaignState,
  unitId: string,
  p: { trust?: number; affinity?: number; stateId?: string; band?: LoyaltyBand; stateSince?: number },
): CampaignState {
  const r = state.relations[unitId];
  if (!r) throw new Error(`no relation for ${unitId}`);
  if (p.trust !== undefined) r.trust = p.trust;
  if (p.affinity !== undefined) r.affinity = p.affinity;
  if (p.stateId !== undefined) r.stateId = p.stateId;
  if (p.band !== undefined) r.loyaltyBand = p.band;
  if (p.stateSince !== undefined) r.stateSince = p.stateSince;
  return state;
}

/** Replaces the unit's defects with exactly one (in place). */
export function withDefect(state: CampaignState, unitId: string, defectId: string): CampaignState {
  const u = state.squad.find((x) => x.id === unitId);
  if (!u) throw new Error(`no unit ${unitId}`);
  u.defects = [{ id: defectId, arc: 'manage' }];
  return state;
}

/** Plays the rest of the current day, including a Night slot a knock may open: consumes slots until the day number changes. */
export function endDay(state: CampaignState, reg: Registries): CampaignState {
  const start = state.day;
  let s = state;
  for (let i = 0; i < 5 && s.day === start; i++) {
    s = answerDilemma(s, reg);
    const r = run(s, reg, { type: 'calendar/consume_slot' });
    if (r.events.some((e) => e.type === 'error')) throw new Error(JSON.stringify(r.events));
    s = r.state;
  }
  return s;
}

/** Starts a combat with the active roster against `enemies` (default: one level-1 husk) and returns the state with `combat` open. */
export function startFight(
  state: CampaignState, reg: Registries,
  over: { enemies?: Array<{ enemyId: string; level: number; affixes: string[] }>; allowRetry?: boolean } = {},
): CampaignState {
  const ids = state.roster.activeIds;
  const r = run(state, reg, {
    type: 'combat/start',
    payload: {
      encounter: { enemies: over.enemies ?? [{ enemyId: 'husk', level: 1, affixes: [] }], danger: 1 },
      formation: { front: ids.slice(0, 2), back: ids.slice(2) },
      allowRetry: over.allowRetry,
    },
  });
  if (r.events.some((e) => e.type === 'error')) throw new Error(JSON.stringify(r.events));
  return r.state;
}

/** The combatant id of a squad unit in the open combat. */
export function cidOf(state: CampaignState, unitId: string): string {
  const c = state.combat?.combatants.find((x) => x.unitId === unitId);
  if (!c) throw new Error(`${unitId} is not in the combat`);
  return c.cid;
}

/** Answers an open dilemma the way a player in a hurry would: the authored block, its first option that is not greyed. */
export function answerDilemma(state: CampaignState, reg: Registries): CampaignState {
  let s = state;
  const open = s.dilemmas?.open;
  if (!open) return s;
  if (open.status === 'requested') s = run(s, reg, { type: 'dilemma/fallback', payload: { requestId: open.id } }).state;
  const now = s.dilemmas!.open!;
  const index = now.options!.findIndex((o) => !(o.requires && (s.commander.socialStats[o.requires.stat] ?? 0) < o.requires.rank)
    && !o.effects.some((e) => e.type === 'resource' && e.amount < 0 && s.resources[e.resource] < -e.amount));
  return run(s, reg, { type: 'dilemma/choose', payload: { id: now.id, index: Math.max(0, index) } }).state;
}
