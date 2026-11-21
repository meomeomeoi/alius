/**
 * What an aftermath asks of the layers around it (P15, plan R15a): the readers the power, domain and intent layers call. A leaf: it imports only
 * types, the dynamic's state reader and the registries, so the ballots, the domain band check and the intent offer can ask without a cycle. Pure; draws nothing.
 */
import type { Registries } from '../../content/types';
import type { CampaignState } from '../state/types';
import { dynamicLive } from './profile';
import { dynamicOf, type DynamicRelation } from './state';
import type { AftermathEffect, AftermathEntry, DynamicDomainEntry } from './types';

/** The stage of her aftermath that is running, or `undefined` (read by `kind`, never by id). */
function runningStage(state: CampaignState, reg: Registries, unitId: string): { stage: AftermathEntry['stages'][number]; startDay: number } | undefined {
  const a = dynamicOf(state, unitId)?.aftermath;
  if (a === undefined) return undefined;
  const row = ([...reg.aftermaths.values()] as unknown as AftermathEntry[]).find((r) => r.kind === a.kind);
  const stage = row?.stages[a.stage];
  return stage === undefined ? undefined : { stage, startDay: (a.stageUntil ?? state.day) - stage.days };
}

const hasEffect = (effects: readonly AftermathEffect[], type: AftermathEffect['type']): boolean => effects.some((e) => e.type === type);

/** Whether the stage she is in sabotages the squad's votes (`vote_sabotage`): she votes against the commander's side and adds her standing to it. */
export function sabotagesVotes(state: CampaignState, reg: Registries, unitId: string): boolean {
  if (!dynamicLive(state, reg)) return false;
  const running = runningStage(state, reg, unitId);
  return running !== undefined && hasEffect(running.stage.effects, 'vote_sabotage');
}

/** Whether the commander's protocol may still slip out in front of others because of her stage (`protocol_slips { days }`): from the day it began, for that many days. */
export function slipsOpen(state: CampaignState, reg: Registries, unitId: string): boolean {
  const running = runningStage(state, reg, unitId);
  const fx = running?.stage.effects.find((e): e is Extract<AftermathEffect, { type: 'protocol_slips' }> => e.type === 'protocol_slips');
  return running !== undefined && fx !== undefined && state.day <= running.startDay + fx.days;
}

/**
 * The one struggle for the command there is, if any: the first unit (squad order) whose aftermath keeps it, and how many votes the commander's side
 * has won. Given the registries it answers `null` while the dynamic is off (the practice categories switched off mid-campaign, review M4).
 */
export function commandStruggleOf(state: Pick<CampaignState, 'squad' | 'relations' | 'dynamic' | 'content'>, reg?: Registries): { unitId: string; wins: number } | null {
  if (reg !== undefined && !dynamicLive(state, reg)) return null;
  for (const u of state.squad) {
    const a = state.relations[u.id]?.dynamic?.aftermath;
    if (a?.kind === 'command_kept') return { unitId: u.id, wins: a.struggleWins ?? 0 };
  }
  return null;
}

/** Whether a domain is the command she keeps through the struggle: the band check does not take it. Read by what it grants. */
export const keptByStruggle = (dyn: DynamicRelation, entry: Pick<DynamicDomainEntry, 'grants'>): boolean =>
  dyn.aftermath?.kind === 'command_kept' && entry.grants.includes('countermand');
